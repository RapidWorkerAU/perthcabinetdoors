"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";

// The configurator's live preview: one cabinet, built up as the customer
// chooses. Same engine as the design tool's Design3DView (react-three-fiber +
// drei) so a door here is lit and finished exactly as it is on /design, rather
// than the site carrying two different-looking cabinet renderers.
//
// Deliberately much smaller in scope than Design3DView: one cabinet, no room,
// no benchtop, no neighbours, and rotate-only controls.
//
// three's colour-space constant has been the plain string "srgb" since r152.
// Using the literal keeps a top-level `import from "three"` out of this
// dynamically loaded chunk, which otherwise trips Webpack with
// "__webpack_modules__[moduleId] is not a function" under the
// transpilePackages + dynamic-import setup. Same reason as Design3DView.
const SRGB = "srgb";

const MM = 1000; // mm -> metres, so three's units stay sane
const FRONT_THICKNESS = 0.018;
const REVEAL = 0.003; // gap between adjacent fronts
const CARCASS_COLOUR = "#f4f2ee"; // always white, whatever the fronts are
const CARCASS_INNER = "#d8d3c6";
const HANDLE_COLOUR = "#8d8a82";

// The direction the camera looks from, as a plain unit vector. Numbers rather
// than a three Vector3, so this chunk still has no top-level import from
// "three", for the reason above.
const VIEW_DIR_LENGTH = Math.hypot(0.62, 0.34, 1);
const VIEW_DIR = [0.62 / VIEW_DIR_LENGTH, 0.34 / VIEW_DIR_LENGTH, 1 / VIEW_DIR_LENGTH];

// A little air around the cabinet so it never touches the edge of the stage.
const FIT_MARGIN = 1.06;

// Vertical field of view. Shared, because the framing maths has to use the same
// angle the camera is actually built with.
const FOV = 34;

// How close the camera may come in, and how far it may pull back, as a multiple
// of the distance that frames the whole cabinet. Clamped both ways: without a
// floor a scroll ends up inside the carcass, and without a ceiling the cabinet
// shrinks to a speck the customer cannot get back.
const ZOOM_IN_LIMIT = 0.34;
const ZOOM_OUT_LIMIT = 1.7;

// Paints a front with the real colour-library tile when one is available, and
// falls back to a flat colour otherwise. Split in two because useTexture is a
// hook and cannot be called conditionally.
function FrontMaterial({ src, colour }) {
  if (src) return <TexturedFrontMaterial src={src} />;
  return <meshStandardMaterial color={colour} roughness={0.55} metalness={0.04} />;
}

function TexturedFrontMaterial({ src }) {
  const texture = useTexture(src);
  // Tiles are sRGB photographs; without tagging them the finish renders dark
  // and desaturated. Anisotropy keeps the grain crisp at glancing angles.
  if (texture.colorSpace !== SRGB) {
    texture.colorSpace = SRGB;
    texture.needsUpdate = true;
  }
  if (texture.anisotropy !== 8) {
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }
  return <meshStandardMaterial map={texture} color="#ffffff" roughness={0.55} metalness={0.04} />;
}

// A tile that 404s, or one served without the CORS headers WebGL textures
// require, makes useTexture reject into Suspense. Without a boundary that
// blanks the whole preview; instead the scene falls back to the flat colour.
class TextureErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Carcass({ w, h, d }) {
  return (
    <group>
      {/* Back */}
      <mesh position={[0, 0, -d / 2]}>
        <boxGeometry args={[w, h, 0.016]} />
        <meshStandardMaterial color={CARCASS_INNER} roughness={0.9} />
      </mesh>
      {/* Sides */}
      <mesh position={[-w / 2 + 0.008, 0, 0]}>
        <boxGeometry args={[0.016, h, d]} />
        <meshStandardMaterial color={CARCASS_COLOUR} roughness={0.8} />
      </mesh>
      <mesh position={[w / 2 - 0.008, 0, 0]}>
        <boxGeometry args={[0.016, h, d]} />
        <meshStandardMaterial color={CARCASS_COLOUR} roughness={0.8} />
      </mesh>
      {/* Top and bottom */}
      <mesh position={[0, h / 2 - 0.008, 0]}>
        <boxGeometry args={[w, 0.016, d]} />
        <meshStandardMaterial color={CARCASS_COLOUR} roughness={0.8} />
      </mesh>
      <mesh position={[0, -h / 2 + 0.008, 0]}>
        <boxGeometry args={[w, 0.016, d]} />
        <meshStandardMaterial color={CARCASS_COLOUR} roughness={0.8} />
      </mesh>
    </group>
  );
}

