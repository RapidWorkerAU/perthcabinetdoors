// THE CUTTING PLAN: EVERY PANEL WE CUT, LAID ONTO BOARDS FOR THE PANEL SAW.
//
// ── WHAT THIS IS, AND HOW IT DIFFERS FROM THE BOARD ORDER ────────────────────
//
// lib/pcd-board-order.js answers a buying question on the quote: roughly how
// many boards. It places each panel once, first fit, and says itself that a
// real nesting program would beat it. That is fine for a count. It is not fine
// for a sheet somebody stands at the saw with, where one wrong size is a
// wasted board.
//
// This answers the cutting question on the order, for the Made In House panels
// only, and it is held to a stricter standard:
//
//   THE SIZES ARE CUT SIZES. A panel taped on an edge is cut smaller by the
//   tape, so it finishes at the size on the order. The sheet says so.
//
//   THE BLADE IS ACCOUNTED FOR. Every cut between two pieces takes the kerf
//   out of the board, and the trim comes off all four edges first.
//
//   EVERY CUT IS ONE A PANEL SAW CAN MAKE. The layout is guillotine only, in
//   three stages: strips off the board, pieces off each strip, and panels
//   stacked inside a piece. Anything narrower than its piece gets a final trim
//   cut. That is the order the cuts are listed and numbered in.
//
//   IT TRIES MORE THAN ONE WAY. Strips along the length and strips across the
//   width, three ways to choose what opens a strip and two ways to fill it,
//   run both over the whole job and one board at a time. The layout that uses
//   the fewest boards wins, then the one that packs the earlier boards
//   tightest, then the one with the fewest cuts. Whatever board is left
//   emptiest is then tried against the offcuts of the others.
//
// ── ORIENTATION ──────────────────────────────────────────────────────────────
//
// Board coordinates: X runs down the LENGTH of the board (the way a grain
// runs), Y runs across its WIDTH. A panel's height lying along X means its
// grain runs up the panel. Which way a panel may lie is grainAxisFor's answer,
// the same rule the board order uses, so the quote and the order agree.

import { FALLBACK_BOARD, boardKey, finishLooksGrained, grainAxisFor } from "./pcd-board-order.js";
import { bandedEdgeList } from "./pcd-line-details.js";
import { normaliseSupplierName } from "./pcd-colour-library.js";
import { CUT_LIST_STATES } from "./pcd-cut-list-variations.js";

const EPS = 0.01;
const text = (value) => String(value ?? "").trim();
const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const objectOr = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

/** A millimetre figure as the workshop reads it: whole where it is whole, one place where it is not. */
export function mm(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export const CUTTING_PLAN_DEFAULTS = {
  kerf_mm: 3.2,
  trim_mm: 10,
  tape_mm: 1,
  min_offcut_length_mm: 300,
  min_offcut_width_mm: 100,
  standard_grain: "height",
};

/**
 * The settings this plan runs on.
 *
 * What the order saved wins, then what the quote decided on its Board to Order
 * tab, then the Business Defaults, then the built in numbers. A blank or a
 * nonsense value falls through to the next rather than becoming zero, because a
 * zero blade silently over-packs every board.
 */
export function normalizeCuttingSettings(stored, { quoteSettings, businessDefaults } = {}) {
  const saved = objectOr(stored);
  const quote = objectOr(quoteSettings);
  const business = objectOr(businessDefaults);
  const pick = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const number = Number(value);
      if (Number.isFinite(number) && number >= 0) return number;
    }
    return 0;
  };
  const cleanBoards = (boards) => {
    const out = {};
    for (const [key, value] of Object.entries(objectOr(boards))) {
      const entry = objectOr(value);
      const clean = {};
      if (positive(entry.width_mm)) clean.width_mm = positive(entry.width_mm);
      if (positive(entry.length_mm)) clean.length_mm = positive(entry.length_mm);
      if (typeof entry.has_grain === "boolean") clean.has_grain = entry.has_grain;
      if (Object.keys(clean).length) out[key] = clean;
    }
    return out;
  };
  return {
    kerf_mm: pick(saved.kerf_mm, quote.kerf_mm, business.saw_kerf_mm, CUTTING_PLAN_DEFAULTS.kerf_mm),
    trim_mm: pick(saved.trim_mm, quote.trim_mm, business.board_edge_trim_mm, CUTTING_PLAN_DEFAULTS.trim_mm),
    tape_mm: pick(saved.tape_mm, CUTTING_PLAN_DEFAULTS.tape_mm),
    min_offcut_length_mm: pick(saved.min_offcut_length_mm, CUTTING_PLAN_DEFAULTS.min_offcut_length_mm),
    min_offcut_width_mm: pick(saved.min_offcut_width_mm, CUTTING_PLAN_DEFAULTS.min_offcut_width_mm),
    standard_grain: [saved.standard_grain, quote.standard_grain].find((value) => value === "height" || value === "by_type") || "height",
    // The quote's board decisions carry over; anything set on the order wins.
    boards: { ...cleanBoards(quote.boards), ...cleanBoards(saved.boards) },
    // What to do with a panel too big for its board. Order only: the quote has
    // nothing to say about how the workshop cuts.
    panel_fixes: cleanPanelFixes(saved.panel_fixes),
  };
}

/**
 * A panel too big for its board, turned or split FOR CUTTING ONLY.
 *
 * Keyed by the panel as it sits on the order (item and panel key), so every
 * copy of it gets the same answer. Nothing here is ever written back to the
 * order: it changes how the plan lays the panel out and nothing else, and the
 * PDF records it on its last page so the workshop has it in writing.
 *
 *   { action: "turn" }                                     height and width swapped
 *   { action: "split", direction: "height", first_mm }     cut in two across the height
 *   { action: "split", direction: "width",  first_mm }     cut in two across the width
 */
