// A kind added in Settings, Lists is read back as words wherever the list
// itself is out of reach, such as a PDF. See lib/pcd-list-keys.js.
import { keyAsWords } from "./pcd-list-keys";

// Panel issues: a problem with one panel on an order.
//
// WHY THIS EXISTS. "Issue Follow-Up" used to be an option in the panel's own
// status dropdowns, so recording a problem OVERWROTE how far the panel had got.
// The first question anybody asks about a problem is "where was it up to", and
// the act of reporting it destroyed the answer.
//
// An issue is now its own record. The panel keeps its stage, and the stage it
// was at is COPIED onto the issue as a historical fact.
//
// Framework-free and pure, so the rules can be checked without a database.

export const ISSUE_KINDS = [
  { key: "damaged_in_production", label: "Damaged in production" },
  { key: "wrong_size", label: "Wrong size" },
  { key: "wrong_colour", label: "Wrong colour or finish" },
  { key: "supplier_damage", label: "Damaged from supplier" },
  { key: "unavailable", label: "Material unavailable" },
  { key: "customer_change", label: "Customer change" },
  { key: "other", label: "Something else" },
];

export const ISSUE_KIND_KEYS = ISSUE_KINDS.map((k) => k.key);

// Who has to move next. This decides which side of the board the card lands on:
// ours is work to do, the other two are people to chase.
export const ISSUE_OWNERS = [
  { key: "us", label: "Us" },
  { key: "customer", label: "The customer" },
  { key: "supplier", label: "The supplier" },
];

export const ISSUE_OWNER_KEYS = ISSUE_OWNERS.map((o) => o.key);

export const ISSUE_BLOCKS = [
  { key: "panel", label: "This panel only" },
  { key: "order", label: "The whole order" },
  { key: "nothing", label: "Nothing, note it only" },
];

export const ISSUE_BLOCK_KEYS = ISSUE_BLOCKS.map((b) => b.key);

const labelFrom = (list, key, fallback = "") => {
  const found = list.filter((item) => item.key === key)[0];
  return found ? found.label : fallback;
};

// `kinds` is the live list where the caller has it. Falling back to "Something
// else" for a kind it simply has not been given would put the wrong words on a
// PDF, so an unknown key is read as words instead.
export function issueKindLabel(key, kinds = []) {
  const custom = (kinds || []).filter((k) => k?.key === key)[0];
  if (custom) return custom.label;
  const builtin = ISSUE_KINDS.filter((k) => k.key === key)[0];
  if (builtin) return builtin.label;
  return keyAsWords(key) || "Something else";
}
export function issueOwnerLabel(key) { return labelFrom(ISSUE_OWNERS, key, "Us"); }
export function issueBlocksLabel(key) { return labelFrom(ISSUE_BLOCKS, key, "This panel only"); }

// Where a panel's progress lives depends on who makes it: a production stage
// for the ones we cut, an order status for the ones a supplier makes. An issue
// stores BOTH the value and which of the two it was, because a panel can be
// swapped between the two afterwards and the record has to stay true.
export function progressKindFor(fulfilmentMethod) {
  return fulfilmentMethod === "in_house" ? "Stage" : "Status";
}

export function progressValueFor(plan, fulfilmentMethod) {
  if (!plan) return "";
  return fulfilmentMethod === "in_house" ? plan.production_stage || "" : plan.status || "";
}

// How the recorded progress reads on screen. Labelled, so a value is never
// ambiguous about which list it came from.
export function progressReads(issue) {
  if (!issue || !issue.stage_at_report) return "";
  return `${issue.progress_kind || "Stage"}: ${issue.stage_at_report}`;
}

export function isOpen(issue) {
  return Boolean(issue) && !issue.resolved_at;
}

export function openIssues(issues) {
  return (issues || []).filter(isOpen);
}

export function issuesForPanel(issues, lineItemId, panelKey) {
  return openIssues(issues).filter(
    (issue) => issue.line_item_id === lineItemId && (issue.panel_key || null) === (panelKey || null)
  );
}

// What a new issue must have before it can be saved. Returned as a map of
// field to message, so the form can say which box is wrong rather than
// refusing as a whole.
export function validateIssue(payload, kinds = []) {
  const errors = {};
  const kind = payload?.kind;
  const detail = String(payload?.detail || "").trim();

  // KINDS CAN BE ADDED IN SETTINGS, LISTS, so the check has to read the live
  // list as well as the built-ins. Without this a kind somebody set up
  // themselves is offered in the dropdown and then refused on save, and the
  // button appears to do nothing. Owner and blocks below are deliberately NOT
  // extendable: both decide which side of the board a card lands on.
  const known = kind && (ISSUE_KIND_KEYS.includes(kind)
    || (kinds || []).some((k) => k?.key === kind && k?.is_active !== false));
  if (!known) errors.kind = "Choose what is wrong.";
  if (detail.length < 4) errors.detail = "Say what happened, in a few words at least.";
  if (payload?.owner && !ISSUE_OWNER_KEYS.includes(payload.owner)) errors.owner = "Choose who has to fix it.";
  if (payload?.blocks && !ISSUE_BLOCK_KEYS.includes(payload.blocks)) errors.blocks = "Choose whether it stops the job.";

  const cost = Number(payload?.extra_cost_ex_gst);
  if (payload?.extra_cost_ex_gst !== undefined && payload?.extra_cost_ex_gst !== null
    && payload?.extra_cost_ex_gst !== "" && (!Number.isFinite(cost) || cost < 0)) {
    errors.extra_cost_ex_gst = "A cost cannot be negative.";
  }

  return errors;
}

// Resolving demands a sentence saying what was done. That is the difference
// between a problem that was fixed and one somebody got tired of looking at.
export function validateResolution(resolution) {
  const text = String(resolution || "").trim();
  return text.length < 4 ? { resolution: "Say what was done about it." } : {};
}

// Newest chase first, but anything blocking the whole order comes above
// everything, because nothing on that job can move until it is dealt with.
export function sortIssues(issues, today) {
  return (issues || []).slice().sort((a, b) => {
    const blocking = (b.blocks === "order" ? 1 : 0) - (a.blocks === "order" ? 1 : 0);
    if (blocking) return blocking;
    return daysSince(b.raised_at, today) - daysSince(a.raised_at, today);
  });
}

export function daysSince(value, today) {
  if (!value) return 0;
  const then = new Date(String(value).slice(0, 10));
  const now = today ? new Date(String(today).slice(0, 10)) : new Date();
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86400000));
}

// The rework an order has cost so far. Open issues only: a resolved one has
// already been paid for and counting it again would double the figure.
export function openReworkCost(issues) {
  return openIssues(issues).reduce((total, issue) => total + (Number(issue.extra_cost_ex_gst) || 0), 0);
}

// One line for a panel row's tooltip.
export function panelIssueSummary(issues, today) {
  const open = openIssues(issues);
  if (!open.length) return "";
  if (open.length === 1) {
    return `${issueKindLabel(open[0].kind)}, raised ${daysSince(open[0].raised_at, today)} days ago`;
  }
  return `${open.length} open issues`;
}

export function blocksWholeOrder(issues) {
  return openIssues(issues).some((issue) => issue.blocks === "order");
}
