// Cut-list preview for the design tool.
//
// computeCutList() mirrors calculateCabinetCutList / calculateCornerCabinetCutList
// in lib/pcd-cabinet-utils.js (used at import time) so the design tool's preview
// always matches what actually gets quoted. It's kept as a parallel
// implementation because this function's shape (dim1/axis1/dim2/axis2, for the
// on-screen list) differs from that one's (width_mm/height_mm/area_sqm, for
// quote-line costing).
//
// Lives in lib/ (not a component) so the cabinet cut-list window, the whole-room
// cut-list window and the mobile price modal can all share one source of truth.

import { computeKickboardRun, kickboardSegments, kickboardOffsetMm, isCornerType } from "./pcd-kickboard-utils";
import { computeBackPanelRun, splitBackPanelWidths, backPanelSegment } from "./pcd-backpanel-utils";
import { computeBottomPanelRun, bottomPanelSegment } from "./pcd-bottompanel-utils";
import { computeFillerPanelRun, fillerPanelSegment, fillerPanelGapMm } from "./pcd-fillerpanel-utils";
import { computeDoorSizes, computeDoorSizesForConfig, computeDrawerSizes, computeDrawerSizesForConfig, computeCornerDoorLeaves, frontWidthMm } from "./pcd-door-utils";
import { bottomPanelThicknessMm } from "./pcd-finishpanel-utils";
import { floatingShelfBoards } from "./pcd-floating-shelf-utils";

// Diagonal (chamfered) corner — mirrors calculateDiagonalCornerCutList in
// lib/pcd-cabinet-utils.js so this preview matches the imported quote lines.
// The top/bottom/shelves are pentagons cut from a rectangular blank; the
// chamfer note tells the bench where to trim the angled front (legs = the
// projection past depth on each wall, hypotenuse = the door width).
function computeDiagonalCornerCutList(item, W, H, D, T, BT, shelfQty, secW) {
  const returnDepth = Math.max(0, D - BT);
  const topW = Math.max(0, W - BT);
  const topD = Math.max(0, secW - BT);
  const leg1 = Math.max(0, W - D);
  const leg2 = Math.max(0, secW - D);
  const hyp = Math.round(Math.hypot(leg1, leg2));
  const note = (leg1 > 0 && leg2 > 0)
    ? `Chamfer: trim ${Math.round(leg1)}×${Math.round(leg2)}mm off the room corner (diagonal ${hyp}mm = door).`
    : "Chamfered pentagon — cut from the rectangular blank; see plan.";
  const parts = [
    { name: "Side — Wall 1 outer end", dim1: H, axis1: "H", dim2: returnDepth, axis2: "D" },
    { name: "Side — Wall 2 outer end", dim1: H, axis1: "H", dim2: returnDepth, axis2: "D" },
    { name: "Top (pentagon — cut from sheet)", dim1: topW, axis1: "W", dim2: topD, axis2: "D", note },
    { name: "Bottom (pentagon — cut from sheet)", dim1: topW, axis1: "W", dim2: topD, axis2: "D", note },
  ];
  if (BT > 0) {
    parts.push({ name: "Back — Wall 1", dim1: W, axis1: "W", dim2: H, axis2: "H", material: "back" });
    parts.push({ name: "Back — Wall 2", dim1: Math.max(0, secW - BT), axis1: "W", dim2: H, axis2: "H", material: "back" });
  }
  for (let i = 0; i < shelfQty; i++) {
    const suffix = shelfQty === 1 ? "" : ` ${i + 1}`;
    parts.push({ name: `Shelf${suffix} (pentagon — cut from sheet)`, dim1: topW, axis1: "W", dim2: topD, axis2: "D", material: "shelf", note });
  }
  return parts;
}

