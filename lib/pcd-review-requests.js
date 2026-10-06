// ASKING A FINISHED CUSTOMER FOR A GOOGLE REVIEW: THE RULES.
//
// ── WHAT HAPPENS ─────────────────────────────────────────────────────────────
//
// Mark an order Complete and nothing is sent. The order page shows the request
// lined up, with the day it will go. Once a day the review job looks at every
// finished order, works out its state with reviewRequestState below, and sends
// the ones that are due. lib/pcd-review-request-run.js does the sending; this
// file only decides, so the decisions are tested without a database or a mail
// provider anywhere near them.
//
// ── THE CLOCK ────────────────────────────────────────────────────────────────
//
// It starts on the later of two days: the day the order was marked Complete,
// and the day the last payment landed. An order finished with money still owing
// is on hold, and its clock starts the day it is paid in full. Asking somebody
// for a review while we are still chasing them for money reads badly.
//
// The wait (Business Defaults, 3 days unless changed) is counted in Perth days
// from there. Perth, explicitly: these run on a server in another timezone, and
// a job finished at 4pm here is finished on the next day in UTC.
//
// ── WHO IS NEVER ASKED ───────────────────────────────────────────────────────
//
//   an order finished before the switch went on    turning this on must not
//                                                  email everybody we have ever
//                                                  done a job for
//   an address that pressed unsubscribe            the Spam Act, and manners
//   a customer ticked "Never ask for reviews"      trade, and anybody it would
//                                                  be wrong to ask
//   a customer asked inside the gap                12 months unless changed, so
//                                                  a builder with ten jobs a
//                                                  year is asked once
//   an order somebody chose to skip                a complaint still open, a
//                                                  remake, a friend's job
//
// ── WHO IS ALWAYS ASKED ──────────────────────────────────────────────────────
//
// Everybody else, the same email. Google does not allow asking only the
// customers you expect to be happy ("review gating"), and reviews gathered that
// way can be taken down. The skip is for genuine exceptions, not for choosing
// who gets to have an opinion. No reward is ever offered either: Google bans
// that too.

// A dollar of rounding is not a debt. Same threshold the board and the order
// stage use, through the same arithmetic. See lib/pcd-board-money.js.
import { outstandingOnOrder } from "./pcd-board-money";
import { isRefund } from "./pcd-refunds";

export const PERTH = "Australia/Perth";

// A request that has been due this long without going is not sent at all.
// Somebody adding an email address to an order finished in March should not
// set off a thank you in October that reads as though the job was last week.
export const TOO_LATE_DAYS = 60;

// The job only sends between these Perth hours. One scheduler calls it at 6am,
// which is no time for a thank you to arrive.
export const SEND_FROM_HOUR = 8;
export const SEND_UNTIL_HOUR = 18;

export const REVIEW_BUTTON = "{review_button}";