// A door or drawer front, sitting just proud of the carcass face. The handle is
// indicative only - it tells a door from a drawer at a glance, and matches the
// elevation drawings on the layout tiles.
function Front({ x, y, w, h, z, type, hingeRight, src, colour }) {
  const isDrawer = type === "Drawer front";
  const isPanel = type === "Panel";
  const handleLength = isDrawer ? Math.min(w * 0.3, 0.22) : Math.min(h * 0.26, 0.3);

  return (
    <group position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[w, h, FRONT_THICKNESS]} />
        <FrontMaterial src={src} colour={colour} />
      </mesh>

      {/* A panel has no opening, so it gets no handle. */}
      {isPanel ? null : isDrawer ? (
        <mesh position={[0, Math.min(h * 0.3, 0.06), FRONT_THICKNESS / 2 + 0.008]}>
          <boxGeometry args={[handleLength, 0.014, 0.016]} />
          <meshStandardMaterial color={HANDLE_COLOUR} roughness={0.4} metalness={0.55} />
        </mesh>
      ) : (
        <mesh
          position={[hingeRight ? -w / 2 + 0.035 : w / 2 - 0.035, 0, FRONT_THICKNESS / 2 + 0.008]}
        >
          <boxGeometry args={[0.014, handleLength, 0.016]} />
          <meshStandardMaterial color={HANDLE_COLOUR} roughness={0.4} metalness={0.55} />
        </mesh>
      )}
    </group>
  );
}

// An end / side panel does not sit on the front of the cabinet - it clads the
// exposed side. Drawing it on the face, as if it were a door, would show the
// customer the wrong product entirely.
function SidePanel({ w, h, d, src, colour }) {
  return (
    <group position={[w / 2 + FRONT_THICKNESS / 2, 0, 0]}>
      <mesh>
        <boxGeometry args={[FRONT_THICKNESS, h, d]} />
        <FrontMaterial src={src} colour={colour} />
      </mesh>
    </group>
  );
}

// Frames the whole cabinet, whatever size it is and whatever shape the stage
// is, and hands the fitted distance back so the zoom stops are set off the same
// number.
//
// This used to be a fixed multiple of the cabinet's largest dimension, worked
// out from the props before the canvas existed. That crops. fov is the VERTICAL
// angle, the stage is wide and short, and a 2200 pantry needs far more room than
// a 400 base, so a tall cabinet ran off the top and bottom of the viewport with
// no way to pull back. This measures the viewport instead.
//
// It fits the cabinet's bounding SPHERE, not its face, so the cabinet stays
// fully in frame at every angle it can be rotated to, not only the one it
// started at.
function CameraRig({ width, height, depth, onFit }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const size = useThree((state) => state.size);
  const radius = Math.hypot(width, height, depth) / 2;

  useEffect(() => {
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const verticalFov = (camera.fov * Math.PI) / 180;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const fit =
      Math.max(radius / Math.sin(verticalFov / 2), radius / Math.sin(horizontalFov / 2)) *
      FIT_MARGIN;

    // Re-frame along whatever direction the customer has already rotated to, so
    // changing the size or the layout does not snap their view back to the
    // front. Only the distance changes.
    const { x, y, z } = camera.position;
    const length = Math.hypot(x, y, z);
    const direction = length > 0.001 ? [x / length, y / length, z / length] : VIEW_DIR;
    camera.position.set(direction[0] * fit, direction[1] * fit, direction[2] * fit);
    camera.updateProjectionMatrix();

    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }

    onFit(fit);
  }, [camera, controls, radius, size.width, size.height, onFit]);

  return null;
}

