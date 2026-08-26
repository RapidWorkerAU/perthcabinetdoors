// Workshop labels.
//
// Two failures matter here. A label that says the wrong thing about drilling,
// because a door drilled wrong is scrap and a door not drilled comes back off
// the van. And a label whose number does not match the cut list sheet, because
// then the bench ticks off the wrong line and trusts a sheet that is lying.
import test from "node:test";
import assert from "node:assert/strict";
import { buildCutListLabels, drillingForItem, hingeCount, labelsToCsv, longDate, LABEL_UNKNOWN } from "../lib/pcd-order-labels.js";
import { buildCutListRows, buildMadeToOrderRows, buildProposedRows } from "../lib/pcd-cabinet-pdf.js";
import { buildVariationContext } from "../lib/pcd-cut-list-variations.js";
import { applyPanelNumbers, panelNumberKey } from "../lib/pcd-order-panel-numbers.js";
import { generateOrderLabelsPdf, boldTextWidth, textWidth } from "../lib/pcd-order-label-pdf.js";

const MM = 2.834645669;

// Every string the PDF actually draws, with the font, size and position it was
// drawn at. Positions are in PDF space, so pdfY counts UP from the bottom of
// the page: a smaller pdfY is further down the label.
function drawnText(pdf) {
  // Parens and backslashes are escaped inside a PDF literal string, so they
  // have to be read back the same way. F3 is Helvetica-Oblique.
  const pattern = /BT \/(F1|F2|F3) ([\d.]+) Tf ([\d.-]+) ([\d.-]+) Td \(((?:\\.|[^()\\])*)\) Tj ET/g;
  return [...pdf.matchAll(pattern)].map((m) => ({
    bold: m[1] === "F2",
    italic: m[1] === "F3",
    size: Number(m[2]),
    x: Number(m[3]),
    pdfY: Number(m[4]),
    value: m[5].replace(/\\(.)/g, "$1"),
  }));
}
const ORDER ={ id: "order-1", order_number: "PCD-O-2026-E7651A", customer_name: "Juliet Grist" };

function door(overrides = {}) {
  return {
    id: "item-1",
    order_id: "order-1",
    title: "Door",
    product_type: "Door",
    material: "Decorative Board",
    finish: "Woodmatt",
    colour: "Florentine Walnut",
    thickness: "16mm",
    width_mm: 597,
    height_mm: 1397,
    qty: 1,
    edge_mould: "1mm Square Edge",
    fulfilment_method: "in_house",
    quote_line_item_id: "quote-1",
    ...overrides,
  };
}

const DRILLED = [{ id: "quote-1", hinge_holes: true, hinge_qty: "2 hinges" }];

// Builds labels the way the route does: cut list rows first, then made to
// order, numbered continuously across both, exactly as ensurePanelNumbers
// hands them out on a fresh order.
function labelsFor(items, { quoteLines = DRILLED, variations = [], variationLines = [], manufacturingDate, colourSuppliers = {}, order = ORDER } = {}) {
  const context = buildVariationContext({ variations, variationLines });
  const cutRows = buildCutListRows(items, context);
  const madeToOrderRows = buildMadeToOrderRows(items, context);
  const proposedRows = buildProposedRows(context);

  const numbers = new Map();
  [...cutRows, ...madeToOrderRows, ...proposedRows].forEach((row, index) => {
    if (row.panelKey) numbers.set(panelNumberKey(row.itemId, row.panelKey), index + 1);
  });

  return buildCutListLabels({
    order,
    cutRows: applyPanelNumbers(cutRows, numbers),
    madeToOrderRows: applyPanelNumbers(madeToOrderRows, numbers),
    proposedRows: applyPanelNumbers(proposedRows, numbers),
    items,
    quoteLines,
    variationContext: context,
    manufacturingDate,
    colourSuppliers,
  });
}

test("the badge is the panel number on the production sheet", () => {
  const items = [
    door({ id: "a" }),
    door({ id: "b", width_mm: 397 }),
    door({ id: "c", width_mm: 347 }),
  ];
  const labels = labelsFor(items, { quoteLines: [] });

  assert.deepEqual(labels.map((label) => label.badge), ["1", "2", "3"]);
  assert.deepEqual([...new Set(labels.map((label) => label.section))], ["Cut list"]);
});

