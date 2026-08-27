// SENDING THE EXPIRY REMINDER AND THE WEEKLY DIGEST.
//
// Split from lib/pcd-quote-expiry.js for the same reason the deposit chase is
// split from the deposit sweep: the rules about WHEN are worth testing on their
// own, without a mail provider anywhere near them.
//
// ── NONE OF THESE MAY EVER FAIL THE THING THEY ARE ABOUT ─────────────────────
//
// Every function returns rather than throws. A refused email is a missing email,
// and it can never stop a quote being archived or another customer being told.

import { Resend } from "resend";
import {
  SALES_EMAIL,
  customerQuoteExpiryHtml,
  salesQuoteExpiryDigestHtml,
} from "./pcd-email-templates";
import { sendEmail } from "./pcd-send-email";

const money = (value, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(Number(value) || 0);

/**
 * A date the way somebody in Perth would write it.
 *
 * PERTH, EXPLICITLY. These run on a server in another timezone, and a quote
 * expiring at 08:00 UTC is expiring in the afternoon here. Formatted in UTC it
 * would name the wrong day to the only two people who matter, the customer and
 * whoever they ring about it.
 */
export function perthDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function resendClient() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

async function send({ to, subject, html, what }) {
  const address = String(to || "").trim();
  if (!address) {
    console.error(`[quote-expiry] ${what}: nothing sent, there is no email address on it.`);
    return { ok: false, error: "No email address." };
  }
  const resend = resendClient();
  if (!resend) {
    console.error(`[quote-expiry] ${what}: nothing sent, email is not configured.`);
    return { ok: false, error: "Email is not configured." };
  }
  const sent = await sendEmail(resend, {
    from: process.env.RESEND_FROM_EMAIL,
    to: [address],
    subject,
    html,
  });
  if (!sent.ok) console.error(`[quote-expiry] ${what}: ${sent.error}`);
  return sent;
}

/** The customer's link. The quote page, the same one their quote email held. */
export function quoteViewUrl(baseUrl, quote) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/quotes/view?code=${encodeURIComponent(quote.access_code || "")}`;
}

/**
 * The day 23 email.
 *
 * THE TOTAL IS SHOWN ONLY IF THEIR QUOTE EMAIL SHOWED IT. Some quotes go out
 * with pricing deliberately left out of the body, and a reminder that puts the
 * figure in an inbox anyway would undo that decision a month later.
 *
 * There is no record of whether the original send included the price, so this
 * reads the flag that survives on the quote: deposit and pricing decisions are
 * made per send, and include_price is not stored. Callers pass it in.
 */
export async function sendQuoteExpiryReminder(quote, { baseUrl, validDays, expiresAt, daysLeft, includePrice }) {
  const viewUrl = quoteViewUrl(baseUrl, quote);
  const expiresAtLabel = perthDate(expiresAt);

  return send({
    to: quote.customer_email,
    subject: `Your quote expires on ${expiresAtLabel}: ${quote.quote_number}`,
    html: customerQuoteExpiryHtml({
      customerName: quote.customer_name || "",
      quoteNumber: quote.quote_number || "",
      sentAtLabel: perthDate(quote.sent_at),
      expiresAtLabel,
      daysLeft,
      validDays,
      totalIncGst: includePrice ? money(quote.total_inc_gst, quote.currency) : "",
      viewUrl,
    }),
    what: `expiry reminder on ${quote.quote_number}`,
  });
}

/** One row of the digest, whichever table it lands in. */
export function digestRow(quote, { expiresAt, daysLeft } = {}) {
  return {
    quoteNumber: quote.quote_number || "",
    customerName: quote.customer_name || "",
    sentAtLabel: perthDate(quote.sent_at),
    expiresAtLabel: expiresAt ? perthDate(expiresAt) : "",
    daysLeft: daysLeft ?? null,
    warned: Boolean(quote.expiry_warned_at),
    totalIncGst: money(quote.total_inc_gst, quote.currency),
  };
}

/**
 * The weekly digest to sales@.
 *
 * SENT EVEN WHEN THE WEEK WAS EMPTY. A digest that only arrives when something
 * happened is a digest nobody can tell apart from a job that stopped running,
 * and this one is the only routine sign that any of this is still alive.
 */
export async function sendQuoteExpiryDigest({ archived, expiringSoon, warned, baseUrl, since }) {
  const total = archived.length + expiringSoon.length;

  return send({
    to: SALES_EMAIL,
    subject: total
      ? `Quote expiry: ${archived.length} archived, ${expiringSoon.length} expiring within 7 days`
      : "Quote expiry: nothing archived and nothing expiring this week",
    html: salesQuoteExpiryDigestHtml({
      archived,
      expiringSoon,
      warned,
      since: perthDate(since),
      adminUrl: `${String(baseUrl || "").replace(/\/+$/, "")}/admin/reporting/leads`,
    }),
    what: "weekly expiry digest",
  });
}
