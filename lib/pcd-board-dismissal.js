// Setting a card aside.
//
// WHAT THIS IS. The ticket closure idea (lib/pcd-ticket-closure.js) applied to
// the whole board: a card can be set aside with a reason, it disappears, and it
// comes back by itself when the thing it is about moves on.
//
// WHAT IT IS NOT. A delete, and not a permanent hide. Every card is about
// something with a clock on it: the newest message from a customer, the day a
// quote went out, when a payment was asked for. Setting the card aside records
// WHERE THAT CLOCK WAS at the time. The card stays off the board while nothing
// has changed, and the moment the clock moves past that mark, it is a new
// situation and the card returns.
//
// So a quote nobody answered can be set aside, and reissuing it puts it back.
// A customer who went quiet can be set aside, and their next email brings them
// back. Nothing is lost, and nothing has to be remembered by a person.
//
// The reason is kept as words, not a code alone, because it is written into the
// customer's own timeline where somebody will read it months later.

export const DISMISS_REASONS = [
  { key: "no_reply_needed", label: "No reply needed", words: "Nothing to answer." },
  { key: "handled_elsewhere", label: "Handled another way", words: "Dealt with outside the system." },
  { key: "answered_by_phone", label: "Answered by phone", words: "Handled on the phone." },
  { key: "not_going_ahead", label: "Not going ahead", words: "The customer is not proceeding." },
  { key: "spam", label: "Spam", words: "Spam or junk." },
  { key: "other", label: "Other", words: "Set aside." },
];

export const DISMISS_REASON_KEYS = DISMISS_REASONS.map((r) => r.key);

/**
 * One reason, from the live list where there is one.
 *
 * `reasons` is whatever Settings, Lists holds for this list. Reasons can be added
 * there, so a key this file has never heard of is a real reason somebody set up
 * rather than a mistake, and refusing it would mean the button on the board did
 * nothing. Falls back to the built-ins, then to the last of them, which is
 * "Other".
 */
export function dismissReason(key, reasons = []) {
  const custom = (reasons || []).filter((r) => r?.key === key)[0];
  if (custom) return { key: custom.key, label: custom.label, words: custom.extras?.words || custom.label };
  return DISMISS_REASONS.filter((r) => r.key === key)[0] || DISMISS_REASONS[DISMISS_REASONS.length - 1];
}

export function dismissReasonLabel(key, reasons = []) {
  return dismissReason(key, reasons).label;
}

export function isDismissReason(key, reasons = []) {
  return DISMISS_REASON_KEYS.includes(key) || (reasons || []).some((r) => r?.key === key && r?.is_active !== false);
}

/**
 * What goes in the customer's timeline. Says what was set aside as well as why,
 * because "No reply needed" on its own does not tell you what it was about.
 */
export function dismissNote(cardLabel, reasonKey, detail, reasons = []) {
  const reason = dismissReason(reasonKey, reasons);
  const extra = String(detail || "").trim();
  const what = String(cardLabel || "A board card").trim();
  return `${what} set aside. ${reason.words}${extra ? ` ${extra}` : ""}`;
}

export function validateDismissal(payload, reasons = []) {
  const errors = {};
  if (!isDismissReason(payload?.reason, reasons)) errors.reason = "Choose why it is being set aside.";
  // Only "Other" has to be explained. The rest say enough on their own.
  if (payload?.reason === "other" && String(payload?.detail || "").trim().length < 4) {
    errors.detail = "Say why, in a few words at least.";
  }
  if (!payload?.cat) errors.cat = "The card kind is missing.";
  if (!payload?.subjectId) errors.subjectId = "The card has nothing to set aside against.";
  return errors;
}

// One dismissal covers one card: the same subject can be set aside on the reply
// column and still be showing on the chase column, because those are two
// different jobs about the same person.
export function dismissalKey(cat, subjectId) {
  return `${cat}:${subjectId}`;
}

/**
 * Index stored dismissals for a quick lookup while the board is being built.
 *
 * @param {Array<{cat: string, subject_id: string, seen_stamp: string}>} rows
 * @returns {Map<string, string>} key → the stamp it was set aside at
 */
export function dismissalIndex(rows = []) {
  const index = new Map();
  for (const row of rows || []) {
    if (!row?.cat || !row?.subject_id) continue;
    const key = dismissalKey(row.cat, row.subject_id);
    const stamp = String(row.seen_stamp || "");
    // Keep the LATEST mark if a card has been set aside more than once, so an
    // older one cannot drag it back onto the board.
    if (!index.has(key) || stamp > index.get(key)) index.set(key, stamp);
  }
  return index;
}

/**
 * Is this card currently set aside?
 *
 * The card carries `stamp`: how current the thing it is about is. It stays off
 * the board only while that stamp has not moved past the mark. A card with no
 * stamp cannot be judged that way, so it stays set aside until somebody puts it
 * back by hand.
 */
export function isSetAside(cardRow, index) {
  if (!cardRow?.subjectId) return false;
  const mark = (index instanceof Map ? index : dismissalIndex(index)).get(
    dismissalKey(cardRow.cat, cardRow.subjectId)
  );
  if (!mark) return false;
  const stamp = String(cardRow.stamp || "");
  if (!stamp) return true;
  return stamp <= mark;
}

/** The board, minus what has been set aside, plus a count of what that was. */
export function applyDismissals(cards = [], rows = []) {
  const index = dismissalIndex(rows);
  const visible = [];
  const setAside = [];
  for (const cardRow of cards) (isSetAside(cardRow, index) ? setAside : visible).push(cardRow);
  return { cards: visible, setAside, setAsideCount: setAside.length };
}
