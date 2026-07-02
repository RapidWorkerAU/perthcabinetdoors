"use client";

import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import styles from "../design.module.css";
import MaterialColourPicker from "./MaterialColourPicker";
import { FrontStyleFields } from "./DesignRightPanel";

const CARCASS_TYPES = [
  { key: "base_cabinet",         label: "Base Cabinets" },
  { key: "wall_cabinet",         label: "Wall Cabinets" },
  { key: "tall_cabinet",         label: "Tall Cabinets" },
  { key: "corner_base_cabinet",  label: "Corner Cabinets" },
];

function emptyDefaults() {
  return {
    carcass: { base_cabinet: {}, wall_cabinet: {}, tall_cabinet: {}, corner_base_cabinet: {} },
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
      shelf: { ...base.shelf, ...(initialDefaults.shelf || {}) },
      door: { ...base.door, ...(initialDefaults.door || {}) },
      drawer: { ...base.drawer, ...(initialDefaults.drawer || {}) },
      panel: { ...base.panel, ...(initialDefaults.panel || {}) },
    };
  });
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
  function copyCarcassFrom(targetKey, sourceKey) {
    if (!sourceKey) return;
    setDefaults((d) => ({ ...d, carcass: { ...d.carcass, [targetKey]: { ...d.carcass[sourceKey] } } }));
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
      confirmApplyTimer.current = setTimeout(() => setConfirmApply(false), 4000);
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

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                Carcass
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {CARCASS_TYPES.map(({ key, label }, idx) => {
                  const c = defaults.carcass[key] || {};
                  const otherTypes = CARCASS_TYPES.filter((t) => t.key !== key);
                  return (
                    <div key={key} style={{ border: "1px solid var(--dt-border-soft, rgba(0,0,0,0.1))", borderRadius: 6, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
                        {idx > 0 && (
                          <select
                            className={styles.fieldSelect}
                            style={{ width: "auto", fontSize: 11 }}
                            value=""
                            onChange={(e) => copyCarcassFrom(key, e.target.value)}
                          >
                            <option value="">Same as…</option>
                            {otherTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                          </select>
                        )}
                      </div>
                      <MaterialColourPicker
                        label="Carcass Board"
                        material={c.material || ""}
                        thickness={thicknessStr(c)}
                        finish={c.finish || ""}
                        colour={c.colour || ""}
                        onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
                          updCarcass(key, {
                            material, finish, colour,
                            thickness_mm: parseInt(thickness) || c.thickness_mm || 16,
                            cost_per_sqm: costPerSqmExGst || c.cost_per_sqm || 0,
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                Shelves
              </h3>
              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 8px", lineHeight: 1.4 }}>
                One default for every shelf, regardless of which cabinet it's in.
              </p>
              <MaterialColourPicker
                label="Shelf Board"
                material={defaults.shelf.material || ""}
                thickness={thicknessStr(defaults.shelf)}
                finish={defaults.shelf.finish || ""}
                colour={defaults.shelf.colour || ""}
                onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
                  updSection("shelf", {
                    material, finish, colour,
                    thickness_mm: parseInt(thickness) || defaults.shelf.thickness_mm || 16,
                    cost_per_sqm: costPerSqmExGst || defaults.shelf.cost_per_sqm || 0,
                  })
                }
              />
            </div>

            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                Doors
              </h3>
              <FrontStyleFields label="Door Board" style={defaults.door} onChange={(patch) => updSection("door", patch)} />
            </div>

            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                Drawer Fronts
              </h3>
              <FrontStyleFields label="Drawer Board" style={defaults.drawer} onChange={(patch) => updSection("drawer", patch)} />
            </div>

            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                Panels
              </h3>
              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 8px", lineHeight: 1.4 }}>
                Standalone filler panels only — kickboard/end/back panels use the cabinet's own carcass material instead.
              </p>
              <MaterialColourPicker
                label="Panel Board"
                material={defaults.panel.material || ""}
                thickness={thicknessStr(defaults.panel)}
                finish={defaults.panel.finish || ""}
                colour={defaults.panel.colour || ""}
                onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
                  updSection("panel", {
                    material, finish, colour,
                    thickness_mm: parseInt(thickness) || defaults.panel.thickness_mm || 18,
                    cost_per_sqm: costPerSqmExGst || defaults.panel.cost_per_sqm || 0,
                  })
                }
              />
            </div>
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
