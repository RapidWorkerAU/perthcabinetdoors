import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { quoteIdFromParams } from "../../_quote-line-save";

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);
    const payload = await request.json();
    const lineIds = Array.isArray(payload.line_ids) ? payload.line_ids.filter(Boolean) : [];
    const uniqueLineIds = new Set(lineIds);

    if (!lineIds.length || uniqueLineIds.size !== lineIds.length) {
      return Response.json({ ok: false, error: "Invalid quote line order." }, { status: 400 });
    }

    const parkingUpdates = await Promise.all(
      lineIds.map((lineId, index) =>
        context.supabase
          .from("pcd_quote_line_items")
          .update({ sort_order: -100000 - index })
          .eq("id", lineId)
          .eq("quote_id", quoteId)
      )
    );
    const parkingError = parkingUpdates.find((result) => result.error)?.error;
    if (parkingError) throw parkingError;

    const orderUpdates = await Promise.all(
      lineIds.map((lineId, index) =>
        context.supabase
          .from("pcd_quote_line_items")
          .update({ sort_order: index })
          .eq("id", lineId)
          .eq("quote_id", quoteId)
      )
    );
    const orderError = orderUpdates.find((result) => result.error)?.error;
    if (orderError) throw orderError;

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not reorder quote lines." }, { status: 500 });
  }
}
