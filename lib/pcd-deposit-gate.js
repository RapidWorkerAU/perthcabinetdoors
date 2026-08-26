// THE DEPOSIT GATE.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// On a quote that needs a deposit, the approval and the deposit are ONE
// transaction. Neither counts on its own. Clicking Approve records nothing and
// creates nothing; it opens a payment page and puts the quote in a holding
// state. Only money arriving turns that into an approval and an order.
//
// ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
//
// The approval used to be the commitment and the payment a follow up that might
// never come. A customer who clicked Approve and closed the payment tab left:
//
//   an order      for work nobody had paid for, sitting on the orders page
//                 carrying the full job value
//   a locked link the public page reads an approved quote as finished, so the
//                 customer could not come back and pay. Their only way in was
//                 to ring up, and nothing had told them anything was wrong
//   silence       no email to them, no notification to us, no cleanup
//
// Doing it this way round means nothing ever has to be undone. There is no
// order to delete, no approval to reverse, no status to wind back. That is the
// point: the failure mode of the old design was wreckage, and the failure mode
// of this one is a quote sitting exactly where it was.
//
// ── THE RISK THIS DIRECTION CARRIES, AND WHAT ANSWERS IT ─────────────────────
//
// Paying first moves the danger to the opposite corner: the customer pays and
// we miss it. That is worse than what we had. So finaliseDepositAcceptance is
// reachable three independent ways, and is safe to call as many times as any of
// them like:
//
//   the Stripe webhook      seconds after payment, the normal case
//   the thank you page      as the customer is bounced back, catching a webhook
//                           that is slow or lost while they are still watching
//   the twice daily sweep   catching one that never arrived at all
//
// What makes that safe is the claim: the quote is moved out of the holding
// state with a conditional write, so the database decides which caller wins
// rather than timing. createOrderFromQuote refuses to make a second order for a
// quote as well, so even a claim that somehow passed twice cannot double up.

import { createOrderFromQuote } from "./pcd-order-from-quote";
import { syncDepositFields } from "./pcd-order-deposit";
import { logOrderActivity } from "./pcd-activity-log";
import { approvalEvidence } from "./pcd-approval-evidence";
import { createCheckoutSession, expireCheckoutSession, fromCents } from "./pcd-stripe";
import { depositAmountForQuote } from "./pcd-quote-acceptance";

/** The holding state. Said yes, money not in, nothing created. */
export const AWAITING_DEPOSIT = "awaiting_deposit";

/**
 * Statuses a customer may still act on from the public page.
 *
 * awaiting_deposit is deliberately in here. A held quote is the one case where
 * the customer has already answered and still has something left to do, and
 * locking it is exactly the dead end this whole module exists to remove.
 */
export const CUSTOMER_ACTIONABLE = new Set(["sent", "viewed", AWAITING_DEPOSIT]);

const nowIso = () => new Date().toISOString();

/**
 * The live payment page for this quote, if there is one.
 *
 * A second click must land back on the page they already have rather than mint
 * another. Two live sessions for one deposit is two ways to pay the same money.
 */
