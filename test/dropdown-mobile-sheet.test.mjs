// DROPDOWNS ON A PHONE ARE A BOTTOM SHEET.
//
// A panel anchored to a control halfway down a small screen has nowhere to go.
// It flips above or below depending on room, the keyboard opens over it the
// moment you type in the search box, and the page scrolls itself to keep up. The
// list moves while you are reading it.
//
// A sheet at the bottom edge is always in the same place, always the same size,
// and sits above the keyboard. These hold the pieces that make that true, since
// each one alone is enough to bring the jumping back.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const DROPDOWN = readFileSync(new URL("../components/ui/Dropdown.tsx", import.meta.url), "utf8");

test("a phone gets the sheet and a desktop gets the popover, never both", () => {
  assert.match(DROPDOWN, /\{isMobile && open && typeof document !== 'undefined'/);
  assert.match(DROPDOWN, /\{!isMobile && \(\s*\n\s*<Popover\.Portal>/, "the popover must not also render on a phone");
});

// 768 is where the admin pages themselves go to one column.
test("the switch happens at the width the page around it changes", () => {
  assert.match(DROPDOWN, /useIsMobile\(768\)/);
});

// The whole point of the sheet is a search box that does not move.
test("the search box is always there on a phone, whatever the prop says", () => {
  assert.match(DROPDOWN, /const isSearchable = searchable \|\| optionCount >= 16 \|\| isMobile/);
});

// Without this, dragging the list at either end scrolls the page underneath,
// which is the exact jumping the sheet exists to stop.
test("the page behind the sheet cannot scroll", () => {
  assert.match(DROPDOWN, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(DROPDOWN, /document\.body\.style\.overflow = previous/, "and it must be given back on close");
});

// iOS zooms the whole page in on a focused input under 16px, and that zoom is
// itself a jump.
test("the sheet's search box is big enough not to trigger the iOS zoom", () => {
  assert.match(DROPDOWN, /sheet \? 'h-\[42px\] pl-\[36px\] pr-3 text-\[16px\]'/);
});

test("a row on the sheet is a thumb-sized target", () => {
  assert.match(DROPDOWN, /sheet \? 'min-h-\[44px\] py-\[11px\] text-\[16px\]'/);
});

// The keyboard covers the bottom of the screen, and so does the home indicator.
test("the sheet keeps clear of the bottom of the phone", () => {
  assert.match(DROPDOWN, /env\(safe-area-inset-bottom/);
});

// A two-option list should not open a sheet most of the way up the screen, and a
// long one should not run off the top.
test("the sheet is sized by its content, up to a limit", () => {
  assert.match(DROPDOWN, /max-h-\[85vh\]/);
  assert.match(DROPDOWN, /sheet \? 'flex-1 min-h-0'/, "the list is the part that grows, not the frame");
});

// Three ways out, because the backdrop is invisible and a full-width sheet
// leaves little of it to tap.
test("there are three ways to close it", () => {
  assert.match(DROPDOWN, /onClick=\{\(\) => handleOpenChange\(false\)\}[\s\S]{0,120}aria-hidden/, "the backdrop");
  assert.match(DROPDOWN, /aria-label="Close"/, "a visible button");
  assert.match(DROPDOWN, /event\.key === 'Escape'/, "and the escape key");
});

test("the sheet says what it is choosing", () => {
  assert.match(DROPDOWN, /aria-label=\{label \|\| placeholder\}/);
  assert.match(DROPDOWN, /role="dialog"\s*\n\s*aria-modal="true"/);
});

// ── one body, two frames ───────────────────────────────────────────────────
//
// The alternative is the phone quietly losing something the desktop has, which
// is how the two drift apart.

test("both presentations render the same body", () => {
  assert.match(DROPDOWN, /renderBody\(\{ sheet: false \}\)/);
  assert.match(DROPDOWN, /renderBody\(\{ sheet: true \}\)/);
  assert.equal(
    (DROPDOWN.match(/function renderBody/g) || []).length,
    1,
    "one definition, or the two presentations can diverge"
  );
});

// Multi-select's select-all row and its footer are part of the body, so they
// have to reach the sheet too.
test("multi-select keeps its select-all and its footer on a phone", () => {
  const body = DROPDOWN.slice(DROPDOWN.indexOf("function renderBody"), DROPDOWN.indexOf("// ── Render"));
  assert.match(body, /Select all/);
  assert.match(body, /Clear all/);
});

// An empty list and a search that found nothing are different things to say.
test("an empty list does not claim a search found nothing", () => {
  assert.match(DROPDOWN, /searchQuery \? <>No results for/);
  assert.match(DROPDOWN, /'Nothing to choose from'/);
});

// ── the pickers that were not searchable ───────────────────────────────────
//
// The shared Dropdown searches past sixteen options and always on a phone. These
// two were plain <select> elements, which never search at all, and both list
// records that grow with the business.

test("the customer picker is searchable", () => {
  const editor = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
  assert.match(editor, /searchPlaceholder="Search by name or email"/);
  assert.doesNotMatch(
    editor,
    /<select[^>]*>\s*\n\s*<option value="">Manual \/ new customer<\/option>/,
    "the plain select is gone, not merely hidden"
  );
});

test("the quote picker on Stage Quote is searchable", () => {
  const modal = readFileSync(new URL("../app/admin/design/_components/StageQuoteModal.js", import.meta.url), "utf8");
  assert.match(modal, /searchPlaceholder="Search by number or customer"/);
  assert.doesNotMatch(modal, /<option value="">— choose a quote —<\/option>/);
});

// The label is what the search matches, so anything used to find a row has to
// be in it rather than rendered beside it.
test("both put everything searchable into the label", () => {
  const editor = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
  assert.match(editor, /label: `\$\{customer\.name\}\$\{customer\.email/, "email is searchable, not decoration");
  const modal = readFileSync(new URL("../app/admin/design/_components/StageQuoteModal.js", import.meta.url), "utf8");
  assert.match(modal, /q\.quote_number \? `#\$\{q\.quote_number\}`/);
  assert.match(modal, /q\.customer_name \|\| q\.title \|\| "Untitled"/);
});

// ── SOME SELECTED IS NOT NONE SELECTED ─────────────────────────────────────
//
// The select-all box read `allFilteredSelected || (someFilteredSelected ? false
// : false)`. The ternary returns false either way, so it was
// `allFilteredSelected` with a dead branch on the end: with three of ten rows
// ticked the box sat empty, saying nothing was selected.

test("select-all shows a half state when some rows are ticked", () => {
  assert.match(DROPDOWN, /partial=\{!allFilteredSelected && someFilteredSelected\}/);
  assert.match(DROPDOWN, /: partial \? 'indeterminate' : false/, "Radix needs the third state by name");
});

test("the half state is announced, not only drawn", () => {
  assert.match(DROPDOWN, /aria-checked=\{allFilteredSelected \? true : someFilteredSelected \? 'mixed' : false\}/);
});

test("the dead branch is gone", () => {
  assert.doesNotMatch(DROPDOWN, /someFilteredSelected \? false : false/);
});
