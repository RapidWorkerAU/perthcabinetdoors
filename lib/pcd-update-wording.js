// WHAT A CUSTOMER READS WHEN SOMETHING ON THEIR ORDER CHANGES.
//
// ── ONE PLACE, ON PURPOSE ────────────────────────────────────────────────────
//
// Every sentence that reaches a customer through a weekly update is written
// here and nowhere else. The screen you review on and the email that goes out
// read the same function, so what you approved is what they received. Two
// copies of this would drift, and the thing that drifts is the wording on the
// one document a customer keeps.
//
// ── THE ACTIVITY LOG IS NOT COPY ─────────────────────────────────────────────
//
// pcd_order_activity records what the database did: "Fulfilment changed from
// in_house to supplier_ready_made", "Status Updated At changed from ... to ...".
// That is the right thing to keep and the wrong thing to forward. Nothing here
// prints a logged string; every field is turned into a sentence written for a
// person, and anything without a sentence is not sent.
//
// ── THE FIVE RULES ───────────────────────────────────────────────────────────
//
//   1. A date that has passed is stated plainly. A DATE IN THE FUTURE IS ALWAYS
//      HEDGED, every time, with "around", "aiming" or "estimate". We do not
//      promise a day we do not control.
//
//   2. Every movement says WHERE THE GOODS ARE GOING. "Arrived at our
//      workshop", never "received": a customer reads "received" as received by
//      them, and then wonders where the parcel is.
//
//   3. NO SUPPLIERS, NO METHODS, NO INTERNAL NOTES. Who we buy from, what we
//      make versus buy, and what the workshop wrote for itself all stay in.
//
//   4. FACTS, NOT CONCLUSIONS. "Finished", not "ready for collection".
//      "Checked over by our team", not "passed inspection". This runs off a log
//      and cannot know what happens next, so it does not say.
//
//   5. NOTHING BAD IS ANNOUNCED BY A MACHINE. Issues and holds are off by
//      default. Those deserve somebody ringing, not a line in a 6am email.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

