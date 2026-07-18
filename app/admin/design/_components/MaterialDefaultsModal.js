"use client";

import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import styles from "../design.module.css";
import MaterialColourPicker from "./MaterialColourPicker";
import { FrontStyleFields } from "./DesignRightPanel";

// Every material-bearing item type in the design tool, in one flat list so
// each gets its own collapsible section and a universal "Same as…" copier.
// `group: "carcass"` sections live under defaults.carcass[key] (keyed by the
// real item_type, so the backend picks them up); the rest are top-level
// defaults buckets. `kind: "front"` uses the door/drawer style fields
// (profiles, edge mould); everything else is a plain board picker.
// Obstructions are the only item type excluded — they carry no material.
const SECTIONS = [
  { key: "base_cabinet",         label: "Base Cabinets",         group: "carcass", kind: "board", boardLabel: "Carcass Board", thicknessDefault: 16 },
  { key: "wall_cabinet",         label: "Wall Cabinets",         group: "carcass", kind: "board", boardLabel: "Carcass Board", thicknessDefault: 16 },
  { key: "tall_cabinet",         label: "Tall Cabinets",         group: "carcass", kind: "board", boardLabel: "Carcass Board", thicknessDefault: 16 },
  { key: "corner_base_cabinet",  label: "Corner Cabinets",       group: "carcass", kind: "board", boardLabel: "Carcass Board", thicknessDefault: 16 },
  { key: "blind_corner_cabinet", label: "Blind Corner Cabinets", group: "carcass", kind: "board", boardLabel: "Carcass Board", thicknessDefault: 16 },
  { key: "floating_shelf",       label: "Floating Shelves",      group: "top",     kind: "board", boardLabel: "Shelf Board",   thicknessDefault: 18,
    note: "Decorative-board floating shelves — the top, bottom and front boards all use this finish." },
  { key: "shelf",                label: "Internal Shelves",      group: "top",     kind: "board", boardLabel: "Shelf Board",   thicknessDefault: 16,
    note: "One default for every internal cabinet shelf, regardless of which cabinet it's in." },
  { key: "door",                 label: "Doors",                 group: "top",     kind: "front", boardLabel: "Door Board" },
  { key: "drawer",               label: "Drawer Fronts",         group: "top",     kind: "front", boardLabel: "Drawer Board" },
  { key: "panel",                label: "Panels & Scribes",      group: "top",     kind: "board", boardLabel: "Panel Board",   thicknessDefault: 18,
    note: "Standalone filler panels and scribes. Kickboard, end and back panels use the cabinet's own carcass material instead." },
];

function emptyDefaults() {
  return {
    carcass: { base_cabinet: {}, wall_cabinet: {}, tall_cabinet: {}, corner_base_cabinet: {}, blind_corner_cabinet: {} },
    floating_shelf: {},
    shelf: {},
    door: {},
    drawer: {},
    panel: {},
  };
}

