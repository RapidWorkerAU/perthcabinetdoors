// Design item -> QUOTE REQUEST lines, one line per real piece.
//
// WHY THIS EXISTS. The public planner's submit route used to write ONE line per
// design item, with the cabinet's own size on it and a made-up product type
// like "Base cabinet" or "Fronts & panels only (customer's own cabinet)". Three
// things were wrong with that:
//
//   1. product_type is passed STRAIGHT THROUGH to the quote line when a request
//      is converted (see app/api/admin/quote-requests/route.js). The quote
//      editor only understands PRODUCT_TYPES from lib/pcd-materials.js plus its
//      own "base_cabinet", so anything else lands as a blank Type on the quote.
//   2. A cabinet with three drawers produced one line, so the drawer fronts
//      never appeared at all, and the size shown was the carcass, not a front.
//   3. The design tool stores material lowercase ("compact laminate"). The
//      quote editor matches Title Case ("Compact Laminate"), so the material
//      never matched its own dropdown.
//
// WHY IT LOOKS LIKE THIS NOW. Fixing those three meant writing out how each
// piece is worked out, which the admin design importer ALREADY did. So there
// were two translations of the same drawing, and nothing anywhere compared
// them. They drifted exactly where you would expect:
//
//   * a corner cabinet came through as one flat 897mm door instead of two
//     folding 339mm leaves, and lost the fold hinge spec with it
//   * a floating shelf came through as a single board instead of the three it
//     is made of, at about 7% of the material
//   * a shelf and rail came through as one board instead of five
//   * a filler panel was built for a base cabinet, which has no gap to close
//
// None of them made a noise. A wrong size on a quote looks exactly like a right
// one, so the only detector was somebody noticing on a live job.
//
// So there is one translation now (lib/pcd-design-to-lines.js) and this is the
// adapter onto it: same pieces, same sizes, same hinge drilling, re-shaped into
// the fields a quote request row holds and with the things only a request needs
// added on top. What a customer's design becomes and what one of ours becomes
// cannot differ any more, because it is the same function.
//
// test/design-paths-agree.test.mjs is what keeps it that way.
//
// WHAT A REQUEST DELIBERATELY DOES NOT CARRY:
//   * rates and cut lists. A request is a lead. The money is worked out when it
//     is converted, from the colour library as it stands that day.
//   * benchtops. The public planner draws one so the room reads correctly and
//     says "Benchtop (drawing only)" on the part list. A benchtop is measured
//     on site.
//   * hardware. Handles are not offered on the website, and we drill for hinges
//     rather than supply them; the customer's hinge answer rides in the notes.
//
// WHAT THE EDITOR DOES WITH EACH TYPE (see applyProductLinePatch in
// app/admin/quotes/[id]/QuoteEditor.js), which is why the lines are shaped the
// way they are:
//
//   base_cabinet  no width/height, no edge mould, no profile, no hinge fields.
//                 It lands in the Cabinets tab, and cabinetSpec below is the
//                 box it is built and costed from.
//   Door          the only type that keeps hinge_holes / hinge_qty. hinge_qty
//                 is parsed for a number to cost the drilling, so it has to
//                 read like "2 hinges".
//   Drawer front  no hinge fields. The runner spec has nowhere structured to
//                 live, so it goes in the notes.
//   Panel         no hinge fields. Which panel it is, and how far it runs,
//                 goes in the notes.

import { materialLabelForType } from "./pcd-colour-library";
import { isCustomerOwned } from "./pcd-design-parts";
import { generateImportLines } from "./pcd-design-to-lines";
import { bayShelfCount } from "./pcd-door-utils";

// The quote editor's own name for a cabinet line. Not in PRODUCT_TYPES because
// a cabinet is priced from a cut list rather than as a board, but it is what
// the editor expects, so it is what a request must carry.
const CARCASS_PRODUCT_TYPE = "base_cabinet";

// Which of the importer's parts each part on the customer's card turns on. The
// customer's card is the shorter list: "Finished panels" is one tick that
// covers the back, the top and the underside, which the importer keeps as one
// "panels" group for the same reason.
const IMPORTER_PART_FOR = {
  carcass: "cabinet",
  doors: "doors",
  drawers: "drawers",
  endpanels: "panels",
  filler: "filler",
  kickboard: "kickboard",
  body: "include",
};

