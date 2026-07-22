"use client";

// Read-only 3D view of a room. NOT editable — you position in the plan, size
// in the config panel, and look at it here. It renders every item the plan
// does, plus benchtops, waterfall ends and cutouts.
//
// It reuses the SAME geometry helpers the plan and overlap detection use —
// getAbsPos, cabinetFootprint, cabinetVerticalSpanMm, the benchtop run maths —
// so a cabinet lands in exactly the same place in 3D as in 2D. The only new
// idea here is lifting those room-space rectangles into boxes and drawing them
// with three.js; all the positioning was already solved and debugged.
//
// World coordinates: room width → X, room depth → Z, height → Y (up), floor at
// Y=0. Everything is converted mm → metres so three.js units stay sane.

import { Component, Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Billboard, Text, Grid, Line, Edges, useTexture } from "@react-three/drei";
import { resolveColourSrc } from "../../../../lib/pcd-colour-images";

import {
  getAbsPos,
  cabinetFootprint,
  cornerSecondaryFootprint,
  islandEffectiveDims,
  frontEdgeFor,
  panelSideEdges,
} from "../../../../lib/pcd-plan-geometry";
import {
  cabinetVerticalSpanMm,
  islandVirtualWall,
  getWallAxisPos,
  kickboardOffsetMm,
} from "../../../../lib/pcd-kickboard-utils";
import {
  computeBenchtopRun,
  benchtopDepthMm,
  benchtopThicknessMm,
  benchtopUndersideMm,
  benchtopOverhangMm,
  benchtopCutouts,
  benchtopWaterfallSides,
  benchtopRunWaterfallEnds,
} from "../../../../lib/pcd-benchtop-utils";
import { fillerPanelGapMm } from "../../../../lib/pcd-fillerpanel-utils";
import { doorRowGapMm, drawerGapMm, frontRevealMm, frontWidthMm, bayTypeForRow } from "../../../../lib/pcd-door-utils";

const M = 1000; // mm → metres

// Same palette the plan uses, so an item reads as the same thing in both views.
const ITEM_COLORS = {
  base_cabinet:  "#3b82f6",
  wall_cabinet:  "#22c55e",
  tall_cabinet:  "#f97316",
  corner_base_cabinet: "#0ea5e9",
  blind_corner_cabinet: "#06b6d4",
  floating_shelf: "#14b8a6",
  panel:         "#6b7280",
  scribe:        "#ec4899",
  obstruction:   "#57534e",
};
const BENCHTOP_COLOR = "#787066";
const CUTOUT_COLOR = "#1c1917";
const KICKBOARD_COLOR = "#292524";
const FILLER_COLOR = "#cbd5c0";
const FRONT_LINE_COLOR = "#0f172a";
const GRIP_LINE_COLOR = "#334155";
const SELECT_COLOR = "#f59e0b"; // selection highlight — amber, reads on wood + greys
const BENCH_HEIGHT_MM = 900; // finger-grip datum, matching the elevation
const KICKBOARD_RECESS_MM = 45; // toe-kick setback from the front face

const BENCHTOP_TYPES = new Set(["base_cabinet", "corner_base_cabinet", "blind_corner_cabinet"]);
const FILLER_TYPES = new Set(["wall_cabinet", "tall_cabinet"]);
const DOOR_PANEL_THICKNESS = 0.018; // m — how far a coloured front sits inside the face
// three's colour-space constant is a plain string ("srgb") since r152. Using
// the literal avoids a top-level `import from "three"` in this dynamically
// loaded chunk, which trips Webpack ("__webpack_modules__[moduleId] is not a
// function") under the transpilePackages + dynamic-import setup.
const SRGB = "srgb";

// "Show colours" plumbing. The map (name → tile image) and the on/off flag ride
// a context so every mesh can resolve its own panel colour without the render
// loop threading props through all six of them. When off, or when a tile can't
// be resolved, usePanelSrc returns "" and the caller keeps its flat type colour.
const ColourCtx = createContext({ map: null, on: false, mono: false });
function usePanelSrc(item, slot) {
  const { map, on, mono } = useContext(ColourCtx);
  return on && !mono ? resolveColourSrc(map, item, slot) : "";
}
// Line-drawing export renders the 3D as a neutral grey "clay" model, so it
// carries no product colours. Returns a grey for cabinets/shelves when on.
const MONO_CABINET = "#c7c7c4";
function useMonoColor(fallback) {
  return useContext(ColourCtx).mono ? MONO_CABINET : fallback;
}

// A standard material that paints itself with a colour-library tile when `src`
// is set, and falls back to a flat `color` otherwise. Split in two because
// useTexture is a hook and can't be called conditionally — the branch picks
// which component (and therefore which hooks) to mount.
function PanelMaterial({ src, ...props }) {
  if (src) return <TexturedMaterial src={src} {...props} />;
  return <meshStandardMaterial {...props} />;
}
function TexturedMaterial({ src, ...props }) {
  const texture = useTexture(src);
  // Tile images are sRGB photos — without tagging them the finish renders dark
  // and desaturated. Anisotropy keeps the grain crisp at glancing angles
  // instead of shimmering into moiré. Idempotent, so safe to set each render.
  if (texture.colorSpace !== SRGB) { texture.colorSpace = SRGB; texture.needsUpdate = true; }
  if (texture.anisotropy !== 8) { texture.anisotropy = 8; texture.needsUpdate = true; }
  // color forced white AFTER the spread so the tile shows its true colour
  // rather than being tinted by the fallback type colour.
  return <meshStandardMaterial {...props} color="#ffffff" map={texture} />;
}

// If a tile fails to load (a missing image, or one whose host doesn't send the
// CORS headers WebGL textures require), useTexture rejects into Suspense.
// Without a boundary that would blank the entire 3D view; instead we fall back
// to the flat-colour scene. Keyed on the toggle by the caller so flipping
// colours off — or on again — resets it and re-attempts.
class TextureErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// A cabinet's legs, each as { rect (room-space footprint), wall (the wall that
// leg backs onto) }. One leg for anything but a corner cabinet; two for an
// L-shape (primary + return). This is the shared basis for benchtop, kickboard,
// filler and door geometry, so every element wraps the corner the same way.
function cabinetLegs(item, W, D) {
  if (item.wall === "island") {
    const { ew, ed } = islandEffectiveDims(item);
    return [{ rect: { x: item.x_mm || 0, y: item.y_mm || 0, w: ew, h: ed }, wall: islandVirtualWall(item) }];
  }
  const legs = [];
  const primary = cabinetFootprint(item, W, D);
  if (primary) legs.push({ rect: primary, wall: item.wall });
  if (item.item_type === "corner_base_cabinet" && item.secondary_wall) {
    const secondary = cornerSecondaryFootprint(item, W, D);
    if (secondary) legs.push({ rect: secondary, wall: item.secondary_wall });
  }
  return legs;
}

