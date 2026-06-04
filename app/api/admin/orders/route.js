import { requireAdminApiContext } from "../../../../lib/admin-api";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data, error } = await context.supabase
      .from("pcd_orders")
      .select("*, pcd_order_line_items(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ ok: true, orders: data || [] });
  } catch (error) {
    return Response.json({ ok: false, orders: [], setupRequired: true, error: error?.message || "Could not load orders." });
  }
}

