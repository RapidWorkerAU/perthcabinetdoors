// WHERE THE HINGES GO.
//
// The four answers a drilled door has to carry, and the one place they are
// worked out. What these protect is a door reaching the workshop drilled the
// wrong way round, which is a door made twice.

import test from "node:test";
import { requestLinesForItem } from "../lib/pcd-design-request-lines.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fieldsForProductType } from "../lib/pcd-product-fields.js";

import {
  HINGE_SIDES,
  cupPositions,
  evenMiddles,
  hingeCount,
  hingeProblems,
  hingeSummaryLines,
  normaliseHingeSide,
  readMiddles,
  usesStandardPositions,
} from "../lib/pcd-hinges.js";
import { formatItemSpecs, hingeSpecText } from "../lib/pcd-quote-utils.js";

const door = (extra = {}) => ({
  product_type: "Door",
  height_mm: 2000,
  width_mm: 400,
  hinge_holes: true,
  hinge_qty: "3 hinges",
  hinge_side: "Left",
  hinge_from_bottom_mm: 100,
  hinge_from_top_mm: 100,
  ...extra,
});

// ── handing ─────────────────────────────────────────────────────────────────

test("a door is hinged left or right, and there is no third answer", () => {
  // A "pair" is two doors drilled as mirror images, so it is two lines.
  // Offering it as one answer let a pair be ordered on a single line, which
  // the workshop then had to interpret, and interpreting handing is how a pair
  // reaches a customer as two identical doors.
  assert.deepEqual(HINGE_SIDES, ["Left", "Right"]);
  assert.equal(normaliseHingeSide("Left"), "Left");
  assert.equal(normaliseHingeSide("right"), "Right");
  assert.equal(normaliseHingeSide("Pair - one of each"), "", "a pair is not a handing");
  assert.equal(normaliseHingeSide("Not applicable"), "");
  assert.equal(normaliseHingeSide(""), "");
  assert.equal(normaliseHingeSide(null), "");
});

test("the database refuses anything but Left or Right", () => {
  // Said in the schema as well as in the form, because a spreadsheet and an old
  // client are both ways round the form.
  const sql = readFileSync(new URL("../supabase/202608251400_pcd_cabinet_and_hinge_fields.sql", import.meta.url), "utf8");
  assert.match(sql, /hinge_side is null or hinge_side in \(''Left'', ''Right''\)/);
  // On every table a line can live on, including the variation table.
  ["pcd_quote_request_line_items", "pcd_quote_line_items", "pcd_order_line_items", "pcd_order_variation_lines"]
    .forEach((table) => assert.ok(sql.includes(table), `${table} is missing from the migration`));
});

// ── how many ────────────────────────────────────────────────────────────────

test("the count is read from whichever of the two the line carries", () => {
  // hinge_qty is free text on a request and an order line ("3 hinges"); the
  // quote also holds a numeric hinge_drilling_qty for pricing. Reading both
  // here is what stops a door being priced for three and drilled for two.
  assert.equal(hingeCount({ hinge_qty: "3 hinges" }), 3);
  assert.equal(hingeCount({ hinge_qty: "3" }), 3);
  assert.equal(hingeCount({ hinge_drilling_qty: 4 }), 4);
  assert.equal(hingeCount({ hinge_qty: "", hinge_drilling_qty: 2 }), 2);
  assert.equal(hingeCount({}), 0);
  // Bare values too, for callers holding only the one field.
  assert.equal(hingeCount("2 hinges"), 2);
  assert.equal(hingeCount(3), 3);
});

// ── the middles ─────────────────────────────────────────────────────────────

test("the cups in between space evenly across the two ends", () => {
  // Which is what the workshop does anyway, so a customer who has given us the
  // two ends has already told us where the rest go.
  //
  // A 2000 door with 100 from each end: the ends are 100 and 1900, so the span
  // is 1800 and a third hinge lands halfway at 1000.
  assert.deepEqual(evenMiddles({ height: 2000, count: 3, fromBottom: 100, fromTop: 100 }), [1000]);
  assert.deepEqual(evenMiddles({ height: 2000, count: 4, fromBottom: 100, fromTop: 100 }), [700, 1300]);
  assert.deepEqual(evenMiddles({ height: 2000, count: 2, fromBottom: 100, fromTop: 100 }), [], "two cups have no middle");
});

