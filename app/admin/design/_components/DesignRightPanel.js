"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "../design.module.css";
import MaterialColourPicker from "./MaterialColourPicker";
import ColourField, { collectMatchOptions } from "./ColourField";
import {
  edgeProfilesForMaterial,
  profileNamesForSelection,
  profileTypesForSelection,
} from "../../../../lib/quote-form-data";
import { computeBackPanelRun } from "../../../../lib/pcd-backpanel-utils";
import { computeBottomPanelRun } from "../../../../lib/pcd-bottompanel-utils";
import { fillerPanelGapMm } from "../../../../lib/pcd-fillerpanel-utils";
import { getAbsPos, itemDepthMm } from "./DesignCanvas";
import { CABINET_MOUNT_MM } from "../../../../lib/pcd-kickboard-utils";
import {
  DEFAULT_BENCHTOP_THICKNESS_MM,
  DEFAULT_BENCHTOP_OVERHANG_MM,
  benchtopThicknessMm,
  benchtopOverhangMm,
  benchtopDepthMm,
  benchtopCutouts,
} from "../../../../lib/pcd-benchtop-utils";
import { computeDrawerFrontHeights, DRAWER_RUNNER_LABELS, resolveRunnerType } from "../../../../lib/pcd-drawer-utils";
import { FINGER_PULL_GAP_MM, DEFAULT_HINGE_QTY, DEFAULT_DOOR_REVEAL_MM, doorRowGapMm, drawerGapMm, frontRevealMm, frontWidthMm } from "../../../../lib/pcd-door-utils";
import { thicknessOptionsForMaterial, materialLabelForType } from "../../../../lib/pcd-colour-library";

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet", "blind_corner_cabinet"];
// Cabinet types plus a standalone filler panel — a thin board a user can
// freely position between cabinets (e.g. beside a fridge recess, between a
// base and tall cabinet) with its own height/depth/thickness/material,
// dragged and collision-checked exactly like a cabinet on the plan.
// Obstruction: a generic non-manufactured spatial blocker (nib wall, full
// wall, brick recess) — draggable and fully collision-checked like a
// cabinet, but never quoted.
// Scribe: the mirror image of "panel" — a side filler that sits flush
// against a cabinet's front face and runs sideways to an obstruction, so
// (unlike panel) width_mm keeps its normal along-wall-span meaning and
// scribe_thickness_mm is its own dedicated field rather than an overload.
const ADDABLE_TYPES = [...CABINET_TYPES, "floating_shelf", "panel", "scribe", "obstruction"];

const TYPE_LABELS = {
  base_cabinet:  "Base Cabinet",
  wall_cabinet:  "Wall Cabinet",
  tall_cabinet:  "Tall Cabinet",
  corner_base_cabinet: "Corner Base Cabinet",
  blind_corner_cabinet: "Blind Corner Cabinet",
  floating_shelf: "Floating Shelf",
  door:          "Door",
  drawer_front:  "Drawer Front",
  panel:         "Panel",
  scribe:        "Scribe",
  obstruction:   "Obstruction",
};

const WALL_OPTIONS = [
  { value: "top", label: "Top wall" },
  { value: "bottom", label: "Bottom wall" },
  { value: "left", label: "Left wall" },
  { value: "right", label: "Right wall" },
];

// Manually reassigns which wall an item belongs to — the plan view only
// ever derives `wall` automatically (snapToWall, by nearest-room-edge
// distance while dragging), which guesses wrong for a small item sitting
// right in a corner between two walls (e.g. a scribe meant to support a
// wall cabinet run but sitting slightly closer to the perpendicular wall).
// Recomputes x_mm/y_mm from the item's CURRENT absolute room position so it
// stays where it visually is, just reinterpreted under the new wall's
// along-wall-axis convention (getAbsPos/cabinetFootprint's own convention —
// x_mm for top/bottom, y_mm for left/right, both for island).
function reassignWall(item, newWall, room) {
  const roomW = room?.width_mm || 4000;
  const roomD = room?.depth_mm || 3000;
  const { absX, absY } = getAbsPos(item, roomW, roomD);
  const w = item.width_mm || 600;
  const d = itemDepthMm(item);

  switch (newWall) {
    case "top":
      return { wall: "top", x_mm: Math.max(0, Math.min(absX, roomW - w)), y_mm: 0 };
    case "bottom":
      return { wall: "bottom", x_mm: Math.max(0, Math.min(absX, roomW - w)), y_mm: 0 };
    case "left":
      return { wall: "left", x_mm: 0, y_mm: Math.max(0, Math.min(absY, roomD - w)) };
    case "right":
      return { wall: "right", x_mm: 0, y_mm: Math.max(0, Math.min(absY, roomD - w)) };
    default: // "island" — freestanding, both axes matter
      return {
        wall: "island",
        x_mm: Math.max(0, Math.min(absX, roomW - w)),
        y_mm: Math.max(0, Math.min(absY, roomD - d)),
      };
  }
}

// Sends a form's queued patch and reflects the OUTCOME.
//
// The three item forms (cabinet / door-panel / obstruction) each debounce
// edits into a pending patch and flush it via onItemChange. onItemChange now
// resolves to { ok, error } instead of swallowing failures — because the old
// behaviour was quietly destructive: a failed save made "Saving…" vanish as if
// it had worked, the item never updated so the plan didn't change, and the
// next interaction remounted the form showing the OLD value. The edit was gone
// with no signal.
//
// On failure this re-queues the fields (so the edit survives to a retry or to
// navigating away) and surfaces the reason. On success it clears any error.
function flushItemPatch({ pendingPatchRef, itemId, onItemChange, setSaving, setSaveError }) {
  const patch = pendingPatchRef.current;
  pendingPatchRef.current = {};
  if (!Object.keys(patch).length) { setSaving(false); return; }
  Promise.resolve(onItemChange(itemId, patch))
    .then((res) => {
      if (res && res.ok === false) {
        // Newer edits (made during the in-flight save) win over the retried ones.
        pendingPatchRef.current = { ...patch, ...pendingPatchRef.current };
        setSaveError(res.error || "Save failed.");
      } else {
        setSaveError(null);
      }
    })
    .catch((err) => {
      pendingPatchRef.current = { ...patch, ...pendingPatchRef.current };
      setSaveError(err?.message || "Save failed.");
    })
    .finally(() => setSaving(false));
}

// The save indicator every form footer shows: "Saving…", or a visible,
// retryable error, instead of the previous silent nothing on failure.
function SaveStatus({ saving, error, onRetry }) {
  if (error) {
    return (
      <p className={styles.saveError}>
        Not saved — {error}{" "}
        <button type="button" className={styles.saveRetryBtn} onClick={onRetry}>Retry</button>
      </p>
    );
  }
  if (saving) return <p className={styles.savingIndicator}>Saving…</p>;
  return null;
}

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

