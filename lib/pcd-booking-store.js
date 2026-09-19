// READING AND WRITING SITE MEASURE BOOKINGS.
//
// The rules live in pcd-booking-settings.js and are pure. This is the half that
// touches the database, kept apart so the public page can import the rules
// without dragging a Supabase client into the browser bundle.
//
// ── THE COUNT IS THE WHOLE THING ─────────────────────────────────────────────
//
// Two people can reach the last slot in the same second. Counting in the
// browser, or counting and then writing, both hand the day to both of them. So
// a booking is WRITTEN FIRST as a hold, and the count includes live holds. The
// payment page opens against a row that already exists, and an unpaid hold
// gives the day back by itself when it expires.
//
// Nothing has to sweep for the website to be correct: the count ignores expired
// holds by reading the clock, so a sweep that never runs costs nothing but
// tidiness.

import {
  DEFAULT_BOOKING_SETTINGS,
  dayState,
  normalizeBookingSettings,
  windowForDay,
} from "./pcd-booking-settings";
import { addDays, perthInstant, perthToday } from "./pcd-calendar";
import { minutesOfTime } from "./pcd-booking-settings";

export const BOOKING_SETTINGS_ID = "site-measure";

/** How long a payment page holds a day. Long enough to pay, short enough to free up. */
export const HOLD_MINUTES = 20;

/** The statuses that occupy a place on a day. */
const OCCUPYING = ["holding", "booked"];

/**
 * The settings, or the built-in ones.
 *
 * A row that cannot be read falls back to DEFAULT_BOOKING_SETTINGS, which has
 * is_live false. So an unreadable settings row closes the booking page rather
 * than inventing an availability nobody configured. The safe direction for
 * something that takes money, and the opposite of what pricing does, where a
 * silent fallback to built-in rates was the bug.
 */
export async function getBookingSettings(supabase) {
  const { data, error } = await supabase
    .from("pcd_booking_settings")
    .select("*")
    .eq("id", BOOKING_SETTINGS_ID)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error(
        "[booking-settings] could not read pcd_booking_settings, so the booking page is closed:",
        error.message
      );
    }
    return normalizeBookingSettings(DEFAULT_BOOKING_SETTINGS);
  }
  return normalizeBookingSettings(data);
}

