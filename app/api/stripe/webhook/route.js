import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { applyAcceptedVariation } from "../../../../lib/pcd-order-variations";
import { sendPaymentReceivedSalesEmail } from "../../../../lib/pcd-payment-notifications";
import { sendPaymentReceivedToCustomer } from "../../../../lib/pcd-customer-confirmations";
import { fromCents, isSameSessionAgain, paymentHasSettled, siteUrl, verifyStripeWebhook } from "../../../../lib/pcd-stripe";
import { syncDepositFields } from "../../../../lib/pcd-order-deposit";
import { GATE_FLOWS, markCheckoutExpired } from "../../../../lib/pcd-deposit-gate";
import { completeGateSession } from "../../../../lib/pcd-gate-complete";
import { completeSiteMeasureBooking } from "../../../../lib/pcd-site-measure-booking";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function completeCheckoutSession(session, { baseUrl = "" } = {}) {
  const supabase = createSupabaseAdminClient();
  const metadata = session.metadata || {};
  const paymentId = metadata.payment_id;
  const orderId = metadata.order_id;
  const quoteId = metadata.quote_id || null;
  const variationId = metadata.variation_id || null;
  if (!paymentId || !orderId) return;

  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from("pcd_order_payments")
    // Everything, not a named list. Naming settlement_method here would make
    // this whole webhook fail on a database that has not had 202608221800 run,
    // and a webhook that throws is every incoming payment silently not being
    // recorded. No column this reads is worth that.
    .select("*")
    .eq("id", paymentId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (existingPaymentError || !existingPayment) throw existingPaymentError || new Error("Payment not found.");

  // THE SAME SESSION, ARRIVING AGAIN. NOT A SECOND PAYMENT.
  //
  // Two entirely normal things deliver this handler the same session twice, and
  // both were being reported as the customer paying twice and needing a refund:
  //
  //   A payment method that settles later fires checkout.session.completed and
  //   then checkout.session.async_payment_succeeded, for one payment. Klarna,
  //   Zip and Pix are all switched on for this account.
  //
  //   Stripe redelivers any event whose response it did not get, which happens
  //   whenever we are slow.
  //
  // Telling a duplicate from a redelivery needs nothing new: the session id is
  // already written onto the row when the payment is marked paid. It just was
  // not being compared. A refund alarm nobody can trust is worse than no alarm,
  // because the real version of it below is genuinely valuable.
  if (isSameSessionAgain(existingPayment, session)) return;

  // ALREADY PAID, AND MONEY HAS JUST ARRIVED ANYWAY.
  //
  // Returning quietly kept the books right and the customer wrong. It happens
  // when a payment was settled by hand because the link did not work, and then
  // the link was paid too: we have their money twice and nothing anywhere says
  // so, because the row already reads as paid.
  //
  // The row is deliberately NOT updated. It is correct, and a second payment is
  // not a correction to it. What is recorded is that a duplicate arrived, so
  // somebody can refund it.
  if (existingPayment.is_paid) {
    const duplicate = session.amount_total ? fromCents(session.amount_total) : null;
    console.error(
      "[stripe-webhook] DUPLICATE PAYMENT on " + paymentId + ": this was already marked paid" +
        (existingPayment.settlement_method ? " by " + existingPayment.settlement_method : "") +
        " and Stripe has now taken " + (duplicate === null ? "another payment" : duplicate) +
        " through session " + session.id + ". The customer has paid twice and needs a refund."
    );
    await logOrderActivity(supabase, {
      order_id: orderId,
      actor_type: "system",
      action_type: "payment_received_twice",
      title: "Customer paid twice, refund needed",
      description:
        "This payment was already settled" +
        (existingPayment.settlement_method ? " by " + existingPayment.settlement_method : "") +
        " and a further payment has come through the Stripe link. Refund the duplicate.",
      metadata: {
        payment_id: paymentId,
        duplicate_amount: duplicate,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
        already_paid_at: existingPayment.paid_at || null,
        settled_by: existingPayment.settlement_method || null,
      },
      event_key: `payment:${paymentId}:duplicate:${session.id}`,
    });
    return;
  }

  // THE MONEY HAS TO HAVE ARRIVED, NOT JUST BEEN PROMISED.
  //
  // checkout.session.completed used to mark the payment paid whatever
  // session.payment_status said. For a card that is right, the money is already
  // there. For a method that settles later it is a guess, and the guess was
  // never revisited: the failure event is handled for site measures and for the
  // deposit gate and NOT for an ordinary order payment, so a payment that
  // bounced afterwards went on reading as paid, the deposit gate let the job
  // through, and the first anybody knew was the bank reconciliation.
  //
  // Stripe says "paid", "unpaid" or "no_payment_required". Only the first and
  // the last mean we have it. An "unpaid" session is recorded as pending and
  // nothing else moves; async_payment_succeeded comes back later and this runs
  // again, which is the point at which it becomes paid.
  const settled = paymentHasSettled(session);

  if (!settled) {
    // request_status is deliberately left alone. It already says a checkout
    // exists, which is still true, and there is no value in the set that means
    // "on its way": the set is not_requested, requested, sent, checkout_created
    // and paid. Inventing one here would put a word on the payment screens that
    // nothing else knows how to read.
    await supabase
      .from("pcd_order_payments")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
        stripe_payment_status: session.payment_status || "unpaid",
      })
      .eq("id", paymentId)
      .eq("order_id", orderId);
    return;
  }

  const paidAt = new Date().toISOString().slice(0, 10);
  const amount = session.amount_total ? fromCents(session.amount_total) : null;
  const { data: payment, error } = await supabase
    .from("pcd_order_payments")
    .update({
      is_paid: true,
      paid_at: paidAt,
      ...(amount === null ? {} : { amount }),
      request_status: "paid",
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      stripe_payment_status: session.payment_status || "paid",
    })
    .eq("id", paymentId)
    .eq("order_id", orderId)
    .select("*")
    .maybeSingle();
  if (error || !payment) throw error || new Error("Payment not found.");

  await syncDepositFields(supabase, orderId);

  if (metadata.flow === "quote_deposit" && quoteId) {
    const now = new Date().toISOString();
    await supabase
      .from("pcd_quotes")
      .update({ status: "approved", approved_at: now, order_id: orderId })
      .eq("id", quoteId)
      .neq("status", "approved");

    const { data: existingAction } = await supabase
      .from("pcd_quote_actions")
      .select("id")
      .eq("quote_id", quoteId)
      .eq("action", "approved")
      .maybeSingle();
    if (!existingAction?.id) {
      await supabase.from("pcd_quote_actions").insert({
        quote_id: quoteId,
        action: "approved",
        client_name: session.customer_details?.name || session.customer_email || "Customer",
        note: "Approved after successful deposit payment.",
      });
    }
  }

  if (metadata.flow === "variation_deposit_topup" && variationId) {
    await applyAcceptedVariation(supabase, variationId, { actorType: "system" });
  }

  const [{ data: order }, { data: quote }] = await Promise.all([
    supabase.from("pcd_orders").select("*").eq("id", orderId).maybeSingle(),
    quoteId ? supabase.from("pcd_quotes").select("*").eq("id", quoteId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  await logOrderActivity(supabase, {
    order_id: orderId,
    quote_id: quoteId,
    variation_id: variationId,
    actor_type: "customer",
    action_type: "payment_received",
    title: "Payment received",
    description: `${payment.payment_type || "payment"} - $${Number(payment.amount || 0).toFixed(2)}`,
    metadata: {
      payment_id: payment.id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
    },
    event_key: `payment:${payment.id}:received`,
  });

  try {
    await sendPaymentReceivedSalesEmail({
      payment,
      order,
      quote,
      flow: metadata.flow,
      adminOrderUrl: baseUrl && orderId ? `${baseUrl}/admin/orders/${orderId}` : "",
    });
  } catch (emailError) {
    console.error("Could not send payment received notification email.", emailError);
  }

  // AND THE CUSTOMER. sales@ has always been told; the person who just paid us
  // was told nothing at all. It never throws, so a refused email cannot undo a
  // payment that has already arrived.
  await sendPaymentReceivedToCustomer({ payment, order, quote });
}

/**
 * A deposit paid on a quote that has no order yet, or a web order paid in full.
 *
 * Everything happens inside finaliseDepositAcceptance so that the webhook, the
 * thank you page and the sweep cannot disagree, and the emails go with whoever
 * did the work. See lib/pcd-deposit-gate.js and lib/pcd-gate-complete.js.
 */
async function completeDepositGateSession(session, { baseUrl = "", request = null } = {}) {
  await completeGateSession(createSupabaseAdminClient(), session, { baseUrl, request });
}

export async function POST(request) {
  const rawBody = await request.text();
  try {
    const event = verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"));
    const session = event.data?.object || {};
    const baseUrl = siteUrl(request.url);
    // A deposit gate session, or a web order: both become an order here.
    const isDepositGate = GATE_FLOWS.has(session?.metadata?.flow);
    // A site measure booked on the website. It carries neither an order nor a
    // payment row, because neither exists: what it has is a held day that turns
    // into a calendar event the moment the fee clears. Kept apart from both
    // handlers below rather than teaching either to cope with it.
    const isSiteMeasure = session?.metadata?.flow === "site_measure_booking";

    if (event.type === "checkout.session.completed") {
      // The deposit gate sessions carry no order_id or payment_id, because
      // neither exists until this runs. The old handler needs both, so the two
      // are kept apart rather than one being taught to cope with the other.
      if (isSiteMeasure) await completeSiteMeasureBooking(createSupabaseAdminClient(), session, { baseUrl });
      else if (isDepositGate) await completeDepositGateSession(session, { baseUrl, request });
      else await completeCheckoutSession(session, { baseUrl });
    }

    // A PAYMENT METHOD THAT SETTLES LATER.
    //
    // Some methods report the session complete while the money is still on its
    // way, and only later say whether it arrived. Without these two, a customer
    // paying that way was treated as if they never paid at all.
    if (event.type === "checkout.session.async_payment_succeeded") {
      if (isSiteMeasure) await completeSiteMeasureBooking(createSupabaseAdminClient(), session, { baseUrl });
      else if (isDepositGate) await completeDepositGateSession(session, { baseUrl, request });
      else await completeCheckoutSession(session, { baseUrl });
    }

    // THE DAY GOES BACK THE MOMENT THE PAYMENT DIES.
    //
    // Both of these mean nobody is paying for that day, and leaving the hold in
    // place would keep it off the website until its twenty minutes ran out. The
    // update is conditional on still holding, so a payment that failed after
    // somehow succeeding cannot cancel a real booking.
    if (
      isSiteMeasure &&
      (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired")
    ) {
      const supabase = createSupabaseAdminClient();
      await supabase
        .from("pcd_site_measure_bookings")
        .update({ status: "expired", hold_expires_at: null, updated_at: new Date().toISOString() })
        .eq("stripe_checkout_session_id", session.id)
        .eq("status", "holding");
    }

    // A PAYMENT ON AN ORDINARY ORDER THAT DIED ON ITS WAY.
    //
    // This case had no handler at all. The failure event was caught for site
    // measures and for the deposit gate and for nothing else, so a bounced
    // payment on an ordinary order left no trace anywhere.
    //
    // The payment is no longer marked paid before the money lands, so there is
    // nothing to undo. What was missing is that anybody is TOLD. A payment
    // request that quietly stops progressing looks exactly like a customer who
    // has not got round to it yet, and the difference matters: one needs
    // chasing and the other needs a new link.
    if (event.type === "checkout.session.async_payment_failed" && !isDepositGate && !isSiteMeasure) {
      const supabase = createSupabaseAdminClient();
      const paymentId = session?.metadata?.payment_id;
      const orderId = session?.metadata?.order_id;
      if (paymentId && orderId) {
        await supabase
          .from("pcd_order_payments")
          .update({ stripe_payment_status: "failed", stripe_checkout_session_id: session.id })
          .eq("id", paymentId)
          .eq("order_id", orderId)
          // Never touch one that is already settled. A failure arriving after a
          // success is not a reason to unpay somebody.
          .eq("is_paid", false);

        console.error(
          "[stripe-webhook] PAYMENT FAILED on " + paymentId + ": the customer started paying through session " +
            session.id + " and the money did not arrive. They need a new payment link."
        );

        await logOrderActivity(supabase, {
          order_id: orderId,
          actor_type: "system",
          action_type: "payment_failed",
          title: "Payment did not go through",
          description:
            "The customer started paying with a method that settles later and it did not clear. " +
            "Nothing has been received. Send them a fresh payment link.",
          metadata: {
            payment_id: paymentId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent || null,
          },
          event_key: `payment:${paymentId}:failed:${session.id}`,
        });
      }
    }

    if (event.type === "checkout.session.async_payment_failed" && isDepositGate) {
      // It bounced. The quote stays held and the customer can try again, which
      // is exactly where they were before they tried.
      await markCheckoutExpired(createSupabaseAdminClient(), session.id);
    }

    // The 24 hour payment page ran out. Closed off so the sweep is not still
    // watching it, and so the customer's next click mints a fresh one instead
    // of landing on a page Stripe has already killed.
    if (event.type === "checkout.session.expired" && isDepositGate) {
      await markCheckoutExpired(createSupabaseAdminClient(), session.id);
    }

    return Response.json({ received: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Invalid Stripe webhook." }, { status: 400 });
  }
}
