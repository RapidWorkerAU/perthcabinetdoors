"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../design.module.css";
import MaterialColourPicker from "./MaterialColourPicker";
import {
  edgeProfilesForMaterial,
  profileNamesForSelection,
  profileTypesForSelection,
} from "../../../../lib/quote-form-data";
import { computeBackPanelRun } from "../../../../lib/pcd-backpanel-utils";
import { computeDrawerFrontHeights } from "../../../../lib/pcd-drawer-utils";
import { thicknessOptionsForMaterial, materialLabelForType } from "../../../../lib/pcd-colour-library";

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet"];
// Cabinet types plus a standalone filler panel — a thin board a user can
// freely position between cabinets (e.g. beside a fridge recess, between a
// base and tall cabinet) with its own height/depth/thickness/material,
// dragged and collision-checked exactly like a cabinet on the plan.
// Obstruction: a generic non-manufactured spatial blocker (nib wall, full
// wall, brick recess) — draggable and fully collision-checked like a
// cabinet, but never quoted.
const ADDABLE_TYPES = [...CABINET_TYPES, "panel", "obstruction"];

const TYPE_LABELS = {
  base_cabinet:  "Base Cabinet",
  wall_cabinet:  "Wall Cabinet",
  tall_cabinet:  "Tall Cabinet",
  corner_base_cabinet: "Corner Base Cabinet",
  door:          "Door",
  drawer_front:  "Drawer Front",
  panel:         "Panel",
  obstruction:   "Obstruction",
};

const WALL_OPTIONS = [
  { value: "top", label: "Top wall" },
  { value: "bottom", label: "Bottom wall" },
  { value: "left", label: "Left wall" },
  { value: "right", label: "Right wall" },
];

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
    secondary_wall: "",
    label: "",
    width_mm: 600,
    height_mm: 720,
    depth_mm: 600,
    secondary_width_mm: 900,
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
  const isCorner = draft.item_type === "corner_base_cabinet";
  const isPanel = draft.item_type === "panel";
  const isObstruction = draft.item_type === "obstruction";

  function setType(nextType) {
    if (nextType === "corner_base_cabinet") {
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        width_mm: d.width_mm && d.width_mm !== 600 ? d.width_mm : 900,
        secondary_width_mm: d.secondary_width_mm || 900,
        depth_mm: d.depth_mm || 600,
      }));
      return;
    }
    if (nextType === "panel") {
      // A standalone panel is a thin board on edge — width_mm doubles as
      // its material thickness for plan-view footprint/collision purposes,
      // not an along-wall span like a cabinet's width.
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        width_mm: 18,
        height_mm: d.height_mm || 720,
        depth_mm: d.depth_mm || 600,
      }));
      return;
    }
    if (nextType === "obstruction") {
      // Wall/nib-like default — thin along the wall, floor-to-near-ceiling.
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        width_mm: 100,
        height_mm: 2400,
        depth_mm: 100,
      }));
      return;
    }
    set("item_type", nextType);
  }

  return (
    <div className={styles.addItemForm}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>
          Type
          <select className={styles.fieldSelect} value={draft.item_type} onChange={(e) => setType(e.target.value)}>
            {ADDABLE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Label
          <input className={styles.fieldInput} value={draft.label} onChange={(e) => set("label", e.target.value)} placeholder={isPanel ? "e.g. Filler panel" : "e.g. Sink base"} />
        </label>
        {isPanel ? (
          <>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>
                Height mm
                <input className={styles.fieldInput} type="number" min="1" value={draft.height_mm} onChange={(e) => set("height_mm", e.target.value)} />
              </label>
              <label className={styles.fieldLabel}>
                Depth mm
                <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm} onChange={(e) => set("depth_mm", e.target.value)} />
              </label>
            </div>
            <label className={styles.fieldLabel}>
              Thickness mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm} onChange={(e) => set("width_mm", e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>
                {isCorner ? "Width mm (wall 1)" : "Width mm"}
                <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm} onChange={(e) => set("width_mm", e.target.value)} />
              </label>
              <label className={styles.fieldLabel}>
                Height mm
                <input className={styles.fieldInput} type="number" min="1" value={draft.height_mm} onChange={(e) => set("height_mm", e.target.value)} />
              </label>
            </div>
            {(isCabinet || isObstruction) && (
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>
                  Depth mm
                  <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm} onChange={(e) => set("depth_mm", e.target.value)} />
                </label>
                {isCorner && (
                  <label className={styles.fieldLabel}>
                    Width mm (wall 2)
                    <input className={styles.fieldInput} type="number" min="1" value={draft.secondary_width_mm} onChange={(e) => set("secondary_width_mm", e.target.value)} />
                  </label>
                )}
              </div>
            )}
          </>
        )}
        {!isObstruction && (
          <label className={styles.fieldLabel}>
            Qty
            <input className={styles.fieldInput} type="number" min="1" value={draft.qty} onChange={(e) => set("qty", e.target.value)} />
          </label>
        )}
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

// Default hinge positions when a hinge count is first chosen — evenly
// spaced with a 100mm inset from the top/bottom edge where possible.
function defaultHingePositions(qty, heightMm) {
  const h = heightMm || 720;
  if (qty <= 0) return [];
  if (qty === 1) return [Math.round(h / 2)];
  const inset = Math.min(100, h / 4);
  const positions = [];
  for (let i = 0; i < qty; i++) {
    positions.push(Math.round(inset + (i / (qty - 1)) * (h - inset * 2)));
  }
  return positions;
}

// Every hinge position is stored as distance-from-bottom (the datum the
// elevation view drills hinge marks from), but only the bottom and top
// hinge are independently set — a 3rd/4th (middle) hinge isn't drilled to
// its own spec, it's evenly spaced between whatever the bottom and top
// hinge are currently set to. Called whenever either boundary hinge moves.
function recomputeMiddleHinges(positions, qty) {
  if (qty <= 2) return positions;
  const bottom = Number(positions[0]) || 0;
  const top = Number(positions[qty - 1]) || 0;
  const next = [...positions];
  for (let i = 1; i < qty - 1; i++) {
    next[i] = Math.round(bottom + (i / (qty - 1)) * (top - bottom));
  }
  return next;
}

