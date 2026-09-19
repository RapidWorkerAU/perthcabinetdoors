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
// Received is in our hands but not yet looked at. It is work still to do, so it
// does not count as made until somebody has checked it.
const SUPPLIER_RECEIVED = "Received";
const SUPPLIER_MADE = ["Checked", "Installed", "Complete"];
const SUPPLIER_HANDED_OVER = ["Installed", "Complete"];
const WORKSHOP_START = "Not Started";
// Board has arrived for it and nobody has cut it yet. Ready, not under way.
const WORKSHOP_MATERIALS_IN = "Materials Ready";
const WORKSHOP_MADE = ["Packed", "Ready for Install", "Complete"];
const WORKSHOP_READY_FOR_INSTALL = "Ready for Install";
const WORKSHOP_HANDED_OVER = ["Complete"];

/**
 * The panels on a line, with their own decisions.
 *
 * A line's panel_planning holds one entry per panel once anybody has planned
 * it. Until then the line itself carries the decision, and both can be blank,
 * which is the point: an unplanned panel has to read as unplanned rather than
 * falling back to a guess. See the trap note at the top of this file.
 *
 * FIELD BY FIELD, THE SAME WAY THE ORDER PAGE READS IT. A plan entry often
 * holds only the one thing somebody changed on it, a production stage say, with
 * who makes it still sitting on the line. Reading the plan alone made Simon
 * Green's twenty panels, every one of them "Made in house" on his order page,
 * report as nobody having decided who makes them. The plan wins where it has
 * an answer and the line fills in where it does not, exactly as the order page
 * shows them.
 */
export function orderPanels(line) {
  const planning = line?.panel_planning;
  const plans =
    planning && typeof planning === "object" && !Array.isArray(planning)
      ? Object.values(planning).filter((value) => Boolean(value) && typeof value === "object" && !Array.isArray(value))
      : [];
  const fromLine = {
    fulfilment_method: line?.fulfilment_method,
    status: line?.status,
    production_stage: line?.production_stage,
    board_required: Boolean(line?.board_required),
    supplier_ordered_at: line?.supplier_ordered_at,
    supplier_eta: line?.supplier_eta,
  };
  if (!plans.length) return [fromLine];
  return plans.map((plan) => ({
    ...plan,
    fulfilment_method: plan.fulfilment_method || fromLine.fulfilment_method,
    status: plan.status || fromLine.status,
    production_stage: plan.production_stage || fromLine.production_stage,
    board_required: typeof plan.board_required === "boolean" ? plan.board_required : fromLine.board_required,
    supplier_ordered_at: plan.supplier_ordered_at || fromLine.supplier_ordered_at,
    supplier_eta: plan.supplier_eta || fromLine.supplier_eta,
  }));
}

export function orderPanelsOf(lines) {
  return (lines || []).flatMap(orderPanels);
}

const isSupplierPanel = (panel) => String(panel?.fulfilment_method || "") !== "in_house";
const stageOf = (panel) => String(panel?.production_stage || "");
const statusOf = (panel) => String(panel?.status || "");

// An in-house panel we have to buy board for. Its board is a delivery in the
// same way a supplier panel is, so it can be unordered, on its way or late.
const needsBoard = (panel) => !isSupplierPanel(panel) && panel?.board_required === true;
const boardOrdered = (panel) => Boolean(panel?.supplier_ordered_at || panel?.supplier_eta);
// Nobody has touched it on the bench. A blank stage reads as Not Started on the
// order page, so it reads the same way here.
const atWorkshopStart = (panel) => !stageOf(panel) || stageOf(panel) === WORKSHOP_START;

// A SUPPLIER PANEL WITH NO STATUS COUNTS AS NOT ORDERED. Nobody has said it is
// ordered, and undecided is not the same as done. The board takes the same
// direction, and it is the safe one: the cost of asking you to check something
// already done is a moment, the cost of a job quietly never being ordered is a
// week.
function notOrderedYet(panel) {
  if (isSupplierPanel(panel)) return !statusOf(panel) || statusOf(panel) === SUPPLIER_START;
  return needsBoard(panel) && !boardOrdered(panel) && atWorkshopStart(panel);
}

