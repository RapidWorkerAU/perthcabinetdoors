"use client";

import styles from "./room-elevation.module.css";

// ---- SVG layout constants ----
const VB_W = 900;
const VB_H = 500;
const PAD  = 60;

// Space reserved outside the wall outline for annotation
const DIM_LEFT  = 36; // height dim line + rotated label
const DIM_ABOVE = 42; // total-width dim line + label
const DIM_BELOW = 50; // per-cabinet dim lines + labels

// ---- Cabinet type colours (matches RoomPlanner.js) ----
const TYPE_FILL = {
  base:        "#3b82f6",
  wall:        "#22c55e",
  tall:        "#f97316",
  corner_base: "#a855f7",
  corner_wall: "#8b5cf6",
  island:      "#6b7280",
};

const TYPE_LABELS = {
  base:        "Base",
  wall:        "Wall",
  tall:        "Tall",
  corner_base: "Corner Base",
  corner_wall: "Corner Wall",
  island:      "Island",
};

// ---- Helpers ----
function fmm(v) { return v != null ? `${v}mm` : "—"; }

function wallDimLabel(wall, room) {
  const w = (wall === "top" || wall === "bottom") ? room.width_mm : room.depth_mm;
  const h = room.height_mm;
  return `${fmm(w)} wide × ${fmm(h)} high`;
}

// Clamp a cabinet rect so it never extends beyond the wall's drawn width.
function clampCabRect(cx, cw, ox, dwW) {
  const x1 = Math.max(cx, ox);
  const x2 = Math.min(cx + cw, ox + dwW);
  return { x: x1, w: Math.max(x2 - x1, 0) };
}

// ---- Dimension line sub-components ----

/**
 * Horizontal dimension line with 45° tick marks and dashed extension lines.
 * Matches the style of pcd-cabinet-pdf.js dimensionLine().
 *
 * subjectY: the y-coordinate of the subject edge (wall top or cabinet floor).
 * dimY:     the y-coordinate of the dimension line itself (above or below).
 */
