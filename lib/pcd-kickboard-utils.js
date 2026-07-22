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

export const DEFAULT_KICKBOARD_HEIGHT_MM = 120;

// Where each item type hangs when mount_height_mm isn't set.
//
// This lives here — framework-free, at the bottom of the import graph — because
// it has to be readable from BOTH the client views and the server routes. It
// used to be declared in FrontElevationView.js, a "use client" file, which a
// server route can't import. So the items API grew its own copy, the filler
// panel maths hardcoded `?? 1400`, and the config panel's input hardcoded
// another: four expressions of one fact, which is exactly the shape of every
// silent-disagreement bug in this codebase. One definition, imported.
export const CABINET_MOUNT_MM = {
  base_cabinet:  0,
  wall_cabinet:  1400,
  floating_shelf: 1500,
  tall_cabinet:  0,
  corner_base_cabinet: 0,
  blind_corner_cabinet: 0,
  door:          0,
  drawer_front:  0,
  panel:         0,
  scribe:        0,
  obstruction:   0,
};

// The mount height an item sits at — its own, or its type's default.
export function mountHeightMm(item) {
  return item?.mount_height_mm ?? CABINET_MOUNT_MM[item?.item_type] ?? 0;
}

// How far a kickboard lifts a floor-standing cabinet's carcass off the floor.
//
// This is REAL geometry, not decoration: the carcass bottom sits AT the
// kickboard height and its top is that much higher. It used to be applied
// only when drawing the elevation, recomputed inline at each render site,
// while every consumer that measures — gap dimensions, overlap detection,
// drag collision, auto filler heights — read the raw stored mount_height_mm
// and so placed the carcass a full kickboard too low. A base cabinet drawn
// with its top at 870 was measured to at 720.
//
// mount_height_mm deliberately does NOT include this: it's what the user
// drags and what gets saved. Add this on top when you need the carcass's
// true position; never persist the sum back.
//
// Wall cabinets hang from their mount height and never take a kickboard.
export function kickboardOffsetMm(item) {
  if (!item?.has_kickboard || item.item_type === "wall_cabinet") return 0;
  return Number(item.kickboard_height_mm) || DEFAULT_KICKBOARD_HEIGHT_MM;
}

// The vertical span [bottomMm, topMm] a cabinet's carcass actually occupies,
// kickboard included. Resolves its own per-type mount default now that
// CABINET_MOUNT_MM lives here — callers used to have to pass one in, which is
// how a tall cabinet ended up mounted at 1400 in the filler-panel maths and at
// 0 everywhere else.
export function cabinetVerticalSpanMm(item) {
  const bottom = mountHeightMm(item) + kickboardOffsetMm(item);
  return [bottom, bottom + (Number(item?.height_mm) || 720)];
}

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

// How far an item spans along its OWN wall — always width_mm, including for
// a rotated freestanding cabinet.
//
// This used to read `rotated90 ? depth_mm : width_mm`, duplicated into six
// files along with a comment claiming it mirrored islandEffectiveDims(). It
// doesn't. islandEffectiveDims() swaps which ROOM axis each dimension runs
// along; but islandVirtualWall() rotates the wall WITH the item, so the wall
// axis turns too and the two swaps cancel out. A 900×600 island rotated 90°
// still presents a 900mm front face — it just faces a different way — and
// the old formula cut its kickboard, back, underside and filler panels at
// 600mm. 300mm short, on every rotated island.
export function wallSpanMm(item) {
  return Number(item?.width_mm) || 600;
}

