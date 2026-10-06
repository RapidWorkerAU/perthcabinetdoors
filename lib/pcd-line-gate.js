// THE LINE GATE: A BOARD ON A LINE MUST BE A BOARD IN THE LIBRARY.
//
// ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────────
//
// Every screen that builds a line narrows its dropdowns: material, then the
// thicknesses that material comes in, then the brands that stock it, then that
// brand's colours. A person clicking through can only ever land on a real
// board. But the narrowing lived in the browser. The server took whatever words
// it was handed for material, supplier, thickness, finish and colour, so any
// path that was not a person clicking (an import, a design transfer, a stale
// tab, and soon Alfred) could write a board that does not exist. That is how
// the design tool once sent lowercase materials and blank types into quotes.
//
// This runs the same narrowing on the server, from the same libraries, so the
// dropdowns are the ease and this is the guarantee.
//
// ── WHAT IT CHECKS, AND ONLY WHEN SOMETHING CHANGED ──────────────────────────
//
// A new line is checked in full. An existing line is checked only on the board
// fields that changed. Lines saved before this existed may hold boards that are
// no longer in the library; they keep opening and saving as they are, and the
// data check report lists them so they can be fixed by hand. Refusing to save a
// quantity change because of a colour typed two years ago would punish the wrong
// person for the wrong thing.
//
// Anything blank is left alone. A half-built line is somebody mid-thought, and
// whether a line is complete enough to send is a different rule (lineGaps).
//
// ── IT TIDIES AS WELL AS REFUSES ─────────────────────────────────────────────
//
// "decorative board", "18 mm" and "polytec" are the right board written the
// wrong way. Those come back as a patch in the library's own spelling rather
// than a refusal. The library row the board resolves to is stamped as the
// line's source, so the line points at the exact row it was priced from, and a
// leftover row id that no longer describes the board is cleared rather than
// trusted. See matchBoardCost for why a contradicting id is a leftover.

import { MATERIAL_LABELS, PRODUCT_TYPES, materialsForProductType, THICKNESS_BY_LABEL } from "./pcd-materials";
import { normaliseColourMaterialKey } from "./pcd-colour-library";
import { colourWithoutFinishPrefix, thicknessMm } from "./pcd-board-cost";
import { supplierConflicts } from "./pcd-supplier-selection";
import { getDatabaseColourRows } from "./pcd-colour-library";
import { getProfileLibraryRows } from "./pcd-profile-library";
import { ORDER_LINE_STATUSES as ORDER_LINE_STATUSES_LIST, ORDER_PRODUCTION_STAGES as ORDER_PRODUCTION_STAGES_LIST } from "./pcd-quote-utils";

const BOARD_FIELDS = ["product_type", "material", "supplier_name", "thickness", "finish", "colour", "unit_cost_source_id"];

const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();

/** Which board fields differ from what was saved before. Every field for a new line. */
export function changedBoardFields(line = {}, before = null) {
  if (!before) return new Set(BOARD_FIELDS);
  return new Set(BOARD_FIELDS.filter((field) => lower(line[field]) !== lower(before[field])));
}

function materialLabelFor(value) {
  const want = lower(value);
  return MATERIAL_LABELS.find((label) => label.toLowerCase() === want) || "";
}

function rowsFor(rows, { material, thickness, supplier }) {
  const materialKey = normaliseColourMaterialKey(material);
  const wantThickness = thicknessMm(thickness);
  return rows.filter((row) => {
    if (row.is_active === false) return false;
    if (normaliseColourMaterialKey(row.material_type) !== materialKey) return false;
    if (wantThickness && thicknessMm(row.thickness) !== wantThickness) return false;
    if (supplier && lower(row.supplier_name || "Polytec") !== lower(supplier)) return false;
    return true;
  });
}

/**
 * Check one line's board against the colour library.
 *
 * Pure, so it is tested without a database.
 *
 * @param line    the line about to be saved
 * @param before  the line as it is saved now, or null for a new line
 * @returns { problems: string[], patch: object }
 *          problems  sentences somebody can act on; any one refuses the save
 *          patch     spelling fixes and the library row id, to apply before saving
 */
