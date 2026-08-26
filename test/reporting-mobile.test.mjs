// THE REPORTING PAGES ON A PHONE.
//
// ── WHAT GOES WRONG, AND WHY NOTHING CATCHES IT ──────────────────────────────
//
// A wide table inside overflow-x-auto is not broken, it just quietly scrolls
// sideways, and a sideways scroll inside a card is the one gesture nobody
// discovers. The build passes, the page renders, every other test passes, and
// the report simply looks like it is missing three columns.
//
// The house pattern on the quotes and orders lists is a table above md and a
// card each below it. These reports follow it.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   A TABLE TOO WIDE FOR A PHONE IS DESKTOP ONLY, and something takes its place.
//   A ROW OF BUTTONS WRAPS. Three date presets in a nested flex with no wrap ran
//   off the side of the card.
//   NOTHING PAGES DIFFERENTLY ON A PHONE. The cards and the table read the same
//   page of the same list.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const REPORTS = {
  "colours and materials": read("app/admin/reporting/materials/MaterialsReport.js"),
  "lead conversion": read("app/admin/reporting/leads/LeadConversionReport.js"),
  "weekly customer updates": read("app/admin/reporting/customer-updates/CustomerUpdatesReport.js"),
};

Object.entries(REPORTS).forEach(([name, source]) => {
  test(`${name}: a wide table is desktop only, with cards in its place`, () => {
    const widest = Math.max(0, ...[...source.matchAll(/min-w-\[(\d+)px\]/g)].map((hit) => Number(hit[1])));
    assert.ok(widest > 0, "the report has a table");
    // Anything over 400 cannot sit on a 375px screen without scrolling.
    assert.match(source, /hidden[^"]*md:block/, `${name} must hide its ${widest}px table below md`);
    assert.match(source, /md:hidden/, `${name} must offer something in its place`);
  });

  test(`${name}: the date presets wrap instead of running off the side`, () => {
    // They sat in a nested flex with no wrap, so all three ran past the edge of
    // the card on every phone.
    assert.match(
      source,
      /flex w-full flex-wrap gap-\[6px\] sm:ml-auto sm:w-auto/,
      `${name} must let its presets wrap`
    );
    // And the two date inputs share the row rather than one being squeezed out.
    assert.match(source, /flex min-w-\[140px\] flex-1 flex-col gap-1 sm:flex-none/);
  });

  test(`${name}: the phone list shows the same page as the table`, () => {
    // Two lists reading different slices of the same data is the sort of thing
    // that only shows up when somebody compares a phone to a desktop.
    const pageItems = (source.match(/pageItems\.map/g) || []).length;
    assert.ok(pageItems >= 2, `${name} must page both its table and its cards`);

    // Scoped to the loops that actually render a row of the paged list. Naming
    // any variable "rows" is not the fault: the materials report has a three
    // row make-versus-buy split that is not paged and never should be.
    const rowLoops = [...source.matchAll(/\{(\w+)\.map\(\s*\w+\s*=>\s*\(\s*\n\s*<tr\b/g)].map((hit) => hit[1]);
    assert.ok(rowLoops.length > 0, "the table must render rows from something");
    rowLoops.forEach((name2) => {
      assert.equal(name2, "pageItems", `the table renders ${name2}, which is not the paged slice`);
    });
  });
});

test("the second sidebar is reachable on a phone", () => {
  // It is hidden below md, so without a replacement there would be no way to
  // open a second report, library or work screen at all.
  const shared = read("app/admin/_components/SecondarySidebar.tsx");
  assert.match(shared, /hidden md:flex/);
  assert.match(shared, /md:hidden/);
  assert.match(shared, /overflow-x-auto/, "and the replacement scrolls rather than wrapping");
});

test("the main rail is desktop only, with the bottom bar in its place", () => {
  const shell = read("app/admin/_components/AdminShell.tsx");
  assert.match(shell, /hidden md:flex flex-shrink-0/, "the 220px rail never renders on a phone");
  assert.match(shell, /PcdBottomNav/, "the bottom bar takes over");
});