export async function openCheckoutForQuote(supabase, quoteId) {
  const { data, error } = await supabase
    .from("pcd_quote_checkouts")
    .select("*")
    .eq("quote_id", quoteId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  const checkout = (data || [])[0];
  if (!checkout) return null;

  // Stripe expires a session after 24 hours. One that is past that is not a
  // page the customer can use, so it is not a reason to withhold a new one.
  if (checkout.expires_at && new Date(checkout.expires_at).getTime() <= Date.now()) return null;
  return checkout;
}

/**
 * Close off every open attempt on a quote.
 *
 * Called when the quote stops being payable at the agreed figure: a rejection,
 * or an admin override pulling it back to draft. The Stripe session is expired
 * as well as the row being marked, because our row means nothing to Stripe and
 * a customer still holding that tab could otherwise pay a price that has since
 * been withdrawn.
 *
 * Never throws. Cancelling a payment page is housekeeping, and it must not be
 * able to fail the rejection or the override it is part of.
 */
export async function cancelOpenCheckouts(supabase, quoteId, { status = "superseded" } = {}) {
  try {
    const { data: open } = await supabase
      .from("pcd_quote_checkouts")
      .select("id, stripe_checkout_session_id")
      .eq("quote_id", quoteId)
      .eq("status", "open");

    for (const checkout of open || []) {
      try {
        await expireCheckoutSession(checkout.stripe_checkout_session_id);
      } catch (error) {
        // Already expired or already paid. Stripe refusing to expire a session
        // is not a reason to leave our row saying it is open.
        console.error(
          `[deposit-gate] could not expire ${checkout.stripe_checkout_session_id}: ${error?.message || error}`
        );
      }
      await supabase.from("pcd_quote_checkouts").update({ status }).eq("id", checkout.id);
    }
    return (open || []).length;
  } catch (error) {
    console.error(`[deposit-gate] could not close open checkouts on quote ${quoteId}: ${error?.message || error}`);
    return 0;
  }
}

/**
 * Hold the quote and give the customer somewhere to pay.
 *
 * Returns { ok, checkoutUrl, amount } or { ok: false, error }.
 *
 * THE QUOTE IS MOVED FIRST AND CONDITIONALLY. Between the caller reading the
 * status and here, an admin override can pull the quote back to draft and
 * rotate its access code. Claiming on the status we actually read means exactly
 * one of the two wins and the database decides which, so we can never open a
 * payment page against a version that is being edited.
 */
export async function startDepositCheckout(supabase, quote, { baseUrl, clientName = "" } = {}) {
  const amount = depositAmountForQuote(quote);
  if (!(amount > 0)) return { ok: false, error: "This quote has no deposit to pay." };

  // Already held from an earlier attempt, so there is no status to claim.
  if (quote.status !== AWAITING_DEPOSIT) {
    const { data: claimed, error: claimError } = await supabase
      .from("pcd_quotes")
      .update({
        status: AWAITING_DEPOSIT,
        // Only stamped the first time, because the reminders are timed from it
        // and a customer coming back for a second go must not reset the clock.
        ...(quote.awaiting_deposit_at ? {} : { awaiting_deposit_at: nowIso() }),
      })
      .eq("id", quote.id)
      .eq("status", quote.status)
      .select("*")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      return {
        ok: false,
        status: 409,
        error:
          "This quote was changed while you had it open, so it could not be accepted. " +
          "Please contact us and we will send you the current version.",
      };
    }
    Object.assign(quote, claimed);
  }

  // Land them back on the page they already have rather than a second one.
  const existing = await openCheckoutForQuote(supabase, quote.id);
  if (existing?.checkout_url) {
    return { ok: true, checkoutUrl: existing.checkout_url, amount: Number(existing.amount) || amount, reused: true };
  }

  const session = await createCheckoutSession({
    amount,
    currency: quote.currency || "AUD",
    customerEmail: quote.customer_email,
    description: `${quote.quote_number} deposit`,
    successUrl: `${baseUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/quotes/view?code=${encodeURIComponent(quote.access_code)}`,
    metadata: {
      // The flow name the webhook switches on. Deliberately NOT the old
      // "quote_deposit": those sessions carry an order_id and a payment_id
      // because their order already existed, and the old handler is still the
      // right one for any of them still in flight.
      flow: "quote_deposit_gate",
      quote_id: quote.id,
      quote_number: quote.quote_number,
    },
  });

  const { error: insertError } = await supabase.from("pcd_quote_checkouts").insert({
    quote_id: quote.id,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    checkout_url: session.url,
    amount,
    currency: quote.currency || "AUD",
    status: "open",
    client_name: String(clientName || "").trim() || null,
    expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  });
  // A session we cannot file is a payment we could not later match to a quote.
  // Expire it rather than send the customer to a page whose money would arrive
  // with nowhere to go.
  if (insertError) {
    try {
      await expireCheckoutSession(session.id);
    } catch {
      /* best effort; the row failing is the thing being reported */
    }
    throw insertError;
  }

  await logOrderActivity(supabase, {
    quote_id: quote.id,
    actor_type: "customer",
    action_type: "quote_deposit_checkout_started",
    title: "Customer approved, deposit not yet paid",
    description: [quote.quote_number, quote.customer_name].filter(Boolean).join(" - "),
    metadata: { quote_number: quote.quote_number, amount, stripe_checkout_session_id: session.id },
    event_key: `quote:${quote.id}:checkout:${session.id}`,
  });

  return { ok: true, checkoutUrl: session.url, amount };
}

