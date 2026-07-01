"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../design.module.css";
import MaterialColourPicker from "./MaterialColourPicker";
import {
  edgeProfilesForMaterial,
  profileNamesForSelection,
  profileTypesForSelection,
} from "../../../../lib/quote-form-data";

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet"];

const TYPE_LABELS = {
  base_cabinet:  "Base Cabinet",
  wall_cabinet:  "Wall Cabinet",
  tall_cabinet:  "Tall Cabinet",
  door:          "Door",
  drawer_front:  "Drawer Front",
  panel:         "Panel",
};

// Shared inline section divider used across tabs — right panel has a white background
function SectionDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
      <div style={{ flex: 1, height: 1, background: "var(--dt-border-soft, rgba(0,0,0,0.08))" }} />
      <span style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--dt-border-soft, rgba(0,0,0,0.08))" }} />
    </div>
  );
}

const ROTATION_OPTIONS = [
  { value: 0,   label: "0° (front faces room)" },
  { value: 90,  label: "90° CW" },
  { value: 180, label: "180° (back faces room)" },
  { value: 270, label: "270° CCW" },
];

function emptyDraft() {
  return {
    item_type: "base_cabinet",
    wall: "top",  // default wall — user drags to reassign after adding
    label: "",
    width_mm: 600,
    height_mm: 720,
    depth_mm: 600,
    qty: 1,
    x_mm: 0,
    y_mm: 0,
    rotation: 0,
    material: "",
    finish: "",
    colour: "",
    notes: "",
  };
}

