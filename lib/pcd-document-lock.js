// A DOCUMENT SITTING WITH A CUSTOMER MUST NOT CHANGE UNDER THEM.
//
// ── THE FAULT THIS CLOSES ────────────────────────────────────────────────────
//
// Sending a quote or a variation changed nothing about whether it could be
// edited. The quote lock only asked whether the quote had become an order, so
// "sent" was as open as "draft". Variations had the same hole: their list of
// finalised states left out "sent" and "viewed" entirely.
//
// So this was possible, and nothing anywhere recorded it:
//
//   09:14  Quote sent. The customer opens the PDF and reads $8,400.
//   11:02  Somebody edits a line. No warning. The status stays "sent".
//   11:40  The customer presses Approve, believing it is $8,400.
//          The approval is recorded against the edited quote.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
//   DRAFT      edit freely. Nobody outside has seen it.
//   REJECTED   edit freely. The customer said no, so the next version is a new
//              proposal and there is nothing of theirs to protect.
//   SENT or
//   VIEWED     SEALED. It is in front of a customer and the link they hold has
//              to keep meaning what it meant when it was sent.
//   ACCEPTED   permanent. A quote becomes an order, and from there a variation
//   or APPLIED is the only way to change the work. A variation that has been
//              approved is spent the same way: the next change is another
//              variation.
//
// ── THE WAY THROUGH ──────────────────────────────────────────────────────────
//
// Sealed is not a dead end. A customer who never received the email cannot
// approve or reject, and the work still has to move. So a sealed document can be
// pulled back to draft by an admin, deliberately, and doing that KILLS the link
// they were sent. A new code is issued and the document has to be sent again.
//
// That is the whole point. The customer can only ever approve the version they
// are currently holding, because the moment we change it, what they are holding
// stops working.
//
// Permanent is a real dead end, and correctly so. Raise a variation.

export const DRAFT = "draft";

// Archived. Not a state of the conversation with the customer at all, but it
// has to be answered here, because everything that changes a document asks this
// module first. Nothing may be edited or sent while it is out of the way, and
// the refusal says the one thing that helps: restore it.
const ARCHIVED = "archived";

// Editable with no ceremony.
const OPEN_STATES = new Set([DRAFT, "rejected"]);

// In front of a customer. Editable only by pulling it back, which voids their link.
const SEALED_STATES = new Set(["sent", "viewed"]);

// Spent. A variation is the only way forward.
const QUOTE_PERMANENT = new Set(["approved", "accepted", "cancelled"]);
const VARIATION_PERMANENT = new Set(["approved", "approved_pending_payment", "applied", "cancelled"]);

export const KINDS = {
  quote: {
    label: "quote",
    permanent: QUOTE_PERMANENT,
    // What to raise instead, once it is past the point of editing.
    forward: "This quote has been accepted. Raise a variation on the order instead.",
  },
  variation: {
    label: "variation",
    permanent: VARIATION_PERMANENT,
    forward: "This variation has already been responded to. Raise another variation instead.",
  },
};

/**
 * What may be done to this document right now.
 *
 * Returns one of:
 *   "open"       edit it, nothing to warn about
 *   "sealed"     a customer is holding it; editing needs the override
 *   "permanent"  editing is over; the next change is a new document
 */
export function editability(kind, status) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`Unknown document kind: ${kind}`);
  const state = String(status || DRAFT).trim().toLowerCase();
  if (state === ARCHIVED) return "archived";
  if (spec.permanent.has(state)) return "permanent";
  if (SEALED_STATES.has(state)) return "sealed";
  if (OPEN_STATES.has(state)) return "open";
  // An unrecognised status is treated as sealed rather than open. A status
  // nobody anticipated must not be a way past the rule.
  return "sealed";
}

export function isOpen(kind, status) {
  return editability(kind, status) === "open";
}

/**
 * The refusal, worded so the person reading it knows what to do next.
 *
 * `status` is carried on the error so a screen can tell "sealed, offer the
 * override" from "permanent, do not offer it" without parsing the sentence.
 */
