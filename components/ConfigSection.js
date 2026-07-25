"use client";

// A single-open accordion section for the design-tool config panels. Shared by
// the admin tool (dark) and the public planner (light). The parent tracks which
// section is open and passes `open` + `onToggle`, so opening one closes the rest.

import { useTheme } from "./ConfigControls";

export default function ConfigSection({ title, summary, open, onToggle, children, theme = "light" }) {
  const t = useTheme(theme);
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", background: open ? t.surfaceOpen : "transparent", border: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: t.ink }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: t.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
          {open ? "" : summary}
        </span>
        <span style={{ color: t.soft, fontSize: 12, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={{ padding: "8px 12px 14px" }}>{children}</div>}
    </div>
  );
}