/** The calendar day in Perth, as YYYY-MM-DD. */
export function perthDay(value) {
  if (!value) return "";
  // A bare date is already a Perth day: paid_at is a date column, typed by us.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PERTH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** The hour in Perth, 0 to 23. */
export function perthHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat("en-AU", { timeZone: PERTH, hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(hour) % 24;
}

export function addDays(day, days) {
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
  return moved.toISOString().slice(0, 10);
}

/** "Thu 8 Oct", for a YYYY-MM-DD. */
export function dayLabel(day) {
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Whether the job may send right now. */
export function insideSendingHours(now = new Date()) {
  const hour = perthHour(now);
  return hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR;
}

/**
 * The day the clock starts: the later of finishing and the last money in.
 * Null when the order is not finished.
 */
export function clockStartDay(order, payments = []) {
  const finished = perthDay(order?.completed_at);
  if (!finished) return "";
  const lastPaid = (payments || [])
    .filter((payment) => payment.is_paid && !isRefund(payment))
    .map((payment) => perthDay(payment.paid_at))
    .filter(Boolean)
    .sort()
    .pop();
  return lastPaid && lastPaid > finished ? lastPaid : finished;
}

export function owingOn(order, payments = []) {
  return outstandingOnOrder(order?.total_inc_gst, payments || []);
}

/**
 * Where one order's review request is up to.
 *
 * @param order     the pcd_orders row
 * @param context   settings        normalised business defaults
 *                  enabledAt       when the switch went on
 *                  payments        the order's payment rows
 *                  optedOut        the address pressed unsubscribe
 *                  neverAsk        the customer is ticked "Never ask"
 *                  lastAskedAt     the newest request sent to this customer or
 *                                  address on ANOTHER order, if any
 *                  now
 *
 * @returns { key, label, sendOn, owing, why }
 *
 * key is one of:
 *   not_complete    nothing to do
 *   sent            done, never again
 *   skipped         decided against, see skippedReason
 *   off             the switch in Settings is off
 *   before_switch   finished before the switch went on
 *   opted_out       unsubscribed, or ticked Never ask
 *   owing           on hold until paid in full
 *   no_email        nobody to send it to
 *   asked_recently  inside the gap
 *   waiting         lined up for sendOn
 *   due             goes on the next pass
 *   too_late        due so long ago it would read oddly
 */
export function reviewRequestState(order, context = {}) {
  const { settings = {}, enabledAt = null, payments = [], optedOut = false, neverAsk = false, lastAskedAt = null } =
    context;
  const now = context.now || new Date();
  const today = perthDay(now);
  const result = (key, label, extra = {}) => ({ key, label, sendOn: "", owing: 0, ...extra });

  if (order?.review_request_sent_at) {
    return result("sent", `Google review request sent on ${dayLabel(perthDay(order.review_request_sent_at))}.`);
  }
  if (order?.status !== "complete") return result("not_complete", "");

  if (order?.review_request_skipped_at) {
    return result("skipped", skippedLabel(order), { skippedReason: order.review_request_skipped_reason || "" });
  }

  if (!settings.review_requests_enabled) {
    return result("off", "Google review requests are switched off in Settings, so nothing will be sent.");
  }

  // Finished before the switch went on. Compared as instants, not days, so an
  // order completed an hour before the switch is still left alone.
  if (!enabledAt || !order.completed_at || new Date(order.completed_at) < new Date(enabledAt)) {
    return result(
      "before_switch",
      "Finished before Google review requests were switched on, so this order is not asked."
    );
  }

  if (optedOut || neverAsk) {
    return result(
      "opted_out",
      neverAsk
        ? "This customer is ticked Never ask for reviews."
        : "This customer unsubscribed from review requests."
    );
  }

  const owing = owingOn(order, payments);
  if (owing >= 1) {
    const days = settings.review_request_delay_days;
    return result(
      "owing",
      `Google review request on hold: $${owing.toFixed(2)} is still owing. Once it is paid in full, ` +
        (days ? `the request goes ${days} day${days === 1 ? "" : "s"} later.` : "the request goes on the next pass."),
      { owing }
    );
  }

  const email = String(order.customer_email || "").trim();
  if (!email) {
    return result("no_email", "No Google review request yet: this order has no email address. Add one and it will go.");
  }

  const gapMonths = Number(settings.review_request_gap_months) || 0;
  if (gapMonths > 0 && lastAskedAt) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - gapMonths);
    if (new Date(lastAskedAt) > cutoff) {
      return result(
        "asked_recently",
        `This customer was asked for a review on ${dayLabel(perthDay(lastAskedAt))}, inside the ` +
          `${gapMonths} month gap, so they will not be asked again for this order.`
      );
    }
  }

  const sendOn = addDays(clockStartDay(order, payments), settings.review_request_delay_days);
  if (today < sendOn) {
    return result("waiting", `Google review request lined up for ${email} on ${dayLabel(sendOn)}.`, { sendOn });
  }
  if (today > addDays(sendOn, TOO_LATE_DAYS)) {
    return result(
      "too_late",
      `This request was due on ${dayLabel(sendOn)}, more than ${TOO_LATE_DAYS} days ago, so it will not be sent.`,
      { sendOn }
    );
  }
  return result("due", `Google review request goes to ${email} on the next pass.`, { sendOn });
}

const SKIP_WORDS = {
  staff: "Skipped for this order",
  opted_out: "Not sent: the customer had opted out of review requests",
  asked_recently: "Not sent: the customer was asked recently on another order",
  too_late: "Not sent: it was due too long ago",
};

function skippedLabel(order) {
  const words = SKIP_WORDS[order.review_request_skipped_reason] || "No Google review request for this order";
  const who = order.review_request_skipped_by ? ` by ${order.review_request_skipped_by}` : "";
  const when = order.review_request_skipped_at ? ` on ${dayLabel(perthDay(order.review_request_skipped_at))}` : "";
  return `${words}${order.review_request_skipped_reason === "staff" ? who : ""}${when}.`;
}

/** The first word of a name, or "" when there is none worth using. */
export function firstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  // A company name in the customer box ("ABC Builders Pty Ltd") gives "ABC",
  // which is worse than no name at all. Only a word that looks like a name.
  return /^[A-Za-z][a-z'-]+$/.test(first) ? first : "";
}

/**
 * The message from Settings with the fill ins filled.
 *
 * Returns paragraphs, split on blank lines, with the button paragraph left as
 * REVIEW_BUTTON for the template to draw. A message with no button in it gets
 * one at the end, because an ask with nothing to press is no ask at all.
 */
export function reviewMessageParagraphs(message, { firstName: name = "", orderNumber = "" } = {}) {
  const filled = String(message || "")
    .replace(/\r\n/g, "\n")
    // "Hi {first_name}," with no name reads "Hi ,". Say "Hi there," instead.
    .replace(/\{first_name\}/g, name || "there")
    .replace(/\{order_number\}/g, orderNumber || "");
  const paragraphs = filled
    .split(/\n\s*\n/)
    // The button is a block of its own, so a {review_button} typed in the
    // middle of a sentence splits the paragraph around it.
    .flatMap((paragraph) => paragraph.split(/(\{review_button\})/))
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.includes(REVIEW_BUTTON)) paragraphs.push(REVIEW_BUTTON);
  return paragraphs;
}

/** What is missing before anything can be sent. Shown on the settings screen and refused by the job. */
export function reviewSettingsProblem(settings = {}) {
  if (!settings.review_requests_enabled) return null;
  const url = String(settings.google_review_url || "").trim();
  if (!url) return "Add your Google review link before switching review requests on.";
  if (!/^https:\/\/\S+$/.test(url)) return "The Google review link must start with https://";
  if (!String(settings.review_request_subject || "").trim()) return "Add a subject for the review request email.";
  if (!String(settings.review_request_message || "").trim()) return "Add the wording for the review request email.";
  return null;
}
