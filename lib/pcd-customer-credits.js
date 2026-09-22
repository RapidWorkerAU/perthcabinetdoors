// MONEY WE ARE HOLDING FOR A CUSTOMER, AND THE ONE PLACE THAT SAYS WHAT IT IS WORTH.
//
// ── THE ARITHMETIC, AND THE MISTAKE IT EXISTS TO STOP ────────────────────────
//
// A credit is money already received, INC GST. It is applied UNDER the quote
// total, never as a negative cost line.
//
// The obvious implementation is a minus row beside Travel and Consumables, and
// it is wrong twice:
//
//   1. Those rows are ex GST. Taking $100 off there removes $100 before GST is
//      added, so the customer keeps $110 of value against a $100 payment. Ten
//      dollars gone on every quote, silently, because the two ways agree
//      exactly when the credit is zero.
//
//   2. lib/pcd-tax-invoice.js checks that an order's line items sum to its
//      subtotal and warns on every invoice when they do not. A negative cost
//      row has no line item behind it, so every invoice for that job fails that
//      check forever.
//
// Applied under the total, the quote total stays the quote total, GST is
// charged on the real value of the work, and the customer sees a smaller number
// to pay. And on the order it is an ordinary paid payment row, which means
// outstandingOnOrder already gets the balance right with no new arithmetic
// anywhere. See lib/pcd-board-money.js.
//
// ── THE CLAIM, AND THE MISTAKE THAT ONE EXISTS TO STOP ───────────────────────
//
// One customer can have three quotes open. A credit visible on all three is
// given away twice the moment two of them become orders. So a credit is held by
// exactly ONE quote, and every move between states is a conditional update on
// the state we read, so two requests racing cannot both win.
//
// Nothing in here trusts a screen. The builder computes what to show; this
// decides what is true.

import { roundMoney } from "./pcd-money";

const ACTIVE_QUOTE_STATES = ["draft", "sent", "viewed", "awaiting_deposit"];

// Rounded the one way money is rounded here. See lib/pcd-money.js.
const money = roundMoney;

function dateWords(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, day] = text.split("-").map(Number);
  // Formatted in UTC off the parts, never through the reader's timezone: a
  // credit paid on the 24th must not read as the 23rd on somebody's screen.
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-AU", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * What a credit is called on the customer's quote.
 *
 * WITH THE DATE THEY PAID IT. Somebody checking a quote against their bank
 * statement needs to find the line, and "Credit applied" does not help them do
 * that. A customer holding two credits gets two lines that can be told apart.
 */
export function creditLabel(credit = {}) {
  const paid = dateWords(credit.paid_on);
  const what =
    credit.reason === "site_measure" ? "Site measure fee"
      : credit.reason === "overpayment" ? "Overpayment"
        : credit.reason === "refund_held" ? "Refund held as credit"
          : credit.reason === "goodwill" ? "Credit"
            : "Credit";
  return paid ? `${what} paid ${paid}` : `${what} already paid`;
}

/** The credits a quote is currently holding, in the order they were paid. */
export function creditsOnQuote(credits = [], quoteId) {
  return (credits || [])
    .filter((c) => c && c.state === "held" && c.held_quote_id === quoteId)
    .sort((a, b) => String(a.paid_on || "").localeCompare(String(b.paid_on || "")));
}

/** Credits this customer holds that nobody has claimed. */
export function claimableCredits(credits = []) {
  return (credits || [])
    .filter((c) => c && c.state === "available")
    .sort((a, b) => String(a.paid_on || "").localeCompare(String(b.paid_on || "")));
}

/**
 * What a set of credits comes to against a total.
 *
 * NEVER MORE THAN THE TOTAL. A credit bigger than the quote would otherwise
 * produce a negative amount payable, which is a refund nobody authorised. The
 * remainder is not lost: the credits themselves are untouched by this, and what
 * could not be used stays held for the order that follows.
 *
 * Applied oldest first, so the money that has been sitting longest moves first.
 */
export function applyCredits(credits = [], totalIncGst = 0) {
  const total = money(totalIncGst);
  let remaining = total;
  const lines = [];

  for (const credit of credits) {
    if (remaining <= 0) break;
    const take = Math.min(money(credit.amount), remaining);
    if (take <= 0) continue;
    lines.push({
      id: credit.id,
      label: creditLabel(credit),
      amount: take,
      full: take >= money(credit.amount),
    });
    remaining = money(remaining - take);
  }

  const applied = money(total - remaining);
  return { lines, applied, payable: money(total - applied) };
}

