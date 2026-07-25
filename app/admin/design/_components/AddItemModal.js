"use client";

// The visual "Add Item" picker. Opens as a large modal of item cards, each
// with a small mockup + a one-line description of what it adds, filterable by
// category (Cabinets / Room Features / Panels & Finishing / Appliances). Picking
// a card hands the chosen type back to the Add form (which sets its defaults
// and lets the user tweak dimensions before it's created). Purely a type
// picker — no data is written here.

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import styles from "../design.module.css";

// One catalog row per addable type: which category it belongs to and a short
// "what it adds" blurb. Labels come in via props (the canonical TYPE_LABELS)
// so this list never drifts from the rest of the tool.
export const CATALOG = [
  { type: "base_cabinet",         category: "cabinets",   desc: "Floor cabinet with a benchtop over — doors or drawers." },
  { type: "wall_cabinet",         category: "cabinets",   desc: "Upper cabinet mounted above the benchtop." },
  { type: "tall_cabinet",         category: "cabinets",   desc: "Full-height cabinet — pantry or oven / broom tower." },
  { type: "corner_base_cabinet",  category: "cabinets",   desc: "L-shaped base cabinet that wraps a 90° corner." },
  { type: "corner_tall_cabinet",  category: "cabinets",   desc: "Full-height corner pantry — L-shape or diagonal door." },
  { type: "blind_corner_cabinet", category: "cabinets",   desc: "Base with a blind return hidden into the corner." },
  { type: "floating_shelf",       category: "finishing",  desc: "Wall-mounted open shelf board." },
  { type: "panel",                category: "finishing",  desc: "Standalone finished panel — filler or end panel." },
  { type: "scribe",               category: "finishing",  desc: "Thin filler that scribes against a wall or appliance." },
  { type: "obstruction",          category: "features",   desc: "Non-cabinet blocker — nib wall, boxing, recess. Never quoted." },
  { type: "window",               category: "features",   desc: "Window opening in the wall (visual reference)." },
  { type: "door_opening",         category: "features",   desc: "Doorway opening (visual reference)." },
  { type: "brick_corner_pantry",  category: "features",   desc: "Bricked-in diagonal corner pantry with a door. Never quoted." },
  { type: "appliance", kind: "fridge",     category: "appliances", label: "Fridge / Freezer", desc: "Tall fridge — single, double or French-door style." },
  { type: "appliance", kind: "dishwasher", category: "appliances", label: "Dishwasher",       desc: "Under-bench dishwasher with a control strip + handle." },
  { type: "appliance", kind: "rangehood",  category: "appliances", label: "Rangehood",        desc: "Wall-mounted canopy rangehood with a chimney flue." },
  { type: "appliance", kind: "other",      category: "appliances", label: "Other appliance",  desc: "Freestanding box — washing machine, oven, etc." },
];

export const CATEGORIES = [
  { key: "all",        label: "All" },
  { key: "cabinets",   label: "Cabinets" },
  { key: "features",   label: "Room Features" },
  { key: "finishing",  label: "Panels & Finishing" },
  { key: "appliances", label: "Appliances" },
];

// ── Small line-art mockups, one per type. A 72×52 viewBox so every card's
// artwork sits on the same baseline. Deliberately schematic — enough to tell
// a base from a wall unit from a window at a glance, not a render. ──
const STROKE = "#4b5563";
const CARC = "#e5e7eb";
const DOOR = "#f3f4f6";

function box(x, y, w, h, fill = CARC, extra = {}) {
  return <rect x={x} y={y} width={w} height={h} rx="1.5" fill={fill} stroke={STROKE} strokeWidth="1.2" {...extra} />;
}
function handleDot(cx, cy) {
  return <circle cx={cx} cy={cy} r="1.1" fill={STROKE} />;
}

