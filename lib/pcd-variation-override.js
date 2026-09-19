// APPROVING A VARIATION WITHOUT THE CUSTOMER, AND THE NARROW GATE IT GOES THROUGH.
//
// ── WHY THERE IS A GATE AT ALL ───────────────────────────────────────────────
//
// A customer approving a variation is the whole mechanism by which an order
// changes: they are shown what is being added, removed or repriced, and the
// order only moves when they say yes. An admin approval skips that, which is
// sometimes exactly right (the change was agreed on site, the customer will
// never open the link) and is otherwise a way to rewrite somebody's job and
// their bill without asking them.
//
// So the override is not a general purpose approve button. It covers ONE case:
// a piece has to be made to a different size than the order says, at the price
// the order already says. Nothing else.
//
// ── WHAT IS ALLOWED ──────────────────────────────────────────────────────────
//
// Every line on the variation must be a CHANGE to a line that is already on the
// order, and the only thing it may change is the size. Height, width, and
// nothing else.
//
// ── WHAT IS NOT, AND WHY EACH ONE ────────────────────────────────────────────
//
//   adding a panel      new work at a new price. The customer would be paying
//                       for something they have not seen.
//   removing a panel    something they ordered is not being made.
//   changing quantity   fewer or more of a thing, which is the price again.
//   changing the spec   a different colour, profile, edge, material, thickness
//                       or hinge boring is a different product. The size of a
//                       door is a measurement; its colour is a decision.
//   price adjustments   money, by definition.
//   job costs           money, by definition.
//
// All of those go the way they always did: send it, the customer reads it, the
// customer answers.
//
// ── WHY THE PRICE IS HELD, AND WHY THAT IS NOT A LOOPHOLE ────────────────────
//
// Normally a change line reprices the order line it lands on, and the order
// total moves with it. Under the override it does not: the line keeps the price
// it already had, whichever direction the size went.
//
// That is what makes the whole thing safe to do without asking. Because no
// price moves:
//
//   the order total is untouched, so the balance owing is still right
//   no deposit top up can arise, so nothing is owed that nobody requested
//   the line items still sum to the order subtotal, so the tax invoice still
//     reconciles. See lib/pcd-tax-invoice.js, which checks exactly that.
//   the customer's bill is the bill they agreed to
//
// A size change that would have cost more is work given away. A size change
// that would have cost less is money kept. Both are recorded: the variation
// keeps its own figures, so what the change WOULD have come to is always
// readable, next to the name of whoever decided not to charge it.

import { toNumber } from "./pcd-quote-utils";

/**
 * The spec fields that must be IDENTICAL on both sides.
 *
 * Deliberately a list of what must match rather than a list of what may differ.
 * A column added next year is compared by default, which is the safe direction:
 * a new field nobody has thought about blocks the override instead of silently
 * riding through it.
 *
 * Height and width are absent, because they are the point. Free text is absent
 * too: notes and description reach the workshop and the customer's copy, but
 * they cost nothing, and a variation explaining itself in its own note is the
 * normal case rather than an abuse of one.
 */
export const SPEC_FIELDS_THAT_MUST_MATCH = [
  "product_type",
  "material",
  "supplier_name",
  "thickness",
  "finish",
  "colour",
  "profile_type",
  "profile",
  "edge_mould",
  "cabinet_brand",
  "panel_use",
  "hole_type",
  "edge_finish",
  "grain_direction",
  "supplied_by",
  "hardware_type",
  "hinge_holes",
  "hinge_qty",
  "hinge_side",
  "hinge_from_bottom_mm",
  "hinge_from_top_mm",
];

/** How each field reads when it has to be named in a refusal. */
const FIELD_LABELS = {
  product_type: "the item type",
  material: "the material",
  supplier_name: "the supplier",
  thickness: "the thickness",
  finish: "the finish",
  colour: "the colour",
  profile_type: "the profile type",
  profile: "the profile",
  edge_mould: "the edge",
  cabinet_brand: "the cabinet brand",
  panel_use: "what the panel is for",
  hole_type: "the boring",
  edge_finish: "the edge finish",
  grain_direction: "the grain direction",
  supplied_by: "who supplies it",
  hardware_type: "the hardware type",
  hinge_holes: "the hinge drilling",
  hinge_qty: "the number of hinges",
  hinge_side: "the hinge side",
  hinge_from_bottom_mm: "the bottom hinge position",
  hinge_from_top_mm: "the top hinge position",
  banded_edges: "the banded edges",
  qty: "the quantity",
};

/**
 * Are these two the same answer?
 *
 * Blank, null and undefined are one answer, not three, because a variation line
 * that was never asked a question carries undefined where the order line
 * carries an empty string. Treating those as different would block every
 * override on a difference nobody made.
 */
function sameValue(left, right) {
  const blankLeft = left === null || left === undefined || String(left).trim() === "";
  const blankRight = right === null || right === undefined || String(right).trim() === "";
  if (blankLeft && blankRight) return true;
  if (blankLeft !== blankRight) return false;
  if (typeof left === "boolean" || typeof right === "boolean") return Boolean(left) === Boolean(right);
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  return String(left).trim() === String(right).trim();
}

