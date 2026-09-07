// HOW MANY BOARDS DOES THIS QUOTE NEED?
//
// ── THE QUESTION ─────────────────────────────────────────────────────────────
//
// A quote says what we are making. It has never said what to buy. Working that
// out meant adding up square metres by hand, dividing by 2.88 and adding a
// guess, which is wrong twice over: it ignores that a 2100 door and a 400
// bulkhead do not share a board neatly, and it ignores grain entirely. Four
// tall doors that all have to run the same way take two boards however the
// square metres divide.
//
// ── GRAIN BELONGS TO THE BOARD ───────────────────────────────────────────────
//
// The grain runs down a board's length. A solid colour has no grain at all, so
// every panel cut from it can be turned to pack tighter whatever the line says.
// Only once the board HAS a grain does the line's own grain_direction matter.
// So the question is asked of the colour first and the line second, which is
// why has_grain lives on pcd_colour_library and not here.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
//
// It is a buying guide, not a cutting program. The layout is a first fit,
// largest panel first, cut in runs across the board the way a panel saw works:
// crosscut a run off, fill it across, move down. A real nesting program at the
// saw will beat it here and there. The board COUNT is the answer this is for.

import { calculateCabinetCutList, cutPieceRole } from "./pcd-cabinet-utils";
import { BOARD_FREE_PRODUCT_TYPES } from "./pcd-quote-ready";
import { isCabinetLine } from "./pcd-quote-line-display";
import { normaliseSupplierName } from "./pcd-colour-library";

const text = (value) => String(value ?? "").trim();
const size = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/**
 * The board a colour comes on when the library row does not say.
 *
 * A BOARD HAS A WIDTH AND A LENGTH, not a height. The house rule that a size is
 * written height first is about a PANEL, where height and width are the two
 * numbers somebody could confuse. A board has neither: it has a width and a
 * length with the grain running down the length, and every supplier price list
 * in the trade quotes it that way round. Naming it length_mm here keeps the two
 * kinds of size from ever being read as the same kind.
 *
 * 1200 x 2400 is the only size we supply as a rule, and the August 2026 price
 * update set it on every decorative board row that had none. A row added since
 * can still be sitting on zero, so this is the fallback AND something the
 * screen has to say out loud rather than quietly assume.
 */
export const FALLBACK_BOARD = { width_mm: 1200, length_mm: 2400 };

/** How we cut, as opposed to what we cut. Board size and grain are the colour's. */
export const BOARD_ORDER_DEFAULTS = {
  include_carcass: true,
  // On a grained board, what "Standard" on a line means. "height" runs the
  // grain up every panel; "by_type" runs a drawer front across its width, which
  // is how the Excel order form describes our house rule.
  standard_grain: "height",
  kerf_mm: 3.2,
  trim_mm: 10,
};

/**
 * Finishes whose boards have a direction, for seeding has_grain.
 *
 * A GUESS, and only ever used as one: the colour library is the answer once
 * somebody has set it. Kept here rather than in the migration so the screen and
 * the migration make the same guess.
 */
export const GRAINED_FINISHES = [
  "Ashgrain", "Natura", "Notaio", "Nuance", "Ravine", "Woodgrain", "Woodmatt",
];

export function finishLooksGrained(finish) {
  const wanted = text(finish).toLowerCase();
  return GRAINED_FINISHES.some((known) => known.toLowerCase() === wanted);
}

const BOARD_FREE = new Set(BOARD_FREE_PRODUCT_TYPES.map((t) => t.toLowerCase()));

function isBoardFreeType(productType) {
  return BOARD_FREE.has(text(productType).toLowerCase());
}

/** Thickness as a number, from either "16mm" or 16. */
function thicknessMm(value) {
  const number = parseInt(String(value ?? "").replace(/[^\d.]/g, ""), 10);
  return Number.isFinite(number) ? number : 0;
}

/**
 * The key for one board: supplier, colour, finish and thickness.
 *
 * That is the thing you buy, so it is the thing a board size and a grain hang
 * off, and it is what the order list is grouped by. Case and spacing are
 * flattened so a line typed by hand and a line imported from a spreadsheet land
 * on the same board.
 */
