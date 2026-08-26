// Pushing a customer's details onto their quotes and orders.
//
// ── THE RULE THIS EXISTS TO PROTECT ──────────────────────────────────────────
//
// The CUSTOMER RECORD is who somebody is: the details we keep current, and what
// prefills every new quote. The QUOTE and the ORDER each carry their own COPY,
// taken when they were raised, and that copy is allowed to differ. A second
// kitchen at an investment property is a real job at a real address that is not
// where the customer lives, and correcting their home address must not quietly
// redirect a delivery.
//
// So the two never sync on their own, in either direction:
//
//   Editing a quote or an order changes THAT JOB and nothing else.
//   Editing the customer changes the record, and then ASKS about the jobs.
//
// This file is the asking. It works out what could be pushed and what would
// actually change, so the screen can show a person exactly what they are about
// to do before they do it.
//
// Pure and framework free: the same answers on the screen and in the route, so
// a job the screen offered can never be one the route refuses.

import { formatSiteAddress } from "./pcd-contact-details";

const clean = (value) => String(value ?? "").trim();

// EVERYTHING EXCEPT THE EMAIL. Every message and every form match is filed
// against the email, so changing it on a quote would orphan that history. It is
// the anchor, not a detail, and the customer page will not let it be edited
// either.
export const PUSHABLE_FIELDS = [
  { key: "customer_name", from: "name", label: "Name" },
  { key: "customer_phone", from: "phone", label: "Phone" },
  { key: "site_street", from: "site_street", label: "Street" },
  { key: "site_suburb", from: "site_suburb", label: "Suburb" },
  { key: "site_postcode", from: "site_postcode", label: "Postcode" },
];

// A quote that has been accepted is now an order, and a rejected one is over.
// An order that is finished or cancelled is history. None of them are still in
// play, so none are pre-ticked: changing where a delivered job went is not a
// correction, it is a rewrite.
// awaiting_deposit is still in play: they have said yes and are part way through
// paying, so a corrected phone number or address should still reach it.
const LIVE_QUOTE_STATUSES = new Set(["draft", "sent", "viewed", "awaiting_deposit"]);
const LIVE_ORDER_STATUSES = new Set(["pending_deposit", "active", "on_hold"]);

/**
 * The customer's details in the shape a quote or an order stores them.
 *
 * site_address is rebuilt from the parts rather than copied, for the same
 * reason it is in normalizeCustomerPayload: the one liner is what every list
 * and label reads, and a stale one is how a van goes to the wrong house.
 */
export function detailsFromCustomer(customer = {}) {
  const details = {};
  for (const field of PUSHABLE_FIELDS) {
    details[field.key] = clean(customer[field.from]) || null;
  }
  details.site_address =
    clean(
      formatSiteAddress({
        street: customer.site_street,
        suburb: customer.site_suburb,
        postcode: customer.site_postcode,
      })
    ) || null;
  return details;
}

/** Which of the pushable fields this job would actually have changed. */
export function changedFields(job = {}, details = {}) {
  return PUSHABLE_FIELDS.filter((field) => (clean(job[field.key]) || null) !== details[field.key]).map(
    (field) => field.label
  );
}

function jobRow({ job, type, ref, name, live }) {
  return {
    type,
    id: job.id,
    ref: clean(ref) || "(no number)",
    name: clean(name),
    status: clean(job.status) || "",
    // What it says today, so a person can see what they are replacing rather
    // than only what they are replacing it with.
    currentAddress: clean(job.site_address) || "Not recorded",
    live,
  };
}

/**
 * Every quote and order this customer has, and what pushing would do to each.
 *
 * ONLY WHAT WOULD ACTUALLY CHANGE IS OFFERED. A job that already matches is
 * left out entirely: a list of twelve jobs where eleven are already right makes
 * a person hunt for the one that is not, and ticking it changes nothing anyway.
 *
 * Pre-ticked when the job is still in play AND differs. Everything else is
 * shown unticked with its status, so finishing work is visible and deliberate
 * rather than hidden.
 */
export function pushTargets({ quotes = [], orders = [], details = {} } = {}) {
  const rows = [];

  for (const quote of quotes) {
    const changed = changedFields(quote, details);
    if (!changed.length) continue;
    rows.push({
      ...jobRow({
        job: quote,
        type: "quote",
        ref: quote.quote_number,
        name: quote.project_name || quote.title,
        live: LIVE_QUOTE_STATUSES.has(clean(quote.status)),
      }),
      changed,
    });
  }

  for (const order of orders) {
    const changed = changedFields(order, details);
    if (!changed.length) continue;
    rows.push({
      ...jobRow({
        job: order,
        type: "order",
        ref: order.order_number,
        name: order.name,
        live: LIVE_ORDER_STATUSES.has(clean(order.status)),
      }),
      changed,
    });
  }

  // Live first, because those are the ones somebody is deciding about, then
  // newest of the rest.
  return rows.sort((a, b) => Number(b.live) - Number(a.live) || a.ref.localeCompare(b.ref));
}

/** The ids a screen should arrive with already ticked. */
export function defaultSelection(targets = []) {
  return targets.filter((target) => target.live).map((target) => `${target.type}:${target.id}`);
}

export function targetKey(target) {
  return `${target.type}:${target.id}`;
}

/**
 * What one push is about to do, in a sentence.
 *
 * Written here so the button and the confirmation cannot describe it
 * differently from each other.
 */
export function pushSummary(selectedCount, targets = []) {
  if (!targets.length) return "Every quote and order already matches these details.";
  if (!selectedCount) return "Nothing selected. The customer record is saved either way.";
  const notLive = targets.filter((target) => !target.live).length;
  const jobs = `${selectedCount} ${selectedCount === 1 ? "job" : "jobs"}`;
  return notLive
    ? `${jobs} will be updated. Anything finished or cancelled is unticked unless you say otherwise.`
    : `${jobs} will be updated.`;
}
