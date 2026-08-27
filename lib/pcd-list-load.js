// READING THE LISTS, wherever they are needed.
//
// Split from lib/pcd-lists.js so that file stays pure and testable with no
// database anywhere near it. This is the half that talks to Supabase.
//
// ── A MISSING TABLE IS NOT AN ERROR ──────────────────────────────────────────
//
// Until the migration has been run there is no pcd_list_items, and the honest
// answer then is the built-in items rather than a screen that will not load or
// a dropdown with nothing in it. Same rule the quote terms library follows.
//
// The same fallback covers a read that fails for any other reason. A dropdown
// that silently empties is worse than one showing the seven options it has
// always shown, because an empty dropdown looks like a decision somebody made.

import { LISTS, LIST_ITEMS_TABLE, builtinItems, normaliseListItem } from "./pcd-lists";

export function isMissingListsTable(error) {
  const message = String(error?.message || "");
  return error?.code === "42P01" || (message.includes(LIST_ITEMS_TABLE) && /does not exist|schema cache/i.test(message));
}

/**
 * Every item of every list, in order.
 *
 * @returns {Promise<{items: Array, fellBack: boolean}>} fellBack says the rows
 *          came from the code rather than the database, so a screen can say so
 *          instead of quietly offering something it cannot save changes to.
 */
export async function loadAllListItems(supabase) {
  const { data, error } = await supabase
    .from(LIST_ITEMS_TABLE)
    .select("*")
    .order("list_key", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error || !data) {
    if (!isMissingListsTable(error)) {
      console.error(`[lists] could not be read: ${error?.message || "no rows returned"}`);
    }
    return { items: LISTS.flatMap((list) => builtinItems(list.key)), fellBack: true };
  }

  return { items: data.map(normaliseListItem), fellBack: false };
}

/**
 * One list's items, in order, including the switched off ones.
 *
 * The caller decides what to do with the inactive ones, because a dropdown and
 * an admin screen want different things and only the dropdown knows which value
 * the record it is editing already holds. See optionsFor in lib/pcd-lists.js.
 */
export async function loadListItems(supabase, listKey) {
  const { data, error } = await supabase
    .from(LIST_ITEMS_TABLE)
    .select("*")
    .eq("list_key", listKey)
    .order("sort_order", { ascending: true });

  if (error || !data?.length) {
    if (error && !isMissingListsTable(error)) {
      console.error(`[lists] ${listKey} could not be read: ${error.message}`);
    }
    return builtinItems(listKey);
  }

  return data.map(normaliseListItem);
}
