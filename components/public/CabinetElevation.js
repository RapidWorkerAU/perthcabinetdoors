"use client";

// A cabinet elevation drawn in the same language as the design tool's
// FrontElevationView, so the public site and the admin tool show the same
// thing:
//
//   Door         outline + a dashed V swing converging on the OPENING edge
//   Drawer front outline + a short pull across the middle 35-65% of the width,
//                near the top of its own front
//   Panel        outline only
//
// Everything is in millimetre space via the viewBox, so it is drawn to true
// scale - a 200x800 base reads tall and narrow, a 1200x380 Besta wide and
// short - and preserveAspectRatio letterboxes it inside whatever box it is
// given. Strokes are non-scaling so they stay hairlines at any size.
//
// Shared by the configurator's layout tiles and the quote-list drawer.

export default function CabinetElevation({ cabinet, pieces, arrangement = "single", className }) {
  const width = Number(cabinet?.width) || 0;
  const height = Number(cabinet?.height) || 0;
  const list = Array.isArray(pieces) ? pieces : [];
  if (!width || !height || !list.length) return null;

  const inColumns = arrangement === "columns";
  const span = list.reduce((sum, piece) => sum + (inColumns ? piece.width : piece.height), 0) || 1;
  // The reveal between fronts, so two adjacent outlines read as two fronts
  // rather than one doubled line.
  const reveal = Math.max(width, height) * 0.014;

  let cursor = 0;
  const fronts = list.map((piece, index) => {
    const extent = (inColumns ? piece.width : piece.height) / span;
    const box = inColumns
      ? { x: cursor * width, y: 0, w: extent * width, h: height }
      : { x: 0, y: cursor * height, w: width, h: extent * height };
    cursor += extent;
    // A pair of doors side by side opens from the centre.
    const hingeRight = inColumns && list.length === 2 && index === 1;
    return { piece, box, hingeRight, key: `${piece.type}-${index}` };
  });

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
      aria-hidden="true"
    >
      <rect className="pcdElevCarcass" x="0" y="0" width={width} height={height} />
      {fronts.map(({ piece, box, hingeRight, key }) => {
        const x = box.x + reveal;
        const y = box.y + reveal;
        const w = Math.max(0, box.w - reveal * 2);
        const h = Math.max(0, box.h - reveal * 2);
        const pullY = y + Math.min(h * 0.3, height * 0.045);
        const baseX = hingeRight ? x + w : x;
        const tipX = hingeRight ? x : x + w;
        const midY = y + h / 2;

        return (
          <g key={key}>
            <rect className="pcdElevFront" x={x} y={y} width={w} height={h} />
            {piece.type === "Drawer front" ? (
              <line className="pcdElevPull" x1={x + w * 0.35} x2={x + w * 0.65} y1={pullY} y2={pullY} />
            ) : null}
            {piece.type === "Door" ? (
              <>
                <line className="pcdElevSwing" x1={baseX} y1={y} x2={tipX} y2={midY} />
                <line className="pcdElevSwing" x1={baseX} y1={y + h} x2={tipX} y2={midY} />
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