test("numbering runs across both tables, so no number appears twice", () => {
  // The sheet is one production document for the whole order. Two panels both
  // called 1 is how a supplier door and a cut door get mixed up on a bench.
  const labels = labelsFor([
    door({ id: "a" }),
    door({ id: "b", material: "Thermolaminate", fulfilment_method: "supplier_ready_made" }),
    door({ id: "c", width_mm: 347 }),
  ]);
  const badges = labels.map((label) => label.badge);
  assert.equal(new Set(badges).size, badges.length, "every panel has its own number");
  // Numbers are handed out down the sheet: everything cut here, then everything
  // made to order. So a fresh order reads 1 to N with no gaps.
  assert.deepEqual(badges, ["1", "2", "3"]);
  assert.deepEqual(labels.map((label) => label.section), ["Cut list", "Cut list", "Made to order"]);
});

test("a row of four is four labels, all carrying that row's number", () => {
  const labels = labelsFor([door({ qty: 4 })]);
  assert.equal(labels.length, 4);
  assert.deepEqual(labels.map((label) => label.counter), ["1 of 4", "2 of 4", "3 of 4", "4 of 4"]);
  assert.deepEqual([...new Set(labels.map((label) => label.badge))], ["1"]);
});

test("the counter is printed beside the number, not buried further down", () => {
  // Four labels off one row all show that row's number, so the counter is the
  // only thing telling them apart. Down the label it reads as a footnote and
  // the labels look identical at a glance.
  const text = generateOrderLabelsPdf({ labels: labelsFor([door({ qty: 3 })]) }).toString("latin1");
  const counters = [...text.matchAll(/\((\d+ of \d+)\) Tj/g)].map((match) => match[1]);
  assert.deepEqual(counters, ["1 of 3", "2 of 3", "3 of 3"]);

  // Drawn in the header block, above the size, rather than in the spec line.
  const firstCounter = text.indexOf("(1 of 3) Tj");
  const firstSize = text.indexOf("(597mm) Tj");
  assert.ok(firstSize > 0, "the size is on the label");
  assert.ok(firstCounter < firstSize, "the counter comes before the size");
});

test("separators survive the PDF fonts, which are ASCII only", () => {
  // Anything outside ASCII is rewritten to a hyphen by the PDF text cleaner, so
  // a middot separator silently became a dash sentence.
  const pdf = generateOrderLabelsPdf({
    labels: labelsFor([door()], { colourSuppliers: { "florentine walnut": { supplier: "Polytec", finish: "Woodmatt" } } }),
  }).toString("latin1");
  const values = drawnText(pdf).map((d) => d.value);
  assert.ok(values.includes("Decorative Board - 16mm Thickness"), values.join(" | "));
  assert.ok(values.includes("Polytec - Woodmatt"), values.join(" | "));
});

test("a single piece is not counted", () => {
  assert.equal(labelsFor([door()])[0].counter, "");
});

test("supplier made panels are labelled too, and say so", () => {
  // The sheet covers the whole order, so every panel needs identifying when it
  // arrives, not just the ones we cut.
  const labels = labelsFor([
    door({ id: "a" }),
    door({ id: "b", material: "Thermolaminate", fulfilment_method: "supplier_ready_made" }),
  ]);
  assert.deepEqual(
    labels.map((label) => `${label.section} ${label.badge}`),
    ["Cut list 1", "Made to order 2"]
  );
});

test("drilling is read through to the quote line", () => {
  const [label] = labelsFor([door()]);
  assert.equal(label.drill, "Yes");
  assert.equal(label.hinges, "2 hinges");
});

test("a line that is not drilled says so", () => {
  const [label] = labelsFor([door()], { quoteLines: [{ id: "quote-1", hinge_holes: false }] });
  assert.equal(label.drill, "No");
});

test("drilling nobody recorded is not printed as No", () => {
  // An item a variation added has no hinge field anywhere. Printing "No" would
  // be inventing an answer, and the piece would go out undrilled.
  assert.deepEqual(drillingForItem({ quote_line_item_id: null }, new Map()), { drill: LABEL_UNKNOWN, hinges: "" });
  assert.equal(labelsFor([door({ quote_line_item_id: null })], { quoteLines: [] })[0].drill, LABEL_UNKNOWN);
});

