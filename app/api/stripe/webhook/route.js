import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { sendPaymentReceiptEmail } from "../../../../lib/pcd-payment-receipts";
import { fromCents, verifyStripeWebhook } from "../../../../lib/pcd-stripe";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function syncDepositFields(supabase, orderId) {
  const { data: deposits, error } = await supabase
    .from("pcd_order_payments")
    .select("amount,is_paid,paid_at")
    .eq("order_id", orderId)
    .eq("payment_type", "deposit");
  if (error) throw error;
  const rows = deposits || [];
  const depositAmount = rows.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const depositPaid = rows.length > 0 && rows.every((payment) => payment.is_paid);
  const paidAt = depositPaid ? rows.find((payment) => payment.paid_at)?.paid_at || new Date().toISOString().slice(0, 10) : null;
  const updates = {
    deposit_required: rows.length > 0,
    deposit_amount: depositAmount,
    deposit_paid: depositPaid,
    deposit_paid_at: paidAt,
  };
  if (depositPaid) updates.accepted_at = new Date().toISOString();
  await supabase
    .from("pcd_orders")
    .update(updates)
    .eq("id", orderId);
}

async function completeCheckoutSession(session) {
  const supabase = createSupabaseAdminClient();
  const metadata = session.metadata || {};
  const paymentId = metadata.payment_id;
  const orderId = metadata.order_id;
  const quoteId = metadata.quote_id || null;
  if (!paymentId || !orderId) return;

  const paidAt = new Date().toISOString().slice(0, 10);
  const amount = session.amount_total ? fromCents(session.amount_total) : null;
  const receiptNumber = `PCD-R-${String(paymentId).slice(0, 8).toUpperCase()}`;
  const { data: payment, error } = await supabase
    .from("pcd_order_payments")
    .update({
      is_paid: true,
      paid_at: paidAt,
      ...(amount === null ? {} : { amount }),
      request_status: "paid",
      receipt_number: receiptNumber,
      receipt_sent_at: new Date().toISOString(),
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

  const [{ data: order }, { data: quote }] = await Promise.all([
    supabase.from("pcd_orders").select("*").eq("id", orderId).maybeSingle(),
    quoteId ? supabase.from("pcd_quotes").select("*").eq("id", quoteId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  await logOrderActivity(supabase, {
    order_id: orderId,
    quote_id: quoteId,
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

  await sendPaymentReceiptEmail({ payment, order, quote });
}

export async function POST(request) {
  const rawBody = await request.text();
  try {
    const event = verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"));
    if (event.type === "checkout.session.completed") {
      await completeCheckoutSession(event.data.object);
    }
    return Response.json({ received: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Invalid Stripe webhook." }, { status: 400 });
  }
}
