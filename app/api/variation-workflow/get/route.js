import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const accessCode = String(searchParams.get("code") || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();
    if (!accessCode) return Response.json({ ok: false, error: "Missing access code." }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { data: variation, error } = await supabase
      .from("pcd_order_variations")
      .select("*, pcd_order_variation_lines(*), pcd_orders(*)")
      .eq("access_code", accessCode)
      .maybeSingle();
    if (error || !variation) throw error || new Error("Variation not found.");

    const sourceItemIds = (variation.pcd_order_variation_lines || [])
      .map((line) => line.order_line_item_id)
      .filter(Boolean);
    if (sourceItemIds.length) {
      const { data: sourceItems, error: sourceItemsError } = await supabase
        .from("pcd_order_line_items")
        .select("*")
        .in("id", sourceItemIds);
      if (sourceItemsError) throw sourceItemsError;
      const sourceItemsById = new Map((sourceItems || []).map((item) => [item.id, item]));
      variation.pcd_order_variation_lines = (variation.pcd_order_variation_lines || []).map((line) => ({
        ...line,
        original_order_item: line.original_item_snapshot || sourceItemsById.get(line.order_line_item_id) || null,
      }));
    }

    if (variation.status === "sent" && !variation.viewed_at) {
      const now = new Date().toISOString();
      const { error: viewError } = await supabase
        .from("pcd_order_variations")
        .update({ viewed_at: now, status: "viewed" })
        .eq("id", variation.id);
      if (!viewError) {
        variation.viewed_at = now;
        variation.status = "viewed";
        await supabase.from("pcd_order_variation_actions").insert({ variation_id: variation.id, action: "viewed" });
        await logOrderActivity(supabase, {
          order_id: variation.order_id,
          quote_id: variation.pcd_orders?.quote_id || null,
          variation_id: variation.id,
          actor_type: "customer",
          action_type: "variation_viewed",
          title: "Variation viewed by customer",
          description: variation.variation_number,
          metadata: { variation_number: variation.variation_number },
          event_key: `variation:${variation.id}:viewed`,
        });
      }
    }

    return Response.json({ ok: true, variation });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load variation." }, { status: 500 });
  }
}
