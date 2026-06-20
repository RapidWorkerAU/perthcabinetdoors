"use client";

import { useState, useRef } from "react";
import styles from "../design.module.css";

const ITEM_COLORS = {
  base_cabinet:  "#3b82f6",
  wall_cabinet:  "#22c55e",
  tall_cabinet:  "#f97316",
  door:          "#a855f7",
  drawer_front:  "#8b5cf6",
  panel:         "#6b7280",
};

export const CABINET_MOUNT_MM = {
  base_cabinet:  0,
  wall_cabinet:  1400,
  tall_cabinet:  0,
  door:          0,
  drawer_front:  0,
  panel:         0,
};

const BENCH_HEIGHT_MM = 900;
const EDGE_SNAP_MM    = 10;
const WALL_LABELS = {
  top:    "Top Wall",
  bottom: "Bottom Wall",
  left:   "Left Wall",
  right:  "Right Wall",
};
const DRAGGABLE_TYPES = new Set(["base_cabinet", "wall_cabinet", "tall_cabinet"]);

// ---- Helpers ----------------------------------------------------------------

function resolveCollision1D(desired, width, obstacles, roomMax) {
  let x = Math.max(0, Math.min(desired, roomMax - width));
  const sorted = obstacles
    .map((o) => ({ lo: o.x_mm || 0, hi: (o.x_mm || 0) + (o.width_mm || 0) }))
    .filter((o) => o.hi > o.lo)
    .sort((a, b) => a.lo - b.lo);
  for (const { lo, hi } of sorted) {
    if (x < hi && x + width > lo) {
      const pushLeft  = lo - width;
      const pushRight = hi;
      x = (pushLeft >= 0 && x + width / 2 <= (lo + hi) / 2) ? pushLeft : pushRight;
      x = Math.max(0, Math.min(x, roomMax - width));
    }
  }
  return x;
}

function computeXGaps(xMm, wMm, others, roomMax) {
  let leftBound = 0, rightBound = roomMax;
  for (const o of others) {
    const ox = o.x_mm || 0, ow = o.width_mm || 0;
    if (ox + ow <= xMm) leftBound = Math.max(leftBound, ox + ow);
    if (ox >= xMm + wMm) rightBound = Math.min(rightBound, ox);
  }
  return { gapLeft: xMm - leftBound, gapRight: rightBound - (xMm + wMm), leftBound, rightBound };
}

function computeYGaps(mountMm, hMm, xMm, wMm, others, roomHeightMm) {
  let botBound = 0, topBound = roomHeightMm;
  for (const o of others) {
    const om = o.mount_height_mm, oh = o.height_mm || 720;
    const ox = o.x_mm || 0, ow = o.width_mm || 600;
    // only items that share x-range matter for vertical gaps
    if (ox < xMm + wMm && ox + ow > xMm) {
      if (om + oh <= mountMm) botBound = Math.max(botBound, om + oh);
      if (om >= mountMm + hMm) topBound = Math.min(topBound, om);
    }
  }
  return { gapBot: mountMm - botBound, gapTop: topBound - (mountMm + hMm), botBound, topBound };
}

// Snaps position to nearby cabinet edges within EDGE_SNAP_MM threshold.
// Returns adjusted { x_mm, mount_height_mm } plus snapX/snapY guide coordinates (null if no snap).
function applyEdgeSnap(xMm, mountMm, widthMm, heightMm, others, itemType, wallWidthMm, roomHeightMm) {
  let sx = xMm, sm = mountMm;
  let snapX = null, snapY = null;

  for (const o of others) {
    const ox = o.x_mm || 0;
    const ow = o.width_mm || 600;
    if (Math.abs(xMm - (ox + ow)) <= EDGE_SNAP_MM)                    { sx = ox + ow;           snapX = ox + ow; break; }
    if (Math.abs((xMm + widthMm) - ox) <= EDGE_SNAP_MM)               { sx = ox - widthMm;      snapX = ox;     break; }
    if (Math.abs(xMm - ox) <= EDGE_SNAP_MM)                           { sx = ox;                snapX = ox;     break; }
    if (Math.abs((xMm + widthMm) - (ox + ow)) <= EDGE_SNAP_MM)        { sx = ox + ow - widthMm; snapX = ox + ow; break; }
  }
  sx = Math.max(0, Math.min(sx, wallWidthMm - widthMm));

  if (itemType === "wall_cabinet") {
    for (const o of others) {
      const om = o.mount_height_mm ?? 0;
      const oh = o.height_mm || 720;
      if (Math.abs(mountMm - (om + oh)) <= EDGE_SNAP_MM)              { sm = om + oh;            snapY = om + oh; break; }
      if (Math.abs((mountMm + heightMm) - (om + oh)) <= EDGE_SNAP_MM) { sm = om + oh - heightMm; snapY = om + oh; break; }
      if (Math.abs(mountMm - om) <= EDGE_SNAP_MM)                     { sm = om;                 snapY = om;     break; }
      if (Math.abs((mountMm + heightMm) - om) <= EDGE_SNAP_MM)        { sm = om - heightMm;      snapY = om;     break; }
    }
    sm = Math.max(0, Math.min(sm, roomHeightMm - heightMm));
  }

  return { x_mm: sx, mount_height_mm: sm, snapX, snapY };
}