export function boardKey(spec = {}) {
  return [
    normaliseSupplierName(spec.supplier) || "",
    text(spec.colour),
    text(spec.finish),
    thicknessMm(spec.thickness),
  ].join("|").toLowerCase();
}

/**
 * Which way this panel has to run on this board.
 *
 * "free" means the nester may turn it. Anything else is locked to that axis.
 */
export function grainAxisFor(panel, settings, board) {
  if (!board?.has_grain) return "free";
  // A carcass panel carries no grain answer of its own, so it takes the house
  // rule. It is never a drawer front, so that rule always resolves to height.
  if (panel.source === "carcass") return "height";

  switch (text(panel.grain_direction)) {
    case "No grain":   return "free";
    case "Vertical":   return "height";
    case "Horizontal": return "width";
    default:
      return settings.standard_grain === "by_type" && text(panel.product_type) === "Drawer front"
        ? "width"
        : "height";
  }
}

function orient(panel, settings, board) {
  const axis = grainAxisFor(panel, settings, board);
  if (axis === "width")  return { along: panel.width_mm, across: panel.height_mm, rotatable: false, axis };
  if (axis === "height") return { along: panel.height_mm, across: panel.width_mm, rotatable: false, axis };
  return {
    along: Math.max(panel.height_mm, panel.width_mm),
    across: Math.min(panel.height_mm, panel.width_mm),
    rotatable: true,
    axis,
  };
}

/**
 * Lay panels out on boards.
 *
 * Shelf based first fit, largest first. A "shelf" here is a run crosscut off
 * the board: every panel in it shares a length, and they sit side by side
 * across the width. That is a guillotine cut list, which is the only kind a
 * panel saw can actually make, so the drawing is a drawing of the cuts.
 *
 * A panel bigger than the board comes back in `unplaced` rather than being
 * squeezed on. Silently dropping it would understate the order.
 */
