"use client";

// Shared colour chooser used by BOTH the public planner and the admin design
// tool. Every ACTIVE colour-library row is one tile (so each thickness variant
// is its own tile, badged with its thickness). All tiles show on open and the
// left-rail filters narrow them down. Cost is read-only, straight from the
// library — it is never edited in the design tool.
//   • mode="public": Brand → Finish → Search. Click a swatch to pick it.
//     Returns { material, finish, colour, supplier, src }.
//   • mode="admin": Match → Search → Brand → Material → Thickness → Finish, with
//     the tile's cost shown read-only. Pick a tile, then Save.
//     Returns { material, finish, colour, thickness_mm, cost_per_sqm }.

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

const PREFERRED_BRANDS = ["Laminex", "Polytec"];
const sortBrands = (list) =>
  [...list].sort((a, b) => {
    const ia = PREFERRED_BRANDS.indexOf(a); const ib = PREFERRED_BRANDS.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

let ITEMS_CACHE = null;
async function loadItems() {
  if (ITEMS_CACHE) return ITEMS_CACHE;
  try {
    const res = await fetch("/api/colour-library?items=1");
    const data = await res.json();
    ITEMS_CACHE = data?.items || [];
  } catch { ITEMS_CACHE = []; }
  return ITEMS_CACHE;
}

// Native select with a proper custom chevron + room for it, so the arrow never
// collides with the text.
const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5l3.5 3.5 3.5-3.5' fill='none' stroke='%237a766c' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
const selStyle = { width: "100%", padding: "8px 30px 8px 11px", borderRadius: 8, border: "1px solid #d5d0c6", background: `#fff ${CHEVRON} no-repeat right 10px center`, backgroundSize: "12px", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", font: "inherit", fontSize: 13, color: "#33322e", cursor: "pointer", textOverflow: "ellipsis" };
const inputStyle = { width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid #d5d0c6", background: "#fff", font: "inherit", fontSize: 13, color: "#33322e" };
const lbl = { display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#7a766c" };
const btn = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d5d0c6", background: "#fff", cursor: "pointer", font: "inherit", fontSize: 13, color: "#33322e" };
const btnPrimary = { ...btn, background: "#1f6f4a", color: "#fff", borderColor: "#1f6f4a", fontWeight: 600 };
const distinct = (arr, key) => [...new Set(arr.map((x) => x[key]).filter(Boolean))];

// True on phone-width screens, so the two-pane layout stacks and the dialog goes
// full-screen instead of a cramped centred box.
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 720);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return narrow;
}

// A comprehensive preset palette for a "flat colour" (no material finish) — used
// for the benchtop visual colour. Broad spread of neutrals, stones, timbers and
// accent hues so there's always something close.
const FLAT_PALETTE = [
  { hex: "#ffffff", name: "White" }, { hex: "#f5f3ee", name: "Off white" }, { hex: "#ece8df", name: "Cream" }, { hex: "#e0dcd2", name: "Stone" },
  { hex: "#cfc9bd", name: "Oat" }, { hex: "#b8b2a5", name: "Taupe" }, { hex: "#9c968a", name: "Warm grey" }, { hex: "#7d786e", name: "Mushroom" },
  { hex: "#5f5b53", name: "Dark taupe" }, { hex: "#454139", name: "Espresso" }, { hex: "#2b2823", name: "Charcoal" }, { hex: "#111111", name: "Black" },
  { hex: "#e9edf0", name: "Ice" }, { hex: "#cdd6db", name: "Mist" }, { hex: "#a9b7bf", name: "Slate blue" }, { hex: "#7d919c", name: "Steel" },
  { hex: "#566771", name: "Deep steel" }, { hex: "#33414a", name: "Gunmetal" }, { hex: "#dfe7df", name: "Sage mist" }, { hex: "#bcd0bf", name: "Sage" },
  { hex: "#8faf93", name: "Eucalypt" }, { hex: "#5f8266", name: "Forest" }, { hex: "#3c5a43", name: "Deep green" }, { hex: "#f0e2cf", name: "Sand" },
  { hex: "#e3c9a3", name: "Oak" }, { hex: "#c9a978", name: "Honey" }, { hex: "#a67c4e", name: "Walnut" }, { hex: "#7a5533", name: "Chestnut" },
  { hex: "#f4d9d5", name: "Blush" }, { hex: "#e0a9a0", name: "Clay" }, { hex: "#c56f63", name: "Terracotta" }, { hex: "#9c463c", name: "Brick" },
  { hex: "#e9d7ea", name: "Lilac" }, { hex: "#bfa5cf", name: "Lavender" }, { hex: "#f5ead0", name: "Butter" }, { hex: "#d9a441", name: "Amber" },
];

function FlatGrid({ value, onPick }) {
  const cur = (value || "").toLowerCase();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 12 }}>
      {FLAT_PALETTE.map((c) => {
        const on = cur === c.hex.toLowerCase();
        return (
          <button key={c.hex} type="button" title={c.name} onClick={() => onPick(c.hex)}
            style={{ display: "flex", flexDirection: "column", gap: 5, padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}>
            <span style={{ display: "block", width: "100%", aspectRatio: "1/1", borderRadius: 10, background: c.hex, outline: on ? "3px solid #1f6f4a" : "1px solid rgba(0,0,0,0.12)", outlineOffset: on ? 1 : 0 }} />
            <span style={{ fontSize: 11, color: "#4a473f", lineHeight: 1.2, fontWeight: 600 }}>{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function ColourPickerModal({ mode = "public", value, matchOptions = [], title = "colour", thicknessDefault = 16, showCost = true, onPick, onClose, allowFlat = false, flatValue = null, onPickFlat = null, canReset = false, onClear = null, notice = null, onlyThicknessMm = null }) {
  const admin = mode === "admin";
  const narrow = useNarrow();
  const [allItems, setItems] = useState(ITEMS_CACHE);
  const [loading, setLoading] = useState(!ITEMS_CACHE);
  // A structural part can be pinned to one board thickness — cleats are always
  // 18mm — so only the library rows actually available in it are offered. Each
  // library row IS a thickness variant, so this filters real stock, not just
  // the material family.
  const items = onlyThicknessMm
    ? (allItems || []).filter((i) => (parseInt(i.thickness, 10) || 0) === Number(onlyThicknessMm))
    : allItems;

  useEffect(() => {
    let live = true;
    if (ITEMS_CACHE) { setItems(ITEMS_CACHE); setLoading(false); }
    else loadItems().then((r) => { if (live) { setItems(r); setLoading(false); } });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const body = notice
    ? (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 40, textAlign: "center" }}>
        {notice}
        <button type="button" style={btn} onClick={onClose}>Close</button>
      </div>
    )
    : loading
    ? <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#8a867c" }}>Loading colours…</div>
    : !(items || []).length
      ? <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#8a867c", padding: 24, textAlign: "center" }}>
          {onlyThicknessMm
            ? `No colours in the library are available in ${onlyThicknessMm}mm.`
            : "No colours available right now."}
        </div>
      : admin
        ? <AdminBody items={items} value={value} matchOptions={matchOptions} thicknessDefault={thicknessDefault} showCost={showCost} onPick={onPick} onClose={onClose} allowFlat={allowFlat} flatValue={flatValue} onPickFlat={onPickFlat} canReset={canReset} onClear={onClear} narrow={narrow} />
        : <PublicBody items={items} value={value} onPick={onPick} narrow={narrow} />;

  return createPortal(
    <>
      {/* z above the design tool's own modals (1100/1101) so it works nested. */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1200 }} />
      <div role="dialog" aria-modal="true" aria-label={`Choose ${title}`}
        style={narrow
          ? { position: "fixed", inset: 0, zIndex: 1201, background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }
          : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1201, width: "min(960px, 96vw)", height: "min(660px, 92vh)", background: "#fff", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 20px", borderBottom: "1px solid #eae6dc", flexShrink: 0 }}>
          <strong style={{ fontSize: 16, color: "#26251f" }}>Choose {title}</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #ddd8cd", background: "#fff", cursor: "pointer", color: "#8a867c" }}>✕</button>
        </div>
        {body}
      </div>
    </>,
    document.body
  );
}

// Each tile is one specific library item; a thickness badge (top-right) and the
// read-only cost make it clear which config it is.
function SwatchGrid({ colours, isSelected, onClick, showThickness, showCost, empty }) {
  if (!colours.length) return <p style={{ color: "#8a867c", fontSize: 13 }}>{empty}</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 12 }}>
      {colours.map((c, i) => {
        const on = isSelected(c);
        return (
          <button key={c.id || `${c.material}|${c.finish}|${c.colour}|${c.thickness}|${i}`} type="button" title={`${c.colour} · ${c.finish}${c.thickness ? ` · ${c.thickness}` : ""}${c.supplier ? ` · ${c.supplier}` : ""}`}
            onClick={() => onClick(c)}
            style={{ display: "flex", flexDirection: "column", gap: 5, padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}>
            <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "1/1" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: 10, background: c.src ? `center/cover no-repeat url(${c.src})` : "#d9d4c8", outline: on ? "3px solid #1f6f4a" : "1px solid rgba(0,0,0,0.12)", outlineOffset: on ? 1 : 0 }} />
              {showThickness && c.thickness && (
                <span style={{ position: "absolute", top: 5, right: 5, background: "rgba(20,18,15,0.72)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 6, letterSpacing: "0.02em" }}>{c.thickness}</span>
              )}
            </span>
            <span style={{ fontSize: 11, color: "#4a473f", lineHeight: 1.2, fontWeight: 600 }}>{c.colour}</span>
            <span style={{ fontSize: 10, color: "#9a958a", lineHeight: 1.1 }}>{c.finish}</span>
            {showCost && c.cost > 0 && <span style={{ fontSize: 10, color: "#1f6f4a", lineHeight: 1.1 }}>${c.cost.toFixed(2)}/m²</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Public mode ── deduped to one tile per colour (thickness/cost irrelevant).
function PublicBody({ items, value, onPick, narrow = false }) {
  const [brand, setBrand] = useState(value?.supplier || "all");
  const [finish, setFinish] = useState("all");
  const [search, setSearch] = useState("");

  const deduped = useMemo(() => {
    const seen = new Set(); const out = [];
    for (const it of items) { const k = `${it.supplier}|${it.finish}|${it.colour}`.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(it); }
    return out;
  }, [items]);
  const suppliers = useMemo(() => sortBrands(distinct(deduped, "supplier")), [deduped]);
  const finishes = useMemo(() => distinct(deduped.filter((c) => brand === "all" || c.supplier === brand), "finish").sort((a, b) => a.localeCompare(b)), [deduped, brand]);
  const colours = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deduped.filter((c) => (brand === "all" || c.supplier === brand) && (finish === "all" || c.finish === finish) && (!q || c.colour.toLowerCase().includes(q)));
  }, [deduped, brand, finish, search]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: narrow ? "column" : "row", minHeight: 0 }}>
      <div style={{ width: narrow ? "100%" : 240, flexShrink: 0, borderRight: narrow ? "none" : "1px solid #eae6dc", borderBottom: narrow ? "1px solid #eae6dc" : "none", padding: narrow ? "12px 14px" : 18, display: "flex", flexDirection: narrow ? "row" : "column", flexWrap: narrow ? "wrap" : "nowrap", gap: narrow ? 10 : 16 }}>
        <label style={{ ...lbl, flex: narrow ? "1 1 45%" : "none" }}>Brand<select style={selStyle} value={brand} onChange={(e) => setBrand(e.target.value)}><option value="all">All brands</option>{suppliers.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label style={{ ...lbl, flex: narrow ? "1 1 45%" : "none" }}>Finish<select style={selStyle} value={finish} onChange={(e) => setFinish(e.target.value)}><option value="all">All finishes</option>{finishes.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
        <label style={{ ...lbl, flex: narrow ? "1 1 100%" : "none" }}>Search colour<input style={inputStyle} placeholder="e.g. Oak, White" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        {!narrow && <div style={{ marginTop: "auto", fontSize: 11.5, color: "#9a958a" }}>{colours.length} colour{colours.length === 1 ? "" : "s"}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 18 }}>
        <SwatchGrid colours={colours} empty="No colours match — try a different finish or clear the search."
          isSelected={(c) => value && value.colour === c.colour && (value.finish || "") === (c.finish || "")}
          onClick={(c) => onPick({ material: c.material, finish: c.finish, colour: c.colour, supplier: c.supplier, src: c.src })} />
      </div>
    </div>
  );
}

// ── Admin mode ── every library item; cost read-only.
function AdminBody({ items, value, matchOptions, thicknessDefault, showCost, onPick, onClose, allowFlat = false, flatValue = null, onPickFlat = null, canReset = false, onClear = null, narrow = false }) {
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [material, setMaterial] = useState("all");
  const [thickness, setThickness] = useState("all");
  const [finish, setFinish] = useState("all");
  const [matchMode, setMatchMode] = useState(false); // show colours used in THIS design
  // Start in flat mode if a flat colour is already set and no library colour is.
  const [flatMode, setFlatMode] = useState(Boolean(allowFlat && flatValue && !value?.colour));
  const [draft, setDraft] = useState(value?.colour
    ? { material: value.material, finish: value.finish, colour: value.colour, thicknessMm: value.thickness_mm || null, cost: value.cost_per_sqm ?? 0 }
    : null);

  const suppliers = useMemo(() => sortBrands(distinct(items, "supplier")), [items]);
  const materials = useMemo(() => {
    const m = new Map();
    items.forEach((i) => { if (i.material && !m.has(i.material)) m.set(i.material, i.materialLabel || i.material); });
    return [...m.entries()].map(([value2, label]) => ({ value: value2, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);
  const thicknesses = useMemo(() => distinct(items.filter((i) => material === "all" || i.material === material), "thickness").sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)), [items, material]);
  const finishes = useMemo(() => distinct(items, "finish").sort((a, b) => a.localeCompare(b)), [items]);

  const colours = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) =>
      (brand === "all" || c.supplier === brand) &&
      (material === "all" || c.material === material) &&
      (thickness === "all" || c.thickness === thickness) &&
      (finish === "all" || c.finish === finish) &&
      (!q || c.colour.toLowerCase().includes(q)));
  }, [items, brand, material, thickness, finish, search]);

  // Colours already used across the whole design — the "match" set as tiles.
  // The swatch image is resolved from the library by material/finish/colour.
  const usedTiles = useMemo(() => (matchOptions || []).map((o) => {
    const s = o.style || {};
    const lib = items.find((i) => i.material === s.material && (i.finish || "") === (s.finish || "") && i.colour === s.colour);
    return { colour: s.colour, finish: s.finish, material: s.material, thickness: s.thickness_mm ? `${s.thickness_mm}mm` : "", thicknessMm: s.thickness_mm || null, cost: s.cost_per_sqm || 0, src: lib?.src || "", role: o.label };
  }).filter((t) => t.colour), [matchOptions, items]);

  function pickUsed(t) {
    setDraft({ material: t.material, finish: t.finish, colour: t.colour, thicknessMm: t.thicknessMm, cost: t.cost });
    setMatchMode(false);
  }
  function save() {
    if (!draft) return;
    onPick({
      material: draft.material,
      finish: draft.finish,
      colour: draft.colour,
      thickness_mm: draft.thicknessMm || value?.thickness_mm || thicknessDefault,
      cost_per_sqm: showCost ? (Number(draft.cost) || 0) : 0,
    });
  }
  const isSelected = (c) => draft && draft.colour === c.colour && (draft.finish || "") === (c.finish || "") && draft.material === c.material && (draft.thicknessMm || null) === (c.thicknessMm || null);
  const toggleStyle = { ...btn, width: "100%", fontWeight: 600, fontSize: 12.5, background: matchMode ? "#1f6f4a" : "#fff", color: matchMode ? "#fff" : "#33322e", borderColor: matchMode ? "#1f6f4a" : "#d5d0c6" };

  return (
    <>
      <div style={{ flex: 1, display: "flex", flexDirection: narrow ? "column" : "row", minHeight: 0 }}>
        <div style={{ width: narrow ? "100%" : 262, flexShrink: 0, borderRight: narrow ? "none" : "1px solid #eae6dc", borderBottom: narrow ? "1px solid #eae6dc" : "none", padding: narrow ? "12px 14px" : 18, display: "flex", flexDirection: "column", gap: narrow ? 10 : 13, overflowY: "auto", maxHeight: narrow ? "40vh" : "none" }}>
          {allowFlat && (
            <button type="button" style={{ ...btn, width: "100%", fontWeight: 600, fontSize: 12.5, background: flatMode ? "#1f6f4a" : "#fff", color: flatMode ? "#fff" : "#33322e", borderColor: flatMode ? "#1f6f4a" : "#d5d0c6" }}
              onClick={() => { setFlatMode((f) => !f); setMatchMode(false); }}>
              {flatMode ? "✓ Flat colour" : "Use a flat colour"}
            </button>
          )}
          {!flatMode && usedTiles.length > 0 && (
            <button type="button" style={toggleStyle} onClick={() => setMatchMode((m) => !m)}>
              {matchMode ? "✓ Using colours from this design" : "Select from existing colours"}
            </button>
          )}
          {flatMode ? (
            <p style={{ fontSize: 11.5, color: "#8a867c", margin: 0, lineHeight: 1.5 }}>
              A plain colour instead of a material finish. Click any swatch on the right to set it.
            </p>
          ) : matchMode ? (
            <p style={{ fontSize: 11.5, color: "#8a867c", margin: 0, lineHeight: 1.5 }}>
              These are the colours already used across this design. Click one to reuse it — it fills in the material, finish, thickness and cost.
            </p>
          ) : (
            <>
              <label style={lbl}>Search colour<input style={inputStyle} placeholder="e.g. Oak, White" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <label style={lbl}>Brand<select style={selStyle} value={brand} onChange={(e) => setBrand(e.target.value)}><option value="all">All brands</option>{suppliers.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label style={lbl}>Material<select style={selStyle} value={material} onChange={(e) => { setMaterial(e.target.value); setThickness("all"); }}><option value="all">All materials</option>{materials.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
              <label style={lbl}>Thickness<select style={selStyle} value={thickness} onChange={(e) => setThickness(e.target.value)}><option value="all">All thicknesses</option>{thicknesses.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              <label style={lbl}>Finish<select style={selStyle} value={finish} onChange={(e) => setFinish(e.target.value)}><option value="all">All finishes</option>{finishes.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
            </>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 18 }}>
          {flatMode
            ? <FlatGrid value={flatValue} onPick={(hex) => onPickFlat && onPickFlat(hex)} />
            : matchMode
              ? <SwatchGrid colours={usedTiles} showThickness showCost={showCost} empty="No colours used in this design yet." isSelected={isSelected} onClick={pickUsed} />
              : <SwatchGrid colours={colours} showThickness showCost={showCost} empty="No colours match — try a different filter or clear the search."
                  isSelected={isSelected} onClick={(c) => setDraft({ material: c.material, finish: c.finish, colour: c.colour, thicknessMm: c.thicknessMm, cost: c.cost })} />}
        </div>
      </div>
      {!flatMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: "1px solid #eae6dc", background: "#faf8f3" }}>
          <span style={{ fontSize: 12.5, color: "#5a574f", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {draft?.colour ? `${draft.colour} · ${draft.finish} · ${draft.material}${draft.thicknessMm ? ` · ${draft.thicknessMm}mm` : ""}${showCost && draft.cost ? ` · $${Number(draft.cost).toFixed(2)}/m²` : ""}` : "No colour selected"}
          </span>
          {canReset && onClear && (
            <button type="button" style={btn} onClick={onClear}>Reset to default</button>
          )}
          <button type="button" style={btn} onClick={onClose}>Cancel</button>
          <button type="button" style={{ ...btnPrimary, opacity: draft?.colour ? 1 : 0.5, cursor: draft?.colour ? "pointer" : "default" }} disabled={!draft?.colour} onClick={save}>Save</button>
        </div>
      )}
    </>
  );
}
