import { requireAdminApiContext } from "../../../../lib/admin-api";
import {
  addDays,
  bookingRowFromInput,
  isDay,
  perthToday,
  startOfWeek,
} from "../../../../lib/pcd-calendar";
import { pushBooking } from "../../../../lib/pcd-calendar-sync";
import { logBookingActivity } from "../../../../lib/pcd-booking-activity";

// What is on between two dates, and booking something new.
//
// ONE READ, TWO KINDS OF THING. Production runs come from pcd_orders and are
// never stored on the calendar; bookings come from pcd_calendar_events. Both go
// back in one response because the calendar needs them together, and two round
// trips would let the timeline draw itself half finished.
//
// The window is asked for by the page rather than fixed here, because the same
// route serves a six week timeline and, one day, a month.

export const dynamic = "force-dynamic";

// Orders that are cancelled or archived are not work that is coming, so they
// are never on the calendar. Finished ones are read and the page decides
// whether to show them, because "what did August look like" is a real question
// and the answer is on the server either way.
const CALENDAR_ORDER_STATUSES = ["pending_deposit", "active", "on_hold", "complete"];

const ORDER_FIELDS = [
  "id",
  "order_number",
  "name",
  "customer_id",
  "customer_name",
  "status",
  "scheduled_start_date",
  "production_lead_days",
  "target_completion_date",
  "labour_hours",
  "site_suburb",
].join(", ");

/** The window asked for, or a sensible six weeks from the start of this week. */
function windowFrom(url) {
  const today = perthToday();
  const from = isDay(url.searchParams.get("from"))
    ? String(url.searchParams.get("from")).slice(0, 10)
    : startOfWeek(today);
  const to = isDay(url.searchParams.get("to"))
    ? String(url.searchParams.get("to")).slice(0, 10)
    : addDays(from, 41);
  return to < from ? { from, to: from } : { from, to };
}

export async function GET(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { from, to } = windowFrom(new URL(request.url));

  try {
    // A run can start before the window and finish inside it, so orders cannot
    // be filtered on start date alone. Asking for anything that could possibly
    // reach the window and letting the page clip it is cheaper than the join
    // that would be needed to do it exactly, and there are hundreds of orders
    // rather than hundreds of thousands.
    const reachBack = addDays(from, -120);

    const [ordersQuery, eventsQuery] = await Promise.all([
      context.supabase
        .from("pcd_orders")
        .select(ORDER_FIELDS)
        .in("status", CALENDAR_ORDER_STATUSES)
        .is("archived_at", null)
        .or(`scheduled_start_date.gte.${reachBack},target_completion_date.gte.${from}`),
      context.supabase
        .from("pcd_calendar_events")
        .select("*")
        .neq("status", "cancelled")
        // Both ends, because an all day install booked on the last day of the
        // window still belongs in it.
        .gte("starts_at", `${addDays(from, -1)}T00:00:00Z`)
        .lte("starts_at", `${addDays(to, 1)}T23:59:59Z`)
        .order("starts_at", { ascending: true }),
    ]);

    if (ordersQuery.error) throw ordersQuery.error;
    if (eventsQuery.error) throw eventsQuery.error;

    return Response.json({
      ok: true,
      from,
      to,
      orders: ordersQuery.data || [],
      events: eventsQuery.data || [],
    });
  } catch (error) {
    return Response.json({
      ok: false,
      from,
      to,
      orders: [],
      events: [],
      setupRequired: true,
      error: error?.message || "Could not load the calendar.",
    });
  }
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    const { row, error: invalid } = bookingRowFromInput(payload);
    if (invalid) return Response.json({ ok: false, error: invalid }, { status: 400 });

    const { data, error } = await context.supabase
      .from("pcd_calendar_events")
      .insert(row)
      .select("*")
      .single();
    if (error) throw error;

    // SAVED FIRST, THEN SENT. The booking exists the moment it is saved, so a
    // slow or unreachable Microsoft delays the tick in Outlook and never the
    // booking itself. What happened is reported either way, so nothing can
    // quietly sit unsent.
    const sync = await pushBooking(context.supabase, data);

    const { data: fresh } = await context.supabase
      .from("pcd_calendar_events")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    // Into the ORDER's history too, so a delivery being booked reaches the
    // customer through the weekly update report. Bookings used to live only in
    // the calendar, which meant the one thing a customer most wants to hear was
    // the one thing the report could not see.
    await logBookingActivity(context.supabase, fresh || data, { action: "created" });

    return Response.json({ ok: true, event: fresh || data, sync });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save the booking." }, { status: 500 });
  }
}
