// Business defaults have to reach every document that is priced or sent.
//
// They kept not doing that, in four different ways, and every one of them was
// silent: a hardcoded terms string on the conversion path, hardcoded currency
// and GST on two "create quote" buttons, drawer runner rates that existed only
// as constants, and a settings screen that fell back to the built-in numbers
// when it could not read the real ones.
//
// The common thread is that a fallback constant was allowed to stand in for a
// business decision. These lock the rules that stop that.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_BUSINESS_DEFAULTS,
  normalizeBusinessDefaults,
} from "../lib/pcd-quote-utils.js";
import { businessDefaultsToDbRow } from "../lib/pcd-business-defaults.js";
import { runnerUnitCost } from "../lib/pcd-drawer-utils.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const LEGACY_TERMS =
  "Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.";

// ── No built-in wording ──────────────────────────────────────────────────────

test("the built-in defaults carry no terms wording of their own", () => {
  // This is what made the deleted terms keep coming back: the constant held the
  // old sentence, so every fallback reintroduced it onto a real quote.
  assert.equal(DEFAULT_BUSINESS_DEFAULTS.quote_terms, "");
  assert.equal(DEFAULT_BUSINESS_DEFAULTS.variation_terms, "");
});

test("no code path writes the old terms sentence any more", () => {
  const writePaths = [
    "app/api/admin/quote-requests/route.js",
    "app/admin/quotes/QuotesTable.tsx",
    "app/admin/design/_components/ImportModal.js",
    "app/api/admin/orders/[id]/variations/route.js",
    "lib/pcd-quote-utils.js",
  ];
  for (const path of writePaths) {
    assert.ok(!read(path).includes(LEGACY_TERMS), `${path} still hardcodes the old terms`);
  }
});

test("blank terms stay blank rather than growing wording from a constant", () => {
  const defaults = normalizeBusinessDefaults({ quote_terms: "", variation_terms: "" });
  assert.equal(defaults.quote_terms, "");
  assert.equal(defaults.variation_terms, "");
});

test("terms that were never set read as blank, not as an invented sentence", () => {
  const defaults = normalizeBusinessDefaults({ quote_terms: null, variation_terms: undefined });
  assert.equal(defaults.quote_terms, "");
  assert.equal(defaults.variation_terms, "");
});

test("configured terms come through untouched", () => {
  const defaults = normalizeBusinessDefaults({ quote_terms: "Valid 30 days. Deposit on order." });
  assert.equal(defaults.quote_terms, "Valid 30 days. Deposit on order.");
});

// ── Clients must not override the configured settings ────────────────────────

test("the create-quote buttons no longer send their own currency, GST or terms", () => {
  // The server fills each of these from Business Defaults only when the caller
  // omits it, so sending a value from the browser silently beat the setting.
  for (const path of ["app/admin/quotes/QuotesTable.tsx", "app/admin/design/_components/ImportModal.js"]) {
    const src = read(path);
    const body = src.slice(src.indexOf("/api/admin/quotes"), src.indexOf("/api/admin/quotes") + 900);
    assert.ok(!/gst_rate:/.test(body), `${path} still sends a GST rate`);
    assert.ok(!/currency:/.test(body), `${path} still sends a currency`);
    assert.ok(!/terms:/.test(body), `${path} still sends terms`);
  }
});

test("converting a quote request reads the configured terms", () => {
  const src = read("app/api/admin/quote-requests/route.js");
  assert.match(src, /terms:\s*businessDefaults\.quote_terms/);
});

test("creating a variation reads the configured currency, GST and terms", () => {
  const src = read("app/api/admin/orders/[id]/variations/route.js");
  assert.match(src, /getBusinessDefaults/, "the variations route must read business defaults at all");
  assert.match(src, /currency:\s*businessDefaults\.currency/);
  assert.match(src, /gst_rate:\s*businessDefaults\.gst_rate/);
  assert.match(src, /terms:\s*businessDefaults\.variation_terms/);
});

// ── Drawer runner rates ──────────────────────────────────────────────────────

test("runner rates survive normalising, so a configured rate can reach a quote", () => {
  // They used to be dropped here, which is why the importer always priced a
  // runner pair at the built-in number no matter what was saved.
  const defaults = normalizeBusinessDefaults({
    runner_unit_cost_standard_ex_gst: 11,
    runner_unit_cost_soft_close_undermount_ex_gst: 32,
    runner_unit_cost_soft_close_side_ex_gst: 19,
  });
  assert.equal(defaults.runner_unit_cost_standard_ex_gst, 11);
  assert.equal(defaults.runner_unit_cost_soft_close_undermount_ex_gst, 32);
  assert.equal(defaults.runner_unit_cost_soft_close_side_ex_gst, 19);
});

