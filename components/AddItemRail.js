"use client";

// The "Add an item" rail — SHARED by the admin design tool and the public
// planner. A dropdown that filters by category sits at the top; a scrolling
// column of tiles (line-art mockup + name + blurb) sits under it. Clicking a
// tile calls onPick(type, kind) — each tool decides what that does (the public
// planner drops the item straight in with sensible defaults; the admin tool
// opens the size form on the right).
//
// Theme-aware so it fits the dark admin rail and the light public rail. The
// mockups themselves come in via renderMockup, so this component stays free of
// any app-specific imports.

import { useState } from "react";

const THEMES = {
  light: {
    headerBorder: "#e4dfd4",
    title: "#2a2925",
    sub: "#7a766c",
    selectBg: "#ffffff", selectBorder: "#e4dfd4", selectText: "#2a2925",
    tileBg: "#faf8f3", tileBorder: "#e4dfd4",
    label: "#2a2925", desc: "#7a766c",
    accent: "#1f6f4a", accentBg: "rgba(31,111,74,0.10)",
    closeText: "#7a766c", closeBorder: "#e4dfd4",
  },
  dark: {
    headerBorder: "rgba(255,255,255,0.07)",
    title: "#ffffff",
    sub: "rgba(255,255,255,0.35)",
    selectBg: "rgba(255,255,255,0.06)", selectBorder: "rgba(255,255,255,0.18)", selectText: "#f3f1ea",
    tileBg: "rgba(255,255,255,0.04)", tileBorder: "rgba(255,255,255,0.10)",
    label: "rgba(255,255,255,0.85)", desc: "rgba(255,255,255,0.4)",
    accent: "#3b82f6", accentBg: "rgba(59,130,246,0.16)",
    closeText: "rgba(255,255,255,0.6)", closeBorder: "rgba(255,255,255,0.18)",
  },
};

export default function AddItemRail({
  catalogue = [],
  categories = [],
  renderMockup,
  onPick,
  pickedType = null,
  theme = "light",
  title = "Add an item",
  subtitle,
  onCancel,
}) {
  const [cat, setCat] = useState("all");
  const t = THEMES[theme] || THEMES.light;

  // Only offer the filter for categories that actually have items here.
  const cats = categories.filter((c) => catalogue.some((r) => r.category === c.key));
  const showFilter = cats.length > 1;
  const rows = catalogue.filter((r) => cat === "all" || r.category === cat);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${t.headerBorder}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.title }}>{title}</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              title="Close"
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: `1px solid ${t.closeBorder}`, borderRadius: 6, color: t.closeText, cursor: "pointer", fontSize: 13, fontFamily: "inherit", flexShrink: 0 }}
            >
              ✕
            </button>
          )}
        </div>
        {subtitle && <p style={{ margin: "3px 0 0", fontSize: 11, color: t.sub }}>{subtitle}</p>}
        {showFilter && (
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            title="Filter items"
            style={{ marginTop: 10, width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${t.selectBorder}`, background: t.selectBg, color: t.selectText, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}
          >
            <option value="all" style={{ color: "#111" }}>All items</option>
            {cats.map((c) => (
              <option key={c.key} value={c.key} style={{ color: "#111" }}>{c.label}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => {
          const picked = pickedType && pickedType.type === row.type && (pickedType.kind || "") === (row.kind || "");
          return (
            <button
              key={`${row.type}:${row.kind || ""}`}
              type="button"
              onClick={() => onPick(row.type, row.kind)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: 8, width: "100%", textAlign: "left",
                borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${picked ? t.accent : t.tileBorder}`,
                background: picked ? t.accentBg : t.tileBg,
              }}
              onMouseEnter={(e) => { if (!picked) e.currentTarget.style.borderColor = t.accent; }}
              onMouseLeave={(e) => { if (!picked) e.currentTarget.style.borderColor = t.tileBorder; }}
            >
              <span style={{ width: 46, height: 34, flexShrink: 0, background: "#fff", borderRadius: 6, padding: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {renderMockup ? renderMockup(row.type, row.kind) : null}
              </span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.label, lineHeight: 1.2 }}>{row.label}</span>
                {row.desc && <span style={{ fontSize: 10.5, color: t.desc, lineHeight: 1.3 }}>{row.desc}</span>}
              </span>
            </button>
          );
        })}
        {rows.length === 0 && (
          <p style={{ fontSize: 11, color: t.sub, padding: 8, margin: 0 }}>Nothing in this category.</p>
        )}
      </div>
    </div>
  );
}
