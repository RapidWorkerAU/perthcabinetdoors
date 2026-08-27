// Panel issues.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ISSUE_KINDS,
  ISSUE_OWNERS,
  ISSUE_BLOCKS,
  ISSUE_KIND_KEYS,
  issueKindLabel,
  issueOwnerLabel,
  issueBlocksLabel,
  progressKindFor,
  progressValueFor,
  progressReads,
  isOpen,
  openIssues,
  issuesForPanel,
  validateIssue,
  validateResolution,
  sortIssues,
  daysSince,
  openReworkCost,
  panelIssueSummary,
  blocksWholeOrder,
} from "../lib/pcd-order-issues.js";
import { ORDER_LINE_STATUSES, ORDER_PRODUCTION_STAGES } from "../lib/pcd-quote-utils.js";

const TODAY = "2026-08-19";
const issue = (over = {}) => ({
  id: "x", line_item_id: "L1", panel_key: null, kind: "wrong_size", detail: "Cut short.",
  stage_at_report: "Cutting", progress_kind: "Stage", owner: "us", blocks: "panel",
  extra_cost_ex_gst: 0, raised_at: TODAY, resolved_at: null, resolution: null, ...over,
});

// ── the lists ──────────────────────────────────────────────────────────────

test("every kind, owner and blocks value has a key and a label", () => {
  [ISSUE_KINDS, ISSUE_OWNERS, ISSUE_BLOCKS].forEach((list) => {
    assert.ok(list.length >= 3);
    list.forEach((item) => {
      assert.ok(item.key && typeof item.key === "string");
      assert.ok(item.label && typeof item.label === "string");
    });
  });
});

