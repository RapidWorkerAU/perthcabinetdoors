// THE CUTTING PLAN.
//
// A sheet somebody cuts from has to be right in ways a buying guide does not:
// every size is a cut size, the blade is between every two pieces, nothing
// overlaps, a grained panel is never turned, and a panel too big for its board
// is said out loud rather than squeezed on.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCuttingPlan,
  normalizeCuttingSettings,
  planSummary,
  storedCuttingSettings,
  tapeForRow,
} from "../lib/pcd-cutting-plan.js";
import { generateCuttingPlanPdf, planPages } from "../lib/pcd-cutting-plan-pdf.js";

const GREIGE = { supplier: "Polytec", colour: "Greige", finish: "Smooth", thickness: "18mm", material: "Decorative Board" };
const OAK = { supplier: "Polytec", colour: "Sepia Oak", finish: "Ravine", thickness: "18mm", material: "Decorative Board" };
const COLOURS = [
  { supplier: "Polytec", colour: "Greige", finish: "Smooth", thicknessMm: 18, boardWidthMm: 1200, boardHeightMm: 2400, hasGrain: false },
  { supplier: "Polytec", colour: "Sepia Oak", finish: "Ravine", thicknessMm: 18, boardWidthMm: 1200, boardHeightMm: 2400, hasGrain: true },
];

let next = 1;
const row = (over = {}) => {
  const id = next++;
  return {
    itemId: `item-${id}`,
    panelKey: `line:${id}`,
    panelNo: id,
    piece: "Door",
    source: `Line ${id}`,
    qty: 1,
    kind: "line",
    heightMm: 600,
    widthMm: 400,
    productType: "Door",
    grainDirection: "",
    bandedEdges: [],
    edgeFinish: "",
    edgeMould: "",
    boardSpec: GREIGE,
    ...over,
  };
};

const settings = (over = {}) => normalizeCuttingSettings({ kerf_mm: 3.2, trim_mm: 10, ...over });

const allPlacements = (plan) => plan.groups.flatMap((group) => group.sheets.flatMap((sheet, index) => sheet.placements.map((place) => ({ ...place, sheet: `${group.key}#${index}`, board: group.board }))));

test("a taped edge comes off the cut size, and only a recorded one", () => {
  const s = settings();
  const all = tapeForRow(row({ bandedEdges: ["Top", "Bottom", "Left", "Right"] }), s);
  assert.equal(all.height_less, 2);
  assert.equal(all.width_less, 2);

  const two = tapeForRow(row({ bandedEdges: ["Left", "Right"], edgeMould: "2mm Square Edge" }), s);
  assert.equal(two.height_less, 0);
  assert.equal(two.width_less, 4, "the profile's own 2mm wins over the setting");

  // Nobody said. A panel cut big can be trimmed; one cut small is scrap.
  const unknown = tapeForRow(row({ bandedEdges: null }), s);
  assert.equal(unknown.recorded, false);
  assert.equal(unknown.height_less + unknown.width_less, 0);

  const raw = tapeForRow(row({ bandedEdges: ["Top"], boardSpec: { ...GREIGE, material: "Raw MDF" } }), s);
  assert.equal(raw.height_less, 0, "raw board is not taped");
});

test("a carcass side loses its front edge tape off the short side", () => {
  const side = tapeForRow(row({ kind: "carcass", pieceLabel: "Left side panel", heightMm: 720, widthMm: 560 }), settings());
  assert.equal(side.width_less, 1);
  assert.equal(side.height_less, 0);
  const back = tapeForRow(row({ kind: "carcass", pieceLabel: "Back panel", heightMm: 720, widthMm: 600 }), settings());
  assert.equal(back.width_less + back.height_less, 0);
});