/**
 * HAS THIS PANEL MOVED AT ALL?
 *
 * The start of whichever list applies to it: Not Ordered for a panel a supplier
 * makes, Not Started for one we cut. A blank counts as the start, because
 * nobody has said otherwise and undecided is not the same as done.
 *
 * ── THE FAULT THIS EXISTS TO STOP HAPPENING AGAIN ───────────────────────────
 *
 * The work board wrote its own version of this and read
 * `production_stage || status`, taking the production stage first whenever
 * there was one. Every panel carries a production stage, including the ones a
 * supplier makes, where it means nothing and sits at its default of
 * "Not Started" forever.
 *
 * So Ian Brennan's ten Polytec doors, nine marked Complete and the tenth
 * Ordered with a 23 September ETA, were read as ten panels still at Not
 * Started. The board put the job in Chase the workshop, 26 days overdue,
 * tagged "Never started", and told somebody to chase work that was finished.
 *
 * Which list applies is decided by who makes the panel, and nothing else. That
 * is the whole rule, and it lives here now rather than in two places.
 */
export function panelAtStartOfList(panel) {
  return isSupplierPanel(panel)
    ? !statusOf(panel) || statusOf(panel) === SUPPLIER_START
    : atWorkshopStart(panel);
}

/**
 * Nothing on this job has moved.
 *
 * False for a job with no panels on it, which is a different problem and worth
 * saying differently: there is nothing to make, rather than nothing done.
 */
export function nothingHasMoved(panels) {
  const rows = panels || [];
  return rows.length > 0 && rows.every(panelAtStartOfList);
}

// Ordered and not here yet.
function awaitingDelivery(panel) {
  if (isSupplierPanel(panel)) return statusOf(panel) === SUPPLIER_ON_ORDER;
  return needsBoard(panel) && boardOrdered(panel) && atWorkshopStart(panel);
}

function panelMade(panel) {
  if (isSupplierPanel(panel)) return SUPPLIER_MADE.includes(statusOf(panel));
  return WORKSHOP_MADE.includes(stageOf(panel));
}

function panelHandedOver(panel) {
  if (isSupplierPanel(panel)) return SUPPLIER_HANDED_OVER.includes(statusOf(panel));
  return WORKSHOP_HANDED_OVER.includes(stageOf(panel));
}

// Somebody is working on it right now: on the bench, or arrived and waiting to
// be checked.
function panelInProduction(panel) {
  if (isSupplierPanel(panel)) return statusOf(panel) === SUPPLIER_RECEIVED;
  const stage = stageOf(panel);
  return !atWorkshopStart(panel) && stage !== WORKSHOP_MATERIALS_IN && !WORKSHOP_MADE.includes(stage);
}

// HAS NOT ARRIVED, AND WAS DUE TO. An ETA before today on something not marked
// in. Counted whatever its status says, including Not Ordered: an ETA only
// exists because somebody placed the order, so a passed one with no arrival
// recorded is a status nobody updated or a delivery that did not come, and both
// want the same phone call.
function materialsLate(panel, today) {
  const eta = String(panel?.supplier_eta || "").slice(0, 10);
  if (!eta || eta >= today) return false;
  if (isSupplierPanel(panel)) return !statusOf(panel) || [SUPPLIER_START, SUPPLIER_ON_ORDER].includes(statusOf(panel));
  return needsBoard(panel) && atWorkshopStart(panel);
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

// Whether anything has actually happened to this job yet: a supplier panel or
// board ordered, or one of ours moved off the start of its list.
function workHasStarted(panels) {
  return (panels || []).some((panel) => {
    if (isSupplierPanel(panel)) return !notOrderedYet(panel);
    return !atWorkshopStart(panel) || (needsBoard(panel) && boardOrdered(panel));
  });
}

const DAY = 86400000;

function dateOnly(value) {
  return String(value || new Date().toISOString()).slice(0, 10);
}

function daysPast(dateValue, today) {
  if (!dateValue) return 0;
  const due = new Date(String(dateValue).slice(0, 10));
  const now = new Date(dateOnly(today));
  if (Number.isNaN(due.getTime()) || Number.isNaN(now.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - due.getTime()) / DAY));
}

function longDate(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "long" });
}

