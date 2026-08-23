// The email a customer receives when you reply from the desk.
//
// ONE DEFINITION. The settings preview and the real send both build from here,
// so what you approve on screen is what lands in somebody's inbox. A preview
// that is a lookalike is worse than no preview: it tells you the thing is right
// when nobody has checked.
//
// THE SAME SHELL AS THE WEBSITE EMAILS. This used to have a frame of its own,
// so the email we send most often was the one a customer had never seen the
// shape of before. It now sits in emailShell, the wrapper the enquiry and
// quote request confirmations use: the one they have already had from us, and
// the one already proven against Outlook and on a phone. Two frames meant two
// things to keep working in a client that renders with Word.
//
// NO LINKS TO A QUOTE OR ORDER. An approved order with variations against it
// would send somebody to figures that are no longer what they are getting. The
// reference is a reminder of which job this is, not a way back into it.

import { emailShell } from "./pcd-email-templates";


export function escapeEmailHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/**
 * Which job this conversation is about.
 *
 * A reminder, not a way back in: no link to the quote or the order. An approved
 * order with variations against it would send somebody to figures that are no
 * longer what they are getting.
 */
function referenceRows(reference) {
  if (!reference) return "";
  const row = (label, value) => `
                <tr>
                  <td style="padding:3px 0;font-size:13px;line-height:19px;color:#64748b;">${escapeEmailHtml(label)}</td>
                  <td align="right" style="padding:3px 0;font-size:13px;line-height:19px;font-weight:bold;color:#0f172a;">${escapeEmailHtml(value)}</td>
                </tr>`;

  return `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        <tr><td style="padding:14px 16px;">
          <div style="font-size:11px;line-height:15px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#64748b;padding-bottom:8px;">This conversation relates to</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            ${row(reference.kind, reference.reference)}
            ${row(reference.dateLabel, reference.date)}
            ${row("Total inc GST", reference.amount)}
          </table>
        </td></tr>
      </table>`;
}

/**
 * The whole email.
 *
 * ── WHY THIS LOOKS LIKE THE OTHERS ───────────────────────────────────────────
 *
 * It is the same shell as the website enquiry and quote request confirmations,
 * because those two are the emails a customer has already had from us. A reply
 * that arrives in a different wrapper reads as a different sender, and the one
 * we send most is the one that should be most familiar.
 *
 * The shell also survives Outlook, which renders with Word and throws away most
 * of a stylesheet, and it holds together on a phone. Reusing it means those two
 * only have to be got right once.
 *
 * ── WHY WE SAY WHERE IT CAME FROM ────────────────────────────────────────────
 *
 * This is sent by our system rather than typed in somebody's mail app, so it
 * does not carry the personal signature and threading a customer may be used to.
 * A quiet line saying so, and saying that a plain reply reaches us, costs
 * nothing and stops it reading as a machine that cannot be answered.
 *
 * `bodyHtml` and `signatureHtml` are already the small sanitised subset of HTML
 * the editor produces; nothing here escapes them again or they would print
 * their own tags.
 */
export function deskReplyEmailHtml({ bodyHtml, signatureHtml = "", reference = null, subject = "" }) {
  const signature = String(signatureHtml || "").trim();

  return emailShell({
    // The subject, so the header names the conversation rather than repeating
    // the company name that is already above it.
    title: String(subject || "").trim() || "A message from Perth Cabinet Doors",
    children: `
      <div style="color:#0f172a;font-size:15px;line-height:23px;">${bodyHtml}</div>
      ${signature ? `<div style="margin-top:22px;color:#334155;font-size:14px;line-height:21px;">${signature}</div>` : ""}
      ${referenceRows(reference)}
      ${systemNote()}
    `,
  });
}

/**
 * The line explaining why this email looks like this.
 *
 * Deliberately quiet: smaller and greyer than the message, at the bottom, below
 * the reference. It is an answer to a question somebody might have, not
 * something to read before the message they were actually sent.
 */
function systemNote() {
  return `
      <div style="margin-top:20px;padding-top:14px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:18px;">
        Sent from the Perth Cabinet Doors order system, which is why it does not look like our usual emails.
        You can reply to this message as normal and it comes straight back to our team.
      </div>`;
}

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
  parts.push(
    "",
    "Sent from the Perth Cabinet Doors order system, which is why it does not look like our usual emails.",
    "You can reply to this message as normal and it comes straight back to our team.",
    "",
    "Perth Cabinet Doors",
    process.env.RESEND_FROM_EMAIL || ""
  );
  return parts.join("\n");
}
