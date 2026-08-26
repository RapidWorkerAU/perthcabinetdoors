import { requireAdminApiContext } from "../../../../../lib/admin-api";

// THE JOBS A CUSTOMER ACTUALLY HAS, for the booking modal's job dropdown.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// The modal used to list the `orders` the calendar page already had loaded,
// unfiltered. So choosing Rebecca Casey offered Ian Brennan's raw profiled
// doors: every order on the board, for everyone, under a customer who had none.
// Picking one would have filed a site measure against a stranger's job.
//
// Filtering that list client side would fix the wrong names but not the missing
// ones. The calendar loads orders inside a date window, for drawing production
// bars, so a customer's older order is not in it at all. This asks the question
// properly instead.
//
// ── QUOTES AS WELL AS ORDERS ─────────────────────────────────────────────────
//
// A site measure is usually booked BEFORE there is an order, which is the whole
// reason bookings live in their own table. Offering orders only meant the most
// common booking in the business had nothing to attach to.

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const customerId = new URL(request.url).searchParams.get("customerId") || "";
    // No customer means no jobs, not every job. Returning the lot on a blank id
    // is how the original bug would come back.
    if (!UUID.test(customerId)) return Response.json({ ok: true, jobs: [] });

    const [orders, quotes] = await Promise.all([
      context.supabase
        .from("pcd_orders")
        .select("id, order_number, name, status, site_address, created_at")
        .eq("customer_id", customerId)
        .neq("status", "cancelled")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("pcd_quotes")
        .select("id, quote_number, title, status, site_address, created_at, order_id")
        .eq("customer_id", customerId)
        .not("status", "in", '("rejected","archived")')
        .order("created_at", { ascending: false }),
    ]);
    if (orders.error) throw orders.error;
    if (quotes.error) throw quotes.error;

    const jobs = [
      ...(orders.data || []).map((order) => ({
        kind: "order",
        id: order.id,
        reference: order.order_number,
        name: order.name || "",
        status: order.status,
        siteAddress: order.site_address || "",
      })),
      // EVERY QUOTE TOO, including one that has already become an order. A
      // measure is booked against a quote and an install against an order, so
      // both have to be offerable. A quote that became an order says so on its
      // own row rather than being hidden, because hiding it makes a job the
      // person is looking straight at simply not appear.
      ...(quotes.data || []).map((quote) => ({
        kind: "quote",
        id: quote.id,
        reference: quote.quote_number,
        name: quote.title || "",
        status: quote.status,
        becameOrder: Boolean(quote.order_id),
        siteAddress: quote.site_address || "",
      })),
    ];

    return Response.json({ ok: true, jobs });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not load that customer's jobs." },
      { status: 500 }
    );
  }
}
