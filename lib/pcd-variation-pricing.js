// WHETHER A VARIATION LINE HAS A PRICE, asked in one place.
//
// ── THE FAULT THIS EXISTS TO FIX ─────────────────────────────────────────────
//
// This question was answered in three files, by two different rules, and they
// disagreed with each other.
//
// Saving a line allowed a hand-typed unit cost and left the board rate at zero,
// which is right: not every price comes off a board. Sending the variation then
// read the board rate, found the zero, and refused with "uses a board without an
// uploaded price". The board was never the problem. The line had a price, the
// save had accepted it, and the last step in the process rejected work that
// every earlier step had allowed, using a message that pointed at the wrong
// thing entirely. There was no way forward and no way to tell why.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// A line is priced if it has a price. Either one will do:
//
//   a board rate      unit_cost_per_sqm_ex_gst, from the colour library
//   a unit cost       product_unit_cost_ex_gst, typed by a person or calculated
//
// Requiring BOTH is what caused the dead end, because a hand-priced line only
// ever has the second.
//
// ── WHY NOTHING HERE BLOCKS ──────────────────────────────────────────────────
//
// What comes back is a WARNING, not a verdict. Whoever is sending the variation
// is the person responsible for it being right, and they can see the line. A
// missing cost affects our margin, not what the customer is charged: the price
// is a separate number and it is already on the line. Refusing to send is a
// worse outcome than sending with an unknown cost, because the customer is then
// waiting on us for a document nobody can release.
//
// So the caller's job is to SAY what is unpriced and let the person decide. See
// the send route, which returns needsConfirmation and accepts force, the same
// pattern the design importer uses for its warnings.

function hasValue(value) {
  return String(value ?? "").trim() !== "";
}

function amount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

/**
 * A line priced off a sheet of board, by area.
 *
 * Hardware is bought as a unit, and a cabinet is priced from its cut list, so
 * neither has a board rate and neither is missing one.
 */
export function isBoardPricedLine(line = {}) {
  return !["Hardware", "base_cabinet"].includes(line.product_type) && hasValue(line.material);
}

/**
 * Does this line have a cost recorded, by any route?
 */
export function hasAnyCost(line = {}) {
  return amount(line.unit_cost_per_sqm_ex_gst) > 0 || amount(line.product_unit_cost_ex_gst) > 0;
}

/**
 * Lines worth mentioning before the variation goes to the customer.
 *
 * Only "add" and "change" put new work on the order. A removal has nothing to
 * price and a price adjustment IS the price.
 *
 * Returns [{ id, label, reason }]. An empty list means nothing to mention.
 */
export function unpricedVariationLines(lines = []) {
  return (lines || [])
    .filter((line) => ["add", "change"].includes(line.action))
    .filter(isBoardPricedLine)
    .filter((line) => !hasAnyCost(line))
    .map((line) => ({
      id: line.id,
      label: line.title || line.product_type || "Variation item",
      reason: "no cost recorded, so we cannot tell what this line makes",
    }));
}

/**
 * One sentence naming what is unpriced, for a warning the sender can act on.
 *
 * Says what it means for the business rather than just that a field is empty,
 * and says plainly that it does not stop the send.
 */
export function unpricedWarning(unpriced = []) {
  if (!unpriced.length) return "";
  const names = unpriced.map((entry) => `"${entry.label}"`);
  const list = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  const plural = unpriced.length === 1 ? "line has" : "lines have";
  return (
    `${unpriced.length} ${plural} no cost recorded (${list}), so the margin on this variation is unknown. ` +
    `The customer's price is not affected. Send anyway, or add the costs first.`
  );
}
