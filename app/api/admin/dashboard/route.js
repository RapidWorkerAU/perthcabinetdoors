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
      supabase.from("pcd_quotes").select("*", { count: "exact", head: true }).in("status", ["draft", "sent", "viewed"]),
      supabase.from("pcd_quote_requests").select("*", { count: "exact", head: true }).in("status", ["new", "reviewing"]),
      supabase.from("pcd_orders").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("pcd_orders").select("*", { count: "exact", head: true }).eq("status", "on_hold"),
      supabase.from("pcd_enquiries").select("id, customer_name, customer_email, topic, created_at, status").eq("status", "new").order("created_at", { ascending: false }).limit(5),
      supabase.from("pcd_quote_requests").select("id, customer_name, customer_email, source, created_at, status").in("status", ["new", "reviewing"]).order("created_at", { ascending: false }).limit(5),
      supabase.from("pcd_orders").select("id, order_number, customer_name, status, total_ex_gst, currency, created_at").eq("status", "on_hold").order("created_at", { ascending: false }).limit(5),
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
