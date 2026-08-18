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
import { OrbitControls, OrthographicCamera, Billboard, Text, Grid, Line, Edges, useTexture } from "@react-three/drei";
import { resolveColourSrc } from "../../../../lib/pcd-colour-images";
import { normaliseFrontProfile } from "../../../../lib/pcd-front-profiles";

import {
  getAbsPos,
  cabinetFootprint,
  cornerSecondaryFootprint,
  islandEffectiveDims,
  islandOccupiedRect,
  frontEdgeFor,
  panelSideEdges,
} from "../../../../lib/pcd-plan-geometry";
import {
  cabinetVerticalSpanMm,
  islandVirtualWall,
  getWallAxisPos,
  kickboardHeightMm,
  kickboardIsInset,
  isCornerType,
  isCornerShaped,
} from "../../../../lib/pcd-kickboard-utils";
import { endPanelSpanMm, finishPanelVerticalSpanMm } from "../../../../lib/pcd-finishpanel-utils";
import { topPanelSideExtensionMm, topPanelThicknessMm } from "../../../../lib/pcd-toppanel-utils";
import { shelfRailConfig, CLEAT_THICKNESS_MM } from "../../../../lib/pcd-shelf-rail-utils";
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
import { doorRowGapMm, drawerGapMm, frontRevealMm, frontWidthMm, bayTypeForRow, openBaySections, bayShelfHeightsMm, frontPanelMode, frontPanelThicknessMm, FRONT_PANEL_MODE_INSET, FRONT_PANEL_MODE_OVER } from "../../../../lib/pcd-door-utils";

const M = 1000; // mm → metres

// Same palette the plan uses, so an item reads as the same thing in both views.
const ITEM_COLORS = {
  base_cabinet:  "#3b82f6",
  wall_cabinet:  "#22c55e",
  tall_cabinet:  "#f97316",
  corner_base_cabinet: "#0ea5e9",
  corner_tall_cabinet: "#0891b2",
  blind_corner_cabinet: "#06b6d4",
  bookcase:      "#65a30d",
  shelf_rail:    "#d946ef",
  floating_shelf: "#14b8a6",
  panel:         "#6b7280",
  scribe:        "#ec4899",
  obstruction:   "#57534e",
  window:        "#38bdf8",
  door_opening:  "#b45309",
  appliance:     "#64748b",
  brick_corner_pantry: "#a0522d",
};
const BENCHTOP_COLOR = "#787066";
const REVEAL_SHADOW_COLOR = "#3a332c";
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
  if (isCornerShaped(item) && item.secondary_wall) {
    const secondary = cornerSecondaryFootprint(item, W, D);
    if (secondary) legs.push({ rect: secondary, wall: item.secondary_wall });
  }
  return legs;
}

// The two endpoints (room-space mm) of a diagonal corner's chamfered front
// edge — the line the single diagonal door sits on. Mirrors the plan's
// cornerDiagonalFootprintPoints (the L outline minus its re-entrant vertex):
// these are the two points that flank the removed concave corner. `d` is the
// depth, `s` the secondary width; the primary footprint rect encodes the wall
// orientation (w/h already swapped for left/right walls).
function diagonalDoorEndpoints(item, W, D) {
  const r = cabinetFootprint(item, W, D);
  if (!r || !item.secondary_wall || item.secondary_wall === item.wall) return null;
  const { x, y, w, h } = r;
  const d = item.depth_mm || 600;
  const s = item.secondary_width_mm || 900;
  let p1, p2;
  switch (`${item.wall}:${item.secondary_wall}`) {
    case "top:left":     p1 = [x + w, y + h];     p2 = [x + d, y + s];     break;
    case "top:right":    p1 = [x + w, y + s];     p2 = [x + w - d, y + h]; break;
    case "bottom:left":  p1 = [x, y + h - s];     p2 = [x + d, y];         break;
    case "bottom:right": p1 = [x + w, y + h - s]; p2 = [x + w - d, y];     break;
    case "left:top":     p1 = [x + s, y];         p2 = [x + w, y + d];     break;
    case "left:bottom":  p1 = [x + w, y + h - d]; p2 = [x + s, y + h];     break;
    case "right:top":    p1 = [x, y + d];         p2 = [x + w - s, y];     break;
    case "right:bottom": p1 = [x + w - s, y + h]; p2 = [x, y + h - d];     break;
    default: return null;
  }
  return { p1: { x: p1[0], y: p1[1] }, p2: { x: p2[0], y: p2[1] } };
}

// The right triangle (room-mm) that fills the re-entrant NOTCH of a diagonal
// corner — the gap between the two leg boxes and the diagonal door. Its
// hypotenuse is the door line (p1→p2); its right-angle vertex is the L's
// concave corner. Filling it turns the two-box carcass into one solid pentagon
// body (with a visible top and bottom) instead of an open-cornered "L + door".
// The concave vertex is whichever of the two axis-aligned candidates lies
// inside BOTH legs (i.e. in the corner overlap square); the other candidate is
// the far bounding-box corner, outside the L.
function notchTriangle(item, W, D) {
  if (item.corner_style !== "diagonal") return null;
  const ep = diagonalDoorEndpoints(item, W, D);
  if (!ep) return null;
  const Rp = cabinetFootprint(item, W, D);
  const Rs = cornerSecondaryFootprint(item, W, D);
  if (!Rp || !Rs) return null;
  const c1 = { x: ep.p1.x, y: ep.p2.y };
  const c2 = { x: ep.p2.x, y: ep.p1.y };
  const inRect = (pt, r) => pt.x >= r.x - 1 && pt.x <= r.x + r.w + 1 && pt.y >= r.y - 1 && pt.y <= r.y + r.h + 1;
  const concave = (inRect(c1, Rp) && inRect(c1, Rs)) ? c1 : c2;
  return [ep.p1, concave, ep.p2];
}

