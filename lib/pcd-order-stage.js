// WHERE AN ORDER IS UP TO, IN ONE WORD.
//
// The order's `status` column says what kind of record it is: pending deposit,
// active, complete, on hold, cancelled. That is five answers, and four of them
// are rare, so in practice a list of orders is a column of identical "Active"
// pills telling you nothing. This works out the rest of the answer from what is
// already on the order and its lines.
//
// NOTHING HERE IS STORED. Every stage is derived from fields that already
// exist, so nobody has to remember to move an order along and no stage can go
// stale. Book a start date and the job leaves planning by itself; mark the last
// panel packed and it becomes ready to deliver.
//
// ── ONE DEFINITION, SHARED WITH THE BOARD ────────────────────────────────────
//
// The work board already decides whether a job needs planning, needs materials
// ordered or is late, in lib/pcd-board-load.ts. These rules are written to
// agree with it, and orderPanels below is the same reader the board uses, so
// the one rule that has already caused a wrong answer in production lives in a
// single place. Change a rule here and read that file before you do.
//
// ── THE TRAP ─────────────────────────────────────────────────────────────────
//
// A panel's real status is in the line's `panel_planning`, NOT in the line's
// own `status` column. The order page writes the ordered date, the ETA and the
// status into panel_planning, so a line's status column can say "Not Ordered"
// for weeks after the panels on it were ordered. The board learnt this the hard
// way: ten doors ordered on 24 August with a 9 September ETA were still being
// reported as "10 panels still Not Ordered". Read panels through orderPanels or
// this whole file lies.

import { outstandingOnOrder } from "./pcd-board-money";

// A panel a supplier makes carries an order status. One we cut carries a
// production stage. Anything asking "has this moved" has to look at the right
// list for the right panel, or a job that is part supplier made can never be
// judged.
const SUPPLIER_START = "Not Ordered";
const SUPPLIER_ON_ORDER = "Ordered";
const SUPPLIER_ARRIVED = ["Received", "Checked", "Installed", "Complete"];
const WORKSHOP_START = "Not Started";
const WORKSHOP_FINISHED = ["Packed", "Ready for Install", "Complete"];

/**
 * The panels on a line, with their own decisions.
 *
 * A line's panel_planning holds one entry per panel once anybody has planned
 * it. Until then the line itself carries the decision, and both can be blank,
 * which is the point: an unplanned panel has to read as unplanned rather than
 * falling back to a guess. See the trap note at the top of this file.
 */
export function orderPanels(line) {
  const planning = line?.panel_planning;
  const plans =
    planning && typeof planning === "object" && !Array.isArray(planning)
      ? Object.values(planning).filter((value) => Boolean(value) && typeof value === "object" && !Array.isArray(value))
      : [];
  if (plans.length) return plans;
  return [
    {
      fulfilment_method: line?.fulfilment_method,
      status: line?.status,
      production_stage: line?.production_stage,
    },
  ];
}

export function orderPanelsOf(lines) {
  return (lines || []).flatMap(orderPanels);
}

const isSupplierPanel = (panel) => String(panel?.fulfilment_method || "") !== "in_house";

// A SUPPLIER PANEL WITH NO STATUS COUNTS AS NOT ORDERED. Nobody has said it is
// ordered, and undecided is not the same as done. The board takes the same
// direction, and it is the safe one: the cost of asking you to check something
// already done is a moment, the cost of a job quietly never being ordered is a
// week.
const notOrderedYet = (panel) => isSupplierPanel(panel) && (!panel.status || panel.status === SUPPLIER_START);
const onOrder = (panel) => isSupplierPanel(panel) && panel.status === SUPPLIER_ON_ORDER;

function panelFinished(panel) {
  if (isSupplierPanel(panel)) return SUPPLIER_ARRIVED.includes(String(panel.status || ""));
  return WORKSHOP_FINISHED.includes(String(panel.production_stage || ""));
}

function panelInWorkshop(panel) {
  if (isSupplierPanel(panel)) return false;
  const stage = String(panel.production_stage || "");
  return Boolean(stage) && stage !== WORKSHOP_START && !WORKSHOP_FINISHED.includes(stage);
}

/**
 * What the job is still missing before it can be scheduled onto the bench.
 *
 * The same three things the board's planning column looks for, in the same
 * order, so the board and the orders list cannot disagree about whether a job
 * has been planned.
 */
export function missingPlanning(order, panels) {
  const missing = [];
  if (!order?.scheduled_start_date) missing.push("Scheduled start");
  if (!order?.target_completion_date) missing.push("Estimated completion");
  if (panelsUndecided(panels)) missing.push("Item planning");
  return missing;
}

// A panel nobody is set to make. This is the only part of planning that
// genuinely stops the job: you cannot order a panel or cut it until somebody
// has said which of those it is. Missing dates are an admin gap, and they are
// treated differently below.
export function panelsUndecided(panels) {
  return (panels || []).some((panel) => !panel.fulfilment_method);
}