// ---- Add item form ----
function AddItemForm({ onAdd, onCancel }) {
  const [draft, setDraft] = useState(() => emptyDraft());
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState("");

  function set(key, val) { setDraft((d) => ({ ...d, [key]: val })); }

  async function handleAdd() {
    if (!draft.item_type) return;
    setBusy(true); setErr("");
    try {
      await onAdd(draft);
    } catch (e) {
      setErr(e?.message || "Could not add item.");
    } finally {
      setBusy(false);
    }
  }

  const isCabinet = CABINET_TYPES.includes(draft.item_type);

  return (
    <div className={styles.addItemForm}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>
          Type
          <select className={styles.fieldSelect} value={draft.item_type} onChange={(e) => set("item_type", e.target.value)}>
            {CABINET_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Label
          <input className={styles.fieldInput} value={draft.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Sink base" />
        </label>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            Width mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm} onChange={(e) => set("width_mm", e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Height mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.height_mm} onChange={(e) => set("height_mm", e.target.value)} />
          </label>
        </div>
        {isCabinet && (
          <label className={styles.fieldLabel}>
            Depth mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm} onChange={(e) => set("depth_mm", e.target.value)} />
          </label>
        )}
        <label className={styles.fieldLabel}>
          Qty
          <input className={styles.fieldInput} type="number" min="1" value={draft.qty} onChange={(e) => set("qty", e.target.value)} />
        </label>
      </div>
      {err && <p className={styles.feedback}>{err}</p>}
      <div className={styles.addItemActions}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleAdd} disabled={busy}>
          {busy ? "Adding…" : "Add Item"}
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Cabinet config form ----
function CabinetConfigForm({ item, onItemChange }) {
  const [activeTab, setActiveTab] = useState("Dimensions");
  const [draft, setDraft]         = useState(item);
  const [saving, setSaving]       = useState(false);
  const timerRef                  = useRef(null);
  const latestRef                 = useRef(draft);
  const pendingPatchRef           = useRef({});
  const onItemChangeRef           = useRef(onItemChange);
  onItemChangeRef.current = onItemChange;

  // Reset whole form when switching to a different item
  useEffect(() => {
    setDraft(item);
    latestRef.current = item;
    pendingPatchRef.current = {};
    clearTimeout(timerRef.current);
    setSaving(false);
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush any unsaved edits immediately when the user switches away from this
  // item (deselects, picks another cabinet) instead of losing them — a bare
  // debounce timer alone silently dropped whichever field was edited earlier
  // if a different field was edited again before the 600ms delay elapsed.
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      const patch = pendingPatchRef.current;
      if (Object.keys(patch).length) onItemChangeRef.current(item.id, patch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Sync mount_height_mm when changed externally (e.g., dragged in the front elevation)
  useEffect(() => {
    setDraft((prev) => ({ ...prev, mount_height_mm: item.mount_height_mm }));
    latestRef.current = { ...latestRef.current, mount_height_mm: item.mount_height_mm };
  }, [item.mount_height_mm]); // eslint-disable-line react-hooks/exhaustive-deps

  function flushPending() {
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (!Object.keys(patch).length) {
      setSaving(false);
      return;
    }
    onItemChangeRef.current(item.id, patch).finally(() => setSaving(false));
  }

  function set(key, val) {
    const next = { ...latestRef.current, [key]: val };
    latestRef.current = next;
    setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, [key]: val };
    clearTimeout(timerRef.current);
    setSaving(true);
    timerRef.current = setTimeout(flushPending, 600);
  }

  function setMulti(patch) {
    const next = { ...latestRef.current, ...patch };
    latestRef.current = next;
    setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    clearTimeout(timerRef.current);
    setSaving(true);
    timerRef.current = setTimeout(flushPending, 600);
  }

  // For discrete choices (radios, selects, colour pickers) — save immediately
  // rather than debouncing, so there is no window in which a quick click-away
  // could lose the choice.
  function setNow(key, val) {
    const next = { ...latestRef.current, [key]: val };
    latestRef.current = next;
    setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, [key]: val };
    clearTimeout(timerRef.current);
    setSaving(true);
    flushPending();
  }

  function setMultiNow(patch) {
    const next = { ...latestRef.current, ...patch };
    latestRef.current = next;
    setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    clearTimeout(timerRef.current);
    setSaving(true);
    flushPending();
  }

  // Auto-switch away from Doors tab if front type is changed away from "doors"
  useEffect(() => {
    if (activeTab === "Doors" && draft.front_type !== "doors") {
      setActiveTab("Dimensions");
    }
  }, [draft.front_type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamic tab list — "Doors" tab only appears when front_type === "doors"
  const tabs = [
    "Dimensions",
    "Boards",
    "Back & Shelves",
    ...(draft.front_type === "doors" ? ["Doors"] : []),
    "Notes",
  ];

  // ---- Door config helpers (used by Doors tab) ----
  const doorCfg    = draft.door_config  || {};
  const doorCols   = Math.max(1, doorCfg.columns || 1);
  const doorRows   = Math.max(1, doorCfg.rows    || 1);
  const doorHinges = doorCfg.hinges      || Array(doorCols).fill("L");
  const doorEqW    = doorCfg.equal_width !== false;
  const doorRatios = doorCfg.width_ratios || Array(doorCols).fill(1 / doorCols);

  const doorStyle    = draft.door_style || {};
  const dsMat        = doorStyle.material    || "";
  const dsThk        = doorStyle.thickness_mm ? `${doorStyle.thickness_mm}mm` : "";
  const dsProfTypes  = profileTypesForSelection(dsMat, dsThk);
  const dsProfNames  = profileNamesForSelection(doorStyle.profile_type || "", dsMat, dsThk);
  const dsEdgeProfs  = edgeProfilesForMaterial(dsMat);

  function updDoorCfg(patch) {
    const prev = latestRef.current.door_config || {};
    setNow("door_config", { ...prev, ...patch });
  }

  function updDoorStyle(patch) {
    const prev = latestRef.current.door_style || {};
    setNow("door_style", { ...prev, ...patch });
  }

  function onDoorColsChange(newCols) {
    const prev = latestRef.current.door_config || {};
    const prevH = prev.hinges || [];
    const hinges = Array.from({ length: newCols }, (_, i) =>
      i < prevH.length ? prevH[i] : (i === 0 ? "L" : "R")
    );
    setNow("door_config", {
      ...prev,
      columns:      newCols,
      hinges,
      equal_width:  newCols === 1 ? true : (prev.equal_width ?? true),
      width_ratios: Array(newCols).fill(1 / newCols),
    });
  }

  function onDoorHingeChange(col, val) {
    const prev = latestRef.current.door_config || {};
    const h = [...(prev.hinges || [])];
    h[col] = val;
    setNow("door_config", { ...prev, hinges: h });
  }

  function onDoorRatioChange(col, ratio) {
    const prev = latestRef.current.door_config || {};
    const r = [...(prev.width_ratios || [])];
    r[col] = Math.max(0.05, Math.min(0.95, ratio));
    set("door_config", { ...prev, width_ratios: r });
  }

  return (
    <>
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className={styles.rightScroll}>
        {activeTab === "Dimensions" && (
          <div className={styles.formSection}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                Label
                <input className={styles.fieldInput} value={draft.label || ""} onChange={(e) => set("label", e.target.value)} />
              </label>
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>
                  Width mm
                  <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm || ""} onChange={(e) => set("width_mm", e.target.value)} />
                </label>
                <label className={styles.fieldLabel}>
                  Height mm
                  <input className={styles.fieldInput} type="number" min="1" value={draft.height_mm || ""} onChange={(e) => set("height_mm", e.target.value)} />
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>
                  Depth mm
                  <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm || ""} onChange={(e) => set("depth_mm", e.target.value)} />
                </label>
                <label className={styles.fieldLabel}>
                  Qty
                  <input className={styles.fieldInput} type="number" min="1" value={draft.qty || 1} onChange={(e) => set("qty", e.target.value)} />
                </label>
              </div>
              {draft.item_type === "wall_cabinet" && (
                <label className={styles.fieldLabel}>
                  Mount height mm
                  <input className={styles.fieldInput} type="number" min="0" value={draft.mount_height_mm ?? 1400} onChange={(e) => set("mount_height_mm", Number(e.target.value))} />
                </label>
              )}
              {draft.wall === "island" && (
                <label className={styles.fieldLabel}>
                  Rotation
                  <select className={styles.fieldSelect} value={draft.rotation || 0} onChange={(e) => setNow("rotation", Number(e.target.value))}>
                    {ROTATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              )}

              <SectionDivider label="Cabinet Front" />
              <div style={{ display: "flex", gap: 14 }}>
                {[["none", "None"], ["doors", "Doors"], ["drawers", "Drawers"]].map(([val, label]) => (
                  <label key={val} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--dt-text, #1c1c1a)", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name={`front_type_${item.id}`}
                      value={val}
                      checked={(draft.front_type ?? "none") === val}
                      onChange={() => setNow("front_type", val)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {draft.front_type === "doors" && (
                <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "2px 0 0", lineHeight: 1.4 }}>
                  Configure door layout and style in the Doors tab.
                </p>
              )}

              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "4px 0 0", lineHeight: 1.4 }}>
                Drag the cabinet on the floor plan to reposition. Wall assigns automatically.
              </p>
            </div>
          </div>
        )}

        {activeTab === "Boards" && (
          <div className={styles.formSection}>
            <div className={styles.fieldGroup}>
              <MaterialColourPicker
                label="Carcass Board"
                material={draft.material || ""}
                thickness={draft.carcass_thickness_mm ? `${draft.carcass_thickness_mm}mm` : ""}
                finish={draft.finish || ""}
                colour={draft.colour || ""}
                onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
                  setMultiNow({
                    material,
                    finish,
                    colour,
                    carcass_thickness_mm: parseInt(thickness) || (draft.carcass_thickness_mm || 16),
                    cost_per_sqm_carcass: costPerSqmExGst || draft.cost_per_sqm_carcass || 0,
                  })
                }
              />
              <label className={styles.fieldLabel}>
                Cost per sqm — carcass ($)
                <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.cost_per_sqm_carcass || ""} onChange={(e) => set("cost_per_sqm_carcass", e.target.value)} placeholder="0.00" />
              </label>
              <label className={styles.fieldLabel}>
                Unit cost mode
                <select className={styles.fieldSelect} value={draft.unit_cost_mode || "auto"} onChange={(e) => setNow("unit_cost_mode", e.target.value)}>
                  <option value="auto">Auto (calculated)</option>
                  <option value="manual">Manual (override)</option>
                </select>
              </label>
              {draft.unit_cost_mode === "manual" && (
                <label className={styles.fieldLabel}>
                  Unit cost per sqm ex GST ($)
                  <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.unit_cost_per_sqm_ex_gst || ""} onChange={(e) => set("unit_cost_per_sqm_ex_gst", e.target.value)} placeholder="0.00" />
                </label>
              )}
            </div>
          </div>
        )}

        {activeTab === "Back & Shelves" && (
          <div className={styles.formSection}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldCheckLabel}>
                <input
                  type="checkbox"
                  checked={draft.back_panel_included ?? true}
                  onChange={(e) => setNow("back_panel_included", e.target.checked)}
                />
                Include back panel
              </label>
              {draft.back_panel_included && (
                <label className={styles.fieldLabel}>
                  Back panel thickness mm
                  <input className={styles.fieldInput} type="number" min="1" value={draft.back_panel_thickness_mm || 16} onChange={(e) => set("back_panel_thickness_mm", e.target.value)} />
                </label>
              )}
              <label className={styles.fieldLabel}>
                Shelf qty
                <input className={styles.fieldInput} type="number" min="0" value={draft.shelf_qty || 0} onChange={(e) => set("shelf_qty", e.target.value)} />
              </label>
              {Number(draft.shelf_qty) > 0 && (
                <>
                  <MaterialColourPicker
                    label="Shelf Board"
                    material={draft.shelf_material || ""}
                    thickness={draft.shelf_thickness_mm ? `${draft.shelf_thickness_mm}mm` : ""}
                    finish={draft.shelf_finish || ""}
                    colour={draft.shelf_colour || ""}
                    onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
                      setMultiNow({
                        shelf_material: material,
                        shelf_finish: finish,
                        shelf_colour: colour,
                        shelf_thickness_mm: parseInt(thickness) || (draft.shelf_thickness_mm || 16),
                        cost_per_sqm_shelf: costPerSqmExGst || draft.cost_per_sqm_shelf || 0,
                      })
                    }
                  />
                  <label className={styles.fieldLabel}>
                    Cost per sqm — shelf ($)
                    <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.cost_per_sqm_shelf || ""} onChange={(e) => set("cost_per_sqm_shelf", e.target.value)} placeholder="0.00" />
                  </label>
                </>
              )}

              {/* ── Kickboard / Plinth — not applicable to wall cabinets ── */}
              {draft.item_type !== "wall_cabinet" && (
                <>
                  <SectionDivider label="Kickboard / Plinth" />
                  <label className={styles.fieldCheckLabel}>
                    <input
                      type="checkbox"
                      checked={draft.has_kickboard ?? false}
                      onChange={(e) => setNow("has_kickboard", e.target.checked)}
                    />
                    Include kickboard / plinth
                  </label>
                  {draft.has_kickboard && (
                    <>
                      <div className={styles.fieldRow}>
                        <label className={styles.fieldLabel}>
                          Height mm
                          <input
                            className={styles.fieldInput}
                            type="number"
                            min="1"
                            value={draft.kickboard_height_mm ?? 150}
                            onChange={(e) => set("kickboard_height_mm", Number(e.target.value))}
                          />
                        </label>
                        <label className={styles.fieldLabel}>
                          Thickness mm
                          <input
                            className={styles.fieldInput}
                            type="number"
                            min="1"
                            value={draft.kickboard_thickness_mm ?? 16}
                            onChange={(e) => set("kickboard_thickness_mm", Number(e.target.value))}
                          />
                        </label>
                      </div>
                      <label className={styles.fieldLabel}>
                        Spanning style
                        <select
                          className={styles.fieldSelect}
                          value={draft.kickboard_span ?? "continuous"}
                          onChange={(e) => setNow("kickboard_span", e.target.value)}
                        >
                          <option value="continuous">Continuous (spans across adjacent cabinets)</option>
                          <option value="individual">Individual (separate piece per cabinet)</option>
                        </select>
                      </label>
                      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                        Continuous kickboard runs are calculated as one piece across the full run in the cut list. Material defaults to carcass.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "Doors" && (
          <div className={styles.formSection}>
            <div className={styles.fieldGroup}>
              {/* ── Layout ── */}
              <SectionDivider label="Layout" />
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>
                  Doors across
                  <select className={styles.fieldSelect} value={doorCols} onChange={(e) => onDoorColsChange(Number(e.target.value))}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </label>
                {draft.item_type === "tall_cabinet" && (
                  <label className={styles.fieldLabel}>
                    Rows high
                    <select className={styles.fieldSelect} value={doorRows} onChange={(e) => updDoorCfg({ rows: Number(e.target.value) })}>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                    </select>
                  </label>
                )}
              </div>

              {/* ── Hinge sides ── */}
              <SectionDivider label="Hinge sides" />
              {Array.from({ length: doorCols }).map((_, col) => (
                <label key={col} className={styles.fieldLabel}>
                  {doorCols === 1 ? "Hinge side" : `Door ${col + 1} hinge`}
                  <select className={styles.fieldSelect}
                    value={doorHinges[col] || "L"}
                    onChange={(e) => onDoorHingeChange(col, e.target.value)}>
                    <option value="L">Left side</option>
                    <option value="R">Right side</option>
                  </select>
                </label>
              ))}

              {/* ── Width ratios (2+ columns only) ── */}
              {doorCols > 1 && (
                <>
                  <label className={styles.fieldCheckLabel}>
                    <input type="checkbox"
                      checked={doorEqW}
                      onChange={(e) => updDoorCfg({ equal_width: e.target.checked, width_ratios: Array(doorCols).fill(1 / doorCols) })}
                    />
                    Equal door widths
                  </label>
                  {!doorEqW && (
                    <>
                      {Array.from({ length: doorCols }).map((_, col) => {
                        const totalR = doorRatios.reduce((s, r) => s + r, 0) || 1;
                        return (
                          <label key={col} className={styles.fieldLabel}>
                            Door {col + 1} width %
                            <input className={styles.fieldInput} type="number" min="10" max="90"
                              value={Math.round((doorRatios[col] / totalR) * 100)}
                              onChange={(e) => onDoorRatioChange(col, Number(e.target.value) / 100)} />
                          </label>
                        );
                      })}
                      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                        Percentages are relative and will be normalised automatically.
                      </p>
                    </>
                  )}
                </>
              )}

              {/* ── Door Style ── */}
              <SectionDivider label="Door Style" />
              <MaterialColourPicker
                label="Door Board"
                material={dsMat}
                thickness={dsThk}
                finish={doorStyle.finish || ""}
                colour={doorStyle.colour || ""}
                onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
                  updDoorStyle({
                    material,
                    finish,
                    colour,
                    thickness_mm:  parseInt(thickness) || doorStyle.thickness_mm || 18,
                    cost_per_sqm:  costPerSqmExGst || doorStyle.cost_per_sqm || 0,
                  })
                }
              />

              {dsProfTypes.length > 0 && (
                <>
                  <label className={styles.fieldLabel}>
                    Profile type
                    <select className={styles.fieldSelect} value={doorStyle.profile_type || ""} onChange={(e) => updDoorStyle({ profile_type: e.target.value, profile: "" })}>
                      <option value="">None</option>
                      {dsProfTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  {dsProfNames.length > 0 && (
                    <label className={styles.fieldLabel}>
                      Profile
                      <select className={styles.fieldSelect} value={doorStyle.profile || ""} onChange={(e) => updDoorStyle({ profile: e.target.value })}>
                        <option value="">Select</option>
                        {dsProfNames.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}

              {dsEdgeProfs.length > 0 ? (
                <label className={styles.fieldLabel}>
                  Edge mould
                  <select className={styles.fieldSelect} value={doorStyle.edge_mould || ""} onChange={(e) => updDoorStyle({ edge_mould: e.target.value })}>
                    <option value="">None</option>
                    {dsEdgeProfs.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
                  </select>
                </label>
              ) : (
                <label className={styles.fieldLabel}>
                  Edge mould
                  <input className={styles.fieldInput} value={doorStyle.edge_mould || ""} onChange={(e) => updDoorStyle({ edge_mould: e.target.value })} placeholder="e.g. 1mm PVC bevel" />
                </label>
              )}

              <label className={styles.fieldLabel}>
                Cost per sqm ex GST ($)
                <input className={styles.fieldInput} type="number" min="0" step="0.01"
                  value={doorStyle.cost_per_sqm || ""}
                  onChange={(e) => updDoorStyle({ cost_per_sqm: Number(e.target.value) })}
                  placeholder="0.00" />
              </label>
            </div>
          </div>
        )}

        {activeTab === "Notes" && (
          <div className={styles.formSection}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                Notes
                <textarea className={styles.fieldTextarea} value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={6} />
              </label>
            </div>
          </div>
        )}

        {saving && <p className={styles.savingIndicator}>Saving…</p>}
      </div>
    </>
  );
}

// ---- Door / panel flat form ----
function DoorPanelForm({ item, onItemChange }) {
  const [draft, setDraft] = useState(item);
  const [saving, setSaving] = useState(false);
  const timerRef  = useRef(null);
  const latestRef = useRef(draft);
  const pendingPatchRef = useRef({});
  const onItemChangeRef = useRef(onItemChange);
  onItemChangeRef.current = onItemChange;

  useEffect(() => {
    setDraft(item);
    latestRef.current = item;
    pendingPatchRef.current = {};
    clearTimeout(timerRef.current);
    setSaving(false);
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush any unsaved edits immediately on switching away from this item —
  // see the matching comment in CabinetConfigForm for why this is needed.
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      const patch = pendingPatchRef.current;
      if (Object.keys(patch).length) onItemChangeRef.current(item.id, patch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  function flushPending() {
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (!Object.keys(patch).length) {
      setSaving(false);
      return;
    }
    onItemChangeRef.current(item.id, patch).finally(() => setSaving(false));
  }

  function set(key, val) {
    const next = { ...latestRef.current, [key]: val };
    latestRef.current = next;
    setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, [key]: val };
    clearTimeout(timerRef.current);
    setSaving(true);
    timerRef.current = setTimeout(flushPending, 600);
  }

  function setMulti(patch) {
    const next = { ...latestRef.current, ...patch };
    latestRef.current = next;
    setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    clearTimeout(timerRef.current);
    setSaving(true);
    timerRef.current = setTimeout(flushPending, 600);
  }

  // For discrete choices (selects, colour pickers, checkboxes) — save
  // immediately rather than debouncing, so there is no window in which a
  // quick click-away could lose the choice.
  function setNow(key, val) {
    const next = { ...latestRef.current, [key]: val };
    latestRef.current = next;
    setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, [key]: val };
    clearTimeout(timerRef.current);
    setSaving(true);
    flushPending();
  }

  function setMultiNow(patch) {
    const next = { ...latestRef.current, ...patch };
    latestRef.current = next;
    setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    clearTimeout(timerRef.current);
    setSaving(true);
    flushPending();
  }

  const profileTypes  = profileTypesForSelection(draft.material || "", draft.thickness || "");
  const profileNames  = profileNamesForSelection(draft.profile_type || "", draft.material || "", draft.thickness || "");
  const edgeProfiles  = edgeProfilesForMaterial(draft.material || "");

  return (
    <div className={styles.rightScroll}>
      <div className={styles.formSection}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            Label
            <input className={styles.fieldInput} value={draft.label || ""} onChange={(e) => set("label", e.target.value)} />
          </label>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Width mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm || ""} onChange={(e) => set("width_mm", e.target.value)} />
            </label>
            <label className={styles.fieldLabel}>
              Height mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.height_mm || ""} onChange={(e) => set("height_mm", e.target.value)} />
            </label>
          </div>
          <label className={styles.fieldLabel}>
            Qty
            <input className={styles.fieldInput} type="number" min="1" value={draft.qty || 1} onChange={(e) => set("qty", e.target.value)} />
          </label>

          {/* Board: material → thickness → finish → colour */}
          <MaterialColourPicker
            label="Board"
            material={draft.material || ""}
            thickness={draft.thickness || ""}
            finish={draft.finish || ""}
            colour={draft.colour || ""}
            onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
              setMultiNow({
                material,
                thickness,
                finish,
                colour,
                unit_cost_per_sqm_ex_gst: costPerSqmExGst || draft.unit_cost_per_sqm_ex_gst || 0,
              })
            }
          />

          {/* Profile (Thermolaminate only) */}
          {profileTypes.length > 0 && (
            <>
              <label className={styles.fieldLabel}>
                Profile type
                <select className={styles.fieldSelect} value={draft.profile_type || ""} onChange={(e) => setMultiNow({ profile_type: e.target.value, profile: "" })}>
                  <option value="">— None —</option>
                  {profileTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {profileNames.length > 0 && (
                <label className={styles.fieldLabel}>
                  Profile
                  <select className={styles.fieldSelect} value={draft.profile || ""} onChange={(e) => setNow("profile", e.target.value)}>
                    <option value="">— Select —</option>
                    {profileNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
            </>
          )}

          {/* Edge mould */}
          {edgeProfiles.length > 0 ? (
            <label className={styles.fieldLabel}>
              Edge mould
              <select className={styles.fieldSelect} value={draft.edge_mould || ""} onChange={(e) => setNow("edge_mould", e.target.value)}>
                <option value="">— None —</option>
                {edgeProfiles.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
              </select>
            </label>
          ) : (
            <label className={styles.fieldLabel}>
              Edge mould
              <input className={styles.fieldInput} value={draft.edge_mould || ""} onChange={(e) => set("edge_mould", e.target.value)} placeholder="e.g. 1mm bevel" />
            </label>
          )}

          <label className={styles.fieldLabel}>
            Cost per sqm ex GST ($)
            <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.unit_cost_per_sqm_ex_gst || ""} onChange={(e) => set("unit_cost_per_sqm_ex_gst", e.target.value)} placeholder="0.00" />
          </label>

          {item.item_type === "door" && (
            <>
              <label className={styles.fieldCheckLabel}>
                <input type="checkbox" checked={Boolean(draft.hinge_holes)} onChange={(e) => setNow("hinge_holes", e.target.checked)} />
                Hinge holes
              </label>
              <label className={styles.fieldCheckLabel}>
                <input type="checkbox" checked={Boolean(draft.hinge_supply)} onChange={(e) => setNow("hinge_supply", e.target.checked)} />
                Supply hinges
              </label>
              {draft.hinge_supply && (
                <label className={styles.fieldLabel}>
                  Hinge qty
                  <input className={styles.fieldInput} value={draft.hinge_qty || ""} onChange={(e) => set("hinge_qty", e.target.value)} />
                </label>
              )}
            </>
          )}
          <label className={styles.fieldLabel}>
            X offset mm
            <input className={styles.fieldInput} type="number" min="0" value={draft.x_mm || 0} onChange={(e) => set("x_mm", e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Notes
            <textarea className={styles.fieldTextarea} value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={4} />
          </label>
        </div>
        {saving && <p className={styles.savingIndicator}>Saving…</p>}
      </div>
    </div>
  );
}

// ---- Right panel container ----
export default function DesignRightPanel({ item, isAddingItem, onAdd, onCancelAdd, onItemChange, onDeleteItem }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef(null);

  function handleDeleteClick() {
    if (confirmDelete) {
      clearTimeout(confirmTimer.current);
      setConfirmDelete(false);
      onDeleteItem(item.id);
    } else {
      setConfirmDelete(true);
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  if (isAddingItem) {
    return (
      <div className={styles.rightPanel}>
        <div className={styles.rightPanelHeader}>
          <p className={styles.rightPanelTitle}>Add Cabinet</p>
          <p className={styles.rightPanelSubtitle}>Drag to position after adding</p>
        </div>
        <div className={styles.rightScroll}>
          <AddItemForm onAdd={onAdd} onCancel={onCancelAdd} />
        </div>
      </div>
    );
  }

  if (item) {
    const isCabinet = CABINET_TYPES.includes(item.item_type);
    return (
      <div className={styles.rightPanel}>
        <div className={styles.rightPanelHeader}>
          <p className={styles.rightPanelTitle}>{item.label || TYPE_LABELS[item.item_type] || item.item_type}</p>
          <p className={styles.rightPanelSubtitle}>{TYPE_LABELS[item.item_type]}</p>
        </div>
        {isCabinet ? (
          <CabinetConfigForm key={item.id} item={item} onItemChange={onItemChange} />
        ) : (
          <DoorPanelForm key={item.id} item={item} onItemChange={onItemChange} />
        )}
        <div className={styles.rightPanelFooter}>
          <button
            type="button"
            className={`${styles.deleteItemBtn} ${confirmDelete ? styles.deleteItemBtnConfirm : ""}`}
            onClick={handleDeleteClick}
          >
            {confirmDelete ? "Confirm delete?" : "Delete item"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.rightPanel}>
      <div className={styles.rightPanelHeader}>
        <p className={styles.rightPanelTitle}>Item Config</p>
        <p className={styles.rightPanelSubtitle}>Select or add an item</p>
      </div>
      <div className={styles.rightScroll}>
        <div className={styles.rightIdle}>
          <span>No item selected</span>
          <span className={styles.rightIdleHint}>Click "+ Add Cabinet" in the left panel, or click an existing cabinet to edit it.</span>
        </div>
      </div>
    </div>
  );
}