test("the plan prints cut sizes", () => {
  const plan = buildCuttingPlan({ rows: [row({ heightMm: 745, widthMm: 392, bandedEdges: ["Top", "Bottom", "Left", "Right"] })], colours: COLOURS, settings: settings() });
  const [place] = allPlacements(plan);
  assert.equal(place.panel.cutH, 743);
  assert.equal(place.panel.cutW, 390);
  assert.equal(place.w * place.h, 743 * 390);
});

test("nothing overlaps, the blade sits between every two pieces, and the trim is left alone", () => {
  const rows = [
    ...Array.from({ length: 9 }, () => row({ heightMm: 745, widthMm: 392 })),
    ...Array.from({ length: 6 }, () => row({ heightMm: 2145, widthMm: 297 })),
    ...Array.from({ length: 12 }, () => row({ heightMm: 280, widthMm: 560 })),
  ];
  const s = settings();
  const plan = buildCuttingPlan({ rows, colours: COLOURS, settings: s });
  const places = allPlacements(plan);
  assert.equal(places.length, rows.length, "every panel is on a board");

  for (const place of places) {
    assert.ok(place.x >= s.trim_mm - 0.01 && place.y >= s.trim_mm - 0.01, "inside the trim");
    assert.ok(place.x + place.w <= place.board.length_mm - s.trim_mm + 0.01, "inside the length");
    assert.ok(place.y + place.h <= place.board.width_mm - s.trim_mm + 0.01, "inside the width");
  }

  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      const a = places[i];
      const b = places[j];
      if (a.sheet !== b.sheet) continue;
      const apartX = a.x + a.w + s.kerf_mm <= b.x + 0.01 || b.x + b.w + s.kerf_mm <= a.x + 0.01;
      const apartY = a.y + a.h + s.kerf_mm <= b.y + 0.01 || b.y + b.h + s.kerf_mm <= a.y + 0.01;
      assert.ok(apartX || apartY, `panels ${a.panel.panelNo} and ${b.panel.panelNo} overlap or have no blade between them`);
    }
  }
});

test("six 600 x 400 panels go on one board, not two", () => {
  const plan = buildCuttingPlan({ rows: Array.from({ length: 6 }, () => row()), colours: COLOURS, settings: settings() });
  assert.equal(plan.totals.boards, 1);
});

test("a board left with one small panel is emptied into the offcuts of the others", () => {
  // The strip packer filled four boards and put the last small panel on a fifth.
  // The offcuts of the first four had room for it.
  const sizes = [[745, 392], [745, 397], [745, 199], [2145, 297], [745, 400], [645, 467], [1062, 541], [1076, 1083], [745, 858], [745, 623], [35, 2145]];
  const rows = sizes.flatMap(([heightMm, widthMm]) => [row({ heightMm, widthMm }), row({ heightMm, widthMm })]);
  const plan = buildCuttingPlan({ rows, colours: COLOURS, settings: settings() });
  assert.equal(plan.totals.panels, rows.length, "nothing is lost on the way");
  assert.ok(plan.totals.boards <= 4, `took ${plan.totals.boards} boards`);
  const moved = plan.groups.flatMap((group) => group.sheets.flatMap((sheet) => sheet.steps)).filter((step) => /^O\d+$/.test(step.id));
  for (const step of moved) assert.match(step.text, /offcut/);
});

test("a grained panel is never turned", () => {
  const rows = Array.from({ length: 8 }, () => row({ heightMm: 900, widthMm: 450, grainDirection: "Vertical", boardSpec: OAK }));
  const plan = buildCuttingPlan({ rows, colours: COLOURS, settings: settings() });
  for (const place of allPlacements(plan)) {
    assert.equal(place.w, place.panel.cutH, "the panel's height runs along the board's length, with the grain");
  }
});

test("a panel too big for its board is left off and said out loud", () => {
  const plan = buildCuttingPlan({ rows: [row({ heightMm: 2500, widthMm: 500, grainDirection: "Vertical", boardSpec: OAK })], colours: COLOURS, settings: settings() });
  assert.equal(plan.totals.unplaced, 1);
  assert.match(plan.warnings.join(" "), /will not fit/);
});

