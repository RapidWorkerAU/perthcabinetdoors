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
 * Every one of these quotes as product type "Panel", with this saying which
 * kind, so a kickboard and a scribe do not reach the workshop looking
 * identical. Offered on the quote items table as its own item type: see
 * itemTypeOptions below.
 *
 * BULKHEAD, UPSTAND AND OTHER WERE HERE AND ARE NOT ANY MORE. A bulkhead and
 * an upstand are not things we make, and "Other" is a dropdown entry that
 * answers nothing: a panel nobody has named reads as Panel already, which says
 * the same and does not look like somebody chose it. Removed from the list
 * rows as well, in migration 202609081000, or the Excel order form would go on
 * offering all three from the database.
 */
export const PANEL_USES = [
  "End panel",
  "Filler",
  "Scribe",
  "Kickboard",
  "Shelf",
  "Back panel",
];

/**
 * WHAT A LINE IS, as one list you can pick from.
 *
 * ── THE PROBLEM ─────────────────────────────────────────────────────────────
 *
 * A filler is a Panel. A scribe is a Panel. A kickboard is a Panel. That is
 * true and it is what panel_use is for, but on the quote items table the Type
 * cell only ever offered the word Panel, and panel_use had no cell at all. So
 * a filler measured on site could be recorded as a Panel and nothing more, and
 * what kind of panel it was went into the notes or nowhere.
 *
 * ── THE ANSWER ──────────────────────────────────────────────────────────────
 *
 * The picker offers the kinds, and picking one sets BOTH fields: product_type
 * Panel and panel_use Filler. Nothing downstream changes, because the line
 * really is a Panel: the same materials are offered, the same fields are
 * asked, the same rules price it. The only difference is that the row can now
 * say what it is.
 *
 * Built from PRODUCT_TYPES and PANEL_USES rather than written out again, so a
 * panel use added in Settings, Lists appears here without anybody editing a
 * screen. That is also why the labels are the panel use exactly as it is
 * spelt there: two names for one thing is how vocabularies drift.
 */
export function itemTypeOptions({ productTypes = [], panelUses = PANEL_USES } = {}) {
  const options = [];
  for (const type of productTypes) {
    options.push({
      value: type,
      label: type,
      group: itemTypeGroup(type),
      product_type: type,
      panel_use: "",
    });
    // The kinds sit directly under the plain Panel they belong to.
    if (type !== PANEL_PRODUCT_TYPE) continue;
    for (const use of panelUses) {
      options.push({
        value: `${PANEL_PRODUCT_TYPE}${ITEM_TYPE_SEPARATOR}${use}`,
        label: use,
        group: "Panels",
        product_type: PANEL_PRODUCT_TYPE,
        panel_use: use,
      });
    }
  }
  return options;
}

export const PANEL_PRODUCT_TYPE = "Panel";

// A front, a panel, or neither. Hardware is bought rather than cut and a
// benchtop is priced from its own list, so grouping them with the doors would
// put two things that are not made from board at the top of the list.
const FRONTS = ["Door", "Drawer front", "Table top"];

export function itemTypeGroup(productType) {
  const name = text(productType);
  if (name === PANEL_PRODUCT_TYPE) return "Panels";
  return FRONTS.includes(name) ? "Fronts and tops" : "Everything else";
}
const ITEM_TYPE_SEPARATOR = " :: ";

/** The picker value for a line: "Panel :: Filler", or just the product type. */
export function itemTypeValue(line = {}) {
  const productType = text(line.product_type);
  const use = panelUseFor(productType, line.panel_use);
  return use ? `${productType}${ITEM_TYPE_SEPARATOR}${use}` : productType;
}

/** The two fields a picked value sets. Both, always, so neither can be stale. */
export function itemTypeFromValue(value) {
  const [productType, use] = String(value ?? "").split(ITEM_TYPE_SEPARATOR);
  return {
    product_type: text(productType),
    panel_use: panelUseFor(productType, use),
  };
}

/** What the row says: the kind where there is one, the product type otherwise. */
export function itemTypeLabel(line = {}) {
  return panelUseFor(line.product_type, line.panel_use) || text(line.product_type);
}

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

/**
 * WHICH EDGES GET TAPE, one at a time.
 *
 * edge_finish above is as much as the order form could ever ask, and its middle
 * answer sends you to the notes to find out which edge. The website asks
 * exactly, so this is what it stores, and edge_finish is derived from it below.
 * More detail in a new field; nothing that reads the old one has to change.
 *
 * Decorative board only. A thermolaminate front is wrapped and a compact
 * laminate panel is solid through, so neither is taped and neither is asked.
 */
export const BANDED_EDGES = ["Top", "Bottom", "Left", "Right"];

/**
 * WHICH BORING THE HINGE NEEDS.
 *
 * A bare 35mm cup, or a Blum Inserta, which is that cup plus two 8mm dowels on
 * 45mm centres. Two different machine setups, and a door bored for one will not
 * take a hinge made for the other.
 */
