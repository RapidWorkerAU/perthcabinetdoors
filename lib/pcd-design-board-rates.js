// Price a design's boards from the colour library, at the moment it is quoted.
//
// WHY THIS EXISTS. A design item carries its board rate as a number copied onto
// it when somebody picked the colour (`cost_per_sqm` on a style,
// `cost_per_sqm_carcass` on a cabinet). That copy is made once and never looked
// at again, which went wrong in two directions:
//
//   - MISSING. Most items carry no rate at all: the colour was picked before it
//     had a price, or came from a preset, or the price was entered in the
//     library afterwards. Of the door styles in the database, 35 of 74 carry no
//     rate. Those imported at $0.
//   - STALE. A design drawn before a price rise kept the old rate, so a quote
//     could go out at last month's board price with nothing to say so.
//
// Meanwhile the OTHER way a design becomes a quote, a customer's design
// converted from a quote request, looks the price up properly through
// lib/pcd-board-cost.js. Same design, two answers.
//
// So the library is the price, every time, and this is where that happens: once,
// before anything is costed or warned about, so the preview, the warnings and
// the committed quote all see the same numbers.
//
// WHAT STILL BEATS THE LIBRARY. A manual override. "Manual (override)" on a
// cabinet's Boards tab, or on a standalone item, is somebody deciding the rate
// for this job: a one-off board, a special order, a negotiated price. That is
// not a stale number, it is an instruction, and it is left alone.
//
// WHAT HAPPENS WHEN THE LIBRARY HAS NO PRICE. Nothing. The rate on the item
// stays as it is, whether that is a real number or a zero. Much of the library
// has no cost against it yet and those lines are costed by hand at quote time,
// which is normal, so a missing price is never a reason to wipe out a rate that
// somebody put there.
//
// Every change is reported back, with the rate it replaced, so the Stage Quote
// preview can show what moved before anyone commits it.

import { matchBoardCost } from "./pcd-board-cost";

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// A style object as the design tool stores it, in the shape the resolver wants.
function specFromStyle(style = {}, fallback = {}) {
  return {
    colourLibraryId: style.colour_library_id || null,
    material: style.material || fallback.material || "",
    thickness: style.thickness_mm || fallback.thickness || "",
    finish: style.finish || fallback.finish || "",
    colour: style.colour || fallback.colour || "",
    supplier: style.supplier || style.supplier_name || "",
  };
}

// Every style column on an item that is a board with a price. The benchtop is
// not here: it is priced from the benchtop material list, not the colour
// library, and has its own rate field.
const STYLE_KEYS = [
  "door_style",
  "drawer_style",
  "finish_panel_style",
  "kickboard_style",
  "filler_panel_style",
  "bottom_panel_style",
  "back_panel_style",
  "top_panel_style",
  "end_left_style",
  "end_right_style",
];

/**
 * @param {object} item      a pcd_design_items row
 * @param {(spec: object) => object} resolveBoard  from createBoardCostResolver
 * @param {boolean} isCabinet whether this item is priced from a cut list
 * @returns {{item: object, priced: Array<{what: string, rate: number, previous: number, changed: boolean, from: string}>}}
 */
export function withLibraryBoardRates(item, resolveBoard, { isCabinet = false } = {}) {
  if (!item || typeof resolveBoard !== "function") return { item, priced: [] };

  const next = { ...item };
  const priced = [];

  const rateFor = (spec) => {
    const match = resolveBoard(spec);
    return match?.ok && amount(match.costPerSqmExGst) ? match : null;
  };

  const record = (what, previous, match) => {
    priced.push({
      what,
      rate: match.costPerSqmExGst,
      previous: amount(previous),
      changed: amount(previous) > 0 && amount(previous) !== match.costPerSqmExGst,
      from: match.label,
    });
  };

  // The item's own board: the carcass of a cabinet, or the board a standalone
  // panel / floating shelf / shelf & rail is cut from.
  const ownThickness = item.carcass_thickness_mm || item.panel_thickness_mm || item.thickness || "";
  const ownSpec = {
    colourLibraryId: item.colour_library_id || null,
    material: item.material || "",
    thickness: ownThickness,
    finish: item.finish || "",
    colour: item.colour || "",
    supplier: item.supplier_name || "",
  };

  const carcassMatch = rateFor(ownSpec);
  if (carcassMatch && carcassMatch.costPerSqmExGst !== amount(next.cost_per_sqm_carcass)) {
    record(isCabinet ? "carcass" : "board", next.cost_per_sqm_carcass, carcassMatch);
    next.cost_per_sqm_carcass = carcassMatch.costPerSqmExGst;
  }

  const shelfMatch = rateFor({
    colourLibraryId: item.shelf_colour_library_id || null,
    material: item.shelf_material || item.material || "",
    thickness: item.shelf_thickness_mm || ownThickness,
    finish: item.shelf_finish || item.finish || "",
    colour: item.shelf_colour || item.colour || "",
    supplier: item.shelf_supplier_name || item.supplier_name || "",
  });
  if (shelfMatch && shelfMatch.costPerSqmExGst !== amount(next.cost_per_sqm_shelf)) {
    record("shelves", next.cost_per_sqm_shelf, shelfMatch);
    next.cost_per_sqm_shelf = shelfMatch.costPerSqmExGst;
  }

  // A standalone item prices off unit_cost_per_sqm_ex_gst. On a CABINET that
  // same column is the "manual (override)" rate. Either way, manual means
  // somebody set this rate on purpose for this job, so it is never replaced.
  if (!isCabinet && item.unit_cost_mode !== "manual") {
    if (carcassMatch && carcassMatch.costPerSqmExGst !== amount(next.unit_cost_per_sqm_ex_gst)) {
      record("board", next.unit_cost_per_sqm_ex_gst, carcassMatch);
      next.unit_cost_per_sqm_ex_gst = carcassMatch.costPerSqmExGst;
    }
  }

  for (const key of STYLE_KEYS) {
    const style = item[key];
    if (!style || typeof style !== "object") continue;
    // A style with no material of its own is one that matches the item's board
    // rather than a board in its own right, so it is resolved against that.
    const match = rateFor(specFromStyle(style, { material: item.material, thickness: ownThickness, finish: item.finish, colour: item.colour }));
    if (!match || match.costPerSqmExGst === amount(style.cost_per_sqm)) continue;
    record(key.replace(/_style$/, "").replace(/_/g, " "), style.cost_per_sqm, match);
    next[key] = { ...style, cost_per_sqm: match.costPerSqmExGst };
  }

  return { item: next, priced };
}

/**
 * The same, over a whole project's items.
 *
 * @param {Array} items
 * @param {Array} libraryRows   active pcd_colour_library rows
 * @param {(item: object) => boolean} isCabinet
 */
export function withLibraryBoardRatesForAll(items = [], libraryRows = [], isCabinet = () => false) {
  const resolveBoard = (spec) => matchBoardCost(libraryRows, spec);
  const priced = [];
  const next = items.map((item) => {
    const result = withLibraryBoardRates(item, resolveBoard, { isCabinet: isCabinet(item) });
    result.priced.forEach((entry) => priced.push({ itemId: item.id, label: item.label || "", ...entry }));
    return result.item;
  });
  return { items: next, priced };
}