export async function saveBookingSettings(supabase, patch) {
  const next = normalizeBookingSettings(patch);
  const { data, error } = await supabase
    .from("pcd_booking_settings")
    .upsert({ id: BOOKING_SETTINGS_ID, ...next, updated_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw error;
  return normalizeBookingSettings(data);
}

/**
 * How many places each day has taken, between two days.
 *
 * Counts bookings AND live holds. A hold whose clock has run out is not
 * counted, so a day frees itself with nothing having to run.
 *
 * Office bookings count too: anything on the calendar as a measure occupies a
 * place, or the website would happily sell a day already full of work booked by
 * hand. That read is the second query here.
 */
export async function usedByDay(supabase, { from, to }) {
  const now = new Date().toISOString();
  const used = {};

  const { data: rows, error } = await supabase
    .from("pcd_site_measure_bookings")
    .select("booking_date, status, hold_expires_at")
    .gte("booking_date", from)
    .lte("booking_date", to)
    .in("status", OCCUPYING);
  if (error) throw error;

  for (const row of rows || []) {
    if (row.status === "holding" && (!row.hold_expires_at || row.hold_expires_at < now)) continue;
    used[row.booking_date] = (used[row.booking_date] || 0) + 1;
  }

  // MEASURES BOOKED IN THE OFFICE COUNT TOO.
  //
  // Without this the website would cheerfully sell a day already full of work
  // somebody put on the calendar by hand, and the first anyone would know is
  // two vans wanted in two suburbs at three o'clock.
  //
  // The ones that came from a booking row are skipped, or every website booking
  // would be counted twice: once as its booking and once as the calendar event
  // it created. Read as its own select rather than a join, because a PostgREST
  // join across an optional link is more trouble than one indexed read.
  const { data: ours } = await supabase
    .from("pcd_site_measure_bookings")
    .select("calendar_event_id")
    .gte("booking_date", from)
    .lte("booking_date", to)
    .not("calendar_event_id", "is", null);
  const oursById = new Set((ours || []).map((r) => r.calendar_event_id));

  const { data: eventRows } = await supabase
    .from("pcd_calendar_events")
    .select("id, starts_at, status")
    .eq("kind", "measure")
    .neq("status", "cancelled")
    .gte("starts_at", `${addDays(from, -1)}T00:00:00.000Z`)
    .lte("starts_at", `${addDays(to, 1)}T23:59:59.999Z`);

  for (const event of eventRows || []) {
    if (oursById.has(event.id)) continue;
    const day = perthDay(event.starts_at);
    if (!day || day < from || day > to) continue;
    used[day] = (used[day] || 0) + 1;
  }

  return used;
}

function perthDay(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(date);
}

/**
 * Claim a day, or say why not.
 *
 * WRITTEN BEFORE THE PAYMENT PAGE EXISTS. The row is the claim; the Stripe
 * session is opened against it afterwards. Doing it the other way round means
 * taking money for a day that filled up while the customer was typing their
 * card number.
 *
 * The check and the write are not atomic, so the check is done again after the
 * write and the row is withdrawn if it lost. That is the honest version: the
 * loser is told the day filled up and nothing was charged, because nothing had
 * been charged yet.
 */
export async function holdDay(supabase, settings, { day, customer }) {
  const today = perthToday();
  const window = windowForDay(settings, day);
  if (!window) {
    return { ok: false, error: "We are not out on that day. Please pick another." };
  }

  const before = await usedByDay(supabase, { from: day, to: day });
  if (dayState(settings, day, { today, used: before[day] || 0 }) !== "free") {
    return { ok: false, error: "That day has just filled up. Please pick another." };
  }

  const expires = new Date(Date.now() + HOLD_MINUTES * 60000).toISOString();
  const { data: booking, error } = await supabase
    .from("pcd_site_measure_bookings")
    .insert({
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone || null,
      site_street: customer.street || null,
      site_suburb: customer.suburb || null,
      site_postcode: customer.postcode || null,
      site_address: customer.address || null,
      notes: customer.notes || null,
      booking_date: day,
      window_from: window.from,
      window_to: window.to,
      status: "holding",
      hold_expires_at: expires,
      fee_amount: Number(settings.fee_inc_gst) || 0,
    })
    .select("*")
    .single();
  if (error) throw error;

  // THE SECOND LOOK. Two holds written in the same instant both passed the
  // check above; this is where one of them finds out. Ordering by created_at
  // means the earlier row wins, which is the only tiebreak a customer would
  // accept if it were ever explained to them.
  const after = await usedByDay(supabase, { from: day, to: day });
  if ((after[day] || 0) > Math.max(1, Number(settings.max_per_day) || 1)) {
    const { data: holders } = await supabase
      .from("pcd_site_measure_bookings")
      .select("id, created_at")
      .eq("booking_date", day)
      .in("status", OCCUPYING)
      .order("created_at", { ascending: true });
    const winners = new Set((holders || []).slice(0, Number(settings.max_per_day) || 1).map((r) => r.id));
    if (!winners.has(booking.id)) {
      await supabase
        .from("pcd_site_measure_bookings")
        .update({ status: "expired", hold_expires_at: null, updated_at: new Date().toISOString() })
        .eq("id", booking.id);
      return { ok: false, error: "That day filled up while you were booking. Please pick another." };
    }
  }

  return { ok: true, booking };
}

/** The instants a booking's window covers, for the calendar event it becomes. */
export function bookingInstants(booking) {
  const from = minutesOfTime(String(booking.window_from).slice(0, 5));
  const to = minutesOfTime(String(booking.window_to).slice(0, 5));
  return {
    startsAt: perthInstant(booking.booking_date, from ?? 540),
    endsAt: perthInstant(booking.booking_date, to ?? 600),
  };
}

/** Holds that were never paid. Tidiness only: the count already ignores them. */
export async function expireStaleHolds(supabase) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("pcd_site_measure_bookings")
    .update({ status: "expired", updated_at: now })
    .eq("status", "holding")
    .lt("hold_expires_at", now)
    .select("id");
  if (error) throw error;
  return (data || []).length;
}
