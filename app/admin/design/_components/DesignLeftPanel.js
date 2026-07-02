"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import styles from "../design.module.css";
import { computeKickboardRun, computeAllKickboardRuns, kickboardSegments } from "../../../../lib/pcd-kickboard-utils";
import { computeBackPanelRun, computeAllBackPanelRuns, splitBackPanelWidths, backPanelSegment } from "../../../../lib/pcd-backpanel-utils";
import { computeDoorSizes, computeDoorSizesForConfig, computeDrawerSizes, computeDrawerSizesForConfig, computeCornerDoorLeaves } from "../../../../lib/pcd-door-utils";

const ITEM_COLORS = {
  base_cabinet:  "#3b82f6",
  wall_cabinet:  "#22c55e",
  tall_cabinet:  "#f97316",
  corner_base_cabinet: "#0ea5e9",
  door:          "#a855f7",
  drawer_front:  "#8b5cf6",
  panel:         "#6b7280",
  obstruction:   "#57534e",
};

const TYPE_SHORT = {
  base_cabinet:  "base",
  wall_cabinet:  "wall",
  tall_cabinet:  "tall",
  corner_base_cabinet: "corner",
  door:          "door",
  drawer_front:  "drwr",
  panel:         "panel",
  obstruction:   "obstr.",
};

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet"];

/**
 * Computes the board cut list for a cabinet item.
 * Standard box construction:
 *   - Left/right sides run full height and full depth
 *   - Top/bottom span between the sides (W − 2×T)
 *   - Back fits between the sides, full height (W − 2×T) × H
 *   - Shelves span between sides, set back 20mm from front
 *   - Kickboard: continuous runs show once (on run's first cabinet); individual shows per cabinet
 */
// L-shaped corner cabinet piece list, mirroring calculateCornerCabinetCutList
// in lib/pcd-cabinet-utils.js (used at import time) — kept as a parallel
// implementation here since this function's shape (dim1/axis1/dim2/axis2 for
// the left panel's UI display) differs from that one's (width_mm/height_mm/
// area_sqm for quote line costing).
function computeCornerCutList(item, W, H, D, T, BT, shelfQty) {
  const secW = Number(item.secondary_width_mm) || 0;
  if (!secW) return [];

  const legAPanelDepth = Math.max(0, D - BT);
  const legBWidth = Math.max(0, secW - D);
  const SHELF_SETBACK = 20;
  const parts = [];

  parts.push({ name: "Side — Wall 1 outer end", dim1: H, axis1: "H", dim2: legAPanelDepth, axis2: "D" });
  parts.push({ name: "Side — Wall 2 outer end", dim1: H, axis1: "H", dim2: legAPanelDepth, axis2: "D" });
  parts.push({ name: "Top — Wall 1 leg",    dim1: Math.max(0, W - T), axis1: "W", dim2: legAPanelDepth, axis2: "D" });
  parts.push({ name: "Bottom — Wall 1 leg", dim1: Math.max(0, W - T), axis1: "W", dim2: legAPanelDepth, axis2: "D" });

  if (legBWidth > 0) {
    parts.push({ name: "Top — Wall 2 leg",    dim1: Math.max(0, legBWidth - T), axis1: "W", dim2: legAPanelDepth, axis2: "D" });
    parts.push({ name: "Bottom — Wall 2 leg", dim1: Math.max(0, legBWidth - T), axis1: "W", dim2: legAPanelDepth, axis2: "D" });
  }

  if (BT > 0) {
    parts.push({ name: "Back — Wall 1 leg", dim1: W, axis1: "W", dim2: H, axis2: "H", material: "back" });
    if (legBWidth > 0) {
      parts.push({ name: "Back — Wall 2 leg", dim1: legBWidth, axis1: "W", dim2: H, axis2: "H", material: "back" });
    }
  }

  for (let i = 0; i < shelfQty; i++) {
    const suffix = shelfQty === 1 ? "" : ` ${i + 1}`;
    parts.push({ name: `Shelf${suffix} — Wall 1 leg`, dim1: Math.max(0, W - T), axis1: "W", dim2: legAPanelDepth - SHELF_SETBACK, axis2: "D", material: "shelf" });
    if (legBWidth > 0) {
      parts.push({ name: `Shelf${suffix} — Wall 2 leg`, dim1: Math.max(0, legBWidth - T), axis1: "W", dim2: legAPanelDepth - SHELF_SETBACK, axis2: "D", material: "shelf" });
    }
  }

  return parts;
}