test("no ends means nothing to space between", () => {
  assert.deepEqual(evenMiddles({ height: 2000, count: 3, fromBottom: null, fromTop: 100 }), []);
  assert.deepEqual(evenMiddles({ height: 2000, count: 3, fromBottom: 100, fromTop: null }), []);
  assert.deepEqual(evenMiddles({ height: 0, count: 3, fromBottom: 100, fromTop: 100 }), []);
});

test("a top cup below the bottom one gets no answer rather than a wrong one", () => {
  // A door somebody has mistyped. A run of numbers that look deliberate is
  // worse than nothing, because nothing gets questioned.
  assert.deepEqual(evenMiddles({ height: 500, count: 3, fromBottom: 400, fromTop: 400 }), []);
});

test("a middle cup somebody typed stays where they put it", () => {
  const typed = cupPositions(door({ hinge_middles_mm: [1400] }));
  assert.deepEqual(typed, [100, 1400, 1900], "not respaced to 1000");
});

test("the middles are read from a list or from a spreadsheet cell", () => {
  assert.deepEqual(readMiddles([700, 1300]), [700, 1300]);
  assert.deepEqual(readMiddles("700, 1300"), [700, 1300]);
  assert.deepEqual(readMiddles("700/1300"), [700, 1300]);
  assert.deepEqual(readMiddles(""), []);
  assert.deepEqual(readMiddles(null), []);
  assert.deepEqual(readMiddles([0, -5, "x", 700]), [700], "a zero is not a cup position");
});

// ── every cup, one datum ────────────────────────────────────────────────────

test("cup positions are all measured from the bottom edge", () => {
  // The form asks for the top cup as a distance from the TOP, because that is
  // how a spec sheet reads. It is turned round once, here, because the bottom
  // edge is the only datum the two ends share and whoever is marking the door
  // out has a tape hooked over one end.
  assert.deepEqual(cupPositions(door()), [100, 1000, 1900]);
  assert.deepEqual(cupPositions(door({ hinge_qty: "2 hinges" })), [100, 1900]);
  assert.deepEqual(cupPositions(door({ hinge_qty: "4 hinges" })), [100, 700, 1300, 1900]);
});

test("blank measurements mean we set the positions, not that they are zero", () => {
  // A drilled door with no measurements is almost every door. It is not an
  // incomplete line and nothing may treat it as one.
  const standard = door({ hinge_from_bottom_mm: null, hinge_from_top_mm: null });
  assert.equal(cupPositions(standard), null);
  assert.ok(usesStandardPositions(standard));
  assert.ok(!usesStandardPositions(door()), "given both ends, they are theirs not ours");
});

test("a line that is not drilled has no cups at all", () => {
  assert.equal(cupPositions(door({ hinge_holes: false })), null);
  assert.deepEqual(hingeSummaryLines(door({ hinge_holes: false })), []);
  assert.deepEqual(hingeProblems({ hinge_holes: false }), []);
});

// ── what it says out loud ───────────────────────────────────────────────────

test("the summary says how many, which side and where", () => {
  const lines = hingeSummaryLines(door());
  assert.deepEqual(lines, [
    "Hinge Holes Drilled: 3 quantity",
    "Hinged left",
    "Hinge cups from bottom: 100, 1000, 1900mm",
  ]);
});

test("standard positions are said, not left blank", () => {
  const lines = hingeSummaryLines(door({ hinge_from_bottom_mm: null, hinge_from_top_mm: null }));
  assert.ok(lines.some((line) => /standard PCD positions/i.test(line)));
});

test("the spec string carries the drilling, so a variation shows a handing change", () => {
  // formatItemSpecs is the before and after on both sides of a variation. If
  // the drilling were not in it, a variation that changes the handing would
  // show two identical rows while the door comes back mirrored.
  const before = formatItemSpecs(door({ hinge_side: "Left" }));
  const after = formatItemSpecs(door({ hinge_side: "Right" }));
  assert.notEqual(before, after);
  assert.match(before, /left/);
  assert.match(after, /right/);
});

