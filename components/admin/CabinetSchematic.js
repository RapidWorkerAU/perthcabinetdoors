import { normalizeCabinetConfig } from "../../lib/pcd-cabinet-utils";

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

function Drawing({ title, widthMm, heightMm, scale, children, bottomLabel, sideLabel }) {
  const rectWidth = Math.max(1, widthMm * scale);
  const rectHeight = Math.max(1, heightMm * scale);
  const x = (SVG_SIZE - rectWidth) / 2 + 14;
  const y = 56 + ((DRAWING_MAX - rectHeight) / 2);
  const dimensionBottomY = y + rectHeight + 32;
  const dimensionSideX = x - 30;

  return (
    <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} role="img" aria-label={title} style={svgStyle}>
      <rect x="0.5" y="0.5" width={SVG_SIZE - 1} height={SVG_SIZE - 1} fill="#ffffff" stroke="#d9d2c4" />
      <text x="18" y="26" fill={STROKE} fontSize="13" fontWeight="700" fontFamily="Arial, sans-serif">
        {title}
      </text>
      <rect x={x} y={y} width={rectWidth} height={rectHeight} fill="#ffffff" stroke={STROKE} strokeWidth="1.5" />
      {children?.({ x, y, rectWidth, rectHeight })}
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

  const dimensionX = Math.min(SVG_SIZE - 38, x + rectWidth + 48);
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
            <text x={dimensionX + 15} y={labelY} fill={STROKE} fontSize="9" fontFamily="Arial, sans-serif" dominantBaseline="middle">
              {toLabel(gap)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function FrontShelves({ cabinet, x, y, rectWidth, rectHeight, thicknessScale, shelfThicknessScale }) {
  const shelves = shelfPositions(cabinet, rectHeight);
  if (!shelves.length) return null;

  const sideGap = Math.max(8, thicknessScale);
  const shelfThickness = Math.max(2.5, shelfThicknessScale);

  return (
    <>
      {shelves.map((shelf) => {
        const shelfY = y + shelf.y;
        return (
          <g key={`shelf-${shelf.index}`}>
            <rect
              x={x + sideGap}
              y={shelfY - shelfThickness / 2}
              width={Math.max(1, rectWidth - sideGap * 2)}
              height={shelfThickness}
              fill="#f8faf7"
              stroke={STROKE}
              strokeWidth="1"
            />
            <text x={x + rectWidth + 8} y={shelfY - 4} fill={STROKE} fontSize="9" fontFamily="Arial, sans-serif">
              S{shelf.index + 1} {toLabel(shelf.heightFromBottom)}
            </text>
          </g>
        );
      })}
      <ShelfGapDimensions shelves={shelves} cabinetHeight={cabinet.height_mm} x={x} y={y} rectWidth={rectWidth} rectHeight={rectHeight} />
    </>
  );
}

function SideShelves({ cabinet, x, y, rectWidth, rectHeight, shelfThicknessScale, backThicknessScale }) {
  const shelves = shelfPositions(cabinet, rectHeight);
  if (!shelves.length) return null;

  const shelfThickness = Math.max(2.5, shelfThicknessScale);
  const frontGap = 4;
  const rearGap = Math.max(8, backThicknessScale + 4);
  return shelves.map((shelf) => (
    <rect
      key={`side-shelf-${shelf.index}`}
      x={x + frontGap}
      y={y + shelf.y - shelfThickness / 2}
      width={Math.max(1, rectWidth - frontGap - rearGap)}
      height={shelfThickness}
      fill="#f8faf7"
      stroke={STROKE}
      strokeWidth="0.9"
    />
  ));
}

function BackPanelOutline({ cabinet, x, y, rectWidth, rectHeight, scale }) {
  const isIncluded = Boolean(cabinet.back_panel_included);
  if (!isIncluded) return null;

  const backThickness = Math.max(2, Math.min(rectWidth, cabinet.back_panel_thickness_mm * scale));

  return (
    <rect
      x={x + rectWidth - backThickness}
      y={y}
      width={backThickness}
      height={rectHeight}
      fill="#f8faf7"
      stroke={MUTED}
      strokeWidth="1"
      strokeDasharray="4 4"
    />
  );
}

export default function CabinetSchematic({ config = DEFAULT_CONFIG, view = null }) {
  const cabinet = normalizeCabinetConfig({ ...DEFAULT_CONFIG, ...config });
  const maxDimension = Math.max(cabinet.width_mm, cabinet.height_mm, cabinet.depth_mm, 1);
  const scale = DRAWING_MAX / maxDimension;
  const thicknessScale = cabinet.carcass_thickness_mm * scale;
  const shelfThicknessScale = cabinet.shelf_thickness_mm * scale;
  const backThicknessScale = cabinet.back_panel_included ? cabinet.back_panel_thickness_mm * scale : 0;
  const singleStyle = { ...wrapStyle, gridTemplateColumns: "1fr" };

  return (
    <div style={view ? singleStyle : wrapStyle}>
      {(!view || view === "front") && (
        <Drawing
          title="Front Elevation"
          widthMm={cabinet.width_mm}
          heightMm={cabinet.height_mm}
          scale={scale}
          bottomLabel={toLabel(cabinet.width_mm)}
          sideLabel={toLabel(cabinet.height_mm)}
        >
          {({ x, y, rectWidth, rectHeight }) => (
            <>
              <rect x={x} y={y} width={thicknessScale} height={rectHeight} fill="none" stroke={MUTED} strokeWidth="0.8" />
              <rect
                x={x + rectWidth - thicknessScale}
                y={y}
                width={thicknessScale}
                height={rectHeight}
                fill="none"
                stroke={MUTED}
                strokeWidth="0.8"
              />
              <FrontShelves
                cabinet={cabinet}
                x={x}
                y={y}
                rectWidth={rectWidth}
                rectHeight={rectHeight}
                thicknessScale={thicknessScale}
                shelfThicknessScale={shelfThicknessScale}
              />
            </>
          )}
        </Drawing>
      )}

      {(!view || view === "side") && (
        <Drawing
          title="Side Elevation"
          widthMm={cabinet.depth_mm}
          heightMm={cabinet.height_mm}
          scale={scale}
          bottomLabel={toLabel(cabinet.depth_mm)}
          sideLabel={toLabel(cabinet.height_mm)}
        >
          {({ x, y, rectWidth, rectHeight }) => (
            <>
              <BackPanelOutline
                cabinet={cabinet}
                x={x}
                y={y}
                rectWidth={rectWidth}
                rectHeight={rectHeight}
                scale={scale}
              />
              <SideShelves
                cabinet={cabinet}
                x={x}
                y={y}
                rectWidth={rectWidth}
                rectHeight={rectHeight}
                shelfThicknessScale={shelfThicknessScale}
                backThicknessScale={backThicknessScale}
              />
            </>
          )}
        </Drawing>
      )}

      {(!view || view === "top") && (
        <Drawing
          title="Top Plan"
          widthMm={cabinet.width_mm}
          heightMm={cabinet.depth_mm}
          scale={scale}
          bottomLabel={toLabel(cabinet.width_mm)}
          sideLabel={toLabel(cabinet.depth_mm)}
        >
          {({ x, y, rectWidth, rectHeight }) => (
            <>
              <line x1={x + thicknessScale} y1={y} x2={x + thicknessScale} y2={y + rectHeight} stroke={MUTED} strokeWidth="0.8" />
              <line
                x1={x + rectWidth - thicknessScale}
                y1={y}
                x2={x + rectWidth - thicknessScale}
                y2={y + rectHeight}
                stroke={MUTED}
                strokeWidth="0.8"
              />
            </>
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
