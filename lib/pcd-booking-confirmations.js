// ASKING THE CUSTOMER WHETHER TOMORROW STILL SUITS.
//
// ── THE SILENCE THIS FILLS ───────────────────────────────────────────────────
//
// A booking on the calendar is our opinion of what is happening tomorrow.
// Nobody has ever asked the person we are driving to. So a van goes out to a
// house where nobody is home, or to an address we never held, and the first
// anyone knows is the driver ringing from the kerb.
//
// A day before every trip out, the customer is asked. They confirm or they
// decline, and either way the booking, the Outlook event and sales@ are told.
//
// ── WHAT IS ASKED ABOUT, AND WHAT IS NOT ─────────────────────────────────────
//
// Only a real trip out, and only one booked HERE. See ASKABLE_KINDS.
//
// A reminder is a note to ourselves and has nobody to ask. An entry typed
// straight into Outlook is skipped for a blunter reason: the sales mailbox
// calendar holds everything anybody puts in it, including meetings that are not
// customer visits at all, and asking sales@ to confirm each of those would bury
// the ones that matter under the ones that do not.
//
// ── SILENCE MUST NEVER BE AMBIGUOUS ──────────────────────────────────────────
//
// "They have not answered" and "we never managed to ask" look identical on a
// calendar that only stores the answer, and they need opposite responses from
// us. confirm_state carries the difference and the calendar reads it back in
// plain words, the same way it already does for the Outlook sync.
//
// A send that fails emails sales@ AT ONCE, because that is the only one of
// these that is actionable the moment it lands. A send that works emails
// nobody: it would be three quarters of the traffic and none of the value, and
// what it would actually be reporting is that Resend accepted a message, which
// is not the same as it arriving.
//
// ── CLAIM FIRST, THEN SEND ───────────────────────────────────────────────────
//
// Two passes overlapping must not both email the same customer. The row is
// claimed with a conditional update that only succeeds from 'not_asked', and
// only the winner sends. A crash between claiming and sending leaves a booking
// marked asked that was not, which the morning list surfaces; the other order
// round would send twice, which the customer sees.

import { randomBytes } from "crypto";
import {
  ASKABLE_KINDS,
  bookingKindLabel,
  formatDay,
  formatMinutes,
  perthDayOf,
  perthMinutesOf,
} from "./pcd-calendar";

const EVENTS = "pcd_calendar_events";

// Defined in lib/pcd-calendar.js and re-exported here, so the server side of
// this feature reads it from the file it belongs to. See the note there for why
// it cannot live in this one: the calendar screen is a client component and this
// file imports crypto.
export { ASKABLE_KINDS };

/** How far ahead the ask goes out, and how close is too close to bother. */
export const ASK_WINDOW_HOURS = 24;
export const TOO_LATE_HOURS = 2;

/** Nothing is emailed to a customer outside these Perth hours. */
export const QUIET_BEFORE_MINUTES = 7 * 60;
export const QUIET_AFTER_MINUTES = 20 * 60;

const HOUR_MS = 3600000;

/** URL safe and unguessable. Same shape as a public design session code. */
export function generateConfirmToken() {
  return randomBytes(12).toString("base64url");
}

/**
 * Is this a booking we ask about at all?
 *
 * Nothing about timing here. This is "would we ever", which the morning list
 * needs as well as the sweep.
 */
export function isAskable(row) {
  if (!row) return false;
  if (row.status !== "booked") return false;
  if (!ASKABLE_KINDS.has(row.kind)) return false;
  // Booked here. An entry that arrived from the mailbox calendar is not ours to
  // put in front of anybody. See the note at the top.
  return row.source === "pcd";
}

/** Is now a reasonable hour to be landing in somebody's inbox? */
export function withinSendingHours(now = new Date()) {
  const minutes = perthMinutesOf(now);
  return minutes >= QUIET_BEFORE_MINUTES && minutes < QUIET_AFTER_MINUTES;
}

/**
 * Is this booking inside the window where the ask should go?
 *
 * Anything closer than TOO_LATE_HOURS is left alone on purpose. At that range
 * an email is not the right instrument and a phone call is.
 */