test("a line an applied variation removed gets no labels", () => {
  assert.equal(labelsFor([door({ qty: 2, variation_status: "removed" })]).length, 0);
});

test("a proposed change prints two labels and neither one is cuttable", () => {
  // Nothing is decided, so cutting the current spec scraps the piece if the
  // customer approves, and cutting the proposed one scraps it if they decline.
  const pending = { id: "var-1", variation_number: "PCD-V-2026-6120B2", status: "sent", sent_at: "2026-08-14T02:00:00.000Z" };
  const labels = labelsFor([door()], {
    variations: [pending],
    variationLines: [{
      id: "l", variation_id: "var-1", order_line_item_id: "item-1", action: "change",
      material: "Decorative Board", finish: "Woodmatt", colour: "Sepia Oak",
      width_mm: 597, height_mm: 1397,
    }],
  });

  assert.equal(labels.length, 2, "one piece, two labels");
  assert.deepEqual(labels.map((label) => label.band.tone), ["hatch", "hatch"], "both held");
  assert.deepEqual(labels.map((label) => label.band.right), ["HOLD", "DO NOT CUT"]);
  assert.match(labels[0].band.left, /CURRENT - VAR 6120B2 - 1 OF 2/);
  assert.match(labels[1].band.left, /PROPOSED - VAR 6120B2 - 2 OF 2/);

  // Both carry the same panel number: it is one piece.
  assert.equal(labels[0].badge, labels[1].badge);
  // The proposed label shows what it would become, with the current value struck.
  assert.match(labels[1].material, /Sepia Oak/);
  assert.match(labels[1].wasMaterial, /Florentine Walnut/);
});

test("an approved change prints was and now, and only now is cuttable", () => {
  const applied = { id: "var-2", variation_number: "PCD-V-2026-5051F3", status: "applied", applied_at: "2026-08-12T02:00:00.000Z" };
  const labels = labelsFor([door({ variation_status: "changed", variation_id: "var-2", width_mm: 347, height_mm: 747 })], {
    variations: [applied],
    variationLines: [{
      id: "l", variation_id: "var-2", order_line_item_id: "item-1", action: "change",
      original_item_snapshot: { width_mm: 347, height_mm: 697, material: "Decorative Board", finish: "Woodmatt", colour: "Florentine Walnut" },
    }],
  });

  assert.equal(labels.length, 2);
  assert.deepEqual(labels.map((label) => label.band.tone), ["outline", "solid"]);
  assert.deepEqual(labels.map((label) => label.band.right), ["SUPERSEDED", "CUT THIS"]);
  assert.equal(labels[0].size, "697mm x 347mm", "the was label carries the old size");
  assert.equal(labels[0].struckSize, true, "and strikes it through");
  assert.equal(labels[1].size, "747mm x 347mm", "the now label carries the current size");
});

test("a proposed removal is held, not dropped", () => {
  const pending = { id: "var-3", variation_number: "PCD-V-2026-6120B2", status: "sent" };
  const labels = labelsFor([door()], {
    variations: [pending],
    variationLines: [{ id: "l", variation_id: "var-3", order_line_item_id: "item-1", action: "remove" }],
  });
  assert.equal(labels.length, 1);
  assert.equal(labels[0].band.tone, "hatch");
  assert.match(labels[0].band.left, /REMOVAL PROPOSED/);
  assert.equal(labels[0].band.right, "HOLD");
});

test("a piece a pending variation proposes now gets a label of its own", () => {
  // It has a reserved panel number so the sheet and the label agree, and it is
  // marked so it cannot be mistaken for approved work.
  const pending = { id: "var-4", variation_number: "PCD-V-2026-6120B2", status: "sent" };
  const labels = labelsFor([door()], {
    variations: [pending],
    variationLines: [{ id: "l", variation_id: "var-4", action: "add", title: "Door", width_mm: 497, height_mm: 747, qty: 1 }],
  });
  assert.equal(labels.length, 2, "the real piece and the proposed one");
  const proposed = labels[1];
  assert.equal(proposed.band.tone, "hatch");
  assert.equal(proposed.band.right, "DO NOT CUT");
  assert.ok(proposed.badge, "and it carries a number");
});