// ── Panels too big for their board ───────────────────────────────────────────

// A 1300 wide door on a grained 1200 wide board: its grain runs up the door,
// along the board's length, so it cannot lie the way that would fit.
const wideGrained = () => row({ heightMm: 800, widthMm: 1300, grainDirection: "Vertical", boardSpec: OAK, bandedEdges: [] });

test("a panel too big as ordered is offered a swap and a split, and left off until somebody chooses", () => {
  const panel = wideGrained();
  const plan = buildCuttingPlan({ rows: [panel], colours: COLOURS, settings: settings() });
  assert.equal(plan.totals.unplaced, 1);
  const [entry] = planSummary(plan).oversize;
  assert.equal(entry.key, `${panel.itemId}|${panel.panelKey}`);
  assert.equal(entry.can_turn, true, "turned, 1300 runs along the 2400 length");
  assert.equal(entry.grain_locked, true);
  assert.ok(entry.split_options.some((option) => option.direction === "width"), "two 650 wide pieces fit with the grain kept");
  assert.equal(plan.fixes.length, 0, "nothing is recorded until somebody says yes");
});

test("a swap places the panel, records it with the grain, and never touches the order", () => {
  const panel = wideGrained();
  const before = JSON.parse(JSON.stringify(panel));
  const plan = buildCuttingPlan({
    rows: [panel],
    colours: COLOURS,
    settings: settings({ panel_fixes: { [`${panel.itemId}|${panel.panelKey}`]: { action: "turn" } } }),
  });
  assert.equal(plan.totals.unplaced, 0);
  const [place] = allPlacements(plan);
  assert.equal(place.w, 1300, "the 1300 now runs along the board");
  assert.equal(place.panel.cutH, 800, "the cut size is the panel's own, only the way it lies changed");
  assert.match(plan.fixes[0].text, /swapped for cutting only/);
  assert.match(plan.fixes[0].text, /grain runs across/);
  assert.match(plan.fixes[0].text, /order is not changed/);
  assert.deepEqual(panel, before, "the order row is exactly as it was");
});

test("a split makes two pieces that add up to the panel, keep the grain, and drop tape on the join", () => {
  const panel = row({ heightMm: 800, widthMm: 1300, grainDirection: "Vertical", boardSpec: OAK, bandedEdges: ["Top", "Bottom", "Left", "Right"] });
  const plan = buildCuttingPlan({
    rows: [panel],
    colours: COLOURS,
    settings: settings({ panel_fixes: { [`${panel.itemId}|${panel.panelKey}`]: { action: "split", direction: "width", first_mm: 700 } } }),
  });
  assert.equal(plan.totals.unplaced, 0);
  const pieces = allPlacements(plan).map((place) => place);
  assert.equal(pieces.length, 2);
  assert.equal(pieces.reduce((total, place) => total + place.panel.cutW, 0), 1298, "700 plus 598 is the 1298 cut width");
  for (const place of pieces) {
    assert.equal(place.w, place.panel.cutH, "each piece keeps the grain running up it");
  }
  const tags = pieces.map((place) => place.panel.tag).sort();
  assert.deepEqual(tags, [`#${panel.panelNo}A`, `#${panel.panelNo}B`]);
  assert.ok(!pieces.find((p) => p.panel.tag.endsWith("A")).panel.tape.edges.includes("Right"), "no tape on the join");
  assert.match(plan.fixes[0].text, /2 pieces/);
  assert.match(plan.fixes[0].text, /raw cut/);
});

test("a split that still will not fit stays off and says so", () => {
  const panel = wideGrained();
  const plan = buildCuttingPlan({
    rows: [panel],
    colours: COLOURS,
    settings: settings({ panel_fixes: { [`${panel.itemId}|${panel.panelKey}`]: { action: "split", direction: "width", first_mm: 1250 } } }),
  });
  assert.equal(plan.totals.unplaced, 1);
  assert.match(plan.warnings.join(" "), /still does not fit/);
  assert.equal(plan.fixes.length, 0);
});

