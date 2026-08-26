import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../../lib/pcd-activity-log";
import { agentForUser, recordOutboundEmail } from "../../../../../../../../lib/pcd-desk-outbound";
import { hasPaymentRequest } from "../../../../../../../../lib/pcd-payment-requests";
import { createCheckoutSession, siteUrl } from "../../../../../../../../lib/pcd-stripe";
import { paymentTypeLabel } from "../../../../../../../../lib/pcd-payment-notifications";
import { quoteButton, quoteFacts, quoteParagraphs, quoteShell } from "../../../../../../../../lib/pcd-email-templates";

async function idsFromParams(params) {
  const resolved = await params;
  return { orderId: resolved?.id, paymentId: resolved?.paymentId };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(value || 0));
}

async function assertPaymentWithinOrderTotal(supabase, orderId, paymentId, amount) {
  const [{ data: order }, { data: payments }] = await Promise.all([
    supabase.from("pcd_orders").select("total_inc_gst").eq("id", orderId).maybeSingle(),
    supabase.from("pcd_order_payments").select("id,amount").eq("order_id", orderId),
  ]);
  const total = Number(order?.total_inc_gst || 0);
  const otherTotal = (payments || [])
    .filter((payment) => payment.id !== paymentId)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  if (otherTotal + Number(amount || 0) > total + 0.001) {
    throw new Error(`This request would exceed the order total. Remaining available amount is ${formatMoney(Math.max(total - otherTotal, 0))}.`);
  }
}

function defaultEmailMessage(order) {
  return [
    `Hi ${order.customer_name || "there"},`,
    "",
    `A payment is requested for ${order.order_number || "your PCD order"}.`,
    "",
    "Please use the button below to complete your payment.",
    "",
    "Regards,",
    "Perth Cabinet Doors",
  ].join("\n");
}

// ON THE SHARED QUOTE SHELL. It used to carry its own copy of the cream
// layout, which is how four near identical versions of one email came to
// exist and quietly drift apart from each other.
function paymentRequestHtml({ order, payment, checkoutUrl, message }) {
  return quoteShell({
    title: "Payment request",
    footerNote: `This email was sent about order ${order.order_number || "with us"}.`,
    children: [
      quoteParagraphs(message || defaultEmailMessage(order)),
      quoteFacts([
        ["Payment type", paymentTypeLabel(payment.payment_type)],
        ["Amount", formatMoney(payment.amount)],
      ], { emphasiseLast: true }),
      quoteButton(checkoutUrl, "Make payment"),
      // The raw link under the button, for a client that strips it.
      `<p style="margin:0;color:#7c725f;font-size:13px;line-height:1.5;word-break:break-all;">${escapeHtml(checkoutUrl)}</p>`,
    ].join(""),
  });
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  let message = "";
  let subject = "";
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      message = String(body?.message || "").trim();
      subject = String(body?.subject || "").trim();
    }
  } catch { /* ignore parse errors */ }

  try {
    const { orderId, paymentId } = await idsFromParams(params);
    const { data: payment, error: paymentError } = await context.supabase
      .from("pcd_order_payments")
      .select("*, pcd_orders(*)")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (paymentError || !payment) throw paymentError || new Error("Payment line not found.");
    if (payment.is_paid) throw new Error("This payment line is already paid.");
    if (Number(payment.amount || 0) <= 0) throw new Error("Payment amount must be greater than zero.");

    const order = payment.pcd_orders;
    if (!order?.customer_email) throw new Error("The order needs a customer email before requesting payment.");
    await assertPaymentWithinOrderTotal(context.supabase, orderId, paymentId, payment.amount);
    const isRefresh = hasPaymentRequest(payment);

    const baseUrl = siteUrl(request.url);
    const session = await createCheckoutSession({
      amount: payment.amount,
      currency: "AUD",
      customerEmail: order.customer_email,
      description: `${order.order_number || "PCD order"} ${paymentTypeLabel(payment.payment_type)}`,
      successUrl: `${baseUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/admin/orders/${orderId}`,
      metadata: {
        flow: "order_payment_request",
        order_id: orderId,
        quote_id: order.quote_id || "",
        payment_id: paymentId,
        order_number: order.order_number || "",
      },
    });

    const now = new Date().toISOString();
    const { data: updatedPayment, error: updateError } = await context.supabase
      .from("pcd_order_payments")
      .update({
        request_status: "requested",
        requested_at: now,
        request_url: session.url,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
      })
      .eq("id", paymentId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const fullMessage = message || defaultEmailMessage(order);
    const emailSubject = subject || `Payment request - ${order.order_number || "Perth Cabinet Doors"}`;

    let emailSent = false;
    if (!isRefresh && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const html = paymentRequestHtml({ order, payment: updatedPayment, checkoutUrl: session.url, message: fullMessage });
      const text = `${fullMessage}\n\nPay here: ${session.url}`;
      const sent = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: [order.customer_email],
        subject: emailSubject,
        html,
        text,
      });
      emailSent = true;

      // Filed on the customer's conversation, or the board goes on saying they
      // are waiting on us. See lib/pcd-desk-outbound.js.
      await recordOutboundEmail(context.supabase, {
        customerId: order.customer_id || null,
        toEmail: order.customer_email,
        subject: emailSubject,
        bodyHtml: html,
        bodyText: text,
        providerMessageId: sent?.data?.id || null,
        agentId: (await agentForUser(context.supabase, context.user?.email))?.id || null,
        newTicketSubject: emailSubject,
      });
    }

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      quote_id: order.quote_id || null,
      actor_type: "admin",
      action_type: isRefresh ? "payment_request_refreshed" : "payment_requested",
      title: isRefresh ? "Payment request link refreshed" : "Payment requested",
      description: `${paymentTypeLabel(updatedPayment.payment_type)} - ${formatMoney(updatedPayment.amount)}`,
      metadata: { payment_id: paymentId, stripe_checkout_session_id: session.id, emailSent },
    });

    return Response.json({ ok: true, payment: updatedPayment, checkoutUrl: session.url, emailSent, refreshed: isRefresh });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not request payment." }, { status: 500 });
  }
}
