import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { saveOrderItem } from "../../../../../../../lib/pcd-order-item-save";

// One order item's planning, from the order page. The work is in
// lib/pcd-order-item-save.js, shared with Alfred, so a change saves the same
// way whoever makes it.

async function idsFromParams(params) {
  const resolved = await params;
  return { id: resolved?.id, itemId: resolved?.itemId };
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id, itemId } = await idsFromParams(params);
    const payload = await request.json();
    const { item } = await saveOrderItem(context.supabase, id, itemId, payload, { actorType: "admin" });
    return Response.json({ ok: true, item });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update order item." }, { status: error?.status || 500 });
  }
}
