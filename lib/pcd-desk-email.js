// The email a customer receives when you reply from the desk.
//
// ONE DEFINITION. The settings preview and the real send both build from here,
// so what you approve on screen is what lands in somebody's inbox. A preview
// that is a lookalike is worse than no preview: it tells you the thing is right
// when nobody has checked.
//
// TABLES AND INLINE STYLES, deliberately. Outlook renders with Word, which
// ignores most of a stylesheet and has no useful support for modern layout. The
// markup below looks dated because email clients are.
//
// ARIAL ONLY. Email clients do not reliably load webfonts, so a template built
// on one silently falls back and stops looking like what was approved.
//
// NO LINKS TO A QUOTE OR ORDER. An approved order with variations against it
// would send somebody to figures that are no longer what they are getting. The
// reference is a reminder of which job this is, not a way back into it.

const CREAM = "#f4f0e8";
const CARD = "#ffffff";
const INK = "#1f1e1b";
const INK_2 = "#57534b";
const INK_3 = "#8b8a81";
const PANEL = "#f7f6f1";

export function escapeEmailHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function siteOrigin() {
  return String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.perthcabinetdoors.com").replace(/\/+$/, "");
}

function money(value) {
  const number = Number(value) || 0;
  return `$${number.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The reference block: which job this conversation is about.
 *
 * An order wins over a quote when there is one, because the order is the live
 * thing. Returns null when the customer has neither, and the block is then left
 * out entirely rather than printed empty.
 */
export function referenceFor({ quote, order }) {
  if (order?.order_number) {
    return {
      kind: "Order",
      reference: order.order_number,
      dateLabel: "Placed",
      date: dateLabel(order.created_at),
      amount: money(order.total_inc_gst),
    };
  }
  if (quote?.quote_number) {
    return {
      kind: "Quote",
      reference: quote.quote_number,
      dateLabel: "Sent",
      date: dateLabel(quote.created_at),
      amount: money(quote.total_inc_gst),
    };
  }
  return null;
}

function referenceRows(reference) {
  if (!reference) return "";
  const row = (label, value) => `
              <tr>
                <td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${INK_2};">${escapeEmailHtml(label)}</td>
                <td align="right" style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${INK};">${escapeEmailHtml(value)}</td>
              </tr>`;

  return `
          <tr><td style="padding-top:24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${PANEL};border-radius:9px;">
              <tr><td style="padding:14px 16px;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1.1px;text-transform:uppercase;color:${INK_3};padding-bottom:8px;">This conversation relates to</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  ${row(reference.kind, reference.reference)}
                  ${row(reference.dateLabel, reference.date)}
                  ${row("Total inc GST", reference.amount)}
                </table>
              </td></tr>
            </table>
          </td></tr>`;
}

/**
 * The whole email.
 *
 * `bodyHtml` and `signatureHtml` are already the small sanitised subset of HTML
 * the editor produces; nothing here escapes them again or they would print
 * their own tags.
 */
export function deskReplyEmailHtml({ bodyHtml, signatureHtml = "", reference = null }) {
  const origin = siteOrigin();
  const signature = String(signatureHtml || "").trim();

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:${CREAM};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${CREAM};">
      <tr><td align="center" style="padding:26px 14px 30px;">

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:560px;background:${CARD};border-radius:12px;">
          <tr><td style="padding:28px 30px 30px;">

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr><td style="padding-bottom:18px;">
                <img src="${origin}/images/horizontal-pcd-logo.png" width="176" alt="Perth Cabinet Doors"
                     style="display:block;border:0;outline:none;text-decoration:none;width:176px;max-width:176px;height:auto;">
              </td></tr>

              <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.62;color:${INK};">
                ${bodyHtml}
              </td></tr>

              ${signature
                ? `<tr><td style="padding-top:22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${INK};">${signature}</td></tr>`
                : ""}

              ${referenceRows(reference)}
            </table>

          </td></tr>
        </table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:560px;">
          <tr><td align="center" style="padding-top:14px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:${INK_3};">
            Perth Cabinet Doors &middot; ${escapeEmailHtml(process.env.RESEND_FROM_EMAIL || "")}
          </td></tr>
        </table>

      </td></tr>
    </table>
  </body>
</html>`;
}

/** The plain text alternative, for clients that will not show HTML. */
export function deskReplyEmailText({ bodyText, signatureText = "", reference = null }) {
  const parts = [String(bodyText || "").trim()];
  if (signatureText.trim()) parts.push("", signatureText.trim());
  if (reference) {
    parts.push(
      "",
      "----",
      `${reference.kind}: ${reference.reference}`,
      `${reference.dateLabel}: ${reference.date}`,
      `Total inc GST: ${reference.amount}`
    );
  }
  parts.push("", "Perth Cabinet Doors", process.env.RESEND_FROM_EMAIL || "");
  return parts.join("\n");
}
