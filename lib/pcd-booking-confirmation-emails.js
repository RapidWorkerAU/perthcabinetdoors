// THE FOUR EMAILS A BOOKING CONFIRMATION SENDS, AND WHO GETS THEM.
//
// The templates live in lib/pcd-email-templates.js with every other email, so
// the cream customer wrapper and the navy internal one stay one definition
// each. This file is only about which one goes where, and it is separate for
// the same reason lib/pcd-deposit-emails.js is: the sweep should read as a list
// of decisions, not a list of Resend calls.
//
// NOTHING HERE MAY FAIL THE THING IT IS ABOUT. The booking is saved and the
// answer is recorded before any of this runs. Every function returns rather
// than throws, so a refused email is a missing email and never a lost answer.

import { Resend } from "resend";
import { SALES_EMAIL } from "./pcd-business-identity";
import {
  customerBookingAnsweredHtml,
  customerBookingAskHtml,
  salesBookingChaseHtml,
  salesBookingNoticeHtml,
} from "./pcd-email-templates";
import { sendEmail } from "./pcd-send-email";
import { andList, bookingWhen, confirmUrl, kindLabel, missingWords } from "./pcd-booking-confirmations";

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
  if (!sent.ok) console.error(`[booking-confirm] ${what}: ${sent.error}`);
  return sent;
}

/** Everything the emails need to describe one booking, worked out once. */
function facts(row, { customer } = {}) {
  const when = bookingWhen(row);
  const label = kindLabel(row);
  const contact = [row.contact_name || row.customer_name || "", row.contact_mobile || ""]
    .filter(Boolean)
    .join(", ");
  return { when, label, contact, customer: customer || null };
}

/**
 * Ask the customer.
 *
 * Returns { ok, error }. The caller records which, because the difference
 * between "asked" and "could not ask" is the whole point of the state column.
 */
export async function sendBookingAsk(row, { customer, baseUrl }) {
  const { when, label } = facts(row);
  const to = String(customer?.email || "").trim();
  if (!to) return { ok: false, error: "This customer has no email address on their record." };

  const html = customerBookingAskHtml({
    customerName: firstName(row.customer_name || customer?.name),
    kindLabel: label,
    dayLong: when.dayLong,
    dayShort: when.dayShort,
    timeRange: when.timeRange,
    startTime: when.startTime,
    siteAddress: row.site_address || "",
    // Only what is actually short, so a customer who gave us a number last
    // month is never told we do not have one.
    missing: missingWords(row).filter((word) => word !== "a contact name"),
    confirmUrl: confirmUrl(baseUrl, row.confirm_token),
  });

  return send({
    to,
    subject: `Please confirm your ${label.toLowerCase()} tomorrow`,
    html,
    what: `ask for booking ${row.id}`,
  });
}

/**
 * Tell us about a booking of ours that has nobody on it.
 *
 * Same page, same two buttons, but nothing on it is compulsory, because these
 * are visits somebody took off a phone call before a customer record existed.
 */
export async function sendUnlinkedAskToSales(row, { baseUrl }) {
  const { when, label } = facts(row);

  const html = salesBookingNoticeHtml({
    heading: "Appointment tomorrow with nobody linked",
    intro:
      "This is on the calendar for tomorrow and has no customer on it, so nobody has been asked to confirm " +
      "it. Open the page below to confirm or decline it yourself, and to put a name and a number against it " +
      "while you are there.",
    rows: [
      ["What", label],
      ["Title", row.title],
      ["When", `${when.dayLong}, ${when.timeRange}`],
      ["Where", row.site_address || ""],
      ["Customer", "Nobody linked"],
      ["Notes", row.notes || ""],
      ["Came from", "Booked on the PCD calendar"],
    ],
    missing: missingWords(row, { linked: false }),
    actionUrl: confirmUrl(baseUrl, row.confirm_token),
    actionLabel: "Confirm or decline this appointment",
  });

  return send({
    to: SALES_EMAIL,
    subject: `${label} tomorrow with nobody linked`,
    html,
    what: `unlinked ask for booking ${row.id}`,
  });
}

/**
 * Tell us an ask could not be sent, the moment it happens.
 *
 * This is the one internal email that goes out on its own rather than waiting
 * for the morning list, because it is the only one that is actionable while
 * there is still a day to do something about it. A send that WORKED emails
 * nobody: it would be most of the traffic and none of the value, and what it
 * would actually be reporting is that Resend accepted a message, which is not
 * the same as it arriving.
 */
export async function sendAskFailureToSales(row, { reason, customer, baseUrl }) {
  const { when, label } = facts(row);

  const html = salesBookingNoticeHtml({
    heading: `Could not ask about a ${label.toLowerCase()} tomorrow`,
    intro:
      `The confirmation for this booking did not go out, so the customer has not been asked and will not be. ` +
      `The booking itself is fine and still on the calendar.`,
    rows: [
      ["What", label],
      ["Title", row.title],
      ["When", `${when.dayLong}, ${when.timeRange}`],
      ["Where", row.site_address || ""],
      ["Customer", row.customer_name || ""],
      ["We tried", customer?.email || "No email address on their record"],
      ["What went wrong", reason || "The email provider refused the message"],
    ],
    missing: missingWords(row),
    actionUrl: `${String(baseUrl || "").replace(/\/+$/, "")}/admin/calendar`,
    actionLabel: "Open the calendar",
    footnote:
      "The booking now reads as could not ask on the calendar rather than waiting, so it will not be " +
      "mistaken for a customer who simply has not replied.",
  });

  return send({
    to: SALES_EMAIL,
    subject: `Could not ask about a ${label.toLowerCase()} tomorrow`,
    html,
    what: `failure notice for booking ${row.id}`,
  });
}

