// THE EMAIL THAT SENDS A TAX INVOICE.
//
// Short on purpose. The invoice is the document; this is the covering note that
// carries it. Somebody who has just paid for a kitchen does not want three
// paragraphs, they want to know what the attachment is and that they are done.
//
// Editable before it goes, like every other email we send from an order, because
// the person sending it knows the customer and we do not.

import { emailShell, SALES_EMAIL } from "./pcd-email-templates";

/** What lands in their inbox subject line. */
export function taxInvoiceSubject(invoice) {
  return `Tax invoice ${invoice.number} from Perth Cabinet Doors`;
}

/**
 * The default note.
 *
 * Says what it is, that it is paid, and what to do with it. Nothing about
 * payment: the job is settled, so an instruction to pay would be an instruction
 * to do something already done.
 */
export function defaultTaxInvoiceMessage({ invoice, fromName = "" } = {}) {
  const first = String(invoice?.customer?.name || "").trim().split(/\s+/)[0];
  return [
    first ? `Hi ${first},` : "Hi,",
    "",
    `Your tax invoice for ${invoice.number} is attached. It has been paid in full, so there is nothing further to do.`,
    "",
    "Please keep it for your records. If you need anything changed on it, or a copy sent somewhere else, just reply to this email.",
    "",
    "Thanks for your business.",
    "",
    String(fromName || "").trim() ? `${String(fromName).trim()}\nPerth Cabinet Doors` : "Perth Cabinet Doors",
  ].join("\n");
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (value, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(Number(value) || 0);

/**
 * The edited note as a branded email, with a small summary of what is attached.
 *
 * Paragraphs only. Whoever is sending this is writing an email, not authoring
 * HTML, so anything cleverer is a way for a stray character to reach a customer
 * as markup.
 */
export function taxInvoiceHtml({ invoice, message = "", fileName = "" } = {}) {
  const paragraphs = String(message)
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:23px;">${escapeHtml(block).replace(
          /\r?\n/g,
          "<br />"
        )}</p>`
    )
    .join("\n");

  const summary =
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" ` +
    `style="margin:20px 0 0;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">` +
    `<tr><td style="padding:14px 16px;">` +
    `<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;font-weight:700;">Attached</div>` +
    `<div style="margin-top:6px;font-size:15px;color:#0f172a;font-weight:600;">${escapeHtml(fileName || "Tax invoice")}</div>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:10px;">` +
    `<tr><td style="padding:2px 18px 2px 0;color:#64748b;font-size:13px;">Invoice</td>` +
    `<td style="padding:2px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(invoice.number)}</td></tr>` +
    `<tr><td style="padding:2px 18px 2px 0;color:#64748b;font-size:13px;">Total inc GST</td>` +
    `<td style="padding:2px 0;color:#0f172a;font-size:13px;font-weight:600;">${money(invoice.total, invoice.currency)}</td></tr>` +
    `<tr><td style="padding:2px 18px 2px 0;color:#64748b;font-size:13px;">Amount due</td>` +
    `<td style="padding:2px 0;color:#166534;font-size:13px;font-weight:700;">${money(invoice.due, invoice.currency)}</td></tr>` +
    `</table></td></tr></table>`;

  return emailShell({
    title: `Tax invoice ${invoice.number}`,
    children: `${paragraphs}\n${summary}`,
  });
}

/** The same thing as plain text, for a client that will not show HTML. */
export function taxInvoiceText({ invoice, message = "", fileName = "" } = {}) {
  return [
    String(message).trim(),
    "",
    `Attached: ${fileName || "tax invoice"}`,
    `Invoice ${invoice.number} · Total ${money(invoice.total, invoice.currency)} · Amount due ${money(invoice.due, invoice.currency)}`,
    "",
    "Perth Cabinet Doors",
    SALES_EMAIL,
  ].join("\n");
}