function cleanPanelFixes(fixes) {
  const out = {};
  for (const [key, value] of Object.entries(objectOr(fixes))) {
    const entry = objectOr(value);
    if (entry.action === "turn") {
      out[key] = { action: "turn" };
    } else if (entry.action === "split" && (entry.direction === "height" || entry.direction === "width") && positive(entry.first_mm)) {
      out[key] = { action: "split", direction: entry.direction, first_mm: positive(entry.first_mm) };
    }
  }
  return out;
}

// ── Tape ─────────────────────────────────────────────────────────────────────

function isDecorativeBoard(material) {
  return text(material).toLowerCase().replace(/[_-]+/g, " ").includes("decorative board");
}

// The profile name says its own thickness when it is a taped edge ("1mm Square
// Edge"). Anything it does not say comes from the setting.
function tapeThickness(row, settings) {
  const match = text(row.edgeMould).match(/(\d+(?:\.\d+)?)\s*mm/i);
  const said = match ? Number(match[1]) : NaN;
  return said > 0 && said <= 5 ? said : settings.tape_mm;
}

/**
 * Which edges of this panel are taped, and how much that takes off each size.
 *
 * WHEN NOTHING IS RECORDED IT CUTS TO THE ORDER SIZE. A panel cut 2mm big can
 * be trimmed; a panel cut 2mm small is a new panel. So an unanswered edge
 * question errs towards the recoverable mistake, and the sheet says which
 * panels it did that for.
 */
export function tapeForRow(row, settings) {
  const thickness = tapeThickness(row, settings);
  const none = (recorded, words) => ({ edges: [], height_less: 0, width_less: 0, recorded, thickness, words });

  if (row.kind === "carcass") {
    if (!isDecorativeBoard(row.boardSpec?.material || row.materialText)) return none(true, "No tape");
    const label = text(row.pieceLabel).toLowerCase();
    if (/back panel/.test(label)) return none(true, "No tape");
    if (/(side panel|top panel|bottom panel|shelf)/.test(label)) {
      // The front long edge runs along the longer side, so its tape comes off
      // the shorter one.
      const longIsHeight = Number(row.heightMm) >= Number(row.widthMm);
      return {
        edges: ["Front long edge"],
        height_less: longIsHeight ? 0 : thickness,
        width_less: longIsHeight ? thickness : 0,
        recorded: true,
        thickness,
        words: "front long edge",
      };
    }
    return none(true, "No tape");
  }

  if (!isDecorativeBoard(row.boardSpec?.material)) return none(true, "No tape");

  let edges = null;
  if (Array.isArray(row.bandedEdges)) edges = bandedEdgeList(row.bandedEdges);
  else if (text(row.edgeFinish) === "All four edges") edges = ["Top", "Bottom", "Left", "Right"];
  if (!edges) return none(false, "Tape not recorded");

  const count = (names) => names.filter((name) => edges.includes(name)).length;
  return {
    edges,
    height_less: thickness * count(["Top", "Bottom"]),
    width_less: thickness * count(["Left", "Right"]),
    recorded: true,
    thickness,
    words: edges.length === 4 ? "all four edges" : edges.length ? edges.join(", ").toLowerCase() : "No tape",
  };
}

// ── Panels ───────────────────────────────────────────────────────────────────

/**
 * One entry per physical panel, with its cut size.
 *
 * `rows` are the production sheet's Made In House rows (buildCutListRows) with
 * their panel numbers applied, so a number on this plan is the number on the
 * sheet and on the label. A row held by a pending variation is left off: it
 * must not be cut until the variation is settled.
 */
export function cuttingPanelsFromRows(rows = [], settings) {
  const panels = [];
  const held = [];
  const noSize = [];
  for (const row of rows) {
    if (row.proposed) continue;
    if (row.state === CUT_LIST_STATES.hold) {
      held.push(row);
      continue;
    }
    const height = positive(row.heightMm);
    const width = positive(row.widthMm);
    if (!height || !width) {
      noSize.push(row);
      continue;
    }
    const tape = tapeForRow(row, settings);
    const cutH = height - tape.height_less;
    const cutW = width - tape.width_less;
    if (cutH <= 0 || cutW <= 0) {
      noSize.push(row);
      continue;
    }
    const copies = Math.max(1, Math.round(Number(row.qty) || 1));
    for (let copy = 0; copy < copies; copy += 1) {
      panels.push({
        id: `${row.itemId || "none"}|${row.panelKey || row.piece}|${copy}`,
        fixKey: `${row.itemId || "none"}|${row.panelKey || row.piece}`,
        panelNo: row.panelNo ?? null,
        copy: copy + 1,
        copies,
        name: text(row.piece) || "Panel",
        source: text(row.source),
        cabinet: text(row.cabinet),
        kind: row.kind === "carcass" ? "carcass" : "line",
        product_type: text(row.productType),
        grain_direction: text(row.grainDirection),
        finishedH: height,
        finishedW: width,
        cutH,
        cutW,
        tape,
        spec: row.boardSpec || {},
        notes: text(row.notes),
      });
    }
  }
  return { panels, held, noSize };
}

// ── Boards ───────────────────────────────────────────────────────────────────

function thicknessNumber(value) {
  const number = parseInt(String(value ?? "").replace(/[^\d.]/g, ""), 10);
  return Number.isFinite(number) ? number : 0;
}

/** The colour library rows as this plan needs them: only size and grain. */
export function coloursFromLibraryRows(rows = []) {
  return (rows || []).map((row) => ({
    supplier: normaliseSupplierName(row.supplier_name) || text(row.supplier_name),
    colour: text(row.name),
    finish: text(row.finish_type),
    thicknessMm: thicknessNumber(row.thickness),
    boardWidthMm: Number(row.preferred_board_width_mm || 0),
    boardHeightMm: Number(row.preferred_board_height_mm || 0),
    hasGrain: typeof row.has_grain === "boolean" ? row.has_grain : null,
  }));
}

