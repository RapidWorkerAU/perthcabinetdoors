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
import { hingePositionLines } from "./pcd-hinges";

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
 * The four hinge fields, from the cups as they were measured on site.
 *
 * MEASURED THE WAY EVERY OTHER SCREEN ASKS: the bottom cup up from the bottom
 * edge, the top cup down from the top edge, and any cup between them up from
 * the bottom. This used to take every cup up from the bottom and turn the top
 * one round, so a door measured here read back differently from one typed on
 * the website or in the quote editor, and "100 from the top" came back as a
 * number nobody had measured. See hingePositionLines in lib/pcd-hinges.js.
 *
 * Positional rather than sorted: the first box is the bottom cup and the box
 * at `count` is the top one, because they are measured from different edges.
 *
 * An empty list is not a gap: it means the positions were left to us, which is
 * what a blank already means everywhere else. See usesStandardPositions.
 */
export function hingeFieldsFromCups(cups = [], heightMm, count = (cups || []).length) {
  const height = positive(heightMm);
  const n = Math.max(0, Math.round(Number(count) || 0));
  const at = (index) => positive((cups || [])[index]);
  const bottom = at(0);
  const top = n >= 2 ? at(n - 1) : 0;

  if (!bottom || !top) {
    return { hinge_from_bottom_mm: null, hinge_from_top_mm: null, hinge_middles_mm: [] };
  }

  return {
    hinge_from_bottom_mm: bottom,
    // A top and a bottom that meet or cross is a mistyped door. The top is
    // nulled rather than kept, so it reads as "not said" instead of as a
    // measurement somebody meant.
    hinge_from_top_mm: !height || bottom + top < height ? top : null,
    hinge_middles_mm: Array.from({ length: Math.max(0, n - 2) }, (_, i) => at(i + 1))
      .filter(Boolean)
      .sort((a, b) => a - b),
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
  const cups = hinged && !item.standard ? hingeFieldsFromCups(item.cups, item.height_mm, positive(item.hinge_count)) : null;

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
    // Read back the way it was measured, in the words every other screen uses.
    const fields = item.standard ? null : hingeFieldsFromCups(item.cups, item.height_mm, positive(item.hinge_count));
    const positions = fields && hingePositionLines({ hinge_holes: true, hinge_qty: String(positive(item.hinge_count)), height_mm: item.height_mm, ...fields });
    parts.push(positions ? positions.map((part) => part[0].toLowerCase() + part.slice(1)).join(", ") : "standard cup positions");
  }
  return parts.join(", ");
}
