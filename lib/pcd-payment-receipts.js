import { Resend } from "resend";

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

function pdfText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function generateReceiptPdf({ payment, order, quote, receiptNumber }) {
  const lines = [
    "Perth Cabinet Doors",
    "Payment Receipt",
    "",
    `Receipt: ${receiptNumber}`,
    `Date: ${new Date(payment.paid_at || Date.now()).toLocaleDateString("en-AU")}`,
    `Customer: ${order?.customer_name || quote?.customer_name || ""}`,
    `Email: ${order?.customer_email || quote?.customer_email || ""}`,
    `Order: ${order?.order_number || ""}`,
    `Quote: ${quote?.quote_number || ""}`,
    `Payment type: ${payment.payment_type || "payment"}`,
    `Amount inc GST: ${formatMoney(payment.amount, quote?.currency || "AUD")}`,
    `Stripe payment reference: ${payment.stripe_payment_intent_id || payment.stripe_checkout_session_id || ""}`,
    "",
    "Thank you for your payment. Perth Cabinet Doors will be in contact with next steps.",
  ];
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 790 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? "/F2 18 Tf" : index === 1 ? "/F2 14 Tf" : "/F1 11 Tf",
      `(${pdfText(line)}) Tj`,
      "0 -22 Td",
    ]),
    "ET",
  ].join("\n");
  const streamLength = Buffer.byteLength(content);
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
    `6 0 obj << /Length ${streamLength} >> stream\n${content}\nendstream endobj`,
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  const body = objects.map((object) => {
    xref.push(String(offset).padStart(10, "0") + " 00000 n ");
    offset += object.length + 1;
    return object;
  }).join("\n");
  const xrefStart = offset;
  const pdf = `%PDF-1.4\n${body}\nxref\n0 ${objects.length + 1}\n${xref.join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf);
}

export async function sendPaymentReceiptEmail({ payment, order, quote }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return false;
  const to = order?.customer_email || quote?.customer_email;
  if (!to) return false;

  const receiptNumber = payment.receipt_number || `PCD-R-${String(payment.id || "").slice(0, 8).toUpperCase()}`;
  const pdf = generateReceiptPdf({ payment, order, quote, receiptNumber });
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: [to],
    subject: `Receipt ${receiptNumber} - Perth Cabinet Doors`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f0e8;padding:28px 14px;font-family:Arial,sans-serif;color:#18221b;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffaf3;border:1px solid #d8cbb8;">
      <tr><td style="background:#eef7ed;padding:26px 30px;border-bottom:1px solid #d5e4d1;"><div style="color:#2f6b3b;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;font-weight:700;">Perth Cabinet Doors</div><h1 style="margin:8px 0 0;color:#001f36;font-family:Georgia,serif;font-size:28px;font-weight:400;">Payment received</h1></td></tr>
      <tr><td style="padding:26px 30px;"><p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi ${escapeHtml(order?.customer_name || quote?.customer_name || "there")},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Thank you. We have received your payment for ${escapeHtml(order?.order_number || quote?.quote_number || "your order")}.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f7f2ea;border:1px solid #e3d7c6;">
      <tr><td style="padding:12px 14px;color:#7c725f;font-size:12px;font-weight:700;text-transform:uppercase;">Receipt</td><td style="padding:12px 14px;text-align:right;color:#001f36;font-weight:800;">${escapeHtml(receiptNumber)}</td></tr>
      <tr><td style="padding:12px 14px;border-top:1px solid #e3d7c6;color:#7c725f;font-size:12px;font-weight:700;text-transform:uppercase;">Amount</td><td style="padding:12px 14px;border-top:1px solid #e3d7c6;text-align:right;color:#001f36;font-weight:800;">${formatMoney(payment.amount, quote?.currency || "AUD")}</td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#263226;">The PCD team will be in contact within the next 2 business days with next steps.</p></td></tr>
      </table></td></tr></table></body></html>`,
    text: [
      `Hi ${order?.customer_name || quote?.customer_name || "there"},`,
      "",
      `We received your payment of ${formatMoney(payment.amount, quote?.currency || "AUD")}.`,
      `Receipt: ${receiptNumber}`,
      "The PCD team will be in contact within the next 2 business days with next steps.",
    ].join("\n"),
    attachments: [
      {
        filename: `${receiptNumber}.pdf`,
        content: pdf.toString("base64"),
      },
    ],
  });
  return true;
}
