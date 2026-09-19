// WHAT HAPPENS TO THE FEE IF A BOOKING IS CALLED OFF.
//
// ── WHY THE WORDS LIVE IN CODE ───────────────────────────────────────────────
//
// This policy appears in four places: on the booking form before anybody pays,
// in a modal on that form, on a page of its own so the email and the footer can
// link at it, and in the confirmation email itself. A policy that exists four
// times is a policy that disagrees with itself the first time somebody edits
// one of them, and this one decides whether a customer gets their money back.
//
// So it is written once, here, and every one of those four renders it.
//
// ── WHY THE CUTOFF IS THE CONFIRMATION WINDOW ────────────────────────────────
//
// confirm_hours is when we tell the customer their exact hour and plan the
// day's run around it. Using the same number as the refund cutoff is not a
// coincidence, it is the argument: once we have confirmed your time, the day is
// committed and is no longer available to anybody else. A customer accepts that
// reason. "48 hours because we said so" is a reason they ring about.
//
// One number, one meaning. They can be split later if the business ever wants a
// refund window longer than a confirmation window, and this is the file that
// would say so.
//
// ── THE TONE ─────────────────────────────────────────────────────────────────
//
// Facts and what they can do about them. No reassurance, no apology, no line
// that exists to make the reader feel looked after. See the note on customer
// email tone: every sentence here either tells them something they need or
// tells them how to act.

/** Where the full policy lives, for anything that needs to link at it. */
export const CANCELLATION_POLICY_PATH = "/cancellation-policy";

/** Shown at the top of the page so somebody can tell whether it has changed. */
export const CANCELLATION_POLICY_UPDATED = "19 September 2026";

function money(amount, currency = "AUD") {
  const number = Number(amount || 0);
  return number.toLocaleString("en-AU", {
    style: "currency",
    currency: currency || "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "48 hours". Always hours: the window is short and it is a deadline. */
export function cutoffWords(confirmHours) {
  const hours = Math.max(1, Math.round(Number(confirmHours) || 48));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/**
 * Which way a cancellation goes, by the clock and nothing else.
 *
 * Returns "refund" or "credit". Deliberately takes the two instants rather than
 * reading a clock itself, so the booking page, the admin screen and the test
 * all ask the same question of the same numbers.
 *
 * The boundary belongs to the CUSTOMER: cancelling at exactly the cutoff is a
 * refund. A minute either way is arguable, and the arguable minute should not
 * go to the business.
 */
export function cancellationOutcome({ bookingStartsAt, confirmHours, now = new Date() } = {}) {
  const starts = bookingStartsAt instanceof Date ? bookingStartsAt : new Date(bookingStartsAt);
  if (Number.isNaN(starts.getTime())) return "credit";
  const hours = Math.max(1, Math.round(Number(confirmHours) || 48));
  const cutoff = new Date(starts.getTime() - hours * 3600000);
  const at = now instanceof Date ? now : new Date(now);
  return at.getTime() <= cutoff.getTime() ? "refund" : "credit";
}

/**
 * The two halves of the rule, as content rather than markup.
 *
 * Returned as data so the page can draw them as two panels, the modal as two
 * short blocks and the email as two sentences, without any of the three owning
 * the words.
 */
export function cancellationRules({ fee, confirmHours, currency = "AUD" } = {}) {
  const amount = money(fee, currency);
  const window = cutoffWords(confirmHours);
  return [
    {
      key: "refund",
      when: `More than ${window} before`,
      head: "Refunded in full",
      body:
        `We refund the ${amount} to the card you paid with. It usually reaches your account within five ` +
        `business days, depending on your bank.`,
    },
    {
      key: "credit",
      when: `Inside ${window}`,
      head: "Held as a credit",
      body:
        `We keep the ${amount} as a credit on your account. Use it on another site measure, or it comes off ` +
        `any order you place with us. It does not expire.`,
    },
  ];
}

/** The one sentence the booking form and the email both carry. */
export function cancellationSummary({ fee, confirmHours, currency = "AUD" } = {}) {
  const amount = money(fee, currency);
  const window = cutoffWords(confirmHours);
  return (
    `Cancel more than ${window} before your booking and we refund the ${amount} to your card in full. ` +
    `Inside ${window} we hold it as a credit you can use on another site measure or on an order.`
  );
}

/** Why the cutoff is where it is. Said on the page and in the modal, not on the form. */
export function cancellationReasonWords(confirmHours) {
  return (
    `In the ${cutoffWords(confirmHours)} before your booking we confirm your exact time and plan the day ` +
    `around it. From that point the visit is committed and the day is not available to anybody else, which ` +
    `is why the fee is held rather than refunded.`
  );
}

/**
 * The whole policy, as sections.
 *
 * The page renders all of it. The modal renders the first three, because a
 * modal somebody opened mid payment is not the place for the consumer law
 * footer. Both are reading this array, so neither can say something the other
 * does not.
 */
export function cancellationPolicySections({ fee, confirmHours, currency = "AUD", salesEmail = "" } = {}) {
  const amount = money(fee, currency);
  return [
    {
      key: "what",
      heading: "What the fee is",
      paragraphs: [
        `When you book a site measure you pay a ${amount} fee. It covers our time and travel for that visit, ` +
          `and it comes off any order you place from the quote we send you afterwards.`,
      ],
    },
    {
      key: "rules",
      heading: "If you cancel",
      rules: cancellationRules({ fee, confirmHours, currency }),
    },
    {
      key: "why",
      heading: `Why ${cutoffWords(confirmHours)}`,
      paragraphs: [cancellationReasonWords(confirmHours)],
    },
    {
      key: "how",
      heading: "How to cancel or move your booking",
      paragraphs: [
        `Reply to your booking confirmation email, or email ${salesEmail} with your name and the date you booked.`,
      ],
    },
    {
      key: "us",
      heading: "If we cancel",
      paragraphs: [
        `If we cancel or move your booking, you are refunded in full whenever that happens, or you can keep ` +
          `the credit and pick another day. That choice is yours.`,
      ],
    },
    {
      key: "credit",
      heading: "Using your credit",
      bullets: [
        "It shows on any quote we write for you, under the total, with the date you paid it.",
        "It comes off your deposit, so there is less to pay to start.",
        "It does not expire and it is not transferable to another person.",
      ],
    },
  ];
}

/** The sections a modal opened mid payment should carry. The rest is for the page. */
export const MODAL_SECTION_KEYS = ["what", "rules", "why", "how"];