// The vertical triangular prism (a declarative bufferGeometry — no `three`
// import, per the webpack note) that closes a diagonal corner's notch. Built
// non-indexed with normals computed on the geometry ref; double-sided so
// winding never matters. Rendered with the carcass material so it reads as one
// continuous body with the two leg boxes.
function DiagonalNotchFill({ item, W, D, color, src, opacity = 0.92 }) {
  const geoRef = useRef();
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  const tri = notchTriangle(item, W, D);
  const geoKey = tri
    ? `${bottomMm},${topMm},${tri.map((p) => `${Math.round(p.x)}:${Math.round(p.y)}`).join("|")}`
    : "none";
  const positions = useMemo(() => {
    if (!tri) return null;
    const yb = bottomMm / M, yt = topMm / M;
    const p = tri.map((pt) => [pt.x / M, pt.y / M]); // [x, z]
    const v = (i, y) => [p[i][0], y, p[i][1]];
    const A = v(0, yb), B = v(1, yb), C = v(2, yb);
    const A2 = v(0, yt), B2 = v(1, yt), C2 = v(2, yt);
    const faces = [
      A, C, B,            // bottom cap
      A2, B2, C2,         // top cap
      A, B, B2, A, B2, A2, // side A→B
      B, C, C2, B, C2, B2, // side B→C
      C, A, A2, C, A2, C2, // side C→A
    ];
    return new Float32Array(faces.flat());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey]);
  useEffect(() => { if (geoRef.current) geoRef.current.computeVertexNormals(); }, [geoKey]);
  if (!positions) return null;
  return (
    <mesh>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <PanelMaterial src={src} color={color} transparent opacity={opacity} roughness={0.7} depthWrite side={2} />
    </mesh>
  );
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
// Boards butt rather than overlap, which would z-fight.
//
// The SIDES run the full height, floor to top, and the top and bottom boards
// are captured between them. That's the standard box the cut list actually cuts
// (Left/Right Side = full height, Top/Bottom = width − 2 × board) and how an
// open unit reads in a room: two unbroken vertical panels running to the floor.
// This used to be built the other way up — full-width top and bottom boards
// with the sides squeezed between them — so the 3D showed a carcass nobody was
// cutting, and a bookcase's sides visibly stopped short of the floor.
//
// `withBack` is the carcass's own structural back (back_panel_included): a
// bookcase's solid back is the point of it, and switching it off has to show.
// `baseGapMm` lifts the BOTTOM board off the floor without shortening the
// sides — an inset plinth (bookcase), where the toe space is inside the box.
function openCarcassPanels(rect, wall, carc, bottomMm, topMm, withBack = true, backT = carc, baseGapMm = 0) {
  const { x, y, w, h } = rect;
  const floorMm = bottomMm + baseGapMm;
  const midB = floorMm + carc, midT = Math.max(topMm - carc, midB + 1);
  const bt = withBack ? backT : 0;
  const panels = [];
  // Top and bottom span only the gap between the sides, at each end of it.
  const capBoards = (inner) => {
    panels.push({ rect: inner, b: floorMm, t: midB }); // bottom
    panels.push({ rect: inner, b: midT, t: topMm });   // top
  };
  if (wall === "top" || wall === "bottom" || wall === "island") {
    panels.push({ rect: { x, y, w: carc, h }, b: bottomMm, t: topMm });                // left side
    panels.push({ rect: { x: x + w - carc, y, w: carc, h }, b: bottomMm, t: topMm });   // right side
    capBoards({ x: x + carc, y, w: Math.max(w - 2 * carc, 1), h });
    const backY = wall === "bottom" ? y + h - bt : y;
    if (withBack) panels.push({ rect: { x: x + carc, y: backY, w: Math.max(w - 2 * carc, 1), h: bt }, b: midB, t: midT }); // back
  } else {
    panels.push({ rect: { x, y, w, h: carc }, b: bottomMm, t: topMm });                // side
    panels.push({ rect: { x, y: y + h - carc, w, h: carc }, b: bottomMm, t: topMm });   // side
    capBoards({ x, y: y + carc, w, h: Math.max(h - 2 * carc, 1) });
    const backX = wall === "right" ? x + w - bt : x;
    if (withBack) panels.push({ rect: { x: backX, y: y + carc, w: bt, h: Math.max(h - 2 * carc, 1) }, b: midB, t: midT }); // back
  }
  return panels;
}

// How far an INSET plinth lifts the bottom board off the floor. Zero for every
// other cabinet, whose whole carcass is lifted onto its kickboard instead (that
// lift is kickboardOffsetMm, already folded into cabinetVerticalSpanMm).
function insetPlinthMm(item) {
  return kickboardIsInset(item) ? kickboardHeightMm(item) : 0;
}

// The carcass's own structural back board thickness — 0 when it has no back,
// so the shelves and the interior run the full depth instead of stopping short
// at a board that isn't there.
function backBoardMm(item) {
  if (item?.back_panel_included === false) return 0;
  return Number(item?.back_panel_thickness_mm) || Number(item?.carcass_thickness_mm) || 16;
}

// The interior an open cabinet's shelves fill: between the two sides, and from
// the open front back to the inside face of the back board. Shelves used to be
// inset by the board thickness on ALL four sides, which floated them off the
// back — on a bookcase you could see daylight behind every shelf.
function openInnerRect(rect, wall, carc, backT) {
  const { x, y, w, h } = rect;
  if (wall === "left" || wall === "right") {
    const inner = { x, y: y + carc, w: Math.max(1, w - backT), h: Math.max(1, h - 2 * carc) };
    return wall === "right" ? inner : { ...inner, x: x + backT };
  }
  const inner = { x: x + carc, y, w: Math.max(1, w - 2 * carc), h: Math.max(1, h - backT) };
  return wall === "bottom" ? inner : { ...inner, y: y + backT };
}

// A window drawn as a real glazed unit: a translucent glass pane, a perimeter
// frame and a cross mullion, built in a local frame on the wall's room face
// (local +X across the opening, +Y up from the sill, +Z out to the room) so it
// reads correctly whichever wall it's on — same basis as the appliance mesh.
function WindowMesh({ item, W, D, color }) {
  const rect = carcassRects(item, W, D)[0];
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  if (!rect) return null;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  let alongMm, cx, cz, rotY;
  if (wall === "bottom")     { alongMm = rect.w; cx = rect.x + rect.w / 2; cz = rect.y;              rotY = Math.PI; }
  else if (wall === "left")  { alongMm = rect.h; cx = rect.x + rect.w;     cz = rect.y + rect.h / 2; rotY = Math.PI / 2; }
  else if (wall === "right") { alongMm = rect.h; cx = rect.x;              cz = rect.y + rect.h / 2; rotY = -Math.PI / 2; }
  else                       { alongMm = rect.w; cx = rect.x + rect.w / 2; cz = rect.y + rect.h;     rotY = 0; }

  const a = alongMm / M;
  const hMet = Math.max(topMm - bottomMm, 1) / M;
  const half = a / 2;
  const glass = color || "#9ec6d8";
  const frameColor = "#e9ebed";
  const fw = Math.min(0.045, a * 0.08, hMet * 0.08); // frame bar width
  const ft = 0.06;                                    // frame proud of glass
  const bar = (key, x, y, sx, sy, z = 0.012, col = frameColor) => (
    <mesh key={key} position={[x, y, z]}>
      <boxGeometry args={[sx, sy, ft]} />
      <meshStandardMaterial color={col} roughness={0.5} metalness={0.2} />
    </mesh>
  );
  return (
    <group position={[cx / M, bottomMm / M, cz / M]} rotation={[0, rotY, 0]}>
      {/* glass pane, just behind the frame face */}
      <mesh position={[0, hMet / 2, 0]}>
        <boxGeometry args={[a, hMet, 0.02]} />
        <meshStandardMaterial color={glass} transparent opacity={0.4} roughness={0.05} metalness={0.1} />
      </mesh>
      {/* perimeter frame */}
      {bar("top", 0, hMet - fw / 2, a, fw)}
      {bar("bot", 0, fw / 2, a, fw)}
      {bar("lef", -half + fw / 2, hMet / 2, fw, hMet)}
      {bar("rig", half - fw / 2, hMet / 2, fw, hMet)}
      {/* cross mullion, a touch thinner and proud of the glass */}
      {bar("mv", 0, hMet / 2, fw * 0.6, hMet, 0.01)}
      {bar("mh", 0, hMet / 2, a, fw * 0.6, 0.01)}
    </group>
  );
}

// A doorway/opening — a subtle architrave frame plus reveals running back into
// the wall depth, with an OPEN (see-through) interior, so it reads as a hole in
// the wall rather than a solid coloured block. Floor-standing, no sill. Same
// front-face local frame as the window/appliance meshes.
function DoorwayMesh({ item, W, D }) {
  const rect = carcassRects(item, W, D)[0];
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  if (!rect) return null;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  let alongMm, depthMm, cx, cz, rotY;
  if (wall === "bottom")     { alongMm = rect.w; depthMm = rect.h; cx = rect.x + rect.w / 2; cz = rect.y;              rotY = Math.PI; }
  else if (wall === "left")  { alongMm = rect.h; depthMm = rect.w; cx = rect.x + rect.w;     cz = rect.y + rect.h / 2; rotY = Math.PI / 2; }
  else if (wall === "right") { alongMm = rect.h; depthMm = rect.w; cx = rect.x;              cz = rect.y + rect.h / 2; rotY = -Math.PI / 2; }
  else                       { alongMm = rect.w; depthMm = rect.h; cx = rect.x + rect.w / 2; cz = rect.y + rect.h;     rotY = 0; }

  const a = alongMm / M;
  const hMet = Math.max(topMm - bottomMm, 1) / M;
  const dep = Math.max(depthMm / M, 0.05);
  const half = a / 2;
  const jt = 0.045; // architrave bar width
  const frameColor = "#cfccc4";
  const revealColor = "#b7b4ac";
  const bar = (key, x, y, z, sx, sy, sz, col) => (
    <mesh key={key} position={[x, y, z]}>
      <boxGeometry args={[sx, sy, sz]} />
      <meshStandardMaterial color={col} roughness={0.85} />
    </mesh>
  );
  return (
    <group position={[cx / M, bottomMm / M, cz / M]} rotation={[0, rotY, 0]}>
      {/* Architrave (front, proud): two jambs + head, no sill. */}
      {bar("lj", -half - jt / 2, hMet / 2, 0.02, jt, hMet + jt, 0.03, frameColor)}
      {bar("rj", half + jt / 2, hMet / 2, 0.02, jt, hMet + jt, 0.03, frameColor)}
      {bar("hd", 0, hMet + jt / 2, 0.02, a + 2 * jt, jt, 0.03, frameColor)}
      {/* Reveals — the opening's inner faces going back into the wall depth, so
          the opening reads with real thickness (a hole, not a flat outline). */}
      {bar("lr", -half + 0.01, hMet / 2, -dep / 2, 0.02, hMet, dep, revealColor)}
      {bar("rr", half - 0.01, hMet / 2, -dep / 2, 0.02, hMet, dep, revealColor)}
      {bar("tr", 0, hMet - 0.01, -dep / 2, a, 0.02, dep, revealColor)}
      {/* Faint floor threshold across the opening. */}
      {bar("th", 0, 0.006, -dep / 2, a, 0.012, dep, revealColor)}
    </group>
  );
}

// A freestanding appliance drawn to read as that appliance, not a bare block.
// The stainless body is one box; the kind-specific detail is built in a local
// frame on the FRONT face (local +X across the front, +Y up from the floor, +Z
// out to the room) so doors/handles land correctly whatever wall it's on:
//   • fridge / freezer — single / double / French-door layout (door_config
//     .fridge_style) with reveal gaps + handles;
//   • dishwasher — a top control strip + a bar handle;
//   • rangehood — a canopy with a chimney flue running up to the ceiling.
function StandaloneApplianceMesh({ item, W, D, roomHmm, color, src }) {
  const rect = carcassRects(item, W, D)[0];
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  if (!rect) return null;
  const kind = item.appliance_kind || "fridge";
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;

  // Front-face frame: centre + Y-rotation so local +Z is the outward normal.
  let alongMm, depthMm, cx, cz, rotY;
  if (wall === "bottom")     { alongMm = rect.w; depthMm = rect.h; cx = rect.x + rect.w / 2; cz = rect.y;              rotY = Math.PI; }
  else if (wall === "left")  { alongMm = rect.h; depthMm = rect.w; cx = rect.x + rect.w;     cz = rect.y + rect.h / 2; rotY = Math.PI / 2; }
  else if (wall === "right") { alongMm = rect.h; depthMm = rect.w; cx = rect.x;              cz = rect.y + rect.h / 2; rotY = -Math.PI / 2; }
  else                       { alongMm = rect.w; depthMm = rect.h; cx = rect.x + rect.w / 2; cz = rect.y + rect.h;     rotY = 0; }

  const a = alongMm / M;
  const hMet = Math.max(topMm - bottomMm, 1) / M;
  const dMet = Math.max(depthMm, 1) / M;
  const steel = item.colour_hex || color || "#c7ccd1";
  const dark = "#5b6169";
  const metal = "#8a9099";
  const body = boxFromRect(rect, bottomMm, topMm);

  const vGap = (key, x, y0, y1) => (
    <mesh key={key} position={[x, (y0 + y1) / 2, 0.006]}>
      <boxGeometry args={[0.006, Math.max(y1 - y0, 0.001), 0.006]} />
      <meshStandardMaterial color={dark} roughness={0.85} />
    </mesh>
  );
  const hGap = (key, x0, x1, y) => (
    <mesh key={key} position={[(x0 + x1) / 2, y, 0.006]}>
      <boxGeometry args={[Math.max(x1 - x0, 0.001), 0.006, 0.006]} />
      <meshStandardMaterial color={dark} roughness={0.85} />
    </mesh>
  );
  const vHandle = (key, x, y0, y1) => (
    <mesh key={key} position={[x, (y0 + y1) / 2, 0.022]}>
      <boxGeometry args={[0.02, Math.max(y1 - y0, 0.01), 0.024]} />
      <meshStandardMaterial color={metal} roughness={0.35} metalness={0.6} />
    </mesh>
  );
  const hHandle = (key, x0, x1, y) => (
    <mesh key={key} position={[(x0 + x1) / 2, y, 0.022]}>
      <boxGeometry args={[Math.max(x1 - x0, 0.01), 0.02, 0.024]} />
      <meshStandardMaterial color={metal} roughness={0.35} metalness={0.6} />
    </mesh>
  );

  const details = [];
  if (kind === "fridge" || kind === "freezer") {
    const style = item.door_config?.fridge_style || "double";
    const inset = 0.03;
    if (style === "single") {
      const frz = hMet * 0.32;
      details.push(hGap("h", -a / 2 + inset, a / 2 - inset, frz));
      details.push(vHandle("hu", a / 2 - 0.06, frz + 0.1, hMet - 0.1));
      details.push(vHandle("hd", a / 2 - 0.06, 0.08, frz - 0.08));
    } else if (style === "french") {
      const midY = hMet * 0.45;
      details.push(hGap("h", -a / 2 + inset, a / 2 - inset, midY));
      details.push(vGap("v", 0, midY + 0.02, hMet - 0.02));
      details.push(vHandle("hl", -0.06, midY + 0.1, hMet - 0.1));
      details.push(vHandle("hr", 0.06, midY + 0.1, hMet - 0.1));
      details.push(hHandle("dr", -0.12, 0.12, midY - 0.08));
    } else { // double (side-by-side)
      details.push(vGap("v", 0, 0.02, hMet - 0.02));
      details.push(vHandle("hl", -0.06, 0.12, hMet - 0.12));
      details.push(vHandle("hr", 0.06, 0.12, hMet - 0.12));
    }
  } else if (kind === "dishwasher") {
    details.push(
      <mesh key="ctrl" position={[0, hMet - 0.03, 0.011]}>
        <boxGeometry args={[a * 0.94, 0.05, 0.014]} />
        <meshStandardMaterial color={metal} roughness={0.5} metalness={0.4} />
      </mesh>
    );
    details.push(hHandle("hh", -a * 0.35, a * 0.35, hMet - 0.1));
  } else if (kind === "rangehood") {
    details.push(
      <mesh key="lip" position={[0, 0.02, 0.011]}>
        <boxGeometry args={[a * 0.96, 0.04, 0.02]} />
        <meshStandardMaterial color={metal} roughness={0.5} metalness={0.5} />
      </mesh>
    );
  }

  const chimney = kind === "rangehood" ? (() => {
    const ceilY = (roomHmm - bottomMm) / M;
    const chimH = ceilY - hMet;
    if (chimH <= 0.02) return null;
    const chimW = Math.min(a * 0.42, 0.35);
    const chimD = Math.min(dMet * 0.6, 0.24);
    const backZ = -dMet + chimD / 2 + 0.005;
    return (
      <mesh position={[0, hMet + chimH / 2, backZ]}>
        <boxGeometry args={[chimW, chimH, chimD]} />
        <PanelMaterial src={src} color={steel} roughness={0.4} metalness={0.25} />
      </mesh>
    );
  })() : null;

  return (
    <>
      <mesh position={body.position}>
        <boxGeometry args={body.size} />
        <PanelMaterial src={src} color={steel} roughness={0.4} metalness={0.25} />
      </mesh>
      <group position={[cx / M, bottomMm / M, cz / M]} rotation={[0, rotY, 0]}>
        {details}
        {chimney}
      </group>
    </>
  );
}

function CabinetMesh({ item, W, D, roomHmm, elevationWall = null }) {
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
  // Windows & doorways render like an obstruction — a decorative block, no
  // carcass — but a window is translucent glass rather than a solid panel.
  // A bricked-in corner pantry: a solid decorative mass (the L-shaped brick
  // legs filling the corner) with a normal door on the chamfered diagonal
  // face. Never cabinetry — no carcass hollow, no drawer/door grid.
  if (item.item_type === "brick_corner_pantry") {
    return (
      <>
        {cabinetLegs(item, W, D).map((leg, i) => {
          const { position, size } = boxFromRect(leg.rect, bottomMm, topMm);
          return (
            <mesh key={i} position={position}>
              <boxGeometry args={size} />
              <PanelMaterial src={carcassSrc} color={color} roughness={0.95} />
            </mesh>
          );
        })}
        <DiagonalNotchFill item={item} W={W} D={D} color={color} src={carcassSrc} opacity={1} />
        <BrickPantryDoor item={item} W={W} D={D} />
      </>
    );
  }

  // A freestanding appliance — drawn to actually read as the appliance (fridge /
  // dishwasher / rangehood), not a bare block.
  if (item.item_type === "appliance") {
    return <StandaloneApplianceMesh item={item} W={W} D={D} roomHmm={roomHmm} color={color} src={carcassSrc} />;
  }

  // A window — a proper glazed unit: frame + cross mullion + glass, so it reads
  // like a window in the rendered elevation, not a flat blue rectangle.
  if (item.item_type === "window") {
    return <WindowMesh item={item} W={W} D={D} color={color} />;
  }

  // A doorway — an OPENING, not a solid block: a subtle architrave frame with
  // reveals into the wall depth and an open, see-through interior.
  if (item.item_type === "door_opening") {
    return <DoorwayMesh item={item} W={W} D={D} />;
  }

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
          openCarcassPanels(leg.rect, leg.wall, carc, bottomMm, topMm, item.back_panel_included !== false, backBoardMm(item), insetPlinthMm(item)).map((p, pi) => {
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
  // A fronted cabinet is a solid box — except where a bay of a MIXED front is
  // open. There you can see into the carcass, so that band is built from real
  // boards (sides, top, bottom, back) instead, and its shelves show inside it.
  // Left as one solid box, an open bay's shelves would be buried in it.
  const openBands = (item.front_type === "mixed" ? openBaySections(item) : [])
    .map((s) => ({ b: bottomMm + s.bottomMm, t: bottomMm + s.topMm }))
    .filter((s) => s.t > s.b);
  const solidBands = (() => {
    if (!openBands.length) return [{ b: bottomMm, t: topMm }];
    const sorted = [...openBands].sort((a, b) => a.b - b.b);
    const out = [];
    let cursor = bottomMm;
    for (const band of sorted) {
      if (band.b > cursor) out.push({ b: cursor, t: band.b });
      cursor = Math.max(cursor, band.t);
    }
    if (topMm > cursor) out.push({ b: cursor, t: topMm });
    return out;
  })();
  const carc = Number(item.carcass_thickness_mm) || 16;

  return (
    <>
      {carcassRects(item, W, D).map((rect, i) =>
        solidBands.map((band, bi) => {
          const { position, size } = boxFromRect(rect, band.b, band.t);
          return (
            <mesh key={`${i}-${bi}`} position={position}>
              <boxGeometry args={size} />
              <PanelMaterial src={carcassSrc} color={color} transparent opacity={opacity} roughness={0.7} depthWrite />
            </mesh>
          );
        })
      )}
      {/* The open bays, as real carcass boards you can see between. */}
      {openBands.length > 0 && cabinetLegs(item, W, D).map((leg, li) =>
        openBands.map((band, bi) =>
          openCarcassPanels(leg.rect, leg.wall, carc, band.b, band.t, item.back_panel_included !== false, backBoardMm(item)).map((p, pi) => {
            const box = boxFromRect(p.rect, p.b, p.t);
            return (
              <mesh key={`ob-${li}-${bi}-${pi}`} position={box.position}>
                <boxGeometry args={box.size} />
                <PanelMaterial src={carcassSrc} color={color} roughness={0.7} />
              </mesh>
            );
          })
        )
      )}
      {/* Diagonal corner: fill the notch so the body is one solid pentagon
          (visible top + bottom), not two L-boxes with an open gap. Skipped in a
          rendered elevation — head-on, that pentagon body reads as a busy 3D top
          above the door; the flat legs + diagonal door alone are cleaner. */}
      {isCornerType(item) && item.corner_style === "diagonal" && !elevationWall && (
        <DiagonalNotchFill item={item} W={W} D={D} color={color} src={carcassSrc} opacity={opacity} />
      )}
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
  // A freestanding cabinet is placed by its OWN x/y, not by a wall.
  //
  // This used to map island onto a virtual wall first and then position by that
  // wall, which put the top hard against whichever wall the rotation implied
  // while the cabinets stood out in the room. The island branch below was
  // unreachable, because `wall` was never "island" by the time it was tested.
  //
  // The virtual wall is still worked out, because the waterfall ends and the
  // cutouts need to know which way the run faces. It just does not decide where
  // the slab sits any more.
  const isIsland = item.wall === "island";
  const wall = isIsland ? islandVirtualWall(item) : item.wall;
  const depth = benchtopDepthMm(item);
  const start = run.startAxisPos ?? getWallAxisPos(item);
  const len = run.totalWidth;
  let rect;
  if (isIsland) {
    // Overhang on all four sides: an island is approached from every side, so
    // there is no back edge to sit flush against.
    //
    // Measured from the OCCUPIED rect, not the bare carcass, so a finished end
    // panel or a finished back is covered by the top rather than left standing
    // proud of it. islandOccupiedRect already accounts for both, and it is the
    // same rect collision and snapping use, so the top lands exactly where the
    // plan says the cabinet ends.
    const occupied = islandOccupiedRect(item);
    const o = benchtopOverhangMm(item);
    rect = { x: occupied.x - o, y: occupied.y - o, w: occupied.w + 2 * o, h: occupied.h + 2 * o };
  }
  else if (wall === "top")    rect = { x: start, y: 0, w: len, h: depth };
  else if (wall === "bottom") rect = { x: start, y: D - depth, w: len, h: depth };
  else if (wall === "left")   rect = { x: 0, y: start, w: depth, h: len };
  else if (wall === "right")  rect = { x: W - depth, y: start, w: depth, h: len };
  else                        rect = { x: start, y: 0, w: len, h: depth };
  return { rects: [rect], thickness, underside, item, wall, alongX: wall === "top" || wall === "bottom" };
}

function BenchtopMesh({ item, items, W, D }) {
  // Visual benchtop colour (design-tool only): a compact-laminate tile when
  // "show colours" is on and one is picked, otherwise a flat hex, otherwise the
  // default grey. usePanelSrc is a hook, so it's called before any early return.
  const benchtopSrc = usePanelSrc(item, "benchtop");
  const benchtopColor = useMonoColor(item.benchtop_colour_hex || BENCHTOP_COLOR);
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
  const topSurfaceY = (underside + thickness) / M;
  const cutWall = bt.wall || item.wall;
  const cuts = benchtopCutouts(item);
  const cutFixtures = cuts.map((cut, i) => {
    const aw = (alongX ? cut.width_mm : cut.depth_mm) / M;
    const ad = (alongX ? cut.depth_mm : cut.width_mm) / M;
    // Spread multiple cutouts along the cabinet run rather than stacking them.
    const frac = cuts.length > 1 ? (i + 1) / (cuts.length + 1) : 0.5;
    const alongPos = alongX ? cRect.x + cRect.w * frac : cRect.y + cRect.h * frac;
    const crossPos = alongX ? cRect.y + cRect.h / 2 : cRect.x + cRect.w / 2;
    return {
      key: i,
      type: cut.type,
      cx: (alongX ? alongPos : crossPos) / M,
      cz: (alongX ? crossPos : alongPos) / M,
      aw, ad,
    };
  });

  return (
    <>
      {slabRects.map((rect, i) => {
        // A corner benchtop is two leg slabs that OVERLAP at the corner square.
        // Their tops were coplanar — invisible when both were flat grey, but a
        // colour/texture makes them z-fight into stripes across the corner. Drop
        // each successive slab a hair so the first (primary leg) wins the overlap
        // cleanly; the ~0.5mm step at the join is imperceptible.
        const drop = i * 0.5;
        const slab = boxFromRect(rect, underside - drop, underside + thickness - drop);
        return (
          <mesh key={`slab-${i}`} position={slab.position}>
            <boxGeometry args={slab.size} />
            <PanelMaterial src={benchtopSrc} color={benchtopColor} roughness={0.35} metalness={0.05} />
          </mesh>
        );
      })}
      {waterfalls.map((w, i) => (
        <mesh key={`wf-${i}`} position={w.position}>
          <boxGeometry args={w.size} />
          <PanelMaterial src={benchtopSrc} color={benchtopColor} roughness={0.35} metalness={0.05} />
        </mesh>
      ))}
      {cutFixtures.map((c) => (
        c.type === "cooktop"
          ? <CooktopMesh key={`cut-${c.key}`} cx={c.cx} cz={c.cz} topY={topSurfaceY} aw={c.aw} ad={c.ad} />
          : <SinkMesh key={`cut-${c.key}`} cx={c.cx} cz={c.cz} topY={topSurfaceY} aw={c.aw} ad={c.ad} wall={cutWall} />
      ))}
    </>
  );
}

// A cooktop set into the benchtop: a black glass hob sitting just proud of the
// stone, with four burner rings printed on it. Reads as a cooktop from above
// (the main view a kitchen plan gets) rather than a flat red rectangle.
function CooktopMesh({ cx, cz, topY, aw, ad }) {
  const br = Math.min(aw, ad) * 0.16;
  const burners = [[-0.24, -0.22], [0.24, -0.22], [-0.24, 0.22], [0.24, 0.22]];
  return (
    <group position={[cx, topY, cz]}>
      <mesh position={[0, 0.006, 0]}>
        <boxGeometry args={[aw, 0.012, ad]} />
        <meshStandardMaterial color="#161618" roughness={0.15} metalness={0.2} />
      </mesh>
      {burners.map(([fx, fz], i) => (
        <mesh key={i} position={[fx * aw, 0.014, fz * ad]}>
          <cylinderGeometry args={[br, br, 0.003, 28]} />
          <meshStandardMaterial color="#3a3a3d" roughness={0.35} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// A sink set into the benchtop: a stainless rim flush with the stone, a recessed
// basin below, and a mixer tap standing at the back edge (toward the wall).
function SinkMesh({ cx, cz, topY, aw, ad, wall }) {
  const basinW = aw * 0.86, basinD = ad * 0.82, basinDepth = 0.16;
  // Tap sits ON the sink's back edge, reaching forward over the basin. The back
  // edge is along the axis PERPENDICULAR to the wall — Z for a top/bottom wall
  // (dim = ad), X for a left/right wall (dim = aw). Using the wrong one placed
  // the tap well off the side of the sink. Short deck fixture, not a tall post.
  const sideWall = wall === "left" || wall === "right";
  const perpDim = sideWall ? aw : ad;
  const edge = Math.max(0.02, perpDim * 0.5 - 0.02);
  const postH = 0.11;
  let tapX = 0, tapZ = 0, spoutAxis = "z", spoutSign = 1;
  if (wall === "top")         { tapZ = -edge; spoutAxis = "z"; spoutSign = 1; }
  else if (wall === "bottom") { tapZ = edge;  spoutAxis = "z"; spoutSign = -1; }
  else if (wall === "left")   { tapX = -edge; spoutAxis = "x"; spoutSign = 1; }
  else if (wall === "right")  { tapX = edge;  spoutAxis = "x"; spoutSign = -1; }
  else                        { tapZ = -edge; spoutAxis = "z"; spoutSign = 1; }
  // Low metalness so it reads as light chrome — a high-metal surface renders
  // near-black in this scene (no environment map to reflect).
  const chrome = "#d3d7db";
  const spoutLen = 0.07;
  const spoutPos = spoutAxis === "z" ? [tapX, postH, tapZ + spoutSign * spoutLen / 2] : [tapX + spoutSign * spoutLen / 2, postH, tapZ];
  const spoutSize = spoutAxis === "z" ? [0.018, 0.018, spoutLen] : [spoutLen, 0.018, 0.018];
  return (
    <group position={[cx, topY, cz]}>
      {/* stainless rim flush with the bench */}
      <mesh position={[0, 0.004, 0]}>
        <boxGeometry args={[aw, 0.01, ad]} />
        <meshStandardMaterial color="#b9bec4" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* recessed basin */}
      <mesh position={[0, -basinDepth / 2, 0]}>
        <boxGeometry args={[basinW, basinDepth, basinD]} />
        <meshStandardMaterial color="#8f959c" roughness={0.45} metalness={0.4} />
      </mesh>
      {/* mixer tap: short post + forward spout, on the back edge */}
      <mesh position={[tapX, postH / 2, tapZ]}>
        <cylinderGeometry args={[0.011, 0.011, postH, 16]} />
        <meshStandardMaterial color={chrome} roughness={0.3} metalness={0.4} />
      </mesh>
      <mesh position={spoutPos}>
        <boxGeometry args={spoutSize} />
        <meshStandardMaterial color={chrome} roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
}

// Toe-kick — fills the floor-to-carcass gap a kickboard leaves, set back from
// the front face so it reads as a recess. One panel per leg (corner = two).
//
// Two constructions. A kitchen cabinet sits ON its kickboard: the whole carcass
// is lifted and the board runs the full footprint width underneath it. A
// bookcase's plinth is INSET: the sides already run to the floor, so the board
// is a rail spanning only the gap between them, from the floor up to the
// raised bottom shelf — which is why it's drawn against the inner rect here.
function KickboardMesh({ item, W, D }) {
  // A kickboard matches the carcass by default, or its own override; otherwise
  // the dark toe-kick colour.
  const src = usePanelSrc(item, "kickboard");
  const kb = kickboardHeightMm(item);
  if (kb <= 0) return null;
  const inset = kickboardIsInset(item);
  const carc = Number(item.carcass_thickness_mm) || 16;
  const [bottomMm] = cabinetVerticalSpanMm(item);
  return (
    <>
      {cabinetLegs(item, W, D).map((leg, i) => {
        // Inset: a rail between the sides, set back, only a board thick — not a
        // filled block. Recess FIRST, then take the front edge, or the setback
        // would eat the board itself.
        const recessed = insetFront(inset ? openInnerRect(leg.rect, leg.wall, carc, 0) : leg.rect, leg.wall, KICKBOARD_RECESS_MM);
        const footprint = inset
          ? frontEdgeRect(recessed, leg.wall, Math.max(Number(item.kickboard_thickness_mm) || 16, 6))
          : recessed;
        // Inset sits on the floor UNDER the raised bottom shelf; the usual kind
        // fills the gap the lifted carcass left above the floor.
        const box = inset
          ? boxFromRect(footprint, bottomMm, bottomMm + kb)
          : boxFromRect(footprint, Math.max(bottomMm - kb, 0), bottomMm);
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

// A Shelf & Rail: a board spanning an opening on cleats, with an optional front
// rail dropping below its leading edge. Not a box — the cleats are the only
// thing under the shelf, so the underside reads open, exactly as it does on
// site. The shelf carries its own colour; the cleats and rail carry theirs.
function ShelfRailMesh({ item, W, D }) {
  const shelfSrc = usePanelSrc(item, "carcass");
  const color = useMonoColor(item.colour_hex || ITEM_COLORS.shelf_rail);
  const cfg = shelfRailConfig(item);
  const leg = cabinetLegs(item, W, D)[0];
  if (!leg) return null;
  const { rect, wall } = leg;
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  const shelfT = Number(item.carcass_thickness_mm) || 18;
  const cleatT = CLEAT_THICKNESS_MM;
  const shelfBottom = Math.max(topMm - shelfT, bottomMm);

  const boxes = [];
  // The shelf itself — full footprint, sitting at the top of the assembly.
  boxes.push({ key: "shelf", ...boxFromRect(rect, shelfBottom, topMm), src: shelfSrc, color });

  // Cleats hang in the rail zone below the shelf.
  const railTop = shelfBottom;
  const railBottom = bottomMm;
  if (cfg.back_cleat) {
    boxes.push({ key: "cleat-back", ...boxFromRect(backEdgeRect(rect, wall, cleatT), railBottom, railTop), src: shelfSrc, color });
  }
  if (cfg.end_cleat_left) {
    boxes.push({ key: "cleat-l", ...boxFromRect(endStripRect(rect, wall === "left" || wall === "right" ? "top" : "left", cleatT), railBottom, railTop), src: shelfSrc, color });
  }
  if (cfg.end_cleat_right) {
    boxes.push({ key: "cleat-r", ...boxFromRect(endStripRect(rect, wall === "left" || wall === "right" ? "bottom" : "right", cleatT), railBottom, railTop), src: shelfSrc, color });
  }
  if (cfg.front_rail.on) {
    // Set back from the front edge, so there's a shadow line under the shelf.
    boxes.push({ key: "front-rail", ...boxFromRect(frontEdgeRect(insetFront(rect, wall, cfg.front_rail.setback_mm), wall, cleatT), railBottom, railTop), src: shelfSrc, color });
  }

  return (
    <>
      {boxes.map((b) => (
        <mesh key={b.key} position={b.position}>
          <boxGeometry args={b.size} />
          <PanelMaterial src={b.src} color={b.color} roughness={0.7} />
        </mesh>
      ))}
    </>
  );
}

// A thin slab hugging the BACK edge of a footprint — the mirror of
// frontEdgeRect, for a cleat against the wall the item backs onto.
function backEdgeRect(rect, wall, t) {
  switch (wall) {
    case "top":    return { x: rect.x, y: rect.y, w: rect.w, h: t };
    case "bottom": return { x: rect.x, y: rect.y + rect.h - t, w: rect.w, h: t };
    case "left":   return { x: rect.x, y: rect.y, w: t, h: rect.h };
    case "right":  return { x: rect.x + rect.w - t, y: rect.y, w: t, h: rect.h };
    default:       return { x: rect.x, y: rect.y, w: rect.w, h: t };
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
function EndPanelMesh({ item, room, W, D }) {
  const src = usePanelSrc(item, "endpanel");
  const color = useMonoColor(item.colour_hex || ITEM_COLORS[item.item_type] || "#888");
  if (item.item_type === "obstruction" || (!item.end_panel_left && !item.end_panel_right)) return null;
  // Shared vertical span so the 3D end/side panel matches the quote and the
  // elevation: extends past a finished underside (wall), down to the floor
  // (panel_to_floor) and up to the ceiling (panel_to_ceiling).
  const { bottomMm, topMm } = finishPanelVerticalSpanMm(item, room?.height_mm);
  const t = Number(item.finish_panel_style?.thickness_mm) || 18;
  const frontProjection = frontPanelMode(item) === FRONT_PANEL_MODE_INSET ? frontPanelThicknessMm(item) : 0;

  const edges = [];
  if (isCornerType(item)) {
    // Corner: a board on each leg's exposed OUTER end (the end away from the
    // room corner). end_panel_left = Wall 1 (primary) leg, end_panel_right =
    // Wall 2 (secondary). The corner sits toward the OTHER leg's wall, so the
    // outer end is the opposite end of this leg.
    const legs = cabinetLegs(item, W, D);
    const outerEdge = (legWall, cornerWall) =>
      (legWall === "top" || legWall === "bottom")
        ? (cornerWall === "left" ? "right" : "left")
        : (cornerWall === "top" ? "bottom" : "top");
    if (item.end_panel_left && legs[0]) edges.push(extendFront(edgeBoardRect(legs[0].rect, outerEdge(legs[0].wall, item.secondary_wall), t), legs[0].wall, frontProjection));
    if (item.end_panel_right && legs[1]) edges.push(extendFront(edgeBoardRect(legs[1].rect, outerEdge(legs[1].wall, item.wall), t), legs[1].wall, frontProjection));
  } else {
    const { leftEdge, rightEdge } = panelSideEdges(item);
    const rect = cabinetLegs(item, W, D)[0]?.rect;
    if (!rect) return null;
    if (item.end_panel_left) edges.push(extendFront(edgeBoardRect(rect, leftEdge, t), item.wall, frontProjection));
    if (item.end_panel_right) edges.push(extendFront(edgeBoardRect(rect, rightEdge, t), item.wall, frontProjection));
  }
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

// Attached side fillers — the board that closes the gap beside a cabinet, at
// the measured gap width. Same edge anchor and vertical span as an end panel
// (so run-to-floor / run-to-ceiling carry through), but the board's along-wall
// dimension is the gap width, not a thin thickness. Rendered in the filler
// amber so it reads as infill rather than a finished end.
function SideFillerMesh({ item, room, W, D }) {
  const src = usePanelSrc(item, "endpanel");
  const color = useMonoColor(item.colour_hex || ITEM_COLORS[item.item_type] || "#888");
  if (item.item_type === "obstruction" || (!item.side_filler_left && !item.side_filler_right)) return null;
  const { leftEdge, rightEdge } = panelSideEdges(item);
  const { bottomMm, topMm } = finishPanelVerticalSpanMm(item, room?.height_mm);
  const rect = cabinetLegs(item, W, D)[0]?.rect;
  if (!rect) return null;
  const lw = Number(item.side_filler_left_width_mm) || 0;
  const rw = Number(item.side_filler_right_width_mm) || 0;
  const boards = [];
  if (item.side_filler_left && lw > 0)  boards.push(edgeBoardRect(rect, leftEdge, lw));
  if (item.side_filler_right && rw > 0) boards.push(edgeBoardRect(rect, rightEdge, rw));
  return (
    <>
      {boards.filter(Boolean).map((r, i) => {
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
// wall cabinet, matching the finished panel/door colour unless overridden.
function UndersidePanelMesh({ item, W, D }) {
  const src = usePanelSrc(item, "underside");
  const color = useMonoColor(item.colour_hex || ITEM_COLORS[item.item_type] || "#888");
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

// Finished TOP panel — an applied board sitting over a wall cabinet. If the
// cabinet has finished side panels, the top footprint extends over them too.
function TopPanelMesh({ item, W, D }) {
  const src = usePanelSrc(item, "top");
  const color = useMonoColor(item.colour_hex || ITEM_COLORS[item.item_type] || "#888");
  if (!item.has_top_panel || item.item_type !== "wall_cabinet") return null;
  const t = topPanelThicknessMm(item);
  if (t <= 0) return null;
  const [, topMm] = cabinetVerticalSpanMm(item);
  return (
    <>
      {cabinetLegs(item, W, D).map((leg, i) => {
        const { lowT, highT } = topPanelSideExtensionMm(item, leg.wall);
        const rect = { ...leg.rect };
        if (leg.wall === "top" || leg.wall === "bottom") {
          rect.x -= lowT;
          rect.w += lowT + highT;
        } else {
          rect.y -= lowT;
          rect.h += lowT + highT;
        }
        const hasFront = ["doors", "drawers", "mixed"].includes(item.front_type || "none");
        const topRect = extendFront(rect, leg.wall, hasFront ? frontPanelThicknessMm(item) : 0);
        const box = boxFromRect(topRect, topMm, topMm + t);
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
  const color = useMonoColor(item.colour_hex || ITEM_COLORS[item.item_type] || "#888");
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
  if (isCornerType(item)) {
    if (ft !== "doors") return [];
    // Diagonal corner: a single flat door on the angled face — rendered by
    // DiagonalDoorMesh (a rotated slab), not the axis-aligned bi-fold leaves.
    if (item.corner_style === "diagonal") return [];
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
  const overlaySpan = frontPanelMode(item) === FRONT_PANEL_MODE_OVER ? endPanelSpanMm(item, leg.wall) : { lowT: 0, highT: 0 };
  // A blind corner's door only covers the accessible part, opposite the blind
  // zone. blind_side is viewer-terms; the bottom/left walls mirror the along
  // axis, so map through that flip to land the opening on the right end.
  const doorAlongBase = item.item_type === "blind_corner_cabinet" ? frontWidthMm(item) : fullAlong;
  const doorAlong = doorAlongBase + overlaySpan.lowT + overlaySpan.highT;
  let alongStart = -overlaySpan.lowT;
  if (item.item_type === "blind_corner_cabinet") {
    const flipped = leg.wall === "bottom" || leg.wall === "left";
    const blindLeft = (item.blind_side || "left") === "left";
    const doorHigh = blindLeft ? !flipped : flipped;
    alongStart = (doorHigh ? Math.max(0, fullAlong - doorAlongBase) : 0) - overlaySpan.lowT;
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
      else if (sec.type === "appliance") cells.push({ a0: alongStart, a1: alongStart + doorAlong, v0: sv0, v1: sv1, grip: null, slot: "appliance", appliance: sec.appliance || "oven" });
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
function ProfileFeatureBox({ basis, a0, a1, v0, v1, depth = 0.006, offset = DOOR_PANEL_THICKNESS, src, color = "#d7d3ca", roughness = 0.55, dark = false }) {
  if (a1 <= a0 || v1 <= v0) return null;
  const position = facePoint(basis, (a0 + a1) / 2, (v0 + v1) / 2, offset + depth / 2);
  const aLen = Math.max((a1 - a0) / M, 0.001);
  const vLen = Math.max((v1 - v0) / M, 0.001);
  const size = basis.alongAxis === "x"
    ? [aLen, vLen, depth]
    : [depth, vLen, aLen];
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      {dark ? (
        <meshStandardMaterial color={color} roughness={0.8} />
      ) : (
        <PanelMaterial src={src} color={color} roughness={roughness} />
      )}
    </mesh>
  );
}

function FrontProfileGeometry({ basis, cell, src, profile }) {
  const key = normaliseFrontProfile(profile);
  if (key === "slab") return null;

  const w = cell.a1 - cell.a0;
  const h = cell.v1 - cell.v0;
  if (w <= 80 || h <= 80) return null;

  const parts = [];
  const rail = Math.max(28, Math.min(62, Math.min(w, h) * 0.12));
  const inset = Math.max(30, Math.min(70, Math.min(w, h) * 0.14));
  const groove = 8;

  if (key === "shaker") {
    parts.push(
      { a0: cell.a0, a1: cell.a1, v0: cell.v1 - rail, v1: cell.v1 },
      { a0: cell.a0, a1: cell.a1, v0: cell.v0, v1: cell.v0 + rail },
      { a0: cell.a0, a1: cell.a0 + rail, v0: cell.v0, v1: cell.v1 },
      { a0: cell.a1 - rail, a1: cell.a1, v0: cell.v0, v1: cell.v1 }
    );
    return <>{parts.map((p, i) => <ProfileFeatureBox key={i} basis={basis} {...p} depth={0.006} src={src} />)}</>;
  }

  if (key === "bevel") {
    parts.push(
      { a0: cell.a0 + inset, a1: cell.a1 - inset, v0: cell.v1 - inset - groove, v1: cell.v1 - inset },
      { a0: cell.a0 + inset, a1: cell.a1 - inset, v0: cell.v0 + inset, v1: cell.v0 + inset + groove },
      { a0: cell.a0 + inset, a1: cell.a0 + inset + groove, v0: cell.v0 + inset, v1: cell.v1 - inset },
      { a0: cell.a1 - inset - groove, a1: cell.a1 - inset, v0: cell.v0 + inset, v1: cell.v1 - inset }
    );
    return <>{parts.map((p, i) => <ProfileFeatureBox key={i} basis={basis} {...p} depth={0.003} offset={DOOR_PANEL_THICKNESS + 0.001} color="#7b746b" dark />)}</>;
  }

  return null;
}

function DoorPanel({ basis, cell, src, profile }) {
  const aC = (cell.a0 + cell.a1) / 2;
  const vC = (cell.v0 + cell.v1) / 2;
  const position = facePoint(basis, aC, vC, DOOR_PANEL_THICKNESS / 2);
  const aLen = Math.max((cell.a1 - cell.a0) / M, 0.001);
  const vLen = Math.max((cell.v1 - cell.v0) / M, 0.001);
  const size = basis.alongAxis === "x"
    ? [aLen, vLen, DOOR_PANEL_THICKNESS]
    : [DOOR_PANEL_THICKNESS, vLen, aLen];
  return (
    <>
      <mesh position={position}>
        <boxGeometry args={size} />
        <PanelMaterial src={src} color="#e7e5e4" roughness={0.5} />
      </mesh>
      <FrontProfileGeometry basis={basis} cell={cell} src={src} profile={profile} />
    </>
  );
}

// The single flat door on a DIAGONAL corner's angled face — a standalone slab
// centred on the chamfer line and rotated about the vertical axis to lie along
// it. The other doors use the axis-locked faceBasis, but a diagonal face isn't
// parallel to any wall, so this one is placed and rotated directly.
function DiagonalDoorMesh({ item, W, D }) {
  const src = usePanelSrc(item, "door");
  if (!isCornerType(item) || item.corner_style !== "diagonal" || (item.front_type || "none") !== "doors") return null;
  const ep = diagonalDoorEndpoints(item, W, D);
  if (!ep) return null;
  const dx = ep.p2.x - ep.p1.x;
  const dy = ep.p2.y - ep.p1.y;
  const L = Math.hypot(dx, dy);
  if (L <= 1) return null;
  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  const t = Number(item.door_style?.thickness_mm) || 18;
  const position = [
    (ep.p1.x + ep.p2.x) / 2 / M,
    (bottomMm + (topMm - bottomMm) / 2) / M,
    (ep.p1.y + ep.p2.y) / 2 / M,
  ];
  // three.js +Y rotation maps local +X to (cos, 0, -sin); align it with the
  // chamfer direction (dx, dz=dy) → rotY = atan2(-dy, dx).
  const rotY = Math.atan2(-dy, dx);
  return (
    <mesh position={position} rotation={[0, rotY, 0]}>
      <boxGeometry args={[L / M, Math.max(topMm - bottomMm, 1) / M, t / M]} />
      <PanelMaterial src={src} color="#e7e5e4" roughness={0.5} />
    </mesh>
  );
}

// A proper bricked-in door on the pantry's diagonal face: an architrave frame
// (two jambs + head) with a door leaf and a handle, sized by door_config
// (width_mm/height_mm/handle_side) and CENTRED on the diagonal wall. Width and
// height default to an auto fit when unset. Everything is built in a local
// frame rotated onto the diagonal plane — local +X runs along the diagonal
// (door centred at x=0), +Y is up from the floor, +Z faces the room. rotY is
// flipped by π when needed so the frame/leaf/handle sit on the room side, not
// buried in the brick.
function BrickPantryDoor({ item, W, D }) {
  const doorSrc = usePanelSrc(item, "door");
  const ep = diagonalDoorEndpoints(item, W, D);
  if (!ep) return null;
  const dx = ep.p2.x - ep.p1.x;
  const dy = ep.p2.y - ep.p1.y;
  const L = Math.hypot(dx, dy);
  if (L <= 1) return null;

  const [bottomMm, topMm] = cabinetVerticalSpanMm(item);
  const wallHmm = Math.max(topMm - bottomMm, 1);

  const cfg = item.door_config || {};
  const frameMm = 60; // architrave width on each side / head
  const maxDoorWmm = Math.max(200, L - 2 * frameMm - 20);
  const maxDoorHmm = Math.max(300, wallHmm - frameMm - 20);
  const autoWmm = Math.min(820, maxDoorWmm);
  const autoHmm = Math.min(2040, maxDoorHmm);
  const doorWmm = Math.min(Math.max(Number(cfg.width_mm) || autoWmm, 150), maxDoorWmm);
  const doorHmm = Math.min(Math.max(Number(cfg.height_mm) || autoHmm, 250), maxDoorHmm);
  const handleRight = cfg.handle_side === "right";

  // Orient so local +Z faces the room. The candidate normal for rotY below is
  // (-dy, dx) in room space; if it points away from the room centre, flip.
  const midX = (ep.p1.x + ep.p2.x) / 2;
  const midY = (ep.p1.y + ep.p2.y) / 2;
  let rotY = Math.atan2(-dy, dx);
  if ((-dy) * (W / 2 - midX) + dx * (D / 2 - midY) < 0) rotY += Math.PI;

  // metres
  const dwm = doorWmm / M, dhm = doorHmm / M, frameW = frameMm / M;
  const leafZ = 0.014;   // door face proud of the brick diagonal
  const frameZ = 0.024;  // architrave stands a touch further out
  const groupPos = [midX / M, bottomMm / M, midY / M];

  const frameColor = "#f2efe8";
  const doorColor = "#e9e5dd";
  const handleColor = "#b0893f";
  // +Z faces the room, so a viewer looks along -Z with +X to their right
  // (standard camera basis) — handle "right" → local +X, "left" → local -X.
  const handleX = (handleRight ? 1 : -1) * (dwm / 2 - 0.06);
  const handleY = Math.min(1.0, dhm - 0.15);

  return (
    <group position={groupPos} rotation={[0, rotY, 0]}>
      {/* Architrave: left jamb, right jamb, head. */}
      <mesh position={[-(dwm / 2 + frameW / 2), dhm / 2, frameZ]}>
        <boxGeometry args={[frameW, dhm + frameW, 0.035]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} />
      </mesh>
      <mesh position={[dwm / 2 + frameW / 2, dhm / 2, frameZ]}>
        <boxGeometry args={[frameW, dhm + frameW, 0.035]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} />
      </mesh>
      <mesh position={[0, dhm + frameW / 2, frameZ]}>
        <boxGeometry args={[dwm + 2 * frameW, frameW, 0.035]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} />
      </mesh>
      {/* Door leaf. */}
      <mesh position={[0, dhm / 2, leafZ]}>
        <boxGeometry args={[dwm, dhm, 0.02]} />
        <PanelMaterial src={doorSrc} color={doorColor} roughness={0.5} />
      </mesh>
      {/* Lever handle. */}
      <mesh position={[handleX, handleY, leafZ + 0.02]}>
        <boxGeometry args={[0.02, 0.12, 0.03]} />
        <meshStandardMaterial color={handleColor} roughness={0.35} metalness={0.6} />
      </mesh>
    </group>
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
  // Keep this as a shallow shadow plane. If it is almost as thick as the
  // drawer/door slab it reads from oblique angles as a solid black board.
  const depth = 0.004;
  const position = facePoint(basis, aC, vC, depth / 2);
  const aLen = Math.max((cell.a1 - cell.a0) / M, 0.001);
  const vLen = Math.max((cell.v1 - cell.v0) / M, 0.001);
  const size = basis.alongAxis === "x"
    ? [aLen, vLen, depth]
    : [depth, vLen, aLen];
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={REVEAL_SHADOW_COLOR} roughness={0.95} />
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
  const aw = a1 - a0;
  const parts = [];
  // Recessed cavity floor (dark), giving the opening visible depth.
  parts.push(box(a0, a1, v0, v1, -0.045, 0.006, "#2b2b2b", 0.9));
  if (appliance === "microwave") {
    parts.push(box(a0, a0 + aw * 0.66, v0 + vH * 0.1, v1 - vH * 0.1, -0.006, 0.02, "#1a1a1a", 0.35, { metalness: 0.3 }));
    parts.push(box(a0 + aw * 0.68, a1, v0 + vH * 0.1, v1 - vH * 0.1, -0.004, 0.02, "#4b4b4b", 0.6));
  } else if (appliance === "cooktop") {
    parts.push(box(a0, a1, v0, v1, -0.004, 0.016, "#232323", 0.4, { metalness: 0.4 }));
  } else {
    // Oven: control strip + knobs across the top, black glass door with a
    // window and a proud stainless handle bar below.
    parts.push(box(a0, a1, v1 - vH * 0.2, v1, -0.004, 0.022, "#4b4b4b", 0.6));
    parts.push(box(a0, a1, v0 + vH * 0.06, v1 - vH * 0.24, -0.006, 0.02, "#141414", 0.3, { metalness: 0.35 }));
    parts.push(box(a0 + aw * 0.16, a1 - aw * 0.16, v0 + vH * 0.14, v1 - vH * 0.36, -0.002, 0.01, "#26262a", 0.2, { metalness: 0.4 }));
    parts.push(box(a0 + aw * 0.12, a1 - aw * 0.12, v1 - vH * 0.30, v1 - vH * 0.26, 0.012, 0.02, "#9aa0a6", 0.35, { metalness: 0.6 }));
  }
  return <>{parts.filter(Boolean).map((p, i) => <group key={i}>{p}</group>)}</>;
}

function FrontDetail({ item, W, D }) {
  const groups = frontGroups(item, W, D);
  // Door/drawer tiles for this cabinet — "" when colours are off or unresolved,
  // in which case no coloured panel is drawn and the front stays outlines-only.
  const doorSrc = usePanelSrc(item, "door");
  const drawerSrc = usePanelSrc(item, "drawer");
  const doorProfile = item.door_style?.front_profile || "slab";
  const drawerProfile = item.drawer_style?.front_profile || doorProfile;
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
      const isDrawer = cell.slot === "drawer";
      const src = isDrawer ? drawerSrc : doorSrc;
      const profile = isDrawer ? drawerProfile : doorProfile;
      const hasFrontPanel = Boolean(src || normaliseFrontProfile(profile) !== "slab");
      // When this cell has a coloured door slab, the lines ride just proud of
      // its front face; otherwise they sit on the carcass face as before.
      const lineOff = hasFrontPanel ? DOOR_PANEL_THICKNESS + 0.002 : 0.006;
      const p = (a, v) => facePoint(basis, a, v, lineOff);
      // A coloured cell makes its seam with the recessed reveal (dark backing
      // in the gap), so the schematic black outline is dropped for it — the
      // finish reads realistically. Cells without a resolved colour keep the
      // outline as before, so they stay legible.
      if (!hasFrontPanel) {
        frame.push(p(a0, v0), p(a1, v0), p(a1, v0), p(a1, v1), p(a1, v1), p(a0, v1), p(a0, v1), p(a0, v0));
      }
      if (cell.grip) {
        const gv = cell.grip === "top" ? v1 - 14 : v0 + 14;
        grips.push(p(a0 + 8, gv), p(a1 - 8, gv));
      }
      if (hasFrontPanel) {
        panels.push({ basis, cell: { a0, a1, v0, v1 }, src, profile });
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
      {panels.map((pnl, i) => <DoorPanel key={i} basis={pnl.basis} cell={pnl.cell} src={pnl.src} profile={pnl.profile} />)}
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
  const ft = item.front_type || "none";
  // A wholly open unit uses its own shelf list; a mixed front's shelves belong
  // to individual open bays and are spread inside those. Anything fronted has
  // its shelves hidden behind the door, so nothing is drawn.
  const heights = ft === "none" ? shelfHeightsMm(item)
    : ft === "mixed" ? bayShelfHeightsMm(item)
    : [];
  if (!heights.length) return null;
  const carc = Number(item.carcass_thickness_mm) || 16;
  const t = Number(item.shelf_thickness_mm) || 16;
  const [bottomMm] = cabinetVerticalSpanMm(item);
  const legs = cabinetLegs(item, W, D);
  const meshes = [];
  legs.forEach((leg, li) => {
    // Shelf sits between the sides and runs back to the back board.
    const inner = openInnerRect(leg.rect, leg.wall, carc, backBoardMm(item));
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
// Locks the view to a true head-on ORTHOGRAPHIC elevation of one wall — the
// "rendered elevation" mode. Positions the camera dead in front of the wall and
// sizes the ortho frustum (via zoom, since r3f's ortho maps 1 unit = 1px) to
// fit the wall's width×height into the canvas. OrbitControls keeps pan+zoom but
// has rotation disabled, so the wall never tips out of plane. Remounted per wall
// (keyed on elevationWall by the caller) so switching walls re-frames cleanly.
function ElevationCamera({ wall, W, D, H }) {
  const size = useThree((s) => s.size);
  const w = W / M, d = D / M, h = H / M;
  // Camera sits OUTSIDE the room, dead in front of the wall, so the ENTIRE room
  // depth is in front of it — every cabinet on the two returning (perpendicular)
  // walls renders and shows its carcass end/cross-section at the edge, wherever
  // it sits along that wall. The caller excludes the OPPOSITE wall's cabinets so
  // they can't occlude the wall we're facing. Ortho: this distance doesn't
  // change the framing (that's `zoom`), only what's in front vs behind.
  const span = Math.max(w, d, h) * 2;
  let position;
  if (wall === "top")         position = [w / 2, h / 2, d + span];
  else if (wall === "bottom") position = [w / 2, h / 2, -span];
  else if (wall === "left")   position = [w + span, h / 2, d / 2];
  else                        position = [-span, h / 2, d / 2]; // right
  const frustW = (wall === "top" || wall === "bottom") ? w : d;
  const margin = 1.14;
  const zoom = Math.max(1, Math.min(size.width / (frustW * margin), size.height / (h * margin)));
  // Geometry sits between ~span (near returning-wall ends) and ~span+axisLen
  // (the far wall) from the camera. Keep near/far snug around that so the depth
  // buffer stays precise and proud door panels don't z-fight the carcass.
  const axisLen = (wall === "top" || wall === "bottom") ? d : w;
  return <OrthographicCamera makeDefault position={position} zoom={zoom} near={span * 0.4} far={(span + axisLen) * 1.3} />;
}

// The wall's outline in a rendered elevation — a crisp rectangle at the wall
// plane (ceiling top, floor bottom, the two corner edges) so the extent of the
// wall reads, the way the schematic elevation frames it. The floor plane the
// Room already draws gives the ground; this adds the boundary.
function ElevationBounds({ wall, W, D, H }) {
  const w = W / M, d = D / M, h = H / M;
  let pts;
  if (wall === "top")         pts = [[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0], [0, 0, 0]];
  else if (wall === "bottom") pts = [[0, 0, d], [w, 0, d], [w, h, d], [0, h, d], [0, 0, d]];
  else if (wall === "left")   pts = [[0, 0, 0], [0, 0, d], [0, h, d], [0, h, 0], [0, 0, 0]];
  else                        pts = [[w, 0, 0], [w, 0, d], [w, h, d], [w, h, 0], [w, 0, 0]]; // right
  return <Line points={pts} color="#9ca3af" lineWidth={1.5} />;
}

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

export default function Design3DView({ room, items, onClose, colourImages, showColours, onToggleColours, selectedItemId, onSelectItem, onCaptureReady, mono = false, touch = false, showClose = true, elevationWall = null }) {
  const controlsRef = useRef();
  const [wallsVisible, setWallsVisible] = useState(true);
  const [labelsVisible, setLabelsVisible] = useState(true);
  // The hover handlers set a pointer cursor; make sure it doesn't linger if the
  // view closes while the cursor is over a cabinet.
  useEffect(() => () => { document.body.style.cursor = "auto"; }, []);
  const W = room?.width_mm || 4000;
  const D = room?.depth_mm || 3000;
  const H = room?.height_mm || 2400;
  const w = W / M, d = D / M, h = H / M;
  const center = [w / 2, h * 0.35, d / 2];

  // In rendered-elevation mode the OrbitControls target is the centre of the
  // wall we're facing (at mid-height), so pan/zoom stay anchored to that wall.
  const elevTarget = elevationWall === "top" ? [w / 2, h / 2, 0]
    : elevationWall === "bottom" ? [w / 2, h / 2, d]
    : elevationWall === "left" ? [0, h / 2, d / 2]
    : elevationWall === "right" ? [w, h / 2, d / 2]
    : center;

  // Only the item types that have a physical footprint — the plan filters
  // unplaced items the same way (item.wall must be set).
  let placed = (items || []).filter((i) => i.wall && ITEM_COLORS[i.item_type]);
  // A rendered elevation shows only the wall we're facing — like a real
  // elevation drawing. Keep items whose PRIMARY or SECONDARY (corner return) leg
  // is on this wall, plus an island facing it. That keeps the wall's cabinets
  // and any corner cabinet that belongs to it (its return still shows as a thin
  // carcass cross-section at the edge), but drops standalone cabinets on the
  // adjacent/opposite walls — a full-height pantry on a side wall was projecting
  // a big box across the view and occluding this wall.
  if (elevationWall) {
    // A blind corner cabinet is a single-wall base cabinet (no secondary leg),
    // so it isn't caught by the secondary_wall test the L-corners use. But it
    // IS a corner piece — like other returning cabinets it should show its
    // carcass cross-section from the adjacent wall — so keep blind corners that
    // sit on a wall perpendicular to the one we're viewing.
    const perpWalls = (elevationWall === "top" || elevationWall === "bottom")
      ? ["left", "right"] : ["top", "bottom"];
    placed = placed.filter((i) =>
      i.wall === elevationWall ||
      i.secondary_wall === elevationWall ||
      (i.wall === "island" && islandVirtualWall(i) === elevationWall) ||
      (i.item_type === "blind_corner_cabinet" && perpWalls.includes(i.wall))
    );
  }

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
      {!elevationWall && (<>
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
        <button
          type="button"
          onClick={() => setLabelsVisible((v) => !v)}
          title="Show or hide the cabinet name labels"
          style={{
            ...btnBase,
            background: labelsVisible ? "#fff" : "#1c1917",
            color: labelsVisible ? "#1c1c1a" : "#fff",
          }}
        >
          {labelsVisible ? "Labels on" : "Labels off"}
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
      </>)}

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
        <Room W={W} D={D} H={H} wallsVisible={elevationWall ? false : wallsVisible} />
        {elevationWall && <ElevationCamera key={elevationWall} wall={elevationWall} W={W} D={D} H={H} />}
        {elevationWall && <ElevationBounds wall={elevationWall} W={W} D={D} H={H} />}
        {onCaptureReady && <CaptureRig onReady={onCaptureReady} center={center} dims={{ w, h, d }} />}

        {(() => {
          const scene = placed.map((item) => (
            <group
              key={item.id}
              // A genuine click (not an orbit drag — r3f only fires onClick when
              // the pointer barely moved) selects the cabinet. stopPropagation so
              // only the front-most cabinet under the cursor is picked.
              onClick={(e) => { e.stopPropagation(); onSelectItem?.(item.id); }}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { document.body.style.cursor = "auto"; }}
            >
              {item.item_type === "shelf_rail" ? (
                <ShelfRailMesh item={item} W={W} D={D} />
              ) : item.item_type === "floating_shelf" ? (
                <FloatingShelfMesh item={item} W={W} D={D} />
              ) : (
                <>
                  <CabinetMesh item={item} W={W} D={D} roomHmm={H} elevationWall={elevationWall} />
                  <KickboardMesh item={item} W={W} D={D} />
                  <FillerMesh item={item} room={room} items={placed} W={W} D={D} />
                  <EndPanelMesh item={item} room={room} W={W} D={D} />
                  <SideFillerMesh item={item} room={room} W={W} D={D} />
                  <UndersidePanelMesh item={item} W={W} D={D} />
                  <TopPanelMesh item={item} W={W} D={D} />
                  <BackPanelMesh item={item} W={W} D={D} />
                  <BenchtopMesh item={item} items={placed} W={W} D={D} />
                  <ShelfMesh item={item} W={W} D={D} />
                  <FrontDetail item={item} W={W} D={D} />
                  <DiagonalDoorMesh item={item} W={W} D={D} />
                </>
              )}
              {item.id === selectedItemId && <SelectionHighlight item={item} W={W} D={D} />}
              {!elevationWall && labelsVisible && <ItemLabel item={item} W={W} D={D} />}
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
          key={`oc-${elevationWall || "orbit"}`}
          ref={controlsRef}
          target={elevationWall ? elevTarget : center}
          makeDefault
          enablePan
          enableRotate={!elevationWall}
          minDistance={elevationWall ? 0.01 : 0.8}
          maxDistance={Math.max(w, d, h) * (elevationWall ? 12 : 4)}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  );
}