function indexColours(colours = []) {
  const byKey = new Map();
  const byName = new Map();
  for (const row of colours) {
    const key = boardKey({ supplier: row.supplier, colour: row.colour, finish: row.finish, thickness: row.thicknessMm ?? row.thickness });
    if (!byKey.has(key)) byKey.set(key, row);
    const nameKey = `${text(row.colour).toLowerCase()}|${thicknessNumber(row.thicknessMm ?? row.thickness)}`;
    if (!byName.has(nameKey)) byName.set(nameKey, row);
  }
  return { byKey, byName };
}

/**
 * The board a group of panels is cut from: its size and whether it has a grain.
 *
 * Set on the order first, then the colour library, then the fallback, and it
 * says which, because a sheet cut against an assumed board size is exactly the
 * one somebody needs to check. Matched on colour and thickness when the brand or
 * finish is missing from the line, which is common on an order.
 */
export function resolveBoard(spec, index, settings) {
  const key = boardKey(spec);
  const row = index.byKey.get(key)
    || index.byName.get(`${text(spec.colour).toLowerCase()}|${thicknessNumber(spec.thickness)}`)
    || null;
  const override = objectOr(settings.boards?.[key]);
  const libraryWidth = positive(row?.boardWidthMm);
  const libraryLength = positive(row?.boardHeightMm);
  const hasLibrarySize = Boolean(libraryWidth && libraryLength);
  const libraryGrain = typeof row?.hasGrain === "boolean" ? row.hasGrain : null;
  const finish = text(spec.finish) || text(row?.finish);
  const sizeSet = positive(override.width_mm) || positive(override.length_mm);

  return {
    key,
    supplier: normaliseSupplierName(spec.supplier) || text(spec.supplier) || text(row?.supplier),
    colour: text(spec.colour) || text(row?.colour),
    finish,
    material: text(spec.material),
    thickness_mm: thicknessNumber(spec.thickness),
    width_mm: positive(override.width_mm) || (hasLibrarySize ? libraryWidth : FALLBACK_BOARD.width_mm),
    length_mm: positive(override.length_mm) || (hasLibrarySize ? libraryLength : FALLBACK_BOARD.length_mm),
    has_grain: typeof override.has_grain === "boolean"
      ? override.has_grain
      : libraryGrain === null ? finishLooksGrained(finish) : libraryGrain,
    size_source: sizeSet ? "order" : hasLibrarySize ? "library" : "fallback",
    grain_source: typeof override.has_grain === "boolean" ? "order" : libraryGrain === null ? "finish" : "library",
  };
}

// The ways a panel may lie on the board. x runs along the length, y across.
// A panel somebody chose to turn for cutting lies the other way to its grain.
function orientations(panel, axis) {
  const locked = panel.turnedForCutting
    ? (axis === "height" ? "width" : axis === "width" ? "height" : axis)
    : axis;
  const heightAlong = { x: panel.cutH, y: panel.cutW, turned: false };
  const widthAlong = { x: panel.cutW, y: panel.cutH, turned: true };
  if (locked === "height") return [heightAlong];
  if (locked === "width") return [widthAlong];
  return Math.abs(panel.cutH - panel.cutW) < EPS ? [heightAlong] : [heightAlong, widthAlong];
}

function axisFor(panel, settings, board) {
  return grainAxisFor(
    { source: panel.kind === "carcass" ? "carcass" : "line", grain_direction: panel.grain_direction, product_type: panel.product_type },
    settings,
    board
  );
}

function fitsBoard(panel, axis, usable) {
  return orientations(panel, axis).some((opt) => opt.x <= usable.x + EPS && opt.y <= usable.y + EPS);
}

/**
 * A panel cut in two for the saw. The pieces add up exactly to the panel's cut
 * size and keep its grain. The edge where they meet is a raw cut, so the tape
 * that was on the far edge stays with the piece that has it.
 */
function splitPieces(panel, fix) {
  const total = fix.direction === "height" ? panel.cutH : panel.cutW;
  const first = Math.min(Number(fix.first_mm) || 0, total);
  const second = total - first;
  if (first <= EPS || second <= EPS) return null;
  const label = panelLabel(panel);
  const make = (length, index, joinEdge) => {
    const edges = panel.tape.edges.filter((edge) => edge !== joinEdge);
    return {
      ...panel,
      id: `${panel.id}|piece${index}`,
      tag: `${label}${index === 1 ? "A" : "B"}`,
      name: `${panel.name}, piece ${index} of 2`,
      cutH: fix.direction === "height" ? length : panel.cutH,
      cutW: fix.direction === "width" ? length : panel.cutW,
      piece: { index, of: 2, direction: fix.direction },
      tape: { ...panel.tape, edges, words: edges.length === 4 ? "all four edges" : edges.length ? edges.join(", ").toLowerCase() : "No tape" },
    };
  };
  return fix.direction === "height"
    ? [make(first, 1, "Bottom"), make(second, 2, "Top")]
    : [make(first, 1, "Right"), make(second, 2, "Left")];
}

// What the popup can offer a panel that will not fit as it is.
function adviceFor(panel, axis, usable) {
  const grainLocked = axis === "height" || axis === "width";
  const canTurn = grainLocked && fitsBoard({ ...panel, turnedForCutting: true }, axis, usable);
  const splitOptions = ["height", "width"]
    .map((direction) => {
      const total = direction === "height" ? panel.cutH : panel.cutW;
      const first = Math.floor(total / 2);
      const pieces = splitPieces(panel, { direction, first_mm: first });
      return pieces && pieces.every((piece) => fitsBoard(piece, axis, usable))
        ? { direction, total_mm: total, suggested_first_mm: first }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.total_mm - a.total_mm);
  return { grainLocked, canTurn, splitOptions };
}

// ── The packer ───────────────────────────────────────────────────────────────

function compareScores(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] > b[index] + EPS) return 1;
    if (a[index] < b[index] - EPS) return -1;
  }
  return 0;
}