export function checkLineBoard(line = {}, before = null, { colourRows = [], profileRows = [] } = {}) {
  const problems = [];
  // The same problems with the field each one is about, for callers that
  // settle a line rather than refuse it. See settleImportedLine.
  const faults = [];
  const fault = (field, message) => { problems.push(message); faults.push({ field, message }); };
  const patch = {};
  const changed = changedBoardFields(line, before);
  const touched = (field) => changed.has(field);

  // The brand rule has always applied to every save, changed or not. Kept
  // exactly as it was. See lib/pcd-supplier-guard.js.
  supplierConflicts(line, { colourRows, profileRows }).forEach((message) => fault("brand", message));

  const rawMaterial = text(line.material);
  if (!rawMaterial) return { problems, faults, patch };

  const boardTouched = ["product_type", "material", "supplier_name", "thickness", "finish", "colour", "unit_cost_source_id"].some(touched);
  if (!boardTouched) return { problems, faults, patch };

  // ── MATERIAL ────────────────────────────────────────────────────────────
  const material = materialLabelFor(rawMaterial);
  if (!material) {
    fault("material", `${rawMaterial} is not one of our materials. Pick one of: ${MATERIAL_LABELS.join(", ")}.`);
    return { problems, faults, patch };
  }
  if (material !== rawMaterial) patch.material = material;

  const type = text(line.product_type);
  if (type && PRODUCT_TYPES.includes(type) && (touched("product_type") || touched("material"))) {
    const allowed = materialsForProductType(type);
    if (!allowed.includes(material)) {
      fault("material", allowed.length
        ? `A ${type.toLowerCase()} cannot be made from ${material}. Pick one of: ${allowed.join(", ")}.`
        : `A ${type.toLowerCase()} line has no board material. Clear the material.`);
      return { problems, faults, patch };
    }
  }

  // ── THICKNESS ───────────────────────────────────────────────────────────
  const rawThickness = text(line.thickness);
  let thickness = rawThickness;
  if (rawThickness) {
    const offered = THICKNESS_BY_LABEL[material] || [];
    // Exact first, then by the number, so "18 mm" and "18" are 18mm. The number
    // only counts when there is one: 0.7mm reads as 0 and must match as written.
    const bare = (value) => lower(value).replace(/\s+/g, "").replace(/mm$/, "");
    const canonical = offered.find((option) => bare(option) === bare(rawThickness))
      || (thicknessMm(rawThickness) > 0 ? offered.find((option) => thicknessMm(option) === thicknessMm(rawThickness)) : undefined);
    if (!canonical) {
      if (touched("thickness") || touched("material")) {
        fault("thickness", `${material} does not come in ${rawThickness}. Pick one of: ${offered.join(", ")}.`);
        return { problems, faults, patch };
      }
    } else {
      thickness = canonical;
      if (canonical !== rawThickness) patch.thickness = canonical;
    }
  }

  // ── SUPPLIER ────────────────────────────────────────────────────────────
  const rawSupplier = text(line.supplier_name);
  let supplier = rawSupplier;
  if (rawSupplier && (touched("supplier_name") || touched("material"))) {
    const stocking = rowsFor(colourRows, { material });
    const brand = [...new Set(stocking.map((row) => row.supplier_name || "Polytec"))].find((name) => lower(name) === lower(rawSupplier));
    if (!brand) {
      const brands = [...new Set(stocking.map((row) => row.supplier_name || "Polytec"))].sort();
      fault("supplier_name", `${rawSupplier} has no ${material} in the colour library.${brands.length ? ` Pick one of: ${brands.join(", ")}.` : ""}`);
      return { problems, faults, patch };
    }
    supplier = brand;
    if (brand !== rawSupplier) patch.supplier_name = brand;
  }

  // ── COLOUR AND FINISH ───────────────────────────────────────────────────
  const rawFinish = text(line.finish);
  const rawColour = text(colourWithoutFinishPrefix(line.colour, rawFinish));
  const colourTouched = ["colour", "finish", "material", "thickness", "supplier_name", "unit_cost_source_id"].some(touched);
  if (!rawColour) {
    // No colour, so no row. A row id left behind would claim a board the line
    // no longer names.
    if (line.unit_cost_source_id && colourTouched) patch.unit_cost_source_id = null;
    return { problems, faults, patch };
  }
  if (!colourTouched) return { problems, faults, patch };

  const pool = rowsFor(colourRows, { material, thickness, supplier });
  const byColour = pool.filter((row) => lower(row.name) === lower(rawColour));
  const matches = rawFinish ? byColour.filter((row) => lower(row.finish_type) === lower(rawFinish)) : byColour;

  if (!matches.length) {
    const where = [supplier, material, thickness].filter(Boolean).join(" ");
    if (byColour.length && rawFinish) {
      const finishes = [...new Set(byColour.map((row) => row.finish_type).filter(Boolean))];
      fault("finish", `${rawColour} is not made in ${rawFinish} for ${where}. It comes in: ${finishes.join(", ")}.`);
    } else {
      fault("colour", `${rawColour} is not in the colour library for ${where}. Pick a colour from the list.`);
    }
    return { problems, faults, patch };
  }

  // The library's own spelling.
  if (matches[0].name !== rawColour) patch.colour = matches[0].name;
  const finishes = [...new Set(matches.map((row) => text(row.finish_type)).filter(Boolean))];
  if (rawFinish && finishes.length === 1 && finishes[0] !== rawFinish) patch.finish = finishes[0];

  // ── THE ROW IT IS ───────────────────────────────────────────────────────
  //
  // One row: that is the board, so the line points at it. Several (the same
  // colour from two brands, the line naming neither): keep a row id only if it
  // is one of them, otherwise clear it rather than pick.
  const currentId = line.unit_cost_source_id || null;
  if (matches.length === 1) {
    if (currentId !== matches[0].id) patch.unit_cost_source_id = matches[0].id;
  } else if (currentId && !matches.some((row) => row.id === currentId)) {
    patch.unit_cost_source_id = null;
  }

  return { problems, faults, patch };
}

