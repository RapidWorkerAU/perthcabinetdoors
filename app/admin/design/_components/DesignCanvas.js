"use client";

import { useCallback, useRef, useState } from "react";
import styles from "../design.module.css";
import { CABINET_MOUNT_MM } from "./FrontElevationView";

const VIEW_W = 1100;
const VIEW_H = 720;
const BAND    = 52;
const MARGIN  = 24;
const SNAP_MM = 10;
const WALL_SNAP_MM = 400; // cabinet snaps to wall if back is within this mm of wall edge

const ITEM_COLORS = {
  base_cabinet:  "#3b82f6",
  wall_cabinet:  "#22c55e",
  tall_cabinet:  "#f97316",
  door:          "#a855f7",
  drawer_front:  "#8b5cf6",
  panel:         "#6b7280",
};

const ITEM_SHORT = {
  base_cabinet:  "Base",
  wall_cabinet:  "Wall",
  tall_cabinet:  "Tall",
  door:          "Door",
  drawer_front:  "Drwr",
  panel:         "Panel",
};

// --- Geometry helpers ---

function computeLayout(room) {
  const W = room.width_mm || 4000;
  const D = room.depth_mm || 3000;
  const avW = VIEW_W - 2 * (BAND + MARGIN);
  const avH = VIEW_H - 2 * (BAND + MARGIN);
  const scale = Math.min(avW / W, avH / D);
  const roomW = W * scale;
  const roomH = D * scale;
  const ox = BAND + MARGIN + (avW - roomW) / 2;
  const oy = BAND + MARGIN + (avH - roomH) / 2;
  return { scale, roomW, roomH, ox, oy, W, D };
}

function snap(mm) { return Math.round(mm / SNAP_MM) * SNAP_MM; }
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

// ---- Absolute position helpers ----

// Returns absolute room-space (absX, absY) for any cabinet, normalising both old and new formats.
// Old format for left/right: x_mm = position along wall (room-space y), y_mm = 0.
// New format for left/right: x_mm = 0 (or roomW-depth), y_mm = position along wall.
function getAbsPos(item, roomW, roomD) {
  const x = item.x_mm || 0;
  const y = item.y_mm || 0;
  const d = item.depth_mm || 600;
  switch (item.wall) {
    case "top":    return { absX: x, absY: 0 };
    case "bottom": return { absX: x, absY: roomD - d };
    case "left":
      // x_mm > 0 = old format (x_mm stores the y position); otherwise new format
      return x > 0 ? { absX: 0, absY: x } : { absX: 0, absY: y };
    case "right":
      return x > 0 ? { absX: roomW - d, absY: x } : { absX: roomW - d, absY: y };
    default:
      return { absX: x, absY: y };
  }
}

// Snaps absolute position to nearest room wall if within WALL_SNAP_MM, else island.
// Returns {wall, x_mm, y_mm} in new coordinate format.
function snapToWall(rawAbsX, rawAbsY, itemW, itemD, currentWall, roomW, roomD) {
  // Bounding box depends on current orientation
  const isRotated = currentWall === "left" || currentWall === "right";
  const horizExt  = isRotated ? itemD : itemW;
  const vertExt   = isRotated ? itemW : itemD;

  const dTop    = rawAbsY;
  const dBottom = roomD - rawAbsY - vertExt;
  const dLeft   = rawAbsX;
  const dRight  = roomW - rawAbsX - horizExt;
  const minDist = Math.min(dTop, dBottom, dLeft, dRight);

  if (minDist > WALL_SNAP_MM) {
    return {
      wall:  "island",
      x_mm:  clamp(rawAbsX, 0, roomW - itemW),
      y_mm:  clamp(rawAbsY, 0, roomD - itemD),
    };
  }
  if (dTop <= dBottom && dTop <= dLeft && dTop <= dRight) {
    return { wall: "top",    x_mm: clamp(rawAbsX, 0, roomW - itemW), y_mm: 0            };
  }
  if (dBottom < dTop && dBottom <= dLeft && dBottom <= dRight) {
    return { wall: "bottom", x_mm: clamp(rawAbsX, 0, roomW - itemW), y_mm: roomD - itemD };
  }
  if (dLeft <= dRight) {
    return { wall: "left",   x_mm: 0,             y_mm: clamp(rawAbsY, 0, roomD - itemW) };
  }
  return   { wall: "right",  x_mm: roomW - itemD,  y_mm: clamp(rawAbsY, 0, roomD - itemW) };
}