function bestChoice(remaining, fits, score) {
  let best = null;
  remaining.forEach((item, index) => {
    for (const opt of item.opts) {
      if (!fits(opt)) continue;
      const value = score(opt);
      if (!best || compareScores(value, best.value) > 0) best = { index, opt, value };
    }
  });
  return best;
}

const OPENERS = {
  tallest: (d, s) => [d, s],
  area: (d, s) => [d * s, d],
  longest: (d, s) => [s, d],
};
const FILLS = {
  depth: (d, s) => [d, s],
  area: (d, s) => [d * s, s],
};

const STRATEGIES = ["rip", "cross"].flatMap((mode) =>
  Object.keys(OPENERS).flatMap((opener) => Object.keys(FILLS).map((fill) => ({ mode, opener, fill })))
);

function usableSize(board, settings) {
  return {
    x: Math.max(0, board.length_mm - 2 * settings.trim_mm),
    y: Math.max(0, board.width_mm - 2 * settings.trim_mm),
  };
}

// The strip frame for one cutting direction. "rip" takes strips along the
// length, so a strip's depth runs across the width; "cross" is the other way.
function frame(mode, board, settings) {
  const usable = usableSize(board, settings);
  const rip = mode === "rip";
  return {
    rip,
    D: rip ? usable.y : usable.x,
    S: rip ? usable.x : usable.y,
    dOf: (opt) => (rip ? opt.y : opt.x),
    sOf: (opt) => (rip ? opt.x : opt.y),
  };
}

/**
 * Fill ONE board, three stage guillotine, taking panels out of `remaining`.
 *
 * A strip's depth is set by the panel that opens it. Pieces are then cut off the
 * strip, each as long as the panel that starts it, and narrower panels are
 * stacked into the rest of that piece's depth. Returns the strips; `remaining`
 * is left holding whatever did not go on this board.
 */
function fillBoard(remaining, board, settings, strategy) {
  const kerf = settings.kerf_mm;
  const { D, S, dOf, sOf } = frame(strategy.mode, board, settings);
  const opener = OPENERS[strategy.opener];
  const fill = FILLS[strategy.fill];
  const strips = [];
  let usedD = 0;

  for (;;) {
    const gap = strips.length ? kerf : 0;
    const availD = D - usedD - gap;
    const open = bestChoice(
      remaining,
      (opt) => dOf(opt) <= availD + EPS && sOf(opt) <= S + EPS,
      (opt) => opener(dOf(opt), sOf(opt))
    );
    if (!open) break;

    const depth = dOf(open.opt);
    const strip = { offset: usedD + gap, depth, segments: [] };
    let usedS = 0;
    let next = open;

    for (;;) {
      const sGap = strip.segments.length ? kerf : 0;
      const availS = S - usedS - sGap;
      const choice = next || bestChoice(
        remaining,
        (opt) => dOf(opt) <= depth + EPS && sOf(opt) <= availS + EPS,
        (opt) => fill(dOf(opt), sOf(opt))
      );
      next = null;
      if (!choice) break;

      const [first] = remaining.splice(choice.index, 1);
      const segment = {
        offset: usedS + sGap,
        length: sOf(choice.opt),
        usedD: dOf(choice.opt),
        items: [{ panel: first.panel, opt: choice.opt, offsetD: 0, d: dOf(choice.opt), s: sOf(choice.opt) }],
      };

      for (;;) {
        const room = depth - segment.usedD - kerf;
        const stack = bestChoice(
          remaining,
          (opt) => dOf(opt) <= room + EPS && sOf(opt) <= segment.length + EPS,
          (opt) => [sOf(opt), dOf(opt)]
        );
        if (!stack) break;
        const [stacked] = remaining.splice(stack.index, 1);
        segment.items.push({
          panel: stacked.panel,
          opt: stack.opt,
          offsetD: segment.usedD + kerf,
          d: dOf(stack.opt),
          s: sOf(stack.opt),
        });
        segment.usedD += kerf + dOf(stack.opt);
      }

      strip.segments.push(segment);
      usedS = segment.offset + segment.length;
    }

    strips.push(strip);
    usedD = strip.offset + depth;
  }

  return strips;
}

function stripsArea(strips) {
  return strips.reduce(
    (total, strip) => total + strip.segments.reduce(
      (sum, segment) => sum + segment.items.reduce((area, item) => area + item.d * item.s, 0),
      0
    ),
    0
  );
}

// A panel too big for the board in any way it may lie.
function splitOversize(items, board, settings) {
  const usable = usableSize(board, settings);
  const fits = [];
  const unplaced = [];
  for (const item of items) {
    if (item.opts.some((opt) => opt.x <= usable.x + EPS && opt.y <= usable.y + EPS)) fits.push(item);
    else unplaced.push(item.panel);
  }
  return { fits, unplaced };
}

/** One strategy over the whole job, one board after another. */
export function packStrategy(items, board, settings, strategy) {
  const { fits, unplaced } = splitOversize(items, board, settings);
  const remaining = fits.slice();
  const boards = [];
  while (remaining.length) {
    const strips = fillBoard(remaining, board, settings, strategy);
    // Cannot happen with the oversize filter above, but a loop that places
    // nothing must never spin.
    if (!strips.length) {
      unplaced.push(...remaining.map((item) => item.panel));
      break;
    }
    boards.push({ strips, mode: strategy.mode });
  }
  return { boards, unplaced };
}