test("an added piece says where it came from and is cuttable", () => {
  const applied = { id: "var-2", variation_number: "PCD-V-2026-5051F3", status: "applied", applied_at: "2026-08-12T02:00:00.000Z" };
  const labels = labelsFor([door({ variation_status: "added", variation_id: "var-2" })], {
    variations: [applied],
    variationLines: [{ id: "l", variation_id: "var-2", action: "add", title: "Door" }],
  });
  assert.equal(labels.length, 1, "one label, it is ordinary live work");
  assert.equal(labels[0].band.tone, "solid");
  assert.equal(labels[0].band.right, "CUT THIS");
  assert.match(labels[0].band.left, /ADDED - VAR 5051F3/);
});

test("an ordinary piece carries no band at all", () => {
  // Nothing has changed it, so nothing on the label mentions variations.
  assert.equal(labelsFor([door()])[0].band, null);
});

test("the CSV leads with the cut list number and quotes anything with a comma", () => {
  const labels = labelsFor([door({ qty: 2, colour: "Walnut, Florentine" })]);
  const lines = labelsToCsv(labels).trim().split("\r\n");
  assert.equal(lines.length, 3, "a header and two labels");
  assert.match(lines[0], /^﻿?Cut list no,Section,Order,Customer,Order Date,Manufacturing Date/);
  assert.match(lines[1], /"Decorative Board - Woodmatt - Walnut, Florentine"/);
});

test("the manufacturing date is stamped once for the whole run", () => {
  // Every label off one print carries the same date. Stamping per label would
  // tick over if a long run straddled midnight.
  const labels = labelsFor([door({ qty: 3 })], { manufacturingDate: "16/08/2026" });
  assert.deepEqual([...new Set(labels.map((label) => label.manufacturingDate))], ["16/08/2026"]);
  assert.match(labelsToCsv(labels), /16\/08\/2026/);
  // The date prints as a value in the footer. The words "Manufacturing Date"
  // were dropped: a date in the footer is a date.
  assert.match(generateOrderLabelsPdf({ labels }).toString("latin1"), /\(16\/08\/2026\) Tj/);
});

// Every filled or stroked rectangle on a page, in PDF space.
// Bounds as the eye sees them, not as the operator writes them.
//
// A stroked rectangle centres its line on the path, so half the border sits
// outside the box. The drawing code insets stroked cells by half a stroke so
// their OUTER edge lands where a filled cell's edge would; this undoes that,
// giving the bounds you would measure with a ruler on the printed label. That
// is what "the same width as the box above it" has to be judged on, and it was
// the difference that made every outlined cell look bigger than its caption.
const CELL_STROKE = 0.8;

function rects(pdf) {
  return [...pdf.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re (f|S|B)/g)].map((m) => {
    const filled = m[5] === "f";
    const half = filled ? 0 : CELL_STROKE / 2;
    return {
      x: Number(m[1]) - half,
      y: Number(m[2]) - half,
      w: Number(m[3]) + half * 2,
      h: Number(m[4]) + half * 2,
      filled,
    };
  });
}

// The cell a string sits inside, if any.
function cellFor(pdf, value) {
  const item = drawnText(pdf).find((d) => d.value === value);
  if (!item) return null;
  const box = rects(pdf).find((r) =>
    r.x <= item.x + 0.5 && r.x + r.w >= item.x - 0.5
    && r.y < item.pdfY && r.y + r.h > item.pdfY);
  return box ? { ...box, text: item } : null;
}

test("the masthead carries the logo, the number and its count", () => {
  const pdf = generateOrderLabelsPdf({ labels: labelsFor([door({ qty: 3 })]) }).toString("latin1");
  assert.match(pdf, /\/Logo Do/, "the logo is placed");

  const badge = cellFor(pdf, "1");
  assert.ok(badge?.filled, "the number sits in a filled plate");
  const counter = cellFor(pdf, "1 of 3");
  assert.ok(counter && !counter.filled, "its count sits in an outlined box under it");
  assert.ok(counter.y + counter.h <= badge.y + 0.5, "directly under, not beside");
  assert.ok(Math.abs(counter.x - badge.x) < 0.5 && Math.abs(counter.w - badge.w) < 0.5,
    "and the same width, so the two read as one plate");
});