// Extends a footprint frontward (away from the wall it backs onto) by `delta`.
function extendFront(rect, wall, delta) {
  switch (wall) {
    case "top":    return { x: rect.x, y: rect.y, w: rect.w, h: rect.h + delta };
    case "bottom": return { x: rect.x, y: rect.y - delta, w: rect.w, h: rect.h + delta };
    case "left":   return { x: rect.x, y: rect.y, w: rect.w + delta, h: rect.h };
    case "right":  return { x: rect.x - delta, y: rect.y, w: rect.w + delta, h: rect.h };
    default:       return rect;
  }
}

// A thin slab of thickness `t` hugging the FRONT edge of a footprint, spanning
// the given vertical range — used for filler panels (above) and elsewhere.
function frontEdgeRect(rect, wall, t) {
  switch (wall) {
    case "top":    return { x: rect.x, y: rect.y + rect.h - t, w: rect.w, h: t };
    case "bottom": return { x: rect.x, y: rect.y, w: rect.w, h: t };
    case "left":   return { x: rect.x + rect.w - t, y: rect.y, w: t, h: rect.h };
    case "right":  return { x: rect.x, y: rect.y, w: t, h: rect.h };
    default:       return rect;
  }
}

// Pulls the front edge back by `recess` (a toe-kick setback) without moving the
// back-against-wall edge.
function insetFront(rect, wall, recess) {
  switch (wall) {
    case "top":    return { x: rect.x, y: rect.y, w: rect.w, h: Math.max(1, rect.h - recess) };
    case "bottom": return { x: rect.x, y: rect.y + recess, w: rect.w, h: Math.max(1, rect.h - recess) };
    case "left":   return { x: rect.x, y: rect.y, w: Math.max(1, rect.w - recess), h: rect.h };
    case "right":  return { x: rect.x + recess, y: rect.y, w: Math.max(1, rect.w - recess), h: rect.h };
    default:       return rect;
  }
}

// The room-space carcass rectangle(s) for any item, mirroring what the plan's
// overlap detection sees: a wall item is one rect (a corner cabinet adds its
// return leg), an island takes its rotation-aware effective dims.
function carcassRects(item, W, D) {
  if (item.wall === "island") {
    const { ew, ed } = islandEffectiveDims(item);
    return [{ x: item.x_mm || 0, y: item.y_mm || 0, w: ew, h: ed }];
  }
  const rects = [];
  const primary = cabinetFootprint(item, W, D);
  if (primary) rects.push(primary);
  const secondary = cornerSecondaryFootprint(item, W, D);
  if (secondary) rects.push(secondary);
  return rects;
}

// A room-space {x,y,w,h} rect + vertical [bottom,top] → a metre-space box.
function boxFromRect(rect, bottomMm, topMm) {
  return {
    position: [
      (rect.x + rect.w / 2) / M,
      (bottomMm + (topMm - bottomMm) / 2) / M,
      (rect.y + rect.h / 2) / M,
    ],
    size: [rect.w / M, Math.max(topMm - bottomMm, 1) / M, rect.h / M],
  };
}

// The five carcass boards of an OPEN cabinet (top, bottom, back and two sides —
// the front is left open) as { rect, b, t } in room-space + mm heights. The
// back sits against `wall`; the two sides are the boards perpendicular to it.
// Boards are inset so they butt rather than overlap, which would z-fight.
function openCarcassPanels(rect, wall, carc, bottomMm, topMm) {
  const { x, y, w, h } = rect;
  const midB = bottomMm + carc, midT = Math.max(topMm - carc, midB + 1);
  const panels = [
    { rect: { x, y, w, h }, b: bottomMm, t: bottomMm + carc }, // bottom
    { rect: { x, y, w, h }, b: topMm - carc, t: topMm },       // top
  ];
  if (wall === "top" || wall === "bottom" || wall === "island") {
    panels.push({ rect: { x, y, w: carc, h }, b: midB, t: midT });                // left side
    panels.push({ rect: { x: x + w - carc, y, w: carc, h }, b: midB, t: midT });   // right side
    const backY = wall === "bottom" ? y + h - carc : y;
    panels.push({ rect: { x: x + carc, y: backY, w: Math.max(w - 2 * carc, 1), h: carc }, b: midB, t: midT }); // back
  } else {
    panels.push({ rect: { x, y, w, h: carc }, b: midB, t: midT });                // side
    panels.push({ rect: { x, y: y + h - carc, w, h: carc }, b: midB, t: midT });   // side
    const backX = wall === "right" ? x + w - carc : x;
    panels.push({ rect: { x: backX, y: y + carc, w: carc, h: Math.max(h - 2 * carc, 1) }, b: midB, t: midT }); // back
  }
  return panels;
}

function CabinetMesh({ item, W, D }) {
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  const color = useMonoColor(item.colour_hex || ITEM_COLORS[item.item_type] || "#888");
  const carcassSrc = usePanelSrc(item, "carcass");
  // An OPEN cabinet (no door/drawer front) is drawn as its actual carcass
  // boards with the front left open, so its real board colour shows and the
  // shelves sit inside it. A fronted cabinet stays a solid box — you can't see
  // inside it anyway; wall units are a touch translucent, the "it's above you"
  // cue the plan uses.
  const isOpen = (item.front_type || "none") === "none";

  // An obstruction (pillar, pipe boxing, meter box…) is a solid object, not a
  // cabinet — render it as one opaque coloured block so its colour reads clearly
  // and it presents a solid target to click/tap in 3D. Its per-item colour_hex
  // drives the colour (falling back to the default obstruction grey).
  if (item.item_type === "obstruction") {
    return (
      <>
        {carcassRects(item, W, D).map((rect, i) => {
          const { position, size } = boxFromRect(rect, bottomMm, topMm);
          return (
            <mesh key={i} position={position}>
              <boxGeometry args={size} />
              <PanelMaterial src={carcassSrc} color={color} roughness={0.75} />
            </mesh>
          );
        })}
      </>
    );
  }

  if (isOpen) {
    const carc = Number(item.carcass_thickness_mm) || 16;
    return (
      <>
        {cabinetLegs(item, W, D).map((leg, li) =>
          openCarcassPanels(leg.rect, leg.wall, carc, bottomMm, topMm).map((p, pi) => {
            const box = boxFromRect(p.rect, p.b, p.t);
            return (
              <mesh key={`${li}-${pi}`} position={box.position}>
                <boxGeometry args={box.size} />
                <PanelMaterial src={carcassSrc} color={color} roughness={0.7} />
              </mesh>
            );
          })
        )}
      </>
    );
  }

  const opacity = item.item_type === "wall_cabinet" ? 0.72 : 0.92;
  return (
    <>
      {carcassRects(item, W, D).map((rect, i) => {
        const { position, size } = boxFromRect(rect, bottomMm, topMm);
        return (
          <mesh key={i} position={position}>
            <boxGeometry args={size} />
            <PanelMaterial src={carcassSrc} color={color} transparent opacity={opacity} roughness={0.7} depthWrite />
          </mesh>
        );
      })}
    </>
  );
}

