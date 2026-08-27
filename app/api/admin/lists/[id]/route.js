import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { LIST_ITEMS_TABLE, cleanExtras, normaliseListItem } from "../../../../../lib/pcd-lists";

// CHANGING ONE ITEM: its name, its settings, or whether it is offered.
//
// ── WHAT CANNOT BE CHANGED ───────────────────────────────────────────────────
//
// item_key and list_key. The key is the value written onto every record that
// has ever used this item, so changing it would orphan all of them at once,
// silently, with the screen showing a success message. The label is editable
// precisely so the key never has to be.
//
// There is no DELETE handler here, and that is the whole design. See
// ../route.js.

export const dynamic = "force-dynamic";

async function itemIdFrom(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await itemIdFrom(params);
    const payload = await request.json().catch(() => ({}));

    const { data: current, error: readError } = await context.supabase
      .from(LIST_ITEMS_TABLE)
      .select("*")
      .eq("id", id)
      .single();
    if (readError) throw readError;

    const patch = { updated_at: new Date().toISOString() };

    if (typeof payload.label === "string") {
      const label = payload.label.trim();
      if (label.length < 2) {
        return Response.json({ ok: false, error: "Give it a name." }, { status: 400 });
      }
      if (label.length > 80) {
        return Response.json({ ok: false, error: "That name is too long." }, { status: 400 });
      }
      patch.label = label;
    }

    // Explicit, not a toggle. A toggle sent twice by a double click undoes
    // itself and nobody can tell which way it landed.
    if (typeof payload.is_active === "boolean") patch.is_active = payload.is_active;

    if (payload.extras && typeof payload.extras === "object") {
      patch.extras = cleanExtras(current.list_key, { ...current.extras, ...payload.extras });
    }

    const { data: saved, error } = await context.supabase
      .from(LIST_ITEMS_TABLE)
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    return Response.json({ ok: true, item: normaliseListItem(saved) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save that item." },
      { status: error?.status || 500 }
    );
  }
}