test("the spec string says nothing at all about an undrilled piece", () => {
  assert.equal(hingeSpecText({ hinge_holes: false }), "");
  assert.equal(hingeSpecText({}), "");
  const panel = formatItemSpecs({ material: "Decorative Board", height_mm: 800, width_mm: 400 });
  assert.ok(!/drill/i.test(panel));
});

test("a drilled door with no handing says so rather than reading as right", () => {
  // Silence would be read as an answer by whoever is at the machine.
  assert.match(hingeSpecText(door({ hinge_side: "" })), /side not recorded/);
});

// ── what is actually wrong ──────────────────────────────────────────────────

test("no handing on a drilled door is a problem, no measurements is not", () => {
  assert.deepEqual(hingeProblems(door()), []);
  assert.deepEqual(
    hingeProblems(door({ hinge_from_bottom_mm: null, hinge_from_top_mm: null })),
    [],
    "blank positions are the normal answer"
  );
  assert.deepEqual(hingeProblems(door({ hinge_side: "" })), ["which side the hinges go"]);
  assert.deepEqual(hingeProblems(door({ hinge_qty: "" })), ["how many hinges per door"]);
});

test("one end without the other is half a pattern", () => {
  // What somebody leaves behind when they are interrupted mid-thought.
  assert.deepEqual(
    hingeProblems(door({ hinge_from_top_mm: null })),
    ["both hinge positions, or neither"]
  );
  assert.deepEqual(
    hingeProblems(door({ hinge_from_bottom_mm: null })),
    ["both hinge positions, or neither"]
  );
});

test("cups that do not overlap are caught", () => {
  assert.deepEqual(
    hingeProblems(door({ height_mm: 500, hinge_from_bottom_mm: 400, hinge_from_top_mm: 400 })),
    ["hinge positions that do not overlap"]
  );
});

// ── it reaches everything ───────────────────────────────────────────────────

test("the drilling reaches the order, and the production sheet summarises it", () => {
  // Carried from the quote rather than read back through a link, so a line a
  // VARIATION added answers for itself too.
  const carry = readFileSync(new URL("../lib/pcd-order-from-quote.js", import.meta.url), "utf8");
  ["cabinet_brand", "hinge_side", "hinge_from_bottom_mm", "hinge_from_top_mm", "hinge_middles_mm"]
    .forEach((column) => {
      assert.ok(carry.includes(`${column}: line.${column}`), `${column} is not carried to the order`);
      assert.ok(carry.includes(`"${column}"`), `${column} is not in CARRIED_SPEC_COLUMNS`);
    });

  // On the production sheet it goes in the Details column, NOT in columns of
  // its own: three more columns on a full page makes every other one narrower.
  const pdf = readFileSync(new URL("../lib/pcd-cabinet-pdf.js", import.meta.url), "utf8");
  assert.match(pdf, /hingeSummaryLines\(line\)\.forEach/);
});

test("a variation line carries it too", () => {
  // This table had no hinge columns at all, so a door added by a variation
  // arrived with nothing recorded and the label printed "Not recorded".
  const variations = readFileSync(new URL("../lib/pcd-order-variations.js", import.meta.url), "utf8");
  const written = (variations.match(/hinge_side: line\.hinge_side/g) || []).length;
  assert.equal(written, 2, "both variation write sites have to carry it");
});

