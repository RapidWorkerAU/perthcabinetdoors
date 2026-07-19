"use client";

// Mobile "price on the run" costing. Reuses the desktop cut list (the exact
// pieces the left panel shows) and prices each piece with the SAME per-sqm
// rates the quote import uses, so the estimate matches what actually gets
// quoted:
//   - carcass sides/top/bottom + back + finished panels + kickboard/filler
//                                    -> cost_per_sqm_carcass
//   - shelves                        -> cost_per_sqm_shelf (fallback carcass)
//   - doors                          -> door_style.cost_per_sqm
//   - drawer fronts                  -> drawer_style.cost_per_sqm
// (see app/api/admin/design/projects/[projectId]/import/route.js — the source
// of truth for how each element is costed.)
import { computeCutList } from "../DesignLeftPanel";

// Which per-sqm rate applies to a cut-list piece, by its material tag.
function rateFor(material, rates) {
  switch (material) {
    case "shelf":
      return rates.shelf;
    case "door":
      return rates.door;
    case "drawer":
      return rates.drawer;
    case "panel":
      // Finished end/side/back/underside panels — their own finishing-panel
      // material (defaults to the door rate, then carcass).
      return rates.panel;
    default:
      // undefined (carcass sides/top/bottom), "back", "kickboard", "filler".
      return rates.carcass;
  }
}

// Human-friendly cost grouping for the price page.
export function categoryFor(material) {
  switch (material) {
    case "shelf": return "Shelves";
    case "door": return "Doors";
    case "drawer": return "Drawer fronts";
    case "panel": return "Finished panels";
    case "scribe": return "Scribes";
    case "kickboard": return "Kickboards";
    case "filler": return "Filler panels";
    case "back": return "Carcass";
    default: return "Carcass";
  }
}

// Stable display order for the price categories — the ones you usually keep in
// a refresh first, Carcass (the usual thing to drop) last.
export const PRICE_CATEGORIES = [
  "Doors", "Drawer fronts", "Finished panels", "Scribes", "Kickboards", "Filler panels", "Shelves", "Carcass",
];

function ratesFor(item) {
  const carcass = Number(item?.cost_per_sqm_carcass) || 0;
  const door = Number(item?.door_style?.cost_per_sqm) || 0;
  return {
    carcass,
    shelf: Number(item?.cost_per_sqm_shelf) || carcass,
    door,
    drawer: Number(item?.drawer_style?.cost_per_sqm) || 0,
    // Finishing panels: own material rate, else the door rate (their default
    // match), else carcass.
    panel: Number(item?.finish_panel_style?.cost_per_sqm) || door || carcass,
  };
}

/**
 * Full pricing breakdown for a cabinet item.
 * Returns { rows, categories, total, rates } where each row carries its area,
 * qty, per-sqm rate and line cost so the UI can show every piece priced.
 */
export function cabinetPricing(item, roomItems = [], room = null) {
  if (!item) return { rows: [], categories: [], total: 0, rates: ratesFor(item) };

  const rates = ratesFor(item);
  const pieces = computeCutList(item, roomItems, room);

  const rows = pieces.map((p) => {
    const areaSqm = ((Number(p.dim1) || 0) * (Number(p.dim2) || 0)) / 1_000_000;
    const qty = Number(p.qty) || 1;
    const rate = rateFor(p.material, rates);
    return { ...p, qty, areaSqm, rate, cost: areaSqm * qty * rate };
  });

  const catMap = new Map();
  for (const r of rows) {
    const key = categoryFor(r.material);
    catMap.set(key, (catMap.get(key) || 0) + r.cost);
  }
  const categories = [...catMap.entries()].map(([name, cost]) => ({ name, cost }));

  const total = rows.reduce((s, r) => s + r.cost, 0);
  return { rows, categories, total, rates };
}

/**
 * Pricing for a standalone panel or scribe placed on its own on the plan (not
 * a per-cabinet finishing panel). Priced as face area × the item's own $/m²
 * rate — the exact maths the quote import uses:
 *   - a panel stores its face WIDTH in depth_mm (width_mm is the on-edge
 *     thickness), so its face is depth_mm × height_mm;
 *   - a scribe keeps its along-wall span in width_mm, so its face is
 *     width_mm × height_mm.
 * Returns the same shape as cabinetPricing so the price UI can treat every
 * priced item uniformly. Non panel/scribe items return an empty breakdown.
 */
export function standaloneItemPricing(item) {
  const empty = { rows: [], categories: [], total: 0, rates: {} };
  if (!item) return empty;
  const isPanel = item.item_type === "panel";
  const isScribe = item.item_type === "scribe";
  if (!isPanel && !isScribe) return empty;

  const faceW = isPanel ? Number(item.depth_mm) || 0 : Number(item.width_mm) || 0;
  const height = Number(item.height_mm) || 0;
  const qty = Number(item.qty) || 1;
  const rate = Number(item.unit_cost_per_sqm_ex_gst) || 0;
  const areaSqm = (faceW * height) / 1_000_000;
  const cost = areaSqm * qty * rate;
  const material = isScribe ? "scribe" : "panel";

  const rows = [{
    name: isScribe ? "Scribe" : "Panel",
    dim1: faceW, axis1: "W", dim2: height, axis2: "H",
    material, qty, areaSqm, rate, cost,
  }];
  return { rows, categories: [{ name: categoryFor(material), cost }], total: cost, rates: {} };
}

// Price any plan item — a cabinet (full cut list) or a standalone panel/scribe
// — with one call, so the price strip and modal can iterate a mixed list.
export function itemPricing(item, roomItems = [], room = null) {
  if (item?.item_type === "panel" || item?.item_type === "scribe") {
    return standaloneItemPricing(item);
  }
  return cabinetPricing(item, roomItems, room);
}

// Convenience: just the material-cost total (used by the price strip).
export function cabinetMaterialCost(item, roomItems = [], room = null) {
  return cabinetPricing(item, roomItems, room).total;
}

// Material-cost total for any item with a set of excluded categories removed —
// so the price strip and the price modal agree while the user toggles what's
// "in scope". Handles cabinets and standalone panels/scribes. Pass a Set of
// category names (from categoryFor / PRICE_CATEGORIES); empty/omitted means the
// full total.
export function includedItemCost(item, roomItems = [], room = null, excludedCategories = null) {
  const { rows } = itemPricing(item, roomItems, room);
  if (!excludedCategories || excludedCategories.size === 0) {
    return rows.reduce((s, r) => s + r.cost, 0);
  }
  return rows.reduce(
    (s, r) => (excludedCategories.has(categoryFor(r.material)) ? s : s + r.cost),
    0,
  );
}

