// Shared kickboard/plinth run detection for design tool items — used by the
// left panel cut list display and the quote import route, so both agree on
// which cabinets' kickboards merge into one continuous run.
//
// Corner cabinets need special handling: the L-shape's corner-square
// (return) area has no front face at all — it's the blocked-off zone with
// no door — so it never gets a kickboard piece, only the "open" portion of
// each leg does. And because the two legs sit on different walls at a
// right angle to each other, one continuous board can never span both —
// each leg is its own independent run that can only merge with neighbours
// on THAT leg's wall, never across the corner. kickboardSegments() is the
// single source of truth for this; everything else operates on segments
// rather than raw items so a corner cabinet's two legs are never conflated.

const ADJACENCY_TOLERANCE_MM = 5;

// Which real wall a freestanding ("island") cabinet's BACK faces — the same
// convention used as its default elevation wall in FrontElevationView.js,
// reused here so a freestanding cabinet's kickboard segment is tagged with
// a real wall instead of the literal string "island" (which could never
// match anything else for run-merging purposes, even an adjacent corner
// cabinet's leg or another freestanding cabinet facing the same way).
// Duplicated rather than imported since that file is a "use client"
// component and this one has to stay framework-free for the server-side
// import route. Exported so pcd-backpanel-utils.js (same run-detection
// pattern, different toggle fields) can reuse it instead of a third copy.
export function islandVirtualWall(item) {
  const rotation = item.rotation || 0;
  return ["top", "right", "bottom", "left"][(rotation / 90) % 4];
}

// Returns position along the wall axis for adjacency detection.
// For left/right (or left/right-equivalent virtual) walls: old format
// stores position in x_mm; new format in y_mm.
export function getWallAxisPos(item) {
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  if (wall === "left" || wall === "right") {
    const x = item.x_mm || 0;
    const y = item.y_mm || 0;
    return x > 0 && !y ? x : y;
  }
  return item.x_mm || 0;
}

// Absolute room-space {absX, absY} for an item — mirrors getAbsPos() in
// DesignCanvas.js. Only needed here for corner cabinets' secondary leg
// geometry; room dimensions are only actually used for "bottom"/"right"
// walls (the axis position for "top"/"left" never depends on room size).
function absPos(item, room) {
  const x = item.x_mm || 0;
  const y = item.y_mm || 0;
  const d = item.depth_mm || 600;
  const roomW = room?.width_mm || 4000;
  const roomD = room?.depth_mm || 3000;
  switch (item.wall) {
    case "top":    return { absX: x, absY: 0 };
    case "bottom": return { absX: x, absY: roomD - d };
    case "left":
      return x > 0 && !y ? { absX: 0, absY: x } : { absX: 0, absY: y };
    case "right":
      return x > 0 && !y ? { absX: roomW - d, absY: x } : { absX: roomW - d, absY: y };
    default:
      return { absX: x, absY: y };
  }
}

function primaryFootprint(item, room) {
  const { absX, absY } = absPos(item, room);
  const w = item.width_mm || 600;
  const d = item.depth_mm || 600;
  switch (item.wall) {
    case "top":
    case "bottom": return { x: absX, y: absY, w, h: d };
    case "left":
    case "right":  return { x: absX, y: absY, w: d, h: w };
    default:       return null;
  }
}

// Room-space footprint of a corner cabinet's secondary leg — the same
// geometry as cornerSecondaryFootprint() in DesignCanvas.js, kept as a
// separate copy here since this file is also imported from the
// server-side import route and has to stay framework-free.
function secondaryFootprint(item, room) {
  if (item.item_type !== "corner_base_cabinet" || !item.secondary_wall || item.secondary_wall === item.wall) {
    return null;
  }
  const primary = primaryFootprint(item, room);
  if (!primary) return null;
  const { x, y, w, h } = primary;
  const depth    = item.depth_mm || 600;
  const secWidth = item.secondary_width_mm || 900;

  switch (`${item.wall}:${item.secondary_wall}`) {
    case "top:left":     return { x,                y,                    w: depth,    h: secWidth };
    case "top:right":    return { x: x + w - depth,  y,                    w: depth,    h: secWidth };
    case "bottom:left":  return { x,                y: y + h - secWidth,  w: depth,    h: secWidth };
    case "bottom:right": return { x: x + w - depth,  y: y + h - secWidth,  w: depth,    h: secWidth };
    case "left:top":     return { x,                y,                    w: secWidth, h: depth };
    case "left:bottom":  return { x,                y: y + h - depth,     w: secWidth, h: depth };
    case "right:top":    return { x: x + w - secWidth, y,                  w: secWidth, h: depth };
    case "right:bottom": return { x: x + w - secWidth, y: y + h - depth,  w: secWidth, h: depth };
    default: return null;
  }
}

