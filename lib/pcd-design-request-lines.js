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
// This module fixes all three by doing what the ADMIN importer already does
// (app/api/admin/design/projects/[projectId]/import/route.js): compute the real
// pieces with the shared geometry helpers, and label them with the vocabulary
// the rest of the system uses. A quote request is a lead rather than a costed
// quote, so no rates or cabinet_config are carried - only what a person needs
// to read and price it.
//
// It also honours the customer's part selection, so a cabinet where they only
// ticked "Doors" contributes door lines and nothing else.

import { materialLabelForType } from "./pcd-colour-library";
import {
  computeDoorSizes,
  computeDoorSizesForConfig,
  computeDrawerSizes,
  computeDrawerSizesForConfig,
  finishedSidePanelDepthMm,
  finishedTopPanelDepthMm,
  formatHingeNote,
  frontSizingWidthMm,
} from "./pcd-door-utils";
import { finishPanelVerticalSpanMm } from "./pcd-finishpanel-utils";
import { kickboardIsInset } from "./pcd-kickboard-utils";
import { runnerLabel } from "./pcd-drawer-utils";
import { isCustomerOwned, itemTypeLabel } from "./pcd-design-parts";

// The quote editor's own name for a cabinet line. Not in PRODUCT_TYPES because
// a cabinet is priced from a cut list rather than as a board, but it is what
// the editor expects, so it is what a request must carry.
//
// WHAT THE EDITOR DOES WITH EACH TYPE (see applyProductLinePatch in
// app/admin/quotes/[id]/QuoteEditor.js), which is why the builders below are
// shaped the way they are:
//
//   base_cabinet  no width/height, no edge mould, no profile, no hinge fields.
//                 It lands in the Cabinets tab flagged "Needs configuration",
//                 with line.description as its subtitle. Since the conversion
//                 maps description from notes, the notes ARE the brief a
//                 staff member configures the cabinet from.
//   Door          the only type that keeps hinge_holes / hinge_qty. hinge_qty
//                 is parsed for a number to cost the drilling, so it has to
//                 read like "2 hinges".
//   Drawer front  no hinge fields. The runner spec has nowhere structured to
//                 live, so it goes in the notes.
//   Panel         no hinge fields. Which panel it is, and how far it runs,
//                 goes in the notes.
//
// profile_type / profile / edge_mould are re-validated on save against the
// line's material and thickness, so anything invalid is dropped rather than
// stored. That is why material is converted to Title Case before it leaves here.
const CARCASS_PRODUCT_TYPE = "base_cabinet";

function n(value) {
  return Number(value) || 0;
}

function traceLabel(item, roomName) {
  return [item?.label || itemTypeLabel(item), roomName].filter(Boolean).join(" — ");
}

// Board spec for a line. `fallback` is the item itself for a cabinet we are
// making, and NULL for a cabinet the customer already owns: on one of those the
// item-level material/finish/colour describe an IKEA carcass we did not build,
// so falling back to them would put the wrong finish on their new doors. A
// blank there is honest and worth seeing.
// `fallbackThicknessMm` is what the piece is actually made from when the style
// itself does not say. The public colour picker deliberately never asked the
// customer for a thickness, so it wrote none, and EVERY line from a design
// landed with the Thickness column blank. Board prices are held per finish and
// thickness, so a blank there is not cosmetic: the line cannot be priced at all.
// The picker now records the thickness it resolved, and this fallback covers
// designs saved before it did.
function boardFields(style, fallback, fallbackThicknessMm = 0) {
  const s = style || {};
  const rawMaterial = s.material || fallback?.material || "";
  const thicknessMm = Number(s.thickness_mm) || Number(fallbackThicknessMm) || 0;
  return {
    // Title Case, so it matches the quote editor's dropdown. This is the single
    // conversion point for every line this module makes.
    material: rawMaterial ? materialLabelForType(rawMaterial) : "",
    thickness: thicknessMm ? `${thicknessMm}mm` : "",
    finish: s.finish || fallback?.finish || "",
    colour: s.colour || fallback?.colour || "",
    // Which library row the customer picked, so the conversion prices this
    // piece off the exact board rather than re-matching on a colour name.
    colourLibraryId: s.colour_library_id || "",
    supplierName: s.supplier || "",
    profileType: s.profile_type || "",
    profile: s.profile || "",
    edgeMould: s.edge_mould || "",
  };
}