// ---- Collision helpers ----

function resolveCollision1D(desired, width, obstacles, roomMax) {
  let x = clamp(desired, 0, roomMax - width);
  const sorted = obstacles
    .map((o) => ({ lo: o.x_mm || 0, hi: (o.x_mm || 0) + (o.width_mm || 0) }))
    .filter((o) => o.hi > o.lo)
    .sort((a, b) => a.lo - b.lo);
  for (const { lo, hi } of sorted) {
    if (x < hi && x + width > lo) {
      const pushLeft  = lo - width;
      const pushRight = hi;
      x = (pushLeft >= 0 && x + width / 2 < (lo + hi) / 2) ? pushLeft : pushRight;
      x = clamp(x, 0, roomMax - width);
    }
  }
  return x;
}

// Floor footprint of a cabinet in absolute room coordinates (for cross-wall collision).
function cabinetFootprint(item, roomW, roomD) {
  const { absX, absY } = getAbsPos(item, roomW, roomD);
  const w = item.width_mm || 600;
  const d = item.depth_mm || 600;
  switch (item.wall) {
    case "top":
    case "bottom": return { x: absX, y: absY, w,   h: d };
    case "left":
    case "right":  return { x: absX, y: absY, w: d, h: w };
    default:       return null;
  }
}

function resolveCollision2D(desiredX, desiredY, itemW, itemH, obstacles, roomW, roomD) {
  let x = clamp(desiredX, 0, roomW - itemW);
  let y = clamp(desiredY, 0, roomD - itemH);
  for (const o of obstacles) {
    const oX = o.x_mm || 0;
    const oY = o.y_mm || 0;
    const oW = o.width_mm  || 0;
    const oH = o.depth_mm  || 0;
    const overlapX = Math.min(x + itemW, oX + oW) - Math.max(x, oX);
    const overlapY = Math.min(y + itemH, oY + oH) - Math.max(y, oY);
    if (overlapX > 0 && overlapY > 0) {
      if (overlapX <= overlapY) {
        x = x + itemW / 2 <= oX + oW / 2 ? oX - itemW : oX + oW;
        x = clamp(x, 0, roomW - itemW);
      } else {
        y = y + itemH / 2 <= oY + oH / 2 ? oY - itemH : oY + oH;
        y = clamp(y, 0, roomD - itemH);
      }
    }
  }
  return { x, y };
}

function cabinetVerticalRange(item) {
  const mount = item.mount_height_mm ?? (CABINET_MOUNT_MM[item.item_type] ?? 0);
  return [mount, mount + (item.height_mm || 720)];
}
function verticalRangesOverlap([a0, a1], [b0, b1]) { return a0 < b1 && a1 > b0; }

function computeGaps1D(xMm, widthMm, others, roomMax) {
  const right = xMm + widthMm;
  const leftObs  = others.filter((o) => (o.x_mm || 0) + (o.width_mm || 0) <= xMm);
  const rightObs = others.filter((o) => (o.x_mm || 0) >= right);
  const leftBound  = leftObs.length  ? Math.max(...leftObs.map((o) => (o.x_mm || 0) + (o.width_mm || 0))) : 0;
  const rightBound = rightObs.length ? Math.min(...rightObs.map((o) => o.x_mm || 0)) : roomMax;
  return { leftGap: xMm - leftBound, rightGap: rightBound - right, leftBoundMm: leftBound, rightBoundMm: rightBound };
}

