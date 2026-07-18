import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { saveQuoteLine, deleteQuoteLine } from "../../../../quotes/[id]/_quote-line-save";
import { roundMoney } from "../../../../../../../lib/pcd-quote-utils";
import { calculateCabinetTotals, normalizeCabinetConfig } from "../../../../../../../lib/pcd-cabinet-utils";
import { computeKickboardRun, kickboardOffsetMm } from "../../../../../../../lib/pcd-kickboard-utils";
import { computeBackPanelRun, splitBackPanelWidths, backPanelSegment } from "../../../../../../../lib/pcd-backpanel-utils";
import { computeBottomPanelRun, bottomPanelSegment } from "../../../../../../../lib/pcd-bottompanel-utils";
import { computeFillerPanelRun, fillerPanelSegment, fillerPanelGapMm } from "../../../../../../../lib/pcd-fillerpanel-utils";
import { computeDoorSizes, computeDoorSizesForConfig, computeDrawerSizes, computeDrawerSizesForConfig, computeCornerDoorLeaves, formatHingeNote, frontWidthMm } from "../../../../../../../lib/pcd-door-utils";
import { runnerLabel } from "../../../../../../../lib/pcd-drawer-utils";
import { materialLabelForType } from "../../../../../../../lib/pcd-colour-library";
import { bottomPanelThicknessMm } from "../../../../../../../lib/pcd-finishpanel-utils";
import { floatingShelfBoards, floatingShelfStyle } from "../../../../../../../lib/pcd-floating-shelf-utils";
import { missingReason, mergeIdenticalLines } from "../../../../../../../lib/pcd-import-utils";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet", "blind_corner_cabinet"];

const TYPE_LABELS = {
  base_cabinet: "Base Cabinet",
  wall_cabinet: "Wall Cabinet",
  tall_cabinet: "Tall Cabinet",
  corner_base_cabinet: "Corner Base Cabinet",
  blind_corner_cabinet: "Blind Corner Cabinet",
  door: "Door",
  drawer_front: "Drawer Front",
  panel: "Panel",
  scribe: "Scribe",
};

// Quote line product_type must match the casing the quote editor's own
// dropdown uses (PRODUCT_TYPES in lib/quote-form-data.js), otherwise the
// imported line's Product Type field shows blank until manually reselected.
// scribe imports as a "Panel" quote line, same product type as panel — it's
// only a distinct item_type so the design tool can dictate its own
// drag/snap/render rules, not a distinct cost category in the quote editor.
const QUOTE_PRODUCT_TYPES = {
  door: "Door",
  drawer_front: "Drawer front",
  panel: "Panel",
  scribe: "Panel",
};

function itemLabel(item) {
  return item.label || TYPE_LABELS[item.item_type] || item.item_type;
}

// A cabinet's qty means "make N identical cabinets", so every line it
// generates — carcass, fronts, panels — scales with it. Previously only the
// carcass and corner doors did, so a qty-2 cabinet billed 2 carcasses with
// one set of doors and one kickboard.
function perCabinetQty(item) {
  return item.qty || 1;
}

// The exception: a line merged across a continuous multi-cabinet RUN. That
// board's length comes from the run's geometry on the plan, which only knows
// about the one cabinet actually drawn there — there's nowhere for a second
// copy to sit, so multiplying its share of a shared board would invent
// material that doesn't exist. Left at 1 and surfaced as a warning instead
// of guessed at (see the qty-in-a-run check in the pre-flight pass).
function runAwareQty(item, runCount) {
  return runCount > 1 ? 1 : perCabinetQty(item);
}

// Which of this cabinet's panels are merged into a continuous run shared with
// OTHER cabinets. Those lines can't honour qty (see runAwareQty), so rather
// than silently pick an interpretation, a qty > 1 cabinet in a run is
// surfaced in the pre-flight confirmation for the user to resolve.
function sharedRunPanels(item, selectedCabinetItems, room) {
  const shared = [];
  const isContinuous = (span) => (span || "continuous") === "continuous";

  if (item.has_kickboard && item.item_type !== "wall_cabinet" && isContinuous(item.kickboard_span)) {
    const { legs } = computeKickboardRun(item, selectedCabinetItems, room);
    if (legs.some((leg) => leg.count > 1)) shared.push("kickboard");
  }
  if (item.has_filler_panel &&
      (item.item_type === "wall_cabinet" || item.item_type === "tall_cabinet") &&
      isContinuous(item.filler_panel_span) &&
      computeFillerPanelRun(item, selectedCabinetItems).count > 1) {
    shared.push("filler panel");
  }
  if (item.has_back_panel && isContinuous(item.back_panel_span) &&
      computeBackPanelRun(item, selectedCabinetItems).count > 1) {
    shared.push("back panel");
  }
  if (item.has_bottom_panel && item.item_type === "wall_cabinet" &&
      isContinuous(item.bottom_panel_span) &&
      computeBottomPanelRun(item, selectedCabinetItems).count > 1) {
    shared.push("underside panel");
  }
  return shared;
}

function cabinetDescription(config) {
  const shelfText =
    Number(config.shelf_qty) > 0
      ? `, ${config.shelf_qty} ${Number(config.shelf_qty) === 1 ? "shelf" : "shelves"}`
      : "";
  const widthText = config.is_corner && Number(config.secondary_width_mm) > 0
    ? `${config.width_mm}mm x ${config.secondary_width_mm}mm corner`
    : `${config.width_mm}mm wide`;
  return `${widthText} x ${config.height_mm}mm high x ${config.depth_mm}mm deep - ${config.carcass_material || "cabinet board"} ${config.carcass_thickness_mm}mm carcass${shelfText}`;
}

function withCalculatedCabinetCost(line) {
  const config = normalizeCabinetConfig(line.cabinet_config || {});
  const totals = calculateCabinetTotals(config);
  const unitCost = totals.calculated_material_cost_ex_gst;
  const label = String(line.product_name || config.label || "").trim() || "Base cabinet";

  return {
    ...line,
    product_name: label,
    description: line.description || cabinetDescription({ ...config, label }),
    product_unit_cost_ex_gst: unitCost,
    calculated_unit_cost_ex_gst: unitCost,
    cabinet_config: {
      ...(line.cabinet_config || {}),
      ...config,
      label,
      notes: line.cabinet_config?.notes || line.notes || "",
      calculated_cut_list: totals.cut_list,
      calculated_material_cost_ex_gst: totals.calculated_material_cost_ex_gst,
      labour_hours: totals.labour_hours,
      total_cabinet_cost_ex_gst: unitCost,
    },
  };
}

