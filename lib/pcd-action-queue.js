// WHAT TO DO NEXT: the top of the board, ranked.
//
// ── WHAT THIS IS NOT, ANY MORE ───────────────────────────────────────────────
//
// It was a second list of the same work, built from its own queries. It did not
// know about set aside, so a card somebody had deliberately cleared off the
// board came back on the dashboard an hour later with no way to clear it again.
// A board you have cleared and a dashboard that disagrees is worse than having
// neither, because now you cannot trust either one.
//
// So this decides nothing about WHAT needs doing. lib/pcd-board.js does that,
// lib/pcd-board-load.ts reads it, and set aside has already been applied by the
// time a card reaches here. This only puts them in order and words them for a
// one line row.
//
// ── THE RULE, AND WHY IT IS PRINTED ON THE PANEL ─────────────────────────────
//
//   score = tier x 10000  +  days x 10  +  value / 40
//
// Tier is how old the card is against the board's own age bands, so the two
// screens agree about what is urgent. It moves in steps far larger than the
// other two, so nothing can climb past something genuinely overdue just by
// being expensive.
//
// A list that sorts itself without saying how is a list people stop trusting
// the first time it puts something odd at the top, so the rule is written on
// the panel in one sentence rather than living only here.
//
// ── THE BUTTON SAYS WHERE IT GOES ────────────────────────────────────────────
//
// The label is worked out from the href rather than from the card kind, so it
// cannot end up saying "Open quote" on a link to an order. If a card starts
// pointing somewhere new, the button renames itself.

import { AGE_COLS, LATE_AT } from "./pcd-board";

/** Deadline pressure. The steps are large so age and value cannot jump one. */
export const TIER = { critical: 3, high: 2, normal: 1, low: 0 };

/** How many rows the panel shows before "and N more". */
export const QUEUE_LIMIT = 8;

/**
 * How urgent a card is, on the board's own age bands.
 *
 * Deliberately not a second opinion. The board already draws its lines at 2, 8
 * and 15 days and calls the last two urgent; if this invented its own, the
 * dashboard would call something urgent that the board showed as fine.
 *
 * A card that BLOCKS other work, or an open problem on a job, is pulled up one
 * band: those are not waiting on anybody, they are stopping something.
 */
export function tierOf(cardRow) {
  const days = Number(cardRow?.days) || 0;
  const band = days >= 15 ? TIER.critical : days >= LATE_AT ? TIER.high : days >= 2 ? TIER.normal : TIER.low;
  const bump = cardRow?.blocks || cardRow?.cat === "issue" ? 1 : 0;
  return Math.min(TIER.critical, band + bump);
}

/**
 * The one place an item's position is decided.
 *
 * Age caps at 60 days and value at $20,000 so a single very old or very large
 * card cannot sit permanently at the top of its tier and hide everything under
 * it. The oldest thing on the board is not automatically the most important
 * thing on it.
 */
export function scoreOf({ tier = TIER.normal, days = 0, amt = 0 }) {
  const age = Math.min(Math.max(Number(days) || 0, 0), 60) * 10;
  const worth = Math.min(Math.max(Number(amt) || 0, 0), 20000) / 40;
  return tier * 10000 + age + worth;
}

// ── the words ────────────────────────────────────────────────────────────────

// The instruction, per board column. The board's own column labels are written
// for a heading above a stack of cards ("Reply to the customer"), and a row in
// a list needs the person's name in it instead.
const INSTRUCTION = {
  issue: (who) => `Sort out the problem on ${who}'s job`,
  reply: (who) => `Reply to ${who}`,
  price: (who) => `Send ${who} a price`,
  depo: (who) => `Chase ${who} for the deposit`,
  plan: (who) => `Finish planning ${who}'s job`,
  materials: (who) => `Order the materials for ${who}'s job`,
  late: (who) => `Chase the workshop on ${who}'s job`,
  balance: (who) => `Invoice ${who} for what is left`,
};