// Returns position along the wall axis for adjacency detection.
// For left/right (or left/right-equivalent virtual) walls: old format
// stores position in x_mm; new format in y_mm.
export function getWallAxisPos(item) {
  // Islands take their coordinate straight, with no legacy-format guess.
  //
  // The heuristic below is only meaningful for a real left/right WALL, where
  // x_mm is either a legacy along-wall position or zero. An island's x_mm and
  // y_mm are BOTH genuine room coordinates, so `x > 0` there means "1000mm
  // across the room", not "legacy row". Mapping the island to its virtual
  // wall first and then applying the heuristic reported an island at
  // (1000, 0) as 1000mm along its wall instead of 0, splitting or merging
  // cut-list runs. getAbsPos() in DesignCanvas switches on the RAW wall for
  // exactly this reason. Which axis to read still depends on the virtual
  // wall, since rotation turns the island's own along-wall axis.
  if (item.wall === "island") {
    const virtualWall = islandVirtualWall(item);
    return (virtualWall === "left" || virtualWall === "right") ? (item.y_mm || 0) : (item.x_mm || 0);
  }
  if (item.wall === "left" || item.wall === "right") {
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

// The material + dimensions that make one continuous kickboard a SINGLE
// physical board. Two adjacent cabinets only merge into one run when these all
// match — a different kickboard colour, material, thickness or height means
// separate boards, so the cut list must not fuse them into one length.
//
// Colour/material come from the per-cabinet kickboard_style override when it's
// set (the "Kickboard colour" picker, which is a full material picker),
// otherwise the cabinet's own carcass finish — the same fallback the views use.
export function kickboardSpecKey(item) {
  const ks = item?.kickboard_style;
  const overridden = ks && (ks.material || ks.colour);
  const material  = (overridden ? ks.material : item?.material) || "";
  const finish    = (overridden ? ks.finish  : item?.finish)  || "";
  const colour    = (overridden ? ks.colour  : item?.colour)  || "";
  const thickness = Number(item?.kickboard_thickness_mm) || 16;
  const height    = Number(item?.kickboard_height_mm) || DEFAULT_KICKBOARD_HEIGHT_MM;
  return [material, finish, colour, thickness, height]
    .map((v) => String(v).trim().toLowerCase())
    .join("|");
}

// Kickboard-eligible ("open") segments for an item — one per leg that has
// an actual floor-level front. A regular (non-corner) cabinet is just its
// own single full-width segment. A corner cabinet returns up to two: its
// primary leg (excluding the depth-wide corner-square return at whichever
// end touches the secondary wall) and, if a secondary wall/width is set,
// the secondary leg (same exclusion, mirrored). Each carries its own
// `wall` so run-merging only ever considers cabinets on that same wall.
export function kickboardSegments(item, room) {
  const specKey = kickboardSpecKey(item);
  if (item.item_type !== "corner_base_cabinet") {
    const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
    const length = wallSpanMm(item);
    return [{ leg: "primary", wall, axisPos: getWallAxisPos(item), length, itemId: item.id, specKey }];
  }

  const depth = item.depth_mm || 600;
  const segments = [];

  const primaryOpenLen = Math.max((item.width_mm || 600) - depth, 0);
  if (primaryOpenLen > 0) {
    const returnAtStart = item.secondary_wall === "top" || item.secondary_wall === "left";
    const axisPos = getWallAxisPos(item) + (returnAtStart ? depth : 0);
    segments.push({ leg: "primary", wall: item.wall, axisPos, length: primaryOpenLen, itemId: item.id, specKey });
  }

  const secFp = secondaryFootprint(item, room);
  if (secFp) {
    const secOpenLen = Math.max((item.secondary_width_mm || 900) - depth, 0);
    if (secOpenLen > 0) {
      const returnAtStart = item.wall === "top" || item.wall === "left";
      const isXAxis = item.secondary_wall === "top" || item.secondary_wall === "bottom";
      const fullAxisPos = isXAxis ? secFp.x : secFp.y;
      const axisPos = fullAxisPos + (returnAtStart ? depth : 0);
      segments.push({ leg: "secondary", wall: item.secondary_wall, axisPos, length: secOpenLen, itemId: item.id, specKey });
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
    const adjacent = curr.axisPos <= prev.axisPos + prev.length + ADJACENCY_TOLERANCE_MM;
    // Segments carrying a spec key (kickboards) only merge when the spec
    // matches — a different material/colour/thickness/height is a separate
    // board even when the cabinets butt together. Segments without a spec key
    // (e.g. back panels reusing this grouper) merge on adjacency alone, so
    // their behaviour is unchanged.
    const specOk = prev.specKey == null || curr.specKey == null || prev.specKey === curr.specKey;
    if (adjacent && specOk) {
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
