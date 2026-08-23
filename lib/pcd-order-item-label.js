// TELLING ONE ORDER LINE FROM ANOTHER.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// The variation form's "which item are you changing" dropdown labelled every
// option with its title, material and colour. On a real order that is eight rows
// all reading "Door - Decorative Board - Amaro", because that is what a kitchen
// of matching doors IS. There was nothing to pick between them, so choosing the
// right one was guesswork, and varying the wrong door is a wrong door made.
//
// ── WHAT ACTUALLY IDENTIFIES A LINE ──────────────────────────────────────────
//
// Its position on the order, its size, and which cabinet it belongs to. Those
// are the three things that differ between otherwise identical pieces, and the
// size is usually the one somebody is reading off a drawing.
//
// Height before width, as everywhere in this system.

function text(value) {
  return String(value ?? "").trim();
}

function mm(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** "720 x 397mm", or nothing when the line has no size of its own. */
export function itemSizeLabel(item = {}) {
  const height = mm(item.height_mm);
  const width = mm(item.width_mm);
  if (!height && !width) return "";
  return `${height || "?"} x ${width || "?"}mm`;
}

/** A cabinet is a line with a panel list, or one typed as a cabinet. */
export function isCabinetLine(item = {}) {
  return item.product_type === "base_cabinet" || Boolean(item.cabinet_config_snapshot || item.cabinet_config);
}

/**
 * What a cabinet is called, preferring the name somebody actually gave it.
 */
export function cabinetLabel(item = {}) {
  const config = item.cabinet_config_snapshot || item.cabinet_config || {};
  return (
    text(config.label) ||
    text(item.title) ||
    text(item.product_type).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "Cabinet"
  );
}

/**
 * Which cabinet each design item id belongs to, by name.
 *
 * Every line the design tool generated for one cabinet shares its
 * design_item_id, which is how a door is tied to the carcass it goes on.
 */
export function cabinetsByDesignItem(items = []) {
  const found = new Map();
  (items || []).forEach((item) => {
    if (!item?.design_item_id || !isCabinetLine(item)) return;
    if (found.has(item.design_item_id)) return;
    found.set(item.design_item_id, cabinetLabel(item));
  });
  return found;
}

/**
 * One line, named so it cannot be confused with the line beside it.
 *
 * The position comes first because it is what the order lists by and what a
 * person counts down to. Then what it is, then the size, then the spec, then the
 * quantity if there is more than one.
 */
// Number(null) is 0, so a plain isFinite check turns "no position recorded"
// into position 1. A wrong position is worse than none: it points at a real
// line that is not this one.
function positionValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function orderItemLabel(item = {}, index = null) {
  const from = positionValue(item.sort_order) ?? positionValue(index);
  const position = from === null ? null : from + 1;

  const what = text(item.title) || text(item.product_type) || "Order item";
  const size = itemSizeLabel(item);
  const spec = [text(item.material), text(item.colour)].filter(Boolean).join(", ");
  const qty = Number(item.qty || 1);

  const parts = [what, size, spec].filter(Boolean);
  const label = parts.join(" · ");
  const counted = qty > 1 ? `${label} (x${qty})` : label;
  return position ? `${position}. ${counted}` : counted;
}

/**
 * The options for "which item are you changing".
 *
 * Grouped by cabinet, so the four doors on one carcass sit together under its
 * name rather than being scattered through a flat list of identical rows.
 * Anything not part of a cabinet groups on its own, because a replacement front
 * ordered by itself genuinely belongs to nothing.
 */
export function orderItemOptions(items = []) {
  const cabinets = cabinetsByDesignItem(items);
  return (items || []).map((item, index) => {
    const cabinet = item?.design_item_id ? cabinets.get(item.design_item_id) : null;
    return {
      value: item.id,
      label: orderItemLabel(item, index),
      name: orderItemLabel(item, index),
      group: cabinet || "Not part of a cabinet",
    };
  });
}

/**
 * The cabinets a variation-added piece can be attached to.
 *
 * Optional by design. A replacement door ordered on its own belongs to no
 * cabinet, and forcing a choice would mean somebody picking one at random to get
 * past the form. The empty option is first and says what it means.
 */
export function cabinetOptions(items = []) {
  const options = [...cabinetsByDesignItem(items).entries()].map(([designItemId, label]) => ({
    value: designItemId,
    label,
    name: label,
  }));
  return [{ value: "", label: "Not part of a cabinet", name: "Not part of a cabinet" }, ...options];
}