// The benchtop slab rect(s) for a cabinet — plural because a corner cabinet's
// top wraps the L (one slab per leg). Gated on has_benchtop AND a benchtop
// type: computeBenchtopRun returns a plausible count:1 result for ANY item, so
// without this gate every cabinet — wall units included — sprouted a slab.
function benchtopSlabs(item, items, W, D) {
  if (!item.has_benchtop || !BENCHTOP_TYPES.has(item.item_type)) return null;

  const thickness = benchtopThicknessMm(item);
  const underside = benchtopUndersideMm(item);

  // A corner cabinet: extend each leg's carcass footprint frontward by the bit
  // the top projects past the carcass (door board + overhang), giving an L.
  if (item.item_type === "corner_base_cabinet") {
    const delta = Math.max(0, benchtopDepthMm(item) - (item.depth_mm || 600));
    const rects = cabinetLegs(item, W, D).map((leg) => extendFront(leg.rect, leg.wall, delta));
    return { rects, thickness, underside, item, corner: true };
  }

  // Straight cabinet: the run-based slab, drawn once by the run's owner.
  const run = computeBenchtopRun(item, items);
  if (run.count > 1 && run.firstItemId !== item.id) return null;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  const depth = benchtopDepthMm(item);
  const start = run.startAxisPos ?? getWallAxisPos(item);
  const len = run.totalWidth;
  let rect;
  if (wall === "top")         rect = { x: start, y: 0, w: len, h: depth };
  else if (wall === "bottom") rect = { x: start, y: D - depth, w: len, h: depth };
  else if (wall === "left")   rect = { x: 0, y: start, w: depth, h: len };
  else if (wall === "right")  rect = { x: W - depth, y: start, w: depth, h: len };
  else {
    const { ew, ed } = islandEffectiveDims(item);
    const o = benchtopOverhangMm(item);
    rect = { x: (item.x_mm || 0) - o, y: (item.y_mm || 0) - o, w: ew + 2 * o, h: ed + 2 * o };
  }
  return { rects: [rect], thickness, underside, item, wall, alongX: wall === "top" || wall === "bottom" || wall === "island" };
}