/** 20 August 2026. Written out, because 08/09 is a different day in two countries. */
export function longDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function shortDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${SHORT[d.getMonth()]}`;
}

export function money(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" })
    .format(Number(value) || 0);
}

/**
 * WHAT WE SAY, AND WHAT WE DELIBERATELY DO NOT.
 *
 * `false` is not an oversight. Each of these was looked at and left out, and the
 * reason is written down so nobody adds it back without reading why.
 */
export const ITEM_STATUS_WORDS = {
  // Past tense, a thing that happened, no promise attached to it.
  Ordered: (n, on, supplier) => `${n} ordered${supplier}${on ? ` on ${longDate(on)}` : ""}`,
  // "At our workshop" so nobody reads it as a delivery to them.
  Received: (n, on) => `${n} arrived at our workshop${on ? ` on ${longDate(on)}` : ""}`,
  // Says the check happened without inviting "and what did you find".
  Checked: (n) => `${n} checked over by our team`,
  // NOT "ready for collection". Finished is a fact; ready to collect is a
  // commitment about a date and a place nobody has made yet.
  Complete: (n) => `${n} finished`,
  Installed: (n, on) => `${n} installed${on ? ` on ${longDate(on)}` : ""}`,
  // Going backwards is somebody correcting a mis-click. Telling a customer
  // their doors have been un-ordered causes a phone call about nothing.
  "Not Ordered": false,
};

/** The workshop's stage names, said in words a customer would use. */
export const STAGE_WORDS = {
  "Materials Ready": "Your materials are ready",
  Cutting: "Your doors are being cut",
  Edging: "Your doors are being edged",
  Profiling: "Your doors are being profiled",
  // Not "thermolaminating". Nobody outside the trade knows what that is.
  Thermolaminating: "Your doors are being finished",
  Drilling: "Your doors are being drilled",
  "Quality Check": "Your doors are being checked over",
  Packed: "Your doors are packed and ready",
  "Ready for Install": "Your doors are ready for install",
  Complete: "Your doors are finished",
  // Nothing has happened yet. An update saying so is not an update.
  "Not Started": false,
};

/**
 * Fields that never reach a customer, and why.
 *
 * Kept as a written list rather than "anything not handled below", so that a
 * new field added to the order form is silent by default AND shows up here as
 * an obvious gap when somebody looks.
 */
export const NEVER_SENT = {
  fulfilment_method: "Whether a door is made here or bought in is a commercial decision, not a customer update.",
  supplier_name: "Who we buy from is ours.",
  supplier_order_ref: "Their reference number means nothing to a customer and everything to a competitor.",
  board_required: "Material planning. Whether a job needs board bought in is a workshop question.",
  board_ordered: "When we buy our own material is our business, and a customer cannot act on it.",
  board_available: "'Board available: no' reads as a delay before anyone has decided there is one.",
  production_notes: "Free text written for the workshop by somebody who was not expecting a customer to read it.",
  status_updated_at: "A timestamp the code sets whenever status changes. Not a change anybody made.",
  panel_planning: "Cutting geometry.",
  notes: "Internal.",
};

/**
 * One customer-facing sentence for one change, or null for silence.
 *
 * @param {object} change  a normalised change, see pcd-weekly-updates.js
 * @param {object} [options]
 * @param {boolean} [options.nameSupplier=false]  say "with our supplier" out loud
 * @param {boolean} [options.includeIssues=false] tell them an issue was raised
 * @param {boolean} [options.includeHolds=false]  tell them the order is on hold
 * @returns {string|null}
 */
export function sentenceFor(change, options = {}) {
  const { nameSupplier = false, includeIssues = false, includeHolds = false } = options;
  const supplier = nameSupplier ? " with our supplier" : "";

  switch (change.kind) {
    // ── line items ────────────────────────────────────────────────────────
    case "item_status": {
      const word = ITEM_STATUS_WORDS[change.to];
      if (!word) return null;
      // "10 x Profiled doors", rolled up from ten separate activity rows.
      const noun = `${change.qty} x ${change.itemLabel}`;
      return word(noun, change.on, supplier);
    }

    case "item_eta_set":
      // THE MOST DANGEROUS LINE HERE. "Around", "estimate" and "can move" are
      // all deliberate, and "our workshop" stops it reading as their delivery.
      return `Expected to reach our workshop around ${longDate(change.to)}. This is an estimate and can move.`;

    case "item_eta_moved":
      // Says it moved rather than quietly restating a new date. They notice
      // either way, and being told first is better than being caught out.
      return `Expected arrival at our workshop has moved from ${shortDate(change.from)} to ${longDate(change.to)}.`;

    case "item_stage": {
      const words = STAGE_WORDS[change.to];
      return words || null;
    }

    // ── order level ───────────────────────────────────────────────────────
    case "payment_received":
      // The type and the amount, so it can be matched against their records.
      // No running balance: a figure in an email is one we then have to keep
      // true, and a variation next week makes today's balance wrong.
      return `Payment received, ${change.label}, ${money(change.amount, change.currency)}. Thank you.`;

    case "payment_outside":
      // How it arrived, because somebody who paid by transfer wants to know it
      // was actually found and matched.
      return `Payment received, ${money(change.amount, change.currency)} by ${change.label}. Thank you.`;

    case "scheduled_start":
      return `Your order is booked into our workshop to start on ${longDate(change.to)}.`;

    case "target_completion":
      // The second dangerous line, and the promise at the end of it is the
      // point: it is what makes the estimate honest rather than slippery.
      return `We are aiming to have your order finished around ${longDate(change.to)}. ` +
        "This is our current estimate, and we will let you know if it changes.";

    case "order_complete":
      // Full stop. Collection and delivery are arranged by a person.
      return "Your order is now complete.";

    case "variation_applied":
      // They already approved it; this confirms it landed, with the number so
      // they can tie it back to what they signed.
      return `Change ${change.reference} approved and added to your order, ${money(change.amount, change.currency)}.`;

    case "order_hold":
      // Off by default. Honest, but it always causes a call and a hold often
      // lasts an afternoon.
      return includeHolds
        ? "Your order is on hold at the moment. We will be in touch about next steps."
        : null;

    case "issue_raised":
      // Off by default, and NEVER the detail: the log holds things like "Wrong
      // size on the whole order", written for the workshop.
      return includeIssues
        ? "An issue has been raised on your order and we are looking into it."
        : null;

    default:
      // A change nobody has written a sentence for is silence, not a guess.
      return null;
  }
}

/** How the change reads to US, on the review screen. Never sent anywhere. */
export function internalLabelFor(change) {
  switch (change.kind) {
    case "item_status":      return `${change.qty} item${change.qty === 1 ? "" : "s"} set to ${change.to}`;
    case "item_eta_set":     return "Supplier ETA set";
    case "item_eta_moved":   return "Supplier ETA changed";
    case "item_stage":       return `Production stage: ${change.to}`;
    case "payment_received": return "Payment received";
    case "payment_outside":  return "Payment received outside the link";
    case "scheduled_start":  return "Scheduled start set";
    case "target_completion":return "Target completion set";
    case "order_complete":   return "Order marked complete";
    case "variation_applied":return "Variation applied";
    case "order_hold":       return "Order put on hold";
    case "issue_raised":     return "Issue raised";
    case "internal":         return "Order updated";
    default:                 return change.kind;
  }
}

// ── THE EMAIL ITSELF ────────────────────────────────────────────────────────

/**
 * The footer, on every one of these.
 *
 * The reply line comes FIRST so nobody has to read a disclaimer to find out how
 * to reach us. The second paragraph does two jobs: it sets the expectation that
 * a machine assembled this, and it stops the email being read as an invoice or
 * as a firmer commitment than the hedged dates above it.
 */
export const UPDATE_REPLY_LINE =
  "If anything here does not look right, or you have a question, just reply to this email and it comes " +
  "straight through to our team.";

export const UPDATE_AUTOMATIC_NOTE =
  "This is an automatic update from our order management system, sent so you always know where your job " +
  "is up to. It is not a request for payment or a confirmation of any dates beyond those stated above.";

/**
 * The whole message, as plain text, ready to be reviewed and edited.
 *
 * Plain text on purpose: this is what a person reads in the modal and changes
 * before sending, and a textarea full of markup is not reviewable. The sender
 * turns it into the branded email.
 *
 * @param {object} input
 * @param {string} input.customerName
 * @param {Array}  input.orders   [{ number, name, changes: [] }]
 */
export function updateEmailBody({ customerName, orders = [] }, options = {}) {
  const lines = [];
  const first = String(customerName || "").trim().split(/\s+/)[0] || "there";

  // Only the ones that actually produce a sentence, counted before the intro is
  // written: "4 updates" followed by three lines is the sort of thing a person
  // notices immediately and never quite trusts again.
  const sections = orders
    .map((order) => ({
      order,
      said: (order.changes || [])
        .map((change) => ({ change, text: sentenceFor(change, options) }))
        .filter((row) => row.text),
    }))
    .filter((section) => section.said.length);

  const total = sections.reduce((n, s) => n + s.said.length, 0);

  lines.push(`Hi ${first},`);
  lines.push("");
  lines.push(
    `Here is where things are up to on your job. We have had ${total === 1 ? "one update" : `${total} updates`}` +
      `${sections.length > 1 ? ` across your ${sections.length} orders` : ""} since we last wrote.`
  );

  sections.forEach((section) => {
    lines.push("");
    lines.push(`${section.order.number}${section.order.name ? ` - ${section.order.name}` : ""}`);
    section.said
      .slice()
      .sort((a, b) => String(a.change.at).localeCompare(String(b.change.at)))
      .forEach((row) => {
        lines.push(`  ${longDate(row.change.at)} - ${row.text}`);
      });
  });

  lines.push("");
  lines.push(UPDATE_REPLY_LINE);
  lines.push("");
  lines.push(UPDATE_AUTOMATIC_NOTE);
  lines.push("");
  lines.push("Perth Cabinet Doors");
  return lines.join("\n");
}

export function updateEmailSubject() {
  return "Update on your Perth Cabinet Doors order";
}