// Cabinet imports must use the full cut-list calculation. Flat doors/panels
// still use the quote editor's width x height x sqm-rate calculation below.
function withCalculatedUnitCost(line) {
  if (line.product_type === "base_cabinet" && line.cabinet_config) {
    return withCalculatedCabinetCost(line);
  }

  const width = Number(line.width_mm) || 0;
  const height = Number(line.height_mm) || 0;
  const rate = Number(line.unit_cost_per_sqm_ex_gst) || 0;
  const areaSqm = width > 0 && height > 0 ? (width * height) / 1000000 : 0;
  const calculated = rate > 0 && areaSqm > 0 ? roundMoney(areaSqm * rate) : 0;

  return {
    ...line,
    // The design tool's material picker stores lowercase values
    // ("decorative board"); Door/Drawer front/Panel quote lines are matched
    // against the quote editor's Title Case vocabulary ("Decorative Board")
    // for material/thickness/profile/edge-mould selection, so convert here —
    // the one place every non-cabinet line passes through before saving.
    material: materialLabelForType(line.material || ""),
    calculated_unit_cost_ex_gst: calculated,
    product_unit_cost_ex_gst:
      line.unit_cost_mode === "auto" && calculated > 0 ? calculated : line.product_unit_cost_ex_gst || 0,
  };
}

function designItemToLine(item) {
  const isCabinet = CABINET_TYPES.includes(item.item_type);
  // A standalone panel stores its on-edge material thickness in width_mm
  // (see the "panel" case in AddItemForm/DesignRightPanel.js — width_mm is
  // repurposed for plan-view footprint, not an along-wall span), with its
  // actual finished width/length in depth_mm instead. Every other item type
  // uses width_mm as a real width, so only panels need this swap.
  const isPanel = item.item_type === "panel";
  const line = {
    product_type: isCabinet ? "base_cabinet" : (QUOTE_PRODUCT_TYPES[item.item_type] || item.item_type),
    // itemLabel, not item_type: an unlabelled wall cabinet used to import with
    // the product name "wall_cabinet" — the raw column value, straight onto
    // the quote. TYPE_LABELS existed for exactly this and every description
    // already used it; only this one line bypassed it.
    product_name: itemLabel(item),
    // A cabinet line carries NO dimensions, deliberately — the same state the
    // quote editor forces on its own cabinet lines (applyProductLinePatch
    // blanks width_mm/height_mm when product_type becomes base_cabinet).
    //
    // A cabinet is priced from its cut list, not as a flat W×H sheet. But the
    // editor's auto-cost path is `rate × (W × H / 1e6)`, and it overwrites
    // product_unit_cost_ex_gst whenever that comes out above zero. Blank
    // dimensions are what keep it at zero and leave the cut-list total alone.
    // Writing real dimensions here armed it: re-picking the carcass colour
    // patches the sqm rate, re-runs the auto calc, and silently repriced a
    // 900×720 carcass from its $139.50 cut-list cost to $29.16 as a flat
    // sheet — no warning, no undo affordance. The cabinet's real dimensions
    // live in cabinet_config and its description.
    ...(isCabinet
      ? {}
      : { width_mm: isPanel ? item.depth_mm : item.width_mm, height_mm: item.height_mm }),
    qty: item.qty || 1,
    material: item.material,
    finish: item.finish,
    colour: item.colour,
    notes: item.notes,
    unit_cost_mode: item.unit_cost_mode || "auto",
  };

  if (isCabinet) {
    const shelfMaterial = item.shelf_material || item.material;
    const shelfFinish = item.shelf_finish || item.finish;
    const shelfColour = item.shelf_colour || item.colour;
    // "Manual (override)" on the cabinet's Boards tab sets a per-sqm rate
    // that replaces the carcass board rate for this cabinet's cut list — for
    // a one-off board, a special order, whatever the picker's rate can't
    // express. It was persisted and then never read back here, so the line
    // imported labelled "manual" while priced at the auto rate: the override
    // silently did nothing. The shelf keeps its own rate, which already has
    // its own field and its own fallback.
    const manualRate = item.unit_cost_mode === "manual"
      ? Number(item.unit_cost_per_sqm_ex_gst) || 0
      : 0;
    const carcassRate = manualRate > 0 ? manualRate : (Number(item.cost_per_sqm_carcass) || 0);
    const shelfCost = Number(item.cost_per_sqm_shelf || 0) || carcassRate || 0;

    line.unit_cost_per_sqm_ex_gst = carcassRate;
    line.thickness = item.carcass_thickness_mm ? `${item.carcass_thickness_mm}mm` : "";
    line.cabinet_config = {
      label: item.label,
      is_corner: item.item_type === "corner_base_cabinet",
      width_mm: item.width_mm,
      secondary_width_mm: item.secondary_width_mm,
      height_mm: item.height_mm,
      depth_mm: item.depth_mm,
      carcass_material: item.material,
      carcass_finish: item.finish,
      carcass_colour: item.colour,
      carcass_thickness_mm: item.carcass_thickness_mm ?? 16,
      back_panel_included: item.back_panel_included ?? true,
      back_panel_material: item.material,
      back_panel_thickness_mm: item.back_panel_thickness_mm ?? 16,
      shelf_qty: item.shelf_qty ?? 0,
      shelf_material: shelfMaterial,
      shelf_finish: shelfFinish,
      shelf_colour: shelfColour,
      shelf_thickness_mm: item.shelf_thickness_mm ?? 16,
      shelf_heights_mm: item.shelf_heights_mm || [],
      has_rangehood: item.has_rangehood ?? false,
      rangehood_housing_height_mm: item.rangehood_housing_height_mm ?? 0,
      rangehood_channel_width_mm: item.rangehood_channel_width_mm ?? 0,
      mount_height_mm: item.mount_height_mm ?? null,
      cost_per_sqm_carcass: carcassRate,
      cost_per_sqm_shelf: shelfCost,
      notes: item.notes,
    };
  } else {
    line.thickness = item.thickness;
    line.profile_type = item.profile_type;
    line.profile = item.profile;
    line.edge_mould = item.edge_mould;
    line.hinge_holes = item.hinge_holes;
    line.hinge_supply = item.hinge_supply;
    line.hinge_qty = item.hinge_qty;
    line.unit_cost_per_sqm_ex_gst = item.unit_cost_per_sqm_ex_gst || 0;
  }

  return line;
}

// Doors are imported as standalone quote lines (not nested in cabinet_config),
// grouped per cabinet, one line per unique door size + hinge setup on that cabinet.
function doorLinesForCabinet(item, roomName, { cabinetIncluded = true } = {}) {
  if (item.front_type !== "doors") return [];

  const style = item.door_style || {};
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");
  const sizes = computeDoorSizes(item);
  const scopeNote = cabinetIncluded
    ? ""
    : "Door/drawer supply only — base cabinet is out of scope for this quote.";

  return sizes.map((size) => {
    const hingeNote = size.hingeQty > 0 ? formatHingeNote(size.hingeQty, size.hingePositions, size.height, size.hingeSide) : "";

    return {
      product_type: QUOTE_PRODUCT_TYPES.door,
      product_name: "Door",
      description: traceLabel ? `Doors — ${traceLabel}` : "Doors",
      notes: [scopeNote, hingeNote].filter(Boolean).join(" "),
      width_mm: size.width,
      height_mm: size.height,
      qty: size.qty * (item.qty || 1),
      material: style.material || "",
      finish: style.finish || "",
      colour: style.colour || "",
      thickness: style.thickness_mm ? `${style.thickness_mm}mm` : "",
      profile_type: style.profile_type || "",
      profile: style.profile || "",
      edge_mould: style.edge_mould || "",
      unit_cost_per_sqm_ex_gst: style.cost_per_sqm || 0,
      unit_cost_mode: "auto",
      hinge_holes: size.hingeQty > 0,
      hinge_qty: size.hingeQty > 0 ? `${size.hingeQty} hinges` : "",
    };
  });
}