// Whether anything has actually happened to this job yet: a supplier panel
// ordered, or one of ours moved off the start of its list.
function workHasStarted(panels) {
  return (panels || []).some((panel) => {
    if (isSupplierPanel(panel)) return !notOrderedYet(panel);
    return panelInWorkshop(panel) || panelFinished(panel);
  });
}

const DAY = 86400000;

function daysPast(dateValue, today) {
  if (!dateValue) return 0;
  const due = new Date(String(dateValue).slice(0, 10));
  const now = new Date(String(today || new Date().toISOString()).slice(0, 10));
  if (Number.isNaN(due.getTime()) || Number.isNaN(now.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - due.getTime()) / DAY));
}

// THE STAGES, IN THE ORDER THEY ARE TESTED. First match wins, so the list reads
// top to bottom as "what is the most important true thing about this job".
//
// `tone` is what the pill looks like, and it means something:
//   stop    nobody can work on this, or it has gone wrong
//   wait    correct, and waiting on somebody who is not us
//   next    our move, and nothing is happening until we make it
//   going   work is under way
//   done    finished as far as this job is concerned
export const ORDER_STAGES = [
  { key: "cancelled", label: "Cancelled", tone: "stop" },
  { key: "archived", label: "Archived", tone: "stop" },
  { key: "on_hold", label: "On hold", tone: "stop" },
  { key: "issue", label: "Rectify issues", tone: "stop" },
  { key: "deposit", label: "Awaiting deposit", tone: "wait" },
  { key: "payment", label: "Awaiting payment", tone: "wait" },
  { key: "complete", label: "Complete", tone: "done" },
  { key: "planning", label: "Job planning", tone: "next" },
  { key: "materials", label: "Order materials", tone: "next" },
  { key: "materials_part", label: "Part ordered", tone: "next" },
  { key: "ready_to_deliver", label: "Ready to deliver", tone: "done" },
  { key: "waiting_materials", label: "Waiting on materials", tone: "wait" },
  { key: "workshop", label: "In the workshop", tone: "going" },
  { key: "ready_to_start", label: "Ready to start", tone: "going" },
];

const stageByKey = new Map(ORDER_STAGES.map((stage) => [stage.key, stage]));