// Board thicknesses these pieces are made from, matching the admin design
// tool's own defaults (see MaterialDefaultsModal): fronts and finished panels
// 18mm, a kitchen carcass 16mm, a bookcase 18mm.
const FRONT_THICKNESS_MM = 18;
const PANEL_THICKNESS_MM = 18;

function carcassThicknessMm(item) {
  return Number(item?.carcass_thickness_mm) || (item?.item_type === "bookcase" ? 18 : 16);
}

// Said once per line rather than left for someone to work out. A front with no
// colour on it is the customer not having chosen yet, which is a thing to ask
// them about rather than a blank to guess at.
function colourNote(board) {
  return board.colour ? "" : "No colour chosen yet — confirm with the customer.";
}

function join(...parts) {
  return parts.filter(Boolean).join(" ");
}

// ── fronts ───────────────────────────────────────────────────────────────────

function doorLine(item, size, board, trace, sectionLabel) {
  const hingeNote =
    size.hingeQty > 0 ? formatHingeNote(size.hingeQty, size.hingePositions, size.height, size.hingeSide) : "";
  const where = sectionLabel ? `${trace} (${sectionLabel})` : trace;
  return {
    productType: "Door",
    productName: "Door",
    width: size.width,
    height: size.height,
    qty: size.qty * (item.qty || 1),
    ...board,
    hingeHoles: size.hingeQty > 0,
    hingeQty: size.hingeQty > 0 ? `${size.hingeQty} hinges` : "",
    notes: join(`Door for ${where}.`, hingeNote, colourNote(board)),
  };
}

function drawerLine(item, size, board, trace, sectionLabel, runnerConfig) {
  const where = sectionLabel ? `${trace} (${sectionLabel})` : trace;
  // Always stated, never conditional on the config being set. The runner is the
  // spec for whoever fits the drawer, so a missing one is the failure that
  // matters, and there is no structured field for it on a quote line.
  const runner = `Runner (supplied with drawer): ${runnerLabel(runnerConfig || {})}.`;
  return {
    productType: "Drawer front",
    productName: "Drawer front",
    width: size.width,
    height: size.height,
    qty: size.qty * (item.qty || 1),
    ...board,
    notes: join(`Drawer front for ${where}.`, runner, colourNote(board)),
  };
}

function doorLines(item, roomName) {
  const trace = traceLabel(item, roomName);
  const owned = isCustomerOwned(item);
  const board = boardFields(item.door_style, owned ? null : item, FRONT_THICKNESS_MM);

  if (item.front_type === "doors") {
    return computeDoorSizes(item).map((size) => doorLine(item, size, board, trace));
  }

  if (item.front_type === "mixed") {
    const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
    const width = frontSizingWidthMm(item);
    const lines = [];
    sections.forEach((section, index) => {
      const type = section?.type || "doors";
      if (type !== "doors") return;
      computeDoorSizesForConfig(section.door || {}, width, section.height_mm).forEach((size) => {
        lines.push(doorLine(item, size, board, trace, `section ${index + 1}`));
      });
    });
    return lines;
  }

  return [];
}

function drawerLines(item, roomName) {
  const trace = traceLabel(item, roomName);
  const owned = isCustomerOwned(item);
  const board = boardFields(item.drawer_style, owned ? null : item, FRONT_THICKNESS_MM);

  if (item.front_type === "drawers") {
    const cfg = item.drawer_config || {};
    return computeDrawerSizes(item).map((size) => drawerLine(item, size, board, trace, "", cfg));
  }

  if (item.front_type === "mixed") {
    const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
    const width = frontSizingWidthMm(item);
    const lines = [];
    sections.forEach((section, index) => {
      if ((section?.type || "doors") !== "drawers") return;
      // Each bay carries its own runner choice, so the note follows the bay.
      const cfg = section.drawer || {};
      computeDrawerSizesForConfig(cfg, width, section.height_mm).forEach((size) => {
        lines.push(drawerLine(item, size, board, trace, `section ${index + 1}`, cfg));
      });
    });
    return lines;
  }

  return [];
}