function computeCutList(item, allItems = [], room = null) {
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
  const SHELF_SETBACK = 20;

  const parts = item.item_type === "corner_base_cabinet"
    ? computeCornerCutList(item, W, H, D, T, BT, shelfQty)
    : [];

  if (item.item_type !== "corner_base_cabinet") {
    parts.push({ name: "Left Side",  dim1: H, axis1: "H", dim2: D, axis2: "D" });
    parts.push({ name: "Right Side", dim1: H, axis1: "H", dim2: D, axis2: "D" });
    parts.push({ name: "Top",    dim1: innerW, axis1: "W", dim2: D, axis2: "D" });
    parts.push({ name: "Bottom", dim1: innerW, axis1: "W", dim2: D, axis2: "D" });

    if (BT > 0) {
      parts.push({ name: "Back Panel", dim1: innerW, axis1: "W", dim2: H, axis2: "H", material: "back" });
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
      const channelH = Math.max(0, H - housingH);
      parts.push({ name: "Rangehood Housing Divider", dim1: innerW, axis1: "W", dim2: D, axis2: "D" });
      parts.push({ name: "Rangehood Channel — Left Wall",  dim1: channelH, axis1: "H", dim2: D, axis2: "D" });
      parts.push({ name: "Rangehood Channel — Right Wall", dim1: channelH, axis1: "H", dim2: D, axis2: "D" });
    }

    for (let i = 0; i < shelfQty; i++) {
      const suffix = shelfQty === 1 ? "" : ` ${i + 1}`;
      if (hasChannel) {
        const sideTotal = Math.max(0, innerW - channelW);
        const leftW = Math.floor(sideTotal / 2);
        const rightW = sideTotal - leftW;
        parts.push({ name: `Shelf${suffix} — Left`,  dim1: leftW,  axis1: "W", dim2: D - SHELF_SETBACK, axis2: "D", material: "shelf" });
        parts.push({ name: `Shelf${suffix} — Right`, dim1: rightW, axis1: "W", dim2: D - SHELF_SETBACK, axis2: "D", material: "shelf" });
      } else {
        const name = shelfQty === 1 ? "Shelf" : `Shelf ${i + 1}`;
        parts.push({ name, dim1: innerW, axis1: "W", dim2: D - SHELF_SETBACK, axis2: "D", material: "shelf" });
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
        parts.push({ name: `Door${suffix}`, dim1: size.width, axis1: "W", dim2: size.height, axis2: "H", material: "door" });
      });
    } else if (item.front_type === "drawers") {
      computeDrawerSizes(item).forEach((size) => {
        const suffix = size.qty > 1 ? ` ×${size.qty}` : "";
        parts.push({ name: `Drawer Front${suffix}`, dim1: size.width, axis1: "W", dim2: size.height, axis2: "H", material: "drawer" });
      });
    } else if (item.front_type === "mixed") {
      const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
      sections.forEach((sec, idx) => {
        const sectionLabel = `Section ${idx + 1}`;
        if (sec.type === "drawers") {
          computeDrawerSizesForConfig(sec.drawer || {}, item.width_mm, sec.height_mm).forEach((size) => {
            const suffix = size.qty > 1 ? ` ×${size.qty}` : "";
            parts.push({ name: `Drawer Front — ${sectionLabel}${suffix}`, dim1: size.width, axis1: "W", dim2: size.height, axis2: "H", material: "drawer" });
          });
        } else if (sec.type === "doors") {
          computeDoorSizesForConfig(sec.door || {}, item.width_mm, sec.height_mm).forEach((size) => {
            const suffix = size.qty > 1 ? ` ×${size.qty}` : "";
            parts.push({ name: `Door — ${sectionLabel}${suffix}`, dim1: size.width, axis1: "W", dim2: size.height, axis2: "H", material: "door" });
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
    const kH    = Number(item.kickboard_height_mm) || 150;
    const kSpan = item.kickboard_span || "continuous";
    const isCorner = item.item_type === "corner_base_cabinet";

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

  // End & back panels — base/tall cabinets only (matches BACK_PANEL_TYPES in
  // lib/pcd-backpanel-utils.js; a corner cabinet's "back" isn't a single
  // well-defined side given its L-shape, and wall cabinets aren't
  // floor-standing). panel_to_floor extends both down through where a
  // kickboard recess would otherwise be, instead of stopping at carcass height.
  if (item.item_type === "base_cabinet" || item.item_type === "tall_cabinet") {
    const panelH = item.panel_to_floor ? H + (Number(item.kickboard_height_mm) || 150) : H;

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
      const kH2 = Number(item.kickboard_height_mm) || 150;
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
  if (item.item_type === "corner_base_cabinet" && (item.back_panel_wall1 || item.back_panel_wall2)) {
    const panelH = item.panel_to_floor ? H + (Number(item.kickboard_height_mm) || 150) : H;
    const secW = Number(item.secondary_width_mm) || 0;

    if (item.back_panel_wall1) parts.push({ name: "Back Panel — Wall 1", dim1: W, axis1: "W", dim2: panelH, axis2: "H", material: "panel" });
    if (item.back_panel_wall2 && item.secondary_wall && secW > 0) {
      parts.push({ name: "Back Panel — Wall 2", dim1: secW, axis1: "W", dim2: panelH, axis2: "H", material: "panel" });
    }

    if (item.has_kickboard && !item.panel_to_floor) {
      const kH2 = Number(item.kickboard_height_mm) || 150;
      if (item.back_panel_wall1) parts.push({ name: "Kickboard — Wall 1 Back", dim1: W, axis1: "W", dim2: kH2, axis2: "H", material: "kickboard" });
      if (item.back_panel_wall2 && item.secondary_wall && secW > 0) {
        parts.push({ name: "Kickboard — Wall 2 Back", dim1: secW, axis1: "W", dim2: kH2, axis2: "H", material: "kickboard" });
      }
    }
  }

  return parts;
}

const MAT_DOT_COLOR = {
  shelf:     "#3b82f6",
  back:      "#6b7280",
  kickboard: "#f59e0b",
  panel:     "#a855f7",
  door:      "#a855f7",
  drawer:    "#8b5cf6",
};

function CutListRow({ part }) {
  const dotColor = MAT_DOT_COLOR[part.material] || null;
  return (
    <div className={styles.cutListRow}>
      {dotColor && <span className={styles.cutListMatDot} style={{ background: dotColor }} />}
      <span className={styles.cutListDim}>
        {part.dim1} <span className={styles.cutListAxis}>({part.axis1})</span>
        {" × "}
        {part.dim2} <span className={styles.cutListAxis}>({part.axis2})</span>
      </span>
      <span className={styles.cutListName}>{part.name}</span>
    </div>
  );
}

const WALL_SHORT = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };

function KickboardRunItem({ run, runId, openItems, toggleItem }) {
  const isExpanded = openItems.has(runId);
  const totalWidth = run.segments.reduce((sum, s) => sum + s.length, 0);
  const kHeight    = run.segments[0]?.item?.kickboard_height_mm || 150;

  return (
    <div className={styles.leftItemBlock}>
      <div className={styles.leftItemRow}>
        <span className={styles.leftItemDot} style={{ background: "#f59e0b" }} />
        <span className={styles.leftItemLabel}>
          Kickboard {WALL_SHORT[run.wall] || run.wall}
        </span>
        <span className={styles.leftItemType} style={{ color: "#f59e0b" }}>run</span>
        <button
          type="button"
          className={`${styles.leftItemExpand} ${isExpanded ? styles.leftItemExpandOpen : ""}`}
          onClick={(e) => toggleItem(runId, e)}
          title={isExpanded ? "Collapse" : "Show cabinets in this run"}
        >
          ›
        </button>
      </div>
      {isExpanded && (
        <div className={styles.cutList}>
          {run.segments.map((seg) => (
            <div key={`${seg.item.id}-${seg.leg}`} className={styles.cutListRow}>
              <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
              <span className={styles.cutListDim}>
                {seg.length} <span className={styles.cutListAxis}>(W)</span>
              </span>
              <span className={styles.cutListName}>
                {seg.item.label || seg.item.item_type}
                {seg.leg === "secondary" ? " (Wall 2)" : seg.item.item_type === "corner_base_cabinet" ? " (Wall 1)" : ""}
              </span>
            </div>
          ))}
          <div className={styles.cutListRow} style={{ marginTop: 5, borderTop: "1px solid rgba(245,158,11,0.2)", paddingTop: 5 }}>
            <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
            <span className={styles.cutListDim} style={{ color: "rgba(245,158,11,0.9)" }}>
              {totalWidth} <span className={styles.cutListAxis}>(W)</span>
              {" × "}
              {kHeight} <span className={styles.cutListAxis}>(H)</span>
            </span>
            <span className={styles.cutListName}>Total cut</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BackPanelRunItem({ run, runId, openItems, toggleItem }) {
  const isExpanded = openItems.has(runId);
  const totalWidth = run.segments.reduce((sum, s) => sum + s.length, 0);
  const firstItem  = run.segments[0]?.item;
  const qty        = firstItem?.back_panel_qty || 1;
  const panelH     = firstItem?.panel_to_floor
    ? (Number(firstItem.height_mm) || 0) + (Number(firstItem.kickboard_height_mm) || 150)
    : (Number(firstItem.height_mm) || 0);
  const widths = splitBackPanelWidths(totalWidth, qty);
  const showKickboard = firstItem?.has_kickboard && !firstItem?.panel_to_floor;
  const kickboardH = Number(firstItem?.kickboard_height_mm) || 150;

  return (
    <div className={styles.leftItemBlock}>
      <div className={styles.leftItemRow}>
        <span className={styles.leftItemDot} style={{ background: "#a855f7" }} />
        <span className={styles.leftItemLabel}>
          Back Panel {WALL_SHORT[run.wall] || run.wall}
        </span>
        <span className={styles.leftItemType} style={{ color: "#a855f7" }}>run</span>
        <button
          type="button"
          className={`${styles.leftItemExpand} ${isExpanded ? styles.leftItemExpandOpen : ""}`}
          onClick={(e) => toggleItem(runId, e)}
          title={isExpanded ? "Collapse" : "Show cabinets & panels in this run"}
        >
          ›
        </button>
      </div>
      {isExpanded && (
        <div className={styles.cutList}>
          {run.segments.map((seg) => (
            <div key={seg.item.id} className={styles.cutListRow}>
              <span className={styles.cutListMatDot} style={{ background: "#a855f7" }} />
              <span className={styles.cutListDim}>
                {seg.length} <span className={styles.cutListAxis}>(W)</span>
              </span>
              <span className={styles.cutListName}>{seg.item.label || seg.item.item_type}</span>
            </div>
          ))}
          {widths.map((w, i) => (
            <div
              key={`panel-${i}`}
              className={styles.cutListRow}
              style={i === 0 ? { marginTop: 5, borderTop: "1px solid rgba(168,85,247,0.2)", paddingTop: 5 } : undefined}
            >
              <span className={styles.cutListMatDot} style={{ background: "#a855f7" }} />
              <span className={styles.cutListDim} style={{ color: "rgba(168,85,247,0.9)" }}>
                {w} <span className={styles.cutListAxis}>(W)</span>
                {" × "}
                {panelH} <span className={styles.cutListAxis}>(H)</span>
              </span>
              <span className={styles.cutListName}>Panel {i + 1} of {widths.length}</span>
            </div>
          ))}
          {showKickboard && (
            <div className={styles.cutListRow} style={{ marginTop: 5, borderTop: "1px solid rgba(245,158,11,0.2)", paddingTop: 5 }}>
              <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
              <span className={styles.cutListDim} style={{ color: "rgba(245,158,11,0.9)" }}>
                {totalWidth} <span className={styles.cutListAxis}>(W)</span>
                {" × "}
                {kickboardH} <span className={styles.cutListAxis}>(H)</span>
              </span>
              <span className={styles.cutListName}>Kickboard — Back (continues under panel)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DesignLeftPanel({
  project,
  rooms,
  items,
  selectedRoomId,
  selectedItemId,
  onSelectRoom,
  onSelectItem,
  onAddRoom,
  onUpdateRoom,
  onDeleteRoom,
  onDeleteItem,
  onOpenImport,
  onOpenMaterialDefaults,
  onAddCabinet,
}) {
  const [openRooms, setOpenRooms]         = useState(() => rooms.map((r) => r.id));
  const [openItems, setOpenItems]         = useState(new Set());
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [roomDraft, setRoomDraft]         = useState({});
  const [addingRoom, setAddingRoom]       = useState(false);
  const [newRoomName, setNewRoomName]     = useState("");
  const [roomBusy, setRoomBusy]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: "room"|"item", id }
  const confirmTimerRef                   = useRef(null);

  function toggleRoom(id) {
    setOpenRooms((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleItem(id, e) {
    e.stopPropagation();
    setOpenItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function startEditRoom(e, room) {
    e.stopPropagation();
    setEditingRoomId(room.id);
    setRoomDraft({
      name:      room.name      || "",
      width_mm:  room.width_mm  ?? 4000,
      depth_mm:  room.depth_mm  ?? 3000,
      height_mm: room.height_mm ?? 2400,
    });
  }

  function cancelEditRoom(e) {
    e?.stopPropagation();
    setEditingRoomId(null);
    setRoomDraft({});
  }

  function requestDelete(type, id, e) {
    e?.stopPropagation();
    clearTimeout(confirmTimerRef.current);
    if (confirmDelete?.type === type && confirmDelete?.id === id) {
      // Second click — execute
      setConfirmDelete(null);
      if (type === "room") onDeleteRoom(id);
      else onDeleteItem?.(id);
    } else {
      setConfirmDelete({ type, id });
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(null), 3000);
    }
  }

  async function saveRoomDimensions(roomId) {
    await onUpdateRoom(roomId, {
      name:      roomDraft.name?.trim() || undefined,
      width_mm:  roomDraft.width_mm  ? Number(roomDraft.width_mm)  : null,
      depth_mm:  roomDraft.depth_mm  ? Number(roomDraft.depth_mm)  : null,
      height_mm: roomDraft.height_mm ? Number(roomDraft.height_mm) : null,
    });
    setEditingRoomId(null);
    setRoomDraft({});
  }

  async function handleAddRoom() {
    if (!newRoomName.trim()) return;
    setRoomBusy(true);
    try {
      const room = await onAddRoom(newRoomName.trim());
      if (room?.id) setOpenRooms((prev) => [...prev, room.id]);
      setNewRoomName("");
      setAddingRoom(false);
    } catch { /* swallow */ }
    finally { setRoomBusy(false); }
  }

  function renderItem(item, roomId, room = null) {
    const isCabinet  = CABINET_TYPES.includes(item.item_type);
    const isSelected = item.id === selectedItemId;
    const isExpanded = openItems.has(item.id);
    const cutList    = isCabinet && isExpanded ? computeCutList(item, items, room) : [];

    return (
      <div key={item.id} className={styles.leftItemBlock}>
        {/* Item header row */}
        <div
          className={`${styles.leftItemRow} ${isSelected ? styles.leftItemRowSelected : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => { if (roomId) onSelectRoom(roomId); onSelectItem(item.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { if (roomId) onSelectRoom(roomId); onSelectItem(item.id); } }}
        >
          <span
            className={styles.leftItemDot}
            style={{ background: ITEM_COLORS[item.item_type] || "#888" }}
          />
          <span className={styles.leftItemLabel}>
            {item.label || item.item_type}
            {item.qty > 1 && <span className={styles.leftItemQty}> ×{item.qty}</span>}
          </span>
          <span className={styles.leftItemType}>{TYPE_SHORT[item.item_type] || item.item_type}</span>
          <button
            type="button"
            className={`${styles.leftItemExpand} ${isExpanded ? styles.leftItemExpandOpen : ""}`}
            onClick={(e) => toggleItem(item.id, e)}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            ›
          </button>
        </div>

        {/* Cut list (cabinets) or a simple dimension summary (everything
            else — doors, drawer fronts, panels, obstructions) + delete */}
        {isExpanded && (
          <div className={styles.cutList}>
            {isCabinet ? (
              cutList.length > 0 ? (
                cutList.map((part, i) => <CutListRow key={i} part={part} />)
              ) : (
                <p className={styles.cutListEmpty}>Set dimensions to see cut list</p>
              )
            ) : (
              <div className={styles.cutListRow}>
                <span className={styles.cutListDim}>
                  {item.width_mm || 0} <span className={styles.cutListAxis}>(W)</span>
                  {" × "}
                  {item.height_mm || 0} <span className={styles.cutListAxis}>(H)</span>
                  {item.depth_mm ? (
                    <>
                      {" × "}
                      {item.depth_mm} <span className={styles.cutListAxis}>(D)</span>
                    </>
                  ) : null}
                </span>
              </div>
            )}
            <button
              type="button"
              className={`${styles.itemDeleteBtn} ${confirmDelete?.type === "item" && confirmDelete?.id === item.id ? styles.itemDeleteBtnConfirm : ""}`}
              onClick={(e) => requestDelete("item", item.id, e)}
            >
              {confirmDelete?.type === "item" && confirmDelete?.id === item.id ? "Confirm delete?" : "Delete item"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.leftPanel}>
      {/* Header */}
      <div className={styles.leftHeader}>
        <div className={styles.leftHeaderTop}>
          <Link href="/admin/design" className={styles.backLink}>
            ← All projects
          </Link>
        </div>
        <p className={styles.projectName}>{project?.name || "Design Tool"}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            className={styles.importBtn}
            onClick={onOpenMaterialDefaults}
            title="Set project-wide starting materials for new cabinets, shelves, doors, drawers and panels"
          >
            Material Defaults
          </button>
          <button
            type="button"
            className={styles.importBtn}
            onClick={onOpenImport}
          >
            Import to Quote
          </button>
        </div>
      </div>

      {/* Room list */}
      <div className={styles.leftScroll}>
        {rooms.map((room) => {
          const roomItems = items.filter((i) => i.room_id === room.id);
          const isOpen    = openRooms.includes(room.id);
          const isActive  = room.id === selectedRoomId;

          const isEditing = editingRoomId === room.id;

          return (
            <div key={room.id} className={styles.roomSection}>
              <div
                className={`${styles.roomSectionHeader} ${isActive ? styles.roomSectionHeaderActive : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => { onSelectRoom(room.id); toggleRoom(room.id); }}
                onKeyDown={(e) => { if (e.key === "Enter") { onSelectRoom(room.id); toggleRoom(room.id); } }}
              >
                <span className={`${styles.roomSectionChevron} ${isOpen ? styles.roomSectionChevronOpen : ""}`} />
                <span className={styles.roomSectionName}>{room.name}</span>
                <span className={styles.roomSectionCount}>{roomItems.length}</span>
                <button
                  type="button"
                  className={styles.roomEditBtn}
                  onClick={(e) => isEditing ? cancelEditRoom(e) : startEditRoom(e, room)}
                  title={isEditing ? "Cancel edit" : "Edit room dimensions"}
                >
                  {isEditing ? "✕" : "✎"}
                </button>
                <button
                  type="button"
                  className={`${styles.roomDeleteBtn} ${confirmDelete?.type === "room" && confirmDelete?.id === room.id ? styles.roomDeleteBtnConfirm : ""}`}
                  onClick={(e) => requestDelete("room", room.id, e)}
                  title={confirmDelete?.type === "room" && confirmDelete?.id === room.id ? "Click again to confirm delete" : "Delete room"}
                >
                  {confirmDelete?.type === "room" && confirmDelete?.id === room.id ? "Sure?" : "✕"}
                </button>
              </div>

              {/* Inline room editor */}
              {isEditing && (
                <div className={styles.roomDimEditor} onClick={(e) => e.stopPropagation()}>
                  <label className={styles.roomDimLabel} style={{ marginBottom: 6 }}>
                    Room name
                    <input
                      className={styles.roomDimInput}
                      type="text"
                      placeholder="e.g. Kitchen"
                      value={roomDraft.name}
                      onChange={(e) => setRoomDraft((d) => ({ ...d, name: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRoomDimensions(room.id); if (e.key === "Escape") cancelEditRoom(); }}
                      autoFocus
                    />
                  </label>
                  <div className={styles.roomDimRow}>
                    <label className={styles.roomDimLabel}>
                      Width
                      <input
                        className={styles.roomDimInput}
                        type="number"
                        min="1"
                        placeholder="mm"
                        value={roomDraft.width_mm}
                        onChange={(e) => setRoomDraft((d) => ({ ...d, width_mm: e.target.value }))}
                      />
                    </label>
                    <label className={styles.roomDimLabel}>
                      Depth
                      <input
                        className={styles.roomDimInput}
                        type="number"
                        min="1"
                        placeholder="mm"
                        value={roomDraft.depth_mm}
                        onChange={(e) => setRoomDraft((d) => ({ ...d, depth_mm: e.target.value }))}
                      />
                    </label>
                    <label className={styles.roomDimLabel}>
                      Height
                      <input
                        className={styles.roomDimInput}
                        type="number"
                        min="1"
                        placeholder="mm"
                        value={roomDraft.height_mm}
                        onChange={(e) => setRoomDraft((d) => ({ ...d, height_mm: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className={styles.roomDimActions}>
                    <button type="button" className={styles.roomDimSave} onClick={() => saveRoomDimensions(room.id)}>
                      Save
                    </button>
                    <button type="button" className={styles.roomDimCancel} onClick={cancelEditRoom}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isOpen && (
                <>
                  {roomItems.map((item) => renderItem(item, room.id, room))}
                  {/* Continuous kickboard runs (2+ cabinets) — own line items */}
                  {computeAllKickboardRuns(roomItems, room).map((run) => {
                    const runId = `kb-${room.id}-${run.wall}-${run.segments[0]?.item?.id}-${run.segments[0]?.leg}`;
                    return (
                      <KickboardRunItem
                        key={runId}
                        run={run}
                        runId={runId}
                        openItems={openItems}
                        toggleItem={toggleItem}
                      />
                    );
                  })}
                  {/* Continuous back panel runs (2+ cabinets) — own line items */}
                  {computeAllBackPanelRuns(roomItems).map((run) => {
                    const runId = `bp-${room.id}-${run.wall}-${run.segments[0]?.item?.id}`;
                    return (
                      <BackPanelRunItem
                        key={runId}
                        run={run}
                        runId={runId}
                        openItems={openItems}
                        toggleItem={toggleItem}
                      />
                    );
                  })}
                  {roomItems.length === 0 && (
                    <p style={{ padding: "6px 16px 6px 32px", fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>
                      No items yet
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}

        {rooms.length === 0 && (
          <p style={{ padding: "16px", fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0, textAlign: "center" }}>
            No rooms yet
          </p>
        )}

        {/* Unassigned items (room_id = null) */}
        {(() => {
          const unassigned = items.filter((i) => !i.room_id);
          if (!unassigned.length) return null;
          return (
            <div className={styles.roomSection}>
              <div className={styles.roomSectionHeader} style={{ cursor: "default" }}>
                <span className={styles.roomSectionName} style={{ color: "rgba(255,180,0,0.7)" }}>Unassigned</span>
                <span className={styles.roomSectionCount}>{unassigned.length}</span>
              </div>
              {unassigned.map((item) => renderItem(item, null))}
            </div>
          );
        })()}
      </div>

      {/* Add item button */}
      <div className={styles.addFreestandingRow}>
        <button
          type="button"
          className={styles.addFreestandingBtn}
          onClick={onAddCabinet}
          disabled={!selectedRoomId}
          title={selectedRoomId ? "Add an item — drag it to set position and wall" : "Select a room first"}
        >
          + Add Item
        </button>
      </div>

      {/* Add room */}
      <div className={styles.addRoomRow}>
        {addingRoom ? (
          <div className={styles.addRoomForm}>
            <div className={styles.addRoomInputRow}>
              <input
                className={styles.addRoomInput}
                placeholder="Room name"
                value={newRoomName}
                autoFocus
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !roomBusy) handleAddRoom();
                  if (e.key === "Escape") setAddingRoom(false);
                }}
              />
            </div>
            <div className={styles.addRoomFormBtns}>
              <button type="button" className={styles.addRoomSaveBtn} onClick={handleAddRoom} disabled={roomBusy}>
                {roomBusy ? "Adding…" : "Add"}
              </button>
              <button type="button" className={styles.addRoomCancelBtn} onClick={() => setAddingRoom(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.addRoomBtn} onClick={() => setAddingRoom(true)}>
            + Add Room
          </button>
        )}
      </div>
    </div>
  );
}
