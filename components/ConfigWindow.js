"use client";

// A 2-column master–detail window for heavy config. Left column lists the
// sub-parts (panels / bays / sections / cutouts); the right column shows the
// selected part's settings via renderPart(part). Shared, theme-aware. On mobile
// (fullWidth) it fills the screen and the parts list becomes a top strip.
//
//   parts: [{ id, label, badge?, enabled? }]
//   selectedId, onSelect(id)
//   renderPart(part) -> right-column content
//   footer? -> optional node under the left list (e.g. an "Add" button)

import { useEffect } from "react";
import { useTheme } from "./ConfigControls";

export default function ConfigWindow({
  title, subtitle, parts = [], selectedId, onSelect, renderPart,
  onClose, theme = "dark", fullWidth = false, footer,
}) {
  const t = useTheme(theme);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = parts.find((p) => p.id === selectedId) || parts[0] || null;

  const dialogStyle = fullWidth
    ? { position: "fixed", inset: 0, zIndex: 1201, background: t.surface, display: "flex", flexDirection: "column" }
    : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1201, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", width: 720, maxWidth: "calc(100vw - 48px)", height: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" };

  const partBtn = (p) => {
    const on = selected && p.id === selected.id;
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => onSelect(p.id)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: fullWidth ? "auto" : "100%", flexShrink: 0,
          padding: "8px 10px", borderRadius: 8, cursor: "pointer", font: "inherit", textAlign: "left",
          border: `1px solid ${on ? t.accent : "transparent"}`,
          background: on ? t.surfaceOpen : "transparent",
          color: t.ink, whiteSpace: "nowrap",
        }}
      >
        <span style={{ flex: fullWidth ? "none" : 1, fontSize: 12.5, fontWeight: on ? 700 : 500 }}>{p.label}</span>
        {p.badge != null && (
          <span style={{ fontSize: 10, color: p.enabled === false ? t.soft : t.accent, textTransform: "uppercase", letterSpacing: "0.04em" }}>{p.badge}</span>
        )}
      </button>
    );
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1200 }} />
      <div role="dialog" aria-modal="true" aria-label={title} style={dialogStyle}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
            {subtitle && <p style={{ margin: "2px 0 0", fontSize: 12, color: t.soft }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} title="Close" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: `1px solid ${t.border}`, borderRadius: 6, color: t.soft, cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: fullWidth ? "column" : "row" }}>
          {/* Parts list */}
          <div style={{
            flexShrink: 0,
            display: "flex", flexDirection: fullWidth ? "row" : "column", gap: 4,
            width: fullWidth ? "auto" : 210,
            borderRight: fullWidth ? "none" : `1px solid ${t.border}`,
            borderBottom: fullWidth ? `1px solid ${t.border}` : "none",
            overflowX: fullWidth ? "auto" : "hidden", overflowY: fullWidth ? "hidden" : "auto",
            padding: 10,
          }}>
            {parts.map(partBtn)}
            {footer && <div style={{ marginTop: fullWidth ? 0 : "auto", paddingTop: 8 }}>{footer}</div>}
          </div>

          {/* Selected part settings */}
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 16 }}>
            {selected ? renderPart(selected) : <p style={{ fontSize: 12.5, color: t.soft }}>Nothing to configure.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