export function isDueToAsk(row, now = new Date()) {
  if (!isAskable(row)) return false;
  if (row.confirm_state !== "not_asked") return false;
  const starts = new Date(row.starts_at).getTime();
  if (Number.isNaN(starts)) return false;
  const hoursAway = (starts - now.getTime()) / HOUR_MS;
  return hoursAway <= ASK_WINDOW_HOURS && hoursAway > TOO_LATE_HOURS;
}

/**
 * What this booking is short of.
 *
 * The page asks for exactly these and refuses to confirm without them, and the
 * sales email lists them. One definition, so a field the page insisted on
 * cannot be a field the email forgot to mention.
 *
 * A CONTACT NAME IS NEVER MISSING FOR A LINKED CUSTOMER, because their name is
 * on the record. It is still asked for, pre-filled, so they can nominate
 * somebody else to be met on the day.
 */
export function missingFor(row) {
  return {
    mobile: !String(row?.contact_mobile || "").trim(),
    address: !String(row?.site_address || "").trim(),
    contact: !String(row?.contact_name || row?.customer_name || "").trim(),
  };
}

/** The same list in words, for an email. "a mobile number and an address". */
export function missingWords(row, { linked = true } = {}) {
  const missing = missingFor(row);
  const words = [];
  if (missing.mobile) words.push("a mobile number");
  if (missing.address) words.push("an address");
  if (!linked) words.push("a customer record");
  else if (missing.contact) words.push("a contact name");
  return words;
}

/** "a, b and c". */
export function andList(items = []) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * How a booking reads on a calendar and in an email.
 *
 * ONE DEFINITION OF THE WORDS. The customer email, the sales email, the
 * confirmation page and the admin panel all say the date and time the same way,
 * because four copies of this drift and the customer ends up holding an email
 * that disagrees with the page it links to.
 */
export function bookingWhen(row) {
  const day = perthDayOf(row.starts_at);
  const startMinutes = perthMinutesOf(row.starts_at);
  const endMinutes = perthMinutesOf(row.ends_at);

  if (row.all_day) {
    return {
      dayLong: formatDay(day, { long: true }),
      dayShort: formatDay(day),
      // An all day booking has no start time worth printing, and "at 12:00 am"
      // is worse than saying nothing. It gets a shape of day instead.
      startTime: "",
      timeRange: "Any time during the day",
      allDay: true,
    };
  }

  return {
    dayLong: formatDay(day, { long: true }),
    dayShort: formatDay(day),
    startTime: formatMinutes(startMinutes),
    timeRange: `${formatMinutes(startMinutes)} to ${formatMinutes(endMinutes)}`,
    allDay: false,
  };
}

/** "Site measure". The label a customer reads. */
export function kindLabel(row) {
  return bookingKindLabel(row?.kind);
}

/**
 * Claim the ask for this booking.
 *
 * Returns the claimed row, or null when somebody else got there first. The
 * conditional update IS the lock: only a row still sitting at 'not_asked' can
 * be moved, so two passes arriving together produce one email.
 */
export async function claimAsk(supabase, row, { token, now = new Date() } = {}) {
  const { data, error } = await supabase
    .from(EVENTS)
    .update({
      confirm_state: "asked",
      confirm_asked_at: now.toISOString(),
      confirm_error: null,
      confirm_token: row.confirm_token || token || generateConfirmToken(),
    })
    .eq("id", row.id)
    .eq("confirm_state", "not_asked")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(`[booking-confirm] could not claim ${row.id}: ${error.message}`);
    return null;
  }
  return data || null;
}

/** Record that the ask reached the provider, and who it went to. */
export async function markAsked(supabase, row, sentTo) {
  const { error } = await supabase
    .from(EVENTS)
    .update({ confirm_sent_to: sentTo || null, confirm_error: null })
    .eq("id", row.id);
  if (error) console.error(`[booking-confirm] could not stamp ${row.id}: ${error.message}`);
}

/**
 * Record that the ask did not go out.
 *
 * The state goes to 'failed' rather than back to 'not_asked'. Returning it
 * would have the next pass try again in an hour and fail again in the same way,
 * quietly, forever. Failed is visible, and a person retries it.
 */
