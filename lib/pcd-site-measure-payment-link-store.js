// A SITE MEASURE BOOKED ON THE PHONE, PAID THROUGH A LINK. THE DATABASE HALF.
//
// The rules are in lib/pcd-site-measure-payment-link.js and are pure. This is
// what reads and writes: the booking row behind a hand-made measure, the email
// that carries the link, and the Stripe page the link opens.
//
// ── ONE ROW PER CALENDAR EVENT ───────────────────────────────────────────────
//
// Sending the link twice updates the same pcd_site_measure_bookings row, with
// the same code, so an older email still works and still lands on the right
// booking. A unique index holds that in the database as well.
//
// ── THE DAY IS ALREADY TAKEN ─────────────────────────────────────────────────
//
// The calendar event is what holds the place on the day. The booking row only
// carries the money, so it never asks the website's capacity whether there is
// room, and usedByDay counts the pair once.

import { randomBytes } from "crypto";
import { Resend } from "resend";
import { getBookingSettings } from "./pcd-booking-store";
import { createCheckoutSession } from "./pcd-stripe";
import { sendEmail } from "./pcd-send-email";
import { quoteButton, quoteFacts, quoteParagraphs, quoteShell, fallbackLink } from "./pcd-email-templates";
import { agentForUser, recordOutboundEmail } from "./pcd-desk-outbound";
import { logOrderActivity } from "./pcd-activity-log";
import { bookingWhen } from "./pcd-booking-confirmations";
import {
  AWAITING_PAYMENT,
  PAYMENT_LINK_SOURCE,
  PAYMENT_LINK_SUBJECT,
  checkLinkExpiry,
  defaultPaymentLinkMessage,
  latestLinkExpiry,
  linkClosesAt,
  momentWords,
  payCutoffAt,
  perthLocalInput,
  stillOpen,
  windowFromEvent,
} from "./pcd-site-measure-payment-link";

const BOOKINGS = "pcd_site_measure_bookings";
const EVENTS = "pcd_calendar_events";
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The statuses that make a booking row the live one for its event. */
const LIVE = ["holding", AWAITING_PAYMENT, "booked"];

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function generateLinkToken() {
  return randomBytes(16).toString("base64url");
}