// ── panels ───────────────────────────────────────────────────────────────────

// A finishing panel is its own finished board over the carcass, not carcass
// material, so it follows finish_panel_style then the door, the same order the
// admin importer uses.
function panelBoard(item) {
  const owned = isCustomerOwned(item);
  const style = item.finish_panel_style || item.door_style || {};
  return boardFields(style, owned ? null : item, PANEL_THICKNESS_MM);
}

function panelLine(item, name, width, height, board, trace, note) {
  return {
    productType: "Panel",
    productName: name,
    width: Math.round(n(width)),
    height: Math.round(n(height)),
    qty: item.qty || 1,
    ...board,
    notes: join(`${name} for ${trace}.`, note, colourNote(board)),
  };
}

// How far a finished panel runs, which is the thing that changes its height and
// is invisible from the size alone.
function panelReach(item) {
  const reach = [];
  if (item.panel_to_floor) reach.push("runs down to the floor");
  if (item.panel_to_ceiling) reach.push("runs up to the ceiling");
  return reach.length ? `Panel ${reach.join(" and ")}.` : "";
}

function endPanelLines(item, roomName, roomHeightMm) {
  const trace = traceLabel(item, roomName);
  const board = panelBoard(item);
  const height = finishPanelVerticalSpanMm(item, roomHeightMm).heightMm || n(item.height_mm);
  const sideDepth = finishedSidePanelDepthMm(item) || n(item.depth_mm);
  const reach = panelReach(item);
  const lines = [];

  if (item.end_panel_left) lines.push(panelLine(item, "End panel (left)", sideDepth, height, board, trace, join("Finished side, depth × height.", reach)));
  if (item.end_panel_right) lines.push(panelLine(item, "End panel (right)", sideDepth, height, board, trace, join("Finished side, depth × height.", reach)));
  if (item.has_back_panel) lines.push(panelLine(item, "Back panel", n(item.width_mm), height, board, trace, join("Finished back.", reach)));
  if (item.has_top_panel) {
    lines.push(panelLine(item, "Top panel", n(item.width_mm), finishedTopPanelDepthMm(item) || n(item.depth_mm), board, trace, "Finished top, width × depth."));
  }
  if (item.has_bottom_panel) {
    lines.push(panelLine(item, "Underside panel", n(item.width_mm), n(item.depth_mm), board, trace, "Finished underside, width × depth."));
  }
  return lines;
}

function fillerLines(item, roomName) {
  const trace = traceLabel(item, roomName);
  const board = panelBoard(item);
  const height = n(item.filler_panel_height_mm);
  return [
    panelLine(
      item,
      "Filler panel",
      n(item.width_mm),
      height,
      board,
      trace,
      height
        ? "Closes the gap above the cabinet."
        : "Closes the gap above the cabinet. HEIGHT NOT SET — measure on site before cutting."
    ),
  ];
}

function kickboardLines(item, roomName) {
  const trace = traceLabel(item, roomName);
  const owned = isCustomerOwned(item);
  // A kickboard normally matches the doors, which is what the customer sees.
  // Its own board is thinner than a front, so it prices off its own thickness
  // rather than the door's.
  const board = boardFields(
    item.kickboard_style || item.door_style,
    owned ? null : item,
    Number(item.kickboard_thickness_mm) || 16
  );
  // A bookcase's plinth is a rail housed between its sides, not a board across
  // the front, so it is named and noted differently.
  const inset = kickboardIsInset(item);
  const name = inset ? "Plinth rail" : "Kickboard";
  const note = inset
    ? "Plinth rail, set back between the sides under the bottom shelf."
    : "Kickboard across the front. Quoted per cabinet, so merge it if this run is continuous.";
  return [
    panelLine(item, name, n(item.width_mm), n(item.kickboard_height_mm) || 120, board, trace, note),
  ];
}