export async function markAskFailed(supabase, row, reason) {
  const { error } = await supabase
    .from(EVENTS)
    .update({ confirm_state: "failed", confirm_error: String(reason || "").slice(0, 500) })
    .eq("id", row.id);
  if (error) console.error(`[booking-confirm] could not record the failure on ${row.id}: ${error.message}`);
}

/**
 * Write an answer onto the booking.
 *
 * Everything the customer supplied lands in the same update as the answer, so a
 * confirmation can never be recorded without the details that were required to
 * give it.
 */
export async function recordAnswer(supabase, row, { answer, answeredBy, notes, contactName, mobile, siteAddress }) {
  const patch = {
    confirm_state: answer === "confirmed" ? "confirmed" : "declined",
    confirm_answered_at: new Date().toISOString(),
    confirm_answered_by: String(answeredBy || "").trim() || null,
    confirm_notes: String(notes || "").trim() || null,
    // Pushing this back through the sync is what puts the flag on the Outlook
    // event. See eventFromRow in lib/pcd-graph-calendar.js.
    sync_state: row.sync_state === "skipped" ? "skipped" : "pending",
  };

  const name = String(contactName || "").trim();
  const number = String(mobile || "").trim();
  const address = String(siteAddress || "").trim();
  if (name) patch.contact_name = name;
  if (number) patch.contact_mobile = number;
  // Never overwritten. The address agreed for a visit is not replaced by
  // something typed on a page, and the page only asks when it is blank anyway.
  if (address && !String(row.site_address || "").trim()) patch.site_address = address;

  const { data, error } = await supabase
    .from(EVENTS)
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data };
}

/**
 * Fill blanks on the customer record with what they just told us.
 *
 * BLANKS ONLY, and nothing else ever. A number already on file was put there by
 * somebody who had a reason, and a page like this is not the place to overrule
 * them. Nothing here may fail the answer: the booking is already saved.
 */
export async function fillCustomerBlanks(supabase, customerId, { mobile, street, suburb, postcode }) {
  if (!supabase || !customerId) return;
  try {
    const { data: customer } = await supabase
      .from("pcd_customers")
      .select("id, phone, site_street, site_suburb, site_postcode")
      .eq("id", customerId)
      .maybeSingle();
    if (!customer) return;

    const patch = {};
    const blank = (value) => !String(value || "").trim();
    if (mobile && blank(customer.phone)) patch.phone = mobile;
    if (street && blank(customer.site_street)) patch.site_street = street;
    if (suburb && blank(customer.site_suburb)) patch.site_suburb = suburb;
    if (postcode && blank(customer.site_postcode)) patch.site_postcode = postcode;

    if (!Object.keys(patch).length) return;
    await supabase.from("pcd_customers").update(patch).eq("id", customerId);
  } catch (error) {
    console.error(`[booking-confirm] could not fill blanks on customer ${customerId}: ${error?.message || error}`);
  }
}

/** The address as one line, from the three boxes the page asks for. */
export function joinAddress({ street, suburb, postcode }) {
  const tail = [String(suburb || "").trim(), String(postcode || "").trim()].filter(Boolean).join(" ");
  return [String(street || "").trim(), tail].filter(Boolean).join(", ");
}

/** Where the customer's link points. */
export function confirmUrl(baseUrl, token) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/bookings/confirm?code=${encodeURIComponent(token || "")}`;
}

/**
 * What the calendar says about the ask, in the words a person would use.
 *
 * Read by the admin panel. The point of this function is that "not answered"
 * and "never asked" come out as visibly different sentences.
 */
export function confirmSummary(row) {
  if (!row) return "";
  if (!isAskable(row)) {
    return row.source === "outlook"
      ? "Not asked, this one came from Outlook"
      : "Not asked, we only ask about measures, deliveries and installs";
  }
  switch (row.confirm_state) {
    case "confirmed":
      return "Confirmed by the customer";
    case "declined":
      return "Declined by the customer";
    case "asked":
      return row.confirm_sent_to ? `Asked, waiting on ${row.confirm_sent_to}` : "Asked, waiting";
    case "failed":
      return `Could not ask: ${row.confirm_error || "the email did not go out"}`;
    default:
      return "Not asked yet";
  }
}