test("the keys are unique within each list", () => {
  [ISSUE_KINDS, ISSUE_OWNERS, ISSUE_BLOCKS].forEach((list) => {
    const keys = list.map((i) => i.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});

// An unknown key used to read as "Something else", which was right while the
// kinds were a fixed list. They can be added to in Settings, Lists now, so an
// unknown key is far more likely to be a kind somebody set up than a mistake,
// and it reads as its own words. Passing the live list gives the real label;
// this is the fallback for a PDF or anywhere else the list is out of reach.
test("an unknown key reads as words rather than as somebody else's label", () => {
  assert.equal(issueKindLabel("wrong_size"), "Wrong size");
  assert.equal(issueKindLabel("damaged_in_transit"), "Damaged in transit");
  assert.equal(
    issueKindLabel("damaged_in_transit", [{ key: "damaged_in_transit", label: "Damaged in transit by courier" }]),
    "Damaged in transit by courier",
    "the live list wins when the caller has it"
  );
  assert.equal(issueKindLabel(""), "Something else", "and nothing at all still has a label");
  assert.equal(issueOwnerLabel("customer"), "The customer");
  assert.equal(issueBlocksLabel("order"), "The whole order");
});

// The whole point of the change: an issue is no longer a status, so it must
// not appear in either dropdown.
test("Issue Follow-Up is no longer a panel status or stage", () => {
  assert.ok(!ORDER_LINE_STATUSES.includes("Issue Follow-Up"), "still in the line statuses");
  assert.ok(!ORDER_PRODUCTION_STAGES.includes("Issue Follow-Up"), "still in the production stages");
});

// ── which progress field applies ───────────────────────────────────────────

test("a panel we cut records a stage, one a supplier makes records a status", () => {
  assert.equal(progressKindFor("in_house"), "Stage");
  assert.equal(progressKindFor("supplier_ready_made"), "Status");
  assert.equal(progressValueFor({ production_stage: "Drilling", status: "Ordered" }, "in_house"), "Drilling");
  assert.equal(progressValueFor({ production_stage: "Drilling", status: "Ordered" }, "supplier_ready_made"), "Ordered");
});

test("no plan means no recorded progress rather than a guess", () => {
  assert.equal(progressValueFor(null, "in_house"), "");
  assert.equal(progressValueFor({}, "in_house"), "");
});

// A value on its own is ambiguous about which list it came from.
test("the recorded progress reads with its label", () => {
  assert.equal(progressReads(issue()), "Stage: Cutting");
  assert.equal(progressReads(issue({ progress_kind: "Status", stage_at_report: "Ordered" })), "Status: Ordered");
  assert.equal(progressReads(issue({ stage_at_report: "" })), "");
});

// ── open and resolved ──────────────────────────────────────────────────────

test("an issue is open until it is resolved", () => {
  assert.equal(isOpen(issue()), true);
  assert.equal(isOpen(issue({ resolved_at: "2026-08-19" })), false);
  assert.equal(isOpen(null), false);
});

test("open issues for a panel are matched on the line and the panel key", () => {
  const rows = [
    issue({ id: "a", line_item_id: "L1", panel_key: "door_1" }),
    issue({ id: "b", line_item_id: "L1", panel_key: "door_2" }),
    issue({ id: "c", line_item_id: "L2", panel_key: "door_1" }),
    issue({ id: "d", line_item_id: "L1", panel_key: "door_1", resolved_at: TODAY }),
  ];
  assert.deepEqual(issuesForPanel(rows, "L1", "door_1").map((i) => i.id), ["a"]);
  assert.equal(openIssues(rows).length, 3);
});

test("a line with no panel key still matches its own issues", () => {
  const rows = [issue({ id: "a", line_item_id: "L1", panel_key: null })];
  assert.equal(issuesForPanel(rows, "L1", null).length, 1);
  assert.equal(issuesForPanel(rows, "L1", "door_1").length, 0);
});

// ── validation ─────────────────────────────────────────────────────────────

test("a kind and a description are both required", () => {
  assert.deepEqual(Object.keys(validateIssue({})).sort(), ["detail", "kind"]);
  assert.deepEqual(Object.keys(validateIssue({ kind: "wrong_size" })), ["detail"]);
  assert.deepEqual(validateIssue({ kind: "wrong_size", detail: "Cut short." }), {});
});

test("a kind that is not on the list is refused", () => {
  assert.ok(validateIssue({ kind: "made_up", detail: "Something." }).kind);
});

test("a one word description is not a description", () => {
  assert.ok(validateIssue({ kind: "other", detail: "bad" }).detail);
  assert.ok(validateIssue({ kind: "other", detail: "   " }).detail);
});

test("an owner or blocks value off the list is refused", () => {
  assert.ok(validateIssue({ kind: "other", detail: "Broke.", owner: "santa" }).owner);
  assert.ok(validateIssue({ kind: "other", detail: "Broke.", blocks: "everything" }).blocks);
});

test("a negative rework cost is refused, and an empty one is fine", () => {
  assert.ok(validateIssue({ kind: "other", detail: "Broke.", extra_cost_ex_gst: -5 }).extra_cost_ex_gst);
  assert.deepEqual(validateIssue({ kind: "other", detail: "Broke.", extra_cost_ex_gst: "" }), {});
  assert.deepEqual(validateIssue({ kind: "other", detail: "Broke.", extra_cost_ex_gst: 74 }), {});
});

// Nothing closes silently.
test("resolving requires a sentence", () => {
  assert.ok(validateResolution("").resolution);
  assert.ok(validateResolution("ok").resolution);
  assert.deepEqual(validateResolution("Remade from the offcut."), {});
});

// ── sorting ────────────────────────────────────────────────────────────────

test("anything blocking the whole order sorts above everything", () => {
  const rows = [
    issue({ id: "old", raised_at: "2026-07-01", blocks: "panel" }),
    issue({ id: "blocker", raised_at: "2026-08-18", blocks: "order" }),
    issue({ id: "new", raised_at: "2026-08-19", blocks: "panel" }),
  ];
  assert.deepEqual(sortIssues(rows, TODAY).map((i) => i.id), ["blocker", "old", "new"]);
});

test("two blockers sort oldest first between themselves", () => {
  const rows = [
    issue({ id: "recent", raised_at: "2026-08-18", blocks: "order" }),
    issue({ id: "ancient", raised_at: "2026-06-01", blocks: "order" }),
  ];
  assert.deepEqual(sortIssues(rows, TODAY).map((i) => i.id), ["ancient", "recent"]);
});

test("sorting does not mutate what it was given", () => {
  const rows = [issue({ id: "a" }), issue({ id: "b", blocks: "order" })];
  sortIssues(rows, TODAY);
  assert.deepEqual(rows.map((i) => i.id), ["a", "b"]);
});

test("age is whole days and never negative", () => {
  assert.equal(daysSince("2026-08-12", TODAY), 7);
  assert.equal(daysSince("2026-08-19", TODAY), 0);
  assert.equal(daysSince("2026-09-01", TODAY), 0);
  assert.equal(daysSince(null, TODAY), 0);
});

// ── the roll ups ───────────────────────────────────────────────────────────

// A resolved issue has already been paid for. Counting it again would double
// the rework figure every time somebody looked at the order.
test("rework cost counts open issues only", () => {
  const rows = [
    issue({ extra_cost_ex_gst: 74 }),
    issue({ extra_cost_ex_gst: 46 }),
    issue({ extra_cost_ex_gst: 500, resolved_at: TODAY }),
  ];
  assert.equal(openReworkCost(rows), 120);
  assert.equal(openReworkCost([]), 0);
});

test("a non-numeric cost counts as nothing rather than NaN", () => {
  assert.equal(openReworkCost([issue({ extra_cost_ex_gst: null }), issue({ extra_cost_ex_gst: "12.50" })]), 12.5);
});

test("the panel summary reads as one line, or nothing when clear", () => {
  assert.equal(panelIssueSummary([], TODAY), "");
  assert.match(panelIssueSummary([issue({ raised_at: "2026-08-16" })], TODAY), /Wrong size, raised 3 days ago/);
  assert.equal(panelIssueSummary([issue({ id: "a" }), issue({ id: "b" })], TODAY), "2 open issues");
});

test("a resolved issue does not make a panel look like it is in trouble", () => {
  assert.equal(panelIssueSummary([issue({ resolved_at: TODAY })], TODAY), "");
  assert.equal(blocksWholeOrder([issue({ blocks: "order", resolved_at: TODAY })]), false);
  assert.equal(blocksWholeOrder([issue({ blocks: "order" })]), true);
});
