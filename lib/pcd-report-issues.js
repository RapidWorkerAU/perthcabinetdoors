// ORDER ISSUES, COUNTED.
//
// Every problem raised against a panel on an order (pcd_order_issues): how many,
// what kind, what they cost us, and whether they are dealt with. Read only.
//
// ── WHAT "COST" MEANS HERE ───────────────────────────────────────────────────
//
// extra_cost_ex_gst is what the issue cost on top of the job: a remade panel,
// a second delivery. It defaults to 0, and the table cannot tell a problem that
// genuinely cost nothing from one where nobody entered the cost. So the report
// never calls a $0 issue free. It is "no cost recorded", counted separately, so
// the gap is visible rather than quietly lowering the average.
//
// ── FIGURES, NOT VERDICTS ────────────────────────────────────────────────────
//
// It reports counts, dollars and days. It does not say whether that is good or
// bad: too much of the answer lives outside the database.
//
// Pure: the API route loads the rows and this shapes them.

import { issueKindLabel, ISSUE_OWNERS, ISSUE_BLOCKS } from "./pcd-order-issues";
import { roundMoney } from "./pcd-money";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The Perth calendar month an instant falls in, as "YYYY-MM". */
export function perthMonth(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  return new Date(t + PERTH_OFFSET_MS).toISOString().slice(0, 7);
}

/** "2026-09" as "Sep 2026". */
export function monthLabel(month) {
  const [y, m] = String(month || "").split("-").map(Number);
  if (!y || !m) return "Unknown";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });
}

const cost = (issue) => Math.max(0, Number(issue?.extra_cost_ex_gst) || 0);
const hasCost = (issue) => cost(issue) > 0;
const isResolved = (issue) => Boolean(issue?.resolved_at);

/** Whole days an issue was (or has been) open. */
export function daysOpen(issue, now = Date.now()) {
  const raised = Date.parse(issue?.raised_at || issue?.created_at || "");
  if (!Number.isFinite(raised)) return null;
  const end = issue?.resolved_at ? Date.parse(issue.resolved_at) : now;
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - raised) / DAY_MS));
}

function median(values) {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : Math.round((list[mid - 1] + list[mid]) / 2);
}

function emptyGroup(key, label) {
  return { key, label, issues: 0, open: 0, resolved: 0, withCost: 0, withoutCost: 0, cost: 0, openCost: 0 };
}

function addTo(group, issue) {
  group.issues += 1;
  if (isResolved(issue)) group.resolved += 1;
  else {
    group.open += 1;
    group.openCost += cost(issue);
  }
  if (hasCost(issue)) group.withCost += 1;
  else group.withoutCost += 1;
  group.cost += cost(issue);
}

function finish(groups) {
  return [...groups.values()]
    .map((g) => ({ ...g, cost: roundMoney(g.cost), openCost: roundMoney(g.openCost) }))
    .sort((a, b) => b.issues - a.issues || b.cost - a.cost || String(a.label).localeCompare(String(b.label)));
}

function groupBy(issues, keyOf, labelOf) {
  const groups = new Map();
  for (const issue of issues) {
    const key = keyOf(issue) || "";
    if (!groups.has(key)) groups.set(key, emptyGroup(key, labelOf(key, issue)));
    addTo(groups.get(key), issue);
  }
  return finish(groups);
}

/**
 * @param {Array} issues  pcd_order_issues rows
 * @param {object} ctx    { orders: Map(id -> order), kinds: list items, agents: Map(id -> name), now }
 */
export function issuesReport(issues = [], { orders = new Map(), kinds = [], agents = new Map(), now = Date.now() } = {}) {
  const list = Array.isArray(issues) ? issues : [];
  const label = (items, key, fallback) => items.find((i) => i.key === key)?.label || fallback;

  const totals = emptyGroup("all", "All issues");
  list.forEach((issue) => addTo(totals, issue));
  const resolvedDays = list.filter(isResolved).map((i) => daysOpen(i, now));
  const openDays = list.filter((i) => !isResolved(i)).map((i) => daysOpen(i, now));
  const costed = list.filter(hasCost);

  // Months in order, oldest first, with the gaps filled so a quiet month shows
  // as a zero rather than disappearing from the chart.
  const byMonthMap = new Map();
  for (const issue of list) {
    const month = perthMonth(issue.raised_at || issue.created_at);
    if (!byMonthMap.has(month)) byMonthMap.set(month, emptyGroup(month, monthLabel(month)));
    addTo(byMonthMap.get(month), issue);
  }
  const months = [...byMonthMap.keys()].filter(Boolean).sort();
  if (months.length) {
    let [y, m] = months[0].split("-").map(Number);
    const last = months[months.length - 1];
    for (;;) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!byMonthMap.has(key)) byMonthMap.set(key, emptyGroup(key, monthLabel(key)));
      if (key >= last) break;
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  }
  const byMonth = [...byMonthMap.values()]
    .map((g) => ({ ...g, cost: roundMoney(g.cost), openCost: roundMoney(g.openCost) }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));

  const orderLabel = (id) => {
    const o = orders.get(id);
    if (!o) return "Order not found";
    return [o.order_number ? `#${o.order_number}` : "", o.name || o.customer_name || ""].filter(Boolean).join(" ") || "Order";
  };

  const rows = list
    .map((issue) => {
      const order = orders.get(issue.order_id) || null;
      return {
        id: issue.id,
        order_id: issue.order_id,
        order: orderLabel(issue.order_id),
        customer: order?.customer_name || "",
        raised_at: issue.raised_at || issue.created_at || null,
        resolved_at: issue.resolved_at || null,
        kind: issue.kind,
        kindLabel: issueKindLabel(issue.kind, kinds),
        owner: issue.owner,
        ownerLabel: label(ISSUE_OWNERS, issue.owner, "Us"),
        blocksLabel: label(ISSUE_BLOCKS, issue.blocks, ""),
        panel: issue.panel_label || "",
        stage: issue.stage_at_report || "",
        detail: issue.detail || "",
        resolution: issue.resolution || "",
        raisedBy: agents.get(issue.raised_by) || "",
        cost: roundMoney(cost(issue)),
        hasCost: hasCost(issue),
        status: isResolved(issue) ? "resolved" : "open",
        days: daysOpen(issue, now),
      };
    })
    .sort((a, b) => String(b.raised_at || "").localeCompare(String(a.raised_at || "")));

  return {
    totals: {
      ...totals,
      cost: roundMoney(totals.cost),
      openCost: roundMoney(totals.openCost),
      averageCost: costed.length ? roundMoney(costed.reduce((s, i) => s + cost(i), 0) / costed.length) : 0,
      medianDaysToResolve: median(resolvedDays),
      medianDaysOpen: median(openDays),
      oldestOpenDays: openDays.length ? Math.max(...openDays.filter(Number.isFinite)) : null,
      orders: new Set(list.map((i) => i.order_id)).size,
    },
    byMonth,
    byKind: groupBy(list, (i) => i.kind, (key) => issueKindLabel(key, kinds)),
    byOwner: groupBy(list, (i) => i.owner || "us", (key) => label(ISSUE_OWNERS, key, "Us")),
    byStage: groupBy(list, (i) => i.stage_at_report || "", (key) => key || "Not recorded"),
    byBlocks: groupBy(list, (i) => i.blocks || "panel", (key) => label(ISSUE_BLOCKS, key, key)),
    byOrder: groupBy(list, (i) => i.order_id, (key) => orderLabel(key)),
    byRaisedBy: groupBy(list, (i) => i.raised_by || "", (key) => agents.get(key) || "Not recorded"),
    rows,
  };
}