// ---- SVG sub-components ----------------------------------------------------

function ElevDimLine({ x1, y1, x2, y2, label, horizontal }) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const tw = String(label).length * 5.5 + 12;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
      {horizontal ? (
        <>
          <line x1={x1} y1={my - 5} x2={x1} y2={my + 5} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
          <line x1={x2} y1={my - 5} x2={x2} y2={my + 5} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
        </>
      ) : (
        <>
          <line x1={mx - 5} y1={y1} x2={mx + 5} y2={y1} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
          <line x1={mx - 5} y1={y2} x2={mx + 5} y2={y2} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
        </>
      )}
      <rect x={mx - tw / 2} y={my - 8} width={tw} height={14} fill="rgba(15,20,30,0.9)" rx={2} />
      <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="rgba(255,255,255,0.85)">
        {label}mm
      </text>
    </g>
  );
}

function GapDim({ x1, y1, x2, y2, label, horizontal }) {
  if (Math.round(label) <= 0) return null;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const tw = String(Math.round(label)).length * 5.5 + 10;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 2" />
      {horizontal ? (
        <>
          <line x1={x1} y1={my - 4} x2={x1} y2={my + 4} stroke="#f59e0b" strokeWidth={1} />
          <line x1={x2} y1={my - 4} x2={x2} y2={my + 4} stroke="#f59e0b" strokeWidth={1} />
        </>
      ) : (
        <>
          <line x1={mx - 4} y1={y1} x2={mx + 4} y2={y1} stroke="#f59e0b" strokeWidth={1} />
          <line x1={mx - 4} y1={y2} x2={mx + 4} y2={y2} stroke="#f59e0b" strokeWidth={1} />
        </>
      )}
      <rect x={mx - tw / 2} y={my - 7} width={tw} height={13} fill="rgba(0,0,0,0.8)" rx={2} />
      <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#f59e0b">
        {Math.round(label)}
      </text>
    </g>
  );
}

// ---- Main component --------------------------------------------------------

const WALL_AXIS = {
  top:    { widthKey: "width_mm",  label: "Top Wall" },
  bottom: { widthKey: "width_mm",  label: "Bottom Wall" },
  left:   { widthKey: "depth_mm",  label: "Left Wall" },
  right:  { widthKey: "depth_mm",  label: "Right Wall" },
};