test("a single piece still says one of one", () => {
  // A blank is a question about whether something is missing from the pile.
  const pdf = generateOrderLabelsPdf({ labels: labelsFor([door()]) }).toString("latin1");
  assert.ok(drawnText(pdf).some((d) => d.value === "1 of 1"), "stated rather than left off");
});

test("drilling is a three cell table, captions knocked out white", () => {
  const pdf = generateOrderLabelsPdf({ labels: labelsFor([door()]) }).toString("latin1");

  const caption = cellFor(pdf, "DRILLING");
  const answer = cellFor(pdf, "YES");
  const qtyCaption = cellFor(pdf, "QTY");
  const qty = cellFor(pdf, "2");

  assert.ok(caption?.filled, "DRILLING is a filled caption");
  assert.ok(answer && !answer.filled, "its answer is an outlined value");
  assert.ok(qtyCaption?.filled, "QTY is a filled caption");
  assert.ok(qty && !qty.filled, "its value is outlined");

  assert.ok(answer.y + answer.h <= caption.y + 0.5, "answer under the caption");
  assert.ok(qtyCaption.y + qtyCaption.h <= answer.y + 0.5, "qty row under the answer");
  assert.ok(qtyCaption.x + qtyCaption.w <= qty.x + 0.5, "qty caption beside its value");
});

test("the qty cell counts hinges, and is a dash when there are none", () => {
  assert.equal(labelsFor([door()])[0].hingeQty, "2");
  assert.equal(labelsFor([door()], { quoteLines: [{ id: "quote-1", hinge_holes: false }] })[0].hingeQty, "");

  const pdf = generateOrderLabelsPdf({
    labels: labelsFor([door()], { quoteLines: [{ id: "quote-1", hinge_holes: false }] }),
  }).toString("latin1");
  const drawn = drawnText(pdf).map((d) => d.value);
  assert.ok(drawn.includes("NO"), "drilling says no");
  assert.ok(drawn.includes("-"), "and the count is a dash rather than a guess");
});

test("hinge counts are read out of whatever the field says", () => {
  assert.equal(hingeCount("2 hinges"), "2");
  assert.equal(hingeCount("2"), "2");
  assert.equal(hingeCount("3 x hinges"), "3");
  assert.equal(hingeCount("soft close"), "", "a count we cannot read is not invented");
  assert.equal(hingeCount(""), "");
});

test("the profile rows are a filled caption and an outlined value", () => {
  const pdf = generateOrderLabelsPdf({ labels: labelsFor([door()]) }).toString("latin1");

  const edge = cellFor(pdf, "Edge Profile");
  const edgeValue = cellFor(pdf, "1mm Square Edge");
  const front = cellFor(pdf, "Front Profile");

  assert.ok(edge?.filled && front?.filled, "both captions are filled");
  assert.ok(edgeValue && !edgeValue.filled, "the value is outlined");
  assert.ok(Math.abs(edge.w - front.w) < 0.5, "the two captions are the same width, so the boxes line up");
  assert.ok(edge.x + edge.w <= edgeValue.x + 0.5, "caption then value, left to right");
  // Left aligned inside the box, as drawn, not centred.
  assert.ok(edgeValue.text.x - edgeValue.x < 8, "the value reads from the left of its box");
});

test("order details lists the customer, the order and both dates", () => {
  const pdf = generateOrderLabelsPdf({
    labels: labelsFor([door()], { order: { ...ORDER, created_at: "2026-07-12T02:00:00.000Z" } }),
  }).toString("latin1");
  const drawn = drawnText(pdf);
  const value = (v) => drawn.find((d) => d.value === v);

  assert.ok(cellFor(pdf, "Order Details")?.filled, "the section has a filled caption bar");
  ["Customer Name:", "Order ID:", "Order Date:", "Manufacturing Date:"].forEach((caption) => {
    assert.ok(value(caption), `${caption} is drawn`);
  });
  assert.ok(value("Juliet Grist"), "the customer");
  assert.ok(value("PCD-O-2026-E7651A"), "the order");
  assert.ok(value("12th July 2026"), "the order date, written out");

  // Captions and values in two columns, so the values line up down the block.
  const xs = ["Juliet Grist", "PCD-O-2026-E7651A", "12th July 2026"].map((v) => value(v).x);
  assert.equal(new Set(xs).size, 1, "the values share a column");
});

