"use client";

// The full-width bar across the top of the design tool — the SAME bar in the
// admin tool and the public planner. It carries the view switch (Plan /
// Elevation / 3D), the wall buttons (shown only in Elevation), and the colours
// on/off button. Everything else — the project name on the left, and each
// tool's own action buttons on the right — is passed in as `left` / `right`, so
// the admin can show Import / Stage Quote / Export etc. and the public tool can
// show Send to PCD / Save, while the middle stays identical.

export const BAR_HEIGHT = 52;

const C = { bar: "#2a2b28", text: "#f3f1ea", active: "rgba(255,255,255,0.16)", edge: "rgba(255,255,255,0.28)" };

// A button styled for the dark bar — exported so each tool's own buttons in the
// left/right slots match.
export const barButton = { padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.edge}`, background: "transparent", color: C.text, cursor: "pointer", font: "inherit", fontSize: 13, whiteSpace: "nowrap" };

function Segmented({ value, options, onChange }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${C.edge}`, borderRadius: 8, overflow: "hidden" }}>
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} title={o.title || o.label}
          style={{ ...barButton, border: "none", borderRadius: 0, background: value === o.v ? C.active : "transparent" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const VIEWS = [{ v: "plan", label: "Plan" }, { v: "elevation", label: "Elevation" }, { v: "3d", label: "3D" }];
// Single-letter wall buttons (full word on hover) so the elevation wall switch
// stays compact when it appears.
const WALLS = [{ v: "top", label: "B", title: "Back" }, { v: "left", label: "L", title: "Left" }, { v: "right", label: "R", title: "Right" }, { v: "bottom", label: "F", title: "Front" }];

export default function DesignTopBar({ view, onView, elevWall, onElevWall, showColours, onToggleColours, left, right }) {
  return (
    <div style={{ height: BAR_HEIGHT, flexShrink: 0, background: C.bar, color: C.text, display: "flex", alignItems: "center", gap: 10, padding: "0 12px", zIndex: 3 }}>
      {left}
      <div style={{ flex: 1 }} />
      <Segmented value={view} options={VIEWS} onChange={onView} />
      {view === "elevation" && <Segmented value={elevWall} options={WALLS} onChange={onElevWall} />}
      <button type="button" style={barButton} onClick={onToggleColours} title="Paint cabinets with their real colours">
        {showColours ? "🎨 Colours on" : "🎨 Colours off"}
      </button>
      {right}
    </div>
  );
}