/** Their receipt. Short, and the cancelled one promises nothing. */
export async function sendAnswerToCustomer(row, { customer, confirmed, supplied = [] }) {
  const { when, label, contact } = facts(row);
  const to = String(customer?.email || "").trim();
  if (!to) return { ok: false, error: "No customer email address." };

  const html = customerBookingAnsweredHtml({
    customerName: firstName(row.customer_name || customer?.name),
    kindLabel: label,
    dayLong: when.dayLong,
    dayShort: when.dayShort,
    timeRange: when.timeRange,
    startTime: when.startTime,
    siteAddress: row.site_address || "",
    contact,
    confirmed,
    notes: row.confirm_notes || "",
    supplied,
  });

  return send({
    to,
    subject: confirmed
      ? `Confirmed: your ${label.toLowerCase()} on ${when.dayShort}`
      : `Cancelled: your ${label.toLowerCase()} on ${when.dayShort}`,
    html,
    what: `answer receipt for booking ${row.id}`,
  });
}

/** What landed, and what we hold for it. */
export async function sendAnswerToSales(row, { confirmed, supplied = [], baseUrl, linked = true }) {
  const { when, label, contact } = facts(row);
  const who = row.confirm_answered_by || row.customer_name || "Somebody in the office";

  const intro = confirmed
    ? `${who} confirmed the ${label.toLowerCase()} booked for ${when.dayLong} at ${when.startTime || "any time during the day"}.`
    : `${who} declined the ${label.toLowerCase()} booked for ${when.dayLong} at ${when.startTime || "any time during the day"}. ` +
      `It is still on the calendar, flagged as declined, so it can be moved rather than lost.`;

  const html = salesBookingNoticeHtml({
    heading: `${label} ${confirmed ? "confirmed" : "declined"} for tomorrow`,
    intro,
    rows: [
      ["What", label],
      ["Title", row.title],
      ["When", `${when.dayLong}, ${when.timeRange}`],
      ["Where", row.site_address || ""],
      ["Customer", linked ? row.customer_name || "" : "Nobody linked"],
      ["Best contact", contact],
      ["Answered by", row.confirm_answered_by || ""],
      ["Answered", row.confirm_answered_at ? new Date(row.confirm_answered_at).toLocaleString("en-AU") : ""],
      ["They said", row.confirm_notes || ""],
    ],
    missing: missingWords(row, { linked }),
    supplied,
    actionUrl: `${String(baseUrl || "").replace(/\/+$/, "")}/admin/calendar`,
    actionLabel: "Open the booking on the calendar",
    footnote: "Sent automatically when somebody answers a booking confirmation.",
  });

  return send({
    to: SALES_EMAIL,
    subject: `${label} ${confirmed ? "confirmed" : "declined"} for tomorrow`,
    html,
    what: `answer notice for booking ${row.id}`,
  });
}

/** The morning list. Two sections, because they need opposite responses. */
export async function sendMorningChase({ waiting = [], couldNotAsk = [], baseUrl }) {
  if (!waiting.length && !couldNotAsk.length) return { ok: true, skipped: true };

  const line = (row) => {
    const { when, label } = facts(row);
    return {
      title: `${label}, ${row.customer_name || row.title}`,
      detail: [
        when.timeRange,
        row.site_address || "no address",
        row.confirm_state === "failed"
          ? row.confirm_error || "the email did not go out"
          : `asked ${row.confirm_asked_at ? new Date(row.confirm_asked_at).toLocaleString("en-AU") : ""}`,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  };

  const html = salesBookingChaseHtml({
    waiting: waiting.map(line),
    couldNotAsk: couldNotAsk.map(line),
    adminUrl: `${String(baseUrl || "").replace(/\/+$/, "")}/admin/calendar`,
  });

  return send({
    to: SALES_EMAIL,
    subject: `${waiting.length + couldNotAsk.length} booking${
      waiting.length + couldNotAsk.length === 1 ? "" : "s"
    } today nobody has answered`,
    html,
    what: "morning chase list",
  });
}

/** "Kristy Smith" becomes "Kristy". Falls back to nothing, never to a guess. */
function firstName(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.split(" ")[0];
}

/** What the customer just filled in, in words, for both answer emails. */
export function suppliedWords(before, after) {
  const words = [];
  if (!String(before?.contact_mobile || "").trim() && String(after?.contact_mobile || "").trim()) {
    words.push("number");
  }
  if (!String(before?.site_address || "").trim() && String(after?.site_address || "").trim()) {
    words.push("address");
  }
  return words;
}

/** The same thing spelled out, for the internal email. */
export function suppliedLines(before, after) {
  const lines = [];
  if (!String(before?.contact_mobile || "").trim() && String(after?.contact_mobile || "").trim()) {
    lines.push(`Mobile: ${after.contact_mobile}`);
  }
  if (!String(before?.site_address || "").trim() && String(after?.site_address || "").trim()) {
    lines.push(`Address: ${after.site_address}`);
  }
  return lines;
}

export { andList };
