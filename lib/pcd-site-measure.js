// WHAT COMES BACK FROM A SITE MEASURE, AND WHERE IT LANDS ON A QUOTE.
//
// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
//
// Six things, asked standing in somebody's kitchen with a tape in one hand:
// what it is, how big, how many, and on a door which side it hangs and where
// the cups go. Everything else about the line, the board and the colour and the
// edge, is answered back at the office.
//
// ── NOTHING IS INVENTED HERE ─────────────────────────────────────────────────
//
// Every answer has a column on a quote line already. The item type is a product
// type and a panel use, the sizes are height_mm and width_mm, the hinges are
// the four fields lib/pcd-hinges.js describes. So a measured item becomes an
// ordinary quote line, priced and cut and ordered exactly as one typed by hand,
// and nothing downstream has to know a site measure happened.
//
// THE ONE EXCEPTION IS THE REFERENCE. D1 is what is pencilled on the door, and
// a quote line has nowhere to put it, so it goes on the front of the internal
// notes in a fixed form this module reads back. That is why the numbering
// survives closing the tab: the next reference is worked out from the lines
// already on the quote, not from a counter held on a screen.

import { PANEL_PRODUCT_TYPE } from "./pcd-line-details";

const text = (value) => String(value ?? "").trim();

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * What can be measured, and the letter its references start with.
 *
 * Six, because that is what gets measured. A table top, a shelf or a back panel
 * is a thing you work out at the office off the cabinet, not something you
 * stand in a kitchen and measure, and every one of them can still be added on
 * the items table in the ordinary way.
 *
 * product_type and panel_use are the two fields the line actually carries. They
 * are the same pair the item type picker on the quote items table sets, so a
 * filler measured on site and a filler typed at a desk are the same line.
 */
export const SITE_MEASURE_TYPES = [
  { key: "door",      label: "Door",         prefix: "D",  product_type: "Door",         panel_use: "",          hinges: true },
  { key: "drawer",    label: "Drawer front", prefix: "DR", product_type: "Drawer front", panel_use: "",          hinges: false },
  { key: "panel",     label: "Panel",        prefix: "P",  product_type: PANEL_PRODUCT_TYPE, panel_use: "",      hinges: false },
  { key: "filler",    label: "Filler",       prefix: "F",  product_type: PANEL_PRODUCT_TYPE, panel_use: "Filler", hinges: false },
  { key: "scribe",    label: "Scribe",       prefix: "S",  product_type: PANEL_PRODUCT_TYPE, panel_use: "Scribe", hinges: false },
  { key: "kickboard", label: "Kickboard",    prefix: "K",  product_type: PANEL_PRODUCT_TYPE, panel_use: "Kickboard", hinges: false },
];

export function siteMeasureType(key) {
  return SITE_MEASURE_TYPES.find((type) => type.key === key) || SITE_MEASURE_TYPES[0];
}

// The reference, written on the front of the internal notes because a quote
// line has nowhere else for it. One spelling, read and written here only.
const NOTE_PREFIX = "Site measure ref";
const NOTE_PATTERN = /^Site measure ref\s+([A-Za-z]+\d+)\b[.:]?\s*/;

/** The internal note for a line, with its reference on the front. */
export function noteWithReference(notes, reference) {
  const ref = text(reference);
  const rest = text(String(notes ?? "").replace(NOTE_PATTERN, ""));
  if (!ref) return rest;
  return [`${NOTE_PREFIX} ${ref}.`, rest].filter(Boolean).join(" ");
}

/** The reference off a line, or "" on a line that never had one. */
export function referenceFromNote(notes) {
  const found = NOTE_PATTERN.exec(text(notes));
  return found ? found[1].toUpperCase() : "";
}

/**
 * The next reference for this kind of item: D1, D2, DR1.
 *
 * Read off the lines already on the quote rather than counted on the screen, so
 * closing the tab and coming back does not start again at D1 and give two doors
 * the same name.
 *
 * DR IS DELIBERATELY NOT D FOLLOWED BY A NUMBER. Matching on the exact prefix
 * rather than the first letter is what stops DR1 being read as a D.
 */
