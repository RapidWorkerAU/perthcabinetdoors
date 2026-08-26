import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { COUNTED_ORDER_STATUSES, materialsReport } from "../../../../../lib/pcd-report-materials";

// Colours and materials: what we actually sell, counted in pieces.
//
// Read only. Nothing on this page changes anything.

export const dynamic = "force-dynamic";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const url = new URL(request.url);
    let from = url.searchParams.get("from") || "";
    let to = url.searchParams.get("to") || "";
    if ((from && !ISO_DAY.test(from)) || (to && !ISO_DAY.test(to))) {
      return Response.json({ ok: false, error: "Give the dates as YYYY-MM-DD." }, { status: 400 });
    }
    if (from && to && from > to) [from, to] = [to, from];

    // The orders whose pieces were actually made. A cancelled order's doors say
    // nothing about what to hold.
    let orderQuery = context.supabase
      .from("pcd_orders")
      .select("id, accepted_at, created_at")
      .in("status", COUNTED_ORDER_STATUSES);
    if (from) orderQuery = orderQuery.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) orderQuery = orderQuery.lte("created_at", `${to}T23:59:59.999Z`);

    const { data: orders, error: ordersError } = await orderQuery;
    // THROWN, not swallowed. A failed lookup would render as a confident empty
    // report, and nobody doubts an empty report.
    if (ordersError) throw ordersError;

    const ids = (orders || []).map((order) => order.id);
    if (!ids.length) {
      return Response.json({ ok: true, ...materialsReport([]), from, to, orders: 0 });
    }

    const { data: items, error: itemsError } = await context.supabase
      .from("pcd_order_line_items")
      .select("order_id, qty, colour, finish, material, fulfilment_method, line_total_ex_gst, variation_status")
      .in("order_id", ids);
    if (itemsError) throw itemsError;

    return Response.json({ ok: true, ...materialsReport(items || []), from, to, orders: ids.length });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not build the materials report." },
      { status: 500 }
    );
  }
}
