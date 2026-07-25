"use client";

// A compact "surface colour" row for the Colours & finishes area — swatch +
// label + current finish name + a Change button. Presentational: the parent
// wires `onChange` to open the shared ColourPickerModal. `children` renders
// under the row (e.g. the admin door/drawer profile + edge selects).

import { useTheme } from "./ConfigControls";

export default function ColourRow({ label, src, name, hex, onChange, onReset, theme = "light", children }) {
  const t = useTheme(theme);
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, border: `1px solid ${t.borderSoft}`, background: src ? `center/cover no-repeat url(${src})` : (hex || (theme === "dark" ? "rgba(255,255,255,0.12)" : "#e9e6df")) }} />
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>{label}</span>
          <span style={{ fontSize: 11, color: t.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name || "Not set"}</span>
        </span>
        <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {onReset && name && (
            <button type="button" onClick={onReset} style={btn(t, true)}>Reset</button>
          )}
          <button type="button" onClick={onChange} style={btn(t)}>Change</button>
        </span>
      </div>
      {children && <div style={{ marginTop: 8, paddingLeft: 44, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );
}

function btn(t, subtle = false) {
  return {
    padding: "5px 10px", fontSize: 12, borderRadius: 8, cursor: "pointer", font: "inherit",
    border: `1px solid ${t.border}`,
    background: subtle ? "transparent" : t.inputBg,
    color: subtle ? t.soft : t.ink,
  };
}
