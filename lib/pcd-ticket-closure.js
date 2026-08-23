// Closing an email conversation.
//
// WHAT CLOSING IS. Not a dismiss button. It draws a line in time: everything
// before it is settled, and a new inbound email reopens the ticket by itself,
// which the mail sync already does. A thread that went quiet a year ago leaves
// the board, and the same customer writing next month brings it straight back.
//
// WHY A NOTE. The reason lives as a note on the conversation rather than a
// column, so it shows in the desk timeline beside everything else that
// happened, and a ticket closed twice keeps both stories.

export const CLOSURE_REASONS = [
  { key: "spam", label: "Spam", words: "Spam or junk." },
  { key: "no_reply_needed", label: "No reply needed", words: "Nothing to answer." },
  { key: "answered_by_phone", label: "Answered by phone", words: "Handled on the phone." },
  { key: "other", label: "Other", words: "No reply needed." },
];

export const CLOSURE_REASON_KEYS = CLOSURE_REASONS.map((r) => r.key);

export function closureReasonLabel(key) {
  const found = CLOSURE_REASONS.filter((r) => r.key === key)[0];
  return found ? found.label : "Other";
}

export function isClosureReason(key) {
  return CLOSURE_REASON_KEYS.includes(key);
}

// A note is us writing to ourselves, not an answer. Counting one as a reply
// would clear a card off the board without anybody having answered, so
// whose-turn-is-it only ever looks at what was really sent or received.
export function countsAsReply(direction) {
  return direction === "inbound" || direction === "outbound";
}

export function lastRealDirection(messages) {
  const real = (messages || [])
    .filter((m) => countsAsReply(m.direction))
    .slice()
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return real.length ? real[0].direction : null;
}

// Whether a ticket is waiting on us: it is open, and the last thing that
// actually passed between us was theirs.
export function needsReply(ticket, messages) {
  if (!ticket || ticket.status === "closed") return false;
  return lastRealDirection(messages) === "inbound";
}

// What the closure note says. Written in the words somebody would use, with the
// free text kept when there is any, because "Other" on its own explains nothing.
export function closureNote(reasonKey, detail) {
  const reason = CLOSURE_REASONS.filter((r) => r.key === reasonKey)[0] || CLOSURE_REASONS[CLOSURE_REASONS.length - 1];
  const extra = String(detail || "").trim();
  return `Conversation closed. ${reason.words}${extra ? ` ${extra}` : ""}`;
}

export function validateClosure(payload) {
  const errors = {};
  if (!isClosureReason(payload?.reason)) errors.reason = "Choose why it is being closed.";
  // Only "Other" has to be explained. The rest say enough on their own.
  if (payload?.reason === "other" && String(payload?.detail || "").trim().length < 4) {
    errors.detail = "Say why, in a few words at least.";
  }
  return errors;
}
