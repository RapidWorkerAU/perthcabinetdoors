"use client";

// The public planner's colour chooser — a two-column browser:
//   • LEFT (fixed, doesn't scroll): supplier + finish dropdowns and a colour
//     name search.
//   • RIGHT (scrolls): every colour matching those filters, as a swatch grid.
// Reads the same public colour-library API the admin tool uses; each colour
// already carries its supplier + finish, so we just regroup and filter them.

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { COLOUR_IMAGE_MATERIALS } from "../../../lib/pcd-colour-images";

const PREFERRED = ["Laminex", "Polytec"]; // brands we lead with

let CACHE = null;
async function loadAllColours() {
  if (CACHE) return CACHE;
  const perMaterial = await Promise.all(
    COLOUR_IMAGE_MATERIALS.map(async (material) => {
      try {
        const res = await fetch(`/api/colour-library?material=${encodeURIComponent(material)}`);
        const data = await res.json();
        return { material, groups: data?.colourFamily?.groups || [] };
      } catch {
        return { material, groups: [] };
      }
    })
  );
  const seen = new Set();
  const records = [];
  for (const { material, groups } of perMaterial) {
    for (const group of groups) {
      for (const colour of group.colours || []) {
        const supplier = colour.supplier || "Polytec";
        const finish = group.label || "Standard";
        const key = `${supplier}|${finish}|${colour.name}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        records.push({ supplier, finish, colour: colour.name, material, src: colour.src || "" });
      }
    }
  }
  CACHE = records;
  return records;
}

const sortSuppliers = (list) =>
  [...list].sort((a, b) => {
    const ia = PREFERRED.indexOf(a); const ib = PREFERRED.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

const selectStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d5d0c6", background: "#fff", font: "inherit", fontSize: 13, color: "#33322e", cursor: "pointer" };

export default function PublicColourModal({ surfaceLabel, value, onPick, onClose }) {
  const [records, setRecords] = useState(CACHE);
  const [loading, setLoading] = useState(!CACHE);
  const [supplier, setSupplier] = useState(value?.supplier || null);
  const [finish, setFinish] = useState(value?.finish || "all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let live = true;
    if (CACHE) { setRecords(CACHE); setLoading(false); }
    else loadAllColours().then((r) => { if (live) { setRecords(r); setLoading(false); } });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const suppliers = useMemo(() => sortSuppliers([...new Set((records || []).map((r) => r.supplier))]), [records]);
  useEffect(() => {
    if (!supplier && suppliers.length) setSupplier(suppliers.includes(value?.supplier) ? value.supplier : suppliers[0]);
  }, [suppliers, supplier, value]);

  const finishes = useMemo(
    () => [...new Set((records || []).filter((r) => r.supplier === supplier).map((r) => r.finish))].sort((a, b) => a.localeCompare(b)),
    [records, supplier]
  );
  // Keep the finish valid for the chosen supplier.
  useEffect(() => {
    if (finish !== "all" && supplier && finishes.length && !finishes.includes(finish)) setFinish("all");
  }, [supplier, finishes, finish]);

  const colours = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (records || []).filter((r) =>
      r.supplier === supplier &&
      (finish === "all" || r.finish === finish) &&
      (!q || r.colour.toLowerCase().includes(q))
    );
  }, [records, supplier, finish, search]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
      <div role="dialog" aria-modal="true" aria-label={`Choose ${surfaceLabel} colour`}
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: "min(900px, 95vw)", height: "min(620px, 88vh)", background: "#fff", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 20px", borderBottom: "1px solid #eae6dc", flexShrink: 0 }}>
          <strong style={{ fontSize: 16, color: "#26251f" }}>Choose {surfaceLabel} colour</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #ddd8cd", background: "#fff", cursor: "pointer", color: "#8a867c" }}>✕</button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#8a867c" }}>Loading colours…</div>
        ) : suppliers.length === 0 ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#8a867c" }}>No colours available right now.</div>
        ) : (
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            {/* LEFT rail — filters, fixed */}
            <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid #eae6dc", padding: 18, display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#7a766c" }}>
                Brand
                <select style={selectStyle} value={supplier || ""} onChange={(e) => setSupplier(e.target.value)}>
                  {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#7a766c" }}>
                Finish
                <select style={selectStyle} value={finish} onChange={(e) => setFinish(e.target.value)}>
                  <option value="all">All finishes</option>
                  {finishes.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#7a766c" }}>
                Search colour
                <input style={{ ...selectStyle, cursor: "text" }} placeholder="e.g. Oak, White…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <div style={{ marginTop: "auto", fontSize: 11.5, color: "#9a958a" }}>{colours.length} colour{colours.length === 1 ? "" : "s"}</div>
            </div>

            {/* RIGHT — scrolling grid */}
            <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 18 }}>
              {colours.length === 0 ? (
                <p style={{ color: "#8a867c", fontSize: 13 }}>No colours match — try a different finish or clear the search.</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 12 }}>
                  {colours.map((c) => {
                    const on = value && value.colour === c.colour && (value.finish || "") === (c.finish || "");
                    return (
                      <button key={`${c.finish}|${c.colour}`} type="button" title={`${c.colour} · ${c.finish}`}
                        onClick={() => onPick({ material: c.material, finish: c.finish, colour: c.colour, supplier: c.supplier, src: c.src })}
                        style={{ display: "flex", flexDirection: "column", gap: 5, padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ display: "block", width: "100%", aspectRatio: "1/1", borderRadius: 10, background: c.src ? `center/cover no-repeat url(${c.src})` : "#d9d4c8", outline: on ? "3px solid #1f6f4a" : "1px solid rgba(0,0,0,0.12)", outlineOffset: on ? 1 : 0 }} />
                        <span style={{ fontSize: 11, color: "#4a473f", lineHeight: 1.25, fontWeight: 600 }}>{c.colour}</span>
                        {finish === "all" && <span style={{ fontSize: 10, color: "#9a958a", lineHeight: 1.1 }}>{c.finish}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