export function Mockup({ type, kind }) {
  const svg = (children) => (
    <svg viewBox="0 0 72 52" width="100%" height="100%" role="img" aria-hidden="true" style={{ display: "block" }}>
      {children}
    </svg>
  );
  if (type === "appliance") {
    switch (kind) {
      case "dishwasher":
        return svg(<>
          {box(22, 6, 28, 42, "#e2e8f0")}
          <rect x="24" y="8" width="24" height="5" rx="1" fill="#9aa0a6" />
          <rect x="27" y="16" width="18" height="2.5" rx="1" fill={STROKE} />
          <line x1="24" y1="24" x2="48" y2="24" stroke={STROKE} strokeWidth="0.6" />
        </>);
      case "rangehood":
        return svg(<>
          <polygon points="14,30 58,30 50,20 22,20" fill="#dfe3e8" stroke={STROKE} strokeWidth="1.2" strokeLinejoin="round" />
          <rect x="30" y="6" width="12" height="14" fill="#e2e8f0" stroke={STROKE} strokeWidth="1.2" />
          <rect x="16" y="30" width="40" height="3" fill="#9aa0a6" />
          <line x1="4" y1="46" x2="68" y2="46" stroke="#cbd5e1" strokeWidth="1.5" />
        </>);
      case "other":
        return svg(box(20, 6, 32, 40, "#e2e8f0"));
      default: // fridge / freezer
        return svg(<>
          {box(22, 4, 28, 44, "#e2e8f0")}
          <line x1="22" y1="20" x2="50" y2="20" stroke={STROKE} strokeWidth="1" />
          <rect x="45" y="8" width="2.5" height="9" rx="1" fill={STROKE} />
          <rect x="45" y="24" width="2.5" height="18" rx="1" fill={STROKE} />
        </>);
    }
  }
  switch (type) {
    case "base_cabinet":
      return svg(<>
        <rect x="6" y="10" width="60" height="5" rx="1" fill="#9ca3af" />
        {box(8, 15, 56, 32)}
        {box(11, 18, 25, 26, DOOR)}{box(38, 18, 23, 26, DOOR)}
        {handleDot(33, 31)}{handleDot(40, 31)}
      </>);
    case "wall_cabinet":
      return svg(<>
        {box(10, 6, 52, 26)}
        {box(13, 9, 22, 20, DOOR)}{box(37, 9, 22, 20, DOOR)}
        {handleDot(33, 19)}{handleDot(39, 19)}
        <line x1="4" y1="46" x2="68" y2="46" stroke="#9ca3af" strokeWidth="2" />
      </>);
    case "tall_cabinet":
      return svg(<>
        {box(22, 4, 28, 44)}
        {box(25, 7, 22, 18, DOOR)}{box(25, 27, 22, 18, DOOR)}
        {handleDot(43, 15)}{handleDot(43, 37)}
      </>);
    case "corner_base_cabinet":
      return svg(<>
        <polygon points="8,10 46,10 46,26 26,26 26,46 8,46" fill={CARC} stroke={STROKE} strokeWidth="1.2" strokeLinejoin="round" />
        {box(11, 13, 14, 30, DOOR)}{box(29, 13, 14, 10, DOOR)}
      </>);
    case "corner_tall_cabinet":
      return svg(<>
        <polygon points="8,5 48,5 48,25 28,25 28,47 8,47" fill={CARC} stroke={STROKE} strokeWidth="1.2" strokeLinejoin="round" />
        {box(11, 8, 14, 36, DOOR)}
        <line x1="28" y1="25" x2="48" y2="5" stroke={STROKE} strokeWidth="1" strokeDasharray="3 2" />
      </>);
    case "blind_corner_cabinet":
      return svg(<>
        {box(8, 12, 56, 30)}
        <rect x="9" y="13" width="18" height="28" fill="#d1d5db" />
        {box(28, 15, 33, 24, DOOR)}
        {handleDot(33, 27)}
      </>);
    case "floating_shelf":
      return svg(<>
        <rect x="8" y="30" width="56" height="4" fill="#9ca3af" opacity="0.5" />
        {box(8, 22, 56, 8, "#e7d9c2")}
        <line x1="4" y1="14" x2="68" y2="14" stroke="#cbd5e1" strokeWidth="1.5" />
      </>);
    case "panel":
      return svg(<>{box(30, 6, 12, 40, "#e7d9c2")}</>);
    case "scribe":
      return svg(<>
        {box(30, 6, 12, 40, "#e7d9c2")}
        <line x1="30" y1="12" x2="42" y2="6" stroke={STROKE} strokeWidth="0.6" />
        <line x1="30" y1="22" x2="42" y2="16" stroke={STROKE} strokeWidth="0.6" />
        <line x1="30" y1="32" x2="42" y2="26" stroke={STROKE} strokeWidth="0.6" />
        <line x1="30" y1="42" x2="42" y2="36" stroke={STROKE} strokeWidth="0.6" />
      </>);
    case "obstruction":
      return svg(<>
        {box(18, 10, 36, 32, "#e2e0dc")}
        {[0, 8, 16, 24, 32].map((o) => (
          <line key={o} x1={18} y1={12 + o} x2={30 + o} y2={10} stroke="#a8a29e" strokeWidth="0.8" opacity="0.7" />
        ))}
      </>);
    case "window":
      return svg(<>
        <rect x="12" y="10" width="48" height="30" rx="1.5" fill="#38bdf8" fillOpacity="0.28" stroke={STROKE} strokeWidth="1.2" />
        <line x1="36" y1="10" x2="36" y2="40" stroke={STROKE} strokeWidth="1" />
        <line x1="12" y1="25" x2="60" y2="25" stroke={STROKE} strokeWidth="1" />
      </>);
    case "door_opening":
      return svg(<>
        {box(20, 6, 26, 40, "#f5efe6")}
        <path d="M20 46 A 26 26 0 0 1 46 20" fill="none" stroke="#b45309" strokeWidth="1" strokeDasharray="3 2" />
        {handleDot(42, 26)}
      </>);
    case "brick_corner_pantry":
      return svg(<>
        <polygon points="8,6 48,6 48,26 28,46 8,46" fill="#a0522d" fillOpacity="0.85" stroke={STROKE} strokeWidth="1.2" strokeLinejoin="round" />
        <line x1="8" y1="16" x2="48" y2="16" stroke="#7c3f1d" strokeWidth="0.6" />
        <line x1="8" y1="26" x2="38" y2="26" stroke="#7c3f1d" strokeWidth="0.6" />
        <line x1="8" y1="36" x2="28" y2="36" stroke="#7c3f1d" strokeWidth="0.6" />
        <rect x="30" y="28" width="12" height="16" fill="#eae5db" stroke={STROKE} strokeWidth="1" transform="rotate(-45 36 36)" />
      </>);
    default:
      return svg(box(16, 10, 40, 32));
  }
}