/**
 * Everything a screen needs to say about credit on one quote.
 *
 * ONE SHAPE FOR ALL FOUR READERS: the quote builder, the public quote page, the
 * quote PDF and the order. Null when there is nothing to say, so a caller
 * renders it or does not and never has to decide what zero means.
 */
export function quoteCreditView(quote = {}, credits = [], { currency = "AUD" } = {}) {
  const held = creditsOnQuote(credits, quote.id);
  if (!held.length) return null;

  const { lines, applied, payable } = applyCredits(held, quote.total_inc_gst);
  if (applied <= 0) return null;

  return {
    lines,
    applied,
    payable,
    currency: quote.currency || currency,
    total: money(quote.total_inc_gst),
  };
}

/**
 * The deposit, once a credit has been taken off it.
 *
 * THE CREDIT COMES OFF THE DEPOSIT, not off the final balance. That is the
 * decision, and it is the one the customer feels: they paid us $100 already, so
 * there is $100 less to pay to start.
 *
 * Never below zero. A credit bigger than the deposit clears it entirely and the
 * rest still comes off the balance, because the credit is recorded against the
 * order in full regardless of which instalment it lands on.
 */
export function depositAfterCredit(depositAmount, appliedCredit) {
  return Math.max(0, money(money(depositAmount) - money(appliedCredit)));
}

/**
 * What the customer is told about their credit, in one sentence.
 *
 * Facts only. It says what was applied and what it did to the deposit, because
 * both are numbers they will look for. It does not thank them for anything.
 */