// `label` overrides the one in the list above, for the stages that count
// something. "16 panels to order" and "1 panel to order" are different amounts
// of work and the pill is the only place that can say so, now that nothing but
// pills is allowed in the column.
function stage(key, why, extra = {}) {
  const found = stageByKey.get(key);
  const { label, ...rest } = extra;
  return { key, label: label || found?.label || key, tone: found?.tone || "going", why, ...rest };
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Where one order is up to.
 *
 * @param order     a pcd_orders row
 * @param lines     its pcd_order_line_items rows
 * @param context   { openIssues, payments, today } - openIssues is the count of
 *                  unresolved pcd_order_issues rows against this order, and
 *                  payments its pcd_order_payments rows. Both are optional: a
 *                  caller that has not loaded them simply never sees the two
 *                  stages that depend on them, rather than being told something
 *                  untrue.
 * @returns { key, label, tone, why, overdue, overdueDays }
 *
 * `why` is a whole sentence, because the pill is two words and the two words
 * are not enough to act on. It goes in the title attribute.
 */
export function orderStage(order, lines, context = {}) {
  const { openIssues = 0, payments = null, today = null } = context;
  const status = String(order?.status || "active");
  const panels = orderPanelsOf(lines);

  // Overdue rides along with whatever stage is showing rather than replacing
  // it. "Overdue" on its own does not tell you what to do about it, and the
  // two facts are both true at once.
  const overdueDays = status === "active" ? daysPast(order?.target_completion_date, today) : 0;
  const overdue = { overdue: overdueDays > 0, overdueDays };

  if (status === "cancelled") return stage("cancelled", "This order was cancelled.", overdue);
  if (status === "archived") return stage("archived", "This order is archived.", overdue);
  if (status === "on_hold") return stage("on_hold", "This job is paused. Nothing is moving on it.", overdue);

  // A PROBLEM BEATS PROGRESS. An unresolved issue is the thing you want to see
  // from a list of two hundred orders, whether the job is half cut or finished
  // and paid for. It sits below cancelled and on hold only because those say
  // the job is not running at all.
  if (openIssues > 0) {
    return stage(
      "issue",
      `${openIssues} unresolved issue${openIssues === 1 ? "" : "s"} raised against this order.`,
      overdue
    );
  }

  if (status === "pending_deposit") {
    return stage("deposit", "The deposit has not been paid, so nothing is cut.", overdue);
  }

  if (status === "complete") {
    // Only when the payments were actually loaded. Without them every finished
    // job would read as fully paid, which is the exact wrong direction to be
    // wrong in, so the sentence says only what it can prove: a caller with no
    // payments gets "Marked complete", not "paid for".
    if (!Array.isArray(payments)) return stage("complete", "Marked complete.", overdue);

    const outstanding = outstandingOnOrder(order?.total_inc_gst, payments);
    // A dollar of rounding is not a debt. Same threshold the board uses.
    if (outstanding >= 1) {
      return stage("payment", `Job finished with $${outstanding.toFixed(2)} still outstanding.`, overdue);
    }
    return stage("complete", "Finished and paid for.", overdue);
  }

  // ── active ────────────────────────────────────────────────────────────────

  // ── PLANNING STOPS BEING THE ANSWER ONCE WORK HAS STARTED ─────────────────
  //
  // This used to report "Job planning" for any active order missing a start
  // date or a completion date, whatever else had happened to it. So a job with
  // every panel ordered and an ETA recorded against each one still read as
  // being planned, because two date fields on the order itself were blank. That
  // is the opposite of what this column is for: it hid real progress behind an
  // admin gap.
  //
  // The two halves of planning are not the same kind of thing, so they are no
  // longer treated as one:
  //
  //   A panel nobody is set to make STOPS the job. You cannot order it and you
  //   cannot cut it, so this reads as planning whatever else is happening.
  //
  //   Missing dates do not stop anything. They matter while the job is sitting
  //   there untouched, so they read as planning only until something has
  //   actually moved. After that the job is where its panels say it is, and the
  //   unscheduled job is still raised by the work board's own planning column,
  //   which is the screen for chasing exactly that.
  if (panelsUndecided(panels)) {
    const undecided = panels.filter((panel) => !panel.fulfilment_method).length;
    return stage("planning", `${count(undecided, "panel", "panels")} with nobody set to make ${undecided === 1 ? "it" : "them"}.`, overdue);
  }

  if (!workHasStarted(panels)) {
    const missing = missingPlanning(order, panels);
    if (missing.length) {
      return stage("planning", `${missing.join(", ")} still to be decided, and nothing has started.`, overdue);
    }
  }

  // ── MATERIALS, IN THREE STATES RATHER THAN ONE ────────────────────────────
  //
  // "Order materials" on its own could not tell a job where nothing has been
  // ordered from one where nine panels out of ten are on their way, so a screen
  // full of them said nothing about whether the week was under control. The
  // three states answer a different question each:
  //
  //   Order materials       nobody has ordered anything. Entirely our move.
  //   Part ordered          started, not finished. Still our move.
  //   Waiting on materials  all with the supplier. Not our move any more.
  //
  // The blue ones are ours to act on, the amber one is not, which is the whole
  // distinction at a glance.
  //
  // THE COUNT IS IN THE SENTENCE, NOT IN THE PILL. It was briefly rendered as
  // grey text beside the pill and that made the column read as two kinds of
  // thing in one strip. The stage is what you scan for; the number is what you
  // look up on the one row you stopped at, so it lives in `why` and reaches the
  // screen as a tooltip.
  const supplier = panels.filter(isSupplierPanel);
  const toOrder = supplier.filter(notOrderedYet).length;

  if (toOrder) {
    const ordered = supplier.length - toOrder;
    if (!ordered) {
      const none =
        supplier.length === 1
          ? "The one supplier panel on this job has not been ordered."
          : `None of the ${supplier.length} supplier panels have been ordered.`;
      return stage("materials", none, {
        ...overdue,
        label: `${count(toOrder, "panel", "panels")} to order`,
      });
    }
    return stage("materials_part", `${ordered} of ${supplier.length} supplier panels ordered.`, {
      ...overdue,
      label: `${count(toOrder, "panel", "panels")} still to order`,
    });
  }

  if (panels.length && panels.every(panelFinished)) {
    return stage("ready_to_deliver", "Every panel is made. Ready to deliver or install.", overdue);
  }

  // WAITING BEATS WORKING. A job with panels on the bench AND panels still at
  // the supplier is reported as waiting, because the supplier is the part you
  // do not control and the part that decides whether the date holds. Reading it
  // the other way round hid every late delivery behind the work going on around
  // it.
  const awaiting = supplier.filter(onOrder).length;
  if (awaiting) {
    // Not counted in the label. "Waiting on materials" is the whole answer
    // here: whether it is one panel or ten, there is nothing to do but wait,
    // and a number would imply an amount of work that does not exist. The two
    // ordering pills count because the number there IS the work left.
    return stage(
      "waiting_materials",
      `${count(awaiting, "panel", "panels")} ordered and not arrived yet.`,
      overdue
    );
  }

  const inWorkshop = panels.filter(panelInWorkshop).length;
  if (inWorkshop) {
    return stage(
      "workshop",
      `${count(inWorkshop, "panel", "panels")} being made in the workshop.`,
      overdue
    );
  }

  // Planned, nothing to order, nothing started. An order with no panels on it
  // at all lands here too, which is honest: there is nothing to report on.
  return stage(
    "ready_to_start",
    panels.length ? "Planned and ready for the bench." : "Planned, with nothing on the order to make.",
    overdue
  );
}
