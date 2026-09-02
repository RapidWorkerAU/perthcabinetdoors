// A BASE CABINET YOU ADDED YOURSELF, RATHER THAN ONE THAT ARRIVED FROM A DESIGN.
//
// Everything about a cabinet line was built on the assumption that it comes in
// from the design tool, which fills in the material, finish, colour, thickness
// and supplier before the quote ever sees it. Add one by hand on the quote
// editor and none of that is answered, and there was nowhere to answer it:
//
//   * the quote line locked its colour, supplier and thickness BECAUSE it was a
//     cabinet, and pointed at the cabinet;
//   * the cabinet showed the carcass board as two read-only boxes read off that
//     same line, and pointed back at it.
//
// Neither would take an answer. The board could not be set at all, and the
// price lookup filled the hole by answering with whichever colour of that
// material happened to sort first.
//
// The markup was locked on the same reasoning and was applied anyway, so the
// figure was in the price and out of reach.
//
// These tests pin the shape of the fix rather than any one screen: one
// definition of what a cabinet is asked, one matcher for what a board costs,
// and the hours somebody enters actually reaching the quote.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fieldsForProductType, isCabinetType, PRODUCT_FIELDS } from "../lib/pcd-product-fields.js";
import { calculateQuoteLine } from "../lib/pcd-quote-utils.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const EDITOR = read("app/admin/quotes/[id]/QuoteEditor.js");
const CONFIGURATOR = read("components/admin/CabinetConfigurator.tsx");
const BOARD_COSTS = read("app/api/admin/board-costs/[material]/route.js");
const REPRICE = read("app/api/admin/quotes/[id]/reprice/route.js");

// ---------------------------------------------------------------------------
// One definition of what a cabinet is asked
// ---------------------------------------------------------------------------

test("a base cabinet is a product type the shared definition knows about", () => {
  // It was missing entirely, so it fell through to the "unknown type" fallback,
  // which answers yes to size, profile and edge. Every cell on the quote table
  // then had to bolt its own `!isBaseCabinet` on by hand, and desktop and
  // mobile ended up bolting on different ones.
  assert.ok(PRODUCT_FIELDS.base_cabinet, "base_cabinet has no field set of its own");
  assert.equal(isCabinetType("base_cabinet"), true);

  const fields = fieldsForProductType("base_cabinet");
  assert.equal(fields.cabinet, true);
  assert.equal(fields.board, true, "a cabinet is cut from board");
  assert.equal(fields.size, false, "a cabinet's sizes live on the cabinet, not in the line's two boxes");
  assert.equal(fields.profile, false, "a carcass is not routed with a door profile");
  assert.equal(fields.edge, false);
  assert.equal(fields.hinges, false, "a carcass is not the thing that gets drilled");
});

test("a cabinet is recognised however its type is spelt", () => {
  // A stored "Base Cabinet" or "base-cabinet" from anywhere other than our own
  // dropdown must not fall through to the fallback and lose its treatment.
  for (const spelling of ["base_cabinet", "Base Cabinet", "base-cabinet", " BASE_CABINET "]) {
    assert.equal(isCabinetType(spelling), true, `${spelling} was not recognised as a cabinet`);
  }
  assert.equal(isCabinetType("Door"), false);
  assert.equal(isCabinetType("Something new"), false);
});

test("nothing else is a cabinet", () => {
  for (const type of ["Door", "Drawer front", "Panel", "Table top", "Hardware"]) {
    assert.equal(isCabinetType(type), false, `${type} is not a carcass`);
  }
});

// ---------------------------------------------------------------------------
// The markup
// ---------------------------------------------------------------------------

test("a cabinet is marked up like every other line", () => {
  const line = {
    product_type: "base_cabinet",
    qty: 2,
    product_unit_cost_ex_gst: 100,
    markup_percent: 50,
  };
  const calculated = calculateQuoteLine(line, { markup_percent: 40, labour_hours_per_cabinet: 1 });
  assert.equal(calculated.markup_amount_ex_gst, 100, "200 of cost at 50% is 100 of markup");
  assert.equal(calculated.line_total_ex_gst, 300);
});

