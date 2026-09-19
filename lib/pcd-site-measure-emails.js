// THE THREE EMAILS A SITE MEASURE BOOKING SENDS.
//
// Two go out the moment the fee clears: one to the customer and one to us. The
// third goes by hand from the calendar when somebody sets the actual hour.
//
// ── THE TONE, WHICH IS THE POINT ─────────────────────────────────────────────
//
// Every line is either something the customer needs to know or something they
// can do. No reassurance, no warmth, no sentence that exists to make the email
// feel friendly. "Your site measure is booked." is the whole of the good news
// and it does not need help.
//
// ── NOTHING HERE MAY FAIL THE THING IT IS ABOUT ──────────────────────────────
//
// The booking is written and the calendar event created before any of this
// runs, and every function returns rather than throws. A refused email is a
// missing email, never a lost booking that somebody has paid for.

import { Resend } from "resend";
import { SALES_EMAIL } from "./pcd-business-identity";
import { emailShell, quoteFacts, quoteShell } from "./pcd-email-templates";
import { sendEmail } from "./pcd-send-email";
import { cancellationSummary, CANCELLATION_POLICY_PATH } from "./pcd-cancellation-policy";
import { formatDay, formatMinutes } from "./pcd-calendar";
import { minutesOfTime } from "./pcd-booking-settings";

function resendClient() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

async function send({ to, subject, html, what }) {
  const address = String(to || "").trim();
  if (!address) return { ok: false, error: "There is no email address to send to." };
  const resend = resendClient();
  if (!resend) return { ok: false, error: "Email is not configured, so nothing was sent." };

  const sent = await sendEmail(resend, {
    from: process.env.RESEND_FROM_EMAIL,
    to: [address],
    subject,
    html,
  });
  if (!sent.ok) console.error(`[site-measure] ${what}: ${sent.error}`);
  return sent;
}

