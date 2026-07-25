"use client";

// Small shared form controls for the design-tool config panels — used by both
// the admin tool (dark) and the public planner (light). Theme-aware via a
// `theme="dark"|"light"` prop; the token map is exported so the other shared
// config pieces (ConfigSection, ColourRow, ConfigWindow) match.

import { useState, useEffect } from "react";

export const CONFIG_THEMES = {
  light: {
    surface: "#ffffff", surfaceOpen: "#f7f5ef", raised: "#faf8f3",
    border: "#e4dfd4", borderSoft: "rgba(0,0,0,0.10)",
    ink: "#2a2925", soft: "#7a766c",
    accent: "#1f6f4a", accentText: "#ffffff",
    inputBg: "#ffffff", inputText: "#2a2925",
  },
  dark: {
    surface: "#1e2328", surfaceOpen: "rgba(255,255,255,0.04)", raised: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.12)", borderSoft: "rgba(255,255,255,0.08)",
    ink: "rgba(255,255,255,0.88)", soft: "rgba(255,255,255,0.45)",
    accent: "#3b82f6", accentText: "#ffffff",
    inputBg: "rgba(255,255,255,0.06)", inputText: "rgba(255,255,255,0.9)",
  },
};

export function useTheme(theme) {
  return CONFIG_THEMES[theme] || CONFIG_THEMES.light;
}

// A small uppercase divider label that groups related fields.
export function SectionDivider({ label, theme = "light" }) {
  const t = useTheme(theme);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 6px" }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: t.soft, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: t.borderSoft }} />
    </div>
  );
}

// Segmented button group. options: [{ v, label }].
export function Segmented({ value, options, onChange, theme = "light", size = "md" }) {
  const t = useTheme(theme);
  const pad = size === "sm" ? "5px 9px" : "7px 12px";
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", border: `1px solid ${t.border}`, borderRadius: 8, overflow: "hidden" }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            style={{
              padding: pad, border: "none", cursor: "pointer", font: "inherit", fontSize: 12.5,
              background: on ? t.accent : "transparent",
              color: on ? t.accentText : t.ink,
              fontWeight: on ? 600 : 400,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A labelled on/off checkbox row.
export function Toggle({ label, checked, onChange, theme = "light", disabled = false }) {
  const t = useTheme(theme);
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0", cursor: disabled ? "default" : "pointer", fontSize: 13, color: disabled ? t.soft : t.ink, opacity: disabled ? 0.6 : 1 }}>
      <span>{label}</span>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: t.accent, cursor: disabled ? "default" : "pointer" }} />
    </label>
  );
}

// Number input that commits on blur / Enter (so a debounced parent save fires
// once, not on every keystroke).
export function NumberField({ label, value, onCommit, theme = "light", min, placeholder = "mm", disabled = false }) {
  const t = useTheme(theme);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  const commit = () => {
    if (draft === "") { onCommit(null); return; }
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setDraft(value ?? "");
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: t.soft, minWidth: 0 }}>
      {label}
      <input
        type="number"
        value={draft}
        min={min}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ padding: "6px 8px", fontSize: 13, borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.inputText, width: "100%", boxSizing: "border-box" }}
      />
    </label>
  );
}

// Text input that commits on blur / Enter.
export function TextField({ label, value, onCommit, theme = "light", placeholder = "" }) {
  const t = useTheme(theme);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  const commit = () => { if ((draft ?? "") !== (value ?? "")) onCommit(draft); };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: t.soft, minWidth: 0 }}>
      {label}
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ padding: "6px 8px", fontSize: 13, borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.inputText, width: "100%", boxSizing: "border-box" }}
      />
    </label>
  );
}

// Labelled select. options: [{ v, label }].
export function SelectField({ label, value, options, onChange, theme = "light", disabled = false }) {
  const t = useTheme(theme);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: t.soft, minWidth: 0 }}>
      {label}
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "6px 8px", fontSize: 13, borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.inputText, width: "100%", boxSizing: "border-box", cursor: disabled ? "default" : "pointer" }}
      >
        {options.map((o) => <option key={o.v} value={o.v} style={{ color: "#111" }}>{o.label}</option>)}
      </select>
    </label>
  );
}

// A row that lays out its children (usually two fields) side by side.
export function FieldRow({ children, gap = 10 }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap }}>{children}</div>;
}