// Product types a website request never carries. See the note at the top: both
// are decisions, and this is the whole list of them. Anything else the shared
// translation makes, a request carries.
const NOT_QUOTED_FROM_A_REQUEST = new Set(["Benchtop", "Hardware"]);

// A front or a finished panel with nothing else to go on. Matches the admin
// design tool's own defaults (see MaterialDefaultsModal).
const FALLBACK_THICKNESS_MM = 18;

function n(value) {
  return Number(value) || 0;
}

function join(...parts) {
  return parts.filter(Boolean).join(" ");
}

// The shared translation names the piece and where it came from as a heading
// ("Kickboard — Base 900 — Kitchen"), which reads as the first sentence of the
// note on a request. Given a full stop so it does not run into the next one.
function asSentence(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function carcassThicknessMm(item) {
  return Number(item?.carcass_thickness_mm) || (item?.item_type === "bookcase" ? 18 : 16);
}

// Said once per line rather than left for someone to work out. A front with no
// colour on it is the customer not having chosen yet, which is a thing to ask
// them about rather than a blank to guess at.
function colourNote(colour) {
  return colour ? "" : "No colour chosen yet — confirm with the customer.";
}

// The board a piece falls back to when its own style carries nothing.
//
// NULL for a cabinet the customer already owns: on one of those the item-level
// material/finish/colour describe an IKEA carcass we did not build, so falling
// back to them would put the wrong finish on their new doors. A blank there is
// honest and worth seeing.
function fallbackBoard(item) {
  if (isCustomerOwned(item)) return {};
  return { material: item.material, finish: item.finish, colour: item.colour };
}

function fallbackThicknessMm(item, productType) {
  if (productType === CARCASS_PRODUCT_TYPE) return carcassThicknessMm(item);
  if (item.item_type === "panel" || item.item_type === "floating_shelf" || item.item_type === "shelf_rail") {
    return Number(item.panel_thickness_mm) || carcassThicknessMm(item);
  }
  return FALLBACK_THICKNESS_MM;
}

// THE BRIEF, for the cabinet line.
//
// The size travels as data on cabinetSpec below, which is what the cut list is
// worked out from. This is the same facts as a sentence, because it is what the
// Cabinets tab shows under the cabinet name and what a person reads on the
// request itself, before there is a quote at all. Height first, the way every
// size is written here.
function carcassBrief(item) {
  const shelves = n(item.shelf_qty) + bayShelfCount(item);
  const mount = n(item.mount_height_mm);
  return join(
    `${Math.round(n(item.height_mm))} high × ${Math.round(n(item.width_mm))} wide × ${Math.round(n(item.depth_mm))} deep.`,
    item.carcass_thickness_mm ? `${item.carcass_thickness_mm}mm carcass board.` : "",
    shelves ? `${shelves} ${shelves === 1 ? "shelf" : "shelves"}.` : "No shelves.",
    item.back_panel_included === false ? "No back." : "Back included.",
    item.item_type === "wall_cabinet" && mount ? `Hangs ${mount}mm off the floor.` : "",
    item.secondary_width_mm ? `Corner, second leg ${Math.round(n(item.secondary_width_mm))}mm.` : "",
    item.has_rangehood ? "Rangehood housing." : ""
  );
}

// One piece, re-shaped from the quote-line fields the shared translation emits
// into the fields a quote request row holds.
function requestLineFrom(line, item) {
  const isCarcass = line.product_type === CARCASS_PRODUCT_TYPE;
  const fallback = fallbackBoard(item);
  const material = line.material || fallback.material || "";
  const colour = line.colour || fallback.colour || "";
  const thicknessMm = fallbackThicknessMm(item, line.product_type);

  return {
    productType: line.product_type,
    productName: line.product_name,
    // Title Case, so it matches the quote editor's dropdown. This is the single
    // conversion point for every line this module makes.
    material: material ? materialLabelForType(material) : "",
    thickness: line.thickness || (thicknessMm ? `${thicknessMm}mm` : ""),
    finish: line.finish || fallback.finish || "",
    colour,
    // Which library row the customer picked, so the conversion prices this
    // piece off the exact board rather than re-matching on a colour name.
    colourLibraryId: line.unit_cost_source_id || "",
    supplierName: line.supplier_name || "",
    // A cabinet line carries NO width or height, deliberately. It is priced
    // from its cut list, and the quote editor's auto-cost path is
    // rate x (W x H / 1e6): real dimensions here would let it silently reprice
    // a carcass as one flat sheet. The box travels on cabinetSpec instead.
    ...(isCarcass ? {} : { width: Math.round(n(line.width_mm)), height: Math.round(n(line.height_mm)) }),
    qty: line.qty || 1,
    profileType: line.profile_type || "",
    profile: line.profile || "",
    edgeMould: line.edge_mould || "",
    // A quote line only keeps these on a Door, and the shared translation only
    // sets them there. Carried across as they are rather than re-derived: two
    // copies of a measurement is one copy that can be wrong.
    hingeHoles: Boolean(line.hinge_holes),
    hingeQty: line.hinge_qty || "",
    hingeSide: line.hinge_side || "",
    hingeFromBottomMm: line.hinge_from_bottom_mm ?? null,
    hingeFromTopMm: line.hinge_from_top_mm ?? null,
    hingeMiddlesMm: line.hinge_middles_mm || [],
    // The measurements the cut list needs, in the shape the quote's cabinet
    // configuration uses, plus the design item they came from so the two can
    // always be tied back together. See lib/pcd-cabinet-from-design.js.
    ...(isCarcass ? { designItemId: item.id || null, cabinetSpec: line.cabinet_config || null } : {}),
    notes: join(
      asSentence(line.description),
      isCarcass ? carcassBrief(item) : "",
      line.notes,
      isCarcass ? "" : colourNote(colour)
    ),
  };
}

/**
 * PARTS SOMEBODY TICKED THAT WE MAKE NOTHING FOR.
 *
 * Every part on the customer's card is meant to produce at least one piece.
 * A part that produces none is not a quote of zero, it is a piece nobody will
 * price: a filler ticked on a base cabinet, which has no gap to close, or an
 * item type the planner offers before the translation knows how to build it.
 *
 * Silence is the failure mode this whole module exists to stop, so the caller
 * asks this and says so on the request rather than letting the piece vanish
 * between the customer's screen and ours.
 *
 * @returns {string[]} the part keys that produced nothing
 */
export function partsWithNoLines(item, wantedKeys, ctx = {}) {
  const keys = Array.isArray(wantedKeys) ? wantedKeys : [];
  return keys.filter((key) => requestLinesForItem(item, [key], ctx).length === 0);
}

/**
 * One item plus the parts the customer ticked.
 *
 * @param {object} item      a pcd_design_items row
 * @param {string[]} wantedKeys  part keys from lib/pcd-design-parts.js
 * @param {object} ctx       { roomName, roomHeightMm, room, siblings }
 *
 * `siblings` is every other item the customer is asking about, which is what
 * lets a kickboard running across three cabinets be ONE board rather than
 * three. Without it each item is measured alone, which is what this did before
 * and is still the answer for a single cabinet.
 */
export function requestLinesForItem(item, wantedKeys, ctx = {}) {
  const keys = Array.isArray(wantedKeys) ? wantedKeys : [];
  if (!item || !keys.length) return [];

  // Everything off, then only what they ticked on. selectionForItem reads a
  // missing key as ON, so each part has to be named explicitly.
  const selection = { cabinet: false, doors: false, drawers: false, kickboard: false, filler: false, panels: false, include: false };
  keys.forEach((key) => {
    const part = IMPORTER_PART_FOR[key];
    if (part) selection[part] = true;
  });

  const room = ctx.room || { id: item.room_id, name: ctx.roomName || "", height_mm: n(ctx.roomHeightMm) };
  const siblings = Array.isArray(ctx.siblings) && ctx.siblings.length ? ctx.siblings : [item];

  const lines = generateImportLines({
    importableItems: [item],
    selections: { [item.id]: selection },
    selectedCabinetItems: siblings,
    roomNameById: new Map([[item.room_id, room.name || ctx.roomName || ""]]),
    roomById: new Map([[item.room_id, room]]),
    items: siblings,
  })
    .map(({ line }) => line)
    .filter((line) => !NOT_QUOTED_FROM_A_REQUEST.has(line.product_type))
    .map((line) => requestLineFrom(line, item));

  // A cabinet whose box was not asked for must say so on every one of its
  // lines, or someone quotes a carcass nobody ordered.
  if (!keys.includes("carcass") && !keys.includes("body")) {
    const scope = isCustomerOwned(item)
      ? "Customer's own cabinet — carcass NOT supplied, quote this piece only."
      : "Carcass not requested — quote this piece only.";
    return lines.map((line) => ({ ...line, notes: join(line.notes, scope) }));
  }
  return lines;
}
