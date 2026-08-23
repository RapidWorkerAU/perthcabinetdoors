// Whether a job counts as planned.

import test from "node:test";
import assert from "node:assert/strict";

import {
  IN_HOUSE,
  SUPPLIER,
  UNSET,
  isDecided,
  isMadeHere,
  isSupplierMade,
  undecidedPanels,
  planningGaps,
  isPlanned,
  planningSummary,
} from "../lib/pcd-order-planning.js";

const panel = (method, extra = {}) => ({ plan: { fulfilment_method: method }, ...extra });
const SCHEDULED = { scheduled_start_date: "2026-09-07", production_lead_days: 14 };

// ── the three states ───────────────────────────────────────────────────────

test("a panel is decided only when somebody actually chose", () => {
  assert.equal(isDecided(IN_HOUSE), true);
  assert.equal(isDecided(SUPPLIER), true);
  assert.equal(isDecided(UNSET), false);
  assert.equal(isDecided(undefined), false);
  assert.equal(isDecided(null), false);
});

// This is the bug the whole change exists to fix. Treating "not in house" as
// "supplier" is how an unanswered question ends up on a supplier order.
test("undecided is not the same as supplier made", () => {
  assert.equal(isSupplierMade(UNSET), false);
  assert.equal(isSupplierMade(undefined), false);
  assert.equal(isSupplierMade(SUPPLIER), true);
});

test("undecided is not the same as made here either", () => {
  assert.equal(isMadeHere(UNSET), false);
  assert.equal(isMadeHere(undefined), false);
  assert.equal(isMadeHere(IN_HOUSE), true);
});

test("the three states never overlap and never all miss", () => {
  [IN_HOUSE, SUPPLIER, UNSET, undefined, null, "nonsense"].forEach((method) => {
    const flags = [isMadeHere(method), isSupplierMade(method)].filter(Boolean).length;
    assert.ok(flags <= 1, `${String(method)} claimed two states`);
    assert.equal(isDecided(method), flags === 1, `${String(method)} disagreed with isDecided`);
  });
});

// ── undecided panels ───────────────────────────────────────────────────────

test("only the panels with no decision are counted", () => {
  const rows = [panel(IN_HOUSE), panel(UNSET), panel(SUPPLIER), panel(undefined)];
  assert.equal(undecidedPanels(rows).length, 2);
});

// Thermolaminate can only ever be supplier ready made, so it is never an
// outstanding decision even before anybody opens the tab.
test("a thermolaminate panel is never an outstanding decision", () => {
  const rows = [panel(SUPPLIER, { thermolaminated: true }), panel(UNSET, { thermolaminated: true })];
  assert.equal(undecidedPanels(rows).length, 0);
});

test("no rows means nothing undecided", () => {
  assert.equal(undecidedPanels([]).length, 0);
  assert.equal(undecidedPanels(null).length, 0);
});

// ── the gaps ───────────────────────────────────────────────────────────────

test("a fully planned order has no gaps", () => {
  assert.deepEqual(planningGaps(SCHEDULED, [panel(IN_HOUSE), panel(SUPPLIER)]), []);
  assert.equal(isPlanned(SCHEDULED, [panel(IN_HOUSE)]), true);
  assert.equal(planningSummary(SCHEDULED, [panel(IN_HOUSE)]), "Planned");
});

test("a missing start date is a gap", () => {
  const gaps = planningGaps({ production_lead_days: 14 }, [panel(IN_HOUSE)]);
  assert.deepEqual(gaps.map((g) => g.key), ["scheduled_start"]);
});

test("a missing timeframe is a gap", () => {
  const gaps = planningGaps({ scheduled_start_date: "2026-09-07" }, [panel(IN_HOUSE)]);
  assert.deepEqual(gaps.map((g) => g.key), ["timeframe"]);
});

test("undecided panels are a gap, and the count is carried", () => {
  const gaps = planningGaps(SCHEDULED, [panel(UNSET), panel(UNSET), panel(IN_HOUSE)]);
  assert.deepEqual(gaps.map((g) => g.key), ["panels"]);
  assert.equal(gaps[0].count, 2);
  assert.match(gaps[0].detail, /2 panels/);
});

test("one undecided panel reads in the singular", () => {
  const gaps = planningGaps(SCHEDULED, [panel(UNSET)]);
  assert.match(gaps[0].detail, /1 panel with nobody set to make it/);
});

test("an order with nothing done at all reports all three gaps", () => {
  const gaps = planningGaps({}, [panel(UNSET)]);
  assert.deepEqual(gaps.map((g) => g.key), ["scheduled_start", "timeframe", "panels"]);
  assert.equal(isPlanned({}, [panel(UNSET)]), false);
});

// An order whose panels are all thermolaminate needs no panel decisions, so
// only the schedule can hold it up.
test("a thermolaminate only order just needs its schedule", () => {
  const rows = [panel(SUPPLIER, { thermolaminated: true })];
  assert.deepEqual(planningGaps({}, rows).map((g) => g.key), ["scheduled_start", "timeframe"]);
  assert.equal(isPlanned(SCHEDULED, rows), true);
});

test("the summary names the parts that are outstanding", () => {
  assert.equal(
    planningSummary({}, [panel(UNSET)]),
    "Scheduled start, How long it takes, Item planning outstanding"
  );
});

// A lead time of zero is not a timeframe, and must not read as one.
test("a zero timeframe is still missing", () => {
  const gaps = planningGaps({ scheduled_start_date: "2026-09-07", production_lead_days: 0 }, [panel(IN_HOUSE)]);
  assert.deepEqual(gaps.map((g) => g.key), ["timeframe"]);
});