export const HOLE_TYPES = ["Blum Inserta", "35mm cup only"];

/** The banded edges as a clean, ordered list, or [] if nobody was asked. */
export function bandedEdgeList(value) {
  const raw = Array.isArray(value) ? value : [];
  return BANDED_EDGES.filter((edge) => raw.some((v) => text(v).toLowerCase() === edge.toLowerCase()));
}

/**
 * The old three-phrase answer, worked out from the exact one.
 *
 * So a screen, a PDF or an order form that reads edge_finish keeps reading it
 * and keeps getting a true answer, without anybody editing them. Null when
 * nobody was asked, because "not asked" and "none of them" are different and
 * only one of them is an instruction.
 */
export function edgeFinishFromBanded(value) {
  if (!Array.isArray(value)) return "";
  const edges = bandedEdgeList(value);
  if (!edges.length) return "Leave one edge raw, see notes";
  return edges.length === BANDED_EDGES.length ? "All four edges" : "Leave one edge raw, see notes";
}

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

/**
 * THE SEVEN ANSWERS, CHECKED, for a line about to be stored.
 *
 * The rules the quote saver applies, in one place so a variation line cannot be
 * kinder or stricter than a quote line about the same door:
 *
 *   only a Panel has a kind of panel;
 *   only decorative board is taped, and which edges is null until asked;
 *   the older edges answer follows the exact one wherever there is one;
 *   only a drilled line has a boring, and only one we machine;
 *   grain and who supplies it are one of their lists;
 *   only a hardware line has a hardware kind.
 *
 * Anything that fails a rule is stored as null rather than refused, the same as
 * the quote saver: a stale answer from a changed material is dropped, not an
 * error somebody has to clear before they can save the rest of the line.
 */
export function validatedLineAnswers(line = {}) {
  const taped = text(line.material).toLowerCase() === "decorative board";
  const banded = taped && Array.isArray(line.banded_edges) ? bandedEdgeList(line.banded_edges) : null;
  return {
    panel_use: panelUseFor(line.product_type, line.panel_use) || null,
    banded_edges: banded,
    edge_finish: banded ? edgeFinishFromBanded(banded) || null : oneOf(EDGE_FINISHES, line.edge_finish) || null,
    hole_type: line.hinge_holes && HOLE_TYPES.includes(line.hole_type) ? line.hole_type : null,
    grain_direction: oneOf(GRAIN_DIRECTIONS, line.grain_direction) || null,
    supplied_by: oneOf(SUPPLIED_BY, line.supplied_by) || null,
    hardware_type: text(line.product_type) === "Hardware" ? text(line.hardware_type) || null : null,
  };
}

/** The answer keys validatedLineAnswers returns, for building a merge. */
export const LINE_ANSWER_KEYS = ["panel_use", "banded_edges", "hole_type", "edge_finish", "grain_direction", "supplied_by", "hardware_type"];

/**
 * Which edges are banded, in words. Empty when nobody was asked.
 *
 * "Not asked" and "none of the four" are different answers, and only one of
 * them is an instruction, so a null says nothing and an empty list says so.
 */
export function bandedEdgesText(value) {
  if (!Array.isArray(value)) return "";
  const edges = bandedEdgeList(value);
  if (!edges.length) return "No edges banded";
  if (edges.length === BANDED_EDGES.length) return "All four edges banded";
  return `Banded ${edges.join(", ").toLowerCase()}`;
}

/**
 * WHAT THE WORKSHOP NEEDS TO KNOW BEYOND THE BOARD, as short phrases.
 *
 * The kind of panel, the edges, the grain and who supplies it. One answer to
 * "what else does this line say", used by every order view and the workshop
 * sheet, so a Scribe cannot read as a Scribe on one screen and a Panel on the
 * next. The drilling, including which boring, is lib/pcd-hinges.js.
 *
 * Only what somebody actually answered. A standard grain and an edge finish of
 * all four are the defaults, and printing them on every row buries the rows
 * where somebody said something different.
 */
export function lineMakeDetails(line = {}) {
  const out = [];
  const use = panelUseFor(line.product_type, line.panel_use);
  if (use) out.push(use);

  const banded = bandedEdgesText(line.banded_edges);
  if (banded) out.push(banded);
  else {
    // A line from before the edges were asked one at a time.
    const finish = oneOf(EDGE_FINISHES, line.edge_finish);
    if (finish && finish !== EDGE_FINISHES[0]) out.push(finish);
  }

  const grain = oneOf(GRAIN_DIRECTIONS, line.grain_direction);
  if (grain && grain !== "Standard") out.push(grain === "No grain" ? "No grain" : `Grain ${grain.toLowerCase()}`);

  if (oneOf(SUPPLIED_BY, line.supplied_by) === "Customer supplies") out.push("Customer supplies");
  return out;
}
