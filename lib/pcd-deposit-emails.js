// CHASING A DEPOSIT THAT NEVER ARRIVED.
//
// ── THE SILENCE THIS FILLS ───────────────────────────────────────────────────
//
// A customer who approved a quote and closed the payment tab used to hear
// nothing, ever. Not that day, not the next week. They had done the thing they
// thought was required and the job simply never happened, and the first either
// side knew of it was somebody eventually noticing.
//
// ── TWO EMAILS, THEN IT BECOMES A PERSON'S JOB ───────────────────────────────
//
//   + 1 hour    the interruption catch, while they still remember doing it
//   + 24 hours  the last automated word, and a note to sales@ at the same
//               moment so the handover from machine to human happens in one go
//
// ONCE PER QUOTE, EVER. Somebody who approves, abandons, gets both reminders,
// then comes back three weeks later and abandons again does not get the same
// two emails a second time. The chase has happened. Repeating it reads as a
// machine that is not paying attention, and it is our name on it.
//
// ── FRIENDLY, BUT CLEAR ABOUT WHERE THEY STAND ───────────────────────────────
//
// Both say outright that the quote is not approved and no order exists. Most
// people here were simply interrupted, so the tone stays warm, but there is no
// way to read these and think the job is quietly under way.
//
// ── NONE OF THESE MAY EVER FAIL THE THING THEY ARE ABOUT ─────────────────────
//
// Every function returns rather than throws. A refused email is a missing
// email, and it can never affect a quote, a payment or another email.

import { Resend } from "resend";
import {
  SALES_EMAIL,
  customerDepositFinalHtml,
  customerDepositReminderHtml,
  salesDepositUnpaidHtml,
} from "./pcd-email-templates";
import { sendEmail } from "./pcd-send-email";
import { depositAmountForQuote } from "./pcd-quote-acceptance";

const money = (value, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(Number(value) || 0);

const percentLabel = (quote) => `${Number(quote?.deposit_percent || 0).toFixed(0)}%`;

function resendClient() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

async function send({ to, subject, html, what }) {
  const address = String(to || "").trim();
  if (!address) {
    console.error(`[deposit-chase] ${what}: nothing sent, there is no email address on it.`);
    return { ok: false, error: "No email address." };
  }
  const resend = resendClient();
  if (!resend) {
    console.error(`[deposit-chase] ${what}: nothing sent, email is not configured.`);
    return { ok: false, error: "Email is not configured." };
  }
  const sent = await sendEmail(resend, {
    from: process.env.RESEND_FROM_EMAIL,
    to: [address],
    subject,
    html,
  });
  if (!sent.ok) console.error(`[deposit-chase] ${what}: ${sent.error}`);
  return sent;
}

/** The customer's link. Always the quote page, NEVER the Stripe url. */
export function quoteViewUrl(baseUrl, quote) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/quotes/view?code=${encodeURIComponent(quote.access_code || "")}`;
}

function figures(quote) {
  return {
    customerName: quote.customer_name || "",
    quoteNumber: quote.quote_number || "",
    totalIncGst: money(quote.total_inc_gst, quote.currency),
    depositAmount: money(depositAmountForQuote(quote), quote.currency),
    depositPercent: percentLabel(quote),
  };
}

/** First reminder, an hour in. */
export async function sendDepositReminder(quote, { baseUrl }) {
  const viewUrl = quoteViewUrl(baseUrl, quote);
  return send({
    to: quote.customer_email,
    subject: `Deposit still to pay: ${quote.quote_number}`,
    html: customerDepositReminderHtml({ ...figures(quote), viewUrl }),
    what: `first reminder on ${quote.quote_number}`,
  });
}

/** Final reminder, a day in. */
export async function sendDepositFinalReminder(quote, { baseUrl }) {
  const viewUrl = quoteViewUrl(baseUrl, quote);
  return send({
    to: quote.customer_email,
    subject: `Final reminder, deposit outstanding: ${quote.quote_number}`,
    html: customerDepositFinalHtml({ ...figures(quote), viewUrl }),
    what: `final reminder on ${quote.quote_number}`,
  });
}

/** And the one thing that tells us it happened. */
export async function sendDepositUnpaidToSales(quote, { baseUrl, attempts = 1 }) {
  const approvedAt = quote.awaiting_deposit_at
    ? new Date(quote.awaiting_deposit_at).toLocaleString("en-AU", {
        timeZone: "Australia/Perth",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";

  return send({
    to: SALES_EMAIL,
    subject: `Deposit not received: ${quote.quote_number}, ${quote.customer_name || "customer"}`,
    html: salesDepositUnpaidHtml({
      ...figures(quote),
      customerEmail: quote.customer_email || "-",
      customerPhone: quote.customer_phone || "-",
      approvedAt: `${approvedAt} Perth`,
      attempts: `${attempts}, none completed`,
      adminUrl: `${String(baseUrl || "").replace(/\/+$/, "")}/admin/quotes/${quote.id}`,
    }),
    what: `sales notice on ${quote.quote_number}`,
  });
}