// A standalone panel, floating shelf or shelf & rail IS the item, so it makes
// one line at its own finished size. A panel keeps its face width in depth_mm.
function bodyLines(item, roomName) {
  const trace = traceLabel(item, roomName);
  const isPanel = item.item_type === "panel";
  // A standalone panel or shelf keeps its finish on the item itself, so the
  // thickness comes from the item's own board field rather than a style blob.
  const board = boardFields(
    item.door_style,
    item,
    Number(item.panel_thickness_mm) || carcassThicknessMm(item)
  );
  const width = isPanel ? n(item.depth_mm) : n(item.width_mm);
  const name = itemTypeLabel(item);
  return [
    {
      productType: "Panel",
      productName: name,
      width: Math.round(width),
      height: Math.round(n(item.height_mm)),
      qty: item.qty || 1,
      ...board,
      notes: join(`${name} — ${trace}.`, colourNote(board)),
    },
  ];
}

// ── carcass ──────────────────────────────────────────────────────────────────

// A cabinet line carries NO width or height, deliberately, matching the admin
// importer. A cabinet is priced from its cut list, and the quote editor's
// auto-cost path is rate x (W x H / 1e6): real dimensions here would let it
// silently reprice a carcass as a flat sheet. The size goes in the notes where
// a person reads it instead.
function carcassLines(item, roomName) {
  const trace = traceLabel(item, roomName);
  const width = Math.round(n(item.width_mm));
  const height = Math.round(n(item.height_mm));
  const depth = Math.round(n(item.depth_mm));
  const shelves = n(item.shelf_qty);
  const mount = n(item.mount_height_mm);

  // This note becomes the line's description, which the Cabinets tab shows
  // under the cabinet name while it reads "Needs configuration". So it is the
  // brief someone configures from, and everything they would otherwise have to
  // open the design to find belongs here.
  const spec = [
    `${width} wide × ${height} high × ${depth} deep.`,
    item.carcass_thickness_mm ? `${item.carcass_thickness_mm}mm carcass board.` : "",
    shelves ? `${shelves} ${shelves === 1 ? "shelf" : "shelves"}.` : "No shelves.",
    item.back_panel_included === false ? "No back." : "Back included.",
    item.item_type === "wall_cabinet" && mount ? `Hangs ${mount}mm off the floor.` : "",
    item.secondary_width_mm ? `Corner, second leg ${Math.round(n(item.secondary_width_mm))}mm.` : "",
    item.has_rangehood ? "Rangehood housing." : "",
  ];

  return [
    {
      productType: CARCASS_PRODUCT_TYPE,
      productName: item.label || itemTypeLabel(item),
      material: item.material ? materialLabelForType(item.material) : "",
      thickness: item.carcass_thickness_mm ? `${item.carcass_thickness_mm}mm` : "",
      finish: item.finish || "",
      colour: item.colour || "",
      qty: item.qty || 1,
      // No width/height, no profile, no edge mould, no hinge fields. The editor
      // blanks all of those on a cabinet line anyway, and real dimensions here
      // would let its auto-cost reprice a carcass as a flat sheet.
      notes: join(`${itemTypeLabel(item)} for ${trace}.`, ...spec),
    },
  ];
}

// ── entry point ──────────────────────────────────────────────────────────────

const BUILDERS = {
  carcass: (item, ctx) => carcassLines(item, ctx.roomName),
  doors: (item, ctx) => doorLines(item, ctx.roomName),
  drawers: (item, ctx) => drawerLines(item, ctx.roomName),
  endpanels: (item, ctx) => endPanelLines(item, ctx.roomName, ctx.roomHeightMm),
  filler: (item, ctx) => fillerLines(item, ctx.roomName),
  kickboard: (item, ctx) => kickboardLines(item, ctx.roomName),
  body: (item, ctx) => bodyLines(item, ctx.roomName),
};

// One item plus the parts the customer ticked, in the order the parts are
// offered, so the request reads down the cabinet the way they chose it.
export function requestLinesForItem(item, wantedKeys, ctx = {}) {
  const keys = Array.isArray(wantedKeys) ? wantedKeys : [];
  const lines = [];
  keys.forEach((key) => {
    const build = BUILDERS[key];
    if (!build) return;
    lines.push(...build(item, ctx));
  });
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
