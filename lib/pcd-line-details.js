// THE ANSWERS A MEASURE CARRIES THAT A BOARD SIZE DOES NOT.
//
// A door is a material, a thickness, a colour and two millimetre figures. What
// somebody standing in the kitchen also knows, and what used to be typed into
// the notes and hoped about, is here:
//
//   room / area        which room the line belongs to, on a job with four
//   panel use          an end panel, a filler and a kickboard are all "Panel"
//   grain direction    matters on a woodgrain, and on any wide drawer front
//   edges to finish    a panel scribed to a wall does not get all four
//   supplied by        a hardware line we price, or one the customer is buying
//   existing hinges    what the new doors are going onto, on a refresh
//
// WHY THEY LIVE TOGETHER. Each one is asked on the Excel order form, stored on
// the quote line or the quote, and read again on the workshop sheet. Three
// places, one vocabulary, so a spreadsheet answer and a screen answer cannot be
// different words for the same thing.
//
// ROOM AND PANEL USE ARE EDITABLE, the rest are not. A room is plain vocabulary
// that nothing branches on, so it belongs in Settings, Lists. Grain direction,
// the edges and who supplies a hardware line each change what the workshop does
// or what gets priced, so a name added to one of those with nothing behind it
// would be a dropdown entry that produces a blank. See lib/pcd-lists.js.

const text = (value) => String(value ?? "").trim();

/**
 * The rooms a line can belong to.
 *
 * Built in rather than fixed: this is the starting set, and Settings, Lists is
 * where a business that does more shopfitting than kitchens adds theirs.
 */
export const ROOM_AREAS = [
  "Kitchen",
  "Butler's pantry",
  "Scullery",
  "Laundry",
  "Bathroom",
  "Ensuite",
  "Powder room",
  "Robe",
  "Bedroom",
  "Office",
  "Living",
  "Garage",
  "Other",
];

/**
 * What a Panel actually is.
 *
 * Every one of these imports today as product type "Panel" with the real answer
 * buried in the notes, which is why a kickboard and a bulkhead reach the
 * workshop looking identical.
 */
export const PANEL_USES = [
  "End panel",
  "Filler",
  "Kickboard",
  "Bulkhead",
  "Shelf",
  "Back panel",
  "Upstand",
  "Other",
];

/**
 * Which way the grain runs.
 *
 * "Standard" is the honest default and means the way we always run it for that
 * colour: up a door, across a drawer front. It is an answer rather than a blank
 * so that a line nobody thought about reads differently from one somebody
 * deliberately left standard.
 */
export const GRAIN_DIRECTIONS = ["Standard", "Vertical", "Horizontal", "No grain"];

/** How many edges get finished. Blank means the standard, which is all four. */
export const EDGE_FINISHES = ["All four edges", "Leave one edge raw, see notes", "Not sure"];

/** Whether a hardware line is ours to price or the customer's to buy. */
export const SUPPLIED_BY = ["We supply", "Customer supplies", "Not sure"];

/** The hinges already hanging on a refresh job's carcasses. */
export const EXISTING_HINGE_BRANDS = ["Blum", "Hettich", "Grass", "Titus", "Other", "Not sure"];

/** How the existing doors sit on the carcass. */
export const DOOR_OVERLAYS = ["Full overlay", "Half overlay", "Inset", "Not sure"];

/**
 * One of a list, or "" for anything we do not recognise.
 *
 * Matched without case so a spreadsheet that has been through Google Sheets and
 * come back title cased still lands on the same answer. Anything else is
 * dropped rather than stored, because a value nothing offers is a value no
 * screen can show and no report can group by.
 */
export function oneOf(options, value) {
  const wanted = text(value).toLowerCase();
  if (!wanted) return "";
  return options.find((option) => option.toLowerCase() === wanted) || "";
}

/** The panel use, only where the line is actually a panel. */
export function panelUseFor(productType, value) {
  if (text(productType).toLowerCase() !== "panel") return "";
  return oneOf(PANEL_USES, value);
}