test("a normalised defaults object actually prices a runner at the configured rate", () => {
  const defaults = normalizeBusinessDefaults({ runner_unit_cost_soft_close_undermount_ex_gst: 32 });
  assert.equal(runnerUnitCost({ runner_type: "soft_close_undermount" }, defaults), 32);
});

test("runner rates are written back when the settings screen saves", () => {
  const row = businessDefaultsToDbRow({ runner_unit_cost_standard_ex_gst: 11 });
  assert.equal(row.runner_unit_cost_standard_ex_gst, 11);
  assert.ok("runner_unit_cost_soft_close_undermount_ex_gst" in row);
  assert.ok("runner_unit_cost_soft_close_side_ex_gst" in row);
  assert.ok("variation_terms" in row);
});

test("the design importer asks for the configured runner rate", () => {
  const src = read("app/api/admin/design/projects/[projectId]/import/route.js");
  assert.match(src, /runnerUnitCost\(cfg,\s*businessDefaults\)/, "the importer must pass the configured defaults");
});

// ── Zero is not an answer for an hourly rate ─────────────────────────────────

test("a zero hourly rate in settings inherits rather than pricing labour at nothing", () => {
  // not-null default 0 means "never filled in" is indistinguishable from a
  // deliberate zero, and nobody quotes a $0/hour worker.
  assert.equal(normalizeBusinessDefaults({ worker_hourly_rate: 0 }).worker_hourly_rate, 85);
  assert.equal(normalizeBusinessDefaults({ worker_hourly_rate: "" }).worker_hourly_rate, 85);
});

test("a real hourly rate is never second-guessed", () => {
  assert.equal(normalizeBusinessDefaults({ worker_hourly_rate: 92.5 }).worker_hourly_rate, 92.5);
});

test("zero is still a real answer where it means something", () => {
  // 0% markup is a genuine choice on a pass-through line, and a business can
  // legitimately not charge a hinge drilling fee.
  assert.equal(normalizeBusinessDefaults({ markup_percent: 0 }).markup_percent, 0);
  assert.equal(normalizeBusinessDefaults({ hinge_drilling_unit_cost_ex_gst: 0 }).hinge_drilling_unit_cost_ex_gst, 0);
});

// ── Nothing may be dropped between the screen and the row ────────────────────

test("every field the app knows about is written back to the database", () => {
  // normalizeBusinessDefaults drops keys it does not list, and the db row drops
  // keys it does not list. A field missing from either is a setting that
  // silently does nothing, which is exactly how the runner rates got lost.
  const row = businessDefaultsToDbRow({});
  const normalized = normalizeBusinessDefaults({});
  for (const key of Object.keys(normalized)) {
    assert.ok(key in row, `${key} is normalised but never saved`);
  }
});

// ── The settings screen must not save what it could not load ─────────────────

test("the settings screen refuses to save before the real values have loaded", () => {
  const src = read("app/admin/_components/AccountSettingsForm.tsx");
  assert.match(src, /defaultsLoaded/, "it must track whether the load succeeded");
  assert.match(src, /if \(!defaultsLoaded\)/, "saving must be blocked until it has");
  assert.ok(!/\.catch\(\(\) => \{\}\)\s*\n\s*return \(\) => \{ cancelled = true \}/.test(src),
    "the defaults load must not swallow its error");
});

// ── Migration ordering ───────────────────────────────────────────────────────

test("the column migration sorts before the repair that reads those columns", () => {
  // Migrations are run in filename order, so a repair script that reads a
  // column must sort AFTER the script that adds it. Getting this backwards
  // fails at parse time with "column does not exist", which is what happened.
  const columns = "202608171500_pcd_business_defaults_runner_and_variation_terms.sql";
  const repair = "202608171600_pcd_repair_legacy_quote_terms.sql";

  assert.ok(columns < repair, "the columns migration must sort first");
  read(`supabase/${columns}`);
  read(`supabase/${repair}`);
});

test("the repair script survives being run before the column exists", () => {
  // A plain reference to a missing column fails when the block is PARSED, before
  // any guard inside it runs, so the variation half has to be dynamic SQL behind
  // an information_schema check.
  const src = read("supabase/202608171600_pcd_repair_legacy_quote_terms.sql");
  assert.match(src, /information_schema\.columns/, "it must check the column exists");
  assert.match(src, /has_variation_terms/, "it must branch on that check");
  assert.match(src, /execute \$q\$/, "the guarded read must be dynamic SQL");
});

test("there is only one business defaults editor", () => {
  // Two screens editing one singleton row is how they drift apart. The second
  // one was unreachable anyway.
  let found = true;
  try {
    read("app/admin/business-defaults/BusinessDefaultsManager.js");
  } catch {
    found = false;
  }
  assert.equal(found, false, "the duplicate business defaults editor is back");
});
