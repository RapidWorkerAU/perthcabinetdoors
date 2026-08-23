// Is this job actually planned?
//
// WHY THIS EXISTS. Nothing could answer that question, because every panel
// silently defaulted to "Made in house". An order nobody had looked at was
// indistinguishable from one somebody had thought about, so "orders missing
// their planning detail" could not be counted.
//
// Two things now have to be decided before a job counts as planned:
//
//   the schedule   when it starts, and how long it takes
//   the panels     who makes each one, us or a supplier
//
// Thermolaminate is the exception on both counts. It can only ever be supplier
// ready made, so it is decided the moment the order is raised and is never
// counted as an outstanding decision.

export const UNSET = "";
export const IN_HOUSE = "in_house";
export const SUPPLIER = "supplier_ready_made";

// A fulfilment method that somebody actually chose. An empty one is a question
// nobody has answered, which is the whole point of this module.
export function isDecided(method) {
  return method === IN_HOUSE || method === SUPPLIER;
}

export function isMadeHere(method) {
  return method === IN_HOUSE;
}

// Deliberately NOT "anything that is not in_house". An undecided panel is not a
// supplier panel, and lumping the two together is how an unanswered question
// ends up on a supplier order.
export function isSupplierMade(method) {
  return method === SUPPLIER;
}

// Every panel on the order that still has no decision against it.
//
// `rows` are the planning rows the order page already builds: each carries the
// panel's plan and enough to name it. Thermolaminate rows are skipped, because
// there is no choice to make.
export function undecidedPanels(rows) {
  return (rows || []).filter((row) => !row?.thermolaminated && !isDecided(row?.plan?.fulfilment_method));
}

// What is stopping this order counting as planned. Returns a list rather than a
// boolean, so the page can say WHICH part is missing instead of just refusing
// to go green.
export function planningGaps(order, rows) {
  const gaps = [];

  if (!order?.scheduled_start_date) {
    gaps.push({ key: "scheduled_start", label: "Scheduled start", detail: "No start date, so it cannot be booked onto the bench." });
  }
  if (!order?.production_lead_days) {
    gaps.push({ key: "timeframe", label: "How long it takes", detail: "No timeframe, so the job has no due date." });
  }

  const undecided = undecidedPanels(rows);
  if (undecided.length) {
    gaps.push({
      key: "panels",
      label: "Item planning",
      detail: `${undecided.length} panel${undecided.length === 1 ? "" : "s"} with nobody set to make ${undecided.length === 1 ? "it" : "them"}.`,
      count: undecided.length,
    });
  }

  return gaps;
}

export function isPlanned(order, rows) {
  return planningGaps(order, rows).length === 0;
}

// One line for a board card or a list row.
export function planningSummary(order, rows) {
  const gaps = planningGaps(order, rows);
  if (!gaps.length) return "Planned";
  return gaps.map((gap) => gap.label).join(", ") + " outstanding";
}
