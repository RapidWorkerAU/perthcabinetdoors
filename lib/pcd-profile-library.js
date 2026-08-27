// READING AND WRITING THE PROFILE LIBRARY.
//
// The same job pcd-colour-library.js does for boards: one place that knows how
// a profile row is shaped, so the admin screen, the finishes page and anything
// added later cannot each invent their own version of it.
//
// ── WHY THE HARDCODED LISTS ARE STILL THERE ──────────────────────────────────
//
// lib/quote-form-data.js still drives the QUOTE FORM. Moving that over is a
// separate job with real risk: those lists also carry the 21mm rules that decide
// which profiles can be quoted against which board, and the quote editor
// validates against them on every save.
//
// So for now the library is the source for DISPLAY and for managing the
// catalogue, and the lists are the source for quoting. Two sources is a state
// worth being uneasy about, which is why test/profile-library.test.mjs asserts
// they hold the same profiles: they cannot drift without a test failing.

import { normaliseSupplierName } from "./pcd-colour-library";

export const PROFILE_KINDS = [
  { key: "door", label: "Door profile" },
  { key: "edge", label: "Edge profile" },
];

export const PROFILE_LIBRARY_SUPPLIERS = ["Polytec", "Laminex"];

export function profileKindLabel(key) {
  return PROFILE_KINDS.find((entry) => entry.key === key)?.label || "Door profile";
}

/**
 * Every profile, ordered the way the admin screen and the public page show them.
 *
 * `throwOnError` is off by default because the public finishes page must render
 * with whatever it can get: a library that cannot be read should cost the page
 * its profiles, not the whole page. The admin screen passes true, because a
 * manager who cannot see the catalogue needs to be told why rather than shown an
 * empty table that looks like an empty catalogue.
 */
export async function getProfileLibraryRows(supabase, { throwOnError = false, kind = null } = {}) {
  let query = supabase
    .from("pcd_profile_library")
    .select("*")
    .order("supplier_name", { ascending: true })
    .order("sort_order", { ascending: true });
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;
  if (error) {
    if (throwOnError) throw error;
    console.error("[profile-library] could not be read, so the page has no profiles: " + error.message);
    return [];
  }
  return data || [];
}

/** What the row editor sends back, cleaned. */
export function profileLibraryRowFromDraft(draft = {}) {
  const text = (value) => {
    const trimmed = String(value ?? "").trim();
    return trimmed || null;
  };
  return {
    kind: draft.kind === "edge" ? "edge" : "door",
    // Normalised, and then KEPT. This used to fall back to "Polytec" whenever
    // the brand was not in a hardcoded list, which silently rewrote a profile
    // the moment anybody opened it for editing. Profile suppliers are a list
    // you can add to in Settings now, so an unrecognised one is far more likely
    // to be a supplier somebody just set up than a mistake, and the safe answer
    // is to leave it exactly as it is. Same fix as the colour library.
    supplier_name: normaliseSupplierName(draft.supplier_name) || "Polytec",
    category: text(draft.category) || "Uncategorised",
    name: text(draft.name) || "",
    image_url: text(draft.image_url),
    image_path: text(draft.image_path),
    available_18mm: draft.available_18mm !== false,
    available_21mm: draft.available_21mm !== false,
    is_active: draft.is_active !== false,
    sort_order: Number.isFinite(Number(draft.sort_order)) ? Number(draft.sort_order) : 0,
    notes: text(draft.notes),
  };
}

/**
 * What is wrong with this row, as sentences.
 *
 * A profile with no name cannot be picked, and one available in neither
 * thickness cannot be made, so both are refused. A missing image is allowed:
 * plenty of real profiles have never had a photo and blocking on it would stop
 * somebody recording a profile they can already sell.
 */
export function profileLibraryGaps(row = {}) {
  const gaps = [];
  if (!String(row.name || "").trim()) gaps.push("a name");
  if (!String(row.category || "").trim()) gaps.push("a category");
  if (row.available_18mm === false && row.available_21mm === false) {
    gaps.push("at least one board thickness, or it cannot be made at all");
  }
  return gaps;
}

/** The categories in use, per supplier, so the editor can offer them. */
export function categoriesBySupplier(rows = [], kind = "door") {
  const found = new Map();
  (rows || [])
    .filter((row) => row.kind === kind)
    .forEach((row) => {
      if (!found.has(row.supplier_name)) found.set(row.supplier_name, []);
      const list = found.get(row.supplier_name);
      if (row.category && !list.includes(row.category)) list.push(row.category);
    });
  return found;
}
