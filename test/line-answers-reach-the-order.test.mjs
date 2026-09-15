// EVERY ANSWER ON THE WEBSITE FORM, WALKED ALL THE WAY TO THE BENCH.
//
// A line takes four hops: the form's row, the stored request line, the quote
// line, and the order line the workshop reads. Each hop had its own list of
// what it kept, and an answer missing from any one list stopped there without
// a word. An audit on 11 September 2026 found:
//
//   the kind of panel, the banded edges, the hinge boring, the grain and who
//   supplies it never even reached a saved quote line: calculateQuoteLine,
//   which every save path prices through, built its answer field by field and
//   left all of them out. Not one quote line in the database had any of them;
//
//   and had they got there, they would have stopped at the quote, because the
//   order line had no columns for them;
//
//   every Laminex door profile was blanked on its way onto the quote, because
//   the saver checked it against Polytec's catalogue typed into the code;
//
//   hardware picked on the website reached the quote at no price, and was left
//   off the list of lines with no price.
//
// These walk real rows through the real functions of every hop, so an answer
// dropped by any one of them fails here rather than at the factory.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { quoteRequestLine } from "../lib/pcd-quote-request-payload.js";
import { quoteRequestLineRow } from "../lib/pcd-quote-request.js";
import { convertedQuoteLine, projectNameFromRequest, unpricedSummary } from "../lib/pcd-quote-request-convert.js";
import { calculateQuoteLine, calculateQuoteTotals, DEFAULT_BUSINESS_DEFAULTS, formatItemSpecs } from "../lib/pcd-quote-utils.js";
import { quoteLineRow } from "../app/api/admin/quotes/[id]/_quote-line-save.js";
import {
  LINE_ANSWER_COLUMNS,
  lineAnswers,
  missingCarriedColumn,
  orderLineFromQuoteLine,
  orderNotesFromRequest,
} from "../lib/pcd-order-from-quote.js";
import { orderLineFromVariationLine } from "../lib/pcd-order-variations.js";
import { createHardwareResolver } from "../lib/pcd-hardware-line.js";
import { buildCutListRows, buildMadeToOrderRows } from "../lib/pcd-cabinet-pdf.js";
import { hingeSummaryLines } from "../lib/pcd-hinges.js";
import { validatedLineAnswers } from "../lib/pcd-line-details.js";
import { lineEdgeLines, lineHeading } from "../lib/pcd-quote-line-display.js";

const businessDefaults = { ...DEFAULT_BUSINESS_DEFAULTS, markup_percent: 25 };
// No board prices: this is about what is carried, not what it costs.
const resolveBoard = () => ({ ok: false, reason: "not_found", message: "No price." });
const HARDWARE = [
  { id: "11111111-1111-1111-1111-111111111111", type: "hinge", brand: "Blum", name: "110 Deg Inserta", sku: "71B3550", unit_cost_ex_gst: 6.4, description: "Clip top hinge", is_active: true },
  { id: "22222222-2222-2222-2222-222222222222", type: "handle", brand: "Castella", name: "Bar handle", sku: "CB128", unit_cost_ex_gst: 12, is_active: true },
];
const resolveHardware = createHardwareResolver(HARDWARE);

// The website's row, as the builder holds it.
const formRow = (over = {}) => ({
  type: "Door", material: "Decorative Board", thickness: "18mm", finish: "Matt", colour: "Classic White",
  supplierName: "Polytec", width: "450", height: "720", qty: "2", note: "", bandedEdges: null,
  holeType: "", preDrill: false, hingeQty: "", hingeSide: "", hingeFromBottomMm: "", hingeFromTopMm: "",
  hingeMiddlesMm: [], hingeMiddlesTouched: false, panelUse: "", profileType: "", profile: "", edgeMould: "",
  cabinetBrand: "", hardwareId: "", hardwareName: "", ...over,
});

