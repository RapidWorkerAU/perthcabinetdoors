import { requireAdminApiContext } from "../../../../lib/admin-api";
import { loadAllListItems } from "../../../../lib/pcd-list-load";
import {
  LIST_ITEMS_TABLE,
  cleanExtras,
  groupByList,
  isListKey,
  itemKeyFrom,
  normaliseListItem,
  validateNewItem,
} from "../../../../lib/pcd-lists";

// THE LISTS SCREEN, and the only way to add to one.
//
// ── THERE IS NO DELETE ON THIS ROUTE, OR ANY OTHER ───────────────────────────
//
// Not an oversight. Records already hold these values, and removing an item
// would leave an order from last year saying nothing about what went wrong with
// it. An item is switched off instead, through PATCH on [id], which stops it
// being offered without touching anything that refers to it.
//
// ── ADDING SOMETHING ALREADY THERE IS REFUSED, NOT DUPLICATED ────────────────
//
// Typing a name that matches a switched off item is almost always somebody
// wanting it back rather than wanting two of it, so the refusal says exactly
// that. The unique index on (list_key, item_key) is the backstop underneath.

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { items, fellBack } = await loadAllListItems(context.supabase);
    return Response.json({
      ok: true,
      lists: groupByList(items),
      // Said out loud rather than left to be discovered by a save that fails.
      // Falling back means the migration has not been run, and every edit on
      // the screen would go nowhere.
      readOnly: fellBack,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load the lists." }, { status: 500 });
  }
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json().catch(() => ({}));
    const listKey = String(payload.list_key || "");
    if (!isListKey(listKey)) {
      return Response.json({ ok: false, error: "That is not a list you can add to." }, { status: 400 });
    }

    // Read first, so the duplicate check is against what is actually there
    // rather than against the built-ins this list started life with.
    const { data: existing, error: readError } = await context.supabase
      .from(LIST_ITEMS_TABLE)
      .select("*")
      .eq("list_key", listKey);
    if (readError) throw readError;

    const held = (existing || []).map(normaliseListItem);
    const errors = validateNewItem(listKey, payload, held);
    if (Object.keys(errors).length) {
      return Response.json({ ok: false, errors, error: Object.values(errors)[0] }, { status: 400 });
    }

    const label = String(payload.label).trim();
    // NEW ITEMS LAND AT THE BOTTOM, and stay there until they are dragged. A
    // new option quietly appearing above the one everybody picks would change
    // what gets chosen by accident.
    const lastSort = held.reduce((highest, item) => Math.max(highest, item.sort_order), -10);

    const { data: saved, error } = await context.supabase
      .from(LIST_ITEMS_TABLE)
      .insert({
        list_key: listKey,
        item_key: itemKeyFrom(label),
        label,
        sort_order: lastSort + 10,
        is_active: true,
        is_builtin: false,
        extras: cleanExtras(listKey, payload.extras),
      })
      .select("*")
      .single();
    if (error) throw error;

    return Response.json({ ok: true, item: normaliseListItem(saved) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not add that item." },
      { status: error?.status || 500 }
    );
  }
}