test("the workshop record goes on the last page", () => {
  const panel = wideGrained();
  const plan = buildCuttingPlan({
    rows: [panel, row({ boardSpec: OAK, grainDirection: "Vertical" })],
    colours: COLOURS,
    settings: settings({ panel_fixes: { [`${panel.itemId}|${panel.panelKey}`]: { action: "turn" } } }),
  });
  const pages = planPages(plan);
  const last = pages[pages.length - 1];
  assert.equal(last.kind, "checks");
  assert.equal(last.title, "Workshop record");
  assert.ok(last.lines.some((line) => /order is not changed/i.test(line.text || "")));
  assert.equal(generateCuttingPlanPdf({ order: { order_number: "PCD-O-TEST" }, plan }).subarray(0, 5).toString("latin1"), "%PDF-");
});

test("every board lists its cuts in order, strip first", () => {
  const plan = buildCuttingPlan({ rows: Array.from({ length: 5 }, () => row()), colours: COLOURS, settings: settings() });
  const [sheet] = plan.groups[0].sheets;
  assert.equal(sheet.steps[0].level, 1);
  assert.match(sheet.steps[0].text, /strip/);
  assert.ok(sheet.steps.some((step) => /panel #/.test(step.text)), "cuts name the panel they give");
});

test("a board the library has no size for is assumed and flagged", () => {
  const plan = buildCuttingPlan({ rows: [row()], colours: [], settings: settings() });
  assert.equal(plan.groups[0].board.size_source, "fallback");
  assert.match(plan.warnings.join(" "), /no board size/);
});

test("settings fall back from the order to the quote to the business defaults", () => {
  const fromBusiness = normalizeCuttingSettings(null, { businessDefaults: { saw_kerf_mm: 4, board_edge_trim_mm: 5 } });
  assert.equal(fromBusiness.kerf_mm, 4);
  assert.equal(fromBusiness.trim_mm, 5);

  const fromQuote = normalizeCuttingSettings(null, { quoteSettings: { kerf_mm: 3, boards: { x: { has_grain: true } } }, businessDefaults: { saw_kerf_mm: 4 } });
  assert.equal(fromQuote.kerf_mm, 3);
  assert.deepEqual(fromQuote.boards, { x: { has_grain: true } });

  const blank = normalizeCuttingSettings({ kerf_mm: "" }, { businessDefaults: { saw_kerf_mm: 4 } });
  assert.equal(blank.kerf_mm, 4, "a blank box is not a zero blade");

  assert.deepEqual(Object.keys(storedCuttingSettings(blank)).sort(), [
    "boards", "kerf_mm", "min_offcut_length_mm", "min_offcut_width_mm", "panel_fixes", "standard_grain", "tape_mm", "trim_mm",
  ]);
});

test("the popup summary counts boards per colour", () => {
  const rows = [...Array.from({ length: 3 }, () => row()), row({ boardSpec: OAK })];
  const summary = planSummary(buildCuttingPlan({ rows, colours: COLOURS, settings: settings() }));
  assert.equal(summary.boards.length, 2);
  assert.equal(summary.totals.panels, 4);
});

test("the PDF is one page per board, plus a checks page only when something needs checking", () => {
  const rows = Array.from({ length: 14 }, () => row({ heightMm: 900, widthMm: 560, bandedEdges: ["Left", "Right"] }));
  const plan = buildCuttingPlan({ rows, colours: COLOURS, settings: settings() });
  const pages = planPages(plan);
  assert.equal(pages.filter((page) => page.kind === "board").length, plan.totals.boards);
  assert.equal(pages.filter((page) => page.kind === "checks").length, 0);

  const buffer = generateCuttingPlanPdf({ order: { order_number: "PCD-O-TEST", customer_name: "Test" }, plan });
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
});