// Kickboard-eligible ("open") segments for an item — one per leg that has
// an actual floor-level front. A regular (non-corner) cabinet is just its
// own single full-width segment. A corner cabinet returns up to two: its
// primary leg (excluding the depth-wide corner-square return at whichever
// end touches the secondary wall) and, if a secondary wall/width is set,
// the secondary leg (same exclusion, mirrored). Each carries its own
// `wall` so run-merging only ever considers cabinets on that same wall.
export function kickboardSegments(item, room) {
  if (item.item_type !== "corner_base_cabinet") {
    const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
    // A freestanding cabinet rotated 90°/270° runs depth-wise along its
    // virtual wall's axis instead of width-wise — same swap as
    // islandEffectiveDims() in DesignCanvas.js.
    const rotated90 = item.wall === "island" && (item.rotation || 0) % 180 === 90;
    const length = rotated90 ? (item.depth_mm || 600) : (item.width_mm || 600);
    return [{ leg: "primary", wall, axisPos: getWallAxisPos(item), length, itemId: item.id }];
  }

  const depth = item.depth_mm || 600;
  const segments = [];

  const primaryOpenLen = Math.max((item.width_mm || 600) - depth, 0);
  if (primaryOpenLen > 0) {
    const returnAtStart = item.secondary_wall === "top" || item.secondary_wall === "left";
    const axisPos = getWallAxisPos(item) + (returnAtStart ? depth : 0);
    segments.push({ leg: "primary", wall: item.wall, axisPos, length: primaryOpenLen, itemId: item.id });
  }

  const secFp = secondaryFootprint(item, room);
  if (secFp) {
    const secOpenLen = Math.max((item.secondary_width_mm || 900) - depth, 0);
    if (secOpenLen > 0) {
      const returnAtStart = item.wall === "top" || item.wall === "left";
      const isXAxis = item.secondary_wall === "top" || item.secondary_wall === "bottom";
      const fullAxisPos = isXAxis ? secFp.x : secFp.y;
      const axisPos = fullAxisPos + (returnAtStart ? depth : 0);
      segments.push({ leg: "secondary", wall: item.secondary_wall, axisPos, length: secOpenLen, itemId: item.id });
    }
  }

  return segments;
}

// Groups a list of {axisPos, length} segments (already filtered to a single
// wall) into contiguous runs, using the same adjacency tolerance as
// kickboard runs. Exported so pcd-backpanel-utils.js shares the exact same
// grouping behaviour rather than a subtly different reimplementation.
export function groupIntoRuns(segments) {
  const sorted = [...segments].sort((a, b) => a.axisPos - b.axisPos);
  const runs = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    const curr = sorted[i];
    if (curr.axisPos <= prev.axisPos + prev.length + ADJACENCY_TOLERANCE_MM) {
      current.push(curr);
    } else {
      runs.push(current);
      current = [curr];
    }
  }
  runs.push(current);
  return runs;
}

// Finds the continuous kickboard run each of `item`'s kickboard-eligible
// leg segments belongs to across allItems. Returns { legs: [...] } — one
// entry per segment `item` contributes (1 for a regular cabinet, 0-2 for a
// corner cabinet). Each leg's run is computed independently against only
// the OTHER cabinets on that leg's own wall — a corner cabinet's two legs
// can never merge with each other, only with neighbours on their
// respective walls. Only the first segment in a run should output a
// kickboard cut, preventing double-counting.
export function computeKickboardRun(item, allItems, room) {
  const mySegments = kickboardSegments(item, room);

  return {
    legs: mySegments.map((seg) => {
      const candidates = allItems
        .filter((i) => i.room_id === item.room_id && i.has_kickboard && (i.kickboard_span || "continuous") === "continuous")
        .flatMap((i) => kickboardSegments(i, room).filter((s) => s.wall === seg.wall));

      if (!candidates.length) {
        return { leg: seg.leg, wall: seg.wall, firstItemId: item.id, firstLeg: seg.leg, totalWidth: seg.length, count: 1 };
      }

      const runs = groupIntoRuns(candidates);
      const myRun = runs.find((run) => run.some((s) => s.itemId === item.id && s.leg === seg.leg));
      if (!myRun) return { leg: seg.leg, wall: seg.wall, firstItemId: item.id, firstLeg: seg.leg, totalWidth: seg.length, count: 1 };

      return {
        leg: seg.leg,
        wall: seg.wall,
        firstItemId: myRun[0].itemId,
        firstLeg: myRun[0].leg,
        totalWidth: myRun.reduce((sum, s) => sum + s.length, 0),
        count: myRun.length,
      };
    }),
  };
}

// Returns all continuous kickboard runs with 2+ segments for a given list
// of room items, grouped by wall. Each returned segment carries a `item`
// reference back to its source cabinet for display purposes. Single-leg
// continuous or individual-span kickboards are not returned here — those
// are handled per-cabinet by the caller.
export function computeAllKickboardRuns(roomItems, room) {
  const byWall = {};
  for (const item of roomItems) {
    if (!item.has_kickboard || (item.kickboard_span || "continuous") !== "continuous" || item.item_type === "wall_cabinet") {
      continue;
    }
    for (const seg of kickboardSegments(item, room)) {
      const key = seg.wall || "top";
      if (!byWall[key]) byWall[key] = [];
      byWall[key].push({ ...seg, item });
    }
  }

  const allRuns = [];
  for (const [wall, segs] of Object.entries(byWall)) {
    for (const run of groupIntoRuns(segs)) {
      if (run.length >= 2) allRuns.push({ wall, segments: run });
    }
  }
  return allRuns;
}