/**
 * The money arrived. Turn it into an approval and an order, exactly once.
 *
 * This is the ONLY place a deposit quote becomes an order. Safe to call from
 * the webhook, the thank you page and the sweep, in any order, any number of
 * times, including all at once.
 *
 * Returns { ok, orderId, alreadyDone } or { ok: false, needsAttention, reason }.
 */
export async function finaliseDepositAcceptance(supabase, session, { request = null } = {}) {
  const quoteId = session?.metadata?.quote_id || null;
  if (!quoteId) return { ok: false, reason: "Not a deposit gate session." };

  // Stripe reports a completed session that has not actually been paid for the
  // slower payment methods. Treating that as money in would confirm a job on
  // the strength of an instruction that can still bounce.
  if (session.payment_status !== "paid") {
    return { ok: false, reason: `Session ${session.id} is ${session.payment_status || "unpaid"}.` };
  }

  const { data: checkout } = await supabase
    .from("pcd_quote_checkouts")
    .select("*")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  // Already done. The common case for the second and third caller.
  if (checkout?.status === "paid" && checkout.order_id) {
    return { ok: true, orderId: checkout.order_id, alreadyDone: true };
  }

  const { data: quote, error: quoteError } = await supabase
    .from("pcd_quotes")
    .select("*, pcd_quote_line_items(*)")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError) throw quoteError;
  if (!quote) return { ok: false, reason: `Quote ${quoteId} could not be found.` };

  const now = nowIso();

  // THE CLAIM. One caller wins, decided by the database.
  const { data: claimed, error: claimError } = await supabase
    .from("pcd_quotes")
    .update({ status: "approved", approved_at: now })
    .eq("id", quoteId)
    .eq("status", AWAITING_DEPOSIT)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;

  if (!claimed) {
    // Someone else got there first and the work is done.
    if (quote.status === "approved" && quote.order_id) {
      await supabase
        .from("pcd_quote_checkouts")
        .update({ status: "paid", paid_at: now, order_id: quote.order_id })
        .eq("stripe_checkout_session_id", session.id);
      return { ok: true, orderId: quote.order_id, alreadyDone: true };
    }

    // MONEY AGAINST A QUOTE THAT IS NO LONGER HELD.
    //
    // Nearly impossible, because rejecting and overriding both expire the
    // Stripe session first. What is left is the customer paying in the same
    // second as one of those, and there is no correct automatic answer: the
    // quote may have been pulled back precisely because its price was wrong.
    // So it stops here, loudly, with the money sitting safely in Stripe.
    return await flagForAttention(supabase, { session, quote, reason: `Quote is ${quote.status}.` });
  }

  const orderId = await createOrderFromQuote(supabase, quote, {
    actorType: "customer",
    // The deposit is in, so this is confirmed work from the moment it exists.
    markAcceptedAt: true,
  });

  const amount = session.amount_total ? fromCents(session.amount_total) : Number(checkout?.amount) || 0;
  const paidOn = now.slice(0, 10);

  // The deposit, recorded as paid rather than as owing. Under the old flow this
  // row was created empty at approval and ticked later; here the only reason it
  // exists is that it has been paid.
  const { data: payment, error: paymentError } = await supabase
    .from("pcd_order_payments")
    .insert({
      order_id: orderId,
      payment_type: "deposit",
      amount,
      is_paid: true,
      paid_at: paidOn,
      request_status: "paid",
      sort_order: 0,
      notes: `${Number(quote.deposit_percent || 0).toFixed(2)}% deposit paid to accept ${quote.quote_number}`,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      stripe_payment_status: session.payment_status || "paid",
    })
    .select("*")
    .maybeSingle();
  if (paymentError) throw paymentError;

  // Sets deposit_paid, deposit_paid_at and accepted_at from the payment rows,
  // the same way a deposit ticked by hand does.
  await syncDepositFields(supabase, orderId);

  // WHAT they agreed to, not just that they agreed. Written best effort: an
  // approval must never fail because the evidence column is not there yet.
  const actionRow = {
    quote_id: quote.id,
    action: "approved",
    client_name: checkout?.client_name || quote.customer_name || "Customer",
    note: "Approved and deposit paid.",
  };
  try {
    const evidence = approvalEvidence({
      request,
      lines: quote.pcd_quote_line_items || [],
      totals: quote,
      accessCode: quote.access_code,
    });
    const { error: actionError } = await supabase.from("pcd_quote_actions").insert({ ...actionRow, evidence });
    if (actionError) {
      const { error: retryError } = await supabase.from("pcd_quote_actions").insert(actionRow);
      if (retryError) throw retryError;
      console.error(
        "[deposit-gate] pcd_quote_actions.evidence is missing, so this approval was recorded without any " +
          "record of what the customer actually agreed to. Run supabase/202608221200_pcd_approval_evidence.sql."
      );
    }
  } catch (error) {
    console.error(`[deposit-gate] could not record the approval action on ${quote.quote_number}: ${error?.message}`);
  }

  await supabase
    .from("pcd_quote_checkouts")
    .update({
      status: "paid",
      paid_at: now,
      order_id: orderId,
      stripe_payment_intent_id: session.payment_intent || null,
    })
    .eq("stripe_checkout_session_id", session.id);

  // Any other attempt on this quote is now dead. Nothing to expire at Stripe,
  // since it has one paid session, but the rows must not read as open or the
  // sweep will keep chasing a customer who has paid.
  await supabase
    .from("pcd_quote_checkouts")
    .update({ status: "superseded" })
    .eq("quote_id", quote.id)
    .eq("status", "open");

  return { ok: true, orderId, payment, quote, amount, alreadyDone: false };
}

