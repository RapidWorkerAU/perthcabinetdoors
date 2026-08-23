// WHAT DID THIS ORDER LOOK LIKE AFTER EACH VARIATION?
//
// ── WHAT WAS ALREADY CAPTURED, AND WHAT WAS NOT ──────────────────────────────
//
// Per changed or removed line, a full before-state is stored on the variation
// line as original_item_snapshot: title, material, thickness, colour, finish,
// profile, edge, sizes, quantity and the line total. That has always been there
// and it is genuinely complete for the lines a variation touched.
//
// What did NOT exist is the thing that makes it usable: a way to see the WHOLE
// order as it stood at each version. Five variations left five sets of
// per-line before-states with nothing joining them up, so answering "what was
// the customer actually agreed to in March" meant reading variation lines by
// hand and holding the order in your head.
//
// This builds that. Nothing new is stored: the order's current lines plus every
// variation's before-states are enough to walk backwards, because a snapshot of
// what a line WAS is exactly what you need to undo the change.
//
// ── HOW THE WALK WORKS ───────────────────────────────────────────────────────
//
// Start from the order as it is now and rewind, newest variation first:
//
//   a line the variation ADDED      remove it, it did not exist before
//   a line the variation CHANGED    put its before-state back
//   a line the variation REMOVED    put it back, it was still there before
//
// After rewinding variation N you are holding the order as it stood immediately
// before N was applied, which is the same thing as immediately after N-1.
//
// ── WHY THIS AND NOT A STORED SNAPSHOT ───────────────────────────────────────
//
// A stored whole-order snapshot per variation would be simpler to read and
// worse to trust: it would be a second copy of the truth, written at one moment,
// free to disagree with the lines themselves. Deriving it means the history can
// never contradict the order, because it is made of the order.

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

/** Only variations that actually reached the order. */
export function appliedVariations(variations) {
  // Null, not undefined, is what arrives while the order is still loading, and a
  // parameter default does not catch it.
  return (Array.isArray(variations) ? variations : [])
    .filter((variation) => ["approved", "approved_pending_payment", "applied"].includes(variation.status))
    .sort((a, b) => {
      const at = new Date(a.applied_at || a.approved_at || a.created_at || 0).getTime();
      const bt = new Date(b.applied_at || b.approved_at || b.created_at || 0).getTime();
      return at - bt;
    });
}

/**
 * One step backwards: the order as it stood BEFORE this variation applied.
 *
 * `lines` is the order as it stood after. Returns a new array; nothing is
 * mutated, so a caller can keep every step.
 */
export function rewindVariation(lines, variationLines, variationId = null) {
  const byOrderLineId = new Map();

  (Array.isArray(variationLines) ? variationLines : []).forEach((vLine) => {
    if (["change", "remove"].includes(vLine.action) && vLine.order_line_item_id) {
      byOrderLineId.set(vLine.order_line_item_id, vLine);
    }
  });

  const rewound = [];
  for (const line of lines || []) {
    const vLine = byOrderLineId.get(line.id);

    // Added by THIS variation, so before it the line simply was not there.
    //
    // Matched on the variation's own id, not merely on "was added by something".
    // An order with several variations carries lines added by each of them, and
    // rewinding one must not delete another's work.
    if (line.variation_status === "added" && variationId && line.variation_id === variationId) {
      continue;
    }

    if (!vLine) {
      rewound.push(line);
      continue;
    }

    const snapshot = vLine.original_item_snapshot;
    if (!snapshot) {
      // No before-state recorded, which happens on lines written before the
      // snapshot column existed. Keeping the line as it is now and SAYING SO is
      // the only honest option: silently presenting the current state as the
      // historical one is how a wrong history becomes a confident one.
      rewound.push({ ...line, history_unknown: true });
      continue;
    }

    rewound.push({
      ...line,
      ...snapshot,
      // The snapshot carries the line's own id; keep the order line's identity
      // so the row still lines up with everything else.
      id: line.id,
      variation_id: null,
      variation_status: null,
      removed_by_variation_id: null,
      line_total_ex_gst: money(snapshot.line_total_ex_gst),
    });
  }

  return rewound;
}

/**
 * Every version of this order, oldest first.
 *
 * Returns [{ key, label, variation, lines, total, changes }] where version 0 is
 * the order as accepted and each later entry is the order after one variation.
 *
 * `changes` says what that variation did in words, so a version can be read
 * without diffing it against its neighbour by eye.
 */