test("the quote editor lets the markup be edited on a cabinet, on both layouts", () => {
  // It was gated behind the same flag as the board. The number was reaching the
  // price the whole time; only the box was missing.
  assert.ok(
    !/\{isEditable && !cabinetOwnsBoard \? \(\s*\n\s*<div className="flex h-\[22px\] items-center overflow-hidden rounded-\[3px\] border border-\[#a8c5a0\] bg-white focus-within:border-\[#6b9e61\]">\s*\n\s*<input\s*\n\s*type="text"\s*\n\s*inputMode="decimal"\s*\n\s*value=\{line\.markup_percent\}/.test(EDITOR),
    "the desktop markup box is still locked for a cabinet"
  );
  // The phone sheet rendered the quantity, the unit cost, the markup and the
  // line total inside its `!cabinetOwnsBoard` branch, so a cabinet was offered
  // none of them while the desktop offered the quantity. All four are what the
  // quote charges, not what the cabinet is, so all four sit outside it now.
  const sheetStart = EDITOR.indexOf("A cabinet's own sizes live on the cabinet");
  assert.ok(sheetStart > 0, "the phone sheet has moved, check this test still finds it");
  const sheet = EDITOR.slice(sheetStart, sheetStart + 6000);
  const cabinetOnlyBranchEnd = sheet.indexOf("</>\n                  ) : null}");
  assert.ok(cabinetOnlyBranchEnd > 0, "the phone sheet's size-only branch has moved");
  const sizeOnly = sheet.slice(0, cabinetOnlyBranchEnd);
  assert.ok(!/Markup %/.test(sizeOnly), "the phone sheet still hides the markup on a cabinet");
  assert.ok(!/>Qty</.test(sizeOnly), "the phone sheet still hides the quantity on a cabinet");
});

// ---------------------------------------------------------------------------
// The board is chosen on the cabinet, and reaches the line
// ---------------------------------------------------------------------------

test("the carcass board is a picker on the cabinet, not a read-only box", () => {
  assert.match(CONFIGURATOR, /Carcass board/, "there is no carcass board picker");
  assert.match(CONFIGURATOR, /Carcass finish and colour/, "there is no carcass colour picker");
  assert.match(CONFIGURATOR, /options=\{carcassColourOptions\}/, "the carcass picker is not fed from the colour library");
  assert.match(CONFIGURATOR, /onChange=\{selectCarcassColour\}/);
});

test("the cabinet no longer overwrites its board from the quote line on every render", () => {
  // This was the line that made the read-only boxes unavoidable: whatever
  // anybody picked was replaced by the line's answer on the next render.
  assert.ok(
    !/carcass_colour:\s*quoteColour/.test(CONFIGURATOR),
    "the cabinet still forces the quote line's colour over its own"
  );
  assert.ok(
    !/carcass_material:\s*quoteMaterial/.test(CONFIGURATOR),
    "the cabinet still forces the quote line's material over its own"
  );
});

test("a saved carcass colour is read back from the field it was saved to", () => {
  // The fallback read existingConfig.colour and .finish. The columns are
  // carcass_colour and carcass_finish, so it never fired, and the modal then
  // wrote the blank back over a saved colour.
  assert.match(CONFIGURATOR, /existingConfig\?\.carcass_colour/, "the cabinet does not read back its own saved colour");
  assert.match(CONFIGURATOR, /existingConfig\?\.carcass_finish/, "the cabinet does not read back its own saved finish");
  assert.ok(
    !/existingConfig\?\.colour\s/.test(CONFIGURATOR),
    "the cabinet still reads a colour field that does not exist"
  );
});

test("what is picked on the cabinet is written back onto the quote line", () => {
  // It only ever travelled the other way, which is what made the board
  // unsettable. The items table, the Base Cabinets tab and the reprice all read
  // the line, so the line has to carry the answer.
  const patchStart = CONFIGURATOR.indexOf("line_item_patch: {");
  assert.ok(patchStart > 0, "the cabinet no longer patches its line");
  const patch = CONFIGURATOR.slice(patchStart, CONFIGURATOR.indexOf("},", patchStart));
  for (const field of ["material:", "finish:", "colour:", "thickness:", "supplier_name:"]) {
    assert.ok(patch.includes(field), `the cabinet does not write ${field} back to the line`);
  }
  assert.ok(
    patch.includes('unit_cost_mode:           "manual"'),
    "a cabinet must stay manually priced: it is costed from its cut list, not from width x height x rate"
  );
});

test("there is a way into the cabinet from the quote items row", () => {
  // Configure existed only on the Base Cabinets tab, so adding a cabinet on the
  // items tab left a row of locked cells and no button.
  assert.match(EDITOR, /function openCabinetConfigurator/, "there is no shared way to open a cabinet");
  assert.match(EDITOR, /aria-label=\{`Configure cabinet on quote line \$\{index \+ 1\}`\}/, "the desktop row has no Configure button");
  assert.match(EDITOR, /cabinetBoardCell\(line\.colour, index\)/, "the locked cells do not open the cabinet");
  assert.match(EDITOR, /openCabinetConfigurator\(idx\)/, "the phone sheet has no way into the cabinet");
});

// ---------------------------------------------------------------------------
// What a board costs
// ---------------------------------------------------------------------------

test("the board cost endpoint asks the one matcher, not a second copy of it", () => {
  assert.match(BOARD_COSTS, /import \{ resolveBoardCost \} from/, "the endpoint still matches boards its own way");
  // The guess: fifty rows of that material, answer with row one.
  assert.ok(!/\.limit\(50\)/.test(BOARD_COSTS), "the endpoint still pulls a page of colours to guess from");
  assert.ok(
    !/found: Boolean\(Number\(cost\.cost_per_sqm_ex_gst\) >= 0\)/.test(BOARD_COSTS),
    "an unpriced colour still reports as found at zero"
  );
});

test("saving a board price writes to one colour, never a page of them", () => {
  // It wrote to every row it had matched. Without a colour that was up to fifty
  // colours overwritten from a button that reads as saving one price.
  assert.ok(
    !/\.in\("id", colourMatches\.map/.test(BOARD_COSTS),
    "saving a price still updates every matching colour"
  );
  assert.match(BOARD_COSTS, /\.eq\("id", rowId\)/, "the save does not target a single row");
  assert.match(BOARD_COSTS, /Pick the finish and colour before saving a price/, "the save does not refuse without a colour");
});

test("made to order is reported as itself, not as a missing price", () => {
  assert.match(BOARD_COSTS, /madeToOrder: match\.reason === "made_to_order"/);
  assert.match(CONFIGURATOR, /payload\.madeToOrder/, "the cabinet still asks for a price on a made to order board");
});

test("the cabinet waits for a colour instead of looking up the material alone", () => {
  assert.match(
    CONFIGURATOR,
    /A board price is held per colour, so there is nothing to look up without one/,
    "the cabinet does not say why it cannot price a board with no colour"
  );
  assert.match(
    CONFIGURATOR,
    /if \(!normalizedConfig\.carcass_material \|\| !normalizedConfig\.carcass_colour\) return/,
    "the automatic lookup still runs with no colour on the cabinet"
  );
});

// ---------------------------------------------------------------------------
// Labour hours
// ---------------------------------------------------------------------------

test("hours entered on a cabinet reach the quote", () => {
  // The field was on the Boards tab, it saved, and the calculation replaced it
  // with the business default every time. The modal reported one figure and the
  // quote billed another.
  const line = {
    product_type: "base_cabinet",
    qty: 3,
    product_unit_cost_ex_gst: 100,
    cabinet_config: { labour_hours: 2.5 },
  };
  const calculated = calculateQuoteLine(line, { labour_hours_per_cabinet: 1, markup_percent: 0 });
  assert.equal(calculated.labour_hours, 7.5, "2.5 hours each for three cabinets");
});

test("a cabinet with no hours of its own still tracks the business default", () => {
  const line = { product_type: "base_cabinet", qty: 2, product_unit_cost_ex_gst: 100 };
  const calculated = calculateQuoteLine(line, { labour_hours_per_cabinet: 1.5, markup_percent: 0 });
  assert.equal(calculated.labour_hours, 3, "every cabinet already saved is unaffected");
});

test("running the calculation twice does not grow the hours", () => {
  // The hours are read off the configuration, never off the line's own
  // labour_hours column, because that column is this calculation's output.
  const line = {
    product_type: "base_cabinet",
    qty: 2,
    product_unit_cost_ex_gst: 100,
    cabinet_config: { labour_hours: 3 },
  };
  const defaults = { labour_hours_per_cabinet: 1, markup_percent: 0 };
  const once = calculateQuoteLine(line, defaults);
  const twice = calculateQuoteLine({ ...line, ...once, cabinet_config: line.cabinet_config }, defaults);
  assert.equal(once.labour_hours, 6);
  assert.equal(twice.labour_hours, 6, "the hours grew on the second pass");
});

test("a quote is totalled with its cabinets attached", () => {
  // Reading the line items alone left the hours somebody typed invisible to the
  // total, so the quote and the cabinet disagreed.
  const saver = read("app/api/admin/quotes/[id]/_quote-line-save.js");
  assert.match(saver, /export async function loadQuoteLinesWithCabinets/);
  assert.match(saver, /loadQuoteLinesWithCabinets\(supabase, quoteId\)/, "the totals do not load the cabinets");
  assert.match(REPRICE, /loadQuoteLinesWithCabinets\(context\.supabase, quoteId\)/, "the reprice does not load the cabinets");
});

// ---------------------------------------------------------------------------
// The reprice
// ---------------------------------------------------------------------------

test("a reprice does not relabel a cabinet as automatically priced", () => {
  // boardCostLinePatch writes "auto" and a calculated cost of zero, which is
  // right for a flat sheet priced by area and wrong for a box priced from its
  // cut list: a cabinet carries no width or height, so the area is zero and the
  // line was left labelled automatic at nothing beside its real price.
  assert.match(REPRICE, /const isCabinet = line\.product_type === CABINET_PRODUCT_TYPE/);
  assert.match(REPRICE, /unit_cost_mode: _mode, calculated_unit_cost_ex_gst: _calc, \.\.\.rest/);
});

test("a configured cabinet is not skipped as a manual override", () => {
  // A cabinet is always manually priced, because its price comes from its cut
  // list. Reading that as an override meant an ordinary reprice skipped every
  // configured cabinet while still offering to refresh its board rate.
  assert.match(REPRICE, /if \(line\.product_type === CABINET_PRODUCT_TYPE\) return false;/);
});

// ---------------------------------------------------------------------------
// Written once, rendered twice
// ---------------------------------------------------------------------------

test("the cabinet's fields are written once and rendered on both layouts", () => {
  // The desktop and phone layouts were full copies of each other, which is how
  // they drifted: the same fix had to be made twice and often was not.
  for (const [name, expected] of [["carcassBoardFields", 3], ["backPanelFields", 3], ["shapeFields", 3]]) {
    const uses = CONFIGURATOR.split(`${name}(`).length - 1;
    assert.equal(uses, expected, `${name} should be defined once and used on both layouts, found ${uses} mentions`);
  }
});

test("a cabinet added by hand can be a corner or house a rangehood", () => {
  // Both are columns on the record and the design tool sets them. This screen
  // could set neither, so a cabinet added here could never be a corner.
  assert.match(CONFIGURATOR, /Corner cabinet/);
  assert.match(CONFIGURATOR, /updateConfig\("is_corner", e\.target\.checked\)/);
  assert.match(CONFIGURATOR, /Second leg width mm/);
  assert.match(CONFIGURATOR, /Houses a rangehood/);
  assert.match(CONFIGURATOR, /updateConfig\("has_rangehood", e\.target\.checked\)/);
});
