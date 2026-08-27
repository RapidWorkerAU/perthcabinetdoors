import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { LIST_ITEMS_TABLE, isListKey } from "../../../../../lib/pcd-lists";

// THE ORDER OF ONE LIST, rewritten in a single call.
//
// ── WHY THE WHOLE LIST AND NOT THE MOVED ITEM ────────────────────────────────
//
// Dragging one row changes where every row below it sits. Sending just the
// moved item would mean the screen and the database each working out the new
// numbers separately, and the first time they disagreed the order would settle
// somewhere neither of them showed.
//
// So the screen sends the ids in the order it is displaying, and this writes
// that order. What you let go of is what gets saved.
//
// Renumbered from scratch in tens, so an item can be dropped between two later
// without renumbering the whole list again.

export const dynamic = "force-dynamic";

export async function PUT(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json().catch(() => ({}));
    const listKey = String(payload.list_key || "");
    const ids = Array.isArray(payload.ids) ? payload.ids.filter(Boolean) : [];

    if (!isListKey(listKey)) {
      return Response.json({ ok: false, error: "That is not a list you can reorder." }, { status: 400 });
    }
    if (!ids.length) {
      return Response.json({ ok: false, error: "Nothing to reorder." }, { status: 400 });
    }

    // EVERY WRITE SCOPED TO THE LIST AS WELL AS THE ID. An id from another list
    // arriving in this array would otherwise be given a position in a list it
    // does not belong to, and it would show up there.
    for (let index = 0; index < ids.length; index += 1) {
      const { error } = await context.supabase
        .from(LIST_ITEMS_TABLE)
        .update({ sort_order: index * 10, updated_at: new Date().toISOString() })
        .eq("id", ids[index])
        .eq("list_key", listKey);
      if (error) throw error;
    }

    return Response.json({ ok: true, count: ids.length });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save the new order." },
      { status: error?.status || 500 }
    );
  }
}
