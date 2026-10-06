import { requireAdminApiContext } from "../../../../lib/admin-api";
import { addDays, bookingSaveMessage, isDay, perthToday, startOfWeek } from "../../../../lib/pcd-calendar";
import { createBooking } from "../../../../lib/pcd-calendar-save";
import { siteUrl } from "../../../../lib/pcd-stripe";

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

// Booking something new. The work is in lib/pcd-calendar-save.js, shared with
// Alfred, so a booking is made the same way whoever makes it: saved, pushed to
// Outlook, written into the order's history, and the customer asked to confirm
// when it is inside a day.
export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    const { event, sync, ask } = await createBooking(context.supabase, payload, { baseUrl: siteUrl(request.url) });
    return Response.json({ ok: true, event, sync, ask });
  } catch (error) {
    const status = error?.status || 500;
    return Response.json({ ok: false, error: status === 500 ? bookingSaveMessage(error) : error.message }, { status });
  }
}