// Website row to order line, through every hop's own function.
function toOrder(row) {
  const request = quoteRequestLineRow(quoteRequestLine(row), 0);
  const entry = convertedQuoteLine({ ...request, id: "req-line" }, {
    resolveBoard, resolveHardware, quoteRequest: {}, businessDefaults,
  });
  const quote = { ...quoteLineRow(calculateQuoteLine(entry.line, businessDefaults), "quote", 0), id: "quote-line" };
  const order = orderLineFromQuoteLine(quote, { orderId: "order", index: 0 });
  return { request, entry, quote, order };
}

// ── The answers the order never used to get ─────────────────────────────────

test("a scribe arrives on the order as a scribe, with its edges", () => {
  const { order } = toOrder(formRow({ type: "Panel", panelUse: "Scribe", bandedEdges: ["Left", "Top"] }));
  assert.equal(order.panel_use, "Scribe");
  assert.deepEqual(order.banded_edges, ["Top", "Left"]);
  assert.equal(order.edge_finish, "Leave one edge raw, see notes", "and the older answer, worked out from it");
});

test("the hinge boring, the handing and the cups all reach the order", () => {
  const { order } = toOrder(formRow({
    preDrill: true, hingeQty: "3 hinges", hingeSide: "Left", holeType: "Blum Inserta",
    hingeFromBottomMm: "100", hingeFromTopMm: "100", height: "2000",
  }));
  assert.equal(order.hinge_holes, true);
  assert.equal(order.hole_type, "Blum Inserta");
  assert.equal(order.hinge_side, "Left");
  assert.equal(order.hinge_from_bottom_mm, 100);
  assert.equal(order.hinge_from_top_mm, 100);
  assert.deepEqual(order.hinge_middles_mm, [1000], "the middle cup, spaced the way the form showed it");
});

test("pricing a line keeps every answer, on every save path", () => {
  // The editor saves one line through calculateQuoteLine; the whole quote save
  // and a duplicate go through calculateQuoteTotals, which calls it per line.
  const answers = {
    panel_use: "Scribe", banded_edges: ["Left"], hole_type: "Blum Inserta", edge_finish: "All four edges",
    grain_direction: "Vertical", supplied_by: "Customer supplies", hardware_type: "hinge",
  };
  const one = calculateQuoteLine({ product_type: "Panel", ...answers }, businessDefaults);
  const [many] = calculateQuoteTotals([{ product_type: "Panel", ...answers }], 0.1, businessDefaults).lines;
  for (const [column, value] of Object.entries(answers)) {
    assert.deepEqual(one[column], value, `calculateQuoteLine dropped ${column}`);
    assert.deepEqual(many[column], value, `calculateQuoteTotals dropped ${column}`);
  }
});

test("every answer column the order carries is one the quote line has", () => {
  // If a column is added to the order list and not the quote saver, or the
  // other way round, one of them is a list the other does not know about.
  const quote = quoteLineRow({ product_type: "Door" }, "q", 0);
  for (const column of LINE_ANSWER_COLUMNS) {
    assert.ok(column in quote, `${column} is carried to the order but the quote saver never writes it`);
  }
});

test("nothing the form asked is left behind on the way to the order", () => {
  const { request, order } = toOrder(formRow({
    type: "Door", material: "Thermolaminate", thickness: "18mm", finish: "Natura", colour: "Bottega Oak",
    profileType: "Minimal", profile: "Hamilton", edgeMould: "", preDrill: true, hingeQty: "2 hinges",
    hingeSide: "Right", holeType: "35mm cup only", cabinetBrand: "IKEA Metod", note: "Match the pantry",
  }));
  for (const field of [
    "product_type", "material", "thickness", "finish", "colour", "supplier_name", "profile_type", "profile",
    "width_mm", "height_mm", "qty", "hinge_holes", "hinge_qty", "hinge_side", "hole_type", "cabinet_brand",
  ]) {
    const asked = request[field];
    if (asked === null || asked === undefined || asked === "") continue;
    assert.deepEqual(order[field], asked, `${field} was on the request and did not reach the order`);
  }
  assert.equal(order.notes, "Match the pantry");
});

// ── Laminex profiles ────────────────────────────────────────────────────────