function base(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

export function paymentLinkUrl(baseUrl, token) {
  return `${base(baseUrl)}/book-a-site-measure/pay?code=${encodeURIComponent(token || "")}`;
}

function money(amount) {
  return Number(amount || 0).toLocaleString("en-AU", {
    style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** The booking row carrying the money for this calendar event, if there is one. */
export async function liveBookingForEvent(supabase, eventId) {
  if (!eventId) return null;
  const { data, error } = await supabase
    .from(BOOKINGS)
    .select("*")
    .eq("calendar_event_id", eventId)
    .in("status", LIVE)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error(`[payment-link] could not read the booking for event ${eventId}: ${error.message}`);
    return null;
  }
  return (data || [])[0] || null;
}

/** Only the unpaid one. What the confirmation page and the chase list ask about. */
export async function awaitingBookingForEvent(supabase, eventId) {
  const row = await liveBookingForEvent(supabase, eventId);
  return row?.status === AWAITING_PAYMENT ? row : null;
}

/** Every live booking row for a set of events, keyed by event id. For the calendar read. */
export async function bookingsByEvent(supabase, eventIds = []) {
  const ids = [...new Set((eventIds || []).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const { data, error } = await supabase
    .from(BOOKINGS)
    .select(
      "id, status, source, calendar_event_id, fee_amount, fee_paid_at, payment_link_sent_to, payment_link_sent_at, payment_link_expires_at, details_requested, details_completed_at, created_at"
    )
    .in("calendar_event_id", ids)
    .in("status", LIVE)
    .order("created_at", { ascending: true });
  // A database without the newer columns still draws the calendar. It just
  // shows nothing about payment links until the SQL is run.
  if (error) return map;
  for (const row of data || []) map.set(row.calendar_event_id, row);
  return map;
}

async function loadEvent(supabase, eventId) {
  const { data, error } = await supabase.from(EVENTS).select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw fail("That booking no longer exists.", 404);
  return data;
}

async function loadCustomer(supabase, customerId) {
  if (!customerId) return null;
  const { data } = await supabase
    .from("pcd_customers")
    .select("id, name, contact_name, email, phone, site_street, site_suburb, site_postcode, site_address")
    .eq("id", customerId)
    .maybeSingle();
  return data || null;
}

/** Why a measure cannot be sent a link, or "" when it can. */
function refusalFor(event, booking, now = new Date()) {
  if (event.kind !== "measure") return "Payment links are only for site measures.";
  if (event.status === "cancelled") return "This booking is cancelled.";
  if (new Date(event.starts_at).getTime() <= now.getTime()) return "This measure has already started.";
  if (booking?.status === "booked") return "This site measure is already paid for.";
  if (booking?.status === "holding") return "This one is being paid on the website right now.";
  return "";
}

/**
 * Everything the calendar's email window starts from.
 *
 * Who it goes to, what the message says, and when the link closes by default,
 * which is also the latest it can close.
 */
export async function paymentLinkDraft(supabase, eventId, { now = new Date() } = {}) {
  const event = await loadEvent(supabase, eventId);
  const booking = await liveBookingForEvent(supabase, eventId);
  const refusal = refusalFor(event, booking, now);
  const settings = await getBookingSettings(supabase);
  const customer = await loadCustomer(supabase, event.customer_id);

  const latest = latestLinkExpiry({ startsAt: event.starts_at, cutoffHours: settings.pay_cutoff_hours, now });
  const latestOk = latest && latest.getTime() > now.getTime() + 30 * 60000;
  const when = bookingWhen(event);

  const name = booking?.customer_name || customer?.contact_name || customer?.name || event.customer_name || "";
  const email = booking?.customer_email || customer?.email || "";
  // Resending keeps the time that was chosen, if it is still allowed.
  const keep = booking?.payment_link_expires_at && latest
    && new Date(booking.payment_link_expires_at).getTime() <= latest.getTime()
    && new Date(booking.payment_link_expires_at).getTime() > now.getTime() + 30 * 60000;
  const expiresAt = keep ? new Date(booking.payment_link_expires_at) : latest;

  return {
    refusal: refusal || (latestOk ? "" : "This measure is too close to take payment online. Take the payment over the phone instead."),
    resend: booking?.status === AWAITING_PAYMENT,
    name,
    email,
    fee: Number(settings.fee_inc_gst) || 0,
    dayWords: when.dayLong,
    timeWords: when.timeRange,
    needDetails: booking ? Boolean(booking.details_requested) : true,
    expiresAt: perthLocalInput(expiresAt),
    latestExpiry: perthLocalInput(latest),
    latestWords: momentWords(latest),
    subject: PAYMENT_LINK_SUBJECT,
    // Both versions, so ticking the box swaps the words without a round trip.
    messages: Object.fromEntries(
      [true, false].map((needDetails) => [
        needDetails ? "withDetails" : "payOnly",
        defaultPaymentLinkMessage({
          name,
          needDetails,
          fee: settings.fee_inc_gst,
          dayWords: when.dayLong,
          timeWords: when.timeRange,
          closesWords: momentWords(expiresAt),
        }),
      ])
    ),
  };
}

/** The email body: what they typed, the facts, and the button. */
function paymentLinkEmailHtml({ message, url, event, fee, closesWords, needDetails }) {
  const when = bookingWhen(event);
  return quoteShell({
    title: "Confirm your site measure",
    footerNote: "This email was sent because you spoke to us about booking a site measure.",
    children: [
      quoteParagraphs(String(message || "").trim()),
      quoteFacts(
        [
          ["Date", when.dayLong],
          ["Time", when.timeRange],
          ...(event.site_address ? [["Address", event.site_address]] : []),
          ["Status", "Held, not confirmed until paid"],
          ["Link works until", closesWords],
          ["Site measure fee", money(fee)],
        ],
        { emphasiseLast: true }
      ),
      quoteButton(url, needDetails ? "Add my details and pay" : `Pay ${money(fee)} and confirm`),
      fallbackLink(url),
    ].join(""),
  });
}

function paymentLinkEmailText({ message, url, closesWords }) {
  return `${String(message || "").trim()}\n\nConfirm and pay: ${url}\nThe link works until ${closesWords}.\n\nPerth Cabinet Doors`;
}

/**
 * Send (or send again) the payment link for a hand-made measure.
 *
 * input: { to, name, needDetails, expiresAt ("YYYY-MM-DDTHH:mm" Perth), subject, message }
 * Returns { booking, sentTo, warning }.
 */
export async function sendPaymentLink(supabase, eventId, input = {}, { baseUrl = "", user = null, now = new Date() } = {}) {
  const event = await loadEvent(supabase, eventId);
  const existing = await liveBookingForEvent(supabase, eventId);
  const refusal = refusalFor(event, existing, now);
  if (refusal) throw fail(refusal, 409);

  const to = String(input.to || "").trim().toLowerCase();
  if (!EMAIL_SHAPE.test(to)) throw fail("That does not look like an email address.");
  const message = String(input.message || "").trim();
  if (!message) throw fail("The email has no message in it.");
  const subject = String(input.subject || "").trim() || PAYMENT_LINK_SUBJECT;

  const settings = await getBookingSettings(supabase);
  const checked = checkLinkExpiry(input.expiresAt, {
    startsAt: event.starts_at,
    cutoffHours: settings.pay_cutoff_hours,
    now,
  });
  if (checked.error) throw fail(checked.error);

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw fail("Email is not configured, so nothing was sent.", 500);
  }

  const customer = await loadCustomer(supabase, event.customer_id);
  const window = windowFromEvent(event);
  const name = String(input.name || "").trim() || existing?.customer_name || customer?.contact_name
    || customer?.name || event.customer_name || "";
  const needDetails = Boolean(input.needDetails);
  const nowIso = now.toISOString();

  const fields = {
    customer_id: event.customer_id || existing?.customer_id || null,
    customer_name: name || to,
    customer_email: to,
    booking_date: window.booking_date,
    window_from: window.window_from,
    window_to: window.window_to,
    status: AWAITING_PAYMENT,
    source: PAYMENT_LINK_SOURCE,
    hold_expires_at: null,
    fee_amount: Number(settings.fee_inc_gst) || 0,
    calendar_event_id: event.id,
    payment_link_expires_at: checked.at.toISOString(),
    payment_link_sent_at: nowIso,
    payment_link_sent_to: to,
    details_requested: needDetails,
    updated_at: nowIso,
  };

  // What we already hold is written in so the details page starts filled in,
  // and so a booking sent without the details page still has an address.
  // A resend never overwrites what the customer has already typed.
  const known = {
    customer_phone: existing?.customer_phone || customer?.phone || event.contact_mobile || null,
    site_street: existing?.site_street || customer?.site_street || null,
    site_suburb: existing?.site_suburb || customer?.site_suburb || null,
    site_postcode: existing?.site_postcode || customer?.site_postcode || null,
    site_address: existing?.site_address || event.site_address || customer?.site_address || null,
  };

  let booking;
  if (existing) {
    const { data, error } = await supabase
      .from(BOOKINGS)
      .update({ ...fields, ...known })
      .eq("id", existing.id)
      .eq("status", AWAITING_PAYMENT)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw fail("That booking changed while you were sending. Close this and try again.", 409);
    booking = data;
  } else {
    const { data, error } = await supabase
      .from(BOOKINGS)
      .insert({ ...fields, ...known, payment_link_token: generateLinkToken() })
      .select("*")
      .single();
    if (error) {
      if (/status_check|payment_link|source|details_requested/i.test(error.message || "")) {
        throw fail("Payment links need the 202611161200 SQL to be run first.", 500);
      }
      throw error;
    }
    booking = data;
  }

  const url = paymentLinkUrl(baseUrl, booking.payment_link_token);
  const closesWords = momentWords(
    linkClosesAt({ expiresAt: booking.payment_link_expires_at, startsAt: event.starts_at, cutoffHours: settings.pay_cutoff_hours })
  );
  const html = paymentLinkEmailHtml({ message, url, event, fee: booking.fee_amount, closesWords, needDetails });
  const text = paymentLinkEmailText({ message, url, closesWords });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sent = await sendEmail(resend, {
    from: process.env.RESEND_FROM_EMAIL,
    to: [to],
    replyTo: user?.email || undefined,
    subject,
    html,
    text,
  });
  if (!sent.ok) throw fail(sent.error || "The email could not be sent.", 502);

  // Filed on their conversation, and in their history. Neither may report the
  // email as unsent when the customer has it.
  let warning = "";
  if (booking.customer_id) {
    try {
      await recordOutboundEmail(supabase, {
        customerId: booking.customer_id,
        toEmail: to,
        subject,
        bodyHtml: html,
        bodyText: text,
        providerMessageId: sent.id,
        agentId: (await agentForUser(supabase, user?.email))?.id || null,
        newTicketSubject: subject,
      });
    } catch (deskError) {
      console.error("[payment-link] sent but not filed:", deskError?.message || deskError);
      warning = "The link was sent, but it could not be filed on the customer's desk.";
    }
  }
  try {
    await logOrderActivity(supabase, {
      customer_id: booking.customer_id || null,
      actor_type: "admin",
      action_type: "site_measure_payment_link_sent",
      title: existing ? "Site measure payment link sent again" : "Site measure payment link sent",
      description: `${money(booking.fee_amount)} for the measure on ${bookingWhen(event).dayLong}. Sent to ${to}, works until ${closesWords}.`,
      metadata: { booking_id: booking.id, calendar_event_id: event.id, details_requested: needDetails },
    });
  } catch (logError) {
    console.error("[payment-link] could not log the send:", logError?.message || logError);
  }

  return { booking, sentTo: to, warning };
}

// ── the customer's side ─────────────────────────────────────────────────────

/** The booking and its event behind a link code. */
export async function bookingForLink(supabase, token) {
  const code = String(token || "").trim();
  if (!code) return { booking: null, event: null };
  const { data: booking, error } = await supabase
    .from(BOOKINGS)
    .select("*")
    .eq("payment_link_token", code)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return { booking: null, event: null };
  const { data: event } = booking.calendar_event_id
    ? await supabase.from(EVENTS).select("*").eq("id", booking.calendar_event_id).maybeSingle()
    : { data: null };
  return { booking, event: event || null };
}

/**
 * Where a link stands: open, paid, closed or cancelled.
 *
 * The event is read every time, because the visit may have moved since the
 * link was sent, and the cutoff moves with it.
 */
export function linkState(booking, event, settings, now = new Date()) {
  if (!booking) return { state: "missing" };
  if (booking.status === "booked") return { state: "paid" };
  if (booking.status === "cancelled" || !event || event.status === "cancelled") return { state: "cancelled" };
  if (booking.status !== AWAITING_PAYMENT) return { state: "closed" };
  const closesAt = linkClosesAt({
    expiresAt: booking.payment_link_expires_at,
    startsAt: event.starts_at,
    cutoffHours: settings.pay_cutoff_hours,
  });
  return stillOpen(closesAt, now) ? { state: "open", closesAt } : { state: "closed", closesAt };
}

/** Whether the confirmation page may still take the fee. */
export function confirmPayState(booking, event, settings, now = new Date()) {
  if (!booking || booking.status !== AWAITING_PAYMENT) return null;
  const cutoff = payCutoffAt(event?.starts_at, settings.pay_cutoff_hours);
  return {
    due: true,
    fee: Number(booking.fee_amount) || 0,
    open: stillOpen(cutoff, now),
    closesWords: momentWords(cutoff),
  };
}

/**
 * Open a Stripe page for a link booking. Shared by the payment page and the
 * confirmation page, so both take the fee the same way and the webhook cannot
 * tell them apart.
 *
 * A fresh page every time, because a Stripe page lives a day at most and the
 * link in their email may be older than that.
 */
export async function startLinkCheckout(supabase, booking, { successUrl, cancelUrl, closesAt }) {
  const session = await createCheckoutSession({
    amount: booking.fee_amount,
    currency: "AUD",
    customerEmail: booking.customer_email,
    description: `Site measure booking fee, ${booking.booking_date}`,
    successUrl,
    cancelUrl,
    expiresAt: closesAt || null,
    metadata: {
      flow: "site_measure_booking",
      booking_id: booking.id,
      booking_date: booking.booking_date,
      source: PAYMENT_LINK_SOURCE,
    },
  });

  await supabase
    .from(BOOKINGS)
    .update({
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .eq("status", AWAITING_PAYMENT);

  return session;
}

/**
 * Keep an unpaid link booking on the same day as its event when the event is
 * moved, so the website's count of the day stays right.
 */
export async function followEventWindow(supabase, event) {
  if (!event?.id || event.kind !== "measure") return;
  const window = windowFromEvent(event);
  if (!window) return;
  const { error } = await supabase
    .from(BOOKINGS)
    .update({ ...window, updated_at: new Date().toISOString() })
    .eq("calendar_event_id", event.id)
    .eq("status", AWAITING_PAYMENT);
  if (error) console.error(`[payment-link] could not move the unpaid booking for ${event.id}: ${error.message}`);
}

/**
 * Take a hand-made measure off the money side when the calendar cancels it.
 * Only an unpaid one: a paid one is settled through the site measure cancel,
 * which decides between a refund and a credit.
 */
export async function cancelAwaitingForEvent(supabase, eventId) {
  if (!eventId) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(BOOKINGS)
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancellation_outcome: "unpaid",
      cancellation_reason: "Calendar booking cancelled before it was paid.",
      updated_at: now,
    })
    .eq("calendar_event_id", eventId)
    .eq("status", AWAITING_PAYMENT);
  if (error) console.error(`[payment-link] could not close the unpaid booking for ${eventId}: ${error.message}`);
}