// ---- Gap dimension indicator ----
function GapDimension({ x1, y1, x2, y2, label, horizontal }) {
  if (!label || label <= 0) return null;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const textW = String(label).length * 6 + 10;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,210,50,0.45)" strokeWidth={1} strokeDasharray="3 2" />
      {horizontal ? (
        <>
          <line x1={x1} y1={my - 4} x2={x1} y2={my + 4} stroke="rgba(255,210,50,0.6)" strokeWidth={1} />
          <line x1={x2} y1={my - 4} x2={x2} y2={my + 4} stroke="rgba(255,210,50,0.6)" strokeWidth={1} />
        </>
      ) : (
        <>
          <line x1={mx - 4} y1={y1} x2={mx + 4} y2={y1} stroke="rgba(255,210,50,0.6)" strokeWidth={1} />
          <line x1={mx - 4} y1={y2} x2={mx + 4} y2={y2} stroke="rgba(255,210,50,0.6)" strokeWidth={1} />
        </>
      )}
      <rect x={mx - textW / 2} y={my - 8} width={textW} height={14} fill="rgba(0,0,0,0.7)" rx={3} />
      <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="700" fill="rgba(255,210,50,1)" style={{ userSelect: "none" }}>
        {label}mm
      </text>
    </g>
  );
}

function frontEdgeFor(wall, rotation) {
  if (wall === "island") {
    return ["bottom", "left", "top", "right"][((rotation || 0) / 90) % 4] || "bottom";
  }
  switch (wall) {
    case "top":    return "bottom";
    case "bottom": return "top";
    case "left":   return "right";
    case "right":  return "left";
    default:       return "bottom";
  }
}

// Returns {x, y, w, h} in SVG coordinates using absolute room position.
function cabinetSvgRect(item, lay) {
  const { scale, ox, oy, W, D } = lay;
  const iw  = Math.max((item.width_mm  || 600), 100);
  const id  = Math.max((item.depth_mm  || 600), 100);
  const { absX, absY } = getAbsPos(item, W, D);

  switch (item.wall) {
    case "left":
    case "right": {
      // depth runs horizontally (into room), width runs vertically (along wall)
      return {
        x: ox + clamp(absX, 0, W - id) * scale,
        y: oy + clamp(absY, 0, D - iw) * scale,
        w: id * scale,
        h: iw * scale,
      };
    }
    default: {
      // top, bottom, island: width horizontal, depth vertical
      return {
        x: ox + clamp(absX, 0, W - iw) * scale,
        y: oy + clamp(absY, 0, D - id) * scale,
        w: iw * scale,
        h: id * scale,
      };
    }
  }
}

// --- SVG sub-components ---

function FrontFaceStrip({ rect, frontEdge }) {
  const { x, y, w, h } = rect;
  const t = 5;
  let rx, ry, rw, rh;
  switch (frontEdge) {
    case "bottom": rx = x;       ry = y + h - t; rw = w; rh = t; break;
    case "top":    rx = x;       ry = y;         rw = w; rh = t; break;
    case "right":  rx = x + w - t; ry = y;       rw = t; rh = h; break;
    case "left":   rx = x;       ry = y;         rw = t; rh = h; break;
    default: return null;
  }
  return (
    <rect
      x={rx} y={ry} width={rw} height={rh}
      fill="rgba(255,255,255,0.80)"
      rx={1}
      style={{ pointerEvents: "none" }}
    />
  );
}