function CabinetScene({ cabinet, layout, colourSrc, colourHex }) {
  const w = (Number(cabinet?.width) || 600) / MM;
  const h = (Number(cabinet?.height) || 800) / MM;
  const d = (Number(cabinet?.depth) || 560) / MM;

  const fronts = useMemo(() => {
    if (!layout?.pieces?.length) return [];
    const inColumns = layout.arrangement === "columns";
    const span = layout.pieces.reduce(
      (sum, piece) => sum + (inColumns ? piece.width : piece.height),
      0
    ) || 1;

    let cursor = 0;
    return layout.pieces.map((piece, index) => {
      const extent = (inColumns ? piece.width : piece.height) / span;
      const pieceW = inColumns ? extent * w : w;
      const pieceH = inColumns ? h : extent * h;
      // Three's origin is the centre, and rows run top-down, so y is measured
      // from the top of the cabinet and negated.
      const centreAlong = cursor + extent / 2;
      const x = inColumns ? -w / 2 + centreAlong * w : 0;
      const y = inColumns ? 0 : h / 2 - centreAlong * h;
      cursor += extent;

      return {
        key: `${piece.type}-${index}`,
        x,
        y,
        w: Math.max(0.01, pieceW - REVEAL * 2),
        h: Math.max(0.01, pieceH - REVEAL * 2),
        type: piece.type,
        // A pair of doors side by side opens from the centre.
        hingeRight: inColumns && layout.pieces.length === 2 && index === 1,
      };
    });
  }, [layout, w, h]);

  const frontZ = d / 2 + FRONT_THICKNESS / 2;
  const isSidePanelOnly =
    layout?.pieces?.length === 1 && layout.pieces[0]?.type === "Panel";

  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[2.6, 3.4, 3.2]} intensity={1.5} />
      <directionalLight position={[-2.4, 1.4, -1.8]} intensity={0.42} />

      <group position={[0, 0, 0]}>
        <Carcass w={w} h={h} d={d} />
        {isSidePanelOnly ? (
          <SidePanel w={w} h={h} d={d} src={colourSrc} colour={colourHex} />
        ) : (
          fronts.map((front) => (
            <Front
              key={front.key}
              x={front.x}
              y={front.y}
              w={front.w}
              h={front.h}
              z={frontZ}
              type={front.type}
              hingeRight={front.hingeRight}
              src={colourSrc}
              colour={colourHex}
            />
          ))
        )}
      </group>
    </>
  );
}

export default function CabinetPreview3D({ cabinet, layout, colourSrc, colourHex = "#efece5" }) {
  const height = (Number(cabinet?.height) || 800) / MM;
  const width = (Number(cabinet?.width) || 600) / MM;
  const depth = (Number(cabinet?.depth) || 560) / MM;

  // CameraRig measures the real framing distance once the canvas exists and
  // reports it back here, so the zoom stops are always relative to "the whole
  // cabinet in view" rather than a number guessed per cabinet size.
  const [zoom, setZoom] = useState(null);
  const handleFit = useCallback((fit) => {
    setZoom((previous) =>
      previous && Math.abs(previous.fit - fit) < 0.001
        ? previous
        : { fit, min: fit * ZOOM_IN_LIMIT, max: fit * ZOOM_OUT_LIMIT }
    );
  }, []);

  // A first guess at the framing, used for the opening frame only. It assumes a
  // square stage, which is the worst case, so the cabinet is never larger than
  // the viewport before CameraRig measures the real thing a tick later.
  const openingDistance =
    (Math.hypot(width, height, depth) / 2 / Math.sin(((FOV * Math.PI) / 180) / 2)) * FIT_MARGIN;

  const scene = (
    <CabinetScene cabinet={cabinet} layout={layout} colourSrc={colourSrc} colourHex={colourHex} />
  );
  const flatScene = (
    <CabinetScene cabinet={cabinet} layout={layout} colourSrc="" colourHex={colourHex} />
  );

  return (
    <Canvas
      camera={{
        position: [
          VIEW_DIR[0] * openingDistance,
          VIEW_DIR[1] * openingDistance,
          VIEW_DIR[2] * openingDistance,
        ],
        fov: FOV,
      }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Rotate and zoom, the same way round as the design tool's 3D view so the
          two read as one product. Zoom is clamped at both ends and the target
          stays pinned to the middle of the cabinet, so there is no way to end up
          inside the carcass and no way to lose the cabinet off screen. Pan stays
          off for that same reason: a public visitor who slides a single cabinet
          out of view has no way to work out how to bring it back. */}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        zoomSpeed={0.7}
        minDistance={zoom ? zoom.min : 0.2}
        maxDistance={zoom ? zoom.max : 40}
        minPolarAngle={Math.PI * 0.16}
        maxPolarAngle={Math.PI * 0.62}
        rotateSpeed={0.7}
      />
      <CameraRig width={width} height={height} depth={depth} onFit={handleFit} />
      <TextureErrorBoundary key={colourSrc || "flat"} fallback={flatScene}>
        <Suspense fallback={flatScene}>{scene}</Suspense>
      </TextureErrorBoundary>
    </Canvas>
  );
}