// A corner cabinet's door is one bi-fold unit split into two leaves — one
// per wall it touches — rather than the columns/rows grid regular cabinets
// use. Each leaf becomes its own line (their widths normally differ: leg
// width minus the shared depth_mm). Only the frame-hinged leaf
// (door_config.hinge_wall) gets hinge_holes/hinge_qty and drilling notes —
// the other leaf folds off it, with no independent frame drilling.
function cornerDoorLinesForCabinet(item, roomName, { cabinetIncluded = true } = {}) {
  if (item.front_type !== "doors") return [];

  const style = item.door_style || {};
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");
  const scopeNote = cabinetIncluded
    ? ""
    : "Door/drawer supply only — base cabinet is out of scope for this quote.";

  return computeCornerDoorLeaves(item).map((leaf) => {
    const hingeNote = leaf.isHingeLeaf && leaf.hingeQty > 0
      ? formatHingeNote(leaf.hingeQty, leaf.hingePositions, leaf.heightMm)
      : "Fold-hinged to the other leaf — no frame drilling on this leaf.";

    return {
      product_type: QUOTE_PRODUCT_TYPES.door,
      product_name: "Corner Door Leaf",
      description: traceLabel ? `Corner door — ${traceLabel} (${leaf.wallLabel} wall)` : `Corner door (${leaf.wallLabel} wall)`,
      notes: [scopeNote, hingeNote].filter(Boolean).join(" "),
      width_mm: leaf.widthMm,
      height_mm: leaf.heightMm,
      qty: item.qty || 1,
      material: style.material || "",
      finish: style.finish || "",
      colour: style.colour || "",
      thickness: style.thickness_mm ? `${style.thickness_mm}mm` : "",
      profile_type: style.profile_type || "",
      profile: style.profile || "",
      edge_mould: style.edge_mould || "",
      unit_cost_per_sqm_ex_gst: style.cost_per_sqm || 0,
      unit_cost_mode: "auto",
      hinge_holes: leaf.isHingeLeaf && leaf.hingeQty > 0,
      hinge_qty: leaf.isHingeLeaf && leaf.hingeQty > 0 ? `${leaf.hingeQty} hinges` : "",
    };
  });
}

// Drawers are imported the same way doors are — one line per unique front
// size on the cabinet, runner type carried as a note (no separate hardware
// line, matching how hinge_qty is just a note on the door line).
function drawerLinesForCabinet(item, roomName, { cabinetIncluded = true } = {}) {
  if (item.front_type !== "drawers") return [];

  const style = item.drawer_style || {};
  const cfg = item.drawer_config || {};
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");
  const scopeNote = cabinetIncluded
    ? ""
    : "Door/drawer supply only — base cabinet is out of scope for this quote.";
  // Always present — never `cfg.runner_type ? … : ""`. The runner is the spec
  // for whoever fits the drawer, so a blank one is the failure that matters.
  const runnerNote = `Runner (supplied with drawer): ${runnerLabel(cfg)}.`;

  return computeDrawerSizes(item).map((size) => ({
    product_type: QUOTE_PRODUCT_TYPES.drawer_front,
    product_name: "Drawer Front",
    description: traceLabel ? `Drawers — ${traceLabel}` : "Drawers",
    notes: [scopeNote, runnerNote].filter(Boolean).join(" "),
    width_mm: size.width,
    height_mm: size.height,
    qty: size.qty * (item.qty || 1),
    material: style.material || "",
    finish: style.finish || "",
    colour: style.colour || "",
    thickness: style.thickness_mm ? `${style.thickness_mm}mm` : "",
    profile_type: style.profile_type || "",
    profile: style.profile || "",
    edge_mould: style.edge_mould || "",
    unit_cost_per_sqm_ex_gst: style.cost_per_sqm || 0,
    unit_cost_mode: "auto",
  }));
}

// A "mixed" cabinet's front is a top-to-bottom stack of independent
// sections, each its own door or drawer bank (see section_config in
// pcd_design_tool_v8.sql) — style stays cabinet-wide (door_style/
// drawer_style), matching every door-type section to one finish and every
// drawer-type section to another, rather than letting each section pick
// its own. Each section becomes its own set of lines, labelled by section
// number so they're traceable back to their position in the cabinet.
function mixedLinesForCabinet(item, roomName, { cabinetIncluded = true, includeDoors = true, includeDrawers = true } = {}) {
  if (item.front_type !== "mixed") return [];

  const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
  const doorStyle = item.door_style || {};
  const drawerStyle = item.drawer_style || {};
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");
  const scopeNote = cabinetIncluded
    ? ""
    : "Door/drawer supply only — base cabinet is out of scope for this quote.";
  // frontWidthMm, not width_mm: a blind corner's fronts only span the part
  // that isn't dead space behind the return cabinet.
  const widthMm = frontWidthMm(item);

  const lines = [];
  sections.forEach((sec, idx) => {
    const sectionLabel = `Section ${idx + 1}`;
    const heightMm = sec.height_mm;

    if (sec.type === "drawers") {
      if (!includeDrawers) return;
      const cfg = sec.drawer || {};
      const runnerNote = `Runner (supplied with drawer): ${runnerLabel(cfg)}.`;
      computeDrawerSizesForConfig(cfg, widthMm, heightMm).forEach((size) => {
        lines.push({
          product_type: QUOTE_PRODUCT_TYPES.drawer_front,
          product_name: "Drawer Front",
          description: traceLabel ? `Drawers — ${traceLabel} (${sectionLabel})` : `Drawers (${sectionLabel})`,
          notes: [scopeNote, runnerNote].filter(Boolean).join(" "),
          width_mm: size.width,
          height_mm: size.height,
          qty: size.qty * (item.qty || 1),
          material: drawerStyle.material || "",
          finish: drawerStyle.finish || "",
          colour: drawerStyle.colour || "",
          thickness: drawerStyle.thickness_mm ? `${drawerStyle.thickness_mm}mm` : "",
          profile_type: drawerStyle.profile_type || "",
          profile: drawerStyle.profile || "",
          edge_mould: drawerStyle.edge_mould || "",
          unit_cost_per_sqm_ex_gst: drawerStyle.cost_per_sqm || 0,
          unit_cost_mode: "auto",
        });
      });
    } else if (sec.type === "open") {
      // Blank space (e.g. an oven/microwave recess) — no board to cut, no line to quote.
    } else {
      if (!includeDoors) return;
      const cfg = sec.door || {};
      computeDoorSizesForConfig(cfg, widthMm, heightMm).forEach((size) => {
        const hingeNote = size.hingeQty > 0 ? formatHingeNote(size.hingeQty, size.hingePositions, size.height, size.hingeSide) : "";
        lines.push({
          product_type: QUOTE_PRODUCT_TYPES.door,
          product_name: "Door",
          description: traceLabel ? `Doors — ${traceLabel} (${sectionLabel})` : `Doors (${sectionLabel})`,
          notes: [scopeNote, hingeNote].filter(Boolean).join(" "),
          width_mm: size.width,
          height_mm: size.height,
          qty: size.qty * (item.qty || 1),
          material: doorStyle.material || "",
          finish: doorStyle.finish || "",
          colour: doorStyle.colour || "",
          thickness: doorStyle.thickness_mm ? `${doorStyle.thickness_mm}mm` : "",
          profile_type: doorStyle.profile_type || "",
          profile: doorStyle.profile || "",
          edge_mould: doorStyle.edge_mould || "",
          unit_cost_per_sqm_ex_gst: doorStyle.cost_per_sqm || 0,
          unit_cost_mode: "auto",
          hinge_holes: size.hingeQty > 0,
          hinge_qty: size.hingeQty > 0 ? `${size.hingeQty} hinges` : "",
        });
      });
    }
  });
  return lines;
}