export function lockError(kind, status) {
  const spec = KINDS[kind];
  const state = editability(kind, status);
  if (state === "open") return null;

  const error = new Error(
    state === "archived"
      ? `This ${spec.label} is archived. Restore it before changing anything on it.`
      : state === "permanent"
        ? spec.forward
        : `This ${spec.label} has been sent to the customer and cannot be edited while they hold it. ` +
          `Use the admin override to pull it back to draft, which cancels the link they were sent.`
  );
  error.status = 409;
  error.lockState = state;
  error.documentKind = kind;
  error.canOverride = state === "sealed";
  return error;
}

/**
 * Throws unless the document is open for editing.
 *
 * Called by every route that changes what a quote or a variation says, so a
 * route added later inherits the rule rather than having to remember it.
 */
export function assertOpenForEditing(kind, status) {
  const error = lockError(kind, status);
  if (error) throw error;
}

/**
 * May this document be sent, or sent again?
 *
 * Re-sending a draft, a sent or a viewed document is ordinary: the customer lost
 * the email, or it went to the wrong address. Nothing about the document changes.
 *
 * Sending one the customer has already ANSWERED is not ordinary. Both send
 * routes wrote `status: "sent"` unconditionally, so re-sending an approved quote
 * quietly reverted it to awaiting a response, leaving the approval stranded in
 * the history against a quote that no longer read as approved. On a variation it
 * was worse: an applied variation had already rewritten the order, and sending
 * it again put it back in front of the customer as though it were pending.
 */
export function assertSendable(kind, status) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`Unknown document kind: ${kind}`);
  const state = editability(kind, status);
  if (state !== "permanent" && state !== "archived") return;

  const error = new Error(
    state === "archived"
      ? `This ${spec.label} is archived. Restore it before sending it.`
      : `This ${spec.label} has already been responded to and cannot be sent again. ${spec.forward}`
  );
  error.status = 409;
  error.lockState = state;
  error.canOverride = false;
  throw error;
}

/**
 * The words the override modal has to say before anybody presses it.
 *
 * Kept here rather than in the screen so the quote and the variation cannot
 * drift into describing the same action two different ways, and so a test can
 * assert that the consequence is actually spelled out.
 */
export function overrideWarning(kind, { documentNumber = "", sentAt = null } = {}) {
  const spec = KINDS[kind];
  const name = documentNumber ? `${documentNumber}` : `this ${spec.label}`;
  const when = sentAt
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(
        new Date(sentAt)
      )
    : null;
  return {
    title: "Admin override",
    lede: when
      ? `${name} was sent to the customer on ${when} and is waiting on their answer.`
      : `${name} has been sent to the customer and is waiting on their answer.`,
    consequences: [
      `The link the customer was sent will stop working immediately. If they open it, they will not be able to approve or reject.`,
      `${name} goes back to draft, so it will not appear as awaiting a customer response.`,
      // Said explicitly because the override cannot reach into their inbox. The
      // link dies; the attachment does not. Somebody working from the old PDF
      // will quote figures that are no longer real, and the person pressing this
      // button is the one who can ring them.
      `The customer may still have the PDF from the last email. Tell them the figures have changed.`,
      `You will need to send it again once you have finished editing.`,
      `This is recorded against the ${spec.label} with your name and the reason you give.`,
    ],
    // A reason is required rather than optional. The whole value of the override
    // is the record it leaves, and an override with no reason recorded is the
    // silent edit this was built to stop.
    reasonRequired: true,
    reasonPlaceholder: "e.g. Customer says the email never arrived and asked us to change the door colour",
    confirmLabel: "Override and edit",
  };
}

/**
 * The patch that pulls a sealed document back to draft.
 *
 * The new access code is what makes this safe: the link the customer holds
 * stops resolving, so they cannot approve a version that is being edited. The
 * caller supplies it, because generating it belongs with the rest of that
 * table's writes.
 */
export function pullBackToDraftPatch(kind, newAccessCode) {
  if (!newAccessCode) throw new Error("An override has to issue a new access code, or the old link stays live.");
  const common = {
    status: DRAFT,
    access_code: newAccessCode,
    sent_at: null,
    viewed_at: null,
  };
  // A rejection that has been overridden is no longer a rejection awaiting
  // anything, and leaving the timestamp makes the history read as though the
  // customer rejected this version.
  return kind === "variation" ? { ...common, rejected_at: null } : { ...common, rejected_at: null };
}