function BenchtopMesh({ item, items, W, D }) {
  const bt = benchtopSlabs(item, items, W, D);
  if (!bt) return null;
  const { rects, thickness, underside } = bt;

  // Waterfalls apply only to a straight run — a corner cabinet's benchtop is in
  // a corner with both ends against walls, so there's no exposed end to fall.
  // A waterfall extends the top past the cabinet end by its own thickness (the
  // overhang), then drops a panel of that thickness straight to the floor on the
  // OUTSIDE of the end — so the top's outer face and the panel's line up.
  let waterfalls = [];
  let slabRects = rects;
  if (!bt.corner) {
    const rect = { ...rects[0] };
    const { low, high } = benchtopWaterfallSides(item, bt.wall, benchtopRunWaterfallEnds(item, items));
    const along = bt.alongX; // true → x is the along-wall axis, false → y
    if (along) {
      if (low)  { rect.x -= thickness; rect.w += thickness; }
      if (high) { rect.w += thickness; }
    } else {
      if (low)  { rect.y -= thickness; rect.h += thickness; }
      if (high) { rect.h += thickness; }
    }
    slabRects = [rect];
    const panelRect = (atLow) => along
      ? { x: atLow ? rect.x : rect.x + rect.w - thickness, y: rect.y, w: thickness, h: rect.h }
      : { x: rect.x, y: atLow ? rect.y : rect.y + rect.h - thickness, w: rect.w, h: thickness };
    if (low)  waterfalls.push(boxFromRect(panelRect(true), 0, underside));
    if (high) waterfalls.push(boxFromRect(panelRect(false), 0, underside));
  }

  // Cutouts sit centred on the cabinet's primary footprint — works for a
  // straight top and for a corner's primary leg (a corner sink lands there).
  const alongX = bt.corner ? true : bt.alongX;
  const cRect = cabinetLegs(item, W, D)[0].rect;
  const cutMeshes = benchtopCutouts(item).map((cut, i) => {
    const aw = (alongX ? cut.width_mm : cut.depth_mm) / M;
    const ad = (alongX ? cut.depth_mm : cut.width_mm) / M;
    return {
      key: i,
      position: [(cRect.x + cRect.w / 2) / M, (underside + thickness) / M, (cRect.y + cRect.h / 2) / M],
      size: [aw, thickness / M + 0.002, ad],
      cooktop: cut.type === "cooktop",
    };
  });

  return (
    <>
      {slabRects.map((rect, i) => {
        const slab = boxFromRect(rect, underside, underside + thickness);
        return (
          <mesh key={`slab-${i}`} position={slab.position}>
            <boxGeometry args={slab.size} />
            <meshStandardMaterial color={BENCHTOP_COLOR} roughness={0.35} metalness={0.05} />
          </mesh>
        );
      })}
      {waterfalls.map((w, i) => (
        <mesh key={`wf-${i}`} position={w.position}>
          <boxGeometry args={w.size} />
          <meshStandardMaterial color={BENCHTOP_COLOR} roughness={0.35} metalness={0.05} />
        </mesh>
      ))}
      {cutMeshes.map((c) => (
        <mesh key={`cut-${c.key}`} position={c.position}>
          <boxGeometry args={c.size} />
          <meshStandardMaterial color={c.cooktop ? "#b91c1c" : CUTOUT_COLOR} roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

// Toe-kick — fills the floor-to-carcass gap a kickboard leaves, set back from
// the front face so it reads as a recess. One panel per leg (corner = two).
function KickboardMesh({ item, W, D }) {
  // A kickboard matches the carcass by default, or its own override; otherwise
  // the dark toe-kick colour.
  const src = usePanelSrc(item, "kickboard");
  const kb = kickboardOffsetMm(item);
  if (kb <= 0) return null;
  return (
    <>
      {cabinetLegs(item, W, D).map((leg, i) => {
        const box = boxFromRect(insetFront(leg.rect, leg.wall, KICKBOARD_RECESS_MM), 0, kb);
        return (
          <mesh key={i} position={box.position}>
            <boxGeometry args={box.size} />
            <PanelMaterial src={src} color={KICKBOARD_COLOR} roughness={0.9} />
          </mesh>
        );
      })}
    </>
  );
}

// Filler panel — a thin board from the cabinet top up to the ceiling (or the
// nearest obstruction), at the front edge. Wall/tall cabinets only. This is
// what the wall units in the corner were missing — the dark slab there was the
// erroneous benchtop, now gone; this draws the actual filler.
function FillerMesh({ item, room, items, W, D }) {
  const src = usePanelSrc(item, "filler");
  if (!item.has_filler_panel || !FILLER_TYPES.has(item.item_type)) return null;
  const heightMm = item.filler_panel_height_mm ?? fillerPanelGapMm(item, room, items);
  if (!heightMm || heightMm <= 0) return null;
  const t = Number(item.filler_panel_thickness_mm) || 16;
  const [, topMm] = cabinetVerticalSpanMm(item);
  return (
    <>
      {cabinetLegs(item, W, D).map((leg, i) => {
        const box = boxFromRect(frontEdgeRect(leg.rect, leg.wall, t), topMm, topMm + heightMm);
        return (
          <mesh key={i} position={box.position}>
            <boxGeometry args={box.size} />
            <PanelMaterial src={src} color={FILLER_COLOR} roughness={0.6} />
          </mesh>
        );
      })}
    </>
  );
}

// A thin board hugging the INSIDE of a footprint edge — used for a floating
// shelf's end caps, which sit at the very end of its footprint.
function endStripRect(rect, edge, t) {
  const { x, y, w, h } = rect;
  switch (edge) {
    case "top":    return { x, y, w, h: t };
    case "bottom": return { x, y: y + h - t, w, h: t };
    case "left":   return { x, y, w: t, h };
    case "right":  return { x: x + w - t, y, w: t, h };
    default:       return null;
  }
}

// A floating shelf: a decorative-board box — bottom, top and front fascia, plus
// any mitred end caps — open at the back and (uncapped) ends. All one finish.
function FloatingShelfMesh({ item, W, D }) {
  const src = usePanelSrc(item, "carcass");
  const color = useMonoColor(ITEM_COLORS.floating_shelf);
  const leg = cabinetLegs(item, W, D)[0];
  if (!leg) return null;
  const { rect, wall } = leg;
  const t = Number(item.carcass_thickness_mm) || 18;
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  const { leftEdge, rightEdge } = panelSideEdges(item);
  const rects = [
    boxFromRect(rect, bottomMm, bottomMm + t),                    // bottom panel
    boxFromRect(rect, topMm - t, topMm),                          // top panel
    boxFromRect(frontEdgeRect(rect, wall, t), bottomMm, topMm),   // front fascia
  ];
  if (item.end_panel_left && leftEdge)   rects.push(boxFromRect(endStripRect(rect, leftEdge, t), bottomMm, topMm));
  if (item.end_panel_right && rightEdge) rects.push(boxFromRect(endStripRect(rect, rightEdge, t), bottomMm, topMm));
  return (
    <>
      {rects.map((box, i) => (
        <mesh key={i} position={box.position}>
          <boxGeometry args={box.size} />
          <PanelMaterial src={src} color={color} roughness={0.6} />
        </mesh>
      ))}
    </>
  );
}

// A thin board hugging the OUTSIDE of a footprint edge (top/bottom/left/right),
// where an applied finished panel physically sits.
function edgeBoardRect(rect, edge, t) {
  const { x, y, w, h } = rect;
  switch (edge) {
    case "top":    return { x, y: y - t, w, h: t };
    case "bottom": return { x, y: y + h, w, h: t };
    case "left":   return { x: x - t, y, w: t, h };
    case "right":  return { x: x + w, y, w: t, h };
    default:       return null;
  }
}

// Finished END panels — a board over an exposed cabinet side. Finished ends
// default to the DOOR finish (via the "endpanel" slot); only the sides the user
// enabled are drawn. panelSideEdges maps viewer left/right to the room-space
// footprint edge, matching the plan and elevation.
function EndPanelMesh({ item, W, D }) {
  const src = usePanelSrc(item, "endpanel");
  const color = useMonoColor(ITEM_COLORS[item.item_type] || "#888");
  if (item.item_type === "obstruction" || (!item.end_panel_left && !item.end_panel_right)) return null;
  const { leftEdge, rightEdge } = panelSideEdges(item);
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  const t = Number(item.finish_panel_style?.thickness_mm) || 18;
  const rect = cabinetLegs(item, W, D)[0]?.rect;
  if (!rect) return null;
  const edges = [];
  if (item.end_panel_left) edges.push(edgeBoardRect(rect, leftEdge, t));
  if (item.end_panel_right) edges.push(edgeBoardRect(rect, rightEdge, t));
  return (
    <>
      {edges.filter(Boolean).map((r, i) => {
        const box = boxFromRect(r, bottomMm, topMm);
        return (
          <mesh key={i} position={box.position}>
            <boxGeometry args={box.size} />
            <PanelMaterial src={src} color={color} roughness={0.55} />
          </mesh>
        );
      })}
    </>
  );
}

// Finished UNDERSIDE panel — the board that finishes the visible bottom of a
// wall cabinet, in the carcass finish.
function UndersidePanelMesh({ item, W, D }) {
  const src = usePanelSrc(item, "underside");
  const color = useMonoColor(ITEM_COLORS[item.item_type] || "#888");
  if (!item.has_bottom_panel || item.item_type !== "wall_cabinet") return null;
  const t = Number(item.bottom_panel_thickness_mm) || Number(item.carcass_thickness_mm) || 16;
  const [bottomMm] = cabinetVerticalSpanMm(item);
  return (
    <>
      {cabinetLegs(item, W, D).map((leg, i) => {
        const box = boxFromRect(leg.rect, bottomMm - t, bottomMm);
        return (
          <mesh key={i} position={box.position}>
            <boxGeometry args={box.size} />
            <PanelMaterial src={src} color={color} roughness={0.6} />
          </mesh>
        );
      })}
    </>
  );
}

// Finished BACK panel — a board over an exposed back (island/peninsula), in the
// carcass finish. Against a wall it renders into the wall and simply isn't seen.
function BackPanelMesh({ item, W, D }) {
  const src = usePanelSrc(item, "back");
  const color = useMonoColor(ITEM_COLORS[item.item_type] || "#888");
  const enabled = item.has_back_panel || item.back_panel_wall1 || item.back_panel_wall2;
  if (!enabled || item.item_type === "obstruction") return null;
  const { backEdge } = panelSideEdges(item);
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  const t = Number(item.back_panel_thickness_mm) || Number(item.carcass_thickness_mm) || 16;
  const rect = cabinetLegs(item, W, D)[0]?.rect;
  const board = rect && edgeBoardRect(rect, backEdge, t);
  if (!board) return null;
  const box = boxFromRect(board, bottomMm, topMm);
  return (
    <mesh position={box.position}>
      <boxGeometry args={box.size} />
      <PanelMaterial src={src} color={color} roughness={0.6} />
    </mesh>
  );
}

// The FRONT-FACE plane of a leg, as a basis for mapping (along-wall mm,
// absolute height mm) → a 3D point. `fixed` is the face's constant room
// coordinate, `normal` which way it faces (out of the cabinet toward the room).
function faceBasis(leg) {
  const { rect, wall } = leg;
  switch (wall) {
    case "top":    return { alongAxis: "x", alongBase: rect.x, fixed: rect.y + rect.h, normal: 1 };
    case "bottom": return { alongAxis: "x", alongBase: rect.x, fixed: rect.y, normal: -1 };
    case "left":   return { alongAxis: "z", alongBase: rect.y, fixed: rect.x + rect.w, normal: 1 };
    case "right":  return { alongAxis: "z", alongBase: rect.y, fixed: rect.x, normal: -1 };
    default:       return null;
  }
}
function facePoint(basis, alongMm, vertMm, off = 0.006) {
  const fixed = basis.fixed / M + basis.normal * off; // a touch proud so lines show on the face
  return basis.alongAxis === "x"
    ? [(basis.alongBase + alongMm) / M, vertMm / M, fixed]
    : [fixed, vertMm / M, (basis.alongBase + alongMm) / M];
}

// Door/drawer outlines and finger-grip lines drawn on a cabinet's front face,
// so a configured front reads in 3D the way it does in the elevation.
//
// Produces one { basis, cells } group per face that carries a front. A regular
// cabinet has one (its primary leg); a corner cabinet has two — a bi-fold leaf
// on each leg, at the OUTER end, with the depth-square corner left doorless.
function frontGroups(item, W, D) {
  const ft = item.front_type || "none";
  if (ft === "none") return [];
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);

  const addDoors = (cells, cfg, v0, v1, aStart, aLen) => {
    const cols = Math.max(1, cfg.columns || 1);
    const rows = Math.max(1, cfg.rows || 1);
    const ratios = Array.isArray(cfg.width_ratios) && cfg.width_ratios.length === cols
      ? cfg.width_ratios : Array(cols).fill(1 / cols);
    const total = ratios.reduce((s, r) => s + (Number(r) || 0), 0) || 1;
    const gripped = doorRowGapMm(cfg) > 0;
    for (let r = 0; r < rows; r++) {
      const rv0 = v0 + (v1 - v0) * (r / rows);
      const rv1 = v0 + (v1 - v0) * ((r + 1) / rows);
      // door_config.bays indexes from the TOP, but this loop's r=0 is the
      // BOTTOM row (v0 = bottomMm), so read the mirrored index. Free bays emit
      // a single non-door cell instead of the door grid: an appliance recess
      // gets a mock, "open" carries no front (bare carcass, like a mixed open).
      const bayType = bayTypeForRow(cfg, rows - 1 - r);
      if (bayType === "appliance") {
        const appliance = (cfg.bays && cfg.bays[rows - 1 - r] && cfg.bays[rows - 1 - r].appliance) || "oven";
        cells.push({ a0: aStart, a1: aStart + aLen, v0: rv0, v1: rv1, grip: null, slot: "appliance", appliance });
        continue;
      }
      if (bayType === "open") {
        cells.push({ a0: aStart, a1: aStart + aLen, v0: rv0, v1: rv1, grip: null, slot: "open" });
        continue;
      }
      let acc = aStart;
      for (let c = 0; c < cols; c++) {
        const a0 = acc;
        const a1 = acc + aLen * ((Number(ratios[c]) || 0) / total);
        acc = a1;
        // Grip at the top under bench height (you look down at it), bottom above.
        const grip = gripped ? (((rv0 + rv1) / 2 <= BENCH_HEIGHT_MM) ? "top" : "bottom") : null;
        cells.push({ a0, a1, v0: rv0, v1: rv1, grip, slot: "door" });
      }
    }
  };
  const addDrawers = (cells, cfg, v0, v1, aStart, aLen) => {
    const heights = Array.isArray(cfg.heights_mm) && cfg.heights_mm.length ? cfg.heights_mm : [1];
    const totalH = heights.reduce((s, h) => s + (Number(h) || 0), 0) || 1;
    const gripped = drawerGapMm(cfg) > 0;
    let cursor = v1; // stack from the top down
    for (const h of heights) {
      const dv1 = cursor;
      const dv0 = cursor - (v1 - v0) * ((Number(h) || 0) / totalH);
      cursor = dv0;
      cells.push({ a0: aStart, a1: aStart + aLen, v0: dv0, v1: dv1, grip: gripped ? "top" : null, slot: "drawer" });
    }
  };

  // A corner cabinet: one bi-fold leaf per leg. Each leaf covers the leg minus
  // the depth-square at the inner corner, so it sits at the outer end.
  if (item.item_type === "corner_base_cabinet") {
    if (ft !== "doors") return [];
    const cfg = item.door_config || {};
    const depth = item.depth_mm || 600;
    const grip = doorRowGapMm(cfg) > 0 ? (((bottomMm + topMm) / 2 <= BENCH_HEIGHT_MM) ? "top" : "bottom") : null;
    const groups = [];
    const legs = cabinetLegs(item, W, D);
    legs.forEach((leg, idx) => {
      const basis = faceBasis(leg);
      if (!basis) return;
      const alongLen = basis.alongAxis === "x" ? leg.rect.w : leg.rect.h;
      // The wall this leg corners WITH — its inner (doorless) end is on that side.
      const otherWall = idx === 0 ? item.secondary_wall : item.wall;
      const cornerLow = otherWall === "left" || otherWall === "top";
      const a0 = cornerLow ? depth : 0;
      const a1 = cornerLow ? alongLen : Math.max(0, alongLen - depth);
      if (a1 > a0) groups.push({ basis, cells: [{ a0, a1, v0: bottomMm, v1: topMm, grip, slot: "door" }] });
    });
    return groups;
  }

  const leg = cabinetLegs(item, W, D)[0];
  const basis = leg && faceBasis(leg);
  if (!basis) return [];
  const fullAlong = basis.alongAxis === "x" ? leg.rect.w : leg.rect.h;
  // A blind corner's door only covers the accessible part, opposite the blind
  // zone. blind_side is viewer-terms; the bottom/left walls mirror the along
  // axis, so map through that flip to land the opening on the right end.
  const doorAlong = item.item_type === "blind_corner_cabinet" ? frontWidthMm(item) : fullAlong;
  let alongStart = 0;
  if (item.item_type === "blind_corner_cabinet") {
    const flipped = leg.wall === "bottom" || leg.wall === "left";
    const blindLeft = (item.blind_side || "left") === "left";
    const doorHigh = blindLeft ? !flipped : flipped;
    alongStart = doorHigh ? Math.max(0, fullAlong - doorAlong) : 0;
  }

  const cells = [];
  if (ft === "doors") addDoors(cells, item.door_config || {}, bottomMm, topMm, alongStart, doorAlong);
  else if (ft === "drawers") addDrawers(cells, item.drawer_config || {}, bottomMm, topMm, alongStart, doorAlong);
  else if (ft === "mixed") {
    const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
    const totalH = sections.reduce((s, x) => s + (Number(x.height_mm) || 0), 0) || 1;
    let cursor = topMm;
    for (const sec of sections) {
      const sv1 = cursor;
      const sv0 = cursor - (topMm - bottomMm) * ((Number(sec.height_mm) || 0) / totalH);
      cursor = sv0;
      if (sec.type === "drawers") addDrawers(cells, sec.drawer || {}, sv0, sv1, alongStart, doorAlong);
      else if (sec.type === "doors") addDoors(cells, sec.door || {}, sv0, sv1, alongStart, doorAlong);
      // "open" sections carry no front
    }
  }
  return [{ basis, cells }];
}

// One coloured door/drawer front — a slab sitting PROUD of the carcass face
// (as a real overlay door does), its back flush with the face and its front
// standing off by DOOR_PANEL_THICKNESS. Critically it must NOT be coplanar with
// the carcass box's front face, or the two z-fight and shimmer as the camera
// moves. The outline lines are lifted just proud of the door face to match.
function DoorPanel({ basis, cell, src }) {
  const aC = (cell.a0 + cell.a1) / 2;
  const vC = (cell.v0 + cell.v1) / 2;
  const position = facePoint(basis, aC, vC, DOOR_PANEL_THICKNESS / 2);
  const aLen = Math.max((cell.a1 - cell.a0) / M, 0.001);
  const vLen = Math.max((cell.v1 - cell.v0) / M, 0.001);
  const size = basis.alongAxis === "x"
    ? [aLen, vLen, DOOR_PANEL_THICKNESS]
    : [DOOR_PANEL_THICKNESS, vLen, aLen];
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <PanelMaterial src={src} color="#e7e5e4" roughness={0.5} />
    </mesh>
  );
}

// A dark matte panel filling the carcass face behind the coloured door/drawer
// slabs. Because the slabs stand proud and are inset within their cell, this
// backing shows through the reveal gap around every front as a soft recessed
// shadow — the realistic overlay-door look — and replaces the schematic black
// outline when colours are on. Its front sits a few mm below the door face so
// the gap has genuine depth (a routed reveal), not a flat drawn line.
function RevealBacking({ basis, cell }) {
  const aC = (cell.a0 + cell.a1) / 2;
  const vC = (cell.v0 + cell.v1) / 2;
  const depth = Math.max(DOOR_PANEL_THICKNESS - 0.004, 0.002);
  const position = facePoint(basis, aC, vC, depth / 2);
  const aLen = Math.max((cell.a1 - cell.a0) / M, 0.001);
  const vLen = Math.max((cell.v1 - cell.v0) / M, 0.001);
  const size = basis.alongAxis === "x"
    ? [aLen, vLen, depth]
    : [depth, vLen, aLen];
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={CUTOUT_COLOR} roughness={0.95} />
    </mesh>
  );
}

// A schematic appliance sitting in a freed tall-cabinet bay — a recessed
// cavity plus a simple dark front (control strip + glass for an oven/microwave)
// so the 3D view shows "an appliance goes here" rather than a bare hole. Not a
// manufactured part; deliberately generic.
function ApplianceMesh({ basis, cell }) {
  const { a0, a1, v0, v1, appliance } = cell;
  const box = (ba0, ba1, bv0, bv1, off, depth, color, roughness, extra) => {
    if (ba1 <= ba0 || bv1 <= bv0) return null;
    const position = facePoint(basis, (ba0 + ba1) / 2, (bv0 + bv1) / 2, off);
    const aLen = Math.max((ba1 - ba0) / M, 0.001);
    const vLen = Math.max((bv1 - bv0) / M, 0.001);
    const size = basis.alongAxis === "x" ? [aLen, vLen, depth] : [depth, vLen, aLen];
    return (
      <mesh position={position}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={roughness} {...extra} />
      </mesh>
    );
  };
  const vH = v1 - v0;
  const parts = [];
  // Recessed cavity floor (dark), giving the opening visible depth.
  parts.push(box(a0, a1, v0, v1, -0.045, 0.006, "#2b2b2b", 0.9));
  if (appliance === "microwave") {
    parts.push(box(a0, a0 + (a1 - a0) * 0.66, v0 + vH * 0.1, v1 - vH * 0.1, -0.006, 0.02, "#1a1a1a", 0.35, { metalness: 0.3 }));
    parts.push(box(a0 + (a1 - a0) * 0.68, a1, v0 + vH * 0.1, v1 - vH * 0.1, -0.004, 0.02, "#4b4b4b", 0.6));
  } else if (appliance === "cooktop") {
    parts.push(box(a0, a1, v0, v1, -0.004, 0.016, "#232323", 0.4, { metalness: 0.4 }));
  } else {
    // Oven: control strip across the top, dark glass door below.
    parts.push(box(a0, a1, v1 - vH * 0.2, v1, -0.004, 0.022, "#4b4b4b", 0.6));
    parts.push(box(a0, a1, v0 + vH * 0.06, v1 - vH * 0.24, -0.006, 0.02, "#141414", 0.3, { metalness: 0.35 }));
  }
  return <>{parts.filter(Boolean).map((p, i) => <group key={i}>{p}</group>)}</>;
}

function FrontDetail({ item, W, D }) {
  const groups = frontGroups(item, W, D);
  // Door/drawer tiles for this cabinet — "" when colours are off or unresolved,
  // in which case no coloured panel is drawn and the front stays outlines-only.
  const doorSrc = usePanelSrc(item, "door");
  const drawerSrc = usePanelSrc(item, "drawer");
  if (!groups.length) return null;
  const inset = Math.max(frontRevealMm(item.door_config || item.drawer_config || {}) / 2, 2);
  const frame = [];
  const grips = [];
  const panels = [];
  const backings = [];
  const appliances = [];
  for (const { basis, cells } of groups) {
    for (const cell of cells) {
      const a0 = cell.a0 + inset, a1 = cell.a1 - inset, v0 = cell.v0 + inset, v1 = cell.v1 - inset;
      if (a1 <= a0 || v1 <= v0) continue;
      // Free bays: an appliance recess gets a schematic mock; "open" leaves the
      // carcass bare (no front, no outline) exactly like a mixed "open" section.
      if (cell.slot === "open") continue;
      if (cell.slot === "appliance") {
        appliances.push({ basis, cell: { a0, a1, v0, v1, appliance: cell.appliance } });
        continue;
      }
      const src = cell.slot === "drawer" ? drawerSrc : doorSrc;
      // When this cell has a coloured door slab, the lines ride just proud of
      // its front face; otherwise they sit on the carcass face as before.
      const lineOff = src ? DOOR_PANEL_THICKNESS + 0.002 : 0.006;
      const p = (a, v) => facePoint(basis, a, v, lineOff);
      // A coloured cell makes its seam with the recessed reveal (dark backing
      // in the gap), so the schematic black outline is dropped for it — the
      // finish reads realistically. Cells without a resolved colour keep the
      // outline as before, so they stay legible.
      if (!src) {
        frame.push(p(a0, v0), p(a1, v0), p(a1, v0), p(a1, v1), p(a1, v1), p(a0, v1), p(a0, v1), p(a0, v0));
      }
      if (cell.grip) {
        const gv = cell.grip === "top" ? v1 - 14 : v0 + 14;
        grips.push(p(a0 + 8, gv), p(a1 - 8, gv));
      }
      if (src) {
        panels.push({ basis, cell: { a0, a1, v0, v1 }, src });
        // Backing spans the FULL cell (uninset), so the inset proud door leaves
        // a dark shadow reveal on all four sides.
        backings.push({ basis, cell: { a0: cell.a0, a1: cell.a1, v0: cell.v0, v1: cell.v1 } });
      }
    }
  }
  if (!frame.length && !panels.length && !appliances.length) return null;
  return (
    <>
      {backings.map((bk, i) => <RevealBacking key={`bk-${i}`} basis={bk.basis} cell={bk.cell} />)}
      {panels.map((pnl, i) => <DoorPanel key={i} basis={pnl.basis} cell={pnl.cell} src={pnl.src} />)}
      {appliances.map((ap, i) => <ApplianceMesh key={`ap-${i}`} basis={ap.basis} cell={ap.cell} />)}
      {frame.length > 0 && <Line points={frame} segments color={FRONT_LINE_COLOR} lineWidth={1.4} />}
      {grips.length > 0 && <Line points={grips} segments color={GRIP_LINE_COLOR} lineWidth={2.4} />}
    </>
  );
}

// A glowing amber cage around the selected cabinet's footprint(s), slightly
// inflated so it hugs the outside. Non-interactive (raycast disabled) so it
// never steals a click from the cabinet underneath it.
function SelectionHighlight({ item, W, D }) {
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  const pad = 8;
  const noRaycast = () => null;
  return (
    <>
      {carcassRects(item, W, D).map((rect, i) => {
        const inflated = { x: rect.x - pad, y: rect.y - pad, w: rect.w + 2 * pad, h: rect.h + 2 * pad };
        const { position, size } = boxFromRect(inflated, bottomMm - pad, topMm + pad);
        return (
          <mesh key={i} position={position} raycast={noRaycast}>
            <boxGeometry args={size} />
            <meshBasicMaterial color={SELECT_COLOR} transparent opacity={0.1} depthWrite={false} />
            <Edges threshold={15} color={SELECT_COLOR} />
          </mesh>
        );
      })}
    </>
  );
}

// Shelves inside an OPEN cabinet (no door front) — horizontal boards at their
// configured heights, so an open shelving unit reads correctly. On a doored
// cabinet the shelves are hidden behind the front, so they're not drawn.
function shelfHeightsMm(item) {
  const qty = Number(item.shelf_qty) || 0;
  if (!qty) return [];
  if (Array.isArray(item.shelf_heights_mm) && item.shelf_heights_mm.length) {
    return item.shelf_heights_mm.map((h) => Number(h) || 0);
  }
  const H = Number(item.height_mm) || 720;
  return Array.from({ length: qty }, (_, i) => Math.round(((i + 1) * H) / (qty + 1)));
}

function ShelfMesh({ item, W, D }) {
  const src = usePanelSrc(item, "shelf");
  const color = useMonoColor(ITEM_COLORS[item.item_type] || "#888");
  if ((item.front_type || "none") !== "none") return null; // only visible when open
  const heights = shelfHeightsMm(item);
  if (!heights.length) return null;
  const carc = Number(item.carcass_thickness_mm) || 16;
  const t = Number(item.shelf_thickness_mm) || 16;
  const [bottomMm] = cabinetVerticalSpanMm(item);
  const legs = cabinetLegs(item, W, D);
  const meshes = [];
  legs.forEach((leg, li) => {
    // Shelf sits inside the carcass — inset from every side by the wall board.
    const r = leg.rect;
    const inner = { x: r.x + carc, y: r.y + carc, w: Math.max(1, r.w - 2 * carc), h: Math.max(1, r.h - 2 * carc) };
    heights.forEach((hMm, si) => {
      const yMm = bottomMm + hMm;
      const box = boxFromRect(inner, yMm - t / 2, yMm + t / 2);
      meshes.push({ key: `${li}-${si}`, box });
    });
  });
  return (
    <>
      {meshes.map((m) => (
        <mesh key={m.key} position={m.box.position}>
          <boxGeometry args={m.box.size} />
          <PanelMaterial src={src} color={color} roughness={0.75} />
        </mesh>
      ))}
    </>
  );
}

// A small label floating above each item, always facing the camera.
function ItemLabel({ item, W, D }) {
  const label = item.label || item.item_type?.replace(/_/g, " ");
  if (!label) return null;
  const rect = carcassRects(item, W, D)[0];
  if (!rect) return null;
  const [, topMm] = cabinetVerticalSpanMm(item);
  const pos = [(rect.x + rect.w / 2) / M, topMm / M + 0.06, (rect.y + rect.h / 2) / M];
  return (
    <Billboard position={pos}>
      <Text fontSize={0.055} color="#1c1c1a" anchorX="center" anchorY="bottom" outlineWidth={0.004} outlineColor="#ffffff">
        {label}
      </Text>
    </Billboard>
  );
}

// Exposes a capture API to the export modal: grab() renders the current view to
// a JPEG data URL; setAngle(preset) parks the camera at a named isometric angle
// first. Lives inside the Canvas so it can reach the renderer, camera and
// controls. Requires the Canvas's preserveDrawingBuffer so toDataURL works.
function CaptureRig({ onReady, center, dims }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  useEffect(() => {
    if (!onReady) return;
    const [cx, cy, cz] = center;
    const { w, h, d } = dims;
    const presets = {
      frontLeft: [cx - w * 0.85, cy + h * 1.1, cz + d * 1.45],
      frontRight: [cx + w * 0.85, cy + h * 1.1, cz + d * 1.45],
      front: [cx, cy + h * 0.7, cz + d * 2.0],
      top: [cx + 0.001, cy + Math.max(w, d) * 1.8, cz + 0.001],
    };
    onReady({
      // Render at high resolution for the PDF, not the small on-screen canvas
      // size (which would be blurry on a full page), then restore the display.
      grab: () => {
        const canvas = gl.domElement;
        const prevRatio = gl.getPixelRatio();
        const prevW = canvas.width;
        const prevH = canvas.height;
        const aspect = prevW / prevH || 1.5;
        const outW = 2400;
        const outH = Math.round(outW / aspect);
        gl.setPixelRatio(1);
        gl.setSize(outW, outH, false);
        camera.aspect = outW / outH;
        camera.updateProjectionMatrix();
        gl.render(scene, camera);
        const url = canvas.toDataURL("image/jpeg", 0.92);
        gl.setPixelRatio(prevRatio);
        gl.setSize(prevW / prevRatio, prevH / prevRatio, false);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        gl.render(scene, camera);
        return url;
      },
      setAngle: (preset) => {
        const p = presets[preset];
        if (!p) return;
        camera.position.set(p[0], p[1], p[2]);
        if (controls) { controls.target.set(cx, cy, cz); controls.update(); }
        else camera.lookAt(cx, cy, cz);
      },
    });
  }, [gl, scene, camera, controls, onReady, center, dims]);
  return null;
}

const WALL_BASE_OPACITY = 0.2;

function Room({ W, D, H, wallsVisible }) {
  const w = W / M, d = D / M, h = H / M;
  // Each wall with its OUTWARD normal (pointing away from the room). When the
  // camera is on a wall's outer side, that wall sits between you and the
  // cabinets, so we fade it out; the far walls stay for orientation.
  const walls = useMemo(() => [
    { pos: [w / 2, h / 2, 0],     size: [w, h, 0.02], normal: [0, 0, -1] }, // z = 0
    { pos: [w / 2, h / 2, d],     size: [w, h, 0.02], normal: [0, 0, 1] },  // z = D
    { pos: [0, h / 2, d / 2],     size: [0.02, h, d], normal: [-1, 0, 0] }, // x = 0
    { pos: [w, h / 2, d / 2],     size: [0.02, h, d], normal: [1, 0, 0] },  // x = W
  ], [w, d, h]);
  const matRefs = useRef([]);

  useFrame(({ camera }) => {
    for (let i = 0; i < walls.length; i++) {
      const mat = matRefs.current[i];
      if (!mat) continue;
      const { pos, normal } = walls[i];
      const dot = normal[0] * (camera.position.x - pos[0]) + normal[1] * (camera.position.y - pos[1]) + normal[2] * (camera.position.z - pos[2]);
      // dot > 0 → camera is outside this wall → it's in front of the room → fade.
      const target = !wallsVisible ? 0 : (dot > 0 ? 0 : WALL_BASE_OPACITY);
      mat.opacity += (target - mat.opacity) * 0.18; // ease toward target
    }
  });

  return (
    <group>
      {/* Floor */}
      <mesh position={[w / 2, -0.001, d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#e7e5e4" roughness={1} />
      </mesh>
      {walls.map((wall, i) => (
        <mesh key={i} position={wall.pos}>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial ref={(el) => { matRefs.current[i] = el; }} color="#d6d3d1" transparent opacity={WALL_BASE_OPACITY} roughness={1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function Design3DView({ room, items, onClose, colourImages, showColours, onToggleColours, selectedItemId, onSelectItem, onCaptureReady, mono = false, touch = false, showClose = true }) {
  const controlsRef = useRef();
  const [wallsVisible, setWallsVisible] = useState(true);
  // The hover handlers set a pointer cursor; make sure it doesn't linger if the
  // view closes while the cursor is over a cabinet.
  useEffect(() => () => { document.body.style.cursor = "auto"; }, []);
  const W = room?.width_mm || 4000;
  const D = room?.depth_mm || 3000;
  const H = room?.height_mm || 2400;
  const w = W / M, d = D / M, h = H / M;
  const center = [w / 2, h * 0.35, d / 2];

  // Only the item types that have a physical footprint — the plan filters
  // unplaced items the same way (item.wall must be set).
  const placed = (items || []).filter((i) => i.wall && ITEM_COLORS[i.item_type]);

  // Touch gets larger tap targets and pinch wording; desktop keeps the compact
  // overlay. Base style is shared so the three buttons stay visually identical.
  const btnBase = {
    padding: touch ? "10px 15px" : "6px 12px",
    fontSize: touch ? 13 : 12,
    minHeight: touch ? 40 : undefined,
    fontWeight: 600, cursor: "pointer",
    border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6,
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#f2f1ee" }}>
      <div style={{ position: "absolute", top: 12, left: 16, zIndex: 2, display: "flex", gap: 10, alignItems: "center", maxWidth: "45%" }}>
        {!touch && <span style={{ fontSize: 13, fontWeight: 600, color: "#1c1c1a" }}>3D view · {room?.name}</span>}
        <span style={{ fontSize: 11, color: "#78716c" }}>
          {touch ? "drag to orbit · pinch to zoom" : "drag to orbit · scroll to zoom · read-only"}
        </span>
      </div>
      <div style={{ position: "absolute", top: 12, right: 16, zIndex: 2, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setWallsVisible((v) => !v)}
          title="Show or hide the room walls (near walls fade automatically as you orbit)"
          style={{
            ...btnBase,
            background: wallsVisible ? "#fff" : "#1c1917",
            color: wallsVisible ? "#1c1c1a" : "#fff",
          }}
        >
          {wallsVisible ? "Walls on" : "Walls off"}
        </button>
        {onToggleColours && (
          <button
            type="button"
            onClick={onToggleColours}
            title="Paint cabinets with their real colour-library finishes"
            style={{
              ...btnBase,
              background: showColours ? "#1c1917" : "#fff",
              color: showColours ? "#fff" : "#1c1c1a",
            }}
          >
            {showColours ? "Colours on" : "Show colours"}
          </button>
        )}
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            style={{ ...btnBase, background: "#fff", color: "#1c1c1a" }}
          >
            Close 3D
          </button>
        )}
      </div>

      <Canvas
        shadows
        camera={{ position: [w * 1.15, h * 1.5, d * 1.5], fov: 45 }}
        style={{ width: "100%", height: "100%" }}
        // preserveDrawingBuffer lets the export modal read the rendered frame
        // back with toDataURL; without it the buffer is cleared before capture.
        gl={onCaptureReady ? { preserveDrawingBuffer: true } : undefined}
        // A click into empty space (floor, walls, background) deselects. This
        // fires only on a real click that hits no cabinet — a drag-to-orbit
        // isn't a click, so orbiting the camera never clears the selection.
        onPointerMissed={() => onSelectItem?.(null)}
        // Keep the scene alive across a lost WebGL context. Browsers cap the
        // number of live contexts (~16) and kill the oldest when exceeded —
        // which Fast Refresh triggers by remounting this canvas on every edit,
        // and which also happens in production when a laptop switches GPUs or a
        // tab is backgrounded. Calling preventDefault on the loss event is what
        // lets the browser fire 'restored', after which three re-initialises;
        // without it the context stays dead and the view goes blank.
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e) => e.preventDefault(), false);
        }}
      >
        <color attach="background" args={["#f2f1ee"]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[w, h * 2.5, d * 0.4]} intensity={1.1} />
        <directionalLight position={[-w * 0.4, h * 2, -d * 0.4]} intensity={0.4} />

        <Grid
          position={[w / 2, 0, d / 2]}
          args={[w * 2, d * 2]}
          cellSize={0.1}
          cellColor="#d6d3d1"
          sectionSize={1}
          sectionColor="#a8a29e"
          fadeDistance={Math.max(w, d) * 3}
          infiniteGrid={false}
        />
        <Room W={W} D={D} H={H} wallsVisible={wallsVisible} />
        {onCaptureReady && <CaptureRig onReady={onCaptureReady} center={center} dims={{ w, h, d }} />}

        {(() => {
          const scene = placed.map((item) => (
            <group
              key={item.id}
              // A genuine click (not an orbit drag — r3f only fires onClick when
              // the pointer barely moved) selects the cabinet, which drives the
              // right sidebar. stopPropagation so only the front-most cabinet
              // under the cursor is picked, not the ones behind it.
              onClick={(e) => { e.stopPropagation(); onSelectItem?.(item.id); }}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { document.body.style.cursor = "auto"; }}
            >
              {item.item_type === "floating_shelf" ? (
                <FloatingShelfMesh item={item} W={W} D={D} />
              ) : (
                <>
                  <CabinetMesh item={item} W={W} D={D} />
                  <KickboardMesh item={item} W={W} D={D} />
                  <FillerMesh item={item} room={room} items={placed} W={W} D={D} />
                  <EndPanelMesh item={item} W={W} D={D} />
                  <UndersidePanelMesh item={item} W={W} D={D} />
                  <BackPanelMesh item={item} W={W} D={D} />
                  <BenchtopMesh item={item} items={placed} W={W} D={D} />
                  <ShelfMesh item={item} W={W} D={D} />
                  <FrontDetail item={item} W={W} D={D} />
                </>
              )}
              {item.id === selectedItemId && <SelectionHighlight item={item} W={W} D={D} />}
              <ItemLabel item={item} W={W} D={D} />
            </group>
          ));
          return (
            <TextureErrorBoundary
              key={showColours ? "colours" : "flat"}
              fallback={<ColourCtx.Provider value={{ map: null, on: false, mono }}>{scene}</ColourCtx.Provider>}
            >
              <ColourCtx.Provider value={{ map: colourImages, on: !!showColours, mono }}>
                <Suspense fallback={null}>{scene}</Suspense>
              </ColourCtx.Provider>
            </TextureErrorBoundary>
          );
        })()}

        <OrbitControls
          ref={controlsRef}
          target={center}
          makeDefault
          enablePan
          minDistance={0.8}
          maxDistance={Math.max(w, d, h) * 4}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  );
}
