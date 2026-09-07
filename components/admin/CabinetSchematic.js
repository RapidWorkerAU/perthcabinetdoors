import {
  normalizeCabinetConfig,
  rangehoodLayoutMm,
  cornerFootprintMm,
} from "../../lib/pcd-cabinet-utils";

// The three line drawings beside the configurator's panel list.
//
// These used to be a plain rectangle with shelves in it, whatever was
// configured, so a rangehood cabinet, an L shape corner and a diagonal corner
// all drew as the same empty box, sitting directly beside a panel list that
// named every part they were missing. Someone reading the screen was told two
// different things at once.
//
// They now draw the same shapes the design tool draws: the carcass boards seen
// edge-on, the rangehood recess and its flue channel, the corner footprint with
// its return leg or its chamfer. The geometry is not worked out here, it comes
// from rangehoodLayoutMm and cornerFootprintMm, the same two helpers the cut
// list reads, so the drawing and the panel sizes cannot drift apart.

const DEFAULT_CONFIG = {
  label: "Base cabinet",
  height_mm: 720,
  width_mm: 900,
  depth_mm: 560,
  carcass_thickness_mm: 16,
  back_panel_included: true,
  back_panel_thickness_mm: 6,
  shelf_qty: 1,
  shelf_heights_mm: [],
};

const SVG_SIZE = 320;
const DRAWING_MAX = 190;
const STROKE = "#333333";
const MUTED = "#777777";
// A board seen edge-on, an opening you can see into, and a shelf. Three fills
// is the whole vocabulary: everything on these drawings is one of the three.
const BOARD = "#e6ebe2";
const OPENING = "#f5f1e6";
const SHELF = "#f8faf7";

function toLabel(value) {
  return `${Math.round(Number(value) || 0)}mm`;
}

function tick(x, y, direction = "horizontal") {
  const size = 7;
  return direction === "horizontal"
    ? <line x1={x - size} y1={y + size} x2={x + size} y2={y - size} stroke={STROKE} strokeWidth="1" />
    : <line x1={x - size} y1={y - size} x2={x + size} y2={y + size} stroke={STROKE} strokeWidth="1" />;
}

function dimensionLine({ x1, y1, x2, y2, label, orientation = "horizontal" }) {
  const isHorizontal = orientation === "horizontal";
  const labelX = isHorizontal ? (x1 + x2) / 2 : x1 - 22;
  const labelY = isHorizontal ? y1 - 8 : (y1 + y2) / 2;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth="1" />
      {tick(x1, y1, orientation)}
      {tick(x2, y2, orientation)}
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={isHorizontal ? undefined : `rotate(-90 ${labelX} ${labelY})`}
        fill={STROKE}
        fontSize="11"
        fontFamily="Arial, sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

// A board seen edge-on. Everything solid on these drawings is one of these.
function Board({ x, y, width, height, faint = false }) {
  if (!(width > 0) || !(height > 0)) return null;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={BOARD}
      stroke={faint ? MUTED : STROKE}
      strokeWidth={faint ? 0.7 : 0.9}
    />
  );
}

// Text that only appears when there is room for it, so a narrow cabinet does
// not end up with labels spilling over its own outline.
function FitText({ x, y, width, height, children, size = 7, rotate = false, fill = MUTED }) {
  const along = rotate ? height : width;
  const across = rotate ? width : height;
  const needed = String(children).length * size * 0.62;
  if (!(along > needed) || !(across > size + 3)) return null;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={rotate ? `rotate(-90 ${x} ${y})` : undefined}
      fill={fill}
      fontSize={size}
      letterSpacing="0.4"
      fontFamily="Arial, sans-serif"
      style={{ pointerEvents: "none" }}
    >
      {children}
    </text>
  );
}