test("a Laminex profile survives the quote saver, which only knew Polytec's", () => {
  const { quote, order } = toOrder(formRow({
    material: "Thermolaminate", supplierName: "Laminex", finish: "Natural", colour: "Daintree",
    profileType: "Series 3: Pocket Routered Doors", profile: "Shaker",
  }));
  assert.equal(quote.profile_type, "Series 3: Pocket Routered Doors");
  assert.equal(quote.profile, "Shaker");
  assert.equal(order.profile, "Shaker");
});

test("a profile that is known to be wrong is still refused", () => {
  // A profile on a board that is not thermolaminate is left over from another
  // material, and a Polytec 21mm only profile cannot be pressed at 18mm.
  assert.equal(quoteLineRow({ material: "Decorative Board", profile_type: "Minimal", profile: "Hamilton" }, "q", 0).profile, null);
  assert.equal(quoteLineRow({ material: "Thermolaminate", thickness: "18mm", supplier_name: "Polytec", profile_type: "Fluted", profile: "Calcutta 10" }, "q", 0).profile_type, null);
});

// ── Hardware ────────────────────────────────────────────────────────────────

test("hardware picked on the website reaches the quote priced, by the row that was picked", () => {
  const { quote } = toOrder(formRow({
    type: "Hardware", material: "", thickness: "", finish: "", colour: "", supplierName: "",
    hardwareId: HARDWARE[0].id, hardwareName: "Blum 110 Deg Inserta", qty: "6",
  }));
  assert.equal(quote.product_unit_cost_ex_gst, 6.4);
  assert.equal(quote.unit_cost_source_id, HARDWARE[0].id);
  assert.equal(quote.hardware_type, "hinge");
  assert.equal(quote.qty, 6, "and the customer's quantity, not the catalogue's");
});

test("an older request with only a name still finds its row", () => {
  const entry = convertedQuoteLine(
    { product_type: "Hardware", product_name: "Blum 110 Deg Inserta", qty: 2 },
    { resolveBoard, resolveHardware, quoteRequest: {}, businessDefaults }
  );
  assert.equal(entry.line.product_unit_cost_ex_gst, 6.4);
});

test("hardware that cannot be found is on the list of lines with no price, not silent", () => {
  const entry = convertedQuoteLine(
    { product_type: "Hardware", product_name: "Something we stopped stocking", qty: 1 },
    { resolveBoard, resolveHardware, quoteRequest: {}, businessDefaults }
  );
  const summary = unpricedSummary([entry]);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].reason, "hardware_not_found");
});

// ── Variations ──────────────────────────────────────────────────────────────

test("a variation carries the answers it has and never wipes the ones it does not", () => {
  // Blank answers are left out, so an update changing a door's size cannot
  // null out the banded edges the order line already had.
  assert.deepEqual(lineAnswers({ panel_use: "", banded_edges: null, hole_type: null }), {});
  const added = orderLineFromVariationLine({ title: "Filler", product_type: "Panel", panel_use: "Filler" }, "order", "variation", 3);
  assert.equal(added.panel_use, "Filler");
  assert.equal("banded_edges" in added, false);
});

// ── A database that has not run the migration yet ───────────────────────────

test("a missing column is named one at a time, so only that answer is lost", () => {
  const error = { code: "PGRST204", message: "Could not find the 'hole_type' column of 'pcd_order_line_items' in the schema cache" };
  assert.equal(missingCarriedColumn(error), "hole_type");
  assert.equal(missingCarriedColumn({ code: "23505", message: "duplicate" }), "");
});

// ── What the workshop reads ─────────────────────────────────────────────────

test("the order's spec line says what kind of panel, which edges and which boring", () => {
  const { order } = toOrder(formRow({
    type: "Panel", panelUse: "Scribe", bandedEdges: ["Left"],
  }));
  const spec = formatItemSpecs(order);
  assert.match(spec, /Scribe/);
  assert.match(spec, /Banded left/);

  const door = toOrder(formRow({ preDrill: true, hingeQty: "2 hinges", hingeSide: "Left", holeType: "Blum Inserta" })).order;
  assert.match(formatItemSpecs(door), /Blum Inserta/);
  assert.ok(hingeSummaryLines(door).includes("Hinge holes: Blum Inserta"));
});