// One collapsible group in the config panel.
//
// `summary` shows only while collapsed and is the point of the whole pattern:
// it states what's inside in one line, so a fully-collapsed panel still reads
// as a spec sheet ("Front · 2 doors 447×717 L/R") rather than a row of names
// you have to open one by one to interrogate.
function CollapsibleSection({ title, summary, open, onToggle, children }) {
  return (
    <div className={styles.configSection}>
      <button
        type="button"
        className={styles.configSectionHeader}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={`${styles.configSectionChevron} ${open ? styles.configSectionChevronOpen : ""}`}>▶</span>
        <span className={styles.configSectionTitle}>{title}</span>
        {!open && summary ? <span className={styles.configSectionSummary}>{summary}</span> : null}
      </button>
      {open ? <div className={styles.configSectionBody}>{children}</div> : null}
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
function AddItemForm({ onAdd, onCancel, allowedTypes = ADDABLE_TYPES }) {
  const [draft, setDraft] = useState(() => {
    const d = emptyDraft();
    // Keep the initial type within the allowed set (mobile restricts to
    // base/wall/tall — no corner, no standalone panels/scribes/obstructions).
    return allowedTypes.includes(d.item_type) ? d : { ...d, item_type: allowedTypes[0] };
  });
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
  const isScribe = draft.item_type === "scribe";
  const isShelf = draft.item_type === "floating_shelf";
  const isObstruction = draft.item_type === "obstruction";

  function setType(nextType) {
    if (nextType === "blind_corner_cabinet") {
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        width_mm: d.width_mm && d.width_mm !== 600 ? d.width_mm : 900,
        depth_mm: d.depth_mm || 600,
        blind_width_mm: d.blind_width_mm || 450,
        blind_side: d.blind_side || "left",
      }));
      return;
    }
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
    if (nextType === "scribe") {
      // Normal width/height, plus its own dedicated thickness field —
      // scribe's along-wall span lives in width_mm like a cabinet's does,
      // unlike panel's overloaded width_mm-as-thickness. Always freeform
      // ("island") from creation — a scribe is positioned relative to
      // whichever cabinet it fills against, not a room wall, so it never
      // gets auto-assigned a wall by drag proximity (see isFreeform in
      // DesignCanvas.js). Rotation controls which wall it supports.
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        wall: "island",
        width_mm: d.width_mm && d.width_mm !== 600 ? d.width_mm : 300,
        height_mm: d.height_mm || 720,
        scribe_thickness_mm: d.scribe_thickness_mm || 18,
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
    if (nextType === "floating_shelf") {
      // Wall-mounted decorative-board box: width along the wall, a shallow
      // depth, a thin fascia height, at a default mount height.
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        wall: d.wall && d.wall !== "island" ? d.wall : "top",
        width_mm: d.width_mm && d.width_mm !== 600 ? d.width_mm : 900,
        depth_mm: 250,
        height_mm: 40,
        mount_height_mm: d.mount_height_mm ?? 1500,
        carcass_thickness_mm: d.carcass_thickness_mm || 18,
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
            {allowedTypes.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Label
          <input className={styles.fieldInput} value={draft.label} onChange={(e) => set("label", e.target.value)} placeholder={isPanel ? "e.g. Filler panel" : isScribe ? "e.g. Fridge scribe" : "e.g. Sink base"} />
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
        ) : isScribe ? (
          <>
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
            <label className={styles.fieldLabel}>
              Thickness mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.scribe_thickness_mm} onChange={(e) => set("scribe_thickness_mm", e.target.value)} />
            </label>
          </>
        ) : isShelf ? (
          <>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>
                Width mm
                <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm} onChange={(e) => set("width_mm", e.target.value)} />
              </label>
              <label className={styles.fieldLabel}>
                Depth mm
                <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm} onChange={(e) => set("depth_mm", e.target.value)} />
              </label>
            </div>
            <label className={styles.fieldLabel}>
              Height mm (fascia)
              <input className={styles.fieldInput} type="number" min="1" value={draft.height_mm} onChange={(e) => set("height_mm", e.target.value)} />
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
// The finger-pull reveal controls. Shared, because a regular cabinet's door
// bank and a corner cabinet's bi-fold door store the same
// row_gap_enabled/row_gap_mm pair — they just hang it off differently shaped
// door_configs. The corner branch had no gap control at all before this.
// The full-overlay reveal — the gap between adjacent fronts. Shared by every
// front type, because a door bank, a drawer bank and a corner door all need
// the same clearance. Fronts were previously cut to the exact carcass face
// with no gap at all, which physically cannot swing.
function RevealField({ cfg, onChange, note }) {
  return (
    <>
      <SectionDivider label="Reveal" />
      <label className={styles.fieldLabel}>
        Reveal mm
        <input className={styles.fieldInput} type="number" min="0" step="0.5"
          value={cfg.reveal_mm ?? DEFAULT_DOOR_REVEAL_MM}
          onChange={(e) => onChange({ reveal_mm: e.target.value })} />
      </label>
      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
        {note || `Gap between adjacent fronts, with half of it at each end of the bank so neighbouring
                  cabinets sit the same distance apart. ${DEFAULT_DOOR_REVEAL_MM}mm is the full-overlay standard —
                  each front is cut its share of the cabinet width minus one reveal.`}
      </p>
    </>
  );
}

function FingerPullGapFields({ cfg, onChangeNow, onChange, label, note }) {
  return (
    <>
      <SectionDivider label="Finger-Pull Gap" />
      <label className={styles.fieldCheckLabel}>
        <input type="checkbox" checked={Boolean(cfg.row_gap_enabled)}
          onChange={(e) => onChangeNow({
            row_gap_enabled: e.target.checked,
            // Store the default outright rather than leaving it implied by
            // the input's display value — a null here read as 0 to every
            // consumer, so the gap drew and priced as nothing until the
            // field was hand-edited.
            ...(e.target.checked && cfg.row_gap_mm == null ? { row_gap_mm: FINGER_PULL_GAP_MM } : {}),
          })} />
        {label}
      </label>
      {cfg.row_gap_enabled && (
        <>
          <label className={styles.fieldLabel}>
            Gap mm
            <input className={styles.fieldInput} type="number" min="1" value={cfg.row_gap_mm ?? FINGER_PULL_GAP_MM}
              onChange={(e) => onChange({ row_gap_mm: e.target.value })} />
          </label>
          <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
            {note}
          </p>
        </>
      )}
    </>
  );
}

function DoorBankFields({ cfg, onChangeNow, onChange, heightMm }) {
  const cols     = Math.max(1, cfg.columns || 1);
  const hinges   = cfg.hinges || Array(cols).fill("L");
  const eqW      = cfg.equal_width !== false;
  const ratios   = cfg.width_ratios || Array(cols).fill(1 / cols);
  const hingeQty = cfg.hinge_qty || Array(cols).fill(DEFAULT_HINGE_QTY);
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
      const qty = (hingeQty[0] ?? DEFAULT_HINGE_QTY);
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
        const qty = hingeQty[col] ?? DEFAULT_HINGE_QTY;
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

      <RevealField cfg={cfg} onChange={onChange} />
      <FingerPullGapFields
        cfg={cfg}
        onChangeNow={onChangeNow}
        onChange={onChange}
        label="Include a negative gap for this door row"
        note="Grip position is automatic: at or under the 900mm bench-height line the grip sits at the top (you're
              looking down at it, same as a base cabinet), above bench height it sits at the bottom instead, so you're
              never reaching above a door near the top of a tall cabinet to find the grip. On a multi-row tall cabinet
              this applies per row."
      />
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
  const gapMm = drawerGapMm(cfg);
  const runnerType = resolveRunnerType(cfg);

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
  const frontHeights = computeDrawerFrontHeights(heights, gapEnabled, gapMm, frontRevealMm(cfg));

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

      <RevealField
        cfg={cfg}
        onChange={onChange}
        note={`Gap between stacked drawer fronts, and half of it at each end of the bank.
               ${DEFAULT_DOOR_REVEAL_MM}mm is the full-overlay standard. Where a finger-pull gap is on it
               replaces the reveal on that edge rather than adding to it.`}
      />

      <SectionDivider label="Finger-Pull Gap" />
      <label className={styles.fieldCheckLabel}>
        <input type="checkbox" checked={gapEnabled} onChange={(e) => onChangeNow({
          gap_enabled: e.target.checked,
          ...(e.target.checked && cfg.gap_mm == null ? { gap_mm: FINGER_PULL_GAP_MM } : {}),
        })} />
        Include a negative gap above each drawer
      </label>
      {gapEnabled && (
        <label className={styles.fieldLabel}>
          Gap mm
          <input className={styles.fieldInput} type="number" min="1" value={cfg.gap_mm ?? FINGER_PULL_GAP_MM}
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
          {Object.entries(DRAWER_RUNNER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
        Supplied with the drawer, not costed separately — carried onto the quote line as the fit spec.
      </p>
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
export function FrontStyleFields({ label, style, onChange, matchOptions = [] }) {
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
      <ColourField
        label={label}
        value={style?.material || style?.colour ? style : null}
        matchOptions={matchOptions}
        thicknessDefault={18}
        onChange={(s) =>
          onChange({
            material: s?.material || "",
            finish: s?.finish || "",
            colour: s?.colour || "",
            thickness_mm: s?.thickness_mm || style.thickness_mm || 18,
            cost_per_sqm: s?.cost_per_sqm ?? style.cost_per_sqm ?? 0,
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
    </>
  );
}

// ---- Cabinet config form ----
function CabinetConfigForm({ item, allItems, room, materialDefaults, onItemChange, onSelectItem, openSections, toggleSection }) {
  const [draft, setDraft]         = useState(item);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError]  = useState(null);
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
    flushItemPatch({ pendingPatchRef, itemId: item.id, onItemChange: onItemChangeRef.current, setSaving, setSaveError });
  }
  function retrySave() { setSaving(true); flushPending(); }

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

  // The front type and its configuration now live in the same section, so
  // there is no longer a tab to be thrown off when the type changes — the old
  // useEffect that force-switched back to "Dimensions" existed only because
  // the tab you were standing on could vanish underneath you.

  const isCorner = draft.item_type === "corner_base_cabinet";
  const isBlindCorner = draft.item_type === "blind_corner_cabinet";
  // Only floor-standing cabinets with a working top: a tall cabinet runs past
  // bench height, a wall cabinet has nothing to sit on.
  const isBenchtopType = ["base_cabinet", "corner_base_cabinet", "blind_corner_cabinet"].includes(draft.item_type);
  // What is actually left to put a door on, once the return cabinet has
  // covered the blind end.
  const blindOpeningMm = isBlindCorner ? frontWidthMm(draft) : 0;

  // ---- Collapsed-section summaries ----
  // Each one states its section's contents in a single line. This is what
  // makes a collapsed panel readable: you see the whole cabinet's spec without
  // opening anything, and only expand the group you're actually changing.
  const summary = {};
  summary.cabinet = [
    [draft.width_mm, draft.height_mm, draft.depth_mm].every(Boolean)
      ? `${draft.width_mm}×${draft.height_mm}×${draft.depth_mm}`
      : "size not set",
    (draft.qty || 1) > 1 ? `×${draft.qty}` : "",
    isBlindCorner && draft.blind_width_mm ? `${draft.blind_width_mm} blind` : "",
    isCorner && draft.secondary_wall ? `+${draft.secondary_wall} wall` : "",
  ].filter(Boolean).join(" · ");

  summary.boards = [
    draft.colour || draft.material || "no board",
    draft.carcass_thickness_mm ? `${draft.carcass_thickness_mm}mm` : "",
    draft.unit_cost_mode === "manual" ? "manual rate" : "",
  ].filter(Boolean).join(" · ");

  summary.carcass = [
    draft.back_panel_included === false ? "no back" : "back",
    draft.shelf_qty > 0 ? `${draft.shelf_qty} shelf${draft.shelf_qty === 1 ? "" : "s"}` : "no shelves",
    draft.has_rangehood ? "rangehood" : "",
  ].filter(Boolean).join(" · ");

  const FRONT_LABELS = { none: "None", doors: "Doors", drawers: "Drawers", mixed: "Doors + drawers" };
  summary.front = FRONT_LABELS[draft.front_type || "none"] || "None";

  summary.finishing = [
    draft.has_kickboard ? "kickboard" : "",
    draft.has_filler_panel ? "filler" : "",
    draft.end_panel_left && draft.end_panel_right ? "both ends"
      : draft.end_panel_left ? "left end"
      : draft.end_panel_right ? "right end" : "",
    draft.has_back_panel || draft.back_panel_wall1 || draft.back_panel_wall2 ? "finished back" : "",
    draft.has_bottom_panel ? "underside" : "",
  ].filter(Boolean).join(" · ") || "none";

  summary.benchtop = draft.has_benchtop
    ? [
        `${benchtopThicknessMm(draft)}mm`,
        `${benchtopDepthMm(draft)} deep`,
        (draft.benchtop_span || "continuous") === "individual" ? "individual" : "",
        benchtopCutouts(draft).length ? `${benchtopCutouts(draft).length} cutout${benchtopCutouts(draft).length === 1 ? "" : "s"}` : "",
        draft.benchtop_waterfall_left && draft.benchtop_waterfall_right ? "waterfall both"
          : draft.benchtop_waterfall_left ? "waterfall left"
          : draft.benchtop_waterfall_right ? "waterfall right" : "",
      ].filter(Boolean).join(" · ")
    : "none";

  summary.notes = draft.notes ? String(draft.notes).split("\n")[0] : "";

  // ---- Door config helpers (used by Doors tab + Mixed door-type sections) ----
  const doorCfg    = draft.door_config  || {};
  const doorRows   = Math.max(1, doorCfg.rows || 1);
  // The REAL door height, reveal deducted — this is the datum hinge
  // positions are measured against, so it has to match what the cut list
  // and the quote's hinge note use. Reading the raw cabinet height here made
  // the panel promise "100mm from top" while the manufacturing note said
  // 80mm, off by exactly the finger-pull gap, and let you enter a hinge
  // position past the end of the door.
  const doorHeightMm = Math.max(0, Math.round((draft.height_mm || 0) / doorRows - doorRowGapMm(doorCfg)));

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

  // ---- Finishing (end/side/back/underside) panel material ----
  // A finished panel is its own board over the carcass side — not carcass
  // Existing finishes across the project, offered as "match" shortcuts in the
  // colour modal. Recomputed each render (cheap) so it always reflects the
  // latest edits.
  const matchOptions = collectMatchOptions(allItems, draft);

  function renderFinishPanelMaterial() {
    return (
      <ColourField
        label="Finishing panel"
        value={draft.finish_panel_style || null}
        matchHint="Matches the doors by default"
        canReset
        matchOptions={matchOptions}
        thicknessDefault={18}
        onChange={(style) => setNow("finish_panel_style", style)}
      />
    );
  }

  // Optional per-piece finishing colour override (kickboard / filler /
  // underside / back). Blank means "match" the piece's default part; picking a
  // colour overrides it.
  function renderOverridePicker(key, label, matchHint) {
    return (
      <ColourField
        label={label}
        value={draft[key] || null}
        matchHint={matchHint}
        canReset
        matchOptions={matchOptions}
        onChange={(style) => setNow(key, style)}
      />
    );
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
  const cornerHingeQty = cornerDoorCfg.hinge_qty ?? DEFAULT_HINGE_QTY;
  const cornerHingePositions = cornerDoorCfg.hinge_positions_mm || [];
  // Reveal deducted, same as doorHeightMm above — computeCornerDoorLeaves
  // shortens both leaves by the gap, so the hinge datum has to agree.
  const cornerDoorHeightMm = Math.max(0, Math.round((draft.height_mm || 0) - doorRowGapMm(cornerDoorCfg)));

  function setCornerHingeWall(wallKey) {
    const prev = latestRef.current.door_config || {};
    setNow("door_config", { ...prev, hinge_wall: wallKey });
  }

  // ---- Benchtop cutouts ----
  // Written immediately rather than debounced: they're discrete rows being
  // added/removed, and a click-away mid-debounce would lose one.
  function setCutouts(next) {
    setNow("benchtop_cutouts", next);
  }
  function addCutout() {
    // Defaults to a common single-bowl sink, so the row lands usable rather
    // than as three blank fields.
    setCutouts([...(latestRef.current.benchtop_cutouts || []), { type: "sink", width_mm: 800, depth_mm: 450 }]);
  }
  function updCutout(idx, patch) {
    const cur = latestRef.current.benchtop_cutouts || [];
    setCutouts(cur.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function removeCutout(idx) {
    setCutouts((latestRef.current.benchtop_cutouts || []).filter((_, i) => i !== idx));
  }

  function updCornerDoorCfg(patch, immediate = true) {
    const prev = latestRef.current.door_config || {};
    if (immediate) setNow("door_config", { ...prev, ...patch });
    else set("door_config", { ...prev, ...patch });
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

  const section = (id) => ({
    open: Boolean(openSections[id]),
    onToggle: () => toggleSection(id),
  });

  return (
    <>
      <div className={styles.rightScroll}>
        <CollapsibleSection title="Cabinet" summary={summary.cabinet} {...section("cabinet")}>
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
              {isBlindCorner && (
                <>
                  <SectionDivider label="Blind Zone" />
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                    A blind corner is an ordinary box that runs into the corner — the return cabinet covers part of its
                    width, and nothing opens onto that part. The carcass, back, kickboard and shelves are still the full
                    width; only the door/drawer opening is what&apos;s left over.
                  </p>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel}>
                      Blind width mm
                      <input className={styles.fieldInput} type="number" min="0"
                        max={draft.width_mm || undefined}
                        value={draft.blind_width_mm ?? ""}
                        onChange={(e) => set("blind_width_mm", e.target.value)} />
                    </label>
                    <label className={styles.fieldLabel}>
                      Blind end
                      <select className={styles.fieldSelect} value={draft.blind_side || "left"}
                        onChange={(e) => setNow("blind_side", e.target.value)}>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                  </div>
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                    {blindOpeningMm > 0
                      ? `Door/drawer opening: ${blindOpeningMm}mm of the ${draft.width_mm || 0}mm carcass.`
                      : "Set a blind width smaller than the cabinet width to leave an opening."}
                    {" "}The blind end is the one you&apos;d see on your left or right standing in front of it.
                  </p>
                </>
              )}
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
                </>
              )}
              {draft.item_type === "wall_cabinet" && (
                <label className={styles.fieldLabel}>
                  Mount height mm
                  <input className={styles.fieldInput} type="number" min="0" value={draft.mount_height_mm ?? CABINET_MOUNT_MM[draft.item_type] ?? 0} onChange={(e) => set("mount_height_mm", e.target.value)} />
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

              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "4px 0 0", lineHeight: 1.4 }}>
                Drag the cabinet on the floor plan to reposition. Wall assigns automatically.
              </p>
            </div>
        </CollapsibleSection>

        <CollapsibleSection title="Boards & Cost" summary={summary.boards} {...section("boards")}>
            <div className={styles.fieldGroup}>
              <ColourField
                label="Carcass board"
                value={{ material: draft.material, finish: draft.finish, colour: draft.colour, thickness_mm: draft.carcass_thickness_mm, cost_per_sqm: draft.cost_per_sqm_carcass }}
                matchOptions={matchOptions}
                onChange={(style) =>
                  setMultiNow({
                    material: style?.material || "",
                    finish: style?.finish || "",
                    colour: style?.colour || "",
                    carcass_thickness_mm: style?.thickness_mm || draft.carcass_thickness_mm || 16,
                    cost_per_sqm_carcass: style?.cost_per_sqm ?? draft.cost_per_sqm_carcass ?? 0,
                  })
                }
              />
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
        </CollapsibleSection>

        <CollapsibleSection title="Carcass" summary={summary.carcass} {...section("carcass")}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldCheckLabel}>
                <input
                  type="checkbox"
                  checked={draft.back_panel_included ?? true}
                  onChange={(e) => setNow("back_panel_included", e.target.checked)}
                />
                Include structural back
              </label>
              {/* "Structural back" vs the "Finished back panel" in Finishing:
                  back_panel_included is the carcass's own back board, part of
                  the box. has_back_panel is a decorative board applied to an
                  EXPOSED back (an island or peninsula run). Two different
                  things that used to be called almost the same thing and sat
                  a few fields apart. */}
              {draft.back_panel_included && (
                <label className={styles.fieldLabel}>
                  <span>Structural back thickness mm</span>
                  <input className={styles.fieldInput} type="number" min="1" value={draft.back_panel_thickness_mm ?? 16} onChange={(e) => set("back_panel_thickness_mm", e.target.value)} />
                </label>
              )}
              <label className={styles.fieldLabel}>
                Shelf qty
                <input className={styles.fieldInput} type="number" min="0" value={draft.shelf_qty ?? 0} onChange={(e) => set("shelf_qty", e.target.value)} />
              </label>
              {Number(draft.shelf_qty) > 0 && (
                <ColourField
                  label="Shelf board"
                  value={{ material: draft.shelf_material, finish: draft.shelf_finish, colour: draft.shelf_colour, thickness_mm: draft.shelf_thickness_mm, cost_per_sqm: draft.cost_per_sqm_shelf }}
                  matchHint="Matches carcass by default"
                  matchOptions={matchOptions}
                  onChange={(style) =>
                    setMultiNow({
                      shelf_material: style?.material || "",
                      shelf_finish: style?.finish || "",
                      shelf_colour: style?.colour || "",
                      shelf_thickness_mm: style?.thickness_mm || draft.shelf_thickness_mm || 16,
                      cost_per_sqm_shelf: style?.cost_per_sqm ?? draft.cost_per_sqm_shelf ?? 0,
                    })
                  }
                />
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

            </div>
        </CollapsibleSection>

        {/* Everything a cabinet gets FINISHED with — every board applied to the
            outside of the carcass. This is the group the old "Back & Shelves"
            tab was hiding: kickboard, filler, end panels, finished backs and
            undersides are one coherent idea, not leftovers. */}
        {/* Benchtop — base and corner cabinets only. A tall cabinet runs past
            bench height and a wall cabinet has nothing to sit on.

            This section exists at all because the accordion has no tab ceiling.
            Under the old five-tab bar it would have had to be crammed into
            "Back & Shelves" with everything else. */}
        {isBenchtopType && (
        <CollapsibleSection title="Benchtop" summary={summary.benchtop} {...section("benchtop")}>
            <div className={styles.fieldGroup}>
              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                Drawn, not quoted — benchtops aren&apos;t supplied, so this never reaches the cut list or the quote.
                It&apos;s here so the drawing shows the surface, and so whoever fabricates it has the cutouts and
                waterfall ends to work from.
              </p>
              <label className={styles.fieldCheckLabel}>
                <input type="checkbox" checked={draft.has_benchtop ?? false}
                  onChange={(e) => setNow("has_benchtop", e.target.checked)} />
                Show a benchtop on this cabinet
              </label>

              {draft.has_benchtop && (
                <>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel}>
                      Thickness mm
                      <input className={styles.fieldInput} type="number" min="1"
                        value={draft.benchtop_thickness_mm ?? DEFAULT_BENCHTOP_THICKNESS_MM}
                        onChange={(e) => set("benchtop_thickness_mm", e.target.value)} />
                    </label>
                    <label className={styles.fieldLabel}>
                      Front overhang mm
                      <input className={styles.fieldInput} type="number" min="0"
                        value={draft.benchtop_overhang_mm ?? DEFAULT_BENCHTOP_OVERHANG_MM}
                        onChange={(e) => set("benchtop_overhang_mm", e.target.value)} />
                    </label>
                  </div>
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                    Overhang is measured past the front face of the door, not the carcass — so this top is{" "}
                    <strong>{benchtopDepthMm(draft)}mm</strong> deep ({draft.depth_mm || 600} carcass + door +{" "}
                    {benchtopOverhangMm(draft)} overhang).
                  </p>

                  <label className={styles.fieldLabel}>
                    Span
                    <select className={styles.fieldSelect} value={draft.benchtop_span || "continuous"}
                      onChange={(e) => setNow("benchtop_span", e.target.value)}>
                      <option value="continuous">Continuous — one top across the run</option>
                      <option value="individual">Individual — this cabinet only</option>
                    </select>
                  </label>

                  <SectionDivider label="Waterfall Ends" />
                  <label className={styles.fieldCheckLabel}>
                    <input type="checkbox" checked={Boolean(draft.benchtop_waterfall_left)}
                      onChange={(e) => setNow("benchtop_waterfall_left", e.target.checked)} />
                    Left end runs to the floor
                  </label>
                  <label className={styles.fieldCheckLabel}>
                    <input type="checkbox" checked={Boolean(draft.benchtop_waterfall_right)}
                      onChange={(e) => setNow("benchtop_waterfall_right", e.target.checked)} />
                    Right end runs to the floor
                  </label>

                  <SectionDivider label="Cutouts" />
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                    Centred on this cabinet. These aren&apos;t appliances — they only tell the fabricator a hole this
                    size goes here.
                  </p>
                  {(draft.benchtop_cutouts || []).map((cut, idx) => (
                    <div key={idx} className={styles.fieldRow} style={{ alignItems: "flex-end" }}>
                      <label className={styles.fieldLabel}>
                        Type
                        <select className={styles.fieldSelect} value={cut.type || "sink"}
                          onChange={(e) => updCutout(idx, { type: e.target.value })}>
                          <option value="sink">Sink</option>
                          <option value="cooktop">Cooktop</option>
                        </select>
                      </label>
                      <label className={styles.fieldLabel}>
                        W mm
                        <input className={styles.fieldInput} type="number" min="1" value={cut.width_mm ?? ""}
                          onChange={(e) => updCutout(idx, { width_mm: Number(e.target.value) || 0 })} />
                      </label>
                      <label className={styles.fieldLabel}>
                        D mm
                        <input className={styles.fieldInput} type="number" min="1" value={cut.depth_mm ?? ""}
                          onChange={(e) => updCutout(idx, { depth_mm: Number(e.target.value) || 0 })} />
                      </label>
                      <button type="button" className={`${styles.btn} ${styles.btnSecondary}`}
                        style={{ marginBottom: 2 }} onClick={() => removeCutout(idx)}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={addCutout}>
                    Add cutout
                  </button>
                </>
              )}
            </div>
        </CollapsibleSection>
        )}

        {/* Corner cabinets get their finished backs per leg, since an L-shape
            has no single "back" side. */}
        {isCorner && (
          <CollapsibleSection title="Finished backs" summary={draft.back_panel_wall1 || draft.back_panel_wall2 ? "On" : "Off"} {...section("finbacks")}>
            <div className={styles.fieldGroup}>
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                    Manual per leg, not auto-detected — a corner cabinet&apos;s second wall is often a virtual assignment
                    (an island corner unit) rather than a real wall, so which side is actually exposed can&apos;t be sensed
                    reliably. Tick whichever leg(s) need a finished back.
                  </p>
                  <label className={styles.fieldCheckLabel}>
                    <input type="checkbox" checked={Boolean(draft.back_panel_wall1)}
                      onChange={(e) => setNow("back_panel_wall1", e.target.checked)} />
                    Wall 1 finished back ({draft.wall || "—"})
                  </label>
                  <label className={styles.fieldCheckLabel}>
                    <input type="checkbox" checked={Boolean(draft.back_panel_wall2)} disabled={!draft.secondary_wall}
                      onChange={(e) => setNow("back_panel_wall2", e.target.checked)} />
                    Wall 2 finished back {draft.secondary_wall ? `(${draft.secondary_wall})` : "(set a second wall first)"}
                  </label>
                  {(draft.back_panel_wall1 || draft.back_panel_wall2) && (
                    <label className={styles.fieldCheckLabel}>
                      <input type="checkbox" checked={Boolean(draft.panel_to_floor)}
                        onChange={(e) => setNow("panel_to_floor", e.target.checked)} />
                      Panels run to floor (otherwise carcass height only, kickboard continues underneath)
                    </label>
                  )}
            </div>
          </CollapsibleSection>
        )}

        {/* Kickboard / plinth — not applicable to wall cabinets. */}
        {draft.item_type !== "wall_cabinet" && (
          <CollapsibleSection title="Kickboard / plinth" summary={draft.has_kickboard ? "Included" : "Off"} {...section("kickboard")}>
            <div className={styles.fieldGroup}>
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
                            value={draft.kickboard_height_mm ?? 120}
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
                        Continuous kickboard runs are calculated as one piece across the full run in the cut list.
                      </p>
                      {renderOverridePicker("kickboard_style", "Kickboard colour", "Matches the carcass by default.")}
                    </>
                  )}
            </div>
          </CollapsibleSection>
        )}

        {/* Filler panel — wall and tall cabinets only. */}
        {(draft.item_type === "wall_cabinet" || draft.item_type === "tall_cabinet") && (
          <CollapsibleSection title="Filler panel" summary={draft.has_filler_panel ? "Included" : "Off"} {...section("filler")}>
            <div className={styles.fieldGroup}>
                  <label className={styles.fieldCheckLabel}>
                    <input
                      type="checkbox"
                      checked={draft.has_filler_panel ?? false}
                      onChange={(e) => setNow("has_filler_panel", e.target.checked)}
                    />
                    Include filler panel (to ceiling)
                  </label>
                  {draft.has_filler_panel && (
                    <>
                      <div className={styles.fieldRow}>
                        <label className={styles.fieldLabel}>
                          Height mm
                          <input
                            className={styles.fieldInput}
                            type="number"
                            min="1"
                            value={draft.filler_panel_height_mm ?? fillerPanelGapMm(draft, room, allItems)}
                            onChange={(e) => set("filler_panel_height_mm", e.target.value)}
                          />
                        </label>
                        <label className={styles.fieldLabel}>
                          Thickness mm
                          <input
                            className={styles.fieldInput}
                            type="number"
                            min="1"
                            value={draft.filler_panel_thickness_mm ?? 16}
                            onChange={(e) => set("filler_panel_thickness_mm", e.target.value)}
                          />
                        </label>
                      </div>
                      <label className={styles.fieldLabel}>
                        Spanning style
                        <select
                          className={styles.fieldSelect}
                          value={draft.filler_panel_span ?? "continuous"}
                          onChange={(e) => setNow("filler_panel_span", e.target.value)}
                        >
                          <option value="continuous">Continuous (spans across adjacent cabinets)</option>
                          <option value="individual">Individual (separate piece per cabinet)</option>
                        </select>
                      </label>
                      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                        Continuous filler panel runs are calculated as one piece across the full run in the cut list. Height defaults to the gap above the cabinet ({fillerPanelGapMm(draft, room, allItems)}mm) — to the ceiling, or to the nearest obstruction above if closer — override if you need a different height.
                      </p>
                      {renderOverridePicker("filler_panel_style", "Filler colour", "Matches the doors on a doored cabinet, otherwise the carcass.")}
                    </>
                  )}
            </div>
          </CollapsibleSection>
        )}

        {/* Underside panel — wall cabinets only. */}
        {draft.item_type === "wall_cabinet" && (
          <CollapsibleSection title="Underside panel" summary={draft.has_bottom_panel ? "Included" : "Off"} {...section("underside")}>
            <div className={styles.fieldGroup}>
              {(() => {
                const isContinuous = (draft.bottom_panel_span ?? "continuous") === "continuous";
                const liveItems = allItems
                  ? allItems.map((i) => (i.id === draft.id ? { ...i, ...draft } : i))
                  : [draft];
                const run = draft.has_bottom_panel && isContinuous
                  ? computeBottomPanelRun(draft, liveItems)
                  : null;
                const isFirstInRun = !run || run.firstItemId === draft.id;
                const firstItem = run && !isFirstInRun
                  ? liveItems.find((i) => i.id === run.firstItemId)
                  : null;

                return (
                  <>
                    <label className={styles.fieldCheckLabel}>
                      <input
                        type="checkbox"
                        checked={draft.has_bottom_panel ?? false}
                        onChange={(e) => setNow("has_bottom_panel", e.target.checked)}
                      />
                      Finished underside panel
                    </label>

                    {draft.has_bottom_panel && (
                      <>
                        <label className={styles.fieldLabel}>
                          Spanning style
                          <select
                            className={styles.fieldSelect}
                            value={draft.bottom_panel_span ?? "continuous"}
                            onChange={(e) => setNow("bottom_panel_span", e.target.value)}
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
                                value={draft.bottom_panel_qty ?? 1}
                                onChange={(e) => set("bottom_panel_qty", e.target.value)}
                              />
                            </label>
                          ) : (
                            <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                              Continuous underside panel run ({run.count} cabinets, {draft.bottom_panel_qty ?? firstItem?.bottom_panel_qty ?? 1} panels) —
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
                        {renderOverridePicker("bottom_panel_style", "Underside colour", "Matches the carcass by default.")}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </CollapsibleSection>
        )}

        {/* Finished side panels — wall cabinets. */}
        {draft.item_type === "wall_cabinet" && (
          <CollapsibleSection title="Side panels" summary={draft.end_panel_left || draft.end_panel_right ? "On" : "Off"} {...section("sidepanels")}>
            <div className={styles.fieldGroup}>
                  <label className={styles.fieldCheckLabel}>
                    <input
                      type="checkbox"
                      checked={draft.end_panel_left ?? false}
                      onChange={(e) => setNow("end_panel_left", e.target.checked)}
                    />
                    Left side panel
                  </label>
                  <label className={styles.fieldCheckLabel}>
                    <input
                      type="checkbox"
                      checked={draft.end_panel_right ?? false}
                      onChange={(e) => setNow("end_panel_right", e.target.checked)}
                    />
                    Right side panel
                  </label>
                  {(draft.end_panel_left || draft.end_panel_right) && draft.has_bottom_panel && (
                    <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: 0, lineHeight: 1.4 }}>
                      Side panels extend down to cover the finished underside panel edge.
                    </p>
                  )}
                  {(draft.end_panel_left || draft.end_panel_right) && renderFinishPanelMaterial()}
            </div>
          </CollapsibleSection>
        )}

        {/* End & back panels — base/tall cabinets only. */}
        {(draft.item_type === "base_cabinet" || draft.item_type === "tall_cabinet") && (
          <CollapsibleSection title="End & back panels" summary={draft.end_panel_left || draft.end_panel_right || draft.has_back_panel ? "On" : "Off"} {...section("endback")}>
            <div className={styles.fieldGroup}>
              {(() => {
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
                        {renderOverridePicker("back_panel_style", "Back panel colour", "Matches the carcass by default.")}
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
                    {anyPanel && renderFinishPanelMaterial()}
                  </>
                );
              })()}
            </div>
          </CollapsibleSection>
        )}

        {/* The front TYPE and the front's CONFIG in one place. They used to be
            two tabs apart — you picked "Doors" in Dimensions, then the Doors
            tab appeared elsewhere and the bar reshaped under you. */}
        <CollapsibleSection title="Front" summary={summary.front} {...section("front")}>
            <div className={styles.fieldGroup}>
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
            </div>

            {draft.front_type === "doors" && (
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
                  <RevealField cfg={cornerDoorCfg} onChange={(patch) => updCornerDoorCfg(patch, false)} />
                  <FingerPullGapFields
                    cfg={cornerDoorCfg}
                    onChangeNow={(patch) => updCornerDoorCfg(patch, true)}
                    onChange={(patch) => updCornerDoorCfg(patch, false)}
                    label="Include a negative gap across the corner door"
                    note="One reveal shortens both leaves equally, so they still line up when the door folds around the
                          corner. A corner base cabinet sits under the 900mm bench-height line, so the grip is at the top."
                  />
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
              <FrontStyleFields label="Door Board" style={doorStyle} onChange={updDoorStyle} matchOptions={matchOptions} />
            </div>
            )}

            {draft.front_type === "drawers" && !isCorner && (
            <div className={styles.fieldGroup}>
              <DrawerBankFields cfg={drawerCfg} onChangeNow={updDrawerCfg} onChange={updDrawerCfgDebounced} heightMm={draft.height_mm} />
              <SectionDivider label="Drawer Style" />
              <FrontStyleFields label="Drawer Board" style={drawerStyle} onChange={updDrawerStyle} matchOptions={matchOptions} />
            </div>
            )}

            {draft.front_type === "mixed" && !isCorner && (
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
                  <FrontStyleFields label="Door Board" style={doorStyle} onChange={updDoorStyle} matchOptions={matchOptions} />
                </>
              )}
              {sectionsAnyDrawers && (
                <>
                  <SectionDivider label="Drawer Style" />
                  <FrontStyleFields label="Drawer Board" style={drawerStyle} onChange={updDrawerStyle} matchOptions={matchOptions} />
                </>
              )}
            </div>
            )}
        </CollapsibleSection>

        <CollapsibleSection title="Notes" summary={summary.notes} {...section("notes")}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                Notes
                <textarea className={styles.fieldTextarea} value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={6} />
              </label>
            </div>
        </CollapsibleSection>

        <SaveStatus saving={saving} error={saveError} onRetry={retrySave} />
      </div>
    </>
  );
}

// ---- Door / panel flat form ----
// A floating shelf — a decorative-board box (top + bottom + front fascia, plus
// optional mitred end caps) in one finish, wall-mounted at a height. Edits
// width / depth / height / mount / thickness / colour and which ends are capped;
// on import each board becomes its own Panel line (see pcd-floating-shelf-utils).
function ShelfForm({ item, allItems, onItemChange }) {
  const [draft, setDraft] = useState(item);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
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

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    const patch = pendingPatchRef.current;
    if (Object.keys(patch).length) onItemChangeRef.current(item.id, patch);
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function flushPending() {
    flushItemPatch({ pendingPatchRef, itemId: item.id, onItemChange: onItemChangeRef.current, setSaving, setSaveError });
  }
  function retrySave() { setSaving(true); flushPending(); }
  function set(key, val) {
    const next = { ...latestRef.current, [key]: val };
    latestRef.current = next; setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, [key]: val };
    clearTimeout(timerRef.current); setSaving(true);
    timerRef.current = setTimeout(flushPending, 600);
  }
  function setNow(key, val) {
    const next = { ...latestRef.current, [key]: val };
    latestRef.current = next; setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, [key]: val };
    clearTimeout(timerRef.current); setSaving(true); flushPending();
  }
  function setMultiNow(patch) {
    const next = { ...latestRef.current, ...patch };
    latestRef.current = next; setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    clearTimeout(timerRef.current); setSaving(true); flushPending();
  }

  const matchOptions = collectMatchOptions(allItems, draft);

  return (
    <div className={styles.addItemForm}>
      <SaveStatus saving={saving} error={saveError} onRetry={retrySave} />
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>
          Label
          <input className={styles.fieldInput} value={draft.label || ""} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Floating shelf" />
        </label>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            Width mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm ?? ""} onChange={(e) => set("width_mm", e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Depth mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm ?? ""} onChange={(e) => set("depth_mm", e.target.value)} />
          </label>
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            Height mm (fascia)
            <input className={styles.fieldInput} type="number" min="1" value={draft.height_mm ?? ""} onChange={(e) => set("height_mm", e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Mount height mm
            <input className={styles.fieldInput} type="number" min="0" value={draft.mount_height_mm ?? ""} onChange={(e) => set("mount_height_mm", e.target.value)} />
          </label>
        </div>

        <SectionDivider label="Board & finish" />
        <ColourField
          label="Board & finish"
          value={{ material: draft.material, finish: draft.finish, colour: draft.colour, thickness_mm: draft.carcass_thickness_mm, cost_per_sqm: draft.cost_per_sqm_carcass }}
          matchHint="Decorative board — set the colour & thickness"
          matchOptions={matchOptions}
          thicknessDefault={18}
          onChange={(style) => setMultiNow({
            material: style?.material || "",
            finish: style?.finish || "",
            colour: style?.colour || "",
            carcass_thickness_mm: style?.thickness_mm || draft.carcass_thickness_mm || 18,
            cost_per_sqm_carcass: style?.cost_per_sqm ?? draft.cost_per_sqm_carcass ?? 0,
          })}
        />

        <SectionDivider label="End caps" />
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={Boolean(draft.end_panel_left)} onChange={(e) => setNow("end_panel_left", e.target.checked)} />
          Cap left end
        </label>
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={Boolean(draft.end_panel_right)} onChange={(e) => setNow("end_panel_right", e.target.checked)} />
          Cap right end
        </label>
      </div>
    </div>
  );
}

function DoorPanelForm({ item, room, onItemChange }) {
  const [draft, setDraft] = useState(item);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
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
    flushItemPatch({ pendingPatchRef, itemId: item.id, onItemChange: onItemChangeRef.current, setSaving, setSaveError });
  }
  function retrySave() { setSaving(true); flushPending(); }

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
  const isScribe = draft.item_type === "scribe";

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

  // Same keep-in-sync idea as onPanelWidthMmChange, but writing to
  // scribe_thickness_mm instead of width_mm.
  function onScribeThicknessMmChange(value) {
    const patch = { scribe_thickness_mm: value };
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
      unit_cost_per_sqm_ex_gst: Number(costPerSqmExGst) || 0,
    };
    const mm = parseInt(thickness, 10);
    if (Number.isFinite(mm)) patch.width_mm = mm;
    setMultiNow(patch);
  }

  // Same keep-in-sync idea as onPanelBoardChange, but for scribe's own
  // scribe_thickness_mm field instead of width_mm — scribe keeps width_mm at
  // its normal along-wall-span meaning, so its footprint thickness lives
  // in scribe_thickness_mm and needs its own sync path.
  function onScribeBoardChange({ material, thickness, finish, colour, costPerSqmExGst }) {
    const patch = {
      material,
      thickness,
      finish,
      colour,
      unit_cost_per_sqm_ex_gst: Number(costPerSqmExGst) || 0,
    };
    const mm = parseInt(thickness, 10);
    if (Number.isFinite(mm)) patch.scribe_thickness_mm = mm;
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
          {isScribe && (
            <label className={styles.fieldLabel}>
              Thickness mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.scribe_thickness_mm || ""} onChange={(e) => onScribeThicknessMmChange(e.target.value)} />
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
            onChange={isPanel ? onPanelBoardChange : isScribe ? onScribeBoardChange : ({ material, thickness, finish, colour, costPerSqmExGst }) =>
              setMultiNow({
                material,
                thickness,
                finish,
                colour,
                unit_cost_per_sqm_ex_gst: Number(costPerSqmExGst) || 0,
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
          {isPanel && (
            <label className={styles.fieldLabel}>
              Wall
              <select
                className={styles.fieldSelect}
                value={draft.wall || "island"}
                onChange={(e) => setMultiNow(reassignWall(draft, e.target.value, room))}
              >
                {WALL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                <option value="island">Freestanding (island)</option>
              </select>
            </label>
          )}
          <label className={styles.fieldLabel}>
            X offset mm
            <input className={styles.fieldInput} type="number" min="0" value={draft.x_mm ?? 0} onChange={(e) => set("x_mm", e.target.value)} />
          </label>
          {draft.wall === "island" && (
            <label className={styles.fieldLabel}>
              Rotation
              <select className={styles.fieldSelect} value={draft.rotation || 0} onChange={(e) => setNow("rotation", Number(e.target.value))}>
                {ROTATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {isScribe && (
                <span style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", fontWeight: 400, display: "block", marginTop: 2 }}>
                  Always freestanding — this sets which wall it supports (0° = top, 90° = right, 180° = bottom, 270° = left).
                </span>
              )}
            </label>
          )}
          <label className={styles.fieldLabel}>
            Notes
            <textarea className={styles.fieldTextarea} value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={4} />
          </label>
        </div>
        <SaveStatus saving={saving} error={saveError} onRetry={retrySave} />
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
  const [saveError, setSaveError] = useState(null);
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
    flushItemPatch({ pendingPatchRef, itemId: item.id, onItemChange: onItemChangeRef.current, setSaving, setSaveError });
  }
  function retrySave() { setSaving(true); flushPending(); }

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
        <SaveStatus saving={saving} error={saveError} onRetry={retrySave} />
      </div>
    </div>
  );
}

// ---- Right panel container ----
export default function DesignRightPanel({ item, allItems, room, materialDefaults, isAddingItem, isOverlapping, onAdd, onCancelAdd, onItemChange, onDeleteItem, onDuplicateItem, onSelectItem, allowedTypes, fullWidth = false }) {
  // `fullWidth` + `allowedTypes` are the mobile hooks: the modal renders the
  // exact same panel at 100% width and restricts which cabinet types can be
  // added. Desktop passes neither, so behaviour is unchanged.
  const panelClass = fullWidth ? `${styles.rightPanel} ${styles.rightPanelFull}` : styles.rightPanel;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef(null);
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Which config groups are expanded. Deliberately held HERE and not inside
  // CabinetConfigForm: that's mounted with key={item.id}, so it remounts on
  // every selection — state living in it would slam every section shut each
  // time you clicked a different cabinet. Working through the kickboards of a
  // run should keep Finishing open the whole way.
  //
  // Cabinet opens by default because it's the "what and where" you always
  // want; everything else stays shut behind its summary until asked for.
  const [openSections, setOpenSections] = useState({ cabinet: true });
  const toggleSection = useCallback((id) => {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  }, []);

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
      <div className={panelClass}>
        {!fullWidth && (
          <div className={styles.rightPanelHeader}>
            <p className={styles.rightPanelTitle}>Add Item</p>
            <p className={styles.rightPanelSubtitle}>Drag to position after adding</p>
          </div>
        )}
        <div className={styles.rightScroll}>
          <AddItemForm onAdd={onAdd} onCancel={onCancelAdd} allowedTypes={allowedTypes} />
        </div>
      </div>
    );
  }

  if (item) {
    const isCabinet = CABINET_TYPES.includes(item.item_type);
    return (
      <div className={panelClass}>
        {!fullWidth && (
          <div className={styles.rightPanelHeader}>
            <p className={styles.rightPanelTitle}>{item.label || TYPE_LABELS[item.item_type] || item.item_type}</p>
            <p className={styles.rightPanelSubtitle}>{TYPE_LABELS[item.item_type]}</p>
          </div>
        )}
        {isOverlapping && (
          <p className={styles.overlapWarning}>
            ⚠ This item overlaps another item on the plan. Drag it (or the other item) to fix the position.
          </p>
        )}
        {isCabinet ? (
          <CabinetConfigForm key={item.id} item={item} allItems={allItems} room={room} materialDefaults={materialDefaults} onItemChange={onItemChange} onSelectItem={onSelectItem} openSections={openSections} toggleSection={toggleSection} />
        ) : item.item_type === "obstruction" ? (
          <ObstructionForm key={item.id} item={item} onItemChange={onItemChange} />
        ) : item.item_type === "floating_shelf" ? (
          <ShelfForm key={item.id} item={item} allItems={allItems} onItemChange={onItemChange} />
        ) : (
          <DoorPanelForm key={item.id} item={item} room={room} onItemChange={onItemChange} />
        )}
        <div className={styles.rightPanelFooter}>
          {/* Duplicate would add a second cabinet to the room — hidden on
              mobile, which is restricted to one cabinet per room. */}
          {!fullWidth && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={handleDuplicateClick}
              disabled={isDuplicating}
            >
              {isDuplicating ? "Duplicating…" : "Duplicate"}
            </button>
          )}
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
    <div className={panelClass}>
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