/**
 * Every strategy on each board, keeping whichever fills THAT board fullest.
 *
 * One strategy for the whole job suits some boards and wastes others: long
 * doors open strips that leave thin waste the small panels cannot use. Choosing
 * per board lets the first board take the layout that packs it and the next
 * board take a different one.
 */
export function packBoardByBoard(items, board, settings) {
  const { fits, unplaced } = splitOversize(items, board, settings);
  let remaining = fits.slice();
  const boards = [];
  while (remaining.length) {
    let best = null;
    for (const strategy of STRATEGIES) {
      const trial = remaining.slice();
      const strips = fillBoard(trial, board, settings, strategy);
      if (!strips.length) continue;
      const area = stripsArea(strips);
      if (!best || area > best.area + EPS) best = { strips, trial, area, mode: strategy.mode };
    }
    if (!best) {
      unplaced.push(...remaining.map((item) => item.panel));
      break;
    }
    boards.push({ strips: best.strips, mode: best.mode });
    remaining = best.trial;
  }
  return { boards, unplaced };
}

function cutCount(pack) {
  return pack.boards.reduce(
    (total, raw) => total + raw.strips.reduce((sum, strip) => sum + 1 + strip.segments.reduce((n, segment) => n + 1 + segment.items.length, 0), 0),
    0
  );
}

/** Every way of packing, and the best layout among them. */
export function optimiseBoards(items, board, settings) {
  const candidates = [
    ...STRATEGIES.map((strategy) => packStrategy(items, board, settings, strategy)),
    packBoardByBoard(items, board, settings),
  ];
  let best = null;
  for (const pack of candidates) {
    const last = pack.boards[pack.boards.length - 1];
    // Fewest boards, fewest left over, then the least on the last board (the
    // earlier ones packed tightest, leaving the biggest usable offcut), then
    // the fewest cuts at the saw.
    const score = [
      -pack.boards.length,
      -pack.unplaced.length,
      last ? -stripsArea(last.strips) : 0,
      -cutCount(pack),
    ];
    if (!best || compareScores(score, best.score) > 0) best = { pack, score };
  }
  return best.pack;
}

// ── Turning a layout into a sheet ────────────────────────────────────────────

function letters(index) {
  let value = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return out;
}

/** How a panel is named on the sheet: its number, with A or B when it was split. */
export function panelLabel(panel) {
  return panel.tag || (panel.panelNo ? `#${panel.panelNo}` : panel.name);
}

const panelTag = (panel) => panelLabel(panel);

function isUsable(area, settings) {
  const longSide = Math.max(area.w, area.h);
  const shortSide = Math.min(area.w, area.h);
  return longSide >= settings.min_offcut_length_mm - EPS && shortSide >= settings.min_offcut_width_mm - EPS;
}

/**
 * One board: where every panel sits, every cut in order, and what is left.
 *
 * Positions are in millimetres from the corner of the whole board, trim
 * included, with x along the length and y across the width.
 */
export function describeSheet(raw, board, settings) {
  const kerf = settings.kerf_mm;
  const trim = settings.trim_mm;
  const { rip, D, S } = frame(raw.mode, board, settings);

  // A rectangle from strip coordinates (d across strips, s along them).
  const rect = (dOff, sOff, dSize, sSize) => (rip
    ? { x: trim + sOff, y: trim + dOff, w: sSize, h: dSize }
    : { x: trim + dOff, y: trim + sOff, w: dSize, h: sSize });
  // A cut parallel to the strips, at depth dPos, from s1 to s2.
  const alongStrips = (dPos, s1, s2) => (rip
    ? { x1: trim + s1, y1: trim + dPos, x2: trim + s2, y2: trim + dPos }
    : { x1: trim + dPos, y1: trim + s1, x2: trim + dPos, y2: trim + s2 });
  // A cut across a strip, at sPos, from d1 to d2.
  const acrossStrips = (sPos, d1, d2) => (rip
    ? { x1: trim + sPos, y1: trim + d1, x2: trim + sPos, y2: trim + d2 }
    : { x1: trim + d1, y1: trim + sPos, x2: trim + d2, y2: trim + sPos });
  // Stage 1 and 3 cuts run with the strips; 2 and 4 run across them.
  const verb = (stage) => ((rip === (stage % 2 === 1)) ? "Rip" : "Cross cut");

  const placements = [];
  const offcuts = [];
  const cuts = [];
  const steps = [];

  const addOffcut = (area) => {
    if (area.w <= EPS || area.h <= EPS) return;
    offcuts.push({ ...area, usable: isUsable(area, settings) });
  };

  let usedD = 0;
  raw.strips.forEach((strip, stripIndex) => {
    const stripId = String(stripIndex + 1);
    steps.push({ id: stripId, level: 1, text: `${verb(1)} a ${mm(strip.depth)} strip` });
    if (D - (strip.offset + strip.depth) > EPS) {
      cuts.push({ level: 1, label: stripId, ...alongStrips(strip.offset + strip.depth + kerf / 2, 0, S) });
    }

    let usedS = 0;
    strip.segments.forEach((segment, segmentIndex) => {
      const segmentId = `${stripId}${letters(segmentIndex)}`;
      const only = segment.items.length === 1 ? segment.items[0] : null;
      const whole = only && only.d >= strip.depth - EPS && only.s >= segment.length - EPS;
      steps.push({
        id: segmentId,
        level: 2,
        text: `${verb(2)} at ${mm(segment.length)}${whole ? `, panel ${panelTag(only.panel)}` : ""}`,
      });
      if (S - (segment.offset + segment.length) > EPS) {
        cuts.push({ level: 2, label: segmentId, ...acrossStrips(segment.offset + segment.length + kerf / 2, strip.offset, strip.offset + strip.depth) });
      }

      segment.items.forEach((item, itemIndex) => {
        placements.push({ ...rect(strip.offset + item.offsetD, segment.offset, item.d, item.s), panel: item.panel, turned: item.opt.turned });

        const after = strip.depth - (item.offsetD + item.d);
        if (!whole) {
          steps.push({
            id: `${segmentId}${itemIndex + 1}`,
            level: 3,
            text: after > EPS
              ? `${verb(3)} at ${mm(item.d)}, panel ${panelTag(item.panel)}`
              : `What is left is ${mm(item.d)}, panel ${panelTag(item.panel)}`,
          });
        }
        if (after > EPS && !whole) {
          cuts.push({ level: 3, label: "", ...alongStrips(strip.offset + item.offsetD + item.d + kerf / 2, segment.offset, segment.offset + segment.length) });
        }

        if (item.s < segment.length - EPS) {
          steps.push({ id: `${segmentId}${itemIndex + 1}T`, level: 4, text: `${verb(4)} to ${mm(item.s)}, panel ${panelTag(item.panel)}` });
          cuts.push({ level: 4, label: "", ...acrossStrips(segment.offset + item.s + kerf / 2, strip.offset + item.offsetD, strip.offset + item.offsetD + item.d) });
          addOffcut(rect(strip.offset + item.offsetD, segment.offset + item.s + kerf, item.d, segment.length - item.s - kerf));
        }
      });

      // What is left in this piece's depth after the stacked panels.
      addOffcut(rect(strip.offset + segment.usedD + kerf, segment.offset, strip.depth - segment.usedD - kerf, segment.length));
      usedS = segment.offset + segment.length;
    });

    // What is left along the strip after its last piece.
    addOffcut(rect(strip.offset, usedS + kerf, strip.depth, S - usedS - kerf));
    usedD = strip.offset + strip.depth;
  });

  // What is left of the board after the last strip.
  addOffcut(rect(usedD + kerf, 0, D - usedD - kerf, S));

  return finaliseSheet({ placements, offcuts, cuts, steps, mode: raw.mode, offcutPieces: 0 }, board);
}