/**
 * Load the libraries once and return a checker, for any path saving lines.
 * One read per request, however many lines it saves.
 */
export async function createLineGate(supabase) {
  const [colourRows, profileRows] = await Promise.all([
    getDatabaseColourRows(supabase, { activeOnly: true }),
    getProfileLibraryRows(supabase),
  ]);
  const check = (line, before = null) => checkLineBoard(line, before, { colourRows, profileRows });
  check.colourRows = colourRows;
  check.profileRows = profileRows;
  return check;
}

/**
 * Check and tidy a line, or throw a 400 naming the first problem.
 * Returns the line with the patch applied.
 */
export function passLineThroughGate(check, line, before = null, { label = "" } = {}) {
  const { problems, patch } = check(line || {}, before);
  if (problems.length) {
    const refusal = new Error(label ? `${label}: ${problems[0]}` : problems[0]);
    refusal.status = 400;
    refusal.problems = problems;
    throw refusal;
  }
  return { ...line, ...patch };
}

// WHAT EACH KIND OF FAULT TAKES WITH IT. A board is read top down, so a wrong
// material makes everything under it meaningless, and a wrong colour only the
// colour and what was priced from it.
const CLEARS = {
  material: ["material", "thickness", "supplier_name", "finish", "colour", "unit_cost_source_id"],
  thickness: ["thickness", "finish", "colour", "unit_cost_source_id"],
  supplier_name: ["supplier_name", "finish", "colour", "unit_cost_source_id"],
  finish: ["finish", "colour", "unit_cost_source_id"],
  colour: ["finish", "colour", "unit_cost_source_id"],
  brand: ["colour", "profile", "edge_mould", "unit_cost_source_id"],
};

/**
 * AN IMPORTED LINE IS SETTLED, NOT REFUSED.
 *
 * An order form, a quote request or a design is somebody else's work arriving
 * in bulk. Refusing all of it over one colour would lose the rest, and keeping
 * the colour would put a board the library has never heard of on a quote. So
 * the bad value is taken off the line, the words it said are kept in the
 * line's internal note, and the caller reports it. The line is then visibly
 * incomplete, which is what it is.
 *
 * @returns { line, notes } notes are the sentences to report
 */
export function settleImportedLine(check, line = {}) {
  let current = { ...line };
  const notes = [];
  // At most one pass per field: each pass clears at least one thing.
  for (let pass = 0; pass < 6; pass += 1) {
    const { faults, patch } = check(current, null);
    current = { ...current, ...patch };
    if (!faults.length) break;
    const { field, message } = faults[0];
    notes.push(message);
    (CLEARS[field] || []).forEach((key) => {
      current[key] = key === "unit_cost_source_id" ? null : "";
    });
  }
  if (notes.length) {
    const said = notes.map((note) => `Not kept on import: ${note}`).join("\n");
    current.notes = [String(line.notes || "").trim(), said].filter(Boolean).join("\n");
    // AND WHAT WAS PRICED FROM THAT BOARD. Every fault clears the colour, so the
    // board the rate came from is gone; keeping its rate would price a line
    // with no colour at a board that is no longer on it. Unpriced is honest:
    // it is priced by hand, the way a board with no library cost already is.
    for (const key of PRICED_FROM_BOARD) {
      if (Object.prototype.hasOwnProperty.call(current, key)) current[key] = key === "unit_cost_source_label" ? null : 0;
    }
  }
  return { line: current, notes };
}

/** What a line carries that was worked out from its board. */
export const PRICED_FROM_BOARD = ["unit_cost_per_sqm_ex_gst", "unit_cost_source_label", "cost_per_board_ex_gst", "calculated_unit_cost_ex_gst"];

// ── A CABINET'S OWN BOARDS ──────────────────────────────────────────────────
//
// A base cabinet line carries two more boards in its configuration: the carcass
// and the shelves. The configurator picks both from the colour library, and
// they were saved as typed. Each is checked the same way a line's board is,
// against what the configuration held before, so an old cabinet still saves.