// The frame each drawing sits in. `outline` lets a view replace the default
// rectangle with a polygon, which is the whole point for a corner footprint.
function Drawing({ title, note, widthMm, heightMm, scale, children, bottomLabel, sideLabel, outline }) {
  const rectWidth = Math.max(1, widthMm * scale);
  const rectHeight = Math.max(1, heightMm * scale);
  const x = (SVG_SIZE - rectWidth) / 2 + 14;
  const y = 56 + ((DRAWING_MAX - rectHeight) / 2);
  const frame = { x, y, rectWidth, rectHeight };
  const dimensionBottomY = y + rectHeight + 32;
  const dimensionSideX = x - 30;

  return (
    <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} role="img" aria-label={note ? `${title}, ${note}` : title} style={svgStyle}>
      <rect x="0.5" y="0.5" width={SVG_SIZE - 1} height={SVG_SIZE - 1} fill="#ffffff" stroke="#d9d2c4" />
      <text x="18" y="24" fill={STROKE} fontSize="13" fontWeight="700" fontFamily="Arial, sans-serif">
        {title}
      </text>
      {note ? (
        <text x="18" y="40" fill={MUTED} fontSize="9" letterSpacing="0.3" fontFamily="Arial, sans-serif">
          {note}
        </text>
      ) : null}
      {outline
        ? outline(frame)
        : <rect x={x} y={y} width={rectWidth} height={rectHeight} fill="#ffffff" stroke={STROKE} strokeWidth="1.5" />}
      {children?.(frame)}
      <line x1={x} y1={y + rectHeight} x2={x} y2={dimensionBottomY} stroke={MUTED} strokeWidth="0.8" />
      <line x1={x + rectWidth} y1={y + rectHeight} x2={x + rectWidth} y2={dimensionBottomY} stroke={MUTED} strokeWidth="0.8" />
      {dimensionLine({
        x1: x,
        y1: dimensionBottomY,
        x2: x + rectWidth,
        y2: dimensionBottomY,
        label: bottomLabel,
      })}
      <line x1={x} y1={y} x2={dimensionSideX} y2={y} stroke={MUTED} strokeWidth="0.8" />
      <line x1={x} y1={y + rectHeight} x2={dimensionSideX} y2={y + rectHeight} stroke={MUTED} strokeWidth="0.8" />
      {dimensionLine({
        x1: dimensionSideX,
        y1: y,
        x2: dimensionSideX,
        y2: y + rectHeight,
        label: sideLabel,
        orientation: "vertical",
      })}
    </svg>
  );
}

function shelfPositions(cabinet, rectHeight) {
  const count = Math.max(0, Number(cabinet.shelf_qty) || 0);
  const heights = Array.isArray(cabinet.shelf_heights_mm) ? cabinet.shelf_heights_mm : [];
  return Array.from({ length: count }, (_, index) => {
    const fallback = ((index + 1) * cabinet.height_mm) / (count + 1);
    const heightFromBottom = Math.min(cabinet.height_mm, Math.max(0, Number(heights[index]) || fallback));
    return {
      index,
      heightFromBottom,
      y: rectHeight - ((heightFromBottom / Math.max(1, cabinet.height_mm)) * rectHeight),
    };
  }).sort((a, b) => a.heightFromBottom - b.heightFromBottom);
}

