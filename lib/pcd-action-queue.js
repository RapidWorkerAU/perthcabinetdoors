// WHAT TO DO NEXT, IN ONE LIST.
//
// ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
//
// Four coloured boxes headed "Needs attention", each counting a different kind
// of thing. Between them, the stat tiles above and the summary beside them, the
// same six figures appeared three times on one screen, and none of the three
// said which of them to touch. On the morning this was written the largest
// thing in the business was a $7,854 quote expiring the next day, and it was
// not on that panel at all: it was not new, not a request, and not overdue for
// payment, so it belonged to none of the four boxes.
//
// ── THE RULE, AND WHY IT IS PRINTED ON THE PANEL ─────────────────────────────
//
//   score = tier x 10000  +  days waiting x 10  +  value / 40
//
// Tier is deadline pressure and moves in steps far larger than the other two,
// so nothing can climb past something that is actually running out. Within a
// tier, age and value both count, and neither can outvote the tier.
//
// A list that sorts itself without saying how is a list people stop trusting
// the first time it puts something odd at the top, so the rule is written on
// the panel in one sentence rather than living only here.
//
// ── AN ITEM WITH NO VALUE SCORES NO VALUE POINTS ─────────────────────────────
//
// An enquiry and a quote request have not been priced. They get null, the row
// says "not priced yet", and they score zero for value rather than being given
// an invented average that would quietly rank them against real money.
//
// ── EVERY ROW GOES SOMEWHERE USEFUL ──────────────────────────────────────────
//
// The old panel sent all four boxes to a list page, so finding the row you had
// just read meant scrolling for it. Every item here carries an href to the
// place the work is actually done: the quote, the order, or the customer's
// desk. Enquiries and quote requests have no detail page of their own, so they
// link to their list with ?focus=<id>, which opens that row.

import { toNumber } from "./pcd-quote-utils";
import { daysUntilExpiry, expiresAt, FALLBACK_VALID_DAYS, UNANSWERED_STATUSES } from "./pcd-quote-clock";
import { ARCHIVED_EXPIRED } from "./pcd-archive";

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

/** Deadline pressure. The steps are large so age and value cannot jump one. */
export const TIER = { critical: 3, soon: 2, normal: 1, background: 0 };

/** How many rows the panel shows before "and N more". */
export const QUEUE_LIMIT = 8;

/**
 * A lapsed quote stops being a task eventually.
 *
 * Re-sending one the week it ran out is a real save. Re-sending one from June
 * unprompted is not, and letting them accumulate would fill the queue with dead
 * quotes and push the live work off the bottom, which is exactly the failure
 * the old panel had.
 */
export const LAPSED_STAYS_FOR_DAYS = 14;

const daysBetween = (from, now) =>
  !from ? null : Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / DAY_MS));

const hoursBetween = (from, now) =>
  !from ? null : Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / HOUR_MS));