test("the workshop sheet names the scribe, prints its edges and the drilling", () => {
  const { order } = toOrder(formRow({ type: "Panel", panelUse: "Scribe", bandedEdges: ["Left", "Right"] }));
  const [row] = buildCutListRows([{ ...order, id: "o1", fulfilment_method: "in_house" }], null);
  assert.equal(row.source, "Scribe");
  assert.match(row.edging, /Banded left, right/);

  const door = toOrder(formRow({
    material: "Thermolaminate", preDrill: true, hingeQty: "2 hinges", hingeSide: "Right", holeType: "35mm cup only",
  })).order;
  const [made] = buildMadeToOrderRows([{ ...door, id: "o2" }], null);
  assert.match(made.notes, /35mm cup only/, "the boring reaches the supplier made sheet");
});

// ── The job, not just its lines ─────────────────────────────────────────────

test("a quote made from a request is named for the customer and the suburb", () => {
  // It used to take the cabinet brand, so orders from the website were all
  // called things like "IKEA Metod". The brand still travels on every line.
  assert.equal(projectNameFromRequest({ customer_name: "Jane Smith", delivery_suburb: "Subiaco", cabinet_brand: "IKEA Metod" }), "Jane Smith, Subiaco");
  assert.equal(projectNameFromRequest({ customer_name: "Jane Smith" }), "Jane Smith");
  assert.equal(projectNameFromRequest({}), null, "nothing to go on falls back to the quote's own title");
});

test("the customer's note about the whole job reaches the order, labelled as theirs", () => {
  assert.equal(
    orderNotesFromRequest({ notes: "Soft close on everything please" }),
    "From the customer's quote request:\nSoft close on everything please"
  );
  assert.equal(orderNotesFromRequest({ notes: "   " }), null);
  assert.equal(orderNotesFromRequest(null), null, "a quote typed in by hand has no request behind it");
});

// ── Captured and editable in the backend ────────────────────────────────────
//
// Staff have to be able to see an answer to check it and correct it before it
// reaches the order. These read the screens, because a field that is carried
// but never shown is one a wrong answer sails straight through.

const EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
const VARIATION_EDITOR = readFileSync(new URL("../app/admin/orders/[id]/variations/[variationId]/VariationEditor.js", import.meta.url), "utf8");
const VARIATION_ADD = readFileSync(new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/route.js", import.meta.url), "utf8");
const VARIATION_UPDATE = readFileSync(new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/[lineId]/route.js", import.meta.url), "utf8");

test("the quote editor asks the hole type in the Hinges window", () => {
  const hinges = EDITOR.slice(EDITOR.indexOf("{hingeModal && (() => {"));
  assert.match(hinges, /Hole type/);
  assert.match(hinges, /HOLE_TYPES\.map/);
  assert.match(EDITOR, /hole_type: hasRequirements \? hingeModal\.hole_type : ""/, "and saving the drilling keeps it");
});

test("the quote editor has an Edges window for the banded edges, on desktop and phone", () => {
  assert.match(EDITOR, /function openEdgesModal/);
  assert.match(EDITOR, /title="Edit Edges"/);
  assert.ok((EDITOR.match(/openEdgesModal\((index|idx)\)/g) || []).length >= 2, "opened from the desktop row and the phone sheet");
});

test("the quote editor asks who supplies hardware on desktop and phone, and never the grain", () => {
  // Grain direction was taken off the quote on 15 September 2026. Every job runs
  // the standard direction and a customer who asks otherwise goes in the line's
  // notes, so a per-line control coming back would be a regression.
  assert.ok(!/grain_direction: e\.target\.value/.test(EDITOR), "no grain control on the quote");
  assert.ok((EDITOR.match(/supplied_by: e\.target\.value/g) || []).length >= 2, "supplied by in both layouts");
});

test("the variation form asks every answer, beside what it belongs to", () => {
  for (const [field, words] of [
    ["panel_use", "Kind of panel"],
    ["banded_edges", "Banded edges"],
    ["hole_type", "Hole type"],
    ["supplied_by", "Supplied by"],
  ]) {
    assert.ok(VARIATION_EDITOR.includes(words), `${words} is not on the variation form`);
    assert.match(VARIATION_EDITOR, new RegExp(`${field}: [^\\n]*item\\?\\.${field}`), `changing an item does not start from its ${field}`);
  }
  // No grain control, the same as the quote. A change still starts from the
  // item's own grain, so an answer that came in on the order form is not wiped.
  assert.ok(!/grain_direction: event\.target\.value/.test(VARIATION_EDITOR), "no grain control on the variation form");
  assert.match(VARIATION_EDITOR, /grain_direction: [^\n]*item\?\.grain_direction/, "changing an item keeps its grain");
});

test("both variation routes store the answers by the same rules as a quote line", () => {
  for (const route of [VARIATION_ADD, VARIATION_UPDATE]) {
    assert.match(route, /validatedLineAnswers\(/);
    assert.match(route, /\.\.\.lineAnswers\(sourceLine\)/, "and the before side of a change carries them");
  }
});

test("a stored answer obeys the same rules everywhere", () => {
  const ok = validatedLineAnswers({
    product_type: "Panel", material: "Decorative Board", hinge_holes: false,
    panel_use: "Scribe", banded_edges: ["Right", "Left"], hole_type: "Blum Inserta", grain_direction: "vertical",
  });
  assert.equal(ok.panel_use, "Scribe");
  assert.deepEqual(ok.banded_edges, ["Left", "Right"], "in the fixed order");
  assert.equal(ok.edge_finish, "Leave one edge raw, see notes");
  assert.equal(ok.hole_type, null, "a panel that is not drilled has no boring");
  assert.equal(ok.grain_direction, "Vertical");

  const wrapped = validatedLineAnswers({ product_type: "Door", material: "Thermolaminate", banded_edges: ["Top"], hinge_holes: true, hole_type: "35mm cup only" });
  assert.equal(wrapped.banded_edges, null, "thermolaminate is wrapped, not taped");
  assert.equal(wrapped.hole_type, "35mm cup only");
  assert.equal(validatedLineAnswers({ product_type: "Door", panel_use: "Scribe" }).panel_use, null, "a door is not a scribe");
});

// ── What the customer sees ──────────────────────────────────────────────────

test("the customer's quote calls a scribe a Scribe and shows the banded edges", () => {
  assert.equal(lineHeading({ product_type: "Panel", panel_use: "Scribe" }), "Scribe");
  assert.equal(lineHeading({ product_type: "Panel" }), "Panel", "a panel nobody named is still a Panel");
  assert.equal(lineHeading({ product_type: "Door", panel_use: "Scribe" }), "Door");
  assert.deepEqual(lineEdgeLines({ edge_mould: "1mm Square Edge", banded_edges: ["Left", "Top"] }), ["1mm Square Edge", "Banded top, left"]);
  assert.deepEqual(lineEdgeLines({ banded_edges: ["Top", "Bottom", "Left", "Right"] }), ["All four edges banded"], "a Laminex board with no edge profile still says its edges");
  assert.deepEqual(lineEdgeLines({}), []);
});

// ── Every colour picker in the design tool is the same picker ───────────────
//
// A scribe's colour picker had no "colours already used" button and Material
// Defaults showed a blank swatch, because both lists were handed to each field
// by hand and two forms were never handed them. They come from one context now.

test("every design tool colour field gets the used colours and the tile images", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const field = read("../app/admin/design/_components/ColourField.js");
  assert.match(field, /matchOptions \?\? collectMatchOptions\(shared\.allItems, shared\.current\)/, "a field with no list of its own uses the project's");
  assert.match(field, /colourImages \?\? shared\.colourImages/, "and the shared tile images");
  assert.match(read("../app/admin/design/_components/DesignRightPanel.js"), /<DesignColourContext\.Provider value=\{\{ allItems, colourImages, current: item \}\}>/, "every item form, the scribe included");
  assert.match(read("../app/admin/design/_components/DesignProgram.js"), /<DesignColourContext\.Provider value=\{\{ allItems: items, colourImages, current: null \}\}>/, "and Material Defaults");
  // Nothing passes an empty list that would hide the button.
  assert.doesNotMatch(read("../app/admin/design/_components/DesignRightPanel.js"), /FrontStyleFields\(\{[^)]*matchOptions = \[\]/);
});

// ── What the customer is sent, and what we see ──────────────────────────────

test("the customer's email carries everything they chose for each item", async () => {
  const { customerQuoteRequestHtml, quoteLineItemsText } = await import("../lib/pcd-email-templates.js");
  const lines = [formRow({
    edgeMould: "1mm Square Edge", bandedEdges: ["Left", "Top"], preDrill: true, hingeQty: "2 hinges",
    hingeSide: "Left", holeType: "Blum Inserta", cabinetBrand: "IKEA Metod", note: "Match the pantry",
  })].map(quoteRequestLine).map((line, i) => quoteRequestLineRow(line, i));
  const text = quoteLineItemsText(lines).join("\n");
  for (const said of ["Polytec", "banded top, left", "hinged left", "Blum Inserta holes", "For IKEA Metod", "Note: Match the pantry"]) {
    assert.ok(text.includes(said), `the email does not say "${said}":\n${text}`);
  }
  const html = customerQuoteRequestHtml({ customerName: "A", lines });
  assert.ok(!html.includes(">Product<"), "no empty Product row on a request built item by item");
  assert.ok(html.includes("mso-line-height-rule:exactly"), "the summary rows are held to their height in Outlook");
});

test("hinge positions typed on the website arrive exactly as typed", () => {
  // A 300 high door with both cups at 100 arrived as 75 and 75. No code does
  // that; the number boxes now ignore the scroll wheel, which can.
  const request = quoteRequestLineRow(quoteRequestLine(formRow({
    height: "300", width: "600", preDrill: true, hingeQty: "2 hinges", hingeSide: "Left",
    hingeFromBottomMm: "100", hingeFromTopMm: "100",
  })), 0);
  assert.equal(request.hinge_from_bottom_mm, 100);
  assert.equal(request.hinge_from_top_mm, 100);
  // The number boxes live in the shared components the quote form and the shop
  // both ask with, so every one of them is checked, wherever it lives.
  const files = [
    "../app/(site)/request-quote/RequestQuoteFormClient.js",
    "../app/(site)/_builder/SizeFields.js",
    "../app/(site)/_builder/HingeFields.js",
    "../app/(site)/_builder/QtyStepper.js",
  ];
  let total = 0;
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const boxes = (source.match(/type="number"/g) || []).length;
    total += boxes;
    assert.equal((source.match(/onWheel=\{ignoreWheel\}/g) || []).length, boxes, `${file}: every number box ignores the scroll wheel`);
  }
  assert.ok(total >= 5, "the height, width, quantity and hinge positions are all number boxes");
});

test("the request preview puts the drilling under Hinges and the edges under Edge", () => {
  const preview = readFileSync(new URL("../app/admin/quote-requests/QuoteRequestsManager.tsx", import.meta.url), "utf8");
  assert.ok(!preview.includes("{line.hinge_qty} hinges"), "no more \"2 hinges hinges\"");
  assert.match(preview, /hingeCustomerLines\(line\)/, "the drilling in the words the customer's quote uses");
  const edgeCell = preview.slice(preview.indexOf("{cleanValue(line.edge_mould)}"), preview.indexOf("[line.profile_type, line.profile]"));
  assert.ok(!edgeCell.includes("hole_type"), "the boring is not under Edge");
  assert.match(preview, /Size \(H × W\)/, "and the size heading is height first, like the sizes under it");
});
