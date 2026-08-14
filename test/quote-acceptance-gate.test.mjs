// How the missing-details block is presented on the quote acceptance page.
//
// The first version announced itself in a banner at the top of the summary,
// listed what was missing, and opened a separate editor panel underneath when
// you clicked Add. Seen on the page it was overbearing: the block was stated
// three times and editing one field opened a form.
//
// The rules now are: say it once, next to the button it disables; mark the
// tiles that are blocking in the same colour; and let a tile edit itself in
// place. There is no DOM renderer in this project, so these read the source.
// That is enough to catch the regression that matters, which is the banner or
// the editor panel coming back.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CLIENT = readFileSync(new URL("../app/(site)/quotes/QuoteApprovalClient.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../app/(site)/quotes/quote-public.module.css", import.meta.url), "utf8");

test("nothing announces the block at the top of the summary", () => {
  assert.ok(!CLIENT.includes("detailsGate"), "the standing banner must not come back");
  assert.ok(!CSS.includes(".detailsGate"), "and neither must its styles");
});

test("no separate editor panel opens under the summary", () => {
  assert.ok(!CLIENT.includes("DetailEditor"), "a tile edits itself in place");
  assert.ok(!CSS.includes(".detailEditor "), "and the panel styles are gone");
  assert.ok(!CSS.includes(".detailEditorGrid"), "including its grid");
});

test("the block is stated exactly once", () => {
  const occurrences = (CLIENT.match(/acceptBlocked/g) || []).length;
  assert.equal(occurrences, 1, "one place in the markup, next to the button it disables");
  assert.match(CLIENT, /Rejecting this quote does not require them/, "and it still says rejecting is unaffected");
});

test("the sentence sits with the Approve button, not in the summary", () => {
  const blocked = CLIENT.indexOf("acceptBlocked");
  const approve = CLIENT.indexOf("Approve quote");
  const summaryGrid = CLIENT.indexOf("quoteViewSummaryGrid");
  assert.ok(blocked > summaryGrid, "after the summary");
  assert.ok(approve > blocked, "and immediately before the button");
});

test("the blocking marker and the sentence are the same red", () => {
  // If these drift apart the connection the customer makes when they scroll
  // back up is broken, which is the whole point of marking the tiles.
  const pill = CSS.match(/\.detailAdd \{[^}]*border: 1px solid (#[0-9a-f]{6})/i);
  const note = CSS.match(/\.acceptBlocked \{[^}]*border: 1px solid (#[0-9a-f]{6})/i);
  assert.ok(pill && note, "both carry a border colour");
  assert.equal(pill[1].toLowerCase(), note[1].toLowerCase());
});

test("a blocking tile is marked, at a specificity that beats the card's label colour", () => {
  // .quoteViewCard .summaryItem span sets the label colour, so a bare
  // .summaryItemMissing > span would lose and the tile would not look marked.
  assert.match(CSS, /\.quoteViewCard \.summaryItemMissing > span/);
  assert.match(CLIENT, /styles\.summaryItemMissing/);
});

test("Approve stays disabled while anything is missing, Reject never is", () => {
  const approve = CLIENT.slice(CLIENT.indexOf('onClick={() => submitAction("approved")}'), CLIENT.indexOf("Approve quote"));
  assert.match(approve, /disabled=\{isSubmitting \|\| !detailsComplete\}/);

  const reject = CLIENT.slice(CLIENT.indexOf('submitAction("rejected")'), CLIENT.indexOf("Reject quote"));
  assert.ok(!reject.includes("detailsComplete"), "declining must never require an address");
});

test("only one tile is open at a time", () => {
  assert.match(CLIENT, /const \[openTile, setOpenTile\] = useState\(null\)/);
  assert.match(CLIENT, /isOpen=\{openTile === tile\.id\}/);
});

test("the address is one tile holding its three fields", () => {
  const tile = CLIENT.match(/\{ id: "address"[^}]*\}/);
  assert.ok(tile, "the address tile must exist");
  assert.match(tile[0], /keys: ADDRESS_KEYS/, "street, suburb and postcode together");
  assert.match(CLIENT, /\{keys\.map\(\(key, index\)/, "and it renders one input per key");
});

test("leaving a tile only closes it when what is in it is valid", () => {
  // Focus moving between the three address inputs must not close the tile, and
  // a half-typed postcode must not fold away out of sight.
  assert.match(CLIENT, /event\.currentTarget\.contains\(event\.relatedTarget\)/);
  assert.match(CLIENT, /if \(valid\) onClose\(\)/);
});
