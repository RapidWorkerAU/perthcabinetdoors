"use client";

import { Component, Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
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
  // Pull the camera back far enough that a 2200mm pantry frames as comfortably
  // as a 400mm base, rather than filling or floating in the viewport.
  const distance = Math.max(1.5, Math.max(height, width) * 1.55);

  const scene = (
    <CabinetScene cabinet={cabinet} layout={layout} colourSrc={colourSrc} colourHex={colourHex} />
  );
  const flatScene = (
    <CabinetScene cabinet={cabinet} layout={layout} colourSrc="" colourHex={colourHex} />
  );

  return (
    <Canvas
      camera={{ position: [distance * 0.62, distance * 0.34, distance], fov: 34 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Rotate only - no pan, no zoom. The preview is for looking at, not for
          navigating, and a public visitor who pans a single cabinet off screen
          has no way to work out how to get it back. */}
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI * 0.16}
        maxPolarAngle={Math.PI * 0.62}
        rotateSpeed={0.7}
      />
      <TextureErrorBoundary key={colourSrc || "flat"} fallback={flatScene}>
        <Suspense fallback={flatScene}>{scene}</Suspense>
      </TextureErrorBoundary>
    </Canvas>
  );
}