function money(amount) {
  return Number(amount || 0).toLocaleString("en-AU", {
    style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** "between 3pm and 6pm", off the window stored on the booking. */
export function windowWordsOf(booking) {
  const from = minutesOfTime(String(booking?.window_from || "").slice(0, 5));
  const to = minutesOfTime(String(booking?.window_to || "").slice(0, 5));
  if (from === null || to === null) return "";
  return `${formatMinutes(from)} and ${formatMinutes(to)}`;
}

/** "Tuesday 6 October 2026". The same words the booking page used. */
export function dayWordsOf(booking) {
  return formatDay(String(booking?.booking_date || "").slice(0, 10), { long: true });
}

function addressOf(booking) {
  return (
    booking?.site_address ||
    [booking?.site_street, booking?.site_suburb, booking?.site_postcode].filter(Boolean).join(", ")
  );
}

/**
 * To the customer, the moment the fee clears.
 *
 * Carries the two things they will look for later, which are the day and what
 * happens about the time, and the two facts about their money: that the fee
 * comes off an order, and what happens if they cancel. Nothing else.
 */
export async function sendSiteMeasureBookedToCustomer({ booking, confirmHours, baseUrl = "" }) {
  const name = booking?.customer_name || "";
  const hours = Math.max(1, Math.round(Number(confirmHours) || 48));
  const policyUrl = `${String(baseUrl || "").replace(/\/+$/, "")}${CANCELLATION_POLICY_PATH}`;

  return send({
    to: booking?.customer_email,
    subject: `Your site measure is booked for ${formatDay(booking?.booking_date)}`,
    what: "booking confirmation",
    html: quoteShell({
      title: "Your site measure is booked",
      footerNote: `This email was sent because a site measure was booked for ${name || "you"} on our website.`,
      children: [
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">Hi ${escape(name) || "there"},</p>`,
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">Your site measure is booked.</p>`,
        quoteFacts(
          [
            ["Date", dayWordsOf(booking)],
            ["Arriving between", windowWordsOf(booking)],
            ["Address", addressOf(booking)],
            ["Fee paid", money(booking?.fee_amount)],
          ],
          { emphasiseLast: true }
        ),
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;"><b>We will confirm the exact time with you in the ${hours} hours before.</b></p>`,
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">The ${money(
          booking?.fee_amount
        )} fee covers our time and travel for the site measure. It comes off any order you place from the quote we send you afterwards.</p>`,
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">To change the date or the time, reply to this email. ${escape(
          cancellationSummary({ fee: booking?.fee_amount, confirmHours: hours })
        )} <a href="${escape(policyUrl)}" style="color:#2f6b3b;">Cancellation policy</a></p>`,
        `<p style="margin:0;color:#263226;font-size:15px;line-height:1.6;">Kind Regards,<br>Perth Cabinet Doors</p>`,
      ].join("\n"),
    }),
  });
}

/**
 * To us, alongside the customer's.
 *
 * The suburb is in the SUBJECT because a run is planned off an inbox before it
 * is planned off a calendar, and "Bayswater" in a subject line is worth more
 * than any amount of detail in the body.
 */
export async function sendSiteMeasureBookedToSales({ booking, confirmHours, placesLeft, baseUrl = "" }) {
  const hours = Math.max(1, Math.round(Number(confirmHours) || 48));
  const suburb = booking?.site_suburb || "";
  const calendarUrl = `${String(baseUrl || "").replace(/\/+$/, "")}/admin/calendar`;

  return send({
    to: SALES_EMAIL,
    subject: `Site measure booked, ${formatDay(booking?.booking_date)}${suburb ? `, ${suburb}` : ""}`,
    what: "sales notice",
    html: emailShell({
      title: "Site measure booked",
      intro: "A site measure was booked on the website and the fee has been paid.",
      children: [
        rows([
          ["Date", dayWordsOf(booking)],
          ["Window", windowWordsOf(booking)],
          ["Name", booking?.customer_name || ""],
          ["Phone", booking?.customer_phone || "Not given"],
          ["Email", booking?.customer_email || ""],
          ["Address", addressOf(booking)],
          ["Booked that day", placesLeft === 0 ? "Now full" : `${placesLeft} place${placesLeft === 1 ? "" : "s"} left`],
          ["Fee paid", money(booking?.fee_amount)],
        ]),
        booking?.notes
          ? `<div style="margin:18px 0 0;padding:13px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#334155;font-size:13px;line-height:20px;"><b>They wrote:</b><br>${escape(
              booking.notes
            )}</div>`
          : "",
        `<p style="margin:18px 0 0;"><a href="${escape(
          calendarUrl
        )}" style="display:inline-block;background:#0d3550;color:#ffffff;text-decoration:none;padding:12px 18px;font-size:13px;font-weight:700;border-radius:6px;">Open the calendar</a></p>`,
        `<p style="margin:18px 0 0;color:#475569;font-size:13px;line-height:20px;">It is on the calendar and in Outlook. The time needs confirming with them ${hours} hours before.</p>`,
      ].join("\n"),
    }),
  });
}

/**
 * The hour, once somebody has set it.
 *
 * Sent by hand from the calendar, because the decision is a person looking at a
 * day's run. Nothing here chases: the calendar shows which bookings still owe
 * this message and that is enough.
 */
export async function sendSiteMeasureTimeToCustomer({ booking, startMinutes }) {
  const name = booking?.customer_name || "";
  return send({
    to: booking?.customer_email,
    subject: `Your site measure time, ${formatDay(booking?.booking_date)}`,
    what: "time confirmation",
    html: quoteShell({
      title: "Here is your time",
      footerNote: "This email was sent because you have a site measure booked with us.",
      children: [
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">Hi ${escape(name) || "there"},</p>`,
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">The time for your site measure is set.</p>`,
        quoteFacts(
          [
            ["Date", dayWordsOf(booking)],
            ["We will arrive", formatMinutes(startMinutes)],
            ["Allow", "About an hour"],
            ["Address", addressOf(booking)],
          ],
          { emphasiseLast: true }
        ),
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">If that no longer suits, reply to this email.</p>`,
        `<p style="margin:0;color:#263226;font-size:15px;line-height:1.6;">Kind Regards,<br>Perth Cabinet Doors</p>`,
      ].join("\n"),
    }),
  });
}

/**
 * A cancellation, confirmed in writing.
 *
 * Says which way it went and what that means for their money, because a
 * cancellation email that does not mention the hundred dollars is the email
 * that causes the phone call.
 */
export async function sendSiteMeasureCancelledToCustomer({ booking, outcome, confirmHours }) {
  const name = booking?.customer_name || "";
  const amount = money(booking?.fee_amount);
  const settled =
    outcome === "refunded"
      ? `We have refunded the ${amount} to the card you paid with. It usually reaches your account within five business days, depending on your bank.`
      : outcome === "credited"
        ? `The ${amount} is held as a credit on your account. Use it on another site measure, or it comes off any order you place with us. It does not expire.`
        : "Nothing was charged for this booking.";

  return send({
    to: booking?.customer_email,
    subject: `Your site measure on ${formatDay(booking?.booking_date)} is cancelled`,
    what: "cancellation",
    html: quoteShell({
      title: "Your site measure is cancelled",
      footerNote: "This email was sent because a site measure booked in your name was cancelled.",
      children: [
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">Hi ${escape(name) || "there"},</p>`,
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">Your site measure on ${escape(
          dayWordsOf(booking)
        )} is cancelled.</p>`,
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;"><b>${escape(settled)}</b></p>`,
        `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">To book another day, reply to this email.</p>`,
        `<p style="margin:0;color:#263226;font-size:15px;line-height:1.6;">Kind Regards,<br>Perth Cabinet Doors</p>`,
      ].join("\n"),
    }),
  });
}

// ── local helpers ───────────────────────────────────────────────────────────

function escape(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** A label and value table in the internal email's own dressing. */
function rows(items) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:18px 0 0;">${items
    .filter(([, value]) => String(value ?? "").trim() !== "")
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#475569;font-size:13px;">${escape(
          label
        )}</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:700;text-align:right;">${escape(
          value
        )}</td></tr>`
    )
    .join("")}</table>`;
}
