// The order issues report: counted by month, kind and owner, with a cost that
// was never entered kept apart from a real one.
import test from "node:test";
import assert from "node:assert/strict";
import { issuesReport, perthMonth, daysOpen } from "../lib/pcd-report-issues.js";

const NOW = Date.parse("2026-09-27T12:00:00+08:00");
const issue = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  order_id: "o1", kind: "wrong_size", owner: "us", blocks: "panel",
  detail: "Cut 10mm short", extra_cost_ex_gst: 0,
  raised_at: "2026-09-10T09:00:00+08:00", resolved_at: null,
  ...over,
});

const ISSUES = [
  issue({ id: "a", extra_cost_ex_gst: 120, kind: "damaged_in_production" }),
  issue({ id: "b", extra_cost_ex_gst: 80, resolved_at: "2026-09-14T09:00:00+08:00", resolution: "Remade" }),
  issue({ id: "c", order_id: "o2", owner: "supplier", raised_at: "2026-07-02T09:00:00+08:00" }),
  issue({ id: "d", order_id: "o2", kind: "custom_kind", raised_at: "2026-07-31T23:30:00+08:00", resolved_at: "2026-08-02T09:00:00+08:00", resolution: "Swapped" }),
];
const orders = new Map([["o1", { order_number: 1042, name: "Smith Kitchen", customer_name: "J Smith" }], ["o2", { order_number: 1043, customer_name: "K Lee" }]]);
const report = issuesReport(ISSUES, { orders, kinds: [{ key: "custom_kind", label: "Hinge drilled wrong" }], now: NOW });

test("totals: open against resolved, cost recorded against not", () => {
  const t = report.totals;
  assert.equal(t.issues, 4);
  assert.equal(t.open, 2);
  assert.equal(t.resolved, 2);
  assert.equal(t.withCost, 2);
  assert.equal(t.withoutCost, 2, "a $0 issue is 'no cost recorded', never free");
  assert.equal(t.cost, 200);
  assert.equal(t.openCost, 120);
  assert.equal(t.averageCost, 100, "averaged over the issues that have a cost");
  assert.equal(t.orders, 2);
});

test("months run oldest first with the quiet ones filled in, in Perth time", () => {
  assert.deepEqual(report.byMonth.map((m) => m.key), ["2026-07", "2026-08", "2026-09"]);
  assert.equal(report.byMonth[1].issues, 0, "August had none and still shows");
  assert.equal(report.byMonth[0].issues, 2, "11:30pm on 31 July in Perth is July");
  assert.equal(perthMonth("2026-07-31T16:30:00Z"), "2026-08", "which is August in UTC terms only after 4pm");
});

test("each breakdown counts the same issues", () => {
  for (const key of ["byKind", "byOwner", "byStage", "byBlocks", "byOrder", "byRaisedBy"]) {
    assert.equal(report[key].reduce((s, g) => s + g.issues, 0), 4, key);
  }
  assert.ok(report.byKind.some((k) => k.label === "Hinge drilled wrong"), "a kind added in Settings reads by its own name");
  assert.equal(report.byOwner.find((o) => o.key === "supplier").issues, 1);
  assert.equal(report.byStage[0].label, "Not recorded");
  assert.equal(report.byOrder.find((o) => o.key === "o1").label, "#1042 Smith Kitchen");
});

test("every issue row says how long it has been open, or took", () => {
  const b = report.rows.find((r) => r.id === "b");
  assert.equal(b.status, "resolved");
  assert.equal(b.days, 4);
  const a = report.rows.find((r) => r.id === "a");
  assert.equal(a.status, "open");
  assert.equal(a.days, daysOpen(ISSUES[0], NOW));
  assert.equal(report.rows[0].id, "a", "newest first");
  assert.equal(report.totals.medianDaysToResolve, 3, "median of 4 days and 1 day, rounded");
});

test("nothing raised is an empty report, not an error", () => {
  const empty = issuesReport([], {});
  assert.equal(empty.totals.issues, 0);
  assert.deepEqual(empty.byMonth, []);
  assert.equal(empty.totals.medianDaysToResolve, null);
});
