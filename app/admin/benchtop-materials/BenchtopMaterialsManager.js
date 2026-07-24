"use client";

import { useEffect, useState } from "react";

// Admin catalogue for benchtop materials (audit p2-2) — the benchtop
// counterpart to the Colour Library. Backs the /api/admin/benchtop-materials
// CRUD endpoints. Rates are ex-GST $/m²; the design tool's benchtop picker
// reads this list and freezes the chosen rate onto the item.

const EMPTY_DRAFT = { name: "", cost_per_sqm_ex_gst: "", sort_order: "" };

const wrap = { maxWidth: 820, margin: "0 auto", padding: "8px 4px 60px" };
const card = { background: "#fff", border: "1px solid #e6e2d8", borderRadius: 10, padding: "18px 20px", marginBottom: 18 };
const th = { textAlign: "left", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "#8a8780", padding: "8px 10px", borderBottom: "1px solid #e6e2d8" };
const td = { padding: "8px 10px", borderBottom: "1px solid #f0ede5", verticalAlign: "middle" };
const input = { width: "100%", padding: "6px 8px", border: "1px solid #d8d3c8", borderRadius: 6, font: "inherit", boxSizing: "border-box" };
const btn = { padding: "7px 13px", borderRadius: 7, border: "1px solid #d8d3c8", background: "#fff", cursor: "pointer", font: "inherit", fontSize: 13 };
const btnPrimary = { ...btn, background: "#2f5d8f", color: "#fff", borderColor: "#2f5d8f" };
const btnDanger = { ...btn, color: "#b44230", borderColor: "#e3c9c3" };

export default function BenchtopMaterialsManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/benchtop-materials");
      const data = await res.json();
      if (data.ok) setRows(data.materials || []);
      else setError(data.error || "Could not load benchtop materials.");
    } catch {
      setError("Could not load benchtop materials.");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addRow() {
    const name = draft.name.trim();
    if (!name) { setError("Enter a material name."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/benchtop-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cost_per_sqm_ex_gst: Number(draft.cost_per_sqm_ex_gst) || 0,
          sort_order: Number(draft.sort_order) || 0,
        }),
      });
      const data = await res.json();
      if (data.ok) { setDraft(EMPTY_DRAFT); await load(); }
      else setError(data.error || "Could not add.");
    } catch {
      setError("Could not add benchtop material.");
    } finally { setBusy(false); }
  }

  // Optimistic local edit; persisted on blur / toggle.
  function editLocal(id, patch) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function persist(id, patch) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/benchtop-materials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (data.ok) setRows((r) => r.map((x) => (x.id === id ? data.material : x)));
      else setError(data.error || "Could not save.");
    } catch {
      setError("Could not save change.");
    } finally { setBusy(false); }
  }

  async function deleteRow(id) {
    if (typeof window !== "undefined" && !window.confirm("Delete this benchtop material?")) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/benchtop-materials?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) setRows((r) => r.filter((x) => x.id !== id));
      else setError(data.error || "Could not delete.");
    } catch {
      setError("Could not delete.");
    } finally { setBusy(false); }
  }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.01em" }}>Benchtop Materials</h1>
        <p style={{ margin: 0, color: "#6b6860", fontSize: 14 }}>
          The rate catalogue the design tool prices benchtops from — ex-GST $/m². Sink/cooktop cutouts and waterfall
          ends are charged as extras at import time.
        </p>
      </div>

      {error && (
        <div style={{ ...card, borderColor: "#e3c9c3", background: "#f9efec", color: "#b44230", marginBottom: 14 }}>{error}</div>
      )}

      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 520 }}>
            <thead>
              <tr>
                <th style={th}>Material</th>
                <th style={{ ...th, width: 140 }}>$/m² ex GST</th>
                <th style={{ ...th, width: 90 }}>Sort</th>
                <th style={{ ...th, width: 90 }}>Active</th>
                <th style={{ ...th, width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={5}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td style={td} colSpan={5}>No benchtop materials yet — add one below.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td style={td}>
                    <input style={input} value={row.name || ""}
                      onChange={(e) => editLocal(row.id, { name: e.target.value })}
                      onBlur={(e) => persist(row.id, { name: e.target.value.trim() })} />
                  </td>
                  <td style={td}>
                    <input style={input} type="number" min="0" step="1" value={row.cost_per_sqm_ex_gst ?? ""}
                      onChange={(e) => editLocal(row.id, { cost_per_sqm_ex_gst: e.target.value })}
                      onBlur={(e) => persist(row.id, { cost_per_sqm_ex_gst: Number(e.target.value) || 0 })} />
                  </td>
                  <td style={td}>
                    <input style={input} type="number" step="1" value={row.sort_order ?? 0}
                      onChange={(e) => editLocal(row.id, { sort_order: e.target.value })}
                      onBlur={(e) => persist(row.id, { sort_order: Number(e.target.value) || 0 })} />
                  </td>
                  <td style={td}>
                    <input type="checkbox" checked={Boolean(row.is_active)}
                      onChange={(e) => { editLocal(row.id, { is_active: e.target.checked }); persist(row.id, { is_active: e.target.checked }); }} />
                  </td>
                  <td style={td}>
                    <button type="button" style={btnDanger} disabled={busy} onClick={() => deleteRow(row.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Add a benchtop material</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "2 1 200px", fontSize: 12, color: "#6b6860" }}>
            Material name
            <input style={{ ...input, marginTop: 4 }} value={draft.name}
              placeholder="e.g. Engineered Stone 20mm"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </label>
          <label style={{ flex: "1 1 120px", fontSize: 12, color: "#6b6860" }}>
            $/m² ex GST
            <input style={{ ...input, marginTop: 4 }} type="number" min="0" step="1" value={draft.cost_per_sqm_ex_gst}
              onChange={(e) => setDraft((d) => ({ ...d, cost_per_sqm_ex_gst: e.target.value }))} />
          </label>
          <label style={{ flex: "1 1 80px", fontSize: 12, color: "#6b6860" }}>
            Sort
            <input style={{ ...input, marginTop: 4 }} type="number" step="1" value={draft.sort_order}
              onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))} />
          </label>
          <button type="button" style={btnPrimary} disabled={busy || !draft.name.trim()} onClick={addRow}>
            {busy ? "Saving…" : "Add material"}
          </button>
        </div>
      </div>
    </div>
  );
}