test("a design fills the drilling fields rather than leaving it as prose", () => {
  // The planner already works all of this out to draw the elevation, and used
  // to hand it over as a sentence somebody had to read and retype. That is
  // where a pair becomes two identical doors.
  //
  // Asserted on the line rather than on the source, because the drilling is now
  // worked out in one place for both paths (hingeFields in lib/pcd-door-utils.js)
  // and what matters is that it arrives, not which file wrote it.
  const [door] = requestLinesForItem(
    {
      id: "d1",
      item_type: "base_cabinet",
      label: "Base 600",
      width_mm: 600,
      height_mm: 720,
      depth_mm: 560,
      qty: 1,
      front_type: "doors",
      // Handing and cup positions, exactly as the elevation drew them.
      door_config: { columns: 1, hinges: ["R"], hinge_positions_mm: [[100, 620]] },
      door_style: { material: "decorative board", finish: "Matt", colour: "Classic White", thickness_mm: 18 },
      material: "decorative board",
      finish: "Matt",
      colour: "Classic White",
      carcass_thickness_mm: 16,
    },
    ["doors"],
    { roomName: "Kitchen", roomHeightMm: 2400 }
  );

  assert.equal(door.productType, "Door");
  assert.equal(door.hingeHoles, true);
  assert.match(door.hingeQty, /^\d+ hinges$/, "the drilling cost is parsed out of this");
  assert.equal(door.hingeSide, "Right", "the handing the planner drew is not on the line");
  assert.equal(door.hingeFromBottomMm, 100, "the bottom cup position is not on the line");
  // Turned round once here: the planner records both from the bottom, the form
  // asks for the top one from the top.
  assert.equal(door.hingeFromTopMm, door.height - 620, "the top cup position is not on the line");
  assert.ok(Array.isArray(door.hingeMiddlesMm), "middle cups have to arrive as a list, even an empty one");
});

// ── THE FIELDS HAVE TO BE REACHABLE, NOT JUST EXIST ─────────────────────────
//
// The quote editor's line is written twice: once as a table for a desktop and
// once as a full screen sheet for a phone. The drilling fields were built, the
// database carried them, the design tool worked them out and the customer's
// form asked for them, and the button that opens them landed only in the phone
// sheet. So on every desktop the quote editor asked whether to drill and how
// many holes, and the four fields saying WHERE the cups go could not be opened
// at all. Nothing failed; it just was not there.
//
// These pin the two things that were wrong, because neither shows up as a
// broken build or a failing save.

test("the drilling fields can be opened from the desktop table, not only the phone sheet", () => {
  const editor = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");

  // The line table specifically. There are several md:block / md:hidden pairs
  // on this screen, so this anchors on the one class only the line table has.
  const desktopStart = editor.indexOf('quoteStyles.quoteItemsTable');
  const phoneStart = editor.indexOf('className="md:hidden flex flex-col gap-2"', desktopStart);
  assert.ok(desktopStart > 0 && phoneStart > desktopStart, "the two layouts have moved, check this test still finds them");

  const desktopTable = editor.slice(desktopStart, phoneStart);
  assert.match(desktopTable, /openHingeModal\(/, "the desktop table has no way to reach the drilling fields");
});

test("both layouts ask one definition whether a type gets drilled", () => {
  // These used to be worked out by comparing the type against the literal
  // "Door" in the editor while the customer's form read pcd-product-fields.js,
  // so there were two answers to the same question with nothing keeping them in
  // step. They agreed only because there are five product types and one door.
  const editor = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
  assert.match(editor, /from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/pcd-product-fields"/, "the editor does not read the shared definition");
  // The whole field set is now read once per line and every cell asks IT,
  // rather than each cell calling out separately. So the anchor is that the
  // line's fields come from the shared definition and that hinges is answered
  // from them, not the exact one-line expression that used to be here.
  assert.match(editor, /fieldsForProductType\(line\.product_type\)/, "the editor does not ask the shared definition about a line");
  assert.match(editor, /hingesApplicable: fields\.hinges === true/, "the editor no longer answers hinges from the shared field set");
  assert.ok(
    !/product_type !== "Door"/.test(editor),
    "the editor still decides for itself what a door is"
  );
  assert.ok(
    !/normalizeProductTypeKey\(line\.product_type\) === normalizeProductTypeKey\("Door"\)/.test(editor),
    "the editor still has its own hinge rule"
  );
});

test("the definition still says a door is the only thing that gets drilled", () => {
  // The rule the two screens now share. If this changes, both move together,
  // which is the whole point of the change above.
  assert.equal(fieldsForProductType("Door").hinges, true);
  for (const type of ["Drawer front", "Panel", "Table top", "Hardware"]) {
    assert.equal(fieldsForProductType(type).hinges, false, `${type} must not be drilled`);
  }
  // And a type nobody has heard of is not drilled, rather than defaulting to it.
  assert.equal(fieldsForProductType("Something new").hinges, false);
});
