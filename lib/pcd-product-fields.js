// WHAT EACH KIND OF PRODUCT ACTUALLY NEEDS TO BE ASKED.
//
// ── THE PROBLEM ─────────────────────────────────────────────────────────────
//
// The quote form showed every field for every product and wrote "N/A" in the
// ones that did not apply. A door has eleven; hardware has two. So somebody
// ordering handles was shown nine boxes that meant nothing, and the one thing
// they needed to say was not there at all: the material dropdown was empty,
// because hardware has no board, and the row could not be finished.
//
// A greyed-out field is not information. It is a question we are asking and
// then refusing to accept the answer to, and enough of them in a row reads as a
// broken page.
//
// ── THE SHAPE ───────────────────────────────────────────────────────────────
//
// The type is chosen first and decides what is asked. Every screen reads this,
// so none of them can decide differently what a door needs.
//
// These say what a type CAN be asked. What it is actually asked also depends on
// the answers: profiles are routed into Thermolaminate only, and edges belong to
// the range rather than the board, so both narrow further once the material and
// the brand are known.

/**
 * @typedef {object} ProductFieldSet
 * @property {string} label     what to call it on the chooser
 * @property {string} blurb     one line saying what it is, for somebody unsure
 * @property {boolean} board    is it cut from a board (material, thickness, colour)
 * @property {boolean} hardware is it chosen from the hardware catalogue instead
 * @property {boolean} size     does it need a height and a width
 * @property {boolean} profile  can its face be routed to a shape
 * @property {boolean} edge     can its edge be moulded or taped
 * @property {boolean} hinges   can it be drilled for hinges
 */

/** @type {Record<string, ProductFieldSet>} */
export const PRODUCT_FIELDS = {
  Door: {
    label: "Door",
    blurb: "A cupboard or cabinet door, made to your sizes.",
    board: true,
    hardware: false,
    size: true,
    profile: true,
    edge: true,
    // The only one that gets drilled. A drawer front is screwed from behind and
    // a panel is fixed, so neither has a hinge to hang on.
    hinges: true,
  },
  "Drawer front": {
    label: "Drawer front",
    blurb: "The face of a drawer. Same finishes as a door, no hinges.",
    board: true,
    hardware: false,
    size: true,
    profile: true,
    edge: true,
    hinges: false,
  },
  Panel: {
    label: "Panel",
    blurb: "An end panel, a filler, a kickboard or a finished back.",
    board: true,
    hardware: false,
    size: true,
    profile: true,
    edge: true,
    hinges: false,
  },
  "Table top": {
    label: "Table top",
    blurb: "A worktop or table surface. Decorative board or compact laminate.",
    board: true,
    hardware: false,
    size: true,
    // Not profiled: the shapes are pressed into a door face, and a table top is
    // not one. It falls out of the material rule anyway, since a table top
    // cannot be Thermolaminate, but saying it here means the field is never
    // rendered rather than rendered and then found to be empty.
    profile: false,
    edge: true,
    hinges: false,
  },
  Hardware: {
    label: "Hardware",
    blurb: "Handles, hinges, runners and the rest. Chosen from our range.",
    // No board, no size, no finish. It is a bought item with a quantity, and
    // asking it anything else was the whole problem.
    board: false,
    hardware: true,
    size: false,
    profile: false,
    edge: false,
    hinges: false,
  },
  // THE BOX, not a face for one. Staff only, so it is deliberately absent from
  // PRODUCT_TYPES: a customer orders fronts, and a carcass is quoted for them.
  //
  // It was missing from this file altogether, which is the reason the quote
  // editor was in the state it was. Without a record here every cabinet fell
  // through to the fallback below, which answers "yes" to size, profile and
  // edge, so every screen had to bolt its own `!isBaseCabinet` onto every cell
  // by hand. Desktop and mobile then disagreed about which cells that was:
  // desktop let you set the quantity and mobile did not, mobile hid the markup
  // and desktop showed it locked. Saying it once here is what stops that.
  base_cabinet: {
    label: "Base cabinet",
    blurb: "A carcass built to size from board, priced from its cut list.",
    board: true,
    hardware: false,
    // A cabinet is a height, a width AND a depth, and it is priced from the
    // pieces that come out of those, not from one face. Its sizes live on the
    // cabinet rather than in the line's two size boxes.
    size: false,
    profile: false,
    edge: false,
    hinges: false,
    cabinet: true,
  },
};

/**
 * The fields for one type.
 *
 * An unknown type gets the board treatment rather than nothing, so a line from
 * an older quote with a type we have since renamed still shows its fields
 * instead of an empty form.
 */
export function fieldsForProductType(productType) {
  // Matched without regard to case or spacing, so a stored "Base Cabinet" or a
  // "base-cabinet" from anywhere other than our own dropdown cannot fall
  // through to the fallback and lose its cabinet treatment.
  const exact = PRODUCT_FIELDS[productType];
  if (exact) return exact;
  const key = normalizeTypeKey(productType);
  const found = key && Object.keys(PRODUCT_FIELDS).find((name) => normalizeTypeKey(name) === key);
  return (
    (found && PRODUCT_FIELDS[found]) || {
      label: productType || "Product",
      blurb: "",
      board: true,
      hardware: false,
      size: true,
      profile: true,
      edge: true,
      hinges: false,
      cabinet: false,
    }
  );
}

function normalizeTypeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "_");
}

/** The types a customer may choose, in the order they should be offered. */
export function productTypeChoices(types = []) {
  return types.filter((type) => PRODUCT_FIELDS[type]).map((type) => ({ value: type, ...PRODUCT_FIELDS[type] }));
}

/** Is this type chosen from the hardware catalogue rather than built? */
export function isHardwareType(productType) {
  return fieldsForProductType(productType).hardware === true;
}

/**
 * Is this type a carcass, priced from a cut list rather than as a flat sheet?
 *
 * The one definition. The quote editor, the design importer and the reprice
 * each had their own comparison against the literal "base_cabinet", which is
 * how the editor ended up disagreeing with itself between desktop and mobile.
 */
export function isCabinetType(productType) {
  return fieldsForProductType(productType).cabinet === true;
}