// Kickboards are imported as a standalone "Panel" line per cabinet leg,
// except continuous multi-cabinet runs (mirroring the left panel's own
// cut-list grouping — see lib/pcd-kickboard-utils.js), which collapse into
// a single line spanning the whole run's total width. Only emitted once, by
// the first cabinet in that run that's actually selected for import, so a
// partially selected run neither double-counts nor silently disappears.
// A corner cabinet contributes up to TWO lines (one per open leg) — the
// corner-square return has no front face and never gets a kickboard, and
// the two legs are on different walls at a right angle so they can never
// share one continuous board, even with each other.
function kickboardLinesForCabinet(item, selectedCabinetItems, roomName, room) {
  if (!item.has_kickboard || item.item_type === "wall_cabinet") return [];

  const isCorner = item.item_type === "corner_base_cabinet";
  // computeKickboardRun only ever merges a leg into a multi-cabinet run when
  // both it and its neighbours are continuous-span — an "individual" span
  // item never matches any run, so leg.count is naturally 1 and totalWidth
  // is just that leg's own open width, with no special-casing needed here.
  const { legs } = computeKickboardRun(item, selectedCabinetItems, room);
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");

  const lines = [];
  for (const leg of legs) {
    if (leg.count > 1 && (leg.firstItemId !== item.id || leg.firstLeg !== leg.leg)) continue; // covered by the run's first cabinet
    const widthMm = leg.totalWidth;
    const legSuffix = isCorner ? (leg.leg === "secondary" ? " (Wall 2)" : " (Wall 1)") : "";
    lines.push({
      product_type: "Panel",
      product_name: "Kickboard",
      description: traceLabel ? `Kickboard — ${traceLabel}${legSuffix}` : `Kickboard${legSuffix}`,
      notes: "Kickboard panel.",
      width_mm: widthMm,
      height_mm: item.kickboard_height_mm || 120,
      qty: runAwareQty(item, leg.count),
      material: item.material || "",
      finish: item.finish || "",
      colour: item.colour || "",
      thickness: item.kickboard_thickness_mm ? `${item.kickboard_thickness_mm}mm` : "",
      unit_cost_per_sqm_ex_gst: item.cost_per_sqm_carcass || 0,
      unit_cost_mode: "auto",
    });
  }
  return lines;
}

// Filler panels are imported as a standalone "Panel" line, the mirror of
// kickboardLinesForCabinet above — closes the gap above a wall or tall
// cabinet (to the ceiling, or the nearest obstruction above it if closer)
// instead of the floor-level toe-kick. There's no corner wall/tall cabinet
// variant, so (unlike kickboard) this is always a single segment, no
// leg-splitting. Continuous multi-cabinet runs (mirroring the left panel's
// own cut-list grouping — see lib/pcd-fillerpanel-utils.js) collapse into a
// single line spanning the whole run's total width, emitted once by the
// first cabinet in that run that's actually selected for import.
// `allRoomItems` must include obstructions (unlike selectedCabinetItems,
// which is cabinets-only) so the gap calc can detect one sitting above.
function fillerPanelLinesForCabinet(item, selectedCabinetItems, roomName, room, allRoomItems) {
  if (!item.has_filler_panel || (item.item_type !== "wall_cabinet" && item.item_type !== "tall_cabinet")) return [];

  const span = item.filler_panel_span || "continuous";
  const heightMm = item.filler_panel_height_mm ?? fillerPanelGapMm(item, room, allRoomItems);
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");

  let widthMm;
  let runCount = 1;
  if (span === "continuous") {
    const run = computeFillerPanelRun(item, selectedCabinetItems);
    if (run.count > 1 && run.firstItemId !== item.id) return []; // covered by the run's first cabinet
    widthMm = run.totalWidth;
    runCount = run.count;
  } else {
    const seg = fillerPanelSegment(item);
    widthMm = seg?.length || item.width_mm || 600;
  }

  return [{
    product_type: "Panel",
    product_name: "Filler Panel",
    description: traceLabel ? `Filler Panel — ${traceLabel}` : "Filler Panel",
    notes: "Filler panel — closes the gap to the ceiling.",
    width_mm: widthMm,
    height_mm: heightMm,
    qty: runAwareQty(item, runCount),
    material: item.material || "",
    finish: item.finish || "",
    colour: item.colour || "",
    thickness: item.filler_panel_thickness_mm ? `${item.filler_panel_thickness_mm}mm` : "",
    unit_cost_per_sqm_ex_gst: item.cost_per_sqm_carcass || 0,
    unit_cost_mode: "auto",
  }];
}

// Underside panels are imported as a standalone "Panel" line, the
// wall-cabinet mirror of the back-panel portion of
// endBackPanelLinesForCabinet below — finishes the visible UNDERSIDE of a
// wall cabinet (or a continuous run of them) instead of a floor-standing
// cabinet's back face. Since it sits flat under the cabinet, its two
// dimensions are width × depth, not width × height. A continuous run
// collapses to the run's total width, split into the run-owner's chosen
// panel count, each its own line; only emitted once, by the run's first
// cabinet that's actually selected for import.
// Resolves the finishing-panel board (material + rate) for a cabinet's finished
// end/side/back/underside panels. A finishing panel is its own finished board
// over the carcass — not carcass material — so it uses finish_panel_style,
// falling back to the door/front material (its normal match), then carcass.
function finishPanelBoard(item) {
  const fp = item.finish_panel_style || {};
  const d = item.door_style || {};
  return {
    material: fp.material || d.material || item.material || "",
    finish: fp.finish || d.finish || item.finish || "",
    colour: fp.colour || d.colour || item.colour || "",
    thicknessMm: fp.thickness_mm || d.thickness_mm || item.carcass_thickness_mm || null,
    rate: Number(fp.cost_per_sqm) || Number(d.cost_per_sqm) || Number(item.cost_per_sqm_carcass) || 0,
  };
}