function finaliseSheet(sheet, board) {
  const panelArea = sheet.placements.reduce((total, place) => total + place.w * place.h, 0);
  const boardArea = board.length_mm * board.width_mm;
  return {
    ...sheet,
    panel_count: sheet.placements.length,
    used_pct: boardArea ? Math.round((panelArea / boardArea) * 100) : 0,
    usable_offcuts: sheet.offcuts.filter((offcut) => offcut.usable).length,
  };
}

// ── Emptying the last board into the offcuts of the others ───────────────────
//
// Even the best packing can finish with a board carrying one small panel while
// the boards before it have offcuts that panel would fit. That board is money
// on the floor.
//
// So after packing, the emptiest board is tried against the offcuts of every
// other board. Each offcut is already a separate piece once that board's cuts
// are made, so a panel placed in its corner needs at most two more cuts and the
// whole sheet stays cuttable on a panel saw. A board is only taken away if every
// panel on it finds a home; moving some of them would add cuts and save nothing.

function cloneSheet(sheet) {
  return {
    ...sheet,
    placements: sheet.placements.slice(),
    offcuts: sheet.offcuts.map((offcut) => ({ ...offcut })),
    cuts: sheet.cuts.slice(),
    steps: sheet.steps.slice(),
    offcutPieces: sheet.offcutPieces || 0,
  };
}

// Two guillotine splits are possible once a panel sits in the corner of an
// offcut. The one that leaves the biggest single piece is kept.
function splitOffcut(free, width, height, kerf) {
  const rightW = free.w - width - kerf;
  const belowH = free.h - height - kerf;
  const alongFirst = [
    { x: free.x + width + kerf, y: free.y, w: rightW, h: height },
    { x: free.x, y: free.y + height + kerf, w: free.w, h: belowH },
  ];
  const acrossFirst = [
    { x: free.x + width + kerf, y: free.y, w: rightW, h: free.h },
    { x: free.x, y: free.y + height + kerf, w: width, h: belowH },
  ];
  const real = (rects) => rects.filter((rect) => rect.w > EPS && rect.h > EPS);
  const biggest = (rects) => Math.max(0, ...real(rects).map((rect) => rect.w * rect.h));
  const along = biggest(alongFirst) >= biggest(acrossFirst);
  return { along, rects: real(along ? alongFirst : acrossFirst) };
}

function placeInOffcuts(sheets, panel, opts, settings) {
  const kerf = settings.kerf_mm;
  let best = null;
  sheets.forEach((sheet, sheetIndex) => {
    if (!sheet) return;
    sheet.offcuts.forEach((free, offcutIndex) => {
      for (const opt of opts) {
        if (opt.x > free.w + EPS || opt.y > free.h + EPS) continue;
        // Best short side fit: the tightest offcut, so the big ones stay big.
        const score = Math.min(free.w - opt.x, free.h - opt.y);
        if (!best || score < best.score - EPS) best = { sheetIndex, offcutIndex, opt, score };
      }
    });
  });
  if (!best) return false;

  const sheet = sheets[best.sheetIndex];
  const free = sheet.offcuts[best.offcutIndex];
  const width = best.opt.x;
  const height = best.opt.y;
  const { along, rects } = splitOffcut(free, width, height, kerf);
  sheet.offcutPieces += 1;
  const label = `O${sheet.offcutPieces}`;

  const needBelow = free.h - height > EPS;
  const needRight = free.w - width > EPS;
  const alongCut = (length) => ({ level: 2, label, x1: free.x, y1: free.y + height + kerf / 2, x2: free.x + length, y2: free.y + height + kerf / 2 });
  const acrossCut = (length) => ({ level: 2, label, x1: free.x + width + kerf / 2, y1: free.y, x2: free.x + width + kerf / 2, y2: free.y + length });
  const words = [];
  if (along) {
    if (needBelow) { sheet.cuts.push(alongCut(free.w)); words.push(`rip at ${mm(height)}`); }
    if (needRight) { sheet.cuts.push(acrossCut(height)); words.push(`cross cut at ${mm(width)}`); }
  } else {
    if (needRight) { sheet.cuts.push(acrossCut(free.h)); words.push(`cross cut at ${mm(width)}`); }
    if (needBelow) { sheet.cuts.push(alongCut(width)); words.push(`rip at ${mm(height)}`); }
  }

  sheet.steps.push({
    id: label,
    level: 1,
    text: `From the ${mm(Math.max(free.w, free.h))} x ${mm(Math.min(free.w, free.h))} offcut, ${words.length ? words.join(", then ") : "use it whole"}, panel ${panelTag(panel)}`,
  });
  sheet.placements.push({ x: free.x, y: free.y, w: width, h: height, panel, turned: best.opt.turned });
  sheet.offcuts.splice(best.offcutIndex, 1, ...rects.map((rect) => ({ ...rect, usable: isUsable(rect, settings) })));
  return true;
}

