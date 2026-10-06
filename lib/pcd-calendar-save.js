// BOOKING, MOVING AND CANCELLING A CALENDAR ITEM.
//
// Moved here from app/api/admin/calendar/route.js and [id]/route.js, unchanged,
// so the calendar page and Alfred book the same way: the same checks
// (bookingRowFromInput), the same Outlook push, the same line on the order's
// history, and the same "please confirm" ask to the customer for a measure,
// delivery or install inside a day. A booking Alfred makes is exactly the
// booking a person would have made. The only difference is who the history
// says did it.

import { bookingRowFromInput, bookingSaveMessage } from "./pcd-calendar";
import { pushBooking } from "./pcd-calendar-sync";
import { logBookingActivity } from "./pcd-booking-activity";
import { askOnSave } from "./pcd-booking-confirmation-sweep";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

async function freshRow(supabase, id) {
  const { data } = await supabase.from("pcd_calendar_events").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * Book something new.
 * @returns { event, sync, ask }
 */
export async function createBooking(supabase, input, { baseUrl = "", actorType = "admin", approvedBy = "" } = {}) {
  const { row, error: invalid } = bookingRowFromInput(input);
  if (invalid) throw fail(invalid);

  const { data, error } = await supabase.from("pcd_calendar_events").insert(row).select("*").single();
  if (error) throw fail(bookingSaveMessage(error), 500);

  // SAVED FIRST, THEN SENT. The booking exists the moment it is saved, so a
  // slow or unreachable Microsoft delays the tick in Outlook and never the
  // booking itself. What happened is reported either way, so nothing can
  // quietly sit unsent.
  const sync = await pushBooking(supabase, data);
  const fresh = (await freshRow(supabase, data.id)) || data;

  // Into the ORDER's history too, so a delivery being booked reaches the
  // customer through the weekly update report.
  await logBookingActivity(supabase, fresh, { action: "created", actorType, approvedBy });

  // BOOKED INSIDE THE WINDOW, SO ASKED NOW. The hourly pass would find this
  // within the hour, which is too late for a booking made at two for tomorrow
  // morning. The pass and this share one claim on the row, so only one sends.
  // Never allowed to fail the booking.
  const ask = await askOnSave(supabase, fresh, baseUrl);
  return { event: fresh, sync, ask };
}

/**
 * Change a booking. The payload is the whole booking as the form shows it;
 * anything not sent falls back to what is stored.
 * @returns { event, sync, ask, previous }
 */
export async function updateBooking(supabase, id, payload, { baseUrl = "", actorType = "admin", approvedBy = "" } = {}) {
  const { data: existing, error: readError } = await supabase.from("pcd_calendar_events").select("*").eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (!existing) throw fail("That booking no longer exists.", 404);

  // NOT SENT AND SENT EMPTY ARE DIFFERENT THINGS on the links below. The form
  // sends an empty job when somebody moves a booking from an order to a quote,
  // or takes the customer off it, and `??` read that as "nothing sent" and put
  // the old link straight back. `sent(...)` keeps an empty answer as the answer.
  const sent = (value, stored) => (value === undefined ? stored : value || null);

  const { row, error: invalid } = bookingRowFromInput({
    kind: payload.kind ?? existing.kind,
    title: payload.title ?? existing.title,
    day: payload.day,
    startMinutes: payload.startMinutes,
    minutes: payload.minutes,
    allDay: payload.allDay ?? existing.all_day,
    customerId: sent(payload.customerId, existing.customer_id),
    customerName: payload.customerName ?? existing.customer_name,
    orderId: sent(payload.orderId, existing.order_id),
    quoteId: sent(payload.quoteId, existing.quote_id),
    quoteRequestId: sent(payload.quoteRequestId, existing.quote_request_id),
    siteAddress: payload.siteAddress ?? existing.site_address,
    notes: payload.notes ?? existing.notes,
    status: payload.status ?? existing.status,
    // A booking already in Outlook stays in Outlook unless somebody says
    // otherwise, so an edit never quietly takes it off the mailbox calendar.
    addToOutlook: payload.addToOutlook ?? existing.sync_state !== "skipped",
  });
  if (invalid) throw fail(invalid);

  // An event that came from Outlook keeps its source. Editing it here still
  // pushes the change back, because it has an Outlook id to push against.
  const { data, error } = await supabase
    .from("pcd_calendar_events")
    .update({ ...row, sync_state: row.sync_state === "skipped" ? "skipped" : "pending" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw fail(bookingSaveMessage(error), 500);

  // A booking that MOVED goes into the order's history. `existing` is the row
  // before the update, which is what makes the two dates comparable.
  await logBookingActivity(supabase, data, { action: "moved", previous: existing, actorType, approvedBy });

  const sync = await pushBooking(supabase, data);
  const fresh = (await freshRow(supabase, id)) || data;

  // MOVED INTO THE WINDOW, SO ASKED AGAIN NOW. A time change clears any answer
  // already given (a database trigger), so it may need a fresh ask straight away.
  const ask = await askOnSave(supabase, fresh, baseUrl);
  return { event: fresh, sync, ask, previous: existing };
}

/**
 * Cancel a booking. The row is kept and marked cancelled; the Outlook event is
 * removed, because a cancelled visit still in the calendar is how somebody
 * drives to Sorrento for nothing.
 */
export async function cancelBooking(supabase, id, { actorType = "admin", approvedBy = "" } = {}) {
  const { data, error } = await supabase.from("pcd_calendar_events").update({ status: "cancelled" }).eq("id", id).select("*").single();
  if (error) throw error;
  await logBookingActivity(supabase, data, { action: "cancelled", actorType, approvedBy });
  const sync = await pushBooking(supabase, data);
  return { event: data, sync };
}