function CabinetShape({ item, lay, selected, dragging, onPointerDown, onPointerUp }) {
  const rect = cabinetSvgRect(item, lay);
  if (!rect) return null;

  const { x, y, w, h } = rect;
  const fill      = ITEM_COLORS[item.item_type] || "#888";
  const frontEdge = frontEdgeFor(item.wall, item.rotation);
  const cx = x + w / 2;
  const cy = y + h / 2;

  const label      = item.label || ITEM_SHORT[item.item_type] || "?";
  const shortLabel = label.length > 12 ? label.slice(0, 11) + "…" : label;
  const dimText    = item.width_mm ? `${item.width_mm}w` + (item.depth_mm ? ` × ${item.depth_mm}d` : "") : "";
  const fontSize   = Math.min(w, h) > 50 ? 10 : 8;
  const showDims   = w > 55 && h > 34 && dimText;

  return (
    <g
      style={{ cursor: dragging ? "grabbing" : "grab" }}
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, item); }}
      onPointerUp={(e)   => { e.stopPropagation(); onPointerUp(e, item); }}
    >
      <rect
        x={x} y={y} width={w} height={h}
        rx={3}
        fill={fill}
        fillOpacity={dragging ? 0.55 : selected ? 0.95 : 0.82}
        stroke={selected ? "#fff" : "rgba(255,255,255,0.35)"}
        strokeWidth={selected ? 2 : 1}
      />
      {w > 16 && h > 16 && (
        <rect
          x={x + 4} y={y + 4} width={Math.max(w - 8, 2)} height={Math.max(h - 8, 2)}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
          rx={1}
          style={{ pointerEvents: "none" }}
        />
      )}
      <FrontFaceStrip rect={rect} frontEdge={frontEdge} />
      {w > 22 && h > 18 && (
        <text
          x={cx} y={cy + (showDims ? -6 : 0)}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={fontSize} fontWeight="700" fill="#fff"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {shortLabel}
        </text>
      )}
      {showDims && (
        <text
          x={cx} y={cy + 7}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={7} fill="rgba(255,255,255,0.65)"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {dimText}
        </text>
      )}
      {/* Wall badge */}
      {item.wall && item.wall !== "island" && w > 18 && h > 14 && (
        <g style={{ pointerEvents: "none" }}>
          <rect x={x + w - 13} y={y + 2} width={11} height={11} rx={2} fill="rgba(0,0,0,0.55)" />
          <text x={x + w - 7.5} y={y + 7.5} textAnchor="middle" dominantBaseline="middle"
            fontSize={6.5} fill="rgba(255,255,255,0.75)" fontWeight="700">
            {item.wall[0].toUpperCase()}
          </text>
        </g>
      )}
      {selected && (
        <rect
          x={x - 3} y={y - 3} width={w + 6} height={h + 6}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          rx={4}
          style={{ pointerEvents: "none" }}
        />
      )}
    </g>
  );
}

// --- Main canvas ---