export function consolidateSheets(input, board, settings, optsById) {
  let sheets = input.map(cloneSheet);
  const areaOf = (sheet) => sheet.placements.reduce((total, place) => total + place.w * place.h, 0);

  for (let changed = true; changed && sheets.length > 1;) {
    changed = false;
    const emptiestFirst = sheets.map((_, index) => index).sort((a, b) => areaOf(sheets[a]) - areaOf(sheets[b]));
    for (const victim of emptiestFirst) {
      const trial = sheets.map((sheet, index) => (index === victim ? null : cloneSheet(sheet)));
      const panels = sheets[victim].placements
        .map((place) => place.panel)
        .sort((a, b) => b.cutH * b.cutW - a.cutH * a.cutW);
      const allFit = panels.every((panel) => placeInOffcuts(trial, panel, optsById.get(panel.id) || [], settings));
      if (allFit) {
        sheets = trial.filter(Boolean);
        changed = true;
        break;
      }
    }
  }

  return sheets.map((sheet) => finaliseSheet(sheet, board));
}

// ── The whole plan ───────────────────────────────────────────────────────────

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function buildCuttingPlan({ rows = [], colours = [], settings: rawSettings = {} } = {}) {
  const settings = normalizeCuttingSettings(rawSettings);
  const index = indexColours(colours);
  const { panels, held, noSize } = cuttingPanelsFromRows(rows, settings);

  const byBoard = new Map();
  for (const panel of panels) {
    const key = boardKey(panel.spec);
    if (!byBoard.has(key)) byBoard.set(key, []);
    byBoard.get(key).push(panel);
  }

  const groups = [];
  // Panels too big for their board as they are, one entry per panel on the
  // order however many copies it has, with what the popup can offer each.
  const oversize = new Map();
  for (const [key, list] of byBoard) {
    const board = resolveBoard(list[0].spec, index, settings);
    const usable = usableSize(board, settings);

    // A panel that will not fit as ordered is turned or split here if somebody
    // said so. The order is not touched: this list is the plan's own copy.
    const cutPanels = [];
    for (const panel of list) {
      const axis = axisFor(panel, settings, board);
      if (fitsBoard(panel, axis, usable)) {
        cutPanels.push(panel);
        continue;
      }
      const fix = settings.panel_fixes[panel.fixKey] || null;
      const entry = oversize.get(panel.fixKey) || { panel, board, axis, copies: 0, fix, works: false, advice: adviceFor(panel, axis, usable) };
      entry.copies += 1;
      oversize.set(panel.fixKey, entry);

      let replacement = null;
      if (fix?.action === "turn") {
        const turned = { ...panel, turnedForCutting: true };
        if (fitsBoard(turned, axis, usable)) replacement = [turned];
      } else if (fix?.action === "split") {
        const pieces = splitPieces(panel, fix);
        if (pieces && pieces.every((piece) => fitsBoard(piece, axis, usable))) replacement = pieces;
      }
      if (replacement) {
        entry.works = true;
        cutPanels.push(...replacement);
      } else {
        // Left as it is, so the packer reports it as not placed.
        cutPanels.push(panel);
      }
    }

    const items = cutPanels.map((panel) => ({ panel, opts: orientations(panel, axisFor(panel, settings, board)) }));
    const pack = optimiseBoards(items, board, settings);
    const optsById = new Map(items.map((item) => [item.panel.id, item.opts]));
    groups.push({
      key,
      board,
      panels: list,
      sheets: consolidateSheets(pack.boards.map((raw) => describeSheet(raw, board, settings)), board, settings, optsById),
      unplaced: pack.unplaced,
    });
  }

  groups.sort((a, b) =>
    a.board.colour.localeCompare(b.board.colour) || a.board.thickness_mm - b.board.thickness_mm
  );

  const tapeNotRecorded = panels.filter((panel) => !panel.tape.recorded);
  const warnings = [];
  for (const group of groups) {
    const name = [group.board.colour, group.board.thickness_mm ? `${group.board.thickness_mm}mm` : ""].filter(Boolean).join(" ") || "A board";
    if (group.unplaced.length) {
      warnings.push(`${plural(group.unplaced.length, "panel")} will not fit on a ${mm(group.board.length_mm)} long x ${mm(group.board.width_mm)} wide ${name} board and ${group.unplaced.length === 1 ? "is" : "are"} not on these sheets. Swap or split ${group.unplaced.length === 1 ? "it" : "them"} in the cutting plan popup.`);
    }
    if (group.board.size_source === "fallback") {
      warnings.push(`${name} has no board size in the colour library, so ${FALLBACK_BOARD.length_mm} long x ${FALLBACK_BOARD.width_mm} wide is assumed. Check it before cutting.`);
    }
    if (group.board.grain_source === "finish") {
      warnings.push(`Whether ${name} has a grain is a guess from its finish name. Set it here or in the colour library.`);
    }
  }
  if (tapeNotRecorded.length) {
    warnings.push(`${plural(tapeNotRecorded.length, "panel")} ${tapeNotRecorded.length === 1 ? "has" : "have"} no taped edges recorded, so ${tapeNotRecorded.length === 1 ? "it is" : "they are"} cut to the order size.`);
  }
  if (held.length) {
    warnings.push(`${plural(held.length, "panel")} ${held.length === 1 ? "is" : "are"} on a pending variation and ${held.length === 1 ? "is" : "are"} not on these sheets.`);
  }
  if (noSize.length) {
    warnings.push(`${plural(noSize.length, "panel")} ${noSize.length === 1 ? "has" : "have"} no size recorded and ${noSize.length === 1 ? "is" : "are"} not on these sheets.`);
  }

  // THE WORKSHOP RECORD. Every panel laid out differently to the order, in
  // words, for the last page of the PDF. The order itself is never changed.
  const fixes = [];
  for (const entry of oversize.values()) {
    const { panel, board, axis, copies, fix } = entry;
    const label = panelLabel(panel);
    const about = `${label} ${panel.name}${panel.source ? ` (${panel.source})` : ""}, cut size ${mm(panel.cutH)} x ${mm(panel.cutW)}`;
    const all = copies === 2 ? " This applies to both of them." : copies > 2 ? ` This applies to all ${copies} of them.` : "";
    if (!fix) continue;
    if (!entry.works) {
      warnings.push(`The ${fix.action === "turn" ? "swap" : "split"} chosen for ${label} still does not fit a ${mm(board.length_mm)} x ${mm(board.width_mm)} board, so it is not on these sheets.`);
      continue;
    }
    if (fix.action === "turn") {
      const grain = axis === "height"
        ? " The grain runs across this panel instead of up it."
        : axis === "width" ? " The grain runs up this panel instead of across it." : "";
      fixes.push({ key: panel.fixKey, action: "turn", text: `${about}: height and width swapped for cutting only.${grain}${all} The order is not changed.` });
    } else {
      const total = fix.direction === "height" ? panel.cutH : panel.cutW;
      const first = Math.min(fix.first_mm, total);
      const other = fix.direction === "height" ? panel.cutW : panel.cutH;
      const pieces = fix.direction === "height"
        ? `${mm(first)} and ${mm(total - first)} high, both ${mm(other)} wide`
        : `${mm(first)} and ${mm(total - first)} wide, both ${mm(other)} high`;
      const grain = board.has_grain ? " The grain runs the same way on both pieces as on the panel." : "";
      fixes.push({ key: panel.fixKey, action: "split", text: `${about}: cut as 2 pieces, ${label}A and ${label}B, ${pieces}. The join edge is a raw cut with no tape.${grain}${all} The order is not changed.` });
    }
  }

  return {
    settings,
    groups,
    held,
    noSize,
    tapeNotRecorded,
    warnings,
    oversize: [...oversize.values()],
    fixes,
    totals: {
      boards: groups.reduce((total, group) => total + group.sheets.length, 0),
      panels: groups.reduce((total, group) => total + group.sheets.reduce((sum, sheet) => sum + sheet.panel_count, 0), 0),
      unplaced: groups.reduce((total, group) => total + group.unplaced.length, 0),
    },
  };
}