test("dates are written out, so nobody has to guess the order of the numbers", () => {
  assert.equal(longDate("2026-08-17T02:00:00.000Z"), "17th August 2026");
  assert.equal(longDate("2026-07-01T02:00:00.000Z"), "1st July 2026");
  assert.equal(longDate("2026-07-02T02:00:00.000Z"), "2nd July 2026");
  assert.equal(longDate("2026-07-03T02:00:00.000Z"), "3rd July 2026");
  // The three the naive rule gets wrong.
  assert.equal(longDate("2026-07-11T02:00:00.000Z"), "11th July 2026");
  assert.equal(longDate("2026-07-12T02:00:00.000Z"), "12th July 2026");
  assert.equal(longDate("2026-07-13T02:00:00.000Z"), "13th July 2026");
  assert.equal(longDate("2026-07-21T02:00:00.000Z"), "21st July 2026");
  assert.equal(longDate(null), "", "nothing in, nothing out");
  assert.equal(longDate("not a date"), "");
});

test("a thermolaminated door carries its front profile and says not to cut it", () => {
  const thermo = door({
    material: "Thermolaminated",
    profile_type: "Thermolaminated",
    profile: "Shaker 60mm",
    edge_mould: "",
  });
  const labels = labelsFor([thermo], { quoteLines: [] });
  assert.equal(labels[0].profile, "Thermolaminated - Shaker 60mm");
  assert.equal(labels[0].madeToOrder, true);

  const drawn = drawnText(generateOrderLabelsPdf({ labels }).toString("latin1"));
  assert.ok(drawn.some((d) => d.value === "Front Profile"), "the row is captioned");
  assert.ok(drawn.map((d) => d.value).join(" ").includes("Shaker 60mm"), "and the profile is printed");
});

test("the variation strip sits across the foot, below the order details", () => {
  const labels = labelsFor([door()], {
    variations: [{ id: "v", variation_number: "PCD-V-2026-6120B2", status: "sent" }],
    variationLines: [{ id: "l", variation_id: "v", order_line_item_id: "item-1", action: "change", colour: "Sepia Oak" }],
  });
  const pdf = generateOrderLabelsPdf({ labels }).toString("latin1");
  const drawn = drawnText(pdf);

  const hold = drawn.find((d) => d.value === "HOLD");
  const details = drawn.find((d) => d.value === "Manufacturing Date:");
  assert.ok(hold && details, "both are drawn");
  assert.ok(hold.pdfY < details.pdfY, "the strip is below the order details");
});

test("every variation state prints, and says what to do", () => {
  const items = [
    door({ id: "added", variation_status: "added", variation_id: "va" }),
    door({ id: "changed", variation_status: "changed", variation_id: "va" }),
    door({ id: "pending" }),
    door({ id: "removing" }),
  ];
  const labels = labelsFor(items, {
    quoteLines: [],
    variations: [
      { id: "va", variation_number: "PCD-V-2026-5051F3", status: "applied" },
      { id: "vp", variation_number: "PCD-V-2026-6120B2", status: "sent" },
    ],
    variationLines: [
      { id: "l1", variation_id: "va", order_line_item_id: "changed", action: "change",
        original_item_snapshot: { width_mm: 497, height_mm: 1297, material: "Decorative Board", finish: "Woodmatt", colour: "Sepia Oak" } },
      { id: "l2", variation_id: "vp", order_line_item_id: "pending", action: "change", colour: "Sepia Oak" },
      { id: "l3", variation_id: "vp", order_line_item_id: "removing", action: "remove" },
      { id: "l4", variation_id: "vp", action: "add", title: "Door", width_mm: 397, height_mm: 797, qty: 1 },
    ],
  });

  assert.deepEqual(
    labels.map((label) => (label.band ? `${label.band.tone} ${label.band.right}` : "none")),
    [
      "solid CUT THIS",        // an applied addition
      "outline SUPERSEDED",    // the settled change, before
      "solid CUT THIS",        // the settled change, after
      "hatch HOLD",            // a proposed change, as it stands
      "hatch DO NOT CUT",      // a proposed change, as proposed
      "hatch HOLD",            // a proposed removal
      "hatch DO NOT CUT",      // a proposed addition
    ]
  );

  // The superseded label restates the old specification and strikes the size.
  const superseded = labels.find((label) => label.band?.right === "SUPERSEDED");
  assert.equal(superseded.colourHeadline, "Sepia Oak");
  assert.equal(superseded.struckSize, true);

  const drawn = drawnText(generateOrderLabelsPdf({ labels }).toString("latin1"));
  assert.ok(drawn.some((d) => d.value === "497mm"), "the old width is printed");
  assert.ok(drawn.some((d) => d.value === "SUPERSEDED"), "and the strip says it is dead");
});