// L-shaped corner cabinet piece list, mirroring calculateCornerCabinetCutList
// in lib/pcd-cabinet-utils.js — one bi-fold leaf per wall leg instead of a grid.
function computeCornerCutList(item, W, H, D, T, BT, shelfQty) {
  const secW = Number(item.secondary_width_mm) || 0;
  if (!secW) return [];

  if (item.corner_style === "diagonal") {
    return computeDiagonalCornerCutList(item, W, H, D, T, BT, shelfQty, secW);
  }

  const legAPanelDepth = Math.max(0, D - BT);
  const legBWidth = Math.max(0, secW - D);
  // The legBWidth subtraction tiles the FOOTPRINT (leg A owns the corner
  // square). It must not touch the backs — those are perpendicular planes,
  // and each spans its own wall in full, less the one it butts into. Leg A's
  // top/bottom start at the wall-2 back's inside face for the same reason.
  const legATopWidth = Math.max(0, W - T - BT);
  const parts = [];

  parts.push({ name: "Side — Wall 1 outer end", dim1: H, axis1: "H", dim2: legAPanelDepth, axis2: "D" });
  parts.push({ name: "Side — Wall 2 outer end", dim1: H, axis1: "H", dim2: legAPanelDepth, axis2: "D" });
  parts.push({ name: "Top — Wall 1 leg",    dim1: legATopWidth, axis1: "W", dim2: legAPanelDepth, axis2: "D" });
  parts.push({ name: "Bottom — Wall 1 leg", dim1: legATopWidth, axis1: "W", dim2: legAPanelDepth, axis2: "D" });

  if (legBWidth > 0) {
    parts.push({ name: "Top — Wall 2 leg",    dim1: Math.max(0, legBWidth - T), axis1: "W", dim2: legAPanelDepth, axis2: "D" });
    parts.push({ name: "Bottom — Wall 2 leg", dim1: Math.max(0, legBWidth - T), axis1: "W", dim2: legAPanelDepth, axis2: "D" });
  }

  if (BT > 0) {
    parts.push({ name: "Back — Wall 1 leg", dim1: W, axis1: "W", dim2: H, axis2: "H", material: "back" });
    parts.push({ name: "Back — Wall 2 leg", dim1: Math.max(0, secW - BT), axis1: "W", dim2: H, axis2: "H", material: "back" });
  }

  for (let i = 0; i < shelfQty; i++) {
    const suffix = shelfQty === 1 ? "" : ` ${i + 1}`;
    parts.push({ name: `Shelf${suffix} — Wall 1 leg`, dim1: legATopWidth, axis1: "W", dim2: legAPanelDepth, axis2: "D", material: "shelf" });
    if (legBWidth > 0) {
      parts.push({ name: `Shelf${suffix} — Wall 2 leg`, dim1: Math.max(0, legBWidth - T), axis1: "W", dim2: legAPanelDepth, axis2: "D", material: "shelf" });
    }
  }

  return parts;
}

/**
 * Computes the board cut list for a cabinet item, mirroring
 * calculateCabinetCutList in lib/pcd-cabinet-utils.js (used at import time)
 * so the design tool's preview always matches what actually gets quoted.
 * Standard box construction:
 *   - Left/right sides run full height; depth is carcass depth minus the
 *     back panel thickness, since the back sits flush against the rear
 *     edges rather than housed in a groove between the sides
 *   - Top/bottom span between the sides (W − 2×T), same reduced depth as the sides
 *   - Back panel is full width × full height (the outside footprint), never inset
 *   - Shelves span between sides, same reduced depth as the sides/top/bottom
 *   - Kickboard: continuous runs show once (on run's first cabinet); individual shows per cabinet
 *
 * Pieces carry a `material` tag (shelf/door/drawer/panel/back/kickboard/filler
 * or untagged carcass) and, on collapsed door/drawer rows, a numeric `qty` for
 * costing.
 */