/** What the popup needs, without the geometry. */
export function planSummary(plan) {
  return {
    totals: plan.totals,
    warnings: plan.warnings,
    oversize: (plan.oversize || []).map((entry) => ({
      key: entry.panel.fixKey,
      label: panelLabel(entry.panel),
      name: entry.panel.name,
      source: entry.panel.source,
      cut_height_mm: entry.panel.cutH,
      cut_width_mm: entry.panel.cutW,
      copies: entry.copies,
      board: `${entry.board.colour} ${mm(entry.board.length_mm)} long x ${mm(entry.board.width_mm)} wide`,
      grain_axis: entry.axis,
      grain_locked: entry.advice.grainLocked,
      can_turn: entry.advice.canTurn,
      split_options: entry.advice.splitOptions,
      fix: entry.fix,
      works: entry.works,
    })),
    boards: plan.groups.map((group) => ({
      key: group.key,
      supplier: group.board.supplier,
      colour: group.board.colour,
      finish: group.board.finish,
      material: group.board.material,
      thickness_mm: group.board.thickness_mm,
      width_mm: group.board.width_mm,
      length_mm: group.board.length_mm,
      has_grain: group.board.has_grain,
      size_source: group.board.size_source,
      grain_source: group.board.grain_source,
      panels: group.panels.length,
      boards: group.sheets.length,
      used_pct: group.sheets.length
        ? Math.round(group.sheets.reduce((total, sheet) => total + sheet.used_pct, 0) / group.sheets.length)
        : 0,
      unplaced: group.unplaced.length,
    })),
  };
}

/** Only the fields worth storing on the order. */
export function storedCuttingSettings(settings) {
  const clean = normalizeCuttingSettings(settings);
  return {
    kerf_mm: clean.kerf_mm,
    trim_mm: clean.trim_mm,
    tape_mm: clean.tape_mm,
    min_offcut_length_mm: clean.min_offcut_length_mm,
    min_offcut_width_mm: clean.min_offcut_width_mm,
    standard_grain: clean.standard_grain,
    boards: clean.boards,
    panel_fixes: clean.panel_fixes,
  };
}