/**
 * Money we cannot safely act on. Recorded everywhere a person might look.
 *
 * Deliberately not resolved automatically. Both ways of being wrong here cost
 * real money: refunding a customer who wanted the job, or committing to a job
 * at a price that had been withdrawn.
 */
async function flagForAttention(supabase, { session, quote, reason }) {
  const amount = session.amount_total ? fromCents(session.amount_total) : null;
  console.error(
    `[deposit-gate] PAYMENT NEEDS ATTENTION on ${quote.quote_number}: ${reason} ` +
      `Stripe session ${session.id} has taken ${amount === null ? "a payment" : `$${amount}`} ` +
      "and no order has been created. Refund it or reinstate the quote by hand."
  );

  await supabase
    .from("pcd_quote_checkouts")
    .update({ status: "needs_attention" })
    .eq("stripe_checkout_session_id", session.id);

  await logOrderActivity(supabase, {
    quote_id: quote.id,
    actor_type: "system",
    action_type: "quote_deposit_unmatched",
    title: "Deposit paid against a quote that is no longer held",
    description: `${reason} Refund it or reinstate the quote by hand. Nothing has been created.`,
    metadata: {
      quote_number: quote.quote_number,
      quote_status: quote.status,
      amount,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
    },
    event_key: `quote:${quote.id}:unmatched:${session.id}`,
  });

  return { ok: false, needsAttention: true, reason };
}

/**
 * A payment page ran out without being paid.
 *
 * The row is closed off and nothing else changes. The quote stays held, because
 * the customer has not said no; they have simply not finished. Their next click
 * mints a fresh page, which is what stops an expired Stripe link becoming a
 * dead end.
 */
export async function markCheckoutExpired(supabase, sessionId) {
  const { data } = await supabase
    .from("pcd_quote_checkouts")
    .update({ status: "expired" })
    .eq("stripe_checkout_session_id", sessionId)
    .eq("status", "open")
    .select("quote_id")
    .maybeSingle();
  return data?.quote_id || null;
}