export function orderVersions(input = {}) {
  // Defaults in the signature only apply to `undefined`. This runs before the
  // order has loaded, where every one of these is genuinely `null`, so a
  // destructuring default would let a null straight through and the first
  // property read would throw. Normalised here instead, once, so no caller has
  // to remember to pass empties while its data is still arriving.
  const order = input?.order || {};
  const lines = Array.isArray(input?.lines) ? input.lines : [];
  const variations = Array.isArray(input?.variations) ? input.variations : [];
  const variationLinesByVariationId =
    input?.variationLinesByVariationId instanceof Map ? input.variationLinesByVariationId : new Map();

  const applied = appliedVariations(variations);

  // Walk backwards from now, collecting the state before each variation.
  const states = [lines];
  for (let index = applied.length - 1; index >= 0; index -= 1) {
    const variation = applied[index];
    const vLines = variationLinesByVariationId.get(variation.id) || [];
    states.unshift(rewindVariation(states[0], vLines, variation.id));
  }
  // states[0] is the order as accepted; states[n] is after variation n.

  const versions = [
    {
      key: "accepted",
      label: "As accepted",
      subtitle: order.order_number ? `Order ${order.order_number} raised` : "Order raised",
      at: order.accepted_at || order.created_at || null,
      variation: null,
      lines: states[0],
      total: sumLines(states[0]),
      changes: [],
    },
  ];

  applied.forEach((variation, index) => {
    const vLines = variationLinesByVariationId.get(variation.id) || [];
    versions.push({
      key: variation.id,
      label: variation.variation_number || `Variation ${index + 1}`,
      subtitle: variation.title || "Order variation",
      at: variation.applied_at || variation.approved_at || null,
      variation,
      lines: states[index + 1],
      total: sumLines(states[index + 1]),
      changes: describeVariation(vLines),
    });
  });

  return versions;
}

function sumLines(lines = []) {
  return (lines || [])
    .filter((line) => line.variation_status !== "removed")
    .reduce((total, line) => total + money(line.line_total_ex_gst), 0);
}

/** What a field was called on screen, so a change reads as a sentence. */
const FIELD_LABELS = {
  title: "Item",
  description: "Description",
  product_type: "Type",
  material: "Material",
  supplier_name: "Brand",
  thickness: "Thickness",
  colour: "Colour",
  finish: "Finish",
  profile_type: "Profile type",
  profile: "Profile",
  edge_mould: "Edge",
  height_mm: "Height",
  width_mm: "Width",
  qty: "Quantity",
  line_total_ex_gst: "Line total",
};

// Height before width, everywhere.
const COMPARED = [
  "title",
  "product_type",
  "material",
  "supplier_name",
  "thickness",
  "colour",
  "finish",
  "profile_type",
  "profile",
  "edge_mould",
  "height_mm",
  "width_mm",
  "qty",
  "line_total_ex_gst",
];

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * What one variation did, line by line and field by field.
 *
 * A change lists only the fields that actually moved, because "this line
 * changed" is not traceability. Knowing it was the colour and not the size is.
 */
export function describeVariation(variationLines) {
  return (Array.isArray(variationLines) ? variationLines : [])
    .filter((vLine) => vLine.action !== "job_cost")
    .map((vLine) => {
      const label = vLine.title || vLine.product_type || "Item";

      if (vLine.action === "add") {
        return { action: "add", label, summary: `Added ${label}`, fields: [] };
      }
      if (vLine.action === "remove") {
        return { action: "remove", label, summary: `Removed ${label}`, fields: [] };
      }
      if (vLine.action === "price_adjustment") {
        return { action: "price_adjustment", label, summary: `Price adjustment: ${label}`, fields: [] };
      }

      const before = vLine.original_item_snapshot;
      if (!before) {
        return {
          action: "change",
          label,
          summary: `Changed ${label}`,
          fields: [],
          // Said rather than hidden. A change with no recorded before-state can
          // be shown as having happened but not as having a known shape.
          unknownBefore: true,
        };
      }

      const fields = COMPARED.filter((field) => {
        const was = field === "line_total_ex_gst" ? money(before[field]) : text(before[field]);
        const now =
          field === "line_total_ex_gst" ? money(vLine.proposed_line_total_ex_gst) : text(vLine[field]);
        return was !== now;
      }).map((field) => ({
        field,
        label: FIELD_LABELS[field] || field,
        from: field === "line_total_ex_gst" ? money(before[field]) : text(before[field]),
        to: field === "line_total_ex_gst" ? money(vLine.proposed_line_total_ex_gst) : text(vLine[field]),
      }));

      return {
        action: "change",
        label,
        summary: fields.length
          ? `${label}: ${fields.map((f) => f.label.toLowerCase()).join(", ")}`
          : `Changed ${label}`,
        fields,
      };
    });
}

/**
 * Anything in this history we cannot vouch for.
 *
 * Returned so a screen can say so out loud. A gap presented as a fact is worse
 * than a gap presented as a gap.
 */
export function historyGaps(versions) {
  const gaps = [];
  (Array.isArray(versions) ? versions : []).forEach((version) => {
    const unknownLines = (version.lines || []).filter((line) => line.history_unknown).length;
    if (unknownLines) {
      gaps.push({
        version: version.label,
        reason: `${unknownLines} line${unknownLines === 1 ? "" : "s"} had no before-state recorded, so this version shows them as they are now.`,
      });
    }
    (version.changes || []).forEach((change) => {
      if (change.unknownBefore) {
        gaps.push({ version: version.label, reason: `"${change.label}" changed, but what it was beforehand was not recorded.` });
      }
    });
  });
  return gaps;
}
