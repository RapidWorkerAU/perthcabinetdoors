// A QUOTE REQUEST, READ IN FULL ON THE CUSTOMER DESK.
//
// The desk listed a quote request as its brand and its status. Both of those
// are already on the screen and neither is what anybody is being asked about,
// so answering a question about a request meant leaving the page, opening the
// request, reading it, and coming back. Ashleigh works off this page all day.
// Fixed 13 September 2026: their own message, then every item they asked for.
//
// The words come from lib/pcd-line-summary.js, which is the same describer the
// customer's own confirmation email uses. Two describers of the same door would
// drift the first time either was touched, and then we would be answering a
// question about a door described one way from a screen describing it another.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { requestEntryHtml } from "../lib/pcd-desk-data.js";
import { lineExtras, lineType, requestLineText } from "../lib/pcd-line-summary.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const DOOR = {
  product_type: "Door", product_name: "Door", material: "Decorative Board", thickness: "16mm",
  width_mm: 550, height_mm: 700, finish: "Woodmatt", colour: "Angora Oak", qty: 2,
  edge_mould: "1mm Bevel Edge", hinge_holes: true, hinge_qty: "2 hinges", hinge_side: "Left",
  supplier_name: "Polytec",
};

// ── One line, in words ──────────────────────────────────────────────────────

test("a line reads as the whole thing somebody asked for", () => {
  const text = requestLineText(DOOR);
  assert.match(text, /^2 x Door/, "how many, and what");
  assert.match(text, /Decorative Board \/ 16mm/);
  assert.match(text, /700 x 550 mm/, "height first, the way this site writes a size");
  assert.match(text, /Woodmatt Angora Oak/);
  assert.match(text, /Polytec/);
  assert.match(text, /1mm Bevel Edge/);
  assert.match(text, /2 hinges/, "and the drilling, which is the thing most often queried");
});

test("a line with nothing much on it does not print a row of dashes", () => {
  const bare = { product_type: "Hardware", product_name: "Blum hinge", qty: 4 };
  assert.equal(requestLineText(bare), "4 x Hardware, Blum hinge");
  // A panel says which kind it is rather than six rows all reading "Panel".
  assert.equal(lineType({ product_type: "Panel", panel_use: "Scribe" }), "Scribe");
  // Only a door is drilled, so nothing else says anything about hinges.
  assert.ok(!lineExtras({ product_type: "Panel", hinge_holes: false }).join(" ").match(/hinge/i));
});

// ── The whole request on the desk ───────────────────────────────────────────

test("their own message comes first, then what they asked for", () => {
  const html = requestEntryHtml(
    { notes: "Hi team!\nAfter a quote for two doors please.", cabinet_brand: "Kaboodle", delivery_suburb: "Scarborough" },
    [DOOR]
  );
  // The message is what somebody is replying to, so it leads.
  assert.ok(html.indexOf("Hi team!") < html.indexOf("What they asked for"));
  assert.match(html, /Hi team!<br>After a quote/, "typed line breaks survive");
  assert.match(html, /<ul><li>2 x Door/);
  assert.match(html, /Kaboodle · Delivery to Scarborough<\/p>$/, "and where it is going, last");
});

test("a request with no message still shows its items", () => {
  const html = requestEntryHtml({ cabinet_brand: "Kaboodle" }, [DOOR]);
  assert.match(html, /What they asked for/);
  assert.match(html, /2 x Door/);
  assert.ok(!/No items or message/.test(html));
});

test("a request with neither says so, rather than showing an empty box", () => {
  const html = requestEntryHtml({ cabinet_brand: "Kaboodle" }, []);
  assert.match(html, /No items or message came through with this request\./);
  assert.match(html, /Kaboodle/);
});

test("what a customer typed cannot bring markup with it", () => {
  // This lands on an admin page through dangerouslySetInnerHTML, so it goes
  // through the same whitelist every other body on that page goes through.
  const html = requestEntryHtml({ notes: "<script>alert(1)</script> hi" }, []);
  assert.ok(!/<script/.test(html));
  assert.match(html, /&lt;script&gt;/);
  // And a note on a LINE is escaped too, not only the message.
  const sneaky = requestEntryHtml({}, [{ ...DOOR, notes: "<img src=x onerror=1>" }]);
  assert.ok(!/<img/.test(sneaky));
});

// ── One definition ──────────────────────────────────────────────────────────

test("the desk and the confirmation email describe a line the same way", () => {
  const summary = read("lib/pcd-line-summary.js");
  ["cleanLineColour", "lineDimensions", "lineMaterial", "lineType", "lineExtras"].forEach((fn) => {
    assert.match(summary, new RegExp(`export function ${fn}\\(`), `${fn} is shared`);
  });
  // The email reads them from there rather than keeping its own copies.
  const email = read("lib/pcd-email-templates.js");
  assert.match(email, /from "\.\/pcd-line-summary"/);
  assert.ok(!/^function lineType\(/m.test(email), "no second describer left behind");
  assert.ok(!/^function lineExtras\(/m.test(email));
  // And the desk reads the same one.
  const desk = read("lib/pcd-desk-data.js");
  assert.match(desk, /import \{ requestLineText \} from "\.\/pcd-line-summary"/);
});

test("the desk actually loads the request's message and its items", () => {
  const desk = read("lib/pcd-desk-data.js");
  assert.match(desk, /select\("id,product_name,cabinet_brand,status,created_at,notes,delivery_suburb,converted_quote_id"\)/);
  assert.match(desk, /from\("pcd_quote_request_line_items"\)/);
  assert.match(desk, /\.order\("sort_order", \{ ascending: true \}\)/, "in the order they were asked for");
  assert.match(desk, /body_html: requestEntryHtml\(row, requestLines\.get\(row\.id\) \|\| \[\]\)/);
});