function bottomPanelLinesForCabinet(item, selectedCabinetItems, roomName) {
  if (!item.has_bottom_panel || item.item_type !== "wall_cabinet") return [];

  const lines = [];
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");
  const depthMm = item.depth_mm || 600;
  const board = finishPanelBoard(item);

  function pushPanel(name, widthMm, qty = perCabinetQty(item)) {
    lines.push({
      product_type: "Panel",
      product_name: name,
      description: traceLabel ? `${name} — ${traceLabel}` : name,
      notes: "Finished underside panel.",
      width_mm: widthMm,
      height_mm: depthMm,
      qty,
      material: board.material,
      finish: board.finish,
      colour: board.colour,
      thickness: board.thicknessMm ? `${board.thicknessMm}mm` : "",
      unit_cost_per_sqm_ex_gst: board.rate,
      unit_cost_mode: "auto",
    });
  }

  const span = item.bottom_panel_span || "continuous";
  if (span === "continuous") {
    const run = computeBottomPanelRun(item, selectedCabinetItems);
    if (run.count <= 1 || run.firstItemId === item.id) {
      const widths = splitBackPanelWidths(run.totalWidth, item.bottom_panel_qty || 1);
      widths.forEach((w, i) =>
        pushPanel(
          widths.length > 1 ? `Underside Panel ${i + 1} of ${widths.length}` : "Underside Panel",
          w,
          runAwareQty(item, run.count)
        )
      );
    }
    // Otherwise covered by the run's first cabinet — omit here
  } else {
    const seg = bottomPanelSegment(item);
    pushPanel("Underside Panel", seg?.length || item.width_mm || 600);
  }

  return lines;
}

// End & back panels — mirrors the left panel's cut-list logic (see
// lib/pcd-backpanel-utils.js). Only base_cabinet/tall_cabinet get these —
// a corner cabinet's "back" isn't a single well-defined side, and wall
// cabinets aren't floor-standing. A continuous back panel run collapses to
// the run's total width, split into the run-owner's chosen panel count,
// each its own line; only emitted once, by the run's first cabinet that's
// actually selected for import.
function endBackPanelLinesForCabinet(item, selectedCabinetItems, roomName) {
  const isBaseTall = ["base_cabinet", "tall_cabinet"].includes(item.item_type);
  const isWall = item.item_type === "wall_cabinet";
  if (!isBaseTall && !isWall) return [];

  const lines = [];
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");

  // Wall cabinets: finished SIDE panels only (depth × height). When a finished
  // underside panel is present, the side panels extend down by its thickness
  // to cover its exposed edge. That thickness is the underside panel's own
  // board — it used to read carcass_thickness_mm, which is a different board
  // from the one bottomPanelLinesForCabinet() actually cuts, so the sides came
  // up short whenever the finish panel was the thicker of the two. No back
  // panel/kickboard — wall cabinets aren't floor-standing. Priced like the
  // base/tall end panels (carcass material + rate) so quotes stay consistent.
  if (isWall) {
    if (!item.end_panel_left && !item.end_panel_right) return [];
    const underThk = bottomPanelThicknessMm(item);
    const sideH = (Number(item.height_mm) || 0) + underThk;
    const board = finishPanelBoard(item);
    const pushSide = (name) => lines.push({
      product_type: "Panel",
      product_name: name,
      description: traceLabel ? `${name} — ${traceLabel}` : name,
      notes: "Finished panel.",
      width_mm: item.depth_mm || 600,
      height_mm: sideH,
      qty: perCabinetQty(item),
      material: board.material,
      finish: board.finish,
      colour: board.colour,
      thickness: board.thicknessMm ? `${board.thicknessMm}mm` : "",
      unit_cost_per_sqm_ex_gst: board.rate,
      unit_cost_mode: "auto",
    });
    if (item.end_panel_left)  pushSide("Side Panel (Left)");
    if (item.end_panel_right) pushSide("Side Panel (Right)");
    return lines;
  }

  // kickboardOffsetMm, not kickboard_height_mm: the column defaults to 120
  // whether or not has_kickboard is set, so ticking "panels run to floor" on
  // a cabinet WITHOUT a kickboard billed a phantom 120mm of extra board.
  // With no kickboard the carcass already sits on the floor — there's
  // nothing for the panel to run down past.
  const panelH = (Number(item.height_mm) || 0) + (item.panel_to_floor ? kickboardOffsetMm(item) : 0);
  const board = finishPanelBoard(item);

  // End panels are per-cabinet; a continuous back panel may be shared across
  // a run, so the caller passes its qty explicitly in that case.
  function pushPanel(name, widthMm, qty = perCabinetQty(item)) {
    lines.push({
      product_type: "Panel",
      product_name: name,
      description: traceLabel ? `${name} — ${traceLabel}` : name,
      notes: "Finished panel.",
      width_mm: widthMm,
      height_mm: panelH,
      qty,
      material: board.material,
      finish: board.finish,
      colour: board.colour,
      thickness: board.thicknessMm ? `${board.thicknessMm}mm` : "",
      unit_cost_per_sqm_ex_gst: board.rate,
      unit_cost_mode: "auto",
    });
  }

  if (item.end_panel_left)  pushPanel("End Panel (Left)", item.depth_mm || 600);
  if (item.end_panel_right) pushPanel("End Panel (Right)", item.depth_mm || 600);

  if (item.has_back_panel) {
    const span = item.back_panel_span || "continuous";
    if (span === "continuous") {
      const run = computeBackPanelRun(item, selectedCabinetItems);
      if (run.count <= 1 || run.firstItemId === item.id) {
        const widths = splitBackPanelWidths(run.totalWidth, item.back_panel_qty || 1);
        widths.forEach((w, i) =>
          pushPanel(
            widths.length > 1 ? `Back Panel ${i + 1} of ${widths.length}` : "Back Panel",
            w,
            runAwareQty(item, run.count)
          )
        );
      }
      // Otherwise covered by the run's first cabinet — omit here
    } else {
      const seg = backPanelSegment(item);
      pushPanel("Back Panel", seg?.length || item.width_mm || 600);
    }
  }

  // Kickboard under an end/back panel that doesn't reach the floor —
  // closes the toe-kick recess on that side, same height/thickness as the
  // front kickboard. Only relevant if the cabinet actually has a front
  // kickboard (has_kickboard) — if it doesn't, there's nothing to
  // "continue" underneath.
  if (item.has_kickboard && !item.panel_to_floor) {
    function pushKickboard(name, widthMm) {
      lines.push({
        product_type: "Panel",
        product_name: name,
        description: traceLabel ? `${name} — ${traceLabel}` : name,
        notes: "Kickboard panel.",
        width_mm: widthMm,
        height_mm: item.kickboard_height_mm || 120,
        qty: perCabinetQty(item),
        material: item.material || "",
        finish: item.finish || "",
        colour: item.colour || "",
        thickness: item.kickboard_thickness_mm ? `${item.kickboard_thickness_mm}mm` : "",
        unit_cost_per_sqm_ex_gst: item.cost_per_sqm_carcass || 0,
        unit_cost_mode: "auto",
      });
    }

    if (item.end_panel_left)  pushKickboard("Kickboard — Left End",  item.depth_mm || 600);
    if (item.end_panel_right) pushKickboard("Kickboard — Right End", item.depth_mm || 600);

    if (item.has_back_panel) {
      const span = item.back_panel_span || "continuous";
      if (span === "continuous") {
        const run = computeBackPanelRun(item, selectedCabinetItems);
        if (run.count <= 1 || run.firstItemId === item.id) {
          pushKickboard("Kickboard — Back", run.totalWidth);
        }
        // Otherwise covered by the run's first cabinet — omit here
      } else {
        const seg = backPanelSegment(item);
        pushKickboard("Kickboard — Back", seg?.length || item.width_mm || 600);
      }
    }
  }

  return lines;
}