// A project-wide starting point for board fields — applied once, when a
// cabinet/panel is first created (or, for door/drawer, the first time its
// front type is switched on), never retroactively. Every field stays fully
// editable afterward; this only saves re-picking the same material on every
// new item for jobs where it's consistent throughout.
export default function MaterialDefaultsModal({ projectId, initialDefaults, onClose, onSaved, onItemsChanged }) {
  const [defaults, setDefaults] = useState(() => {
    const base = emptyDefaults();
    if (!initialDefaults) return base;
    return {
      carcass: { ...base.carcass, ...(initialDefaults.carcass || {}) },
      floating_shelf: { ...base.floating_shelf, ...(initialDefaults.floating_shelf || {}) },
      shelf: { ...base.shelf, ...(initialDefaults.shelf || {}) },
      door: { ...base.door, ...(initialDefaults.door || {}) },
      drawer: { ...base.drawer, ...(initialDefaults.drawer || {}) },
      panel: { ...base.panel, ...(initialDefaults.panel || {}) },
    };
  });
  const [openKey, setOpenKey] = useState(SECTIONS[0].key);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");
  const [confirmApply, setConfirmApply] = useState(false);
  const confirmApplyTimer = useRef(null);

  function updCarcass(typeKey, patch) {
    setDefaults((d) => ({ ...d, carcass: { ...d.carcass, [typeKey]: { ...d.carcass[typeKey], ...patch } } }));
  }
  function updSection(key, patch) {
    setDefaults((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  }
  function getSection(sec) {
    return (sec.group === "carcass" ? defaults.carcass[sec.key] : defaults[sec.key]) || {};
  }
  function setSection(sec, patch) {
    if (sec.group === "carcass") updCarcass(sec.key, patch);
    else updSection(sec.key, patch);
  }
  // "Same as…" copies only the shared material core (material/finish/colour/
  // thickness/cost) between any two sections — so a door can match a carcass
  // without dragging across the door-only profile fields, and vice versa.
  function copyFrom(targetSec, sourceKey) {
    if (!sourceKey) return;
    const src = SECTIONS.find((s) => s.key === sourceKey);
    if (!src) return;
    const s = getSection(src);
    setSection(targetSec, {
      material: s.material || "",
      finish: s.finish || "",
      colour: s.colour || "",
      thickness_mm: s.thickness_mm ?? targetSec.thicknessDefault,
      cost_per_sqm: Number(s.cost_per_sqm) || 0,
    });
  }

  async function handleSave() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/design/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_defaults: defaults }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not save material defaults.");
      onSaved?.(data.project.material_defaults);
      onClose();
    } catch (e) {
      setErr(e?.message || "Could not save material defaults.");
    } finally {
      setSaving(false);
    }
  }

  // Force-overwrites every existing item's material fields to match the
  // defaults below — including items where a colour was already picked.
  // Click-to-arm, click-again-to-confirm (same pattern as the delete
  // buttons elsewhere) since this can't be undone from the UI.
  async function handleApplyToAll() {
    if (!confirmApply) {
      setConfirmApply(true);
      clearTimeout(confirmApplyTimer.current);
      confirmApplyTimer.current = setTimeout(() => setConfirmApply(false), 3000);
      return;
    }
    clearTimeout(confirmApplyTimer.current);
    setConfirmApply(false);
    setApplying(true);
    setErr("");
    setApplyMsg("");
    try {
      // Save whatever's on screen first, so "apply to all" always uses the
      // defaults currently shown here, not the last-saved version.
      const saveRes = await fetch(`/api/admin/design/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_defaults: defaults }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData.ok) throw new Error(saveData.error || "Could not save material defaults.");
      onSaved?.(saveData.project.material_defaults);

      const res = await fetch(`/api/admin/design/projects/${projectId}/apply-material-defaults`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not apply defaults to items.");
      setApplyMsg(`Applied to ${data.updated} item${data.updated === 1 ? "" : "s"}.`);
      onItemsChanged?.();
    } catch (e) {
      setErr(e?.message || "Could not apply defaults to items.");
    } finally {
      setApplying(false);
    }
  }

  function thicknessStr(obj) {
    return obj?.thickness_mm ? `${obj.thickness_mm}mm` : "";
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={styles.modalBox} role="dialog" aria-modal="true" aria-label="Material Defaults">
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Material Defaults</h2>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <p style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", margin: "0 0 12px", lineHeight: 1.4 }}>
            Applies once per project, as a starting point for new items — every field stays fully editable
            afterward. Carcass fills in when a cabinet is created; Door/Drawer fill in the first time a cabinet's
            front is switched to that type; Panel fills in when a standalone panel is added.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              border: "1px solid var(--dt-border-soft, rgba(0,0,0,0.1))",
              borderRadius: 6,
              padding: 10,
              marginBottom: 18,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>Apply to all existing items</p>
              <p style={{ fontSize: 10.5, color: "var(--dt-text-muted, #888780)", margin: "2px 0 0", lineHeight: 1.4 }}>
                Overwrites every matching item's material/finish/colour to the values below, even if already set.
              </p>
              {applyMsg && <p style={{ fontSize: 10.5, color: "var(--dt-success, #2f9e44)", margin: "4px 0 0" }}>{applyMsg}</p>}
            </div>
            <button
              type="button"
              className={`${styles.btn} ${confirmApply ? styles.deleteItemBtnConfirm : styles.btnSecondary}`}
              style={{ flexShrink: 0, whiteSpace: "nowrap" }}
              onClick={handleApplyToAll}
              disabled={applying}
            >
              {applying ? "Applying…" : confirmApply ? "Confirm — overwrite all?" : "Apply to all items"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SECTIONS.map((sec) => {
              const data = getSection(sec);
              const isOpen = openKey === sec.key;
              const summary = data.colour || data.material || "Not set";
              const others = SECTIONS.filter((s) => s.key !== sec.key);
              return (
                <div key={sec.key} style={{ border: "1px solid var(--dt-border-soft, rgba(0,0,0,0.1))", borderRadius: 6, overflow: "hidden" }}>
                  <button
                    type="button"
                    onClick={() => setOpenKey(isOpen ? null : sec.key)}
                    aria-expanded={isOpen}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 10, padding: "10px 12px", background: isOpen ? "var(--dt-bg-subtle, rgba(0,0,0,0.03))" : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{sec.label}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
                        {summary}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--dt-text-muted, #888780)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                        ▸
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "4px 12px 12px", borderTop: "1px solid var(--dt-border-soft, rgba(0,0,0,0.08))" }}>
                      {sec.note && (
                        <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "8px 0", lineHeight: 1.4 }}>
                          {sec.note}
                        </p>
                      )}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                        <select
                          className={styles.fieldSelect}
                          style={{ width: "auto", fontSize: 11 }}
                          value=""
                          onChange={(e) => copyFrom(sec, e.target.value)}
                        >
                          <option value="">Same as…</option>
                          {others.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                      </div>
                      {sec.kind === "front" ? (
                        <FrontStyleFields label={sec.boardLabel} style={data} onChange={(patch) => setSection(sec, patch)} />
                      ) : (
                        <MaterialColourPicker
                          label={sec.boardLabel}
                          material={data.material || ""}
                          thickness={thicknessStr(data)}
                          finish={data.finish || ""}
                          colour={data.colour || ""}
                          onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
                            setSection(sec, {
                              material, finish, colour,
                              thickness_mm: parseInt(thickness) || data.thickness_mm || sec.thicknessDefault,
                              cost_per_sqm: Number(costPerSqmExGst) || 0,
                            })
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {err && <p className={styles.importError}>{err}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Defaults"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