export default function DesignCanvas({
  room,
  items,
  selectedItemId,
  onItemClick,
  onDeselect,
  onItemDragEnd,
  onFrontView,
}) {
  const svgRef = useRef(null);
  const itemPressedRef = useRef(false);

  const [drag, setDrag] = useState(null);
  const [localPos, setLocalPos] = useState({});

  const lay = computeLayout(room);
  const { roomW, roomH, ox, oy, scale, W, D } = lay;

  function toSvgPt(clientX, clientY) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width)  * VIEW_W,
      y: ((clientY - rect.top)  / rect.height) * VIEW_H,
    };
  }

  // --- Drag handlers ---

  function handleItemPointerDown(e, item) {
    e.preventDefault();
    const pt = toSvgPt(e.clientX, e.clientY);
    itemPressedRef.current = true;
    const { absX, absY } = getAbsPos(item, W, D);
    setDrag({
      itemId:      item.id,
      wall:        item.wall,   // starting wall — used for orientation during drag
      startPt:     pt,
      startAbsX:   absX,
      startAbsY:   absY,
      itemWidthMm: item.width_mm  || 600,
      itemDepthMm: item.depth_mm  || 600,
    });
    onItemClick(item);
  }

  function handleItemPointerUp(e, item) {
    if (!drag || drag.itemId !== item.id) return;
    const current = localPos[item.id];
    if (current) {
      onItemDragEnd(item.id, current);
      setLocalPos((p) => { const n = { ...p }; delete n[item.id]; return n; });
    }
    setDrag(null);
  }

  const handleSvgPointerMove = useCallback(
    (e) => {
      if (!drag) return;
      const pt    = toSvgPt(e.clientX, e.clientY);
      const dxMm  = (pt.x - drag.startPt.x) / scale;
      const dyMm  = (pt.y - drag.startPt.y) / scale;

      const rawAbsX = drag.startAbsX + dxMm;
      const rawAbsY = drag.startAbsY + dyMm;

      // Detect target wall and get clamped snap position
      const snapped = snapToWall(rawAbsX, rawAbsY, drag.itemWidthMm, drag.itemDepthMm, drag.wall, W, D);
      const { wall: newWall } = snapped;
      let { x_mm: newX, y_mm: newY } = snapped;

      // Vertical range for height-aware collision (wall cabs above base cabs = no collision)
      const draggingItem   = items.find((i) => i.id === drag.itemId);
      const draggingVRange = draggingItem ? cabinetVerticalRange(draggingItem) : [0, 720];

      // Items on the detected target wall that conflict in height
      const sameWall = items.filter((i) =>
        i.id !== drag.itemId &&
        i.wall === newWall &&
        verticalRangesOverlap(draggingVRange, cabinetVerticalRange(i))
      );

      // Cross-wall footprint obstacles
      const dragDepth = drag.itemDepthMm;
      const crossWall = (newWall === "island") ? [] : items
        .filter((i) =>
          i.id !== drag.itemId &&
          i.wall !== newWall &&
          ["top","bottom","left","right"].includes(i.wall) &&
          verticalRangesOverlap(draggingVRange, cabinetVerticalRange(i))
        )
        .flatMap((other) => {
          const fp = cabinetFootprint(other, W, D);
          if (!fp) return [];
          if (newWall === "top" || newWall === "bottom") {
            const dragY0 = newWall === "top" ? 0 : D - dragDepth;
            const dragY1 = newWall === "top" ? dragDepth : D;
            if (fp.y < dragY1 && fp.y + fp.h > dragY0) return [{ x_mm: fp.x, width_mm: fp.w }];
          } else if (newWall === "left" || newWall === "right") {
            const dragX0 = newWall === "left" ? 0 : W - dragDepth;
            const dragX1 = newWall === "left" ? dragDepth : W;
            if (fp.x < dragX1 && fp.x + fp.w > dragX0) return [{ x_mm: fp.y, width_mm: fp.h }];
          }
          return [];
        });

      // Convert same-wall items to 1D obstacle format (position along wall axis)
      const sameWallObs = sameWall.map((o) => {
        const { absX: oAbsX, absY: oAbsY } = getAbsPos(o, W, D);
        return {
          x_mm:     (newWall === "left" || newWall === "right") ? oAbsY : oAbsX,
          width_mm: o.width_mm || 600,
        };
      });
      const others = [...sameWallObs, ...crossWall];

      if (newWall === "top" || newWall === "bottom") {
        newX = snap(resolveCollision1D(newX, drag.itemWidthMm, others, W));
      } else if (newWall === "left" || newWall === "right") {
        newY = snap(resolveCollision1D(newY, drag.itemWidthMm, others, D));
      } else {
        // Island: 2D collision with other island items
        const islandObs = items
          .filter((i) => i.id !== drag.itemId && i.wall === "island")
          .map((o) => ({ x_mm: o.x_mm || 0, y_mm: o.y_mm || 0, width_mm: o.width_mm || 0, depth_mm: o.depth_mm || 0 }));
        const resolved = resolveCollision2D(rawAbsX, rawAbsY, drag.itemWidthMm, drag.itemDepthMm, islandObs, W, D);
        newX = snap(resolved.x);
        newY = snap(resolved.y);
      }

      setLocalPos((p) => ({ ...p, [drag.itemId]: { wall: newWall, x_mm: newX, y_mm: newY } }));
    },
    [drag, scale, W, D, items, room] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSvgPointerUp = useCallback(
    () => {
      if (!drag) return;
      const current = localPos[drag.itemId];
      if (current) {
        onItemDragEnd(drag.itemId, current);
        setLocalPos((p) => { const n = { ...p }; delete n[drag.itemId]; return n; });
      }
      setDrag(null);
    },
    [drag, localPos, onItemDragEnd]
  );

  // Merge live drag positions for display
  const displayItems = items.map((item) =>
    localPos[item.id] ? { ...item, ...localPos[item.id] } : item
  );

  // Wall band areas (visual reference + elevation buttons)
  const wallBands = [
    { wall: "top",    x: ox,          y: oy - BAND,   w: roomW, h: BAND },
    { wall: "bottom", x: ox,          y: oy + roomH,  w: roomW, h: BAND },
    { wall: "left",   x: ox - BAND,   y: oy,          w: BAND,  h: roomH },
    { wall: "right",  x: ox + roomW,  y: oy,          w: BAND,  h: roomH },
  ];

  const wallLabels = [
    { wall: "top",    x: ox + roomW / 2,        y: oy - BAND / 2 },
    { wall: "bottom", x: ox + roomW / 2,        y: oy + roomH + BAND / 2 },
    { wall: "left",   x: ox - BAND / 2,         y: oy + roomH / 2, rotate: -90 },
    { wall: "right",  x: ox + roomW + BAND / 2, y: oy + roomH / 2, rotate: 90  },
  ];

  // Wall colour during drag: show which wall the cabinet will snap to
  const dragWall = drag ? (localPos[drag.itemId]?.wall ?? drag.wall) : null;

  return (
    <svg
      ref={svgRef}
      className={styles.canvasSvg}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={(e) => {
        if (itemPressedRef.current) { itemPressedRef.current = false; return; }
        if (e.target === svgRef.current) onDeselect();
      }}
      onPointerMove={handleSvgPointerMove}
      onPointerUp={handleSvgPointerUp}
      onPointerLeave={handleSvgPointerUp}
    >
      {/* ---- Room floor ---- */}
      <rect
        x={ox} y={oy} width={roomW} height={roomH}
        fill="#1e2940"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1.5}
        onClick={onDeselect}
        style={{ cursor: "default" }}
      />

      {/* Floor grid — 600mm */}
      {Array.from({ length: Math.ceil((room.width_mm || 4000) / 600) }).map((_, i) => (
        <line key={`gx-${i}`}
          x1={ox + (i + 1) * 600 * scale} y1={oy}
          x2={ox + (i + 1) * 600 * scale} y2={oy + roomH}
          stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          style={{ pointerEvents: "none" }} />
      ))}
      {Array.from({ length: Math.ceil((room.depth_mm || 3000) / 600) }).map((_, i) => (
        <line key={`gy-${i}`}
          x1={ox} y1={oy + (i + 1) * 600 * scale}
          x2={ox + roomW} y2={oy + (i + 1) * 600 * scale}
          stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          style={{ pointerEvents: "none" }} />
      ))}

      {/* ---- Room dimension labels ---- */}
      {room.width_mm && (
        <>
          <line x1={ox} y1={oy - BAND - 10} x2={ox + roomW} y2={oy - BAND - 10} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox} y1={oy - BAND - 6} x2={ox} y2={oy - BAND - 14} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW} y1={oy - BAND - 6} x2={ox + roomW} y2={oy - BAND - 14} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox + roomW / 2} y={oy - BAND - 17} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)" style={{ pointerEvents: "none" }}>{room.width_mm}mm</text>
          <line x1={ox} y1={oy + roomH + BAND + 10} x2={ox + roomW} y2={oy + roomH + BAND + 10} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox} y1={oy + roomH + BAND + 6} x2={ox} y2={oy + roomH + BAND + 14} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW} y1={oy + roomH + BAND + 6} x2={ox + roomW} y2={oy + roomH + BAND + 14} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox + roomW / 2} y={oy + roomH + BAND + 22} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)" style={{ pointerEvents: "none" }}>{room.width_mm}mm</text>
        </>
      )}
      {room.depth_mm && (
        <>
          <line x1={ox - BAND - 10} y1={oy} x2={ox - BAND - 10} y2={oy + roomH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox - BAND - 6} y1={oy} x2={ox - BAND - 14} y2={oy} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox - BAND - 6} y1={oy + roomH} x2={ox - BAND - 14} y2={oy + roomH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox - BAND - 17} y={oy + roomH / 2} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)" transform={`rotate(-90, ${ox - BAND - 17}, ${oy + roomH / 2})`} style={{ pointerEvents: "none" }}>{room.depth_mm}mm</text>
          <line x1={ox + roomW + BAND + 10} y1={oy} x2={ox + roomW + BAND + 10} y2={oy + roomH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW + BAND + 6} y1={oy} x2={ox + roomW + BAND + 14} y2={oy} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW + BAND + 6} y1={oy + roomH} x2={ox + roomW + BAND + 14} y2={oy + roomH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox + roomW + BAND + 17} y={oy + roomH / 2} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)" transform={`rotate(90, ${ox + roomW + BAND + 17}, ${oy + roomH / 2})`} style={{ pointerEvents: "none" }}>{room.depth_mm}mm</text>
        </>
      )}

      {/* ---- Wall bands (visual reference only — no click-to-add) ---- */}
      {wallBands.map(({ wall, x, y, w, h }) => {
        const isTarget = dragWall === wall;
        return (
          <rect
            key={wall}
            x={x} y={y} width={w} height={h}
            fill={isTarget ? "rgba(99,179,237,0.12)" : "rgba(255,255,255,0.03)"}
            stroke={isTarget ? "rgba(99,179,237,0.5)" : "rgba(255,255,255,0.08)"}
            strokeWidth={1}
            strokeDasharray={isTarget ? "0" : "5 4"}
            rx={4}
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Wall labels + elevation buttons */}
      {wallLabels.map(({ wall, x, y, rotate }) => {
        const isTarget = dragWall === wall;
        const btnW = 38, btnH = 14;
        let bx, by;
        if (wall === "top")    { bx = x - btnW / 2;     by = y + 8;  }
        if (wall === "bottom") { bx = x - btnW / 2;     by = y - 20; }
        if (wall === "left")   { bx = x - btnW / 2 + 2; by = y + 10; }
        if (wall === "right")  { bx = x - btnW / 2 - 2; by = y + 10; }

        return (
          <g key={`wl-${wall}`}>
            <text
              x={x} y={wall === "top" ? y - 10 : wall === "bottom" ? y + 10 : y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={9} letterSpacing={1}
              fill={isTarget ? "rgba(99,179,237,0.9)" : "rgba(255,255,255,0.22)"}
              transform={rotate ? `rotate(${rotate}, ${x}, ${y})` : undefined}
              style={{ pointerEvents: "none", userSelect: "none", textTransform: "uppercase" }}
            >
              {wall}
            </text>
            <g style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onFrontView(wall); }}>
              <rect x={bx} y={by} width={btnW} height={btnH} fill="rgba(255,255,255,0.08)" rx={3}
                onMouseEnter={(e) => e.currentTarget.setAttribute("fill", "rgba(255,255,255,0.18)")}
                onMouseLeave={(e) => e.currentTarget.setAttribute("fill", "rgba(255,255,255,0.08)")}
              />
              <text x={bx + btnW / 2} y={by + btnH / 2} textAnchor="middle" dominantBaseline="middle"
                fontSize={8} fill="rgba(255,255,255,0.5)" style={{ userSelect: "none", pointerEvents: "none" }}>
                ↗ Elevation
              </text>
            </g>
          </g>
        );
      })}

      {/* ---- Cabinets ---- */}
      {displayItems.map((item) => (
        <CabinetShape
          key={item.id}
          item={item}
          lay={lay}
          selected={item.id === selectedItemId}
          dragging={drag?.itemId === item.id}
          onPointerDown={handleItemPointerDown}
          onPointerUp={handleItemPointerUp}
        />
      ))}

      {/* ---- Drag ghost line to wall ---- */}
      {drag && (() => {
        const draggingItem = displayItems.find((i) => i.id === drag.itemId);
        if (!draggingItem) return null;
        const r = cabinetSvgRect(draggingItem, lay);
        if (!r) return null;
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const fw = frontEdgeFor(draggingItem.wall, draggingItem.rotation);
        let lx2 = cx, ly2 = cy;
        switch (fw) {
          case "bottom": ly2 = oy + roomH; break;
          case "top":    ly2 = oy;          break;
          case "right":  lx2 = ox + roomW;  break;
          case "left":   lx2 = ox;          break;
        }
        return (
          <line x1={cx} y1={cy} x2={lx2} y2={ly2}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3"
            style={{ pointerEvents: "none" }} />
        );
      })()}

      {/* ---- Gap measurements during drag ---- */}
      {drag && (() => {
        const draggingItem = displayItems.find((i) => i.id === drag.itemId);
        if (!draggingItem) return null;
        const r = cabinetSvgRect(draggingItem, lay);
        if (!r) return null;
        const currentWall = draggingItem.wall;
        const { absX: cAbsX, absY: cAbsY } = getAbsPos(draggingItem, W, D);

        const sameWallItems = items.filter((i) => i.id !== drag.itemId && i.wall === currentWall);

        if (currentWall === "top" || currentWall === "bottom") {
          const gapObs = sameWallItems.map((o) => ({
            x_mm:     getAbsPos(o, W, D).absX,
            width_mm: o.width_mm || 600,
          }));
          const { leftGap, rightGap, leftBoundMm, rightBoundMm } = computeGaps1D(cAbsX, drag.itemWidthMm, gapObs, W);
          const midY = r.y + r.h / 2;
          return (
            <>
              <GapDimension x1={ox + leftBoundMm * scale}  y1={midY} x2={r.x}       y2={midY} label={leftGap}  horizontal />
              <GapDimension x1={r.x + r.w}                 y1={midY} x2={ox + rightBoundMm * scale} y2={midY} label={rightGap} horizontal />
            </>
          );
        }

        if (currentWall === "left" || currentWall === "right") {
          const gapObs = sameWallItems.map((o) => ({
            x_mm:     getAbsPos(o, W, D).absY,
            width_mm: o.width_mm || 600,
          }));
          const { leftGap, rightGap, leftBoundMm, rightBoundMm } = computeGaps1D(cAbsY, drag.itemWidthMm, gapObs, D);
          const midX = r.x + r.w / 2;
          return (
            <>
              <GapDimension x1={midX} y1={oy + leftBoundMm * scale}  x2={midX} y2={r.y}       label={leftGap}  horizontal={false} />
              <GapDimension x1={midX} y1={r.y + r.h}                 x2={midX} y2={oy + rightBoundMm * scale} label={rightGap} horizontal={false} />
            </>
          );
        }

        if (currentWall === "island") {
          const midX = r.x + r.w / 2;
          const midY = r.y + r.h / 2;
          return (
            <>
              <GapDimension x1={ox}           y1={midY} x2={r.x}       y2={midY} label={cAbsX}                horizontal />
              <GapDimension x1={r.x + r.w}    y1={midY} x2={ox + roomW} y2={midY} label={W - cAbsX - drag.itemWidthMm} horizontal />
              <GapDimension x1={midX} y1={oy}           x2={midX} y2={r.y}       label={cAbsY}                horizontal={false} />
              <GapDimension x1={midX} y1={r.y + r.h}   x2={midX} y2={oy + roomH} label={D - cAbsY - drag.itemDepthMm} horizontal={false} />
            </>
          );
        }

        return null;
      })()}
    </svg>
  );
}