function HorizDim({ x1, x2, dimY, subjectY, label }) {
  if (x2 - x1 < 4) return null;
  const mx    = (x1 + x2) / 2;
  const TICK  = 5;
  const above = dimY < subjectY;
  // Extension lines from subject to just past the dim line
  const extY  = above ? dimY - 4 : dimY + 4;
  return (
    <g>
      {/* Witness (extension) lines */}
      <line x1={x1} y1={subjectY} x2={x1} y2={extY}
        stroke="#b0afa8" strokeWidth={0.55} strokeDasharray="3,2.5" />
      <line x1={x2} y1={subjectY} x2={x2} y2={extY}
        stroke="#b0afa8" strokeWidth={0.55} strokeDasharray="3,2.5" />
      {/* Dimension line */}
      <line x1={x1} y1={dimY} x2={x2} y2={dimY}
        stroke="#444" strokeWidth={0.8} />
      {/* Tick marks — forward-slash style, same as PDF library */}
      <line x1={x1 - TICK} y1={dimY + TICK} x2={x1 + TICK} y2={dimY - TICK}
        stroke="#444" strokeWidth={0.8} />
      <line x1={x2 - TICK} y1={dimY + TICK} x2={x2 + TICK} y2={dimY - TICK}
        stroke="#444" strokeWidth={0.8} />
      {/* Label — centred above (or below) the dim line */}
      <text
        x={mx}
        y={above ? dimY - 6 : dimY + 14}
        textAnchor="middle"
        fontSize={9}
        fill="#444"
        style={{ userSelect: "none" }}
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Vertical dimension line with backslash-style tick marks.
 * subjectX: the x-coordinate of the wall edge.
 * dimX:     the x-coordinate of the dimension line.
 * Label is rotated −90° so it reads upward.
 */
function VertDim({ y1, y2, dimX, subjectX, label }) {
  if (y2 - y1 < 4) return null;
  const my    = (y1 + y2) / 2;
  const TICK  = 5;
  const toLeft = dimX < subjectX;
  const extX   = toLeft ? dimX - 4 : dimX + 4;
  return (
    <g>
      {/* Witness lines */}
      <line x1={subjectX} y1={y1} x2={extX} y2={y1}
        stroke="#b0afa8" strokeWidth={0.55} strokeDasharray="3,2.5" />
      <line x1={subjectX} y1={y2} x2={extX} y2={y2}
        stroke="#b0afa8" strokeWidth={0.55} strokeDasharray="3,2.5" />
      {/* Dimension line */}
      <line x1={dimX} y1={y1} x2={dimX} y2={y2}
        stroke="#444" strokeWidth={0.8} />
      {/* Tick marks — backslash style for verticals */}
      <line x1={dimX - TICK} y1={y1 - TICK} x2={dimX + TICK} y2={y1 + TICK}
        stroke="#444" strokeWidth={0.8} />
      <line x1={dimX - TICK} y1={y2 - TICK} x2={dimX + TICK} y2={y2 + TICK}
        stroke="#444" strokeWidth={0.8} />
      {/* Rotated label */}
      <text
        x={dimX - 8}
        y={my}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fill="#444"
        transform={`rotate(-90, ${dimX - 8}, ${my})`}
        style={{ userSelect: "none" }}
      >
        {label}
      </text>
    </g>
  );
}

// ---- Main component ----
export default function RoomElevation({ room, cabinets, wall }) {
  // Wall dimensions
  const wallW = (wall === "top" || wall === "bottom")
    ? (room.width_mm  || 3000)
    : (room.depth_mm  || 3000);
  const wallH = room.height_mm || 2400;

  // Wall drawing area within the viewBox
  const wax = PAD + DIM_LEFT;                        // x origin of wall area
  const way = PAD + DIM_ABOVE;                       // y origin of wall area (ceiling)
  const waw = VB_W - wax - PAD;                      // available width
  const wah = VB_H - way - PAD - DIM_BELOW;          // available height

  // Uniform scale — preserve aspect ratio, fill available space
  const sc  = Math.min(waw / wallW, wah / wallH);

  // Drawn wall pixel size
  const dwW = wallW * sc;
  const dwH = wallH * sc;

  // Centre the wall horizontally in the available area; top-align vertically
  const ox = wax + (waw - dwW) / 2;
  const oy = way;
  const fy = oy + dwH; // floor y

  // Cabinets on this wall, sorted by x position
  const wallCabs = (cabinets || [])
    .filter((c) => c.wall === wall)
    .sort((a, b) => (a.x_mm || 0) - (b.x_mm || 0));

  const wallNameLabel = wall.charAt(0).toUpperCase() + wall.slice(1);

  return (
    <div className={styles.roomElevation}>
      {/* Heading */}
      <div className={styles.wallHeading}>
        <p className={styles.wallName}>{wallNameLabel} wall</p>
        <p className={styles.wallDims}>{wallDimLabel(wall, room)}</p>
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        className={styles.elevationSvg}
        aria-label={`${wallNameLabel} wall elevation`}
      >
        {/* ── Wall fill ── */}
        <rect
          x={ox} y={oy} width={dwW} height={dwH}
          fill="#f9f9f7"
          stroke="none"
        />

        {/* ── Cabinets ── */}
        {wallCabs.map((cab) => {
          const rawCx = ox + (cab.x_mm || 0) * sc;
          const rawCw = (cab.width_mm  || 600) * sc;
          const ch    = Math.min((cab.height_mm || 720) * sc, dwH);
          const { x: cx, w: cw } = clampCabRect(rawCx, rawCw, ox, dwW);
          if (cw < 1) return null;

          const cy    = fy - ch;
          const fill  = TYPE_FILL[cab.cabinet_type] || "#888";
          const label = cab.label || TYPE_LABELS[cab.cabinet_type] || cab.cabinet_type || "Cabinet";
          const dimTxt = `${cab.width_mm || "?"}×${cab.height_mm || "?"}`;

          // Decide what to show based on available pixel space
          const showLabel   = cw >= 20 && ch >= 16;
          const showDimLine = cw >= 20 && ch >= 30;
          const fsize = Math.max(Math.min(9.5, (cw / Math.max(label.length, 1)) * 1.45), 6.5);
          const labelY = showDimLine ? cy + ch * 0.38 : cy + ch / 2;

          return (
            <g key={cab.id}>
              {/* Cabinet fill */}
              <rect
                x={cx} y={cy} width={cw} height={ch}
                fill={fill} fillOpacity={0.78}
                stroke={fill} strokeWidth={0.5}
                rx={1}
              />
              {/* Type label */}
              {showLabel && (
                <text
                  x={cx + cw / 2} y={labelY}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={fsize} fill="#fff" fontWeight="700"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {label}
                </text>
              )}
              {/* W×H dimension text inside cabinet */}
              {showDimLine && (
                <text
                  x={cx + cw / 2} y={cy + ch * 0.68}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.max(fsize - 1.5, 6)} fill="rgba(255,255,255,0.82)"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {dimTxt}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Wall outline redrawn on top so it stays crisp over cabinet fills ── */}
        <rect
          x={ox} y={oy} width={dwW} height={dwH}
          fill="none"
          stroke="#1a2e20" strokeWidth={1.5}
        />

        {/* ── Floor line — extends slightly beyond the wall edges ── */}
        <line
          x1={ox - 10} y1={fy}
          x2={ox + dwW + 10} y2={fy}
          stroke="#1a2e20" strokeWidth={2.5}
        />
        {/* Short ground serifs below the floor line */}
        {[-6, 0, 6].map((offset) => (
          <line
            key={offset}
            x1={ox + dwW / 2 + offset * (dwW / 14)}
            y1={fy + 2}
            x2={ox + dwW / 2 + offset * (dwW / 14) - 6}
            y2={fy + 8}
            stroke="#1a2e20" strokeWidth={1}
          />
        ))}

        {/* ── Total wall width dimension (above wall) ── */}
        <HorizDim
          x1={ox} x2={ox + dwW}
          dimY={oy - 22} subjectY={oy}
          label={`${wallW}mm`}
        />

        {/* ── Wall height dimension (left of wall) ── */}
        <VertDim
          y1={oy} y2={fy}
          dimX={ox - 26} subjectX={ox}
          label={`${wallH}mm`}
        />

        {/* ── Per-cabinet width dimensions (below floor line) ── */}
        {wallCabs.map((cab) => {
          const rawCx = ox + (cab.x_mm || 0) * sc;
          const rawCw = (cab.width_mm || 600) * sc;
          const { x: cx, w: cw } = clampCabRect(rawCx, rawCw, ox, dwW);
          if (cw < 8) return null;
          return (
            <HorizDim
              key={`dim-${cab.id}`}
              x1={cx} x2={cx + cw}
              dimY={fy + 26} subjectY={fy}
              label={`${cab.width_mm || "?"}mm`}
            />
          );
        })}

        {/* ── Empty wall hint ── */}
        {wallCabs.length === 0 && (
          <text
            x={ox + dwW / 2} y={oy + dwH / 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fill="#b0afa8"
            style={{ userSelect: "none" }}
          >
            No cabinets on this wall
          </text>
        )}
      </svg>
    </div>
  );
}