export function nextReference(lines = [], typeKey) {
  const { prefix } = siteMeasureType(typeKey);
  const pattern = new RegExp(`^${prefix}(\\d+)$`, "i");

  const used = (lines || [])
    .map((line) => referenceFromNote(line?.notes))
    .map((ref) => pattern.exec(ref))
    .filter(Boolean)
    .map((found) => Number(found[1]));

  return `${prefix}${used.length ? Math.max(...used) + 1 : 1}`;
}

/**
 * The four hinge fields, from cups measured up from the bottom edge.
 *
 * ONE DATUM, because whoever is marking the door out has a tape hooked over one
 * end and should not be doing arithmetic to find the second number. The line
 * stores the top cup as a distance from the TOP, which is how a joiner's spec
 * sheet reads, so the turn-round happens here rather than in somebody's head.
 *
 * An empty list is not a gap: it means the positions were left to us, which is
 * what a blank already means everywhere else. See usesStandardPositions.
 */
export function hingeFieldsFromCups(cups = [], heightMm) {
  const height = positive(heightMm);
  const list = (cups || []).map(positive).filter(Boolean);

  if (!height || list.length < 2) {
    return { hinge_from_bottom_mm: null, hinge_from_top_mm: null, hinge_middles_mm: [] };
  }

  const sorted = [...list].sort((a, b) => a - b);
  const top = sorted[sorted.length - 1];
  return {
    hinge_from_bottom_mm: sorted[0],
    // A cup measured at or past the top edge is a mistyped door. Nulled rather
    // than stored as a negative, so it reads as "not said" instead of as a
    // measurement somebody meant.
    hinge_from_top_mm: height > top ? height - top : null,
    hinge_middles_mm: sorted.slice(1, -1),
  };
}

/** True once there is enough to make a line: a size is the whole of it. */
export function measureIsComplete(item = {}) {
  return Boolean(positive(item.height_mm) && positive(item.width_mm));
}

/**
 * A measured item as a quote line, on top of whatever a new line starts as.
 *
 * `base` is the editor's own empty line, so the business defaults, the markup
 * and every field this form does not ask about arrive exactly as they would on
 * a line added with the Add line item button. Only the six answers are set on
 * top, which is what keeps a measured line an ordinary line.
 */
export function measuredQuoteLine(item = {}, base = {}) {
  const type = siteMeasureType(item.type);
  const hinged = type.hinges && positive(item.hinge_count) > 0;
  const cups = hinged && !item.standard ? hingeFieldsFromCups(item.cups, item.height_mm) : null;

  return {
    ...base,
    product_type: type.product_type,
    panel_use: type.panel_use,
    // Named the way the items table names a line it has just been given a type
    // for, so a measured line and a typed one read the same in the list.
    product_name: type.product_type,
    height_mm: positive(item.height_mm) || "",
    width_mm: positive(item.width_mm) || "",
    qty: Math.max(1, Math.round(positive(item.qty)) || 1),

    hinge_holes: hinged,
    hinge_qty: hinged ? String(positive(item.hinge_count)) : "",
    hinge_side: hinged ? text(item.hinge_side) : "",
    hinge_from_bottom_mm: cups ? cups.hinge_from_bottom_mm : null,
    hinge_from_top_mm: cups ? cups.hinge_from_top_mm : null,
    hinge_middles_mm: cups ? cups.hinge_middles_mm : [],

    notes: noteWithReference(base.notes, item.ref),
  };
}

/** What a measured item will read as, for the line under the card. */
export function measuredSummary(item = {}) {
  const type = siteMeasureType(item.type);
  const parts = [type.label];
  if (positive(item.height_mm) && positive(item.width_mm)) {
    parts.push(`${positive(item.height_mm)} x ${positive(item.width_mm)}`);
  }
  const qty = Math.max(1, Math.round(positive(item.qty)) || 1);
  if (qty > 1) parts.push(`x${qty}`);

  if (type.hinges && positive(item.hinge_count)) {
    parts.push(`${positive(item.hinge_count)} hinges ${text(item.hinge_side).toLowerCase()}`);
    const cups = item.standard ? [] : (item.cups || []).map(positive).filter(Boolean);
    parts.push(cups.length ? `cups ${cups.join(" / ")} up` : "standard cup positions");
  }
  return parts.join(", ");
}