export function creditSentence(view, { depositBefore = 0, depositAfter = 0 } = {}) {
  if (!view || view.applied <= 0) return "";
  const amount = view.applied.toLocaleString("en-AU", {
    style: "currency", currency: view.currency || "AUD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const before = money(depositBefore);
  const after = money(depositAfter);
  if (before > 0 && after < before) {
    const asMoney = (v) => v.toLocaleString("en-AU", {
      style: "currency", currency: view.currency || "AUD",
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    return `${amount} you have already paid has been applied to this quote. Your deposit to start is ` +
      `${asMoney(after)} rather than ${asMoney(before)}.`;
  }
  return `${amount} you have already paid has been applied to this quote.`;
}

// ── Writes ──────────────────────────────────────────────────────────────────
//
// Every one of these is a conditional update on the state that was read, so a
// credit cannot be claimed twice, spent twice, or released by somebody who was
// looking at a stale screen. The condition is the mechanism; the code around it
// is bookkeeping.

/** A quote is live enough to be holding money. A dead one releases what it has. */
export function quoteStillLive(status) {
  return ACTIVE_QUOTE_STATES.includes(String(status || ""));
}

/**
 * Claim every available credit this customer has for one quote.
 *
 * Called when a quote is saved. Deliberately not a prompt: a question you can
 * dismiss is a credit that gets lost, and the customer who paid it never gets
 * it back with nothing anywhere saying so. It is visible on the totals card
 * from the first save, and taking it off is a deliberate act.
 *
 * Returns the credits now held by the quote.
 */
export async function claimCreditsForQuote(supabase, { quoteId, customerId }) {
  if (!quoteId || !customerId) return [];

  const { data: candidates, error } = await supabase
    .from("pcd_customer_credits")
    .select("*")
    .eq("customer_id", customerId)
    .eq("state", "available")
    .order("paid_on", { ascending: true });
  if (error) throw error;

  const now = new Date().toISOString();
  for (const credit of candidates || []) {
    // Conditional on still being available. Another quote saved in the same
    // second takes it or we do, decided by the database.
    await supabase
      .from("pcd_customer_credits")
      .update({ state: "held", held_quote_id: quoteId, held_at: now, updated_at: now })
      .eq("id", credit.id)
      .eq("state", "available");
  }

  return creditsHeldByQuote(supabase, quoteId);
}

/** What this quote is holding, read back from the database rather than assumed. */
export async function creditsHeldByQuote(supabase, quoteId) {
  if (!quoteId) return [];
  const { data, error } = await supabase
    .from("pcd_customer_credits")
    .select("*")
    .eq("held_quote_id", quoteId)
    .eq("state", "held")
    .order("paid_on", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Let go of everything a quote is holding.
 *
 * Used when a quote is rejected, archived or expired, and when somebody takes a
 * credit off by hand. Releasing needs no reason recorded: it only moves money
 * between our own quotes and it stays the customer's either way. Writing one
 * off is the one that takes money, and that is closeCredit below.
 */
export async function releaseCreditsForQuote(supabase, quoteId) {
  if (!quoteId) return 0;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("pcd_customer_credits")
    .update({ state: "available", held_quote_id: null, held_at: null, updated_at: now })
    .eq("held_quote_id", quoteId)
    .eq("state", "held")
    .select("id");
  if (error) throw error;
  return (data || []).length;
}

/** Release one credit from whatever quote is holding it. */
export async function releaseCredit(supabase, creditId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("pcd_customer_credits")
    .update({ state: "available", held_quote_id: null, held_at: null, updated_at: now })
    .eq("id", creditId)
    .eq("state", "held")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Write the quote's credit figure back onto the quote row.
 *
 * Denormalised on purpose: the public page, the PDF and the order all need the
 * figure, and having each of them read the credits table is three chances to
 * disagree about what a customer was shown. This is the only writer.
 */
export async function syncQuoteCreditTotal(supabase, quoteId) {
  if (!quoteId) return 0;
  const { data: quote } = await supabase
    .from("pcd_quotes")
    .select("id, total_inc_gst")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return 0;

  const held = await creditsHeldByQuote(supabase, quoteId);
  const { applied } = applyCredits(held, quote.total_inc_gst);

  const { error } = await supabase
    .from("pcd_quotes")
    .update({ credit_applied_inc_gst: applied })
    .eq("id", quoteId);
  // A database that has not had the migration run must not fail a quote save
  // over a column that only exists to save a read. The figure is then simply
  // not stored and every reader falls back to computing it.
  if (error && String(error.message || "").includes("credit_applied_inc_gst")) return applied;
  if (error) throw error;
  return applied;
}

/**
 * Turn the credits a quote holds into a paid payment on the order it became.
 *
 * This is the moment a credit stops being ours to move. One payment row per
 * credit, so the order's payments read back as what actually happened rather
 * than as one lump nobody can trace.
 *
 * Safe to run twice: a credit already spent is skipped by the same conditional
 * update that guards everything else here, so a retried acceptance cannot pay
 * the customer twice.
 */
export async function spendCreditsOnOrder(supabase, { quoteId, orderId }) {
  if (!quoteId || !orderId) return { spent: 0, amount: 0 };

  const held = await creditsHeldByQuote(supabase, quoteId);
  if (!held.length) return { spent: 0, amount: 0 };

  const { data: order } = await supabase
    .from("pcd_orders")
    .select("id, total_inc_gst")
    .eq("id", orderId)
    .maybeSingle();

  const { lines } = applyCredits(held, order?.total_inc_gst);
  const byId = new Map(lines.map((line) => [line.id, line]));
  const now = new Date().toISOString();

  let spent = 0;
  let amount = 0;

  for (const credit of held) {
    const line = byId.get(credit.id);
    if (!line || line.amount <= 0) continue;

    // Claim it first. If this writes nothing, somebody else already spent it
    // and no payment row should be created.
    const { data: claimed } = await supabase
      .from("pcd_customer_credits")
      .update({ state: "spent", spent_order_id: orderId, spent_at: now, held_quote_id: null, updated_at: now })
      .eq("id", credit.id)
      .eq("state", "held")
      .eq("held_quote_id", quoteId)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    // IF THE PAYMENT CANNOT BE WRITTEN, THE CREDIT GOES BACK.
    //
    // These are three separate writes and Supabase cannot give them one
    // transaction. The credit is marked spent first, which is right, because it
    // is the write that must not happen twice. But it means that between here
    // and the insert below there is a moment where the credit is spent and
    // nothing credits it against the order.
    //
    // Left alone, a failed insert consumed the customer's money and gave them
    // nothing for it: the ledger says spent, the order has no payment, they are
    // asked for the full amount, and nothing anywhere looks for a credit whose
    // spent_payment_id never got filled in. So the credit is put back by hand
    // and the error is raised, which leaves the customer's money where it was
    // and lets whoever is watching find out.
    let payment;
    try {
      const { data, error: paymentError } = await supabase
        .from("pcd_order_payments")
        .insert({
          order_id: orderId,
          // A deposit, because it is money received before the work. It is what
          // makes the deposit owing smaller on every screen without any of them
          // being taught about credits.
          payment_type: "deposit",
          amount: line.amount,
          is_paid: true,
          paid_at: String(credit.paid_on || now).slice(0, 10),
          notes: line.label,
        })
        .select("id")
        .single();
      if (paymentError) throw paymentError;
      payment = data;
    } catch (error) {
      await supabase
        .from("pcd_customer_credits")
        .update({ state: "held", held_quote_id: quoteId, spent_order_id: null, spent_at: null, updated_at: now })
        .eq("id", credit.id)
        // Only undo the state THIS call set. Anything else has moved on since
        // and is not ours to put back.
        .eq("state", "spent")
        .eq("spent_order_id", orderId);
      console.error(
        `[credits] Could not write the payment for credit ${credit.id} on order ${orderId}; ` +
          "the credit has been put back as held and nothing was taken from the customer.",
        error?.message || error
      );
      throw error;
    }

    await supabase
      .from("pcd_customer_credits")
      .update({ spent_payment_id: payment.id, updated_at: now })
      .eq("id", credit.id);

    spent += 1;
    amount = money(amount + line.amount);
  }

  if (amount > 0) {
    const { error } = await supabase
      .from("pcd_orders")
      .update({ credit_applied_inc_gst: amount })
      .eq("id", orderId);
    if (error && !String(error.message || "").includes("credit_applied_inc_gst")) throw error;
  }

  return { spent, amount };
}

/**
 * Write a credit off, or record that it was refunded.
 *
 * The only operations here that take money off a customer, so they are the only
 * ones that demand a reason. A release does not, because the money stays theirs.
 */
export async function closeCredit(supabase, creditId, { outcome = "written_off", reason, actor, refundId = null }) {
  const why = String(reason || "").trim();
  if (!why) {
    const error = new Error("Say why. Taking a credit off a customer is recorded.");
    error.status = 400;
    throw error;
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("pcd_customer_credits")
    .update({
      state: outcome === "refunded" ? "refunded" : "written_off",
      held_quote_id: null,
      held_at: null,
      closed_at: now,
      closed_reason: why,
      closed_by: actor || null,
      stripe_refund_id: refundId,
      updated_at: now,
    })
    .eq("id", creditId)
    .in("state", ["available", "held"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const conflict = new Error("That credit has already been spent or closed.");
    conflict.status = 409;
    throw conflict;
  }
  return data;
}

/** Create a credit. Idempotent per booking, guarded by a unique index. */
export async function createCredit(supabase, { customerId, amount, reason = "site_measure", paidOn, bookingId = null, notes = null, currency = "AUD" }) {
  const value = money(amount);
  if (!customerId || value <= 0) return null;

  const { data, error } = await supabase
    .from("pcd_customer_credits")
    .insert({
      customer_id: customerId,
      amount: value,
      currency,
      reason,
      paid_on: String(paidOn || new Date().toISOString()).slice(0, 10),
      site_measure_booking_id: bookingId,
      notes,
    })
    .select("*")
    .single();

  // 23505 is the one booking, one credit index doing its job. A webhook
  // delivered twice must not mint a second hundred dollars.
  if (error?.code === "23505" && bookingId) {
    const { data: existing } = await supabase
      .from("pcd_customer_credits")
      .select("*")
      .eq("site_measure_booking_id", bookingId)
      .maybeSingle();
    return existing || null;
  }
  if (error) throw error;
  return data;
}

/**
 * Claim and total in one call, for anywhere a quote is saved.
 *
 * THE ONE ENTRY POINT FOR A SAVE. Claiming without syncing leaves the quote row
 * saying a different number than the credits table, and the quote row is what
 * the public page, the PDF and the order all read. Doing both here means a
 * caller cannot do half of it.
 *
 * Never throws. A quote save must not fail because a credit could not be
 * claimed: the quote is the thing the customer is waiting for, and a credit
 * that did not attach is visible on the totals card as unapplied.
 */
export async function refreshQuoteCredits(supabase, quoteId, customerId) {
  try {
    if (customerId) await claimCreditsForQuote(supabase, { quoteId, customerId });
    return await syncQuoteCreditTotal(supabase, quoteId);
  } catch (error) {
    console.error("[credits] could not attach credits to this quote:", error?.message || error);
    return 0;
  }
}