// Corner cabinet back panels — manual per-leg toggle (Wall 1 = primary,
// Wall 2 = secondary), each spanning that leg's FULL width since there's
// no return-zone carve-out on the back the way there is on the front.
// Standalone per leg (no continuous-run merging with neighbouring
// cabinets, unlike the regular-cabinet back panel system).
function cornerBackPanelLinesForCabinet(item, roomName) {
  if (item.item_type !== "corner_base_cabinet" || (!item.back_panel_wall1 && !item.back_panel_wall2)) return [];

  const lines = [];
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");
  // kickboardOffsetMm, not kickboard_height_mm: the column defaults to 120
  // whether or not has_kickboard is set, so ticking "panels run to floor" on
  // a cabinet WITHOUT a kickboard billed a phantom 120mm of extra board.
  // With no kickboard the carcass already sits on the floor — there's
  // nothing for the panel to run down past.
  const panelH = (Number(item.height_mm) || 0) + (item.panel_to_floor ? kickboardOffsetMm(item) : 0);
  const board = finishPanelBoard(item);

  function pushPanel(name, widthMm) {
    lines.push({
      product_type: "Panel",
      product_name: name,
      description: traceLabel ? `${name} — ${traceLabel}` : name,
      notes: "Finished panel.",
      width_mm: widthMm,
      height_mm: panelH,
      qty: perCabinetQty(item),
      material: board.material,
      finish: board.finish,
      colour: board.colour,
      thickness: board.thicknessMm ? `${board.thicknessMm}mm` : "",
      unit_cost_per_sqm_ex_gst: board.rate,
      unit_cost_mode: "auto",
    });
  }

  if (item.back_panel_wall1) pushPanel("Back Panel — Wall 1", item.width_mm || 900);
  if (item.back_panel_wall2 && item.secondary_wall && item.secondary_width_mm) {
    pushPanel("Back Panel — Wall 2", item.secondary_width_mm);
  }

  if (item.has_kickboard && !item.panel_to_floor) {
    function pushKickboard(name, widthMm) {
      lines.push({
        product_type: "Panel",
        product_name: name,
        description: traceLabel ? `${name} — ${traceLabel}` : name,
        notes: "Kickboard panel.",
        width_mm: widthMm,
        height_mm: item.kickboard_height_mm || 120,
        qty: perCabinetQty(item),
        material: item.material || "",
        finish: item.finish || "",
        colour: item.colour || "",
        thickness: item.kickboard_thickness_mm ? `${item.kickboard_thickness_mm}mm` : "",
        unit_cost_per_sqm_ex_gst: item.cost_per_sqm_carcass || 0,
        unit_cost_mode: "auto",
      });
    }

    if (item.back_panel_wall1) pushKickboard("Kickboard — Wall 1 Back", item.width_mm || 900);
    if (item.back_panel_wall2 && item.secondary_wall && item.secondary_width_mm) {
      pushKickboard("Kickboard — Wall 2 Back", item.secondary_width_mm);
    }
  }

  return lines;
}

// A floating shelf isn't one product — it's a set of decorative board panels
// (top, bottom, front fascia, plus any end caps), each a Panel line with its
// finished size and a mitre note, all in the shelf's single board finish.
function floatingShelfLinesForItem(item, roomName) {
  if (item.item_type !== "floating_shelf") return [];
  const style = floatingShelfStyle(item);
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");
  const qty = item.qty || 1;
  return floatingShelfBoards(item).map((board) => ({
    product_type: QUOTE_PRODUCT_TYPES.panel,
    product_name: board.label,
    description: traceLabel ? `${board.label} — ${traceLabel}` : board.label,
    // The fabricator's mitre note AND any note the user typed on the shelf
    // itself — the typed note used to be dropped entirely, replaced by the
    // auto mitre note. Both matter, so both ride along.
    notes: [String(item.notes || "").trim(), board.note].filter(Boolean).join(" — "),
    width_mm: board.width_mm,
    height_mm: board.height_mm,
    qty,
    material: style.material,
    finish: style.finish,
    colour: style.colour,
    thickness: style.thickness_mm ? `${style.thickness_mm}mm` : "",
    unit_cost_per_sqm_ex_gst: style.cost_per_sqm || 0,
    unit_cost_mode: "auto",
  }));
}

function isMissingOrZero(value) {
  return !(Number(value) > 0);
}

// A design item can have a material selected but no cost-per-sqm entered
// (e.g. project material defaults were never filled in) or no real
// dimensions — previously this imported silently as a $0 or 0mm x 0mm line
// with no warning at all, understating the quote with nothing for staff to
// notice.
function isStandaloneUnconfigured(item) {
  if (item.item_type === "floating_shelf") {
    return (
      !String(item.material || "").trim() ||
      isMissingOrZero(item.width_mm) || isMissingOrZero(item.depth_mm) || isMissingOrZero(item.height_mm) ||
      isMissingOrZero(item.cost_per_sqm_carcass)
    );
  }
  const isPanel = item.item_type === "panel";
  const widthMissing = isPanel ? isMissingOrZero(item.depth_mm) : isMissingOrZero(item.width_mm);
  return (
    !String(item.material || "").trim() ||
    widthMissing ||
    isMissingOrZero(item.height_mm) ||
    isMissingOrZero(item.unit_cost_per_sqm_ex_gst)
  );
}

// The specific reason a standalone item (panel, scribe, floating shelf) was
// flagged — which of material / size / board rate is the problem.
function standaloneReason(item) {
  const material = !String(item.material || "").trim();
  if (item.item_type === "floating_shelf") {
    return missingReason({
      material,
      dims: isMissingOrZero(item.width_mm) || isMissingOrZero(item.depth_mm) || isMissingOrZero(item.height_mm),
      rate: isMissingOrZero(item.cost_per_sqm_carcass),
    });
  }
  const isPanel = item.item_type === "panel";
  return missingReason({
    material,
    dims: (isPanel ? isMissingOrZero(item.depth_mm) : isMissingOrZero(item.width_mm)) || isMissingOrZero(item.height_mm),
    rate: isMissingOrZero(item.unit_cost_per_sqm_ex_gst),
  });
}