test("the label is set in a mixture of weights, not all bold", () => {
  const pdf = generateOrderLabelsPdf({
    labels: labelsFor([door()], { colourSuppliers: { "florentine walnut": { supplier: "Polytec", finish: "Woodmatt" } } }),
  }).toString("latin1");
  const drawn = drawnText(pdf);
  const found = (value) => drawn.find((d) => d.value === value);

  assert.equal(found("597mm").bold, true, "the dimension carries the weight");
  assert.equal(found("Decorative Board - 16mm Thickness").bold, false, "the board line is regular");
  assert.equal(found("Florentine Walnut").bold, true, "the colour is the headline");
  assert.equal(found("Polytec - Woodmatt").italic, true, "the brand and finish are an aside");
  assert.equal(found("1mm Square Edge").bold, false, "a profile value is regular");
  assert.equal(found("Customer Name:").bold, true, "an order detail caption is bold");
  assert.equal(found("Juliet Grist").bold, false, "its value is regular");

  const bold = drawn.filter((d) => d.bold).length;
  assert.ok(bold < drawn.length * 0.75, `${bold} of ${drawn.length} strings bold`);
});

test("captions inside filled cells are knocked out white", () => {
  // A black caption on a black cell is an empty black cell.
  const pdf = generateOrderLabelsPdf({ labels: labelsFor([door()]) }).toString("latin1");
  ["DRILLING", "QTY", "Edge Profile", "Front Profile", "Order Details", "W", "H", "1"].forEach((caption) => {
    const index = pdf.indexOf(`(${caption}) Tj`);
    assert.ok(index > 0, `${caption} is drawn`);
    const before = pdf.slice(0, index);
    assert.ok(
      before.lastIndexOf("1.000 1.000 1.000 rg") > before.lastIndexOf("0.050 0.050 0.050 rg"),
      `${caption} is set in white, on its filled cell`
    );
  });
});

test("nothing on any label overlaps anything else on it", () => {
  const labels = labelsFor(
    [
      door({ qty: 2, width_mm: 1197, height_mm: 2397, colour: "Florentine Walnut Extra Dark Grain" }),
      door({
        id: "item-2", quote_line_item_id: "unknown", material: "Thermolaminated",
        profile_type: "Thermolaminated", profile: "Shaker 60mm with a very long profile name",
      }),
    ],
    {
      variations: [{ id: "v", variation_number: "PCD-V-2026-6120B2", status: "sent" }],
      variationLines: [{ id: "l", variation_id: "v", order_line_item_id: "item-1", action: "change", width_mm: 897, height_mm: 1997 }],
      order: { ...ORDER, created_at: "2026-07-12T02:00:00.000Z" },
    }
  );

  const pdf = generateOrderLabelsPdf({ labels }).toString("latin1");
  assert.ok(pdf.split("stream").length > 5, "there is a real spread of labels to check");

  pdf.split(/stream\r?\n/).slice(1).forEach((chunk, pageIndex) => {
    const boxes = drawnText(chunk).map((d) => ({
      ...d,
      x2: d.x + textWidth(d.value, d.size, d.bold),
      top: d.pdfY + d.size * 0.717,
      bottom: d.pdfY - d.size * 0.21,
    }));

    boxes.forEach((a, i) => {
      boxes.slice(i + 1).forEach((b) => {
        const overlaps = a.x < b.x2 - 0.5 && b.x < a.x2 - 0.5
          && a.bottom < b.top - 0.5 && b.bottom < a.top - 0.5;
        assert.ok(!overlaps, `page ${pageIndex + 1}: "${a.value}" and "${b.value}" overlap`);
      });
    });
  });
});

