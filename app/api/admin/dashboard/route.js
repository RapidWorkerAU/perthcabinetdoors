import { requireAdminApiContext } from "../../../../lib/admin-api";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const { supabase } = context;

  try {
    const [
      { count: newEnquiries },
      { count: openQuotes },
      { count: pendingRequests },
      { count: activeOrders },
      { count: onHoldOrders },
      { data: recentEnquiries },
      { data: recentRequests },
      { data: recentOrders },
    ] = await Promise.all([
      supabase.from("pcd_enquiries").select("*", { count: "exact", head: true }).eq("status", "new"),
      // awaiting_deposit counts as an open quote. It is neither won nor lost:
      // the customer has said yes and the deposit has not arrived. Leaving it
      // out would make a quote disappear from the dashboard at the exact moment
      // somebody said yes to it.
      supabase
        .from("pcd_quotes")
        .select("*", { count: "exact", head: true })
        .in("status", ["draft", "sent", "viewed", "awaiting_deposit"]),
      supabase.from("pcd_quote_requests").select("*", { count: "exact", head: true }).in("status", ["new", "reviewing"]),
      supabase.from("pcd_orders").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("pcd_orders").select("*", { count: "exact", head: true }).eq("status", "on_hold"),
      supabase.from("pcd_enquiries").select("id, customer_name, customer_email, topic, created_at, status").eq("status", "new").order("created_at", { ascending: false }).limit(5),
      supabase.from("pcd_quote_requests").select("id, customer_name, customer_email, source, created_at, status").in("status", ["new", "reviewing"]).order("created_at", { ascending: false }).limit(5),
      // total_inc_gst, NOT total_ex_gst, and no currency column exists at all.
      // Both were wrong, so this whole query errored and the on hold list came
      // back empty. Nothing calls this route today, which is the only reason it
      // never showed: app/admin/dashboard/page.tsx does its own queries.
      supabase.from("pcd_orders").select("id, order_number, customer_name, status, total_inc_gst, created_at").eq("status", "on_hold").order("created_at", { ascending: false }).limit(5),
    ]);

    return Response.json({
      ok: true,
      stats: {
        newEnquiries:    newEnquiries    ?? 0,
        openQuotes:      openQuotes      ?? 0,
        pendingRequests: pendingRequests ?? 0,
        activeOrders:    activeOrders    ?? 0,
        onHoldOrders:    onHoldOrders    ?? 0,
      },
      needsAttention: {
        enquiries:     recentEnquiries  || [],
        quoteRequests: recentRequests   || [],
        ordersOnHold:  recentOrders     || [],
      },
    });
  } catch (err) {
    return Response.json({ ok: false, error: err?.message || "Could not load dashboard data." }, { status: 500 });
  }
}