export function nestPanels(panels = [], board = {}) {
  const boardW = size(board.width_mm) || FALLBACK_BOARD.width_mm;
  const boardL = size(board.length_mm) || FALLBACK_BOARD.length_mm;
  const kerf = Math.max(0, Number(board.kerf_mm) || 0);
  const trim = Math.max(0, Number(board.trim_mm) || 0);
  const usableW = Math.max(0, boardW - 2 * trim);
  const usableL = Math.max(0, boardL - 2 * trim);

  const sheets = [];
  const unplaced = [];
  const queue = panels.slice().sort((a, b) => (b.along - a.along) || (b.across - a.across));

  for (const panel of queue) {
    const tries = panel.rotatable
      ? [[panel.along, panel.across, false], [panel.across, panel.along, true]]
      : [[panel.along, panel.across, false]];
    let placed = false;

    // Into a run that is already open, if the panel is no longer than it.
    for (const sheet of sheets) {
      for (const run of sheet.runs) {
        for (const [along, across, turned] of tries) {
          const x = run.used + (run.items.length ? kerf : 0);
          if (along <= run.along + 0.01 && x + across <= usableW + 0.01) {
            run.items.push({ x, y: run.y, along, across, turned, panel });
            run.used = x + across;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (placed) break;
    }
    if (placed) continue;

    // A new run on a board that has length left.
    for (const sheet of sheets) {
      for (const [along, across, turned] of tries) {
        const y = sheet.used + (sheet.runs.length ? kerf : 0);
        if (y + along <= usableL + 0.01 && across <= usableW + 0.01) {
          sheet.runs.push({ y, along, used: across, items: [{ x: 0, y, along, across, turned, panel }] });
          sheet.used = y + along;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (placed) continue;

    // A new board, or nowhere at all.
    const fits = tries.find(([along, across]) => along <= usableL + 0.01 && across <= usableW + 0.01);
    if (!fits) {
      unplaced.push(panel);
      continue;
    }
    const [along, across, turned] = fits;
    sheets.push({
      runs: [{ y: 0, along, used: across, items: [{ x: 0, y: 0, along, across, turned, panel }] }],
      used: along,
    });
  }

  return { sheets, unplaced, usable_width_mm: usableW, usable_length_mm: usableL };
}

// ── Where the panels come from ───────────────────────────────────────────────

function linePanels(line, index) {
  const height = size(line.height_mm);
  const width = size(line.width_mm);
  const qty = Math.max(0, Math.round(Number(line.qty) || 0));
  if (!height || !width || !qty) return [];

  const spec = {
    supplier: line.supplier_name,
    colour: line.colour,
    finish: line.finish,
    thickness: line.thickness,
  };
  const name = text(line.panel_use)
    ? `${text(line.product_type)}, ${text(line.panel_use)}`
    : text(line.product_type) || "Panel";

  return Array.from({ length: qty }, () => ({
    source: "line",
    from_id: `line:${line.id || index}`,
    from_label: `Line ${index + 1}`,
    name,
    product_type: text(line.product_type),
    grain_direction: text(line.grain_direction),
    height_mm: height,
    width_mm: width,
    spec,
  }));
}

/**
 * A cabinet's carcass, cut by the same routine the configurator prices from.
 *
 * Three boards can be involved and usually are not: the carcass, the back and
 * the shelves each carry their own material and thickness on the config, and
 * the cut list already tells them apart for costing. Reusing cutPieceRole means
 * the board a piece is ordered on and the rate it is priced at can never
 * disagree about what that piece is.
 */
function cabinetPanels(line, index) {
  const config = line.cabinet_config;
  if (!config) return [];
  const qty = Math.max(1, Math.round(Number(line.qty) || 1));
  const supplier = line.supplier_name;

  const specFor = (role) => {
    if (role === "shelf") {
      return {
        supplier,
        colour: config.shelf_colour || config.carcass_colour,
        finish: config.shelf_finish || config.carcass_finish,
        thickness: config.shelf_thickness_mm,
      };
    }
    if (role === "back") {
      // The back keeps the carcass colour and finish, the way the cut list
      // prices it, but its own thickness: a 6mm back is a different board.
      return {
        supplier,
        colour: config.carcass_colour,
        finish: config.carcass_finish,
        thickness: config.back_panel_thickness_mm,
      };
    }
    return {
      supplier,
      colour: config.carcass_colour,
      finish: config.carcass_finish,
      thickness: config.carcass_thickness_mm,
    };
  };

  const label = text(config.label) || text(line.product_name) || `Base cabinet ${index + 1}`;
  const panels = [];

  for (const piece of calculateCabinetCutList(config)) {
    const height = size(piece.height_mm);
    const width = size(piece.width_mm);
    const pieces = Math.max(0, Math.round(Number(piece.qty) || 0)) * qty;
    if (!height || !width || !pieces) continue;

    const spec = specFor(cutPieceRole(piece.label));
    for (let n = 0; n < pieces; n++) {
      panels.push({
        source: "carcass",
        from_id: `cabinet:${line.id || index}`,
        from_label: `Cabinet on line ${index + 1}`,
        cabinet_label: label,
        name: piece.label,
        product_type: "Carcass",
        grain_direction: "",
        height_mm: height,
        width_mm: width,
        spec,
      });
    }
  }
  return panels;
}

// ── The whole answer ─────────────────────────────────────────────────────────

/**
 * The better of the two ways round this packer can be handed the panels.
 *
 * The nester is greedy: it tries a panel's first orientation and only falls
 * back to the second, so a panel that could go either way gets whichever it was
 * seeded with. Seeded tall first, six 1150 x 600 panels took three boards; laid
 * on their side they take two. A quote is not going to order a board it does
 * not need because of the order a loop happened to run in.
 *
 * So when anything in the group can turn, both seedings are packed and the
 * better one wins. Panels that are locked to an axis are unaffected: their
 * along and across do not change between the passes.
 */
function bestLayout(panels, board) {
  const first = nestPanels(panels, board);
  if (!panels.some((panel) => panel.rotatable)) return first;

  const second = nestPanels(
    panels.map((panel) =>
      panel.rotatable ? { ...panel, along: panel.across, across: panel.along } : panel
    ),
    board
  );

  const better =
    second.unplaced.length < first.unplaced.length ||
    (second.unplaced.length === first.unplaced.length && second.sheets.length < first.sheets.length);
  return better ? second : first;
}

function boardFor(spec, colourIndex, override, settings) {
  const key = boardKey(spec);
  const libraryRow = colourIndex.get(key) || null;
  const libraryWidth = size(libraryRow?.boardWidthMm);
  const libraryLength = size(libraryRow?.boardHeightMm);
  const hasLibrarySize = Boolean(libraryWidth && libraryLength);

  const guessedGrain = finishLooksGrained(spec.finish);
  const libraryGrain = libraryRow && typeof libraryRow.hasGrain === "boolean" ? libraryRow.hasGrain : null;

  return {
    key,
    supplier: normaliseSupplierName(spec.supplier) || text(spec.supplier),
    colour: text(spec.colour),
    finish: text(spec.finish),
    thickness_mm: thicknessMm(spec.thickness),
    colour_library_id: libraryRow?.id || null,

    width_mm: size(override?.width_mm) || (hasLibrarySize ? libraryWidth : FALLBACK_BOARD.width_mm),
    length_mm: size(override?.length_mm) || (hasLibrarySize ? libraryLength : FALLBACK_BOARD.length_mm),
    has_grain: typeof override?.has_grain === "boolean"
      ? override.has_grain
      : (libraryGrain === null ? guessedGrain : libraryGrain),

    // Where each answer came from, because a screen that cannot say "this is
    // the library's number" and "this is a guess" apart is a screen nobody can
    // trust with an order.
    size_source: size(override?.width_mm) || size(override?.length_mm)
      ? "quote"
      : hasLibrarySize ? "library" : "fallback",
    grain_source: typeof override?.has_grain === "boolean"
      ? "quote"
      : libraryGrain === null ? "finish" : "library",
    library_width_mm: libraryWidth || 0,
    library_length_mm: libraryLength || 0,

    kerf_mm: Math.max(0, Number(settings.kerf_mm) || 0),
    trim_mm: Math.max(0, Number(settings.trim_mm) || 0),
  };
}

/**
 * Normalise whatever is stored on the quote into settings this can rely on.
 *
 * A missing kerf or trim inherits the business default rather than becoming
 * zero: a zero kerf silently over-packs every board on the quote.
 */
export function normalizeBoardOrderSettings(stored = {}, defaults = {}) {
  const base = { ...BOARD_ORDER_DEFAULTS, ...defaults };
  const number = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    include_carcass: stored.include_carcass ?? base.include_carcass,
    standard_grain: stored.standard_grain === "by_type" ? "by_type" : "height",
    kerf_mm: number(stored.kerf_mm, base.kerf_mm),
    trim_mm: number(stored.trim_mm, base.trim_mm),
    boards: stored.boards && typeof stored.boards === "object" ? stored.boards : {},
  };
}

/**
 * Every board this quote needs, with the panels laid out on each one.
 *
 * `colours` is the colour library as getDatabaseColourItems returns it.
 * `settings` is what the quote has saved, already normalised.
 */
export function buildBoardOrder({ lines = [], colours = [], settings = {} } = {}) {
  const active = normalizeBoardOrderSettings(settings, settings);

  const colourIndex = new Map();
  for (const row of colours) {
    const key = boardKey({
      supplier: row.supplier,
      colour: row.colour,
      finish: row.finish,
      thickness: row.thicknessMm ?? row.thickness,
    });
    // First row wins. A duplicate colour at the same thickness is a library
    // problem, not something to average away here.
    if (!colourIndex.has(key)) colourIndex.set(key, row);
  }

  const panels = [];
  lines.forEach((line, index) => {
    if (isCabinetLine(line)) {
      if (active.include_carcass) panels.push(...cabinetPanels(line, index));
      return;
    }
    if (isBoardFreeType(line.product_type)) return;
    panels.push(...linePanels(line, index));
  });

  const grouped = new Map();
  for (const panel of panels) {
    const key = boardKey(panel.spec);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(panel);
  }

  const groups = [];
  for (const [key, groupPanels] of grouped) {
    const board = boardFor(groupPanels[0].spec, colourIndex, active.boards[key], active);
    const oriented = groupPanels.map((panel) => ({ ...panel, ...orient(panel, active, board) }));
    const layout = bestLayout(oriented, board);

    // The same panels with nothing locked, so the screen can say what the grain
    // actually costs rather than leaving it as an article of faith. Packed by
    // the same bestLayout the real answer uses, so the tab can never promise a
    // saving that setting the board to no grain then fails to deliver.
    const ifFree = bestLayout(
      oriented.map((panel) => ({
        ...panel,
        along: Math.max(panel.height_mm, panel.width_mm),
        across: Math.min(panel.height_mm, panel.width_mm),
        rotatable: true,
      })),
      board
    );

    const panelArea = oriented.reduce((total, p) => total + p.height_mm * p.width_mm, 0);
    const boardArea = board.width_mm * board.length_mm;
    const boards = layout.sheets.length;

    groups.push({
      key,
      board,
      panels: oriented,
      rows: summariseRows(oriented, active, board),
      layout,
      boards,
      panel_area_sqm: round(panelArea / 1e6, 3),
      board_area_sqm: round(boardArea / 1e6, 3),
      offcut_fraction: boards ? round(1 - panelArea / (boards * boardArea), 4) : 0,
      boards_if_no_grain: Math.min(ifFree.sheets.length, boards),
      grain_cost_boards: board.has_grain ? Math.max(0, boards - Math.min(ifFree.sheets.length, boards)) : 0,
      unplaced: layout.unplaced,
    });
  }

  groups.sort((a, b) => b.boards - a.boards || a.board.colour.localeCompare(b.board.colour));

  return {
    settings: active,
    groups,
    totals: {
      boards: groups.reduce((t, g) => t + g.boards, 0),
      panels: groups.reduce((t, g) => t + g.panels.length, 0),
      panel_area_sqm: round(groups.reduce((t, g) => t + g.panel_area_sqm, 0), 3),
      grain_cost_boards: groups.reduce((t, g) => t + g.grain_cost_boards, 0),
      unplaced: groups.reduce((t, g) => t + g.unplaced.length, 0),
      boards_without_library_size: groups.filter((g) => g.board.size_source === "fallback").length,
      boards_guessing_grain: groups.filter((g) => g.board.grain_source === "finish").length,
    },
    excluded_lines: lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => !isCabinetLine(line) && isBoardFreeType(line.product_type))
      .map(({ line, index }) => ({ index, product_type: text(line.product_type) })),
  };
}

/** One row per distinct panel on a board, for the table under the drawings. */
function summariseRows(panels, settings, board) {
  const rows = new Map();
  for (const panel of panels) {
    const key = [panel.from_id, panel.name, panel.height_mm, panel.width_mm].join("|");
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        from_id: panel.from_id,
        from_label: panel.from_label,
        cabinet_label: panel.cabinet_label || "",
        name: panel.name,
        grain_direction: panel.grain_direction,
        height_mm: panel.height_mm,
        width_mm: panel.width_mm,
        axis: grainAxisFor(panel, settings, board),
        qty: 0,
      });
    }
    rows.get(key).qty += 1;
  }
  return [...rows.values()].sort(
    (a, b) => a.from_label.localeCompare(b.from_label) || b.height_mm * b.width_mm - a.height_mm * a.width_mm
  );
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
}

/**
 * The order list as plain text, for pasting into an email to a supplier.
 *
 * Board size is on every line on purpose. A colour that does not come 1200 x
 * 2400 is exactly the one somebody would otherwise order wrong.
 */
export function boardOrderText(result) {
  return (result?.groups || [])
    .map((group) => {
      const b = group.board;
      return `${group.boards} x ${b.supplier} ${b.colour}, ${b.finish}, ${b.thickness_mm}mm, ${b.width_mm} wide x ${b.length_mm} long`;
    })
    .join("\n");
}