// Resolves what to import for a given item from the client's per-item
// selection map, defaulting to "include everything" when unspecified so
// callers that don't pass selections keep importing the whole project.
// Each part is opt-out (`!== false`) so an older client sending only some keys,
// or none, still imports the rest.
function selectionForItem(item, selections) {
  const sel = (selections && selections[item.id]) || {};
  if (CABINET_TYPES.includes(item.item_type)) {
    return {
      cabinet:   sel.cabinet   !== false,
      doors:     sel.doors     !== false,
      // Older clients bundled drawers under "doors"; fall back to that when the
      // client didn't send an explicit drawers flag.
      drawers:   sel.drawers !== undefined ? sel.drawers !== false : sel.doors !== false,
      kickboard: sel.kickboard !== false,
      filler:    sel.filler    !== false,
      panels:    sel.panels    !== false,
    };
  }
  return { include: sel.include !== false };
}

// A cabinet is being imported if ANY of its parts is selected — used to build
// the run set the shared-panel calculations work over.
function anyPartSelected(item, selections) {
  const s = selectionForItem(item, selections);
  return Boolean(s.cabinet || s.doors || s.drawers || s.kickboard || s.filler || s.panels);
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const { quote_id: quoteId, force, selections } = await request.json();

    if (!quoteId) {
      return Response.json({ ok: false, error: "quote_id is required." }, { status: 422 });
    }

    // Verify both project and quote exist
    const [projectResult, quoteResult] = await Promise.all([
      context.supabase.from("pcd_design_projects").select("id, name").eq("id", projectId).single(),
      context.supabase.from("pcd_quotes").select("id").eq("id", quoteId).single(),
    ]);

    if (projectResult.error || !projectResult.data) {
      return Response.json({ ok: false, error: "Project not found." }, { status: 404 });
    }
    if (quoteResult.error || !quoteResult.data) {
      return Response.json({ ok: false, error: "Quote not found." }, { status: 404 });
    }

    // Load all items and rooms for this project, ordered for consistent sort order
    const [{ data: items, error: itemsError }, { data: rooms, error: roomsError }] = await Promise.all([
      context.supabase
        .from("pcd_design_items")
        .select("*")
        .eq("design_project_id", projectId)
        .order("room_id", { ascending: true })
        .order("sort_order", { ascending: true }),
      context.supabase.from("pcd_design_rooms").select("id, name, width_mm, depth_mm, height_mm").eq("design_project_id", projectId),
    ]);

    if (itemsError) throw itemsError;
    if (roomsError) throw roomsError;

    // Obstructions are spatial-only (walls, nib walls, recesses) — never
    // manufactured or quoted, so they're excluded before any warning checks
    // or line generation ever sees them.
    const importableItems = (items || []).filter((item) => item.item_type !== "obstruction");
    if (!importableItems.length) {
      return Response.json({ ok: false, error: "No items to import." }, { status: 422 });
    }

    const roomNameById = new Map((rooms || []).map((room) => [room.id, room.name]));
    const roomById     = new Map((rooms || []).map((room) => [room.id, room]));

    // Precomputed once so run detection only considers cabinets that are
    // actually being imported (a partially selected continuous run sums just
    // the selected cabinets' widths, rather than the whole run). Needed by
    // the pre-flight pass below as well as line generation.
    const selectedCabinetItems = importableItems.filter(
      (i) => CABINET_TYPES.includes(i.item_type) && anyPartSelected(i, selections)
    );

    if (!force) {
      const warnings = [];

      // Re-import REPLACES every line this project previously produced. That's
      // deliberate — it's what stops duplicates — but it silently destroys any
      // edit made to those lines since: a negotiated unit cost, a hand-set
      // markup, a rewritten description, a client note. Until now the only
      // mention of that was a code comment. Say it before doing it.
      const { count: previousCount, error: previousCountError } = await context.supabase
        .from("pcd_quote_line_items")
        .select("id", { count: "exact", head: true })
        .eq("quote_id", quoteId)
        .eq("design_project_id", projectId);
      if (previousCountError) throw previousCountError;
      if (previousCount > 0) {
        warnings.push({
          itemId: "__reimport__",
          label: `This quote already has ${previousCount} line${previousCount === 1 ? "" : "s"} imported from this project. ` +
                 `They will be deleted and re-created — any manual edits to them (prices, markups, descriptions, notes) will be lost.`,
        });
      }

      for (const item of importableItems) {
        const isCabinet = CABINET_TYPES.includes(item.item_type);
        const sel = selectionForItem(item, selections);
        const roomName = roomNameById.get(item.room_id);
        const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");

        if (isCabinet) {
          // A cabinet priced by a manual override has no board rate to check —
          // the override IS its rate, so warning on a blank cost_per_sqm_carcass
          // would flag a fully-configured cabinet.
          const hasRate = item.unit_cost_mode === "manual"
            ? !isMissingOrZero(item.unit_cost_per_sqm_ex_gst)
            : !isMissingOrZero(item.cost_per_sqm_carcass);
          const cabMaterial = !String(item.material || "").trim();
          const cabDims = isMissingOrZero(item.width_mm) || isMissingOrZero(item.height_mm) || isMissingOrZero(item.depth_mm);
          if (sel.cabinet && (cabMaterial || cabDims || !hasRate)) {
            warnings.push({
              itemId: item.id,
              label: `${traceLabel} (cabinet) — ${missingReason({ material: cabMaterial, dims: cabDims, rate: !hasRate })}.`,
            });
          }
          // qty > 1 with a panel merged across a continuous run: the run's
          // board spans the plan, so it can't be multiplied without inventing
          // material. Say so rather than quietly counting one.
          if (sel.cabinet && perCabinetQty(item) > 1) {
            const shared = sharedRunPanels(item, selectedCabinetItems, roomById.get(item.room_id));
            if (shared.length) {
              const list = shared.length > 1
                ? `${shared.slice(0, -1).join(", ")} and ${shared[shared.length - 1]}`
                : shared[0];
              warnings.push({
                itemId: item.id,
                label: `${traceLabel} — qty ${perCabinetQty(item)}, but its ${list} ${shared.length > 1 ? "are" : "is"} ` +
                       `one continuous board shared with neighbouring cabinets. Only ONE will be counted; ` +
                       `set that panel's span to "individual", or draw the extra cabinets on the plan.`,
              });
            }
          }
          if (sel.doors && item.front_type === "doors") {
            const noMat = !String(item.door_style?.material || "").trim();
            const noRate = isMissingOrZero(item.door_style?.cost_per_sqm);
            if (noMat || noRate) {
              warnings.push({ itemId: item.id, label: `${traceLabel} (doors) — ${missingReason({ material: noMat, rate: noRate })}.` });
            }
          }
          if (sel.drawers && item.front_type === "drawers") {
            const noMat = !String(item.drawer_style?.material || "").trim();
            const noRate = isMissingOrZero(item.drawer_style?.cost_per_sqm);
            if (noMat || noRate) {
              warnings.push({ itemId: item.id, label: `${traceLabel} (drawers) — ${missingReason({ material: noMat, rate: noRate })}.` });
            }
          }
          if ((sel.doors || sel.drawers) && item.front_type === "mixed") {
            const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
            const hasDoors   = sel.doors   && sections.some((s) => s.type === "doors");
            const hasDrawers = sel.drawers && sections.some((s) => s.type === "drawers");
            const missingDoorStyle   = hasDoors   && (!String(item.door_style?.material   || "").trim() || isMissingOrZero(item.door_style?.cost_per_sqm));
            const missingDrawerStyle = hasDrawers && (!String(item.drawer_style?.material || "").trim() || isMissingOrZero(item.drawer_style?.cost_per_sqm));
            if (missingDoorStyle || missingDrawerStyle) {
              const which = [missingDoorStyle && "door", missingDrawerStyle && "drawer"].filter(Boolean).join(" & ");
              const noMat  = (missingDoorStyle   && !String(item.door_style?.material   || "").trim()) ||
                             (missingDrawerStyle && !String(item.drawer_style?.material || "").trim());
              const noRate = (missingDoorStyle   && isMissingOrZero(item.door_style?.cost_per_sqm)) ||
                             (missingDrawerStyle && isMissingOrZero(item.drawer_style?.cost_per_sqm));
              warnings.push({ itemId: item.id, label: `${traceLabel} (mixed front — ${which}) — ${missingReason({ material: noMat, rate: noRate })}.` });
            }
          }
        } else if (sel.include && isStandaloneUnconfigured(item)) {
          warnings.push({ itemId: item.id, label: `${traceLabel} — ${standaloneReason(item)}.` });
        }
      }
      if (warnings.length) {
        return Response.json({ ok: true, needsConfirmation: true, warnings });
      }
    }

    // Get current max sort_order in the quote
    const { data: existingLines } = await context.supabase
      .from("pcd_quote_line_items")
      .select("sort_order")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: false })
      .limit(1);

    let sortOrder = (existingLines?.[0]?.sort_order ?? -1) + 1;

    const results = { created: 0, deleted: 0, failed: 0, errors: [] };

    // Re-running an import must replace everything this project previously
    // produced in this quote, not append duplicates alongside it.
    //
    // Done as ONE up-front sweep rather than a delete inside the per-item
    // loop. The loop could only ever visit items that still exist, so lines
    // belonging to a DELETED design item were unreachable and stranded on the
    // quote forever — worst for run-merged panels, where deleting the run's
    // first cabinet left its whole-run board behind while a surviving cabinet
    // emitted a fresh one on top.
    const staleIds = new Set();
    const { data: byProject, error: byProjectError } = await context.supabase
      .from("pcd_quote_line_items")
      .select("id")
      .eq("quote_id", quoteId)
      .eq("design_project_id", projectId);
    if (byProjectError) throw byProjectError;
    (byProject || []).forEach((row) => staleIds.add(row.id));

    // Safety net for lines imported before design_project_id existed that the
    // migration's backfill didn't reach. Scoped to items that still exist, so
    // it can never touch a hand-added line (those have no design_item_id).
    const currentItemIds = importableItems.map((i) => i.id);
    if (currentItemIds.length) {
      const { data: byItem, error: byItemError } = await context.supabase
        .from("pcd_quote_line_items")
        .select("id")
        .eq("quote_id", quoteId)
        .in("design_item_id", currentItemIds);
      if (byItemError) throw byItemError;
      (byItem || []).forEach((row) => staleIds.add(row.id));
    }

    for (const staleId of staleIds) {
      await deleteQuoteLine(context.supabase, quoteId, staleId);
    }
    results.deleted = staleIds.size;

    // Generate every line first, tagged with its source item, so identical
    // flat lines can be collapsed into one (qty summed) before any are saved —
    // e.g. two identical standalone panels, or the same door on two cabinets.
    const generated = [];
    for (const item of importableItems) {
      const isCabinet = CABINET_TYPES.includes(item.item_type);
      const sel = selectionForItem(item, selections);
      const lines = [];

      if (isCabinet) {
        const roomName = roomNameById.get(item.room_id);
        const room = roomById.get(item.room_id);
        if (sel.cabinet) lines.push(designItemToLine(item));
        if (sel.kickboard) lines.push(...kickboardLinesForCabinet(item, selectedCabinetItems, roomName, room));
        if (sel.filler)    lines.push(...fillerPanelLinesForCabinet(item, selectedCabinetItems, roomName, room, items));
        if (sel.panels) {
          lines.push(...bottomPanelLinesForCabinet(item, selectedCabinetItems, roomName));
          lines.push(...endBackPanelLinesForCabinet(item, selectedCabinetItems, roomName));
          lines.push(...cornerBackPanelLinesForCabinet(item, roomName));
        }
        // Fronts — doors and drawer fronts are chosen independently.
        if (item.item_type === "corner_base_cabinet") {
          if (sel.doors) lines.push(...cornerDoorLinesForCabinet(item, roomName, { cabinetIncluded: sel.cabinet }));
        } else if (item.front_type === "doors") {
          if (sel.doors) lines.push(...doorLinesForCabinet(item, roomName, { cabinetIncluded: sel.cabinet }));
        } else if (item.front_type === "drawers") {
          if (sel.drawers) lines.push(...drawerLinesForCabinet(item, roomName, { cabinetIncluded: sel.cabinet }));
        } else if (item.front_type === "mixed" && (sel.doors || sel.drawers)) {
          lines.push(...mixedLinesForCabinet(item, roomName, { cabinetIncluded: sel.cabinet, includeDoors: sel.doors, includeDrawers: sel.drawers }));
        }
      } else if (sel.include) {
        if (item.item_type === "floating_shelf") {
          lines.push(...floatingShelfLinesForItem(item, roomNameById.get(item.room_id)));
        } else {
          lines.push(designItemToLine(item));
        }
      }

      for (const line of lines) generated.push({ line, itemId: item.id });
    }

    const mergedById = new Map(importableItems.map((i) => [i.id, i]));
    for (const { line, itemId } of mergeIdenticalLines(generated)) {
      try {
        // design_project_id as well as the item: the item tag alone can't be
        // swept once its item is deleted, and the project tag is what scopes
        // the sweep away from other projects' and hand-added lines.
        const taggedLine = { ...line, design_item_id: itemId, design_project_id: projectId };
        await saveQuoteLine(context.supabase, quoteId, withCalculatedUnitCost(taggedLine), { sortOrder });
        sortOrder += 1;
        results.created += 1;
      } catch (err) {
        results.failed += 1;
        const src = mergedById.get(itemId);
        results.errors.push(`Item "${src?.label || itemId}": ${err?.message}`);
      }
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Import failed." }, { status: 500 });
  }
}
