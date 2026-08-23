import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { applyAcceptedVariation } from "../../../../lib/pcd-order-variations";
import { sendPaymentReceivedSalesEmail } from "../../../../lib/pcd-payment-notifications";
import { fromCents, siteUrl, verifyStripeWebhook } from "../../../../lib/pcd-stripe";
import { syncDepositFields } from "../../../../lib/pcd-order-deposit";
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
}

export async function POST(request) {
  const rawBody = await request.text();
  try {
    const event = verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"));
    if (event.type === "checkout.session.completed") {
      await completeCheckoutSession(event.data.object, { baseUrl: siteUrl(request.url) });
    }
    return Response.json({ received: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Invalid Stripe webhook." }, { status: 400 });
  }
}