/** Two banded edge lists, order ignored. Edges are a set, not a sequence. */
function sameEdges(left, right) {
  const clean = (value) =>
    (Array.isArray(value) ? value : [])
      .map((edge) => String(edge || "").trim().toLowerCase())
      .filter(Boolean)
      .sort();
  const a = clean(left);
  const b = clean(right);
  return a.length === b.length && a.every((edge, index) => edge === b[index]);
}

/** A size in the words the business writes it in. Height before width, always. */
export function sizeWords(height, width) {
  const h = toNumber(height);
  const w = toNumber(width);
  if (!h && !w) return "no size";
  return `${h || "?"} x ${w || "?"}mm`;
}

/**
 * What is wrong with ONE line, as reasons a person can read. Empty means fine.
 *
 * @param line       a pcd_order_variation_lines row
 * @param orderLine  the pcd_order_line_items row it points at, or null
 */
export function lineOverrideProblems(line = {}, orderLine = null) {
  const problems = [];
  const action = String(line.action || "").trim();

  if (action !== "change") {
    problems.push(
      action === "add"
        ? "adds a new item"
        : action === "remove"
          ? "removes an item from the order"
          : action === "price_adjustment"
            ? "is a price adjustment"
            : action === "job_cost"
              ? "changes a job cost"
              : `is a ${action || "line with no action"}`
    );
    return problems;
  }

  if (!line.order_line_item_id) {
    problems.push("is not attached to a line on the order");
    return problems;
  }
  if (!orderLine) {
    problems.push("points at a line that is no longer on the order");
    return problems;
  }

  // The size has to actually change, or this is not a size variation and there
  // was nothing here that needed a variation at all.
  const sizeMoved =
    !sameValue(line.height_mm, orderLine.height_mm) || !sameValue(line.width_mm, orderLine.width_mm);

  for (const field of SPEC_FIELDS_THAT_MUST_MATCH) {
    if (!sameValue(line[field], orderLine[field])) {
      problems.push(`changes ${FIELD_LABELS[field] || field}`);
    }
  }
  if (!sameValue(line.qty ?? 1, orderLine.qty ?? 1)) {
    problems.push(`changes ${FIELD_LABELS.qty}`);
  }
  // Only compared when the variation line actually carries a list. lineAnswers
  // leaves the column out otherwise, and an absent answer is not a changed one.
  if (Array.isArray(line.banded_edges) && !sameEdges(line.banded_edges, orderLine.banded_edges)) {
    problems.push(`changes ${FIELD_LABELS.banded_edges}`);
  }

  if (!problems.length && !sizeMoved) {
    problems.push("changes nothing about the size");
  }

  return problems;
}

/**
 * Can this whole variation be approved by an admin?
 *
 * Returns { ok, reasons, changes }. The reasons are written to be printed
 * straight onto the screen, one per failing line, each naming the line so
 * somebody can go and look at it. The changes are the size moves themselves, so
 * the modal can show exactly what is about to happen before anybody confirms.
 *
 * @param lines       pcd_order_variation_lines rows
 * @param orderLines  pcd_order_line_items rows for the same order
 */
export function overrideApprovalEligibility(lines = [], orderLines = []) {
  const byId = new Map((orderLines || []).map((row) => [row.id, row]));
  const rows = (lines || []).filter(Boolean);

  if (!rows.length) {
    return { ok: false, reasons: ["This variation has no lines on it."], changes: [] };
  }

  const reasons = [];
  const changes = [];

  rows.forEach((line, index) => {
    const orderLine = line.order_line_item_id ? byId.get(line.order_line_item_id) || null : null;
    const problems = lineOverrideProblems(line, orderLine);
    const name = String(line.title || line.product_type || `Line ${index + 1}`).trim();
    if (problems.length) {
      problems.forEach((problem) => reasons.push(`${name} ${problem}.`));
      return;
    }
    changes.push({
      variation_line_id: line.id,
      order_line_item_id: line.order_line_item_id,
      title: name,
      qty: toNumber(orderLine.qty) || 1,
      from: sizeWords(orderLine.height_mm, orderLine.width_mm),
      to: sizeWords(line.height_mm, line.width_mm),
      // What the line is worth and stays worth. Shown so nobody has to take it
      // on trust that the override leaves the money alone.
      held_line_total_ex_gst: toNumber(orderLine.line_total_ex_gst),
    });
  });

  return { ok: reasons.length === 0, reasons, changes };
}

/**
 * The one line that explains the refusal, when there is one.
 *
 * Written once here rather than left to each caller, so the route and the
 * screen say the same thing and neither invents a shorter version of the rule.
 */
export const OVERRIDE_RULE_SENTENCE =
  "An admin approval can only change the size of items already on the order, at the price the order " +
  "already holds. Anything added, removed, repriced, or changed in quantity or specification has to be " +
  "approved by the customer.";