export function computeCutList(item, allItems = [], room = null) {
  // A floating shelf's "cut list" is its boards (top, bottom, front fascia and
  // any end caps) — each with its two finished dimensions and axis. Same boards
  // that become the decorative-panel lines on import.
  if (item.item_type === "floating_shelf") {
    return floatingShelfBoards(item).map((b) => {
      const [axis1, axis2] = b.part === "front" ? ["W", "H"]
        : b.part.startsWith("cap") ? ["D", "H"]
        : ["W", "D"]; // top / bottom
      return { name: b.label, dim1: b.width_mm, axis1, dim2: b.height_mm, axis2 };
    });
  }

  const W  = Number(item.width_mm)            || 0;
  const H  = Number(item.height_mm)           || 0;
  const D  = Number(item.depth_mm)            || 0;
  const T  = Number(item.carcass_thickness_mm) || 16;
  const BT = item.back_panel_included !== false
    ? (Number(item.back_panel_thickness_mm) || 16)
    : 0;
  const shelfQty = Number(item.shelf_qty) || 0;

  if (!W || !H || !D) return [];

  const innerW = W - 2 * T;
  const carcassPanelDepth = Math.max(0, D - BT);

  const parts = isCornerType(item)
    ? computeCornerCutList(item, W, H, D, T, BT, shelfQty)
    : [];

  if (!isCornerType(item)) {
    parts.push({ name: "Left Side",  dim1: H, axis1: "H", dim2: carcassPanelDepth, axis2: "D" });
    parts.push({ name: "Right Side", dim1: H, axis1: "H", dim2: carcassPanelDepth, axis2: "D" });
    parts.push({ name: "Top",    dim1: innerW, axis1: "W", dim2: carcassPanelDepth, axis2: "D" });
    parts.push({ name: "Bottom", dim1: innerW, axis1: "W", dim2: carcassPanelDepth, axis2: "D" });

    if (BT > 0) {
      parts.push({ name: "Back Panel", dim1: W, axis1: "W", dim2: H, axis2: "H", material: "back" });
    }

    // Rangehood cabinet — a boxed recess at the bottom for the rangehood
    // unit, a boxed vertical channel above it (full depth) for the flue,
    // and shelves cut as a left/right pair either side of that channel
    // instead of one full-width board. Wall cabinets only.
    const hasChannel = item.item_type === "wall_cabinet"
      && item.has_rangehood
      && Number(item.rangehood_channel_width_mm) > 0;
    const channelW = hasChannel ? Math.min(Number(item.rangehood_channel_width_mm) || 0, innerW) : 0;

    if (hasChannel) {
      const housingH = Math.min(Number(item.rangehood_housing_height_mm) || 0, H);
      // Bottom panel + housing divider + top panel all come off the height —
      // the channel walls sit inside the carcass, between the divider's top
      // face and the top panel's underside. Mirrors calculateCabinetCutList.
      const channelH = Math.max(0, H - housingH - 3 * T);
      parts.push({ name: "Rangehood Housing Divider", dim1: innerW, axis1: "W", dim2: carcassPanelDepth, axis2: "D" });
      parts.push({ name: "Rangehood Channel — Left Wall",  dim1: channelH, axis1: "H", dim2: carcassPanelDepth, axis2: "D" });
      parts.push({ name: "Rangehood Channel — Right Wall", dim1: channelH, axis1: "H", dim2: carcassPanelDepth, axis2: "D" });
    }

    for (let i = 0; i < shelfQty; i++) {
      const suffix = shelfQty === 1 ? "" : ` ${i + 1}`;
      if (hasChannel) {
        const sideTotal = Math.max(0, innerW - channelW);
        const leftW = Math.floor(sideTotal / 2);
        const rightW = sideTotal - leftW;
        parts.push({ name: `Shelf${suffix} — Left`,  dim1: leftW,  axis1: "W", dim2: carcassPanelDepth, axis2: "D", material: "shelf" });
        parts.push({ name: `Shelf${suffix} — Right`, dim1: rightW, axis1: "W", dim2: carcassPanelDepth, axis2: "D", material: "shelf" });
      } else {
        const name = shelfQty === 1 ? "Shelf" : `Shelf ${i + 1}`;
        parts.push({ name, dim1: innerW, axis1: "W", dim2: carcassPanelDepth, axis2: "D", material: "shelf" });
      }
    }

    // Doors / drawer fronts — sized with the same columns/rows/width_ratios
    // (doors) and heights_mm/gap (drawers) math the elevation view and quote
    // import use, so the cut list always matches what actually gets quoted.
    // Same-size fronts (matching hinge setup, for doors) collapse into one
    // row with a ×qty suffix rather than listing each one separately.
    if (item.front_type === "doors") {
      computeDoorSizes(item).forEach((size) => {
        const suffix = size.qty > 1 ? ` ×${size.qty}` : "";
        parts.push({ name: `Door${suffix}`, dim1: size.width, axis1: "W", dim2: size.height, axis2: "H", material: "door", qty: size.qty });
      });
    } else if (item.front_type === "drawers") {
      computeDrawerSizes(item).forEach((size) => {
        const suffix = size.qty > 1 ? ` ×${size.qty}` : "";
        parts.push({ name: `Drawer Front${suffix}`, dim1: size.width, axis1: "W", dim2: size.height, axis2: "H", material: "drawer", qty: size.qty });
      });
    } else if (item.front_type === "mixed") {
      const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
      sections.forEach((sec, idx) => {
        const sectionLabel = `Section ${idx + 1}`;
        if (sec.type === "drawers") {
          computeDrawerSizesForConfig(sec.drawer || {}, frontWidthMm(item), sec.height_mm).forEach((size) => {
            const suffix = size.qty > 1 ? ` ×${size.qty}` : "";
            parts.push({ name: `Drawer Front — ${sectionLabel}${suffix}`, dim1: size.width, axis1: "W", dim2: size.height, axis2: "H", material: "drawer", qty: size.qty });
          });
        } else if (sec.type === "doors") {
          computeDoorSizesForConfig(sec.door || {}, frontWidthMm(item), sec.height_mm).forEach((size) => {
            const suffix = size.qty > 1 ? ` ×${size.qty}` : "";
            parts.push({ name: `Door — ${sectionLabel}${suffix}`, dim1: size.width, axis1: "W", dim2: size.height, axis2: "H", material: "door", qty: size.qty });
          });
        }
        // "open" sections: no board
      });
    }
  } else if (item.front_type === "doors") {
    // Corner cabinet — one bi-fold door leaf per wall leg instead of the
    // columns/rows grid regular cabinets use.
    computeCornerDoorLeaves(item).forEach((leaf) => {
      const legLabel = leaf.key === "secondary" ? "Wall 2" : "Wall 1";
      parts.push({ name: `Corner Door — ${legLabel}`, dim1: leaf.widthMm, axis1: "W", dim2: leaf.heightMm, axis2: "H", material: "door" });
    });
  }

  // Kickboard / plinth — not applicable to wall cabinets (they're not on the
  // floor). A corner cabinet contributes up to two independent kickboard
  // segments (one per open leg — the corner-square return has no front face
  // and never gets a kickboard, and the two legs can never share one
  // continuous board since they're at a right angle) — see
  // lib/pcd-kickboard-utils.js for the full geometry.
  if (item.has_kickboard && item.item_type !== "wall_cabinet") {
    const kH    = Number(item.kickboard_height_mm) || 120;
    const kSpan = item.kickboard_span || "continuous";
    const isCorner = isCornerType(item);

    if (kSpan === "continuous") {
      const { legs } = computeKickboardRun(item, allItems, room);
      for (const leg of legs) {
        if (leg.count <= 1) {
          // Single-cabinet continuous kickboard — stays in this cabinet's cut list
          const name = isCorner ? `Kickboard — ${leg.leg === "secondary" ? "Wall 2" : "Wall 1"}` : "Kickboard";
          parts.push({ name, dim1: leg.totalWidth, axis1: "W", dim2: kH, axis2: "H", material: "kickboard" });
        }
        // Multi-cabinet runs are shown as their own top-level line items — omit here entirely
      }
    } else {
      // Individual span — always stays in this cabinet's cut list
      for (const seg of kickboardSegments(item, room)) {
        const name = isCorner ? `Kickboard — ${seg.leg === "secondary" ? "Wall 2" : "Wall 1"}` : "Kickboard";
        parts.push({ name, dim1: seg.length, axis1: "W", dim2: kH, axis2: "H", material: "kickboard" });
      }
    }
  }

  // Filler panel — wall/tall cabinets only, closes the gap above the
  // cabinet: to the ceiling, or to the nearest obstruction above it (e.g. a
  // bulkhead) if that's closer (the mirror of kickboard, above instead of
  // below). Unlike kickboard, there's no corner-leg splitting needed since
  // there's no corner wall/tall cabinet variant — always a single segment.
  if ((item.item_type === "wall_cabinet" || item.item_type === "tall_cabinet") && item.has_filler_panel) {
    const fH    = item.filler_panel_height_mm ?? fillerPanelGapMm(item, room, allItems);
    const fSpan = item.filler_panel_span || "continuous";

    if (fSpan === "continuous") {
      const run = computeFillerPanelRun(item, allItems);
      if (run.count <= 1) {
        // Single-cabinet continuous run — stays in this cabinet's cut list
        parts.push({ name: "Filler Panel", dim1: run.totalWidth, axis1: "W", dim2: fH, axis2: "H", material: "filler" });
      }
      // Multi-cabinet runs are shown as their own top-level line items — omit here entirely
    } else {
      // Individual span — always stays in this cabinet's cut list
      const seg = fillerPanelSegment(item);
      parts.push({ name: "Filler Panel", dim1: seg?.length || W, axis1: "W", dim2: fH, axis2: "H", material: "filler" });
    }
  }

  // Underside panel — wall cabinets only, finishes the visible underside
  // (the mirror of back panel, but a horizontal face — width × depth,
  // not width × height — since it sits flat under the cabinet).
  if (item.item_type === "wall_cabinet" && item.has_bottom_panel) {
    const bSpan = item.bottom_panel_span || "continuous";
    if (bSpan === "continuous") {
      const run = computeBottomPanelRun(item, allItems);
      if (run.count <= 1) {
        // Single-cabinet continuous run — stays in this cabinet's cut list,
        // split into the run-owner's chosen panel count.
        const widths = splitBackPanelWidths(run.totalWidth, item.bottom_panel_qty || 1);
        widths.forEach((w, i) => {
          const suffix = widths.length > 1 ? ` ${i + 1}` : "";
          parts.push({ name: `Underside Panel${suffix}`, dim1: w, axis1: "W", dim2: D, axis2: "D", material: "panel" });
        });
      }
      // Multi-cabinet runs are shown as their own top-level line items — omit here entirely
    } else {
      const seg = bottomPanelSegment(item);
      parts.push({ name: "Underside Panel", dim1: seg?.length || W, axis1: "W", dim2: D, axis2: "D", material: "panel" });
    }
  }

  // Finished side panels — wall cabinets. Match the cabinet's depth × height;
  // when a finished underside panel is present, the side panels extend down by
  // that panel's own board thickness to cover its edge. Reading
  // carcass_thickness_mm here (a different board from the one actually cut)
  // made this preview disagree with the quote whenever the finish board was
  // the thicker of the two.
  if (item.item_type === "wall_cabinet" && (item.end_panel_left || item.end_panel_right)) {
    const underThk = bottomPanelThicknessMm(item);
    const sideH = H + underThk;
    if (item.end_panel_left)  parts.push({ name: "Side Panel — Left",  dim1: D, axis1: "D", dim2: sideH, axis2: "H", material: "panel" });
    if (item.end_panel_right) parts.push({ name: "Side Panel — Right", dim1: D, axis1: "D", dim2: sideH, axis2: "H", material: "panel" });
  }

  // End & back panels — base/tall cabinets only (matches BACK_PANEL_TYPES in
  // lib/pcd-backpanel-utils.js; a corner cabinet's "back" isn't a single
  // well-defined side given its L-shape, and wall cabinets aren't
  // floor-standing). panel_to_floor extends both down through where a
  // kickboard recess would otherwise be, instead of stopping at carcass height.
  if (item.item_type === "base_cabinet" || item.item_type === "tall_cabinet") {
    const panelH = H + (item.panel_to_floor ? kickboardOffsetMm(item) : 0);

    if (item.end_panel_left)  parts.push({ name: "End Panel — Left",  dim1: D, axis1: "D", dim2: panelH, axis2: "H", material: "panel" });
    if (item.end_panel_right) parts.push({ name: "End Panel — Right", dim1: D, axis1: "D", dim2: panelH, axis2: "H", material: "panel" });

    if (item.has_back_panel) {
      const bSpan = item.back_panel_span || "continuous";
      if (bSpan === "continuous") {
        const run = computeBackPanelRun(item, allItems);
        if (run.count <= 1) {
          // Single-cabinet continuous run — stays in this cabinet's cut list,
          // split into the run-owner's chosen panel count.
          const widths = splitBackPanelWidths(run.totalWidth, item.back_panel_qty || 1);
          widths.forEach((w, i) => {
            const suffix = widths.length > 1 ? ` ${i + 1}` : "";
            parts.push({ name: `Back Panel${suffix}`, dim1: w, axis1: "W", dim2: panelH, axis2: "H", material: "panel" });
          });
        }
        // Multi-cabinet runs are shown as their own top-level line items — omit here entirely
      } else {
        const seg = backPanelSegment(item);
        parts.push({ name: "Back Panel", dim1: seg?.length || W, axis1: "W", dim2: panelH, axis2: "H", material: "panel" });
      }
    }

    // Kickboard under an end/back panel that doesn't reach the floor —
    // closes the toe-kick recess on that side, reusing the same
    // height/thickness as the front kickboard. Only relevant if the
    // cabinet actually has a front kickboard (has_kickboard) — if it
    // doesn't, there's nothing to "continue" underneath.
    if (item.has_kickboard && !item.panel_to_floor) {
      const kH2 = Number(item.kickboard_height_mm) || 120;
      if (item.end_panel_left)  parts.push({ name: "Kickboard — Left End",  dim1: D, axis1: "D", dim2: kH2, axis2: "H", material: "kickboard" });
      if (item.end_panel_right) parts.push({ name: "Kickboard — Right End", dim1: D, axis1: "D", dim2: kH2, axis2: "H", material: "kickboard" });

      if (item.has_back_panel) {
        const bSpan = item.back_panel_span || "continuous";
        if (bSpan === "continuous") {
          const run = computeBackPanelRun(item, allItems);
          if (run.count <= 1) {
            parts.push({ name: "Kickboard — Back", dim1: run.totalWidth, axis1: "W", dim2: kH2, axis2: "H", material: "kickboard" });
          }
          // Multi-cabinet runs surface via the Back Panel run's own entry — see BackPanelRunItem
        } else {
          const seg = backPanelSegment(item);
          parts.push({ name: "Kickboard — Back", dim1: seg?.length || W, axis1: "W", dim2: kH2, axis2: "H", material: "kickboard" });
        }
      }
    }
  }

  // Corner cabinet back panels — manual per-leg toggle (Wall 1 = primary,
  // Wall 2 = secondary). Each spans that leg's FULL width — unlike the
  // front, there's no return-zone carve-out on the back. Standalone per
  // leg (no continuous-run merging with neighbouring cabinets, unlike the
  // regular-cabinet back panel system).
  if (isCornerType(item) && (item.back_panel_wall1 || item.back_panel_wall2)) {
    const panelH = H + (item.panel_to_floor ? kickboardOffsetMm(item) : 0);
    const secW = Number(item.secondary_width_mm) || 0;

    if (item.back_panel_wall1) parts.push({ name: "Back Panel — Wall 1", dim1: W, axis1: "W", dim2: panelH, axis2: "H", material: "panel" });
    if (item.back_panel_wall2 && item.secondary_wall && secW > 0) {
      parts.push({ name: "Back Panel — Wall 2", dim1: secW, axis1: "W", dim2: panelH, axis2: "H", material: "panel" });
    }

    if (item.has_kickboard && !item.panel_to_floor) {
      const kH2 = Number(item.kickboard_height_mm) || 120;
      if (item.back_panel_wall1) parts.push({ name: "Kickboard — Wall 1 Back", dim1: W, axis1: "W", dim2: kH2, axis2: "H", material: "kickboard" });
      if (item.back_panel_wall2 && item.secondary_wall && secW > 0) {
        parts.push({ name: "Kickboard — Wall 2 Back", dim1: secW, axis1: "W", dim2: kH2, axis2: "H", material: "kickboard" });
      }
    }
  }

  return parts;
}