export default function FrontElevationView({ wall: initialWall, room, items, onClose, onItemChange, onItemSelect }) {
  const [currentWall, setCurrentWall] = useState(initialWall);
  const [selectedId, setSelectedId]   = useState(null);
  const [drag, setDrag]               = useState(null);
  const [localPos, setLocalPos]       = useState({});
  const [localShelves, setLocalShelves] = useState({});
  const [snapGuides, setSnapGuides]   = useState(null); // { x?: mm, y?: mm }
  const svgRef      = useRef(null);
  const pressedRef  = useRef(false);

  // Reset selection/drag when switching walls
  function switchWall(w) {
    setCurrentWall(w);
    setSelectedId(null);
    setDrag(null);
    setLocalPos({});
    setLocalShelves({});
    setSnapGuides(null);
  }

  const wall = currentWall;

  // ---- Room / scale maths --------------------------------------------------
  const wallWidthMm  = (wall === "top" || wall === "bottom") ? (room.width_mm || 4000) : (room.depth_mm || 3000);
  const roomHeightMm = room.height_mm || 2400;

  const VIEW_W = 1000, VIEW_H = 600;
  const MT = 56, MB = 44, ML = 64, MR = 28;
  const avW   = VIEW_W - ML - MR;
  const avH   = VIEW_H - MT - MB;
  const scale = Math.min(avW / wallWidthMm, avH / roomHeightMm);
  const drawW = wallWidthMm  * scale;
  const drawH = roomHeightMm * scale;
  const ox    = ML + (avW - drawW) / 2;
  const oy    = MT + (avH - drawH) / 2;
  const floor = oy + drawH;

  // ---- Helpers -------------------------------------------------------------
  const wallItems = items.filter((i) => i.wall === wall);

  // Get the position of an item along the elevation wall axis (in mm).
  // For top/bottom walls: horizontal room position = item.x_mm.
  // For left/right walls (new format): item.x_mm = 0, y_mm = position along wall.
  //   Old format: item.x_mm stores the y-position (x > 0 means old format).
  function getWallPos(itemData) {
    if (wall === "left" || wall === "right") {
      const x = itemData.x_mm || 0;
      const y = itemData.y_mm || 0;
      return x > 0 ? x : y;
    }
    return itemData.x_mm || 0;
  }

  function svgPt(e) {
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
  }

  function getDisp(item) {
    const lp = localPos[item.id] || {};
    const baseX = getWallPos(item);
    return {
      x_mm:            lp.x_mm            ?? baseX,
      mount_height_mm: lp.mount_height_mm ?? item.mount_height_mm ?? (CABINET_MOUNT_MM[item.item_type] ?? 0),
    };
  }

  function getShelfPositions(item) {
    if (localShelves[item.id]?.length) return localShelves[item.id];
    if (item.shelf_heights_mm?.length) return item.shelf_heights_mm;
    const qty = item.shelf_qty || 0;
    if (!qty) return [];
    const T  = item.carcass_thickness_mm || 16;
    const hMm = item.height_mm || 720;
    const sec = (hMm - 2 * T) / (qty + 1);
    return Array.from({ length: qty }, (_, i) => T + sec * (i + 1));
  }

  // ---- Pointer handlers ----------------------------------------------------
  function handleItemPointerDown(e, item) {
    if (!DRAGGABLE_TYPES.has(item.item_type)) return;
    e.stopPropagation();
    pressedRef.current = true;
    setSelectedId(item.id);
    onItemSelect?.(item.id);
    const pt  = svgPt(e);
    const dis = getDisp(item);
    setDrag({
      type:       "item",
      itemId:     item.id,
      item_type:  item.item_type,
      width_mm:   item.width_mm  || 600,
      height_mm:  item.height_mm || 720,
      startPtX:   pt.x,
      startPtY:   pt.y,
      startXmm:   dis.x_mm,
      startMount: dis.mount_height_mm,
    });
  }

  function handleShelfPointerDown(e, item, idx, heightMm) {
    e.stopPropagation();
    pressedRef.current = true;
    const pt = svgPt(e);
    setDrag({
      type:       "shelf",
      itemId:     item.id,
      idx,
      T:          item.carcass_thickness_mm || 16,
      hMm:        item.height_mm || 720,
      startPtY:   pt.y,
      startH:     heightMm,
      allShelves: getShelfPositions(item),
    });
  }

  function handleSvgPointerMove(e) {
    if (!drag) return;
    const pt = svgPt(e);

    if (drag.type === "item") {
      const dxMm = (pt.x - drag.startPtX) / scale;
      const dyMm = (pt.y - drag.startPtY) / scale; // +ve = down SVG

      let newX     = drag.startXmm + dxMm;
      let newMount = drag.startMount;

      if (drag.item_type === "wall_cabinet") {
        newMount = Math.max(0, Math.min(roomHeightMm - drag.height_mm, drag.startMount - dyMm));
      }

      // All same-wall items for snap candidates.
      // Include kickboard visual offset in mount_height_mm so snap aligns to visible edges,
      // not the raw stored value (which ignores the kickboard raising the cabinet off the floor).
      const allWallOthers = wallItems
        .filter((i) => i.id !== drag.itemId)
        .map((i) => {
          const disp  = getDisp(i);
          const kbOff = (i.has_kickboard && (i.item_type === "base_cabinet" || i.item_type === "tall_cabinet"))
            ? (i.kickboard_height_mm || 150)
            : 0;
          return {
            ...disp,
            mount_height_mm: disp.mount_height_mm + kbOff,
            width_mm:        i.width_mm  || 600,
            height_mm:       i.height_mm || 720,
          };
        });

      // Apply edge snap before collision resolution
      const snapped = applyEdgeSnap(newX, newMount, drag.width_mm, drag.height_mm, allWallOthers, drag.item_type, wallWidthMm, roomHeightMm);
      newX     = snapped.x_mm;
      newMount = snapped.mount_height_mm;
      setSnapGuides(snapped.snapX != null || snapped.snapY != null
        ? { x: snapped.snapX, y: snapped.snapY }
        : null);

      // Collision resolution — recompute height-filtered obstacles after snap (mount may have changed)
      const vLo = newMount, vHi = newMount + drag.height_mm;
      const obstacles = allWallOthers
        .filter((i) => i.mount_height_mm < vHi && i.mount_height_mm + i.height_mm > vLo);

      newX = resolveCollision1D(newX, drag.width_mm, obstacles, wallWidthMm);

      const pos = { x_mm: newX };
      if (drag.item_type === "wall_cabinet") pos.mount_height_mm = newMount;
      setLocalPos((prev) => ({ ...prev, [drag.itemId]: pos }));

    } else if (drag.type === "shelf") {
      const dyMm = (pt.y - drag.startPtY) / scale;
      let newH = drag.startH - dyMm; // invert: move down SVG → lower height from bottom
      const minH = drag.T * 1.5;
      const maxH = drag.hMm - drag.T * 1.5;
      newH = Math.max(minH, Math.min(maxH, newH));

      const newShelves = [...drag.allShelves];
      newShelves[drag.idx] = newH;
      setLocalShelves((prev) => ({ ...prev, [drag.itemId]: newShelves }));
    }
  }

  function handleSvgPointerUp() {
    if (!drag) return;
    setSnapGuides(null);
    if (drag.type === "item") {
      const pos = localPos[drag.itemId];
      if (pos && onItemChange) {
        // Elevation x_mm is position along the wall axis.
        // For left/right walls in new format: save as y_mm (room-space vertical).
        // For top/bottom walls: save as x_mm (room-space horizontal).
        const isLR = wall === "left" || wall === "right";
        // For left/right walls, elevation x = position along wall = room y_mm.
        // Also zero x_mm to migrate any old-format items (where x_mm stored the y-position).
        const patch = isLR
          ? { x_mm: 0, y_mm: pos.x_mm, ...(pos.mount_height_mm !== undefined ? { mount_height_mm: pos.mount_height_mm } : {}) }
          : { x_mm: pos.x_mm, ...(pos.mount_height_mm !== undefined ? { mount_height_mm: pos.mount_height_mm } : {}) };
        onItemChange(drag.itemId, patch);
      }
    } else if (drag.type === "shelf") {
      const shelves = localShelves[drag.itemId];
      if (shelves && onItemChange) onItemChange(drag.itemId, { shelf_heights_mm: shelves });
    }
    setDrag(null);
  }

  // ---- Derived for gap overlays --------------------------------------------
  const draggingItem  = drag?.type === "item" ? wallItems.find((i) => i.id === drag.itemId) : null;
  const dragDisp      = draggingItem ? getDisp(draggingItem) : null;
  const draggingMount = dragDisp?.mount_height_mm ?? 0;
  const vLoDrag       = draggingMount;
  const vHiDrag       = draggingMount + (draggingItem?.height_mm || 720);
  const xGapObstacles = drag?.type === "item"
    ? wallItems
        .filter((i) => i.id !== drag.itemId)
        .map((i) => ({ ...getDisp(i), width_mm: i.width_mm || 600, height_mm: i.height_mm || 720 }))
        .filter((i) => i.mount_height_mm < vHiDrag && i.mount_height_mm + i.height_mm > vLoDrag)
    : [];

  const hasWallCabs = wallItems.some((i) => i.item_type === "wall_cabinet");

  // ---- Render --------------------------------------------------------------
  return (
    <div className={styles.elevationInline}>

      {/* Toolbar */}
      <div className={styles.elevationToolbar}>
        <button type="button" className={styles.elevationBackBtn} onClick={onClose}>
          ← Floor Plan
        </button>
        <div className={styles.elevationToolbarInfo}>
          <span className={styles.elevationToolbarTitle}>Elevation — {WALL_LABELS[wall] || wall}</span>
          <span className={styles.elevationToolbarSub}>
            {room.name} · {wallWidthMm}mm wide · {roomHeightMm}mm high
          </span>
        </div>

        {/* Wall switcher */}
        <div className={styles.elevWallPicker}>
          {["top", "left", "bottom", "right"].map((w) => {
            const count = items.filter((i) => i.wall === w).length;
            return (
              <button
                key={w}
                type="button"
                className={`${styles.elevWallBtn} ${w === wall ? styles.elevWallBtnActive : ""} ${count === 0 ? styles.elevWallBtnEmpty : ""}`}
                onClick={() => switchWall(w)}
                title={`${WALL_LABELS[w]} (${count} items)`}
              >
                {w[0].toUpperCase()}
                <span className={styles.elevWallBtnCount}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className={styles.elevationLegend}>
          {[
            { type: "base_cabinet", label: "Base" },
            { type: "wall_cabinet", label: "Wall" },
            { type: "tall_cabinet", label: "Tall" },
          ].map(({ type, label }) => (
            <div key={type} className={styles.elevationLegendItem}>
              <span className={styles.elevationLegendDot} style={{ background: ITEM_COLORS[type] }} />
              {label}
            </div>
          ))}
          <div className={styles.elevationLegendItem}>
            <span className={styles.elevationLegendLine} style={{ background: "rgba(99,102,241,0.6)" }} />
            Bench {BENCH_HEIGHT_MM}mm
          </div>
          {hasWallCabs && (
            <div className={styles.elevationLegendItem}>
              <span className={styles.elevationLegendLine} style={{ background: "rgba(34,197,94,0.6)" }} />
              Mount {CABINET_MOUNT_MM.wall_cabinet}mm
            </div>
          )}
        </div>
        {wallItems.length === 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            No cabinets on this wall
          </span>
        )}
      </div>

      {/* Item selector strip — visible even when cabinets overlap in SVG */}
      {wallItems.length > 0 && (
        <div className={styles.elevItemStrip}>
          {wallItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.elevItemChip} ${item.id === selectedId ? styles.elevItemChipActive : ""}`}
              style={{ "--chip-col": ITEM_COLORS[item.item_type] || "#888" }}
              onClick={() => {
                const next = item.id === selectedId ? null : item.id;
                setSelectedId(next);
                if (next) onItemSelect?.(next);
              }}
            >
              <span className={styles.elevItemChipDot} />
              {item.label || item.item_type}
            </button>
          ))}
        </div>
      )}

      {/* SVG drawing */}
      <div className={styles.elevationSvgArea}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", cursor: drag ? "grabbing" : "default" }}
          onClick={(e) => {
            if (pressedRef.current) { pressedRef.current = false; return; }
            if (e.target === svgRef.current) setSelectedId(null);
          }}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerLeave={handleSvgPointerUp}
        >
          {/* Room background */}
          <rect x={ox} y={oy} width={drawW} height={drawH}
            fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />

          {/* Grid lines every 600mm */}
          {Array.from({ length: Math.ceil(wallWidthMm / 600) }).map((_, i) => (
            <line key={`gx${i}`}
              x1={ox + (i + 1) * 600 * scale} y1={oy}
              x2={ox + (i + 1) * 600 * scale} y2={floor}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
          {Array.from({ length: Math.ceil(roomHeightMm / 600) }).map((_, i) => (
            <line key={`gy${i}`}
              x1={ox} y1={oy + (i + 1) * 600 * scale}
              x2={ox + drawW} y2={oy + (i + 1) * 600 * scale}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}

          {/* Bench height reference */}
          <line x1={ox} y1={floor - BENCH_HEIGHT_MM * scale}
            x2={ox + drawW} y2={floor - BENCH_HEIGHT_MM * scale}
            stroke="rgba(99,102,241,0.35)" strokeWidth={1} strokeDasharray="6 3"
            style={{ pointerEvents: "none" }} />
          <text x={ox + drawW + 4} y={floor - BENCH_HEIGHT_MM * scale}
            fontSize={8} dominantBaseline="middle" fill="rgba(99,102,241,0.6)">
            {BENCH_HEIGHT_MM}
          </text>

          {/* Wall cabinet mount reference */}
          {hasWallCabs && (
            <>
              <line x1={ox} y1={floor - CABINET_MOUNT_MM.wall_cabinet * scale}
                x2={ox + drawW} y2={floor - CABINET_MOUNT_MM.wall_cabinet * scale}
                stroke="rgba(34,197,94,0.3)" strokeWidth={1} strokeDasharray="5 3"
                style={{ pointerEvents: "none" }} />
              <text x={ox + drawW + 4} y={floor - CABINET_MOUNT_MM.wall_cabinet * scale}
                fontSize={8} dominantBaseline="middle" fill="rgba(34,197,94,0.55)">
                {CABINET_MOUNT_MM.wall_cabinet}
              </text>
            </>
          )}

          {/* Ceiling line */}
          <line x1={ox} y1={oy} x2={ox + drawW} y2={oy} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
          <text x={ox - 6} y={oy} fontSize={8} textAnchor="end" dominantBaseline="middle"
            fill="rgba(255,255,255,0.3)">
            CEILING
          </text>

          {/* Cabinets */}
          {wallItems.map((item) => {
            const dis    = getDisp(item);
            const xMm    = dis.x_mm;
            const mountH = dis.mount_height_mm;
            const wMm    = item.width_mm  || 600;
            const hMm    = item.height_mm || 720;
            // Kickboard lifts the cabinet body off the floor by kickboard height
            const kbMm   = (item.has_kickboard && (item.item_type === "base_cabinet" || item.item_type === "tall_cabinet"))
              ? (item.kickboard_height_mm || 150)
              : 0;
            const fill   = ITEM_COLORS[item.item_type] || "#888";
            const svgX   = ox + xMm  * scale;
            const svgW   = wMm * scale;
            const svgH   = hMm * scale;
            const svgY   = floor - (mountH + kbMm + hMm) * scale;
            const T      = Math.max((item.carcass_thickness_mm || 16) * scale, 1.5);
            const isSelected = item.id === selectedId;
            const isDragging = drag?.itemId === item.id;
            const shelves    = getShelfPositions(item);
            const cx = svgX + svgW / 2;
            const cy = svgY + svgH / 2;
            const shortLabel = (item.label || item.item_type).slice(0, 14);
            const fs = Math.min(Math.max(svgW / (shortLabel.length * 0.72), 7), 12);
            const canDrag = DRAGGABLE_TYPES.has(item.item_type);

            return (
              <g key={item.id}
                style={{ cursor: canDrag ? (isDragging ? "grabbing" : "grab") : "default" }}
                onPointerDown={(e) => handleItemPointerDown(e, item)}
              >
                {/* Cabinet body */}
                <rect x={svgX} y={svgY} width={svgW} height={svgH}
                  fill={fill} fillOpacity={isDragging ? 0.14 : 0.1}
                  stroke={fill} strokeWidth={isSelected ? 2 : 1.5}
                  strokeOpacity={isSelected ? 1 : 0.7}
                  rx={2} />

                {/* Selection glow */}
                {isSelected && (
                  <rect x={svgX - 2} y={svgY - 2} width={svgW + 4} height={svgH + 4}
                    fill="none" stroke={fill} strokeWidth={1} strokeOpacity={0.3} rx={3}
                    style={{ pointerEvents: "none" }} />
                )}

                {/* Side panels */}
                <rect x={svgX} y={svgY} width={T} height={svgH}
                  fill={fill} fillOpacity={0.45} style={{ pointerEvents: "none" }} />
                <rect x={svgX + svgW - T} y={svgY} width={T} height={svgH}
                  fill={fill} fillOpacity={0.45} style={{ pointerEvents: "none" }} />
                {/* Top panel */}
                <rect x={svgX} y={svgY} width={svgW} height={T}
                  fill={fill} fillOpacity={0.45} style={{ pointerEvents: "none" }} />
                {/* Bottom panel */}
                <rect x={svgX} y={svgY + svgH - T} width={svgW} height={T}
                  fill={fill} fillOpacity={0.45} style={{ pointerEvents: "none" }} />

                {/* Shelves */}
                {shelves.map((shelfH, si) => {
                  const sy  = (svgY + svgH) - shelfH * scale - T / 2;
                  const isShelfDragging = drag?.type === "shelf" && drag.itemId === item.id && drag.idx === si;
                  return (
                    <g key={`sh${si}`}>
                      <rect
                        x={svgX + T} y={sy}
                        width={Math.max(svgW - 2 * T, 0)} height={T}
                        fill={fill} fillOpacity={isSelected ? 0.55 : 0.3}
                        style={{ cursor: isSelected ? "ns-resize" : "default" }}
                        onPointerDown={isSelected ? (e) => handleShelfPointerDown(e, item, si, shelfH) : undefined}
                      />
                      {/* Shelf drag handle (centred grip) */}
                      {isSelected && (
                        <rect
                          x={cx - 12} y={sy + T * 0.1}
                          width={24} height={T * 0.8}
                          fill={fill} fillOpacity={0.7} rx={1}
                          style={{ cursor: "ns-resize", pointerEvents: "none" }}
                        />
                      )}
                      {/* Height label when selected */}
                      {isSelected && svgW > 50 && (
                        <g style={{ pointerEvents: "none" }}>
                          <rect x={svgX + svgW + 3} y={sy - 7} width={38} height={13}
                            fill="rgba(0,0,0,0.75)" rx={2} />
                          <text x={svgX + svgW + 22} y={sy + T / 2}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={8} fill="#f59e0b">
                            {Math.round(shelfH)}mm
                          </text>
                          {/* Vertical leader from shelf to floor */}
                          {isShelfDragging && (
                            <line x1={svgX + svgW / 2} y1={svgY + svgH}
                              x2={svgX + svgW / 2} y2={sy + T / 2}
                              stroke={fill} strokeWidth={0.5} strokeDasharray="3 2" strokeOpacity={0.4} />
                          )}
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Door swing visualization — dotted V-triangle pointing to the opening edge */}
                {item.front_type === "doors" && svgW > 20 && svgH > 20 && (() => {
                  const cfg      = item.door_config || {};
                  const cols     = Math.max(1, cfg.columns || 1);
                  const rows     = Math.max(1, cfg.rows    || 1);
                  const hinges   = cfg.hinges      || Array(cols).fill("L");
                  const rawRat   = cfg.width_ratios || Array(cols).fill(1 / cols);
                  const totalR   = rawRat.reduce((s, r) => s + r, 0) || 1;
                  const parts = [];
                  for (let r = 0; r < rows; r++) {
                    const dH = svgH / rows;
                    const dY = svgY + r * dH;
                    let xOff = 0;
                    for (let c = 0; c < cols; c++) {
                      const ratio = rawRat[c] / totalR;
                      const dW    = svgW * ratio;
                      const dX    = svgX + xOff;
                      parts.push({ dX, dY, dW, dH, hinge: hinges[c] || "L", key: `d${r}-${c}` });
                      xOff += dW;
                    }
                  }
                  return (
                    <g style={{ pointerEvents: "none" }}>
                      {parts.map(({ dX, dY, dW, dH, hinge, key }) => {
                        const midY  = dY + dH / 2;
                        // tip = the "opening" edge; base = the hinge edge
                        const tipX  = hinge === "L" ? dX + dW : dX;
                        const baseX = hinge === "L" ? dX       : dX + dW;
                        return (
                          <g key={key}>
                            {/* Door panel outline (shows individual doors within cabinet body) */}
                            <rect x={dX} y={dY} width={dW} height={dH}
                              fill="none" stroke={fill} strokeWidth={0.6} strokeOpacity={0.35} />
                            {/* V-triangle: two dotted lines from hinge corners meeting at opening-edge midpoint */}
                            <line x1={baseX} y1={dY}      x2={tipX} y2={midY}
                              stroke={fill} strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.55} />
                            <line x1={baseX} y1={dY + dH} x2={tipX} y2={midY}
                              stroke={fill} strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.55} />
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}

                {/* Label */}
                {svgW > 24 && svgH > 24 && (
                  <text x={cx} y={shelves.length ? cy - 8 : cy - 5}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs} fontWeight="600" fill={fill} fillOpacity={0.9}
                    style={{ pointerEvents: "none" }}>
                    {shortLabel}
                  </text>
                )}
                {svgW > 32 && svgH > 38 && (
                  <text x={cx} y={shelves.length ? cy + 4 : cy + 8}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={7} fill={fill} fillOpacity={0.55}
                    style={{ pointerEvents: "none" }}>
                    {wMm}w × {hMm}h
                  </text>
                )}
                {item.shelf_qty > 0 && svgH > 52 && svgW > 32 && (
                  <text x={cx} y={cy + 15}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={7} fill={fill} fillOpacity={0.4}
                    style={{ pointerEvents: "none" }}>
                    {item.shelf_qty} shelf{item.shelf_qty !== 1 ? "ves" : ""}
                  </text>
                )}

                {/* Kickboard / plinth strip — sits below the cabinet body, fills space to the floor */}
                {kbMm > 0 && (
                  <rect
                    x={svgX} y={svgY + svgH}
                    width={svgW} height={kbMm * scale}
                    fill="rgba(245,158,11,0.45)"
                    stroke="rgba(245,158,11,0.7)"
                    strokeWidth={0.5}
                    style={{ pointerEvents: "none" }}
                  />
                )}

                {/* Width dim leader below cabinet (below kickboard strip if present) */}
                {svgW > 18 && (
                  <ElevDimLine
                    x1={svgX} y1={svgY + svgH + kbMm * scale + 10}
                    x2={svgX + svgW} y2={svgY + svgH + kbMm * scale + 10}
                    label={wMm} horizontal
                  />
                )}
              </g>
            );
          })}

          {/* ---- Gap measurements during drag ---- */}
          {drag?.type === "item" && dragDisp && draggingItem && (() => {
            const xMm  = dragDisp.x_mm;
            const wMm  = draggingItem.width_mm  || 600;
            const hMm  = draggingItem.height_mm || 720;
            const mountMm = draggingMount;

            const { gapLeft, gapRight, leftBound, rightBound } =
              computeXGaps(xMm, wMm, xGapObstacles, wallWidthMm);

            const dimY = floor - (mountMm + hMm / 2) * scale; // mid-height of cabinet

            return (
              <g>
                {/* Left gap */}
                {gapLeft > 1 && (
                  <GapDim
                    x1={ox + leftBound * scale} y1={dimY}
                    x2={ox + xMm * scale} y2={dimY}
                    label={gapLeft} horizontal
                  />
                )}
                {/* Right gap */}
                {gapRight > 1 && (
                  <GapDim
                    x1={ox + (xMm + wMm) * scale} y1={dimY}
                    x2={ox + rightBound * scale} y2={dimY}
                    label={gapRight} horizontal
                  />
                )}
                {/* Vertical gaps for wall cabinets */}
                {draggingItem.item_type === "wall_cabinet" && (() => {
                  const { gapBot, gapTop, botBound, topBound } =
                    computeYGaps(mountMm, hMm, xMm, wMm,
                      xGapObstacles.map((o) => ({ ...o, mount_height_mm: o.mount_height_mm ?? 0 })),
                      roomHeightMm);
                  const dimX = ox + (xMm + wMm / 2) * scale;
                  const svgYtop = floor - (mountMm + hMm) * scale;
                  const svgYbot = floor - mountMm * scale;
                  return (
                    <>
                      {gapBot > 1 && (
                        <GapDim
                          x1={dimX} y1={floor - botBound * scale}
                          x2={dimX} y2={svgYbot}
                          label={gapBot} horizontal={false}
                        />
                      )}
                      {gapTop > 1 && (
                        <GapDim
                          x1={dimX} y1={svgYtop}
                          x2={dimX} y2={floor - topBound * scale}
                          label={gapTop} horizontal={false}
                        />
                      )}
                    </>
                  );
                })()}
              </g>
            );
          })()}

          {/* Snap guide lines — cyan dashes showing the edge being snapped to */}
          {snapGuides?.x != null && (
            <line
              x1={ox + snapGuides.x * scale} y1={oy}
              x2={ox + snapGuides.x * scale} y2={floor}
              stroke="rgba(0,230,230,0.75)" strokeWidth={1} strokeDasharray="4 2"
              style={{ pointerEvents: "none" }}
            />
          )}
          {snapGuides?.y != null && (
            <line
              x1={ox} y1={floor - snapGuides.y * scale}
              x2={ox + drawW} y2={floor - snapGuides.y * scale}
              stroke="rgba(0,230,230,0.75)" strokeWidth={1} strokeDasharray="4 2"
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Floor */}
          <rect x={ox} y={floor} width={drawW} height={5} fill="rgba(255,255,255,0.12)" />
          <text x={ox + drawW / 2} y={floor + 14}
            textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.25)">FLOOR</text>

          {/* Room width dimension (top) */}
          <ElevDimLine x1={ox} y1={MT - 24} x2={ox + drawW} y2={MT - 24} label={wallWidthMm} horizontal />

          {/* Room height dimension (left) */}
          <ElevDimLine x1={ML - 24} y1={oy} x2={ML - 24} y2={floor} label={roomHeightMm} horizontal={false} />
        </svg>
      </div>
    </div>
  );
}
