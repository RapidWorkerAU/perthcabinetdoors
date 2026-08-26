// A BOOKING, WRITTEN INTO THE ORDER'S HISTORY.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// A delivery or an install being booked is the single thing a customer most
// wants to hear, and it was the one event the weekly update report could not
// see: bookings live in pcd_calendar_events and never touched
// pcd_order_activity, so there was no event to read and no line to send. It was
// on the list of things we agreed to report and it had never been built.
//
// ── ONLY WHAT A CUSTOMER WOULD CARE ABOUT ────────────────────────────────────
//
// A site measure, a delivery and an install are all things somebody has to be
// home for. A reminder is a note to ourselves, and "something else" is by
// definition not a thing we can describe, so neither is recorded here. See
// BOOKED_KINDS.
//
// ── A BOOKING WITH NO ORDER IS NOT AN ORDER UPDATE ───────────────────────────
//
// The calendar can hold a booking against a quote, a quote request, or nothing
// at all. Only one against an actual order belongs in that order's history.
//
// ── IT MUST NEVER FAIL THE BOOKING ───────────────────────────────────────────
//
// The booking is saved before this runs and every function here swallows its
// own errors. A history line that could not be written is a missing line; it is
// not a reason for the calendar to refuse a booking.

import { bookingKindLabel } from "./pcd-calendar";
import { logOrderActivity } from "./pcd-activity-log";

/**
 * The kinds worth telling a customer about.
 *
 * A reminder is ours. "Other" has no description we could safely put in front
 * of somebody, because whoever typed it was not writing for a customer.
 */
export const BOOKED_KINDS = new Set(["measure", "delivery", "install"]);

const dayOf = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

/**
 * Record that a booking was made, moved or cancelled.
 *
 * The description is phrased the way every other activity row is, "X changed
 * from A to B", because lib/pcd-weekly-updates.js reads these back and one
 * wording means one parser.
 *
 * @param {object} supabase
 * @param {object} booking  the saved pcd_calendar_events row
 * @param {object} [options]
 * @param {'created'|'moved'|'cancelled'} [options.action]
 * @param {object} [options.previous]  the row before, for a move
 */
export async function logBookingActivity(supabase, booking, { action = "created", previous = null } = {}) {
  try {
    if (!booking?.order_id) return;
    if (!BOOKED_KINDS.has(String(booking.kind || ""))) return;

    const label = bookingKindLabel(booking.kind);
    const when = dayOf(booking.starts_at);
    const before = dayOf(previous?.starts_at);

    // Nothing actually moved. Saving a booking without touching its date is a
    // note or a title edit, and an order history that says "Delivery changed
    // from 12 September to 12 September" is noise.
    if (action === "moved" && before === when) return;

    const description =
      action === "cancelled"
        ? `${label} changed from ${when || "booked"} to cancelled`
        : action === "moved"
          ? `${label} changed from ${before || "blank"} to ${when}`
          : `${label} changed from blank to ${when}`;

    await logOrderActivity(supabase, {
      order_id: booking.order_id,
      customer_id: booking.customer_id || null,
      quote_id: booking.quote_id || null,
      actor_type: "admin",
      action_type: "order_booking_updated",
      title:
        action === "cancelled"
          ? `${label} cancelled`
          : action === "moved"
            ? `${label} moved`
            : `${label} booked`,
      description,
      metadata: {
        booking_id: booking.id,
        kind: booking.kind,
        starts_at: booking.starts_at || null,
        previous_starts_at: previous?.starts_at || null,
        all_day: Boolean(booking.all_day),
      },
      // One row per booking per state, so a save that runs twice does not write
      // the same line into the history twice.
      event_key: `booking:${booking.id}:${action}:${when || "none"}`,
    });
  } catch (error) {
    // The booking is already saved. This is the history, not the appointment.
    console.error(`[booking-activity] could not record ${action} on booking ${booking?.id}: ${error?.message || error}`);
  }
}