// ---- Reusable door-bank layout (columns/hinges/hinge drilling/width
// ratios) — used both for a regular cabinet's top-level door_config and for
// an individual door-type section of a "mixed" front. "Rows" is deliberately
// NOT handled here: at the top level rows only exist for tall cabinets and
// are managed by the caller (each row just repeats this same per-row
// layout); a "mixed" section never has rows since stacking another
// door-type section already achieves the same thing. `onChangeNow` is for
// discrete controls (selects/checkboxes/radios) that should save
// immediately; `onChange` is for free-typed number inputs that should
// debounce, matching the rest of this form's save conventions.
function DoorBankFields({ cfg, onChangeNow, onChange, heightMm }) {
  const cols     = Math.max(1, cfg.columns || 1);
  const hinges   = cfg.hinges || Array(cols).fill("L");
  const eqW      = cfg.equal_width !== false;
  const ratios   = cfg.width_ratios || Array(cols).fill(1 / cols);
  const hingeQty = cfg.hinge_qty || Array(cols).fill(2);
  const hingePositions = cfg.hinge_positions_mm || Array(cols).fill([]);
  const hingesUniform  = cfg.hinges_uniform !== false;

  function onColsChange(newCols) {
    const prevH = cfg.hinges || [];
    const nextHinges = Array.from({ length: newCols }, (_, i) =>
      i < prevH.length ? prevH[i] : (i === 0 ? "L" : "R")
    );
    const prevQty = cfg.hinge_qty || [];
    const prevPos = cfg.hinge_positions_mm || [];
    const nextQty = Array.from({ length: newCols }, (_, i) =>
      i < prevQty.length ? prevQty[i] : (prevQty[0] ?? 2)
    );
    const nextPos = Array.from({ length: newCols }, (_, i) =>
      i < prevPos.length ? prevPos[i] : (prevPos[0] || [])
    );
    onChangeNow({
      columns: newCols,
      hinges: nextHinges,
      hinge_qty: nextQty,
      hinge_positions_mm: nextPos,
      equal_width: newCols === 1 ? true : (cfg.equal_width ?? true),
      width_ratios: Array(newCols).fill(1 / newCols),
    });
  }

  function onHingeChange(col, val) {
    const h = [...hinges];
    h[col] = val;
    onChangeNow({ hinges: h });
  }

  function onRatioChange(col, ratio) {
    const r = [...ratios];
    r[col] = Math.max(0.05, Math.min(0.95, ratio));
    onChange({ width_ratios: r });
  }

  function onHingeQtyChange(col, qty) {
    const positions = defaultHingePositions(qty, heightMm);
    if (hingesUniform) {
      onChangeNow({ hinge_qty: Array(cols).fill(qty), hinge_positions_mm: Array(cols).fill(positions) });
      return;
    }
    const qtyArr = [...hingeQty];
    const posArr = [...hingePositions];
    qtyArr[col] = qty;
    posArr[col] = positions;
    onChangeNow({ hinge_qty: qtyArr, hinge_positions_mm: posArr });
  }

  function onHingePositionChange(col, hingeIndex, value) {
    const posArr = hingePositions.map((arr) => [...(arr || [])]);
    if (!posArr[col]) posArr[col] = [];
    posArr[col][hingeIndex] = value;
    posArr[col] = recomputeMiddleHinges(posArr[col], hingeQty[col] ?? posArr[col].length);
    if (hingesUniform) {
      onChange({ hinge_positions_mm: Array(cols).fill(posArr[col]) });
      return;
    }
    onChange({ hinge_positions_mm: posArr });
  }

  function toggleHingesUniform(checked) {
    if (checked) {
      const qty = (hingeQty[0] ?? 2);
      const positions = (hingePositions[0] ?? []);
      onChangeNow({ hinges_uniform: true, hinge_qty: Array(cols).fill(qty), hinge_positions_mm: Array(cols).fill(positions) });
      return;
    }
    onChangeNow({ hinges_uniform: false });
  }

  return (
    <>
      <SectionDivider label="Layout" />
      <label className={styles.fieldLabel}>
        Doors across
        <select className={styles.fieldSelect} value={cols} onChange={(e) => onColsChange(Number(e.target.value))}>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>

      <SectionDivider label="Hinge sides" />
      {Array.from({ length: cols }).map((_, col) => (
        <label key={col} className={styles.fieldLabel}>
          {cols === 1 ? "Hinge side" : `Door ${col + 1} hinge`}
          <select className={styles.fieldSelect}
            value={hinges[col] || "L"}
            onChange={(e) => onHingeChange(col, e.target.value)}>
            <option value="L">Left side</option>
            <option value="R">Right side</option>
          </select>
        </label>
      ))}

      <SectionDivider label="Hinge Drilling" />
      {cols > 1 && (
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={hingesUniform} onChange={(e) => toggleHingesUniform(e.target.checked)} />
          Hinges same for all doors on this cabinet
        </label>
      )}
      {Array.from({ length: hingesUniform ? 1 : cols }).map((_, col) => {
        const qty = hingeQty[col] ?? 2;
        const positions = hingePositions[col] || [];
        return (
          <div key={col} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cols > 1 && !hingesUniform && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dt-text-muted, #888780)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Door {col + 1}
              </span>
            )}
            <label className={styles.fieldLabel}>
              Hinge qty
              <select className={styles.fieldSelect} value={qty} onChange={(e) => onHingeQtyChange(col, Number(e.target.value))}>
                <option value={2}>2 hinges</option>
                <option value={3}>3 hinges</option>
                <option value={4}>4 hinges</option>
              </select>
            </label>
            {Array.from({ length: qty }).map((_, hIdx) => {
              const isTop = hIdx === qty - 1 && qty > 1;
              const isMiddle = hIdx > 0 && hIdx < qty - 1;
              const stored = positions[hIdx] ?? "";
              const displayValue = isTop && stored !== "" ? Math.max(0, Math.round((heightMm || 0) - stored)) : stored;
              return (
                <label key={hIdx} className={styles.fieldLabel}>
                  {isMiddle
                    ? `Hinge ${hIdx + 1} — evenly spaced between top & bottom (auto)`
                    : isTop
                      ? `Hinge ${hIdx + 1} — distance from top (mm)`
                      : `Hinge ${hIdx + 1} — distance from bottom (mm)`}
                  <input
                    className={styles.fieldInput}
                    type="number"
                    min="0"
                    max={heightMm || undefined}
                    value={displayValue}
                    disabled={isMiddle}
                    onChange={isMiddle ? undefined : (e) => {
                      const raw = e.target.value;
                      const stored = isTop && raw !== "" ? (heightMm || 0) - Number(raw) : raw;
                      onHingePositionChange(col, hIdx, stored);
                    }}
                  />
                </label>
              );
            })}
          </div>
        );
      })}
      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
        Hinge quantity is imported directly into the quote's hinge drilling fields. Positions are recorded
        here for manufacturing reference and carried into the imported line's notes.
      </p>

      {cols > 1 && (
        <>
          <label className={styles.fieldCheckLabel}>
            <input type="checkbox"
              checked={eqW}
              onChange={(e) => onChangeNow({ equal_width: e.target.checked, width_ratios: Array(cols).fill(1 / cols) })}
            />
            Equal door widths
          </label>
          {!eqW && (
            <>
              {Array.from({ length: cols }).map((_, col) => {
                const totalR = ratios.reduce((s, r) => s + r, 0) || 1;
                return (
                  <label key={col} className={styles.fieldLabel}>
                    Door {col + 1} width %
                    <input className={styles.fieldInput} type="number" min="10" max="90"
                      value={Math.round((ratios[col] / totalR) * 100)}
                      onChange={(e) => { if (e.target.value === "") return; onRatioChange(col, Number(e.target.value) / 100); }} />
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

      <SectionDivider label="Finger-Pull Gap" />
      <label className={styles.fieldCheckLabel}>
        <input type="checkbox" checked={Boolean(cfg.row_gap_enabled)}
          onChange={(e) => onChangeNow({ row_gap_enabled: e.target.checked })} />
        Include a negative gap for this door row
      </label>
      {cfg.row_gap_enabled && (
        <>
          <label className={styles.fieldLabel}>
            Gap mm
            <input className={styles.fieldInput} type="number" min="1" value={cfg.row_gap_mm ?? 20}
              onChange={(e) => onChange({ row_gap_mm: e.target.value })} />
          </label>
          <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
            Grip position is automatic: at or under the 900mm bench-height line the grip sits at the top (you're
            looking down at it, same as a base cabinet), above bench height it sits at the bottom instead, so you're
            never reaching above a door near the top of a tall cabinet to find the grip. On a multi-row tall cabinet
            this applies per row.
          </p>
        </>
      )}
    </>
  );
}

// ---- Reusable drawer-bank layout (opening heights, finger-pull gap,
// runner type) — used both for a regular cabinet's top-level drawer_config
// and for an individual drawer-type section of a "mixed" front. A drawer
// bank is always a single column — a wide bank of drawers you'd see
// side-by-side is actually two separate cabinets, not one cabinet with
// multiple drawer columns.
function DrawerBankFields({ cfg, onChangeNow, onChange, heightMm }) {
  const heights = Array.isArray(cfg.heights_mm) && cfg.heights_mm.length ? cfg.heights_mm : [heightMm || 720];
  const count = heights.length;
  const gapEnabled = cfg.gap_enabled || false;
  const gapMm = cfg.gap_mm ?? 20;
  const runnerType = cfg.runner_type || "standard";

  function onCountChange(newCount) {
    const evenH = Math.round((heightMm || 720) / newCount);
    const next = Array.from({ length: newCount }, (_, i) => heights[i] ?? evenH);
    onChangeNow({ heights_mm: next });
  }

  function onHeightChange(idx, val) {
    const next = [...heights];
    next[idx] = val;
    onChange({ heights_mm: next });
  }

  const total = heights.reduce((s, h) => s + (Number(h) || 0), 0);
  const target = heightMm || 0;
  const diff = target - total;
  const frontHeights = computeDrawerFrontHeights(heights, gapEnabled, gapMm);

  return (
    <>
      <SectionDivider label="Layout" />
      <label className={styles.fieldLabel}>
        Number of drawers
        <select className={styles.fieldSelect} value={count} onChange={(e) => onCountChange(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {heights.map((h, idx) => (
        <label key={idx} className={styles.fieldLabel}>
          Drawer {idx + 1} opening height (mm) {frontHeights[idx] !== h ? `— front ${Math.round(frontHeights[idx])}mm` : ""}
          <input className={styles.fieldInput} type="number" min="1" value={h}
            onChange={(e) => onHeightChange(idx, e.target.value)} />
        </label>
      ))}
      <p style={{ fontSize: 10, color: diff === 0 ? "var(--dt-text-muted, #888780)" : "#c0392b", margin: "0", lineHeight: 1.4 }}>
        {diff === 0
          ? `Total: ${total}mm — matches the cabinet height.`
          : `Total: ${total}mm — ${Math.abs(diff)}mm ${diff > 0 ? "short of" : "over"} the ${target}mm cabinet height.`}
      </p>

      <SectionDivider label="Finger-Pull Gap" />
      <label className={styles.fieldCheckLabel}>
        <input type="checkbox" checked={gapEnabled} onChange={(e) => onChangeNow({ gap_enabled: e.target.checked })} />
        Include a negative gap above each drawer
      </label>
      {gapEnabled && (
        <label className={styles.fieldLabel}>
          Gap mm
          <input className={styles.fieldInput} type="number" min="1" value={gapMm}
            onChange={(e) => onChange({ gap_mm: e.target.value })} />
        </label>
      )}
      {gapEnabled && (
        <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
          Every drawer gets its own grip recessed into the top of its own opening — including the top drawer,
          which recesses below the cabinet's top edge. Front heights: {frontHeights.map((h) => Math.round(h)).join(", ")}mm.
        </p>
      )}

      <SectionDivider label="Runners" />
      <label className={styles.fieldLabel}>
        Runner type
        <select className={styles.fieldSelect} value={runnerType} onChange={(e) => onChangeNow({ runner_type: e.target.value })}>
          <option value="standard">Standard ball-bearing</option>
          <option value="soft_close_undermount">Soft-close undermount</option>
          <option value="soft_close_side">Soft-close side-mount</option>
        </select>
      </label>
    </>
  );
}

// Reusable board/finish picker for a door or drawer style — used for both
// the top-level Door Style / Drawer Style sections and (for Door Style
// only in practice, but written generically) a "mixed" front's shared
// per-type style. `style` is a door_style/drawer_style-shaped object;
// `onChange` merges a patch into it, always saved immediately (this is all
// discrete select/picker input, no free-typed text worth debouncing except
// cost, which MaterialColourPicker itself already debounces internally).
// Exported so MaterialDefaultsModal.js can reuse the exact same door/drawer
// style picker (including profile/edge mould) for project-level defaults.
export function FrontStyleFields({ label, style, onChange }) {
  const mat = style.material || "";
  const thk = style.thickness_mm ? `${style.thickness_mm}mm` : "";
  // The material picker stores lowercase values (e.g. "decorative board")
  // but the profile/edge-mould lookup tables key off the Title Case labels
  // the quote editor uses (e.g. "Decorative Board") — convert before
  // looking up, otherwise these options are always empty.
  const matLabel = materialLabelForType(mat);
  const profTypes = profileTypesForSelection(matLabel, thk);
  const profNames = profileNamesForSelection(style.profile_type || "", matLabel, thk);
  const edgeProfs = edgeProfilesForMaterial(matLabel);

  return (
    <>
      <MaterialColourPicker
        label={label}
        material={mat}
        thickness={thk}
        finish={style.finish || ""}
        colour={style.colour || ""}
        onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
          onChange({
            material,
            finish,
            colour,
            thickness_mm: parseInt(thickness) || style.thickness_mm || 18,
            cost_per_sqm: costPerSqmExGst || style.cost_per_sqm || 0,
          })
        }
      />
      {profTypes.length > 0 && (
        <>
          <label className={styles.fieldLabel}>
            Profile type
            <select className={styles.fieldSelect} value={style.profile_type || ""} onChange={(e) => onChange({ profile_type: e.target.value, profile: "" })}>
              <option value="">None</option>
              {profTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {profNames.length > 0 && (
            <label className={styles.fieldLabel}>
              Profile
              <select className={styles.fieldSelect} value={style.profile || ""} onChange={(e) => onChange({ profile: e.target.value })}>
                <option value="">Select</option>
                {profNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </>
      )}
      {edgeProfs.length > 0 ? (
        <label className={styles.fieldLabel}>
          Edge mould
          <select className={styles.fieldSelect} value={style.edge_mould || ""} onChange={(e) => onChange({ edge_mould: e.target.value })}>
            <option value="">None</option>
            {edgeProfs.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
          </select>
        </label>
      ) : (
        <label className={styles.fieldLabel}>
          Edge mould
          <input className={styles.fieldInput} value={style.edge_mould || ""} onChange={(e) => onChange({ edge_mould: e.target.value })} placeholder="e.g. 1mm PVC bevel" />
        </label>
      )}
      <label className={styles.fieldLabel}>
        Cost per sqm ex GST ($)
        <input className={styles.fieldInput} type="number" min="0" step="0.01"
          value={style.cost_per_sqm ?? ""}
          onChange={(e) => onChange({ cost_per_sqm: Number(e.target.value) })}
          placeholder="0.00" />
      </label>
    </>
  );
}

// ---- Cabinet config form ----
function CabinetConfigForm({ item, allItems, materialDefaults, onItemChange, onSelectItem }) {
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

  // Auto-switch away from a front-type-specific tab if front type is changed
  useEffect(() => {
    const frontTab = { doors: "Doors", drawers: "Drawers", mixed: "Mixed" }[draft.front_type];
    if (["Doors", "Drawers", "Mixed"].includes(activeTab) && activeTab !== frontTab) {
      setActiveTab("Dimensions");
    }
  }, [draft.front_type]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCorner = draft.item_type === "corner_base_cabinet";

  // Dynamic tab list — the front-type-specific tab only appears when it matches front_type
  const tabs = [
    "Dimensions",
    "Boards",
    "Back & Shelves",
    ...(draft.front_type === "doors"   ? ["Doors"]   : []),
    ...(draft.front_type === "drawers" ? ["Drawers"] : []),
    ...(draft.front_type === "mixed"   ? ["Mixed"]   : []),
    "Notes",
  ];

  // ---- Door config helpers (used by Doors tab + Mixed door-type sections) ----
  const doorCfg    = draft.door_config  || {};
  const doorRows   = Math.max(1, doorCfg.rows || 1);
  const doorHeightMm = doorRows > 0 ? Math.round((draft.height_mm || 0) / doorRows) : (draft.height_mm || 0);

  const doorStyle    = draft.door_style || {};

  function updDoorCfg(patch) {
    const prev = latestRef.current.door_config || {};
    setNow("door_config", { ...prev, ...patch });
  }
  function updDoorCfgDebounced(patch) {
    const prev = latestRef.current.door_config || {};
    set("door_config", { ...prev, ...patch });
  }

  function updDoorStyle(patch) {
    const prev = latestRef.current.door_style || {};
    setNow("door_style", { ...prev, ...patch });
  }

  // Applies the project's material defaults the first time a front type is
  // switched on — only when that style is still genuinely blank, so
  // switching back and forth between front types never clobbers a style
  // the user has already customized. "Mixed" can need either or both,
  // since either kind of section might get added to it later.
  function onFrontTypeChange(val) {
    const cur = latestRef.current;
    const patch = { front_type: val };
    const doorDefault = materialDefaults?.door;
    const drawerDefault = materialDefaults?.drawer;
    if ((val === "doors" || val === "mixed") && doorDefault && !String(cur.door_style?.material || "").trim()) {
      patch.door_style = { ...cur.door_style, ...doorDefault };
    }
    if ((val === "drawers" || val === "mixed") && drawerDefault && !String(cur.drawer_style?.material || "").trim()) {
      patch.drawer_style = { ...cur.drawer_style, ...drawerDefault };
    }
    setMultiNow(patch);
  }

  // ---- Drawer config helpers (used by Drawers tab + Mixed drawer-type sections) ----
  const drawerCfg   = draft.drawer_config || {};
  const drawerStyle = draft.drawer_style  || {};

  function updDrawerCfg(patch) {
    const prev = latestRef.current.drawer_config || {};
    setNow("drawer_config", { ...prev, ...patch });
  }
  function updDrawerCfgDebounced(patch) {
    const prev = latestRef.current.drawer_config || {};
    set("drawer_config", { ...prev, ...patch });
  }
  function updDrawerStyle(patch) {
    const prev = latestRef.current.drawer_style || {};
    setNow("drawer_style", { ...prev, ...patch });
  }

  // ---- Mixed (door+drawer sections) helpers ----
  // Style stays cabinet-wide (door_style/drawer_style above) rather than
  // per-section — real cabinets are almost always one consistent finish
  // across their fronts, so every door-type section shares door_style and
  // every drawer-type section shares drawer_style.
  const sectionCfg = draft.section_config || {};
  const sections = Array.isArray(sectionCfg.sections) ? sectionCfg.sections : [];
  const sectionsTotal = sections.reduce((s, sec) => s + (Number(sec.height_mm) || 0), 0);
  const sectionsAnyDoors   = sections.some((s) => s.type === "doors");
  const sectionsAnyDrawers = sections.some((s) => s.type === "drawers");

  function currentSections() {
    const prev = latestRef.current.section_config || {};
    return Array.isArray(prev.sections) ? prev.sections : [];
  }

  function addSection() {
    const cur = currentSections();
    const total = cur.reduce((s, sec) => s + (Number(sec.height_mm) || 0), 0);
    const h = Math.max(0, (draft.height_mm || 0) - total) || 300;
    const prev = latestRef.current.section_config || {};
    setNow("section_config", {
      ...prev,
      sections: [...cur, { height_mm: h, type: "doors", door: { columns: 1, hinges: ["L"], equal_width: true, width_ratios: [1] } }],
    });
  }

  function removeSection(idx) {
    const cur = currentSections();
    const prev = latestRef.current.section_config || {};
    setNow("section_config", { ...prev, sections: cur.filter((_, i) => i !== idx) });
  }

  function updateSection(idx, patch, immediate = true) {
    const cur = currentSections();
    const next = cur.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    const prev = latestRef.current.section_config || {};
    if (immediate) setNow("section_config", { ...prev, sections: next });
    else set("section_config", { ...prev, sections: next });
  }

  function updateSectionType(idx, type) {
    const cur = currentSections();
    const sec = cur[idx] || {};
    const patch = { type };
    if (type === "doors" && !sec.door) patch.door = { columns: 1, hinges: ["L"], equal_width: true, width_ratios: [1] };
    if (type === "drawers" && !sec.drawer) patch.drawer = { heights_mm: [sec.height_mm || 300] };
    updateSection(idx, patch);
  }

  function updateSectionSubConfig(idx, subKey, patch, immediate) {
    const cur = currentSections();
    const sec = cur[idx] || {};
    const prevSub = sec[subKey] || {};
    const next = cur.map((s, i) => (i === idx ? { ...s, [subKey]: { ...prevSub, ...patch } } : s));
    const prev = latestRef.current.section_config || {};
    if (immediate) setNow("section_config", { ...prev, sections: next });
    else set("section_config", { ...prev, sections: next });
  }

  // ---- Corner cabinet door config (bi-fold, one leaf per wall) ----
  // Uses a different door_config shape than regular cabinets:
  // { hinge_wall: "primary" | "secondary", hinge_qty, hinge_positions_mm }.
  // Only the hinge_wall leaf has frame-drilled hinges — the other leaf is
  // fold-hinged to it, matching real bi-fold corner door hardware.
  const cornerDoorCfg = isCorner ? (draft.door_config || {}) : {};
  const cornerHingeWall = cornerDoorCfg.hinge_wall || "primary";
  const cornerHingeQty = cornerDoorCfg.hinge_qty ?? 2;
  const cornerHingePositions = cornerDoorCfg.hinge_positions_mm || [];
  const cornerDoorHeightMm = draft.height_mm || 0;

  function setCornerHingeWall(wallKey) {
    const prev = latestRef.current.door_config || {};
    setNow("door_config", { ...prev, hinge_wall: wallKey });
  }

  function setCornerHingeQty(qty) {
    const prev = latestRef.current.door_config || {};
    setNow("door_config", { ...prev, hinge_qty: qty, hinge_positions_mm: defaultHingePositions(qty, cornerDoorHeightMm) });
  }

  function setCornerHingePosition(idx, value) {
    const prev = latestRef.current.door_config || {};
    let positions = [...(prev.hinge_positions_mm || [])];
    positions[idx] = value;
    positions = recomputeMiddleHinges(positions, cornerHingeQty);
    set("door_config", { ...prev, hinge_positions_mm: positions });
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
                  <input className={styles.fieldInput} type="number" min="1" value={draft.qty ?? ""} onChange={(e) => set("qty", e.target.value)} />
                </label>
              </div>
              {isCorner && (
                <>
                  <SectionDivider label="Second Wall" />
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                    Set this when the cabinet sits in a real room corner, so it shows correctly on both elevations.
                    Leave blank for an island corner unit — width mm (wall 2) still applies, it just won't have a
                    second elevation.
                  </p>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel}>
                      Second wall
                      <select
                        className={styles.fieldSelect}
                        value={draft.secondary_wall || ""}
                        onChange={(e) => setNow("secondary_wall", e.target.value)}
                        disabled={draft.wall === "island"}
                      >
                        <option value="">None (island corner)</option>
                        {WALL_OPTIONS.filter((o) => o.value !== draft.wall).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.fieldLabel}>
                      Width mm (wall 2)
                      <input
                        className={styles.fieldInput}
                        type="number"
                        min="1"
                        value={draft.secondary_width_mm || ""}
                        onChange={(e) => set("secondary_width_mm", e.target.value)}
                      />
                    </label>
                  </div>
                  <SectionDivider label="Back Panels" />
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                    Manual per leg, not auto-detected — a corner cabinet's second wall is often a virtual assignment
                    (an island corner unit) rather than a real wall, so which side is actually exposed can't be sensed
                    reliably. Tick whichever leg(s) need a finished back.
                  </p>
                  <label className={styles.fieldCheckLabel}>
                    <input type="checkbox" checked={Boolean(draft.back_panel_wall1)}
                      onChange={(e) => setNow("back_panel_wall1", e.target.checked)} />
                    Wall 1 back panel ({draft.wall || "—"})
                  </label>
                  <label className={styles.fieldCheckLabel}>
                    <input type="checkbox" checked={Boolean(draft.back_panel_wall2)} disabled={!draft.secondary_wall}
                      onChange={(e) => setNow("back_panel_wall2", e.target.checked)} />
                    Wall 2 back panel {draft.secondary_wall ? `(${draft.secondary_wall})` : "(set a second wall first)"}
                  </label>
                  {(draft.back_panel_wall1 || draft.back_panel_wall2) && (
                    <label className={styles.fieldCheckLabel}>
                      <input type="checkbox" checked={Boolean(draft.panel_to_floor)}
                        onChange={(e) => setNow("panel_to_floor", e.target.checked)} />
                      Panels run to floor (otherwise carcass height only, kickboard continues underneath)
                    </label>
                  )}
                </>
              )}
              {draft.item_type === "wall_cabinet" && (
                <label className={styles.fieldLabel}>
                  Mount height mm
                  <input className={styles.fieldInput} type="number" min="0" value={draft.mount_height_mm ?? 1400} onChange={(e) => set("mount_height_mm", e.target.value)} />
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
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {[
                  ["none", "None"],
                  ["doors", "Doors"],
                  // Drawers and mixed fronts aren't offered for corner
                  // cabinets — a corner drawer bank is specialty hardware
                  // (e.g. Blum corner-drawer systems), out of scope here.
                  ...(isCorner ? [] : [["drawers", "Drawers"], ["mixed", "Doors + Drawers"]]),
                ].map(([val, label]) => (
                  <label key={val} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--dt-text, #1c1c1a)", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name={`front_type_${item.id}`}
                      value={val}
                      checked={(draft.front_type ?? "none") === val}
                      onChange={() => onFrontTypeChange(val)}
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
              {draft.front_type === "drawers" && (
                <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "2px 0 0", lineHeight: 1.4 }}>
                  Configure drawer layout and style in the Drawers tab.
                </p>
              )}
              {draft.front_type === "mixed" && (
                <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "2px 0 0", lineHeight: 1.4 }}>
                  Split the cabinet into door/drawer sections in the Doors + Drawers tab.
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
                <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.cost_per_sqm_carcass ?? ""} onChange={(e) => set("cost_per_sqm_carcass", e.target.value)} placeholder="0.00" />
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
                  <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.unit_cost_per_sqm_ex_gst ?? ""} onChange={(e) => set("unit_cost_per_sqm_ex_gst", e.target.value)} placeholder="0.00" />
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
                  <input className={styles.fieldInput} type="number" min="1" value={draft.back_panel_thickness_mm ?? 16} onChange={(e) => set("back_panel_thickness_mm", e.target.value)} />
                </label>
              )}
              <label className={styles.fieldLabel}>
                Shelf qty
                <input className={styles.fieldInput} type="number" min="0" value={draft.shelf_qty ?? 0} onChange={(e) => set("shelf_qty", e.target.value)} />
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
                    <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.cost_per_sqm_shelf ?? ""} onChange={(e) => set("cost_per_sqm_shelf", e.target.value)} placeholder="0.00" />
                  </label>
                </>
              )}

              {/* ── Rangehood cabinet — wall cabinets only. A boxed recess at
                  the bottom houses the rangehood unit, a boxed channel above
                  it (full carcass depth) carries the flue up through the
                  cabinet, and shelves either side of the channel are cut as
                  a matching left/right pair instead of one full-width board. ── */}
              {draft.item_type === "wall_cabinet" && (
                <>
                  <SectionDivider label="Rangehood" />
                  <label className={styles.fieldCheckLabel}>
                    <input
                      type="checkbox"
                      checked={draft.has_rangehood ?? false}
                      onChange={(e) => setNow("has_rangehood", e.target.checked)}
                    />
                    This is a rangehood cabinet
                  </label>
                  {draft.has_rangehood && (
                    <>
                      <label className={styles.fieldLabel}>
                        Housing height mm (depth of the rangehood unit)
                        <input
                          className={styles.fieldInput}
                          type="number"
                          min="0"
                          value={draft.rangehood_housing_height_mm ?? ""}
                          onChange={(e) => set("rangehood_housing_height_mm", e.target.value)}
                        />
                      </label>
                      <label className={styles.fieldLabel}>
                        Exhaust channel width mm
                        <input
                          className={styles.fieldInput}
                          type="number"
                          min="0"
                          value={draft.rangehood_channel_width_mm ?? ""}
                          onChange={(e) => set("rangehood_channel_width_mm", e.target.value)}
                        />
                      </label>
                      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                        Both the housing and the channel always run the full depth of the carcass. Each shelf you add
                        above is cut as a matching pair, one either side of the channel.
                      </p>
                    </>
                  )}
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
                            onChange={(e) => set("kickboard_height_mm", e.target.value)}
                          />
                        </label>
                        <label className={styles.fieldLabel}>
                          Thickness mm
                          <input
                            className={styles.fieldInput}
                            type="number"
                            min="1"
                            value={draft.kickboard_thickness_mm ?? 16}
                            onChange={(e) => set("kickboard_thickness_mm", e.target.value)}
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

              {/* ── End & back panels — base/tall cabinets only. A corner
                  cabinet's "back" isn't a single well-defined side given
                  its L-shape, and wall cabinets aren't floor-standing. ── */}
              {(draft.item_type === "base_cabinet" || draft.item_type === "tall_cabinet") && (() => {
                const anyPanel = draft.end_panel_left || draft.end_panel_right || draft.has_back_panel;
                const isContinuous = (draft.back_panel_span ?? "continuous") === "continuous";
                const liveItems = allItems
                  ? allItems.map((i) => (i.id === draft.id ? { ...i, ...draft } : i))
                  : [draft];
                const run = draft.has_back_panel && isContinuous
                  ? computeBackPanelRun(draft, liveItems)
                  : null;
                const isFirstInRun = !run || run.firstItemId === draft.id;
                const firstItem = run && !isFirstInRun
                  ? liveItems.find((i) => i.id === run.firstItemId)
                  : null;

                return (
                  <>
                    <SectionDivider label="End & Back Panels" />
                    <label className={styles.fieldCheckLabel}>
                      <input
                        type="checkbox"
                        checked={draft.end_panel_left ?? false}
                        onChange={(e) => setNow("end_panel_left", e.target.checked)}
                      />
                      Left end panel
                    </label>
                    <label className={styles.fieldCheckLabel}>
                      <input
                        type="checkbox"
                        checked={draft.end_panel_right ?? false}
                        onChange={(e) => setNow("end_panel_right", e.target.checked)}
                      />
                      Right end panel
                    </label>
                    <label className={styles.fieldCheckLabel}>
                      <input
                        type="checkbox"
                        checked={draft.has_back_panel ?? false}
                        onChange={(e) => setNow("has_back_panel", e.target.checked)}
                      />
                      Finished back panel
                    </label>

                    {draft.has_back_panel && (
                      <>
                        <label className={styles.fieldLabel}>
                          Spanning style
                          <select
                            className={styles.fieldSelect}
                            value={draft.back_panel_span ?? "continuous"}
                            onChange={(e) => setNow("back_panel_span", e.target.value)}
                          >
                            <option value="continuous">Continuous (spans across adjacent cabinets)</option>
                            <option value="individual">Individual (one panel, this cabinet only)</option>
                          </select>
                        </label>

                        {isContinuous && (
                          isFirstInRun ? (
                            <label className={styles.fieldLabel}>
                              Panel count {run && run.count > 1 ? `(run of ${run.count} cabinets)` : ""}
                              <input
                                className={styles.fieldInput}
                                type="number"
                                min="1"
                                value={draft.back_panel_qty ?? 1}
                                onChange={(e) => set("back_panel_qty", e.target.value)}
                              />
                            </label>
                          ) : (
                            <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                              Continuous back panel run ({run.count} cabinets, {draft.back_panel_qty ?? firstItem?.back_panel_qty ?? 1} panels) —
                              panel count is set on{" "}
                              <button
                                type="button"
                                onClick={() => onSelectItem?.(run.firstItemId)}
                                style={{ background: "none", border: "none", padding: 0, color: "var(--dt-accent, #2f7a4d)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                              >
                                {firstItem?.label || firstItem?.item_type || "the first cabinet in this run"}
                              </button>.
                            </p>
                          )
                        )}
                      </>
                    )}

                    {anyPanel && (
                      <label className={styles.fieldCheckLabel}>
                        <input
                          type="checkbox"
                          checked={draft.panel_to_floor ?? false}
                          onChange={(e) => setNow("panel_to_floor", e.target.checked)}
                        />
                        Panels run to floor (otherwise carcass height only, kickboard continues underneath)
                      </label>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === "Doors" && (
          <div className={styles.formSection}>
            <div className={styles.fieldGroup}>
              {isCorner ? (
                <>
                  {/* ── Corner cabinet door — one bi-fold leaf per wall ── */}
                  <SectionDivider label="Corner Door" />
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                    A corner cabinet has one door split into two leaves that fold around the corner. Only the leaf
                    hinged to the cabinet frame needs hinge drilling — the other leaf folds off it.
                  </p>
                  <label className={styles.fieldLabel}>
                    Frame-hinged leaf
                    <select className={styles.fieldSelect} value={cornerHingeWall} onChange={(e) => setCornerHingeWall(e.target.value)}>
                      <option value="primary">Wall 1 ({draft.wall || "—"})</option>
                      <option value="secondary">Wall 2 ({draft.secondary_wall || "—"})</option>
                    </select>
                  </label>
                  <label className={styles.fieldLabel}>
                    Hinge qty
                    <select className={styles.fieldSelect} value={cornerHingeQty} onChange={(e) => setCornerHingeQty(Number(e.target.value))}>
                      <option value={2}>2 hinges</option>
                      <option value={3}>3 hinges</option>
                      <option value={4}>4 hinges</option>
                    </select>
                  </label>
                  {Array.from({ length: cornerHingeQty }).map((_, hIdx) => {
                    const isTop = hIdx === cornerHingeQty - 1 && cornerHingeQty > 1;
                    const isMiddle = hIdx > 0 && hIdx < cornerHingeQty - 1;
                    const stored = cornerHingePositions[hIdx] ?? "";
                    const displayValue = isTop && stored !== "" ? Math.max(0, Math.round((cornerDoorHeightMm || 0) - stored)) : stored;
                    return (
                      <label key={hIdx} className={styles.fieldLabel}>
                        {isMiddle
                          ? `Hinge ${hIdx + 1} — evenly spaced between top & bottom (auto)`
                          : isTop
                            ? `Hinge ${hIdx + 1} — distance from top (mm)`
                            : `Hinge ${hIdx + 1} — distance from bottom (mm)`}
                        <input
                          className={styles.fieldInput}
                          type="number"
                          min="0"
                          max={cornerDoorHeightMm || undefined}
                          value={displayValue}
                          disabled={isMiddle}
                          onChange={isMiddle ? undefined : (e) => {
                            const raw = e.target.value;
                            const stored = isTop && raw !== "" ? (cornerDoorHeightMm || 0) - Number(raw) : raw;
                            setCornerHingePosition(hIdx, stored);
                          }}
                        />
                      </label>
                    );
                  })}
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                    Hinge quantity is imported directly into the quote's hinge drilling fields. Positions are recorded
                    here for manufacturing reference and carried into the imported line's notes.
                  </p>
                </>
              ) : (
                <>
                  {draft.item_type === "tall_cabinet" && (
                    <>
                      <SectionDivider label="Rows" />
                      <label className={styles.fieldLabel}>
                        Rows high
                        <select className={styles.fieldSelect} value={doorRows} onChange={(e) => updDoorCfg({ rows: Number(e.target.value) })}>
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                        </select>
                      </label>
                    </>
                  )}
                  <DoorBankFields cfg={doorCfg} onChangeNow={updDoorCfg} onChange={updDoorCfgDebounced} heightMm={doorHeightMm} />
                </>
              )}

              {/* ── Door Style ── */}
              <SectionDivider label="Door Style" />
              <FrontStyleFields label="Door Board" style={doorStyle} onChange={updDoorStyle} />
            </div>
          </div>
        )}

        {activeTab === "Drawers" && !isCorner && (
          <div className={styles.formSection}>
            <div className={styles.fieldGroup}>
              <DrawerBankFields cfg={drawerCfg} onChangeNow={updDrawerCfg} onChange={updDrawerCfgDebounced} heightMm={draft.height_mm} />
              <SectionDivider label="Drawer Style" />
              <FrontStyleFields label="Drawer Board" style={drawerStyle} onChange={updDrawerStyle} />
            </div>
          </div>
        )}

        {activeTab === "Mixed" && !isCorner && (
          <div className={styles.formSection}>
            <div className={styles.fieldGroup}>
              <SectionDivider label="Sections (top to bottom)" />
              <p style={{ fontSize: 10, color: sectionsTotal === (draft.height_mm || 0) ? "var(--dt-text-muted, #888780)" : "#c0392b", margin: "0 0 4px", lineHeight: 1.4 }}>
                {sectionsTotal === (draft.height_mm || 0)
                  ? `Total: ${sectionsTotal}mm — matches the cabinet height.`
                  : `Total: ${sectionsTotal}mm — ${Math.abs((draft.height_mm || 0) - sectionsTotal)}mm ${sectionsTotal < (draft.height_mm || 0) ? "short of" : "over"} the ${draft.height_mm || 0}mm cabinet height.`}
              </p>

              {sections.map((sec, idx) => (
                <div key={idx} style={{ border: "1px solid var(--dt-border-soft, rgba(0,0,0,0.1))", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dt-text-muted, #888780)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Section {idx + 1} (top {idx === 0 ? "" : `+${sections.slice(0, idx).reduce((s, x) => s + (Number(x.height_mm) || 0), 0)}mm`})
                    </span>
                    <button type="button" onClick={() => removeSection(idx)}
                      style={{ background: "none", border: "none", padding: 0, color: "#c0392b", cursor: "pointer", fontSize: 11 }}>
                      Remove
                    </button>
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel}>
                      Height mm
                      <input className={styles.fieldInput} type="number" min="1" value={sec.height_mm || ""}
                        onChange={(e) => updateSection(idx, { height_mm: Number(e.target.value) }, false)} />
                    </label>
                    <label className={styles.fieldLabel}>
                      Type
                      <select className={styles.fieldSelect} value={sec.type || "doors"} onChange={(e) => updateSectionType(idx, e.target.value)}>
                        <option value="doors">Doors</option>
                        <option value="drawers">Drawers</option>
                        <option value="open">Open space</option>
                      </select>
                    </label>
                  </div>
                  {sec.type === "open" ? (
                    <p style={{ fontSize: 10.5, color: "var(--dt-text-muted, #888780)", margin: 0, lineHeight: 1.4 }}>
                      Left blank — e.g. an oven or microwave recess. No board is cut and nothing is quoted for this section.
                    </p>
                  ) : sec.type === "drawers" ? (
                    <DrawerBankFields
                      cfg={sec.drawer || {}}
                      heightMm={sec.height_mm}
                      onChangeNow={(patch) => updateSectionSubConfig(idx, "drawer", patch, true)}
                      onChange={(patch) => updateSectionSubConfig(idx, "drawer", patch, false)}
                    />
                  ) : (
                    <DoorBankFields
                      cfg={sec.door || {}}
                      heightMm={sec.height_mm}
                      onChangeNow={(patch) => updateSectionSubConfig(idx, "door", patch, true)}
                      onChange={(patch) => updateSectionSubConfig(idx, "door", patch, false)}
                    />
                  )}
                </div>
              ))}

              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={addSection}>
                + Add section
              </button>

              {sectionsAnyDoors && (
                <>
                  <SectionDivider label="Door Style" />
                  <FrontStyleFields label="Door Board" style={doorStyle} onChange={updDoorStyle} />
                </>
              )}
              {sectionsAnyDrawers && (
                <>
                  <SectionDivider label="Drawer Style" />
                  <FrontStyleFields label="Drawer Board" style={drawerStyle} onChange={updDrawerStyle} />
                </>
              )}
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

  // Same lowercase-vs-Title-Case conversion as FrontStyleFields above —
  // draft.material comes from the design tool's material picker.
  const draftMaterialLabel = materialLabelForType(draft.material || "");
  const profileTypes  = profileTypesForSelection(draftMaterialLabel, draft.thickness || "");
  const profileNames  = profileNamesForSelection(draft.profile_type || "", draftMaterialLabel, draft.thickness || "");
  const edgeProfiles  = edgeProfilesForMaterial(draftMaterialLabel);
  const isPanel = draft.item_type === "panel";

  // A standalone panel has two independent "thickness" values that should
  // normally agree: width_mm (the plan-view footprint dimension, always a
  // plain number so canvas/elevation geometry math keeps working) and
  // thickness (the board thickness picked from the material library below,
  // e.g. "18mm" — what actually gets imported into the quote). Left
  // unsynced, it's easy to set one and forget the other, which is exactly
  // what left panels importing with the wrong width/a blank thickness
  // column. Keep them in step in both directions: picking a board
  // thickness updates the footprint number, and typing a footprint number
  // that matches one of the current material's thickness options updates
  // the board thickness too.
  function onPanelWidthMmChange(value) {
    const patch = { width_mm: value };
    const numVal = Math.round(Number(value));
    if (draft.material && Number.isFinite(numVal)) {
      const match = thicknessOptionsForMaterial(draft.material).find((o) => parseInt(o, 10) === numVal);
      if (match) patch.thickness = match;
    }
    setMulti(patch);
  }

  function onPanelBoardChange({ material, thickness, finish, colour, costPerSqmExGst }) {
    const patch = {
      material,
      thickness,
      finish,
      colour,
      unit_cost_per_sqm_ex_gst: costPerSqmExGst || draft.unit_cost_per_sqm_ex_gst || 0,
    };
    const mm = parseInt(thickness, 10);
    if (Number.isFinite(mm)) patch.width_mm = mm;
    setMultiNow(patch);
  }

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
              {isPanel ? "Thickness mm" : "Width mm"}
              <input
                className={styles.fieldInput}
                type="number"
                min="1"
                value={draft.width_mm || ""}
                onChange={(e) => isPanel ? onPanelWidthMmChange(e.target.value) : set("width_mm", e.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Height mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.height_mm || ""} onChange={(e) => set("height_mm", e.target.value)} />
            </label>
          </div>
          {isPanel && (
            <label className={styles.fieldLabel}>
              Depth mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm || ""} onChange={(e) => set("depth_mm", e.target.value)} />
            </label>
          )}
          <label className={styles.fieldLabel}>
            Qty
            <input className={styles.fieldInput} type="number" min="1" value={draft.qty ?? ""} onChange={(e) => set("qty", e.target.value)} />
          </label>

          {/* Board: material → thickness → finish → colour */}
          <MaterialColourPicker
            label="Board"
            material={draft.material || ""}
            thickness={draft.thickness || ""}
            finish={draft.finish || ""}
            colour={draft.colour || ""}
            onChange={isPanel ? onPanelBoardChange : ({ material, thickness, finish, colour, costPerSqmExGst }) =>
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
            <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.unit_cost_per_sqm_ex_gst ?? ""} onChange={(e) => set("unit_cost_per_sqm_ex_gst", e.target.value)} placeholder="0.00" />
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
                  <input className={styles.fieldInput} type="number" min="1" step="1" value={draft.hinge_qty || ""} onChange={(e) => set("hinge_qty", e.target.value)} />
                </label>
              )}
            </>
          )}
          <label className={styles.fieldLabel}>
            X offset mm
            <input className={styles.fieldInput} type="number" min="0" value={draft.x_mm ?? 0} onChange={(e) => set("x_mm", e.target.value)} />
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

// ---- Obstruction form ----
// A generic spatial blocker (nib wall, full wall, brick recess) — never
// manufactured or quoted, so this form is deliberately minimal: no
// material/board/profile/hinge fields at all, just its footprint and where
// it sits on the wall.
function ObstructionForm({ item, onItemChange }) {
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

  return (
    <div className={styles.rightScroll}>
      <div className={styles.formSection}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            Label
            <input className={styles.fieldInput} value={draft.label || ""} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Nib wall" />
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
              Mount height mm
              <input className={styles.fieldInput} type="number" min="0" value={draft.mount_height_mm ?? 0} onChange={(e) => set("mount_height_mm", e.target.value)} />
            </label>
          </div>
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
export default function DesignRightPanel({ item, allItems, materialDefaults, isAddingItem, isOverlapping, onAdd, onCancelAdd, onItemChange, onDeleteItem, onDuplicateItem, onSelectItem }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef(null);
  const [isDuplicating, setIsDuplicating] = useState(false);

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

  // Duplicate posts a new item to the server; without a busy guard a fast
  // double-click (or double-tap) fires two requests before the first
  // response lands, creating two duplicate rows.
  async function handleDuplicateClick() {
    if (isDuplicating) return;
    setIsDuplicating(true);
    try {
      await onDuplicateItem(item.id);
    } finally {
      setIsDuplicating(false);
    }
  }

  if (isAddingItem) {
    return (
      <div className={styles.rightPanel}>
        <div className={styles.rightPanelHeader}>
          <p className={styles.rightPanelTitle}>Add Item</p>
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
        {isOverlapping && (
          <p className={styles.overlapWarning}>
            ⚠ This item overlaps another item on the plan. Drag it (or the other item) to fix the position.
          </p>
        )}
        {isCabinet ? (
          <CabinetConfigForm key={item.id} item={item} allItems={allItems} materialDefaults={materialDefaults} onItemChange={onItemChange} onSelectItem={onSelectItem} />
        ) : item.item_type === "obstruction" ? (
          <ObstructionForm key={item.id} item={item} onItemChange={onItemChange} />
        ) : (
          <DoorPanelForm key={item.id} item={item} onItemChange={onItemChange} />
        )}
        <div className={styles.rightPanelFooter}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={handleDuplicateClick}
            disabled={isDuplicating}
          >
            {isDuplicating ? "Duplicating…" : "Duplicate"}
          </button>
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
          <span className={styles.rightIdleHint}>Click "+ Add Item" in the left panel, or click an existing item to edit it.</span>
        </div>
      </div>
    </div>
  );
}
