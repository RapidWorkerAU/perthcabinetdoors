export const SALES_EMAIL = "sales@perthcabinetdoors.com.au";

export function uniqueRecipients(...emails) {
  return Array.from(
    new Set(
      emails
        .flat()
        .filter(Boolean)
        .map((email) => String(email).trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rows(items) {
  return items
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;line-height:18px;width:150px;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;line-height:20px;font-weight:600;">${escapeHtml(value || "-")}</td>
        </tr>`
    )
    .join("");
}

export function emailShell({ title, intro, children }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4efe7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4efe7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:22px 24px;background:#0d3550;color:#ffffff;">
                <div style="font-size:12px;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Perth Cabinet Doors</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:30px;font-weight:700;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:23px;">${escapeHtml(intro)}</p>
                ${children}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:18px;">
                Perth Cabinet Doors<br />
                <a href="mailto:${SALES_EMAIL}" style="color:#0d3550;text-decoration:none;">${SALES_EMAIL}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function businessEnquiryHtml(payload) {
  return emailShell({
    title: "New website enquiry",
    intro: "A new enquiry has been submitted through the Perth Cabinet Doors website.",
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rows([
          ["Name", payload.customerName],
          ["Email", payload.customerEmail],
          ["Phone", payload.customerPhone],
          ["Postcode", payload.postcode],
          ["Topic", payload.topic],
        ])}
      </table>
      <div style="margin-top:16px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#0f172a;font-size:14px;line-height:22px;white-space:pre-wrap;">${escapeHtml(payload.message)}</div>
    `,
  });
}

export function customerEnquiryHtml(payload) {
  return emailShell({
    title: "We received your enquiry",
    intro: `Hi ${payload.customerName || "there"}, thanks for contacting Perth Cabinet Doors. We have received your enquiry and you should expect a response within 1-3 business days.`,
    children: `
      <div style="padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#334155;font-size:14px;line-height:22px;">
        If you need to add anything in the meantime, reply to this email and it will come through to our team.
      </div>
    `,
  });
}

export function businessQuoteRequestHtml(payload) {
  return emailShell({
    title: "New quote request",
    intro: "A new quote request has been submitted through the Perth Cabinet Doors website.",
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rows([
          ["Source", payload.source],
          ["Product", payload.productName],
          ["Name", payload.customerName],
          ["Email", payload.customerEmail],
          ["Phone", payload.customerPhone],
          ["Suburb", payload.deliverySuburb],
          ["Cabinet brand", payload.cabinetBrand],
          ["Line items", payload.lines?.length || 0],
        ])}
      </table>
      <div style="margin-top:16px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#0f172a;font-size:14px;line-height:22px;white-space:pre-wrap;">${escapeHtml(payload.notes || "No extra notes supplied.")}</div>
    `,
  });
}

export function customerQuoteRequestHtml(payload) {
  return emailShell({
    title: "We received your quote request",
    intro: `Hi ${payload.customerName || "there"}, thanks for sending your quote request to Perth Cabinet Doors. We have received it and you should expect a response within 1-3 business days.`,
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rows([
          ["Product", payload.productName],
          ["Line items", payload.lines?.length || 0],
        ])}
      </table>
    `,
  });
}
