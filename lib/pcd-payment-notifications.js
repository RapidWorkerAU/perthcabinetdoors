import { Resend } from "resend";
import { SALES_EMAIL } from "./pcd-email-templates";

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

export function paymentTypeLabel(paymentType, flow) {
  if (flow === "quote_deposit") return "Quote Deposit Payment";
  const labels = {
    deposit: "Deposit Payment",
    progress: "Progress Payment",
    final: "Final Payment",
    other: "Payment",
  };
  return labels[paymentType] || "Payment";
}

function nextStepsForPayment({ payment, flow }) {
  if (flow === "quote_deposit" || payment?.payment_type === "deposit") {
    return "Open the order in PCD Admin, review the accepted quote, and start planning the order.";
  }
  if (payment?.payment_type === "progress") {
    return "Open the order in PCD Admin and continue any order items that are not complete.";
  }
  if (payment?.payment_type === "final") {
    return "Open the order in PCD Admin, confirm all work and payment reconciliation is complete, then close the order.";
  }
  return "Open the order in PCD Admin, review the payment, and confirm the next operational step.";
}

export function paymentNotificationHtml({ payment, order, quote, flow, adminOrderUrl }) {
  const label = paymentTypeLabel(payment?.payment_type, flow);
  const nextSteps = nextStepsForPayment({ payment, flow });
  return `<!doctype html><html><body style="margin:0;background:#f4f0e8;padding:28px 14px;font-family:Arial,sans-serif;color:#18221b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fffaf3;border:1px solid #d8cbb8;">
    <tr><td style="background:#eef7ed;padding:26px 30px;border-bottom:1px solid #d5e4d1;">
      <div style="color:#2f6b3b;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;font-weight:700;">Perth Cabinet Doors</div>
      <h1 style="margin:8px 0 0;color:#001f36;font-family:Georgia,serif;font-size:28px;font-weight:400;">Payment received</h1>
    </td></tr>
    <tr><td style="padding:26px 30px;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">A ${escapeHtml(label.toLowerCase())} has been received.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f7f2ea;border:1px solid #e3d7c6;">
        <tr><td style="padding:12px 14px;color:#7c725f;font-size:12px;font-weight:700;text-transform:uppercase;">Order</td><td style="padding:12px 14px;text-align:right;color:#001f36;font-weight:800;">${escapeHtml(order?.order_number || "-")}</td></tr>
        <tr><td style="padding:12px 14px;border-top:1px solid #e3d7c6;color:#7c725f;font-size:12px;font-weight:700;text-transform:uppercase;">Quote</td><td style="padding:12px 14px;border-top:1px solid #e3d7c6;text-align:right;color:#001f36;font-weight:800;">${escapeHtml(quote?.quote_number || order?.quote_number || "-")}</td></tr>
        <tr><td style="padding:12px 14px;border-top:1px solid #e3d7c6;color:#7c725f;font-size:12px;font-weight:700;text-transform:uppercase;">Customer</td><td style="padding:12px 14px;border-top:1px solid #e3d7c6;text-align:right;color:#001f36;font-weight:800;">${escapeHtml(order?.customer_name || quote?.customer_name || "-")}</td></tr>
        <tr><td style="padding:12px 14px;border-top:1px solid #e3d7c6;color:#7c725f;font-size:12px;font-weight:700;text-transform:uppercase;">Payment type</td><td style="padding:12px 14px;border-top:1px solid #e3d7c6;text-align:right;color:#001f36;font-weight:800;">${escapeHtml(label)}</td></tr>
        <tr><td style="padding:12px 14px;border-top:1px solid #e3d7c6;color:#7c725f;font-size:12px;font-weight:700;text-transform:uppercase;">Amount</td><td style="padding:12px 14px;border-top:1px solid #e3d7c6;text-align:right;color:#001f36;font-weight:800;">${formatMoney(payment?.amount, quote?.currency || "AUD")}</td></tr>
      </table>
      <h2 style="margin:22px 0 8px;color:#001f36;font-size:18px;">Next steps</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">${escapeHtml(nextSteps)}</p>
      ${adminOrderUrl ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(adminOrderUrl)}" style="display:inline-block;background:#17321f;color:#ffffff;text-decoration:none;padding:14px 20px;font-size:14px;font-weight:700;">Open order in PCD Admin</a></p>` : ""}
    </td></tr>
    </table></td></tr></table></body></html>`;
}

export async function sendPaymentReceivedSalesEmail({ payment, order, quote, flow, adminOrderUrl }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const label = paymentTypeLabel(payment?.payment_type, flow);
  const subjectRef = order?.order_number || quote?.quote_number || "PCD order";
  const nextSteps = nextStepsForPayment({ payment, flow });

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: [SALES_EMAIL],
    subject: `${label} received - ${subjectRef}`,
    html: paymentNotificationHtml({ payment, order, quote, flow, adminOrderUrl }),
    text: [
      `${label} received`,
      "",
      `Order: ${order?.order_number || "-"}`,
      `Quote: ${quote?.quote_number || order?.quote_number || "-"}`,
      `Customer: ${order?.customer_name || quote?.customer_name || "-"}`,
      `Amount: ${formatMoney(payment?.amount, quote?.currency || "AUD")}`,
      "",
      `Next steps: ${nextSteps}`,
      adminOrderUrl ? `Open order: ${adminOrderUrl}` : "",
    ].filter(Boolean).join("\n"),
  });

  return true;
}