/** "2 days", "1 day", "6 hours". Plain, and never a bare number. */
export function waitedLabel(from, now) {
  const hours = hoursBetween(from, now);
  if (hours === null) return "";
  if (hours < 1) return "just now";
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** "today", "tomorrow", "in 6 days". Used wherever a deadline is named. */
export function dueLabel(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return "";
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

/** "yesterday", "3 days ago". For something that has already passed. */
export function agoLabel(days) {
  if (days === null || days === undefined) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * The one place an item's position is decided.
 *
 * Age is capped at 60 days and value at $20,000 so a single very old or very
 * large item cannot sit permanently at the top of a tier and hide everything
 * beneath it.
 */
export function scoreOf({ tier = TIER.normal, daysWaiting = 0, value = null }) {
  const age = Math.min(Math.max(Number(daysWaiting) || 0, 0), 60) * 10;
  const worth = Math.min(Math.max(toNumber(value), 0), 20000) / 40;
  return tier * 10000 + age + worth;
}

function item(fields) {
  return { ...fields, score: scoreOf(fields) };
}

const nameOf = (row, fallback = "this customer") =>
  String(row?.customer_name || row?.name || "").trim() || fallback;

// ── the sources, one function each ───────────────────────────────────────────
//
// Each returns the rows it is responsible for and nothing else, so a source
// that goes wrong is one obviously wrong block of rows rather than a queue
// nobody can reason about.

/** Quotes inside their last seven days. The most recoverable money there is. */
function expiringQuotes(quotes, { now, validDays }) {
  return quotes
    .filter((quote) => UNANSWERED_STATUSES.includes(String(quote.status)) && quote.sent_at && !quote.order_id)
    .map((quote) => ({ quote, daysLeft: daysUntilExpiry(quote.sent_at, validDays, now) }))
    .filter(({ daysLeft }) => daysLeft !== null && daysLeft >= 0 && daysLeft <= 7)
    .map(({ quote, daysLeft }) => {
      const opened = Boolean(quote.viewed_at) || String(quote.status) === "viewed";
      return item({
        id: `quote-expiring:${quote.id}`,
        kind: "quote_expiring",
        // Down to the last day it is a phone call, not an email. The reminder
        // has already been sent by then and did not work.
        tier: daysLeft <= 1 ? TIER.critical : TIER.soon,
        title:
          daysLeft <= 1
            ? `Ring ${nameOf(quote)} before their quote expires`
            : `Follow up ${nameOf(quote)} before their quote expires`,
        detail: [
          quote.quote_number,
          opened ? "opened it and never answered" : "never opened the email",
          `sent ${daysBetween(quote.sent_at, now)} days ago`,
        ]
          .filter(Boolean)
          .join(" · "),
        flag: { text: `Expires ${dueLabel(daysLeft)}`, tone: daysLeft <= 1 ? "crit" : "warn" },
        value: toNumber(quote.total_inc_gst),
        valueNote: "at risk",
        daysWaiting: daysBetween(quote.sent_at, now),
        href: `/admin/quotes/${quote.id}`,
        actionLabel: daysLeft <= 1 ? "Open quote" : "Open quote",
        expiresAt: expiresAt(quote.sent_at, validDays)?.toISOString() || null,
      });
    });
}

/** Quotes that ran out in the last fortnight. Re-sending is a real save. */
function lapsedQuotes(quotes, { now, validDays }) {
  return quotes
    .filter((quote) => String(quote.status) === "archived" && quote.archived_reason === ARCHIVED_EXPIRED)
    .map((quote) => ({ quote, lapsedDays: daysBetween(quote.archived_at, now) }))
    .filter(({ lapsedDays }) => lapsedDays !== null && lapsedDays <= LAPSED_STAYS_FOR_DAYS)
    .map(({ quote, lapsedDays }) =>
      item({
        id: `quote-lapsed:${quote.id}`,
        kind: "quote_lapsed",
        tier: lapsedDays <= 3 ? TIER.critical : TIER.soon,
        title: `Re-send ${nameOf(quote)}'s quote if it is still live`,
        detail: [
          quote.quote_number,
          quote.viewed_at ? "they opened it and went quiet" : "they never opened it",
          `expired ${agoLabel(lapsedDays)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        flag: { text: "Expired", tone: "crit" },
        value: toNumber(quote.total_inc_gst),
        valueNote: "lost unless re-sent",
        daysWaiting: lapsedDays,
        href: `/admin/quotes/${quote.id}`,
        actionLabel: "Open quote",
      })
    );
}

/** Said yes, money not in. The deposit sweep chases it; this is the phone call. */
function depositOwing(quotes, { now }) {
  return quotes
    .filter((quote) => String(quote.status) === "awaiting_deposit")
    .map((quote) => {
      const held = quote.awaiting_deposit_at || quote.updated_at;
      const hours = hoursBetween(held, now) ?? 0;
      const percent = Number(quote.deposit_percent || 0);
      const deposit = percent > 0 ? (toNumber(quote.total_inc_gst) * percent) / 100 : null;
      return item({
        id: `deposit:${quote.id}`,
        kind: "deposit_owing",
        // Past a day the two automatic reminders have both been and gone, so
        // whatever happens next is a person's job.
        tier: hours >= 24 ? TIER.critical : TIER.soon,
        title: `${nameOf(quote)} approved but the deposit has not arrived`,
        detail: [quote.quote_number, `approved ${waitedLabel(held, now)} ago`, "no order exists yet"]
          .filter(Boolean)
          .join(" · "),
        flag: { text: "No order yet", tone: "crit" },
        value: deposit,
        valueNote: deposit === null ? "deposit not set" : "deposit owing",
        daysWaiting: Math.floor(hours / 24),
        href: `/admin/quotes/${quote.id}`,
        actionLabel: "Open quote",
      });
    });
}

/** They wrote, nobody answered. Nothing else on the dashboard shows this. */
function unansweredMessages(tickets, { now }) {
  return tickets.map((ticket) =>
    item({
      id: `ticket:${ticket.id}`,
      kind: "unanswered_message",
      tier: (daysBetween(ticket.last_message_at, now) ?? 0) >= 2 ? TIER.critical : TIER.soon,
      title: `${nameOf(ticket)} is waiting on a reply`,
      detail: [ticket.subject, `they wrote ${waitedLabel(ticket.last_message_at, now)} ago`]
        .filter(Boolean)
        .join(" · "),
      flag: null,
      // A conversation is not a number. Showing the customer's open quote total
      // here would read as the value of answering an email, which it is not.
      value: null,
      valueNote: "conversation",
      daysWaiting: daysBetween(ticket.last_message_at, now),
      href: `/admin/customers/${ticket.customer_id}`,
      actionLabel: "Open conversation",
    })
  );
}

/** Somebody asked for a price and has not been given one. */
function quoteRequests(requests, { now }) {
  return requests.map((request) => {
    const waiting = daysBetween(request.created_at, now) ?? 0;
    return item({
      id: `request:${request.id}`,
      kind: "quote_request",
      tier: waiting >= 2 ? TIER.soon : TIER.normal,
      title: `Price up ${nameOf(request)}'s request`,
      detail: [request.product_name || request.source_label || "Website request", `waiting ${waitedLabel(request.created_at, now)}`]
        .filter(Boolean)
        .join(" · "),
      flag: waiting >= 3 ? { text: `Waiting ${waiting} days`, tone: "warn" } : null,
      value: null,
      valueNote: "not priced yet",
      daysWaiting: waiting,
      // No detail page for a request, so this opens its row in the list, where
      // the Convert to quote action lives.
      href: `/admin/quote-requests?focus=${request.id}`,
      actionLabel: "Build quote",
    });
  });
}

/** A stranger asked a question through the website. */
function newEnquiries(enquiries, { now }) {
  return enquiries.map((enquiry) => {
    const waiting = daysBetween(enquiry.created_at, now) ?? 0;
    return item({
      id: `enquiry:${enquiry.id}`,
      kind: "enquiry",
      tier: waiting >= 1 ? TIER.soon : TIER.normal,
      title: `Answer ${nameOf(enquiry, enquiry.customer_email || "a new enquiry")}`,
      detail: [enquiry.topic || "Website enquiry", `arrived ${waitedLabel(enquiry.created_at, now)} ago`]
        .filter(Boolean)
        .join(" · "),
      flag: null,
      value: null,
      valueNote: "enquiry",
      daysWaiting: waiting,
      // The desk when we know who they are, because that is where a reply is
      // typed. Otherwise their row in the enquiries list.
      href: enquiry.customer_id ? `/admin/customers/${enquiry.customer_id}` : `/admin/enquiries?focus=${enquiry.id}`,
      actionLabel: enquiry.customer_id ? "Open conversation" : "Open enquiry",
      customerId: enquiry.customer_id || null,
    });
  });
}

/** Money asked for and not received. Only ever one we actually requested. */
function paymentsOwing(payments, { now }) {
  return payments.map((payment) => {
    const order = payment.pcd_orders || {};
    const waiting = daysBetween(payment.requested_at, now) ?? 0;
    return item({
      id: `payment:${payment.id}`,
      kind: "payment_owing",
      tier: waiting >= 7 ? TIER.critical : TIER.soon,
      title: `Chase ${nameOf(order)} for the ${String(payment.payment_type || "progress").toLowerCase()} payment`,
      detail: [order.order_number, `requested ${waitedLabel(payment.requested_at, now)} ago`, "not received"]
        .filter(Boolean)
        .join(" · "),
      flag: waiting >= 7 ? { text: `${waiting} days unpaid`, tone: "crit" } : null,
      value: toNumber(payment.amount),
      valueNote: "outstanding",
      daysWaiting: waiting,
      href: `/admin/orders/${payment.order_id}`,
      actionLabel: "Open order",
    });
  });
}

/** A date we gave somebody that has been and gone. */
function lateOrders(orders, { now }) {
  const today = now.getTime();
  return orders
    .filter((order) => String(order.status) === "active" && order.target_completion_date)
    .map((order) => ({ order, over: Math.floor((today - new Date(order.target_completion_date).getTime()) / DAY_MS) }))
    .filter(({ over }) => over > 0)
    .map(({ order, over }) =>
      item({
        id: `order-late:${order.id}`,
        kind: "order_late",
        tier: TIER.critical,
        title: `${nameOf(order)}'s job is past the date we gave them`,
        detail: [order.order_number, `was due ${agoLabel(over)}`, order.production_stage || null]
          .filter(Boolean)
          .join(" · "),
        flag: { text: over === 1 ? "1 day over" : `${over} days over`, tone: "crit" },
        value: toNumber(order.total_inc_gst),
        valueNote: "order value",
        daysWaiting: over,
        href: `/admin/orders/${order.id}`,
        actionLabel: "Open order",
      })
    );
}

/** Stopped, and stopped things stay stopped until somebody looks. */
function heldOrders(orders, { now }) {
  return orders
    .filter((order) => String(order.status) === "on_hold")
    .map((order) =>
      item({
        id: `order-hold:${order.id}`,
        kind: "order_on_hold",
        tier: TIER.normal,
        title: `${nameOf(order)}'s job is on hold`,
        detail: [order.order_number, `held since ${waitedLabel(order.updated_at, now)} ago`]
          .filter(Boolean)
          .join(" · "),
        flag: { text: "On hold", tone: "warn" },
        value: toNumber(order.total_inc_gst),
        valueNote: "order value",
        daysWaiting: daysBetween(order.updated_at, now),
        href: `/admin/orders/${order.id}`,
        actionLabel: "Open order",
      })
    );
}

/**
 * The queue.
 *
 * @param {object} sources  rows already read, one array per source
 * @param {object} options  now, validDays, limit
 * @returns {{items:Array, total:number, hidden:number, counts:object}}
 */
export function buildActionQueue(sources = {}, { now = new Date(), validDays = FALLBACK_VALID_DAYS, limit = QUEUE_LIMIT } = {}) {
  const quotes = sources.quotes || [];
  const tickets = sources.openTickets || [];

  const all = [
    ...expiringQuotes(quotes, { now, validDays }),
    ...lapsedQuotes(quotes, { now, validDays }),
    ...depositOwing(quotes, { now }),
    ...unansweredMessages(tickets, { now }),
    ...paymentsOwing(sources.payments || [], { now }),
    ...lateOrders(sources.orders || [], { now }),
    ...heldOrders(sources.orders || [], { now }),
    ...quoteRequests(sources.quoteRequests || [], { now }),
    ...newEnquiries(sources.enquiries || [], { now }),
  ];

  // ONE TASK PER PIECE OF WORK.
  //
  // A website enquiry from somebody we already know becomes a message on their
  // desk as well as an enquiry row, so both sources see it and the queue would
  // list the same job twice under two different names. The conversation wins:
  // it is the fuller version of the same thing and it links to the screen where
  // a reply is actually typed.
  const talkingTo = new Set(tickets.map((ticket) => ticket.customer_id).filter(Boolean));
  const deduped = all.filter((entry) => !(entry.kind === "enquiry" && entry.customerId && talkingTo.has(entry.customerId)));

  // Highest score first. Ties break on the id so the order is stable between
  // renders rather than shuffling under somebody mid-click.
  deduped.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const counts = deduped.reduce((tally, entry) => {
    tally[entry.kind] = (tally[entry.kind] || 0) + 1;
    return tally;
  }, {});

  return {
    items: deduped.slice(0, limit),
    total: deduped.length,
    hidden: Math.max(0, deduped.length - limit),
    counts,
  };
}
