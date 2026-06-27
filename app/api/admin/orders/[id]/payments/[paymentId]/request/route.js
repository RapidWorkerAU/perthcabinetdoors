import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../../lib/pcd-activity-log";
import { createCheckoutSession, siteUrl } from "../../../../../../../../lib/pcd-stripe";

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

function paymentRequestHtml({ order, payment, checkoutUrl, message }) {
  const fullMessage = message || defaultEmailMessage(order);
  const bodyHtml = String(fullMessage)
    .split("\n")
    .map((line) =>
      line.trim() === ""
        ? `<p style="margin:0 0 6px;">&nbsp;</p>`
        : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${escapeHtml(line)}</p>`
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f4f0e8;padding:28px 14px;font-family:Arial,sans-serif;color:#18221b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffaf3;border:1px solid #d8cbb8;">
    <tr><td style="background:#eef7ed;padding:26px 30px;border-bottom:1px solid #d5e4d1;"><div style="color:#2f6b3b;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;font-weight:700;">Perth Cabinet Doors</div><h1 style="margin:8px 0 0;color:#001f36;font-family:Arial,sans-serif;font-size:28px;font-weight:400;">Payment request</h1></td></tr>
    <tr><td style="padding:26px 30px;">
    ${bodyHtml}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f7f2ea;border:1px solid #e3d7c6;margin-bottom:20px;">
    <tr><td style="padding:12px 14px;color:#7c725f;font-size:12px;font-weight:700;text-transform:uppercase;">Payment type</td><td style="padding:12px 14px;text-align:right;color:#001f36;font-weight:800;">${escapeHtml(payment.payment_type || "payment")}</td></tr>
    <tr><td style="padding:12px 14px;border-top:1px solid #e3d7c6;color:#7c725f;font-size:12px;font-weight:700;text-transform:uppercase;">Amount</td><td style="padding:12px 14px;border-top:1px solid #e3d7c6;text-align:right;color:#001f36;font-weight:800;">${formatMoney(payment.amount)}</td></tr>
    </table>
    <p style="margin:0 0 18px;"><a href="${escapeHtml(checkoutUrl)}" style="display:inline-block;background:#17321f;color:#ffffff;text-decoration:none;padding:14px 20px;font-size:14px;font-weight:700;">Make payment</a></p>
    <p style="margin:0;color:#7c725f;font-size:13px;line-height:1.5;word-break:break-all;">${escapeHtml(checkoutUrl)}</p></td></tr>
    </table></td></tr></table></body></html>`;
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

    const baseUrl = siteUrl(request.url);
    const session = await createCheckoutSession({
      amount: payment.amount,
      currency: "AUD",
      customerEmail: order.customer_email,
      description: `${order.order_number || "PCD order"} ${payment.payment_type || "payment"}`,
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
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: [order.customer_email],
        subject: emailSubject,
        html: paymentRequestHtml({ order, payment: updatedPayment, checkoutUrl: session.url, message: fullMessage }),
        text: `${fullMessage}\n\nPay here: ${session.url}`,
      });
      emailSent = true;
    }

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      quote_id: order.quote_id || null,
      actor_type: "admin",
      action_type: "payment_requested",
      title: "Payment requested",
      description: `${updatedPayment.payment_type || "payment"} - ${formatMoney(updatedPayment.amount)}`,
      metadata: { payment_id: paymentId, stripe_checkout_session_id: session.id, emailSent },
    });

    return Response.json({ ok: true, payment: updatedPayment, checkoutUrl: session.url, emailSent });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not request payment." }, { status: 500 });
  }
}