test("nothing on any label runs past the printable width", () => {
  const labels = labelsFor(
    [door({ qty: 2, width_mm: 1197, height_mm: 2397 }), door({ id: "item-2", quote_line_item_id: "unknown" })],
    {
      variations: [{ id: "v", variation_number: "PCD-V-2026-6120B2", status: "sent" }],
      variationLines: [{ id: "l", variation_id: "v", order_line_item_id: "item-1", action: "change", width_mm: 897 }],
      order: { ...ORDER, created_at: "2026-07-12T02:00:00.000Z" },
    }
  );
  const drawn = drawnText(generateOrderLabelsPdf({ labels }).toString("latin1"));
  const printable = 62 * MM - 3.5 * MM;

  assert.ok(drawn.length > 30, "there is something to check");
  drawn.forEach((d) => {
    const end = d.x + textWidth(d.value, d.size, d.bold);
    assert.ok(end <= printable + 0.5, `"${d.value}" at ${d.size}pt ends at ${end.toFixed(1)}pt, past ${printable.toFixed(1)}pt`);
  });
  assert.ok(drawn.some((d) => d.value === "NOT RECORDED"), "the long drill answer was among them");
});

test("a label with every cue on it at once still fits the die-cut stock", () => {
  const labels = labelsFor(
    [door({
      qty: 4,
      material: "Thermolaminated",
      colour: "Florentine Walnut In A Deliberately Long Range Name",
      profile_type: "Thermolaminated",
      profile: "Shaker 60mm with a raised centre panel",
    })],
    {
      variations: [{ id: "v", variation_number: "PCD-V-2026-6120B2", status: "sent" }],
      variationLines: [{ id: "l", variation_id: "v", order_line_item_id: "item-1", action: "change", width_mm: 1197, height_mm: 2397 }],
      colourSuppliers: { "florentine walnut in a deliberately long range name": { supplier: "Polytec", finish: "Woodmatt" } },
      order: { ...ORDER, created_at: "2026-07-12T02:00:00.000Z" },
    }
  );
  assert.ok(labels.some((label) => label.band && label.counter), "the fixture carries them at once");
  assert.doesNotThrow(() => generateOrderLabelsPdf({ labels, stock: "62x90" }));
});

// ── which letter goes with which number ─────────────────────────────────────

test("H is against the height and W against the width, height on top", () => {
  // THE BUG THIS PINS. Every size in this business is written height first, and
  // sizeOf builds the label's size string that way. The label PDF read it the
  // other way round, so the two numbers were printed in the right order with
  // the letters swapped: the top box said W beside the height.
  //
  // It could not be spotted by looking, because a 600 x 508 door and a 508 x
  // 600 door are both perfectly ordinary. The only way to catch it is to know
  // which number belongs on top, which is why it is written down here.
  const pdf = generateOrderLabelsPdf({
    labels: [{
      // Deliberately not square, and deliberately taller than wide.
      size: "600mm x 508mm",
      customer: "Test Customer", orderNumber: "PCD-O-TEST",
      orderDate: "26/08/2026", manufacturingDate: "26/08/2026",
      colourHeadline: "Polar White", materialAbove: "MDF 18mm", materialBelow: "Matt",
    }],
  }).toString("latin1");

  const drawn = drawnText(pdf);
  const markers = drawn.filter((item) => item.value === "H" || item.value === "W");
  assert.equal(markers.length, 2, "both markers must be drawn");

  const numbers = drawn.filter((item) => /^\d+mm$/.test(item.value));
  const beside = (marker) =>
    numbers
      .slice()
      .sort((a, b) => Math.abs(a.pdfY - marker.pdfY) - Math.abs(b.pdfY - marker.pdfY))[0];

  const h = markers.find((item) => item.value === "H");
  const w = markers.find((item) => item.value === "W");
  assert.equal(beside(h).value, "600mm", "H must sit against the height");
  assert.equal(beside(w).value, "508mm", "W must sit against the width");

  // pdfY counts UP from the bottom, so a bigger pdfY is higher on the label.
  assert.ok(h.pdfY > w.pdfY, "height is the top box, width underneath");
});