const CABINET_BOARDS = [
  { name: "Carcass", material: "carcass_material", finish: "carcass_finish", colour: "carcass_colour", thickness: "carcass_thickness_mm" },
  { name: "Shelves", material: "shelf_material", finish: "shelf_finish", colour: "shelf_colour", thickness: "shelf_thickness_mm" },
];

function cabinetBoardAsLine(config = {}, board) {
  const mm = Number(config[board.thickness]) || 0;
  return {
    material: config[board.material] || "",
    finish: config[board.finish] || "",
    colour: config[board.colour] || "",
    thickness: mm ? `${mm}mm` : "",
  };
}

/**
 * Check a cabinet configuration's carcass and shelf boards.
 * @returns { problems, faults, patch } with the patch in configuration field names
 */
export function checkCabinetBoards(check, config = {}, before = null) {
  const problems = [];
  const faults = [];
  const patch = {};
  for (const board of CABINET_BOARDS) {
    const line = cabinetBoardAsLine(config, board);
    const was = before ? cabinetBoardAsLine(before, board) : null;
    // Shelves the same as the carcass, or no shelves picked, have nothing
    // of their own to check.
    if (!line.colour && !line.material) continue;
    const result = check(line, was);
    result.faults
      .filter((fault) => fault.field !== "brand")
      .forEach((fault) => {
        problems.push(`${board.name}: ${fault.message}`);
        faults.push({ field: `${board.name.toLowerCase()}.${fault.field}`, message: `${board.name}: ${fault.message}` });
      });
    if (result.patch.material) patch[board.material] = result.patch.material;
    if (result.patch.finish) patch[board.finish] = result.patch.finish;
    if (result.patch.colour) patch[board.colour] = result.patch.colour;
  }
  return { problems, faults, patch };
}

/** Check and tidy a configuration, or throw a 400 naming the first problem. */
export function passCabinetThroughGate(check, config, before = null, { label = "" } = {}) {
  if (!config) return config;
  const { problems, patch } = checkCabinetBoards(check, config, before);
  if (problems.length) {
    const refusal = new Error(label ? `${label}: ${problems[0]}` : problems[0]);
    refusal.status = 400;
    refusal.problems = problems;
    throw refusal;
  }
  return { ...config, ...patch };
}

/**
 * An imported cabinet is settled the same way an imported line is: a carcass
 * or shelf board the library does not have is cleared, the words kept in the
 * configuration's notes, and the sentences handed back to report.
 */
export function settleImportedCabinet(check, config) {
  if (!config) return { config, notes: [] };
  const { faults, patch } = checkCabinetBoards(check, config, null);
  const settled = { ...config, ...patch };
  const notes = [];
  for (const board of CABINET_BOARDS) {
    const mine = faults.filter((fault) => fault.field.startsWith(`${board.name.toLowerCase()}.`));
    if (!mine.length) continue;
    notes.push(mine[0].message);
    settled[board.colour] = "";
    settled[board.finish] = "";
    if (mine[0].field.endsWith(".material")) settled[board.material] = "";
  }
  if (notes.length) {
    const said = notes.map((note) => `Not kept on import: ${note}`).join("\n");
    settled.notes = [String(config.notes || "").trim(), said].filter(Boolean).join("\n");
  }
  return { config: settled, notes };
}

// ── PANEL PLANNING ON AN ORDER LINE ─────────────────────────────────────────
//
// The order page writes a plan per panel: who makes it, its supplier status,
// its workshop stage. Those are fixed lists the page offers as dropdowns, and
// the route saved whatever it was sent. Only values that CHANGED are judged, so
// a plan written before a list was tidied still saves.

const PLAN_FIELDS = {
  status: { list: () => ORDER_LINE_STATUSES_LIST, word: "supplier status" },
  production_stage: { list: () => ORDER_PRODUCTION_STAGES_LIST, word: "workshop stage" },
  fulfilment_method: { list: () => ["in_house", "supplier_ready_made"], word: "who makes it" },
};

/** Sentences for every changed plan value that is not on its list. */
export function planningProblems(next, before) {
  if (!next || typeof next !== "object" || Array.isArray(next)) return [];
  const was = before && typeof before === "object" && !Array.isArray(before) ? before : {};
  const problems = [];
  for (const [key, plan] of Object.entries(next)) {
    if (!plan || typeof plan !== "object") continue;
    const old = was[key] && typeof was[key] === "object" ? was[key] : {};
    for (const [field, rule] of Object.entries(PLAN_FIELDS)) {
      const value = plan[field];
      if (value === undefined || value === null || value === "" || value === old[field]) continue;
      if (!rule.list().includes(value)) problems.push(`"${value}" is not a ${rule.word} the order page offers.`);
    }
  }
  return problems;
}