// chase covers three different things sitting with a customer, and "Chase
// Rebecca" tells you nothing about which. The subject type is what separates
// them, and the board already records it for exactly this sort of question.
const CHASE = {
  quote: (who) => `Follow up ${who} about their quote`,
  payment: (who) => `Chase ${who} for the payment`,
  variation: (who) => `Follow up ${who} about the change`,
};

export function instructionFor(cardRow) {
  const who = String(cardRow?.who || "").trim() || "this customer";
  if (cardRow?.cat === "chase") {
    const shape = CHASE[String(cardRow?.subjectType || "")];
    return shape ? shape(who) : `Follow up ${who}`;
  }
  const shape = INSTRUCTION[String(cardRow?.cat || "")];
  return shape ? shape(who) : `Look at ${who}`;
}

/**
 * The button, named after where it actually goes.
 *
 * Read off the href on purpose. A label taken from the card kind can drift away
 * from the link beside it, and a button that says "Open quote" and opens an
 * order is the exact thing that stops somebody clicking the next one.
 */
export function destinationLabel(href) {
  const path = String(href || "");
  if (path.startsWith("/admin/quotes/")) return "Open quote";
  if (path.startsWith("/admin/orders/")) return "Open order";
  if (path.startsWith("/admin/customers")) return "Open conversation";
  if (path.startsWith("/admin/quote-requests")) return "Open request";
  if (path.startsWith("/admin/enquiries")) return "Open enquiry";
  if (path.startsWith("/admin/quotes")) return "Open quotes";
  return "Open";
}

/**
 * The badge beside the title, when there is something to say.
 *
 * Only ever the age, and only once a card is genuinely late by the board's
 * reckoning. A flag on everything is a flag on nothing.
 */
export function flagFor(cardRow) {
  const days = Number(cardRow?.days) || 0;
  if (cardRow?.cat === "issue") return { text: "Problem", tone: "crit" };
  if (days >= 15) return { text: `${days} days`, tone: "crit" };
  if (days >= LATE_AT) return { text: `${days} days`, tone: "warn" };
  return null;
}

/** The band the card sits in, so the panel and the board describe it alike. */
export function ageBandLabel(days) {
  const band = AGE_COLS.filter((col) => days >= col.min && days <= col.max)[0];
  return band ? band.label : "";
}

/** One board card, worded for a single row. */
export function toQueueItem(cardRow) {
  const tier = tierOf(cardRow);
  const amt = Number(cardRow?.amt) || 0;
  return {
    id: cardRow.id,
    cat: cardRow.cat,
    tier,
    title: instructionFor(cardRow),
    // The board's own sentence for why this card exists. Reused rather than
    // rewritten, so the reason on the dashboard is the reason on the board.
    detail: [cardRow.what, cardRow.why].filter(Boolean).join(" · "),
    flag: flagFor(cardRow),
    // Zero is not an amount here, it is a card with no money on it: a reply, a
    // planning job, a problem to fix. It shows what it is instead of $0.
    value: amt > 0 ? amt : null,
    valueNote: amt > 0 ? (cardRow.theirs ? "sitting with them" : "on this job") : ageBandLabel(Number(cardRow.days) || 0),
    days: Number(cardRow.days) || 0,
    href: cardRow.href || "",
    actionLabel: destinationLabel(cardRow.href),
    score: scoreOf({ tier, days: cardRow.days, amt }),
  };
}

/**
 * The queue: the board, in order, with the top of it taken.
 *
 * @param {Array} cards  board cards, AFTER set aside has been applied
 * @returns {{items:Array, total:number, hidden:number}}
 */
export function rankBoardCards(cards = [], { limit = QUEUE_LIMIT } = {}) {
  const items = (cards || [])
    .filter((cardRow) => cardRow && cardRow.id)
    .map(toQueueItem)
    // Highest score first. Ties break on the id so the order is stable between
    // renders rather than shuffling under somebody mid-click.
    .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));

  return {
    items: items.slice(0, limit),
    total: items.length,
    hidden: Math.max(0, items.length - limit),
  };
}
