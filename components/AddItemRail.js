"use client";

// The "Add an item" rail, SHARED by the admin design tool and the public
// planner. A dropdown that filters by category sits at the top; a scrolling
// column of tiles (line-art mockup + name + blurb) sits under it. Clicking a
// tile calls onPick(type, kind), each tool decides what that does (the public
// planner drops the item straight in with sensible defaults; the admin tool
// opens the size form on the right).
//
// Theme-aware so it fits the dark admin rail and the light public rail. The
// mockups themselves come in via renderMockup, so this component stays free of
// any app-specific imports.

import { useState } from "react";

// The same dropdown treatment as .pcdSelect in app/(site)/frontend.css, done
// inline because this rail is shared with the admin tool, which does not load
// that stylesheet. Two background layers: a solid chip filling the right end,
// and the chevron on top of it. With padding-right reserving that space, a long
// category name is clipped with an ellipsis before it can reach the arrow.
function chevron(stroke) {
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='${stroke}' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
}

function selectChrome(theme) {
  return {
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage: `${chevron(theme.arrowStroke)}, linear-gradient(${theme.arrowChip}, ${theme.arrowChip})`,
    backgroundPosition: "right 15px center, right 1px center",
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "11px 7px, 40px calc(100% - 2px)",
    paddingRight: 40,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

const THEMES = {
  light: {
    headerBorder: "#e4dfd4",
    title: "#2a2925",
    sub: "#7a766c",
    selectBg: "#ffffff", selectBorder: "#e4dfd4", selectText: "#2a2925",
    optionBg: "#ffffff", optionText: "#2a2925",
    arrowChip: "#ffffff", arrowStroke: "%236a6a62",
    tileBg: "#faf8f3", tileBorder: "#e4dfd4",
    label: "#2a2925", desc: "#7a766c",
    accent: "#1f6f4a", accentBg: "rgba(31,111,74,0.10)",
    closeText: "#7a766c", closeBorder: "#e4dfd4",
  },
  dark: {
    headerBorder: "rgba(255,255,255,0.07)",
    title: "#ffffff",
    sub: "rgba(255,255,255,0.35)",
    // Solid rather than translucent so the chip can match it exactly.
    selectBg: "#2f3136", selectBorder: "rgba(255,255,255,0.18)", selectText: "#f3f1ea",
    // Deliberately a LIGHT list even on the dark theme. See the note above.
    optionBg: "#ffffff", optionText: "#1a1a18",
    arrowChip: "#2f3136", arrowStroke: "%23f3f1ea",
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
  // Optional: let the parent own the category, so it can react to the choice.
  // The public planner uses this to show a range selector under the filter once
  // IKEA is chosen. Left out, the rail keeps its own state exactly as before.
  category,
  onCategoryChange,
  // Optional node rendered directly under the filter, e.g. that range selector.
  belowFilter = null,
  // Optional replacement for the "Nothing in this category." line, so a
  // category that needs a second choice first can say so.
  emptyLabel = "Nothing in this category.",
  // "All items" is useful in the admin tool, where staff know the whole
  // catalogue and want to scan it. On the public planner it is the opposite:
  // one undifferentiated list of eleven things is what makes someone bounce, so
  // that tool turns it off and always shows a deliberate group.
  showAllOption = true,
  // The rail's own title and close button. Off when something around it already
  // provides them: the planner's mobile bottom sheet has its own header, so
  // leaving this on drew "Add to your room" and a ✕ twice, one above the other.
  showHeader = true,
}) {
  const [ownCat, setOwnCat] = useState(() => (showAllOption ? "all" : categories[0]?.key || "all"));
  const controlled = category !== undefined;
  const cat = controlled ? category : ownCat;
  const setCat = (next) => {
    if (!controlled) setOwnCat(next);
    if (onCategoryChange) onCategoryChange(next);
  };
  const t = THEMES[theme] || THEMES.light;

  // Only offer the filter for categories that actually have items here. `always`
  // opts a category out of that: IKEA has no rows until a range is picked, and
  // hiding it would leave nothing to pick the range from.
  const cats = categories.filter((c) => c.always || catalogue.some((r) => r.category === c.key));
  const showFilter = cats.length > 1;
  // Without an "all" option a category always has to be chosen, so fall back to
  // the first one rather than silently showing nothing.
  const effectiveCat = !showAllOption && cat === "all" ? cats[0]?.key || cat : cat;
  const rows = catalogue.filter((r) => effectiveCat === "all" || r.category === effectiveCat);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Only rendered when it would hold something, so turning the header off
          in a container that has its own does not leave an empty bordered strip. */}
      {(showHeader || showFilter || belowFilter) && (
      <div style={{ padding: showHeader ? "12px 12px 10px" : "10px 12px", borderBottom: `1px solid ${t.headerBorder}`, flexShrink: 0 }}>
        {showHeader && (
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
        )}
        {showHeader && subtitle && <p style={{ margin: "3px 0 0", fontSize: 11, color: t.sub }}>{subtitle}</p>}
        {showFilter && (
          <select
            value={effectiveCat}
            onChange={(e) => setCat(e.target.value)}
            title="Filter items"
            style={{ marginTop: showHeader ? 10 : 0, width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${t.selectBorder}`, backgroundColor: t.selectBg, color: t.selectText, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", ...selectChrome(t) }}
          >
            {showAllOption && (
              <option value="all" style={{ backgroundColor: t.optionBg, color: t.optionText }}>All items</option>
            )}
            {cats.map((c) => (
              <option key={c.key} value={c.key} style={{ backgroundColor: t.optionBg, color: t.optionText }}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        {belowFilter}
      </div>
      )}

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
          <p style={{ fontSize: 11, color: t.sub, padding: 8, margin: 0, lineHeight: 1.5 }}>{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}