function ShelfGapDimensions({ shelves, cabinetHeight, x, y, rectWidth, rectHeight }) {
  if (!shelves.length) return null;

  const dimensionX = Math.min(SVG_SIZE - 42, x + rectWidth + 34);
  const markers = [
    { label: 0, y: y + rectHeight },
    ...shelves.map((shelf) => ({ label: shelf.heightFromBottom, y: y + shelf.y })),
    { label: cabinetHeight, y },
  ];

  return (
    <g>
      {markers.map((marker) => (
        <line key={`shelf-marker-${marker.label}`} x1={dimensionX - 9} y1={marker.y} x2={dimensionX + 9} y2={marker.y} stroke={MUTED} strokeWidth="0.7" />
      ))}
      {markers.slice(0, -1).map((marker, index) => {
        const next = markers[index + 1];
        const gap = Math.max(0, next.label - marker.label);
        const labelY = (marker.y + next.y) / 2;
        return (
          <g key={`shelf-gap-${index}`}>
            <line x1={dimensionX} y1={marker.y} x2={dimensionX} y2={next.y} stroke={STROKE} strokeWidth="0.8" />
            {tick(dimensionX, marker.y, "vertical")}
            {tick(dimensionX, next.y, "vertical")}
            <text x={dimensionX + 13} y={labelY} fill={STROKE} fontSize="9" fontFamily="Arial, sans-serif" dominantBaseline="middle">
              {toLabel(gap)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Front elevation, the face of the cabinet looking straight at it
// ---------------------------------------------------------------------------

function FrontElevation({ cabinet, corner, rangehood, frame, scale, T, shelfT, backT }) {
  const { x, y, rectWidth, rectHeight } = frame;
  const bottom = y + rectHeight;
  const fromBottom = (mm) => bottom - (mm * scale);

  // A corner's wall 1 leg runs the full width, but its LEFT end is where the
  // second leg turns away from you: there is no side panel there, and the tops
  // and bottoms start at the inside face of the wall 2 back.
  const returnPx = corner ? Math.min(corner.legDepth * scale, rectWidth) : 0;
  const innerLeft = corner ? x + backT : x + T;
  const innerRight = x + rectWidth - T;
  const innerWidth = Math.max(0, innerRight - innerLeft);

  const channel = rangehood
    ? (() => {
        const cavityLeft = x + T;
        const cavityWidth = Math.max(0, innerRight - cavityLeft);
        const widthPx = Math.min(rangehood.channelWidth * scale, cavityWidth);
        const left = cavityLeft + ((cavityWidth - widthPx) / 2);
        return {
          left,
          right: left + widthPx,
          widthPx,
          topY: fromBottom(rangehood.channelTop),
          bottomY: fromBottom(rangehood.channelBottom),
          openingTopY: fromBottom(rangehood.openingTop),
          openingBottomY: fromBottom(rangehood.openingBottom),
        };
      })()
    : null;

  const shelves = shelfPositions(cabinet, rectHeight);

  return (
    <>
      {/* The corner's return zone, the footprint the second leg occupies on
          this face. Marked rather than drawn as a door, because the second
          leg's own face is on the other wall and cannot be seen from here. */}
      {corner && returnPx > 0 ? (
        <>
          <rect x={x} y={y} width={returnPx} height={rectHeight} fill={OPENING} />
          <line x1={x + returnPx} y1={y} x2={x + returnPx} y2={bottom} stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
          <FitText x={x + returnPx / 2} y={y + rectHeight / 2} width={returnPx} height={rectHeight} rotate>
            RETURN
          </FitText>
        </>
      ) : null}

      {/* Carcass boards, seen edge-on */}
      {!corner ? <Board x={x} y={y} width={T} height={rectHeight} /> : null}
      <Board x={innerRight} y={y} width={T} height={rectHeight} />
      <Board x={innerLeft} y={y} width={innerWidth} height={T} />
      <Board x={innerLeft} y={bottom - T} width={innerWidth} height={T} />

      {/* Rangehood cabinet: the recess the unit drops into, the divider over
          it, and the boxed flue channel running up to the top panel. */}
      {channel ? (
        <>
          <rect
            x={innerLeft}
            y={channel.openingTopY}
            width={innerWidth}
            height={Math.max(0, channel.openingBottomY - channel.openingTopY)}
            fill={OPENING}
            stroke={MUTED}
            strokeWidth="0.8"
            strokeDasharray="3 2"
          />
          <FitText
            x={innerLeft + innerWidth / 2}
            y={(channel.openingTopY + channel.openingBottomY) / 2 - 5}
            width={innerWidth}
            height={Math.max(0, channel.openingBottomY - channel.openingTopY)}
          >
            RANGEHOOD
          </FitText>
          <FitText
            x={innerLeft + innerWidth / 2}
            y={(channel.openingTopY + channel.openingBottomY) / 2 + 6}
            width={innerWidth}
            height={Math.max(0, channel.openingBottomY - channel.openingTopY) - 12}
          >
            {`${toLabel(rangehood.housingHeight)} opening`}
          </FitText>

          {/* The divider board over the recess */}
          <Board x={innerLeft} y={channel.bottomY} width={innerWidth} height={Math.max(0, channel.openingTopY - channel.bottomY)} />

          {/* The flue void, then the two channel walls that box it in */}
          <rect
            x={channel.left}
            y={channel.topY}
            width={channel.widthPx}
            height={Math.max(0, channel.bottomY - channel.topY)}
            fill={OPENING}
          />
          <Board x={channel.left} y={channel.topY} width={T} height={Math.max(0, channel.bottomY - channel.topY)} />
          <Board x={channel.right - T} y={channel.topY} width={T} height={Math.max(0, channel.bottomY - channel.topY)} />
          <FitText
            x={(channel.left + channel.right) / 2}
            y={(channel.topY + channel.bottomY) / 2}
            width={channel.widthPx}
            height={Math.max(0, channel.bottomY - channel.topY)}
            rotate
          >
            {`FLUE ${toLabel(rangehood.channelWidth)}`}
          </FitText>
        </>
      ) : null}

      {/* Shelves, split into a left and right pair around the flue channel
          when there is one, exactly as the cut list cuts them. */}
      {shelves.map((shelf) => {
        const shelfY = y + shelf.y - shelfT / 2;
        const segments = channel
          ? [
              { key: "l", x: innerLeft, width: Math.max(0, channel.left - innerLeft) },
              { key: "r", x: channel.right, width: Math.max(0, innerRight - channel.right) },
            ]
          : [{ key: "f", x: innerLeft, width: innerWidth }];

        return (
          <g key={`shelf-${shelf.index}`}>
            {segments.map((segment) => (
              <rect
                key={segment.key}
                x={segment.x}
                y={shelfY}
                width={segment.width}
                height={shelfT}
                fill={SHELF}
                stroke={STROKE}
                strokeWidth="0.9"
              />
            ))}
            <text x={innerLeft + 3} y={shelfY - 3} fill={MUTED} fontSize="8" fontFamily="Arial, sans-serif">
              {`S${shelf.index + 1}`}
            </text>
          </g>
        );
      })}

      <ShelfGapDimensions shelves={shelves} cabinetHeight={cabinet.height_mm} x={x} y={y} rectWidth={rectWidth} rectHeight={rectHeight} />

      {/* A diagonal corner's front is a single flat face across the chamfer,
          not a face on this wall at all. The plan is where it really reads. */}
      {corner && corner.style === "diagonal" ? (
        <>
          <line
            x1={x + returnPx}
            y1={bottom}
            x2={innerRight}
            y2={y}
            stroke={MUTED}
            strokeWidth="0.9"
            strokeDasharray="5 3"
          />
          <text x={(x + returnPx + innerRight) / 2} y={y + rectHeight / 2} fill={MUTED} fontSize="7" textAnchor="middle" fontFamily="Arial, sans-serif">
            diagonal face
          </text>
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Side elevation, a section through the cabinet with the front at the left
// ---------------------------------------------------------------------------

function SideElevation({ cabinet, rangehood, frame, scale, T, shelfT, backT }) {
  const { x, y, rectWidth, rectHeight } = frame;
  const bottom = y + rectHeight;
  const fromBottom = (mm) => bottom - (mm * scale);
  const panelRight = x + rectWidth - backT;
  const panelWidth = Math.max(0, panelRight - x);
  const shelves = shelfPositions(cabinet, rectHeight);

  return (
    <>
      {/* Back panel, standing off the rear face */}
      {backT > 0 ? (
        <rect x={panelRight} y={y} width={backT} height={rectHeight} fill={BOARD} stroke={MUTED} strokeWidth="1" strokeDasharray="4 4" />
      ) : null}

      {/* Top and bottom boards */}
      <Board x={x} y={y} width={panelWidth} height={T} />
      <Board x={x} y={bottom - T} width={panelWidth} height={T} />

      {/* The rangehood recess and the divider that closes it off, both running
          the full carcass depth. */}
      {rangehood ? (
        <>
          <rect
            x={x}
            y={fromBottom(rangehood.openingTop)}
            width={panelWidth}
            height={Math.max(0, (rangehood.openingTop - rangehood.openingBottom) * scale)}
            fill={OPENING}
            stroke={MUTED}
            strokeWidth="0.8"
            strokeDasharray="3 2"
          />
          <FitText
            x={x + panelWidth / 2}
            y={fromBottom((rangehood.openingTop + rangehood.openingBottom) / 2)}
            width={panelWidth}
            height={Math.max(0, (rangehood.openingTop - rangehood.openingBottom) * scale)}
          >
            RANGEHOOD
          </FitText>
          <Board x={x} y={fromBottom(rangehood.channelBottom)} width={panelWidth} height={T} />
        </>
      ) : null}

      {/* Shelves, full depth here whether or not a flue splits them across the
          face, because that split is a width and not a depth. */}
      {shelves.map((shelf) => (
        <rect
          key={`side-shelf-${shelf.index}`}
          x={x + 3}
          y={y + shelf.y - shelfT / 2}
          width={Math.max(0, panelWidth - 3)}
          height={shelfT}
          fill={SHELF}
          stroke={STROKE}
          strokeWidth="0.9"
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Top plan, the footprint with the wall at the top and the room below
// ---------------------------------------------------------------------------

function cornerPolygonPoints(corner, frame, scale) {
  const { x, y } = frame;
  return corner.points.map(([px, py]) => `${x + px * scale},${y + py * scale}`).join(" ");
}

function TopPlan({ cabinet, corner, rangehood, frame, scale, T, backT }) {
  const { x, y, rectWidth, rectHeight } = frame;

  if (corner) {
    const legDepthPx = corner.legDepth * scale;
    const depthLabelX = x + rectWidth - 10;
    const depthLabelY = y + legDepthPx / 2;

    return (
      <>
        {/* Wall 1 back along the top edge, wall 2 back down the left edge */}
        {backT > 0 ? (
          <>
            <rect x={x} y={y} width={rectWidth} height={backT} fill={BOARD} stroke={MUTED} strokeWidth="0.8" strokeDasharray="4 4" />
            <rect x={x} y={y + backT} width={backT} height={Math.max(0, rectHeight - backT)} fill={BOARD} stroke={MUTED} strokeWidth="0.8" strokeDasharray="4 4" />
          </>
        ) : null}

        {/* The outer end of each leg, where that leg's side panel sits */}
        <Board x={x + rectWidth - T} y={y + backT} width={T} height={Math.max(0, legDepthPx - backT)} />
        <Board x={x + backT} y={y + rectHeight - T} width={Math.max(0, legDepthPx - backT)} height={T} />

        <text
          x={depthLabelX}
          y={depthLabelY}
          fill={MUTED}
          fontSize="8"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Arial, sans-serif"
          transform={`rotate(-90 ${depthLabelX} ${depthLabelY})`}
        >
          {toLabel(cabinet.depth_mm)}
        </text>
      </>
    );
  }

  const channel = rangehood
    ? (() => {
        const cavityLeft = x + T;
        const cavityWidth = Math.max(0, rectWidth - 2 * T);
        const widthPx = Math.min(rangehood.channelWidth * scale, cavityWidth);
        const left = cavityLeft + ((cavityWidth - widthPx) / 2);
        return { left, right: left + widthPx, widthPx };
      })()
    : null;

  const cavityTop = y + backT;
  const cavityHeight = Math.max(0, rectHeight - backT);

  return (
    <>
      {backT > 0 ? (
        <rect x={x} y={y} width={rectWidth} height={backT} fill={BOARD} stroke={MUTED} strokeWidth="0.8" strokeDasharray="4 4" />
      ) : null}
      <Board x={x} y={cavityTop} width={T} height={cavityHeight} />
      <Board x={x + rectWidth - T} y={cavityTop} width={T} height={cavityHeight} />

      {/* The flue channel runs the full carcass depth, so in plan it is a band
          across the whole footprint with a wall on each side. */}
      {channel ? (
        <>
          <rect x={channel.left} y={cavityTop} width={channel.widthPx} height={cavityHeight} fill={OPENING} />
          <Board x={channel.left} y={cavityTop} width={T} height={cavityHeight} />
          <Board x={channel.right - T} y={cavityTop} width={T} height={cavityHeight} />
          <FitText
            x={(channel.left + channel.right) / 2}
            y={cavityTop + cavityHeight / 2}
            width={channel.widthPx}
            height={cavityHeight}
            rotate
          >
            {`FLUE ${toLabel(rangehood.channelWidth)}`}
          </FitText>
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

export default function CabinetSchematic({ config = DEFAULT_CONFIG, view = null }) {
  const cabinet = normalizeCabinetConfig({ ...DEFAULT_CONFIG, ...config });
  const corner = cornerFootprintMm(cabinet);
  const rangehood = rangehoodLayoutMm(cabinet);

  // A corner's plan is as deep as its second leg is long, so that leg has to be
  // in the scale or the footprint runs off the edge of the drawing.
  const maxDimension = Math.max(
    cabinet.width_mm,
    cabinet.height_mm,
    cabinet.depth_mm,
    corner ? corner.boundingDepth : 0,
    1
  );
  const scale = DRAWING_MAX / maxDimension;
  // Board thicknesses are floored in pixels: a 16mm board on a 2400mm cabinet
  // is a third of a pixel, and an invisible board reads as no board at all.
  const T = Math.max(1.5, cabinet.carcass_thickness_mm * scale);
  const shelfT = Math.max(2, cabinet.shelf_thickness_mm * scale);
  const backT = cabinet.back_panel_included ? Math.max(1.5, cabinet.back_panel_thickness_mm * scale) : 0;

  const shapeNote = corner
    ? (corner.style === "diagonal" ? "Diagonal corner" : "L shape corner")
    : rangehood
      ? "Rangehood cabinet"
      : "";

  const singleStyle = { ...wrapStyle, gridTemplateColumns: "1fr" };

  return (
    <div style={view ? singleStyle : wrapStyle}>
      {(!view || view === "front") && (
        <Drawing
          title="Front Elevation"
          note={corner ? `${shapeNote}, wall 1 face` : shapeNote}
          widthMm={cabinet.width_mm}
          heightMm={cabinet.height_mm}
          scale={scale}
          bottomLabel={toLabel(cabinet.width_mm)}
          sideLabel={toLabel(cabinet.height_mm)}
        >
          {(frame) => (
            <FrontElevation
              cabinet={cabinet}
              corner={corner}
              rangehood={rangehood}
              frame={frame}
              scale={scale}
              T={T}
              shelfT={shelfT}
              backT={backT}
            />
          )}
        </Drawing>
      )}

      {(!view || view === "side") && (
        <Drawing
          title="Side Elevation"
          note={corner ? `${shapeNote}, wall 1 leg` : shapeNote}
          widthMm={cabinet.depth_mm}
          heightMm={cabinet.height_mm}
          scale={scale}
          bottomLabel={toLabel(cabinet.depth_mm)}
          sideLabel={toLabel(cabinet.height_mm)}
        >
          {(frame) => (
            <SideElevation
              cabinet={cabinet}
              rangehood={rangehood}
              frame={frame}
              scale={scale}
              T={T}
              shelfT={shelfT}
              backT={backT}
            />
          )}
        </Drawing>
      )}

      {(!view || view === "top") && (
        <Drawing
          title="Top Plan"
          note={corner ? `${shapeNote}, second leg ${toLabel(cabinet.secondary_width_mm)}` : shapeNote}
          widthMm={corner ? corner.boundingWidth : cabinet.width_mm}
          heightMm={corner ? corner.boundingDepth : cabinet.depth_mm}
          scale={scale}
          bottomLabel={toLabel(cabinet.width_mm)}
          sideLabel={toLabel(corner ? cabinet.secondary_width_mm : cabinet.depth_mm)}
          outline={corner
            ? (frame) => (
                <polygon
                  points={cornerPolygonPoints(corner, frame, scale)}
                  fill="#ffffff"
                  stroke={STROKE}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              )
            : undefined}
        >
          {(frame) => (
            <TopPlan
              cabinet={cabinet}
              corner={corner}
              rangehood={rangehood}
              frame={frame}
              scale={scale}
              T={T}
              backT={backT}
            />
          )}
        </Drawing>
      )}
    </div>
  );
}

const wrapStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
  gap: "16px",
  width: "100%",
};

const svgStyle = {
  display: "block",
  width: "100%",
  minWidth: 0,
  background: "#ffffff",
};
