// WHAT THE PRE GO-LIVE REVIEW FOUND, KEPT FIXED (2026-10-06).
//
//   No API key in a file that is committed.
//   A person's own reply is never sent as Alfred's approved draft, and an
//   untouched draft is not recorded as edited.
//   An email that has gone is never sent again because a later step failed.
//   One quote request never becomes two quotes.
//   A board the gate clears or repoints takes its price with it.
//   The morning summary goes once a day.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settleImportedLine } from "../lib/pcd-line-gate.js";
import { QUOTE_LINE_FIELDS } from "../lib/pcd-save-clash.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("no API key is written into the example settings file", () => {
  assert.doesNotMatch(read(".env.example"), /sk-ant-/);
  assert.match(read(".env.example"), /^ANTHROPIC_API_KEY=$/m);
});

test("the desk only approves Alfred's draft when it was actually put in the box", () => {
  const desk = read("app/admin/customers/[id]/CustomerDeskClient.js");
  assert.ok(desk.includes('if (!leftOver && draft.replace(/<[^>]*>/g, "").trim()) return;'), "the person's own words are kept and nothing is marked loaded");
  assert.ok(desk.includes("bodyText: draft === alfredHtmlRef.current ? alfredDraft.body_text"), "untouched goes back exactly as written");
});

test("an email that went is never sent again because something after it failed", () => {
  assert.match(read("lib/pcd-desk-reply.js"), /if \(emailed && error && typeof error === "object"\) error\.alreadySent = true;/);
  const drafts = read("lib/pcd-alfred-drafts.js");
  assert.match(drafts, /sentOk = true;/);
  assert.match(drafts, /if \(sentOk \|\| error\?\.alreadySent\) \{/);
});

test("a quote request is claimed before a quote is made from it", () => {
  const conversion = read("lib/pcd-quote-request-conversion.js");
  const claim = conversion.indexOf('.update({ status: "converted_to_quote" })');
  const insert = conversion.indexOf('.from("pcd_quotes")');
  assert.ok(claim > 0 && claim < insert, "the claim comes before the quote is inserted");
  assert.match(conversion, /return \{ quoteId: null, alreadyConverted: true, busy: true \};/);
  assert.match(read("app/api/admin/quote-requests/route.js"), /if \(result\.busy\)/);
});

test("conversion settles a cabinet's own boards, like the other imports", () => {
  const conversion = read("lib/pcd-quote-request-conversion.js");
  assert.match(conversion, /settleImportedCabinet\(gate, result\.line\.cabinet_config\)/);
  assert.match(conversion, /settledCabinets\.has\(index\) \? settledCabinets\.get\(index\)/);
});

test("a board cleared on import takes the price worked out from it", () => {
  // A checker that faults the colour once, then passes.
  let calls = 0;
  const check = (line) => {
    calls += 1;
    return calls === 1 && line.colour ? { faults: [{ field: "colour", message: "No such colour." }], patch: {} } : { faults: [], patch: {} };
  };
  const { line } = settleImportedLine(check, { colour: "Made Up", unit_cost_source_id: "x", unit_cost_per_sqm_ex_gst: 88, unit_cost_source_label: "Polytec Made Up", manual_unit_cost_ex_gst: 12 });
  assert.equal(line.colour, "");
  assert.equal(line.unit_cost_source_id, null);
  assert.equal(line.unit_cost_per_sqm_ex_gst, 0);
  assert.equal(line.unit_cost_source_label, null);
  assert.equal(line.manual_unit_cost_ex_gst, 12, "a price a person typed stays");
  assert.equal("cost_per_board_ex_gst" in line, false, "nothing is added that was not there");
});

test("a variation line is priced from the board the gate settled on", () => {
  for (const file of ["app/api/admin/orders/[id]/variations/[variationId]/lines/route.js", "app/api/admin/orders/[id]/variations/[variationId]/lines/[lineId]/route.js"]) {
    const route = read(file);
    assert.match(route, /async function settledPricingInput\(/, file);
    assert.match(route, /const settled = await settledPricingInput\(context\.supabase, payload, beforeGate, /, file);
  }
});

test("when somebody else's board is kept, its price is kept with it", () => {
  for (const field of ["unit_cost_source_id", "unit_cost_source_label", "unit_cost_per_sqm_ex_gst", "cost_per_board_ex_gst"]) {
    assert.ok(field in QUOTE_LINE_FIELDS, field);
  }
});

test("the morning summary is scheduled once and runs once a day", () => {
  assert.doesNotMatch(read("vercel.json"), /alfred-morning/);
  assert.match(read(".github/workflows/alfred.yml"), /alfred-morning/);
  assert.match(read("lib/pcd-alfred-morning.js"), /\.eq\("job", "morning"\)\.gte\("started_at", midnight\)/);
});
