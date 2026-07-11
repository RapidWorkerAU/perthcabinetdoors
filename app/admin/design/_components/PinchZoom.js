"use client";

import { useRef, useState } from "react";

// Touch pinch-to-zoom + drag-to-pan wrapper. Scales ONLY its children via a CSS
// transform, so wrapping just the canvas/elevation SVG leaves the surrounding
// page chrome (header, price strip, footer) untouched. `touch-action: none`
// stops the browser's native page zoom inside the canvas.
//
// When `enabled` is false it renders children directly (desktop / non-touch),
// adding no wrapper and no behaviour change.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export default function PinchZoom({ enabled = true, minScale = 1, maxScale = 5, oneFingerPan = true, children }) {
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const gesture = useRef({ mode: null });
  const containerRef = useRef(null);

  if (!enabled) return children;

  function rel(touch) {
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: touch.clientX - r.left, y: touch.clientY - r.top };
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      const pa = rel(e.touches[0]);
      const pb = rel(e.touches[1]);
      const cur = tRef.current;
      gesture.current = {
        mode: "pinch",
        startDist: dist(pa, pb) || 1,
        startScale: cur.scale,
        startMid: mid(pa, pb),
        startX: cur.x,
        startY: cur.y,
      };
    } else if (oneFingerPan && e.touches.length === 1 && tRef.current.scale > 1.01) {
      const p = rel(e.touches[0]);
      const cur = tRef.current;
      gesture.current = { mode: "pan", startTouch: p, startX: cur.x, startY: cur.y };
    } else {
      // Single finger — let it fall through to the SVG (tap-select / drag a
      // cabinet on the interactive canvas). Two-finger handles zoom + pan.
      gesture.current = { mode: null };
    }
  }

  function onTouchMove(e) {
    const g = gesture.current;
    if (g.mode === "pinch" && e.touches.length === 2) {
      e.preventDefault();
      const pa = rel(e.touches[0]);
      const pb = rel(e.touches[1]);
      const curMid = mid(pa, pb);
      const scale = clamp(g.startScale * (dist(pa, pb) / g.startDist), minScale, maxScale);
      const ratio = scale / g.startScale;
      // Keep the content point that was under the fingers at gesture start under
      // the fingers' CURRENT midpoint — this zooms and pans together.
      const x = curMid.x - (g.startMid.x - g.startX) * ratio;
      const y = curMid.y - (g.startMid.y - g.startY) * ratio;
      setT({ scale, x, y });
    } else if (g.mode === "pan" && e.touches.length === 1) {
      e.preventDefault();
      const p = rel(e.touches[0]);
      setT({ scale: tRef.current.scale, x: g.startX + (p.x - g.startTouch.x), y: g.startY + (p.y - g.startTouch.y) });
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length === 0) {
      // Snap back if effectively unzoomed so the drawing re-centres.
      if (tRef.current.scale <= 1.01) setT({ scale: 1, x: 0, y: 0 });
      gesture.current = { mode: null };
    } else if (e.touches.length === 1) {
      // Lifting one finger of a pinch → continue as a pan (only if one-finger
      // panning is allowed; otherwise end the gesture so the canvas takes over).
      if (oneFingerPan) {
        const p = rel(e.touches[0]);
        const cur = tRef.current;
        gesture.current = { mode: "pan", startTouch: p, startX: cur.x, startY: cur.y };
      } else {
        gesture.current = { mode: null };
      }
    }
  }

  function reset() { setT({ scale: 1, x: 0, y: 0 }); }

  const zoomed = t.scale > 1.01;

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transformOrigin: "0 0",
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
      {zoomed && (
        <button
          type="button"
          onClick={reset}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 2,
            appearance: "none",
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Reset zoom
        </button>
      )}
    </div>
  );
}
