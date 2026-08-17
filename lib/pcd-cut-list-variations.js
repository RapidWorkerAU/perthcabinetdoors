// Variation state for a production cut list.
//
// An applied variation has already rewritten pcd_order_line_items, so its work
// is live: those cuts are real and belong in the count. A variation the
// customer has not settled yet has written nothing to the order, so the only
// way the bench can see it coming is to read the variation lines directly and
// flag the order lines they point at. Nothing pending is ever counted, and a
// piece proposed by a pending variation is listed separately rather than
// folded into the cut rows.

import { formatItemSpecs } from "./pcd-quote-utils.js";

// Live but not yet written into the order. "approved" sits here too: until the
// variation is applied the order lines still hold the old specs, so cutting to
// it would be cutting to a size the order does not have yet.
export const PENDING_VARIATION_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "approved",
  "approved_pending_payment",
];

export const CUT_LIST_STATES = {
  approved: "approved",
  hold: "hold",
  removal: "removal",
};

function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-AU");
}

function variationName(variation) {
  return variation?.variation_number || "variation";
}

function statusWords(variation) {
  const status = variation?.status || "draft";
  if (status === "sent" || status === "viewed") {
    const sent = shortDate(variation?.sent_at);
    return sent ? `sent ${sent}` : "sent to the customer";
  }
  if (status === "approved" || status === "approved_pending_payment") {
    const approved = shortDate(variation?.approved_at);
    return approved ? `approved ${approved}, not yet applied` : "approved, not yet applied";
  }
  return "still a draft";
}

/**
 * Indexes the variations of an order so each cut list row can be annotated in
 * one pass. Rejected and cancelled variations are dropped: they will never
 * touch the order, so the bench does not need to hear about them.
 */
export function buildVariationContext({ variations = [], variationLines = [] } = {}) {
  const byId = new Map((variations || []).map((variation) => [variation.id, variation]));
  const pendingIds = new Set(
    (variations || [])
      .filter((variation) => PENDING_VARIATION_STATUSES.includes(variation.status))
      .map((variation) => variation.id)
  );

  const pendingByItemId = new Map();
  const appliedByItemId = new Map();
  const proposedAdditions = [];

  (variationLines || []).forEach((line) => {
    const variation = byId.get(line.variation_id);
    if (!variation) return;

    if (pendingIds.has(variation.id)) {
      if (line.action === "add") {
        proposedAdditions.push({ line, variation });
        return;
      }
      if (!line.order_line_item_id) return;
      pendingByItemId.set(line.order_line_item_id, { line, variation });
      return;
    }

    if (variation.status === "applied" && line.order_line_item_id) {
      appliedByItemId.set(line.order_line_item_id, { line, variation });
    }
  });

  return {
    byId,
    pendingByItemId,
    appliedByItemId,
    proposedAdditions,
    pendingCount: pendingIds.size,
  };
}

/**
 * The flag and the explanation for one order line. Returns null when no
 * variation has touched it, which is the common case.
 *
 * A pending variation outranks an applied one on the same line: what the bench
 * needs to know is "do not cut this yet", even if an earlier variation already
 * changed it.
 */
export function variationStateForItem(item, context) {
  if (!item || !context) return null;

  const pending = context.pendingByItemId.get(item.id);
  if (pending) {
    const { line, variation } = pending;
    const name = variationName(variation);
    // The lead is which variation and where it is up to, and it is set in bold
    // on the sheet. The body is what that means for this piece. Splitting them
    // means the fact carries at a glance and the detail is there to read.
    const lead = `Pending variation ${name}, ${statusWords(variation)}.`;
    if (line.action === "remove") {
      return {
        state: CUT_LIST_STATES.removal,
        flag: `Removal pending, ${name}`,
        note: {
          lead,
          body: "The customer has asked to drop this piece. Hold until the variation is approved or declined.",
        },
      };
    }
    const proposed = formatItemSpecs(line, { includeQty: true });
    return {
      state: CUT_LIST_STATES.hold,
      flag: `Hold, ${name}`,
      note: {
        lead,
        body: [
          proposed ? `Proposed: ${proposed}.` : "",
          "Do not cut until the variation is approved.",
        ].filter(Boolean).join(" "),
      },
    };
  }

  if (!item.variation_id) return null;
  const variation = context.byId.get(item.variation_id);
  if (!variation || variation.status !== "applied") return null;

  const name = variationName(variation);
  const applied = shortDate(variation.applied_at);
  const stamp = applied ? `Approved variation ${name}, applied ${applied}.` : `Approved variation ${name}.`;

  if (item.variation_status === "added") {
    return {
      state: CUT_LIST_STATES.approved,
      flag: `Added, ${name}`,
      note: { lead: stamp, body: "New piece added by the variation. It was not on the original order." },
    };
  }

  if (item.variation_status === "changed") {
    const before = formatItemSpecs(context.appliedByItemId.get(item.id)?.line?.original_item_snapshot, { includeQty: true });
    return {
      state: CUT_LIST_STATES.approved,
      flag: `Changed, ${name}`,
      note: {
        lead: stamp,
        body: [before ? `Was ${before}.` : "", "Cut to the specification on this row."].filter(Boolean).join(" "),
      },
    };
  }

  return null;
}

/**
 * What a piece's labels have to say, which is more than the sheet needs.
 *
 * The sheet marks a row. A label has to be stuck to timber, so a changed piece
 * needs two of them: what it was and what it is now. Which of those two may be
 * cut depends entirely on whether the variation is settled.
 *
 * Returns null when no variation touches the piece.
 */
export function labelVariationForItem(item, context) {
  if (!item || !context) return null;

  const pending = context.pendingByItemId.get(item.id);
  if (pending) {
    const { line, variation } = pending;
    const name = variationName(variation);
    if (line.action === "remove") {
      return { kind: "removal-proposed", variation: name };
    }
    // Nothing is decided, so neither label is cuttable: cutting the current
    // specification scraps the piece if the customer approves, and cutting the
    // proposed one scraps it if they decline.
    return { kind: "changed-proposed", variation: name, proposed: line };
  }

  if (!item.variation_id) return null;
  const variation = context.byId.get(item.variation_id);
  if (!variation || variation.status !== "applied") return null;

  const name = variationName(variation);
  if (item.variation_status === "added") return { kind: "added", variation: name };
  if (item.variation_status === "changed") {
    return {
      kind: "changed",
      variation: name,
      // The decision is made, so the old label is dead and the new one is the
      // work. The snapshot is what the piece was before the variation applied.
      was: context.appliedByItemId.get(item.id)?.line?.original_item_snapshot || null,
    };
  }
  return null;
}

/**
 * Pieces a pending variation wants to add. They are not order lines yet, so
 * they carry no quantity into the totals, but they still print as rows at the
 * end of the cut list carrying the same hold marking as any other pending
 * line. The bench needs to see the whole of what is coming, and a piece
 * described only in a footnote is a piece nobody reads.
 */
export function proposedAdditionFlag(variation) {
  return `Proposed, ${variationName(variation)}`;
}

export function proposedAdditionNote(variation) {
  return {
    lead: `Proposed on pending variation ${variationName(variation)}, ${statusWords(variation)}.`,
    body: "Not part of the cut count and not to be cut until the variation is approved.",
  };
}