// THE STAGES, IN THE ORDER THEY ARE TESTED. First match wins, so the list reads
// top to bottom as "what is the most important true thing about this job".
//
// `tone` is what the pill looks like, and it means something:
//   stop    nobody can work on this, or it has gone wrong
//   late    something should have happened by now and has not
//   wait    correct, and waiting on somebody who is not us
//   next    our move, and nothing is happening until we make it
//   going   work is under way
//   done    made, and ready to go out
export const ORDER_STAGES = [
  { key: "cancelled", label: "Cancelled", tone: "stop" },
  { key: "archived", label: "Archived", tone: "stop" },
  { key: "on_hold", label: "On hold", tone: "stop" },
  { key: "issue", label: "Rectify issues", tone: "stop" },
  { key: "deposit", label: "Awaiting deposit", tone: "wait" },
  { key: "payment", label: "Awaiting payment", tone: "wait" },
  { key: "complete", label: "Complete", tone: "done" },
  { key: "planning", label: "Job planning", tone: "next" },
  { key: "check_materials", label: "Check materials", tone: "late" },
  { key: "materials", label: "Order materials", tone: "next" },
  { key: "materials_part", label: "Part ordered", tone: "next" },
  { key: "ready_to_close", label: "Ready to close off", tone: "next" },
  { key: "ready_to_install", label: "Ready to install", tone: "done" },
  { key: "ready_to_deliver", label: "Ready to deliver", tone: "done" },
  { key: "in_production", label: "In production", tone: "going" },
  { key: "with_supplier", label: "With supplier", tone: "wait" },
  { key: "ready_to_start", label: "Ready to start", tone: "next" },
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
 * @param context   { openIssues, payments, installBooked, today } - openIssues
 *                  is the count of unresolved pcd_order_issues rows against this
 *                  order, payments its pcd_order_payments rows, and
 *                  installBooked whether an install is on the calendar for it.
 *                  All optional: a caller that has not loaded them simply never
 *                  sees the stages that depend on them, rather than being told
 *                  something untrue.
 * @returns { key, label, tone, why, overdue, overdueDays, alongside }
 *
 * `why` is a whole sentence, because the pill is two words and the two words
 * are not enough to act on. It goes in the title attribute.
 *
 * `alongside` is only set under Rectify issues, and is where the job would be
 * up to without the issue, so a problem never hides the progress around it.
 */
export function orderStage(order, lines, context = {}) {
  const { openIssues = 0, payments = null, installBooked = false } = context;
  const today = dateOnly(context.today);
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

  const progress = progressStage(order, panels, { status, payments, installBooked, today });

  // A PROBLEM BEATS PROGRESS, BUT DOES NOT HIDE IT. An unresolved issue is the
  // thing you want to see from a list of two hundred orders, so it comes first.
  // Where the job is up to still shows beside it: Sam Persaud's twenty two
  // panels were all checked and ready to go, and a lone "Rectify issues" said
  // nothing about that.
  if (openIssues > 0) {
    return stage(
      "issue",
      `${openIssues} unresolved issue${openIssues === 1 ? "" : "s"} raised against this order.`,
      { ...overdue, alongside: { ...progress, overdue: false, overdueDays: 0 } }
    );
  }

  return { ...progress, ...overdue };
}

function progressStage(order, panels, { status, payments, installBooked, today }) {
  if (status === "pending_deposit") {
    return stage("deposit", "The deposit has not been paid, so nothing is cut.");
  }

  if (status === "complete") {
    // Only when the payments were actually loaded. Without them every finished
    // job would read as fully paid, which is the exact wrong direction to be
    // wrong in, so the sentence says only what it can prove: a caller with no
    // payments gets "Marked complete", not "paid for".
    if (!Array.isArray(payments)) return stage("complete", "Marked complete.");

    const outstanding = outstandingOnOrder(order?.total_inc_gst, payments);
    // A dollar of rounding is not a debt. Same threshold the board uses.
    if (outstanding >= 1) {
      return stage("payment", `Job finished with $${outstanding.toFixed(2)} still outstanding.`);
    }
    return stage("complete", "Finished and paid for.");
  }

  // ── active ────────────────────────────────────────────────────────────────

  // ── PLANNING STOPS BEING THE ANSWER ONCE WORK HAS STARTED ─────────────────
  //
  // A panel nobody is set to make STOPS the job. You cannot order it and you
  // cannot cut it, so this reads as planning whatever else is happening.
  //
  // Missing dates do not stop anything. They matter while the job is sitting
  // there untouched, so they read as planning only until something has
  // actually moved. After that the job is where its panels say it is, and the
  // unscheduled job is still raised by the work board's own planning column.
  if (panelsUndecided(panels)) {
    const undecided = panels.filter((panel) => !panel.fulfilment_method).length;
    return stage("planning", `${count(undecided, "panel", "panels")} with nobody set to make ${undecided === 1 ? "it" : "them"}.`);
  }

  if (!workHasStarted(panels)) {
    const missing = missingPlanning(order, panels);
    if (missing.length) {
      return stage("planning", `${missing.join(", ")} still to be decided, and nothing has started.`);
    }
  }

  const toOrder = panels.filter(notOrderedYet);
  const toOrderNote = toOrder.length ? ` ${count(toOrder.length, "panel", "panels")} still to order as well.` : "";

  // ── MATERIALS THAT SHOULD HAVE ARRIVED ────────────────────────────────────
  //
  // Above ordering, because it is the one thing on this list that was meant to
  // have happened already. Either it came and nobody marked it in, or it did
  // not come and the supplier needs a call, and the date the job was promised
  // for rests on which.
  const late = panels.filter((panel) => materialsLate(panel, today));
  if (late.length) {
    const earliest = late.map((panel) => String(panel.supplier_eta).slice(0, 10)).sort()[0];
    return stage(
      "check_materials",
      `${count(late.length, "panel was", "panels were")} due in by ${longDate(earliest)} and ${late.length === 1 ? "is" : "are"} not marked as arrived.${toOrderNote}`
    );
  }

  // ── ORDERING ──────────────────────────────────────────────────────────────
  //
  // Supplier panels not ordered, and in-house panels whose board has not been
  // ordered. "N to order" when nothing is ordered, "N still to order" once some
  // are, so a job nobody has started on reads differently from one nearly done.
  if (toOrder.length) {
    const needing = panels.filter((panel) => isSupplierPanel(panel) || needsBoard(panel)).length;
    const ordered = needing - toOrder.length;
    if (!ordered) {
      return stage("materials", `Nothing has been ordered for the ${count(needing, "panel that needs", "panels that need")} it.`, {
        label: `${count(toOrder.length, "panel", "panels")} to order`,
      });
    }
    return stage("materials_part", `${ordered} of ${needing} panels ordered.`, {
      label: `${count(toOrder.length, "panel", "panels")} still to order`,
    });
  }

  // ── MADE ──────────────────────────────────────────────────────────────────
  if (panels.length && panels.every(panelHandedOver)) {
    return stage("ready_to_close", "Every panel is installed or complete. The order itself is still open.");
  }

  // Nothing on an order records delivery or install. A panel at Ready for
  // Install says so, and so does an install on the calendar; without either it
  // reads as going out on a truck.
  if (panels.length && panels.every((panel) => panelMade(panel) || panelHandedOver(panel))) {
    const forInstall = installBooked || panels.some((panel) => !isSupplierPanel(panel) && stageOf(panel) === WORKSHOP_READY_FOR_INSTALL);
    return forInstall
      ? stage("ready_to_install", installBooked ? "Every panel is made and an install is booked." : "Every panel is made and ready for install.")
      : stage("ready_to_deliver", "Every panel is made and ready to go out.");
  }

  // ── UNDER WAY ─────────────────────────────────────────────────────────────
  //
  // WORKING BEATS WAITING. This used to put waiting first, so a late delivery
  // could not hide behind bench work. Check materials above now catches the
  // late ones by date, so a job with our people on it says so, and "With
  // supplier" means genuinely nothing of ours to do until it lands.
  const busy = panels.filter(panelInProduction).length;
  if (busy) {
    return stage("in_production", `${count(busy, "panel", "panels")} being made or checked.`);
  }

  const awaiting = panels.filter(awaitingDelivery).length;
  if (awaiting) {
    return stage("with_supplier", `${count(awaiting, "panel", "panels")} ordered and not arrived yet.`);
  }

  const made = panels.filter((panel) => panelMade(panel) || panelHandedOver(panel)).length;
  if (made) {
    return stage("in_production", `${made} of ${panels.length} panels made, the rest not started.`);
  }

  // Planned, nothing to order, nothing started. An order with no panels on it
  // at all lands here too, which is honest: there is nothing to report on.
  return stage(
    "ready_to_start",
    panels.length ? "Planned, materials in, and ready for the bench." : "Planned, with nothing on the order to make."
  );
}