export default function AddItemModal({ allowedTypes, typeLabels = {}, onPick, onClose }) {
  const [category, setCategory] = useState("all");

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const allowed = Array.isArray(allowedTypes) && allowedTypes.length ? allowedTypes : CATALOG.map((c) => c.type);
  const rows = CATALOG.filter((c) => allowed.includes(c.type));
  // Only show category tabs that actually have items in the allowed set (mobile
  // restricts to a few cabinet types, so its picker collapses to one tab).
  const activeCats = CATEGORIES.filter((cat) => cat.key === "all" || rows.some((r) => r.category === cat.key));
  const shown = rows.filter((r) => category === "all" || r.category === category);

  return createPortal(
    <>
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={`${styles.modalBox} ${styles.addItemModalBox}`} role="dialog" aria-modal="true" aria-label="Add an item">
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add an item</h2>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.modalBody}>
          {/* Category filter */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {activeCats.map((cat) => {
              const on = category === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategory(cat.key)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: `1px solid ${on ? "#2563eb" : "var(--dt-border, rgba(0,0,0,0.14))"}`,
                    background: on ? "#2563eb" : "transparent",
                    color: on ? "#fff" : "var(--dt-text, #1c1c1a)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Item cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {shown.map((row) => (
              <button
                key={`${row.type}:${row.kind || ""}`}
                type="button"
                onClick={() => onPick(row.type, row.kind)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 12,
                  textAlign: "left",
                  borderRadius: 10,
                  border: "1px solid var(--dt-border-soft, rgba(0,0,0,0.10))",
                  background: "var(--dt-bg, #f7f6f3)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(37,99,235,0.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--dt-border-soft, rgba(0,0,0,0.10))"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ height: 72, background: "#fff", borderRadius: 8, border: "1px solid var(--dt-border-soft, rgba(0,0,0,0.06))", padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Mockup type={row.type} kind={row.kind} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dt-text, #1c1c1a)", lineHeight: 1.2 }}>
                  {row.label || typeLabels[row.type] || row.type}
                </span>
                <span style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", lineHeight: 1.35 }}>
                  {row.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
