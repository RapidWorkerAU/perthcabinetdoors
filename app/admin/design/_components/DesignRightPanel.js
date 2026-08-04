"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "../design.module.css";
import ColourField, { collectMatchOptions } from "./ColourField";
import AddItemModal from "./AddItemModal";
import CutListModal from "./CutListModal";
import { CabinetCutRows, itemDisplayLabel } from "./CutListView";
import ConfigSection from "../../../../components/ConfigSection";
import ConfigWindow from "../../../../components/ConfigWindow";
import { Toggle } from "../../../../components/ConfigControls";
import {
  profileNamesForSelection,
  profileTypesForSelection,
} from "../../../../lib/quote-form-data";
import { computeBackPanelRun } from "../../../../lib/pcd-backpanel-utils";
import { computeBottomPanelRun } from "../../../../lib/pcd-bottompanel-utils";
import { fillerPanelGapMm, computeFillerPanelRun } from "../../../../lib/pcd-fillerpanel-utils";
import { getAbsPos, itemDepthMm } from "./DesignCanvas";
import { CABINET_MOUNT_MM, computeKickboardRun, isCornerType } from "../../../../lib/pcd-kickboard-utils";
import {
  DEFAULT_BENCHTOP_THICKNESS_MM,
  DEFAULT_BENCHTOP_OVERHANG_MM,
  benchtopThicknessMm,
  benchtopOverhangMm,
  benchtopDepthMm,
  benchtopCutouts,
  computeBenchtopRun,
} from "../../../../lib/pcd-benchtop-utils";
import { computeDrawerFrontHeights, DRAWER_RUNNER_LABELS, resolveRunnerType } from "../../../../lib/pcd-drawer-utils";
import { FINGER_PULL_GAP_MM, DEFAULT_HINGE_QTY, DEFAULT_DOOR_REVEAL_MM, doorRowGapMm, drawerGapMm, frontRevealMm, frontWidthMm, bayShelfCount, applianceBayHeightMm, bayIsPinned, bayPercentOfCabinet, withResolvedBayHeights, legacyRowBayMigration } from "../../../../lib/pcd-door-utils";
import { thicknessOptionsForMaterial, materialLabelForType } from "../../../../lib/pcd-colour-library";
import { FRONT_PROFILE_PRESETS, normaliseFrontProfile } from "../../../../lib/pcd-front-profiles";
import { applianceKindDefaults } from "../../../../lib/pcd-appliance-utils";
import {
  SHELF_RAIL_DEFAULTS,
  CLEAT_THICKNESS_MM,
  shelfRailConfig,
  shelfRailHeightMm,
  shelfTopMm,
  mountForShelfTopMm,
  shelfRailWarnings,
  detectSupports,
  fitToOpeningMm,
  spanLimitMm,
} from "../../../../lib/pcd-shelf-rail-utils";

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet", "corner_tall_cabinet", "blind_corner_cabinet", "bookcase"];
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
const ADDABLE_TYPES = [...CABINET_TYPES, "shelf_rail", "floating_shelf", "panel", "scribe", "obstruction", "window", "door_opening", "appliance", "brick_corner_pantry"];

// The default obstruction fill (mirrors ITEM_COLORS.obstruction in the views);
// shown as the "unset" swatch in the obstruction colour picker.
const OBSTRUCTION_DEFAULT_HEX = "#57534e";

// Appliance footprints now live in lib/pcd-appliance-utils.js — the public
// planner offers the fridge too, and two copies of these numbers would drift.

// A new bookcase: a Billy-ish open unit, but built out of 18mm board with a
// solid back rather than a hardboard panel. Always open-fronted — the shelves
// and the carcass carry their own colours, and nothing here ever gets a door.
export const BOOKCASE_DEFAULTS = {
  width_mm: 800,
  height_mm: 2000,
  depth_mm: 300,
  mount_height_mm: 0,
  front_type: "none",
  shelf_qty: 4,
  carcass_thickness_mm: 18,
  shelf_thickness_mm: 18,
  back_panel_included: true,
  back_panel_thickness_mm: 16,
  has_kickboard: false,
  has_benchtop: false,
};

const TYPE_LABELS = {
  base_cabinet:  "Base Cabinet",
  wall_cabinet:  "Wall Cabinet",
  tall_cabinet:  "Tall Cabinet",
  corner_base_cabinet: "Corner Base Cabinet",
  corner_tall_cabinet: "Corner Pantry",
  blind_corner_cabinet: "Blind Corner Cabinet",
  bookcase:      "Bookcase",
  shelf_rail:    "Shelf & Rail",
  floating_shelf: "Floating Shelf",
  door:          "Door",
  drawer_front:  "Drawer Front",
  panel:         "Panel",
  scribe:        "Scribe",
  obstruction:   "Obstruction",
  window:        "Window",
  door_opening:  "Doorway",
  appliance:     "Appliance",
  brick_corner_pantry: "Brick Corner Pantry",
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

// Small helpers for the Panels window: a link back to a continuous run's owner,
// and the hint shown for a panel that's switched off.
const runLinkStyle = { background: "none", border: "none", padding: 0, color: "var(--dt-accent, #2f7a4d)", textDecoration: "underline", cursor: "pointer", font: "inherit" };
function PanelOffHint() {
  return <p style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", margin: 0 }}>Switch this on in the sidebar to set its sizes.</p>;
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
function AddItemForm({ onAdd, onCancel, onBack, initialType, initialKind, allowedTypes = ADDABLE_TYPES, currentWall }) {
  const [draft, setDraft] = useState(() => {
    const d = emptyDraft();
    // Start on the type the picker chose (falling back to the first allowed
    // type). Mobile restricts allowedTypes to base/wall/tall — no corner, no
    // standalone panels/scribes/obstructions.
    const startType = allowedTypes.includes(initialType)
      ? initialType
      : (allowedTypes.includes(d.item_type) ? d.item_type : allowedTypes[0]);
    const typed = { ...d, item_type: startType };
    // Default the wall to the one being viewed in elevation, so a cabinet added
    // while looking at a wall lands on THAT wall (not the top wall, which then
    // had to be dragged across). Plan view passes nothing → keeps "top".
    const REAL_WALLS = ["top", "bottom", "left", "right"];
    return currentWall && REAL_WALLS.includes(currentWall) ? { ...typed, wall: currentWall } : typed;
  });
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState("");

  // Apply the chosen type's dimension defaults once on mount (setType seeds the
  // per-type sizes — corner second width, tall height, panel thickness, etc.).
  // For an appliance, the picker may also carry a kind (fridge / dishwasher /
  // rangehood) — seed that and its footprint too.
  useEffect(() => {
    if (!initialType || !allowedTypes.includes(initialType)) return;
    setType(initialType);
    if (initialType === "appliance" && initialKind) {
      setDraft((d) => ({ ...d, appliance_kind: initialKind, ...applianceKindDefaults(initialKind) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const isCorner = isCornerType(draft);
  const isPanel = draft.item_type === "panel";
  const isScribe = draft.item_type === "scribe";
  const isShelf = draft.item_type === "floating_shelf";
  // Shelf & Rail takes a span and a depth only — its height is derived from the
  // cleat height plus the board thickness, both fixed standards.
  const isShelfRail = draft.item_type === "shelf_rail";
  // Windows & doorways are decorative like an obstruction here: they take
  // dimensions but no board/material or quantity.
  const isObstruction = ["obstruction", "window", "door_opening", "appliance", "brick_corner_pantry"].includes(draft.item_type);

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
    if (nextType === "corner_tall_cabinet") {
      // Corner pantry — a corner cabinet's L-shape at TALL height: no benchtop,
      // has a kickboard, runs floor-to-near-ceiling. secondary_width_mm must be
      // seeded so the corner cut-list fires (it's gated on secondary width > 0).
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        width_mm: d.width_mm && d.width_mm !== 600 ? d.width_mm : 900,
        secondary_width_mm: d.secondary_width_mm || 900,
        depth_mm: d.depth_mm || 600,
        height_mm: d.height_mm && d.height_mm > 1000 ? d.height_mm : 2100,
        has_kickboard: true,
      }));
      return;
    }
    if (nextType === "panel") {
      // A standalone panel is a thin board on edge. panel_thickness_mm is the
      // canonical thickness; width_mm is kept mirrored to it for the plan-view
      // footprint/collision geometry (an on-edge panel's across-wall footprint
      // equals its thickness), rather than an along-wall span like a cabinet's.
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        panel_thickness_mm: 18,
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
    if (nextType === "window") {
      // A window sits in the wall at sill height, shallow into the room.
      setDraft((d) => ({ ...d, item_type: nextType, width_mm: 900, height_mm: 1200, depth_mm: 100, mount_height_mm: 900 }));
      return;
    }
    if (nextType === "door_opening") {
      // A doorway is floor-standing (no sill).
      setDraft((d) => ({ ...d, item_type: nextType, width_mm: 820, height_mm: 2040, depth_mm: 100, mount_height_mm: 0 }));
      return;
    }
    if (nextType === "appliance") {
      // A freestanding appliance (fridge / dishwasher / rangehood / …). Seed the
      // footprint from the chosen kind's defaults so it's the right size/height.
      setDraft((d) => {
        const kind = d.appliance_kind || "fridge";
        return { ...d, item_type: nextType, appliance_kind: kind, ...applianceKindDefaults(kind) };
      });
      return;
    }
    if (nextType === "brick_corner_pantry") {
      // Decorative bricked-in corner pantry room feature — reuses the DIAGONAL
      // corner shape (chamfered corner + a door on the angle) but is never
      // quoted and has no cabinetry config. Dimensions only; set the second wall
      // in the form. corner_style pins it to the diagonal shape.
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        corner_style: "diagonal",
        width_mm: d.width_mm && d.width_mm !== 600 ? d.width_mm : 900,
        secondary_width_mm: d.secondary_width_mm || 900,
        depth_mm: d.depth_mm || 600,
        height_mm: d.height_mm && d.height_mm > 1000 ? d.height_mm : 2100,
        mount_height_mm: 0,
      }));
      return;
    }
    if (nextType === "bookcase") {
      // Keeps whatever the user has already typed for the three dimensions when
      // they're not still on the base-cabinet defaults, so switching type in the
      // form doesn't silently throw away a size they've entered.
      setDraft((d) => ({
        ...d,
        ...BOOKCASE_DEFAULTS,
        item_type: nextType,
        wall: d.wall && d.wall !== "island" ? d.wall : "top",
        width_mm: d.width_mm && d.width_mm !== 600 ? d.width_mm : BOOKCASE_DEFAULTS.width_mm,
        height_mm: d.height_mm && d.height_mm !== 720 ? d.height_mm : BOOKCASE_DEFAULTS.height_mm,
        depth_mm: d.depth_mm && d.depth_mm !== 600 ? d.depth_mm : BOOKCASE_DEFAULTS.depth_mm,
      }));
      return;
    }
    if (nextType === "shelf_rail") {
      // Spans an opening rather than standing on the floor. No height field —
      // the assembly is exactly one cleat height plus one board thickness, both
      // fixed standards, so it's derived. Hung so the SHELF TOP lands at 1800.
      setDraft((d) => ({
        ...d,
        item_type: nextType,
        wall: d.wall && d.wall !== "island" ? d.wall : "top",
        width_mm: d.width_mm && d.width_mm !== 600 ? d.width_mm : SHELF_RAIL_DEFAULTS.width_mm,
        depth_mm: SHELF_RAIL_DEFAULTS.depth_mm,
        carcass_thickness_mm: SHELF_RAIL_DEFAULTS.shelf_thickness_mm,
        // Derived, but persisted — every measuring consumer reads height_mm.
        height_mm: SHELF_RAIL_DEFAULTS.rail_height_mm + SHELF_RAIL_DEFAULTS.shelf_thickness_mm,
        mount_height_mm: CABINET_MOUNT_MM.shelf_rail,
        shelf_rail_config: {
          left_support: "wall",
          right_support: "wall",
          back_cleat: true,
          end_cleat_left: true,
          end_cleat_right: true,
          rail_height_mm: SHELF_RAIL_DEFAULTS.rail_height_mm,
          front_rail: { on: true, setback_mm: SHELF_RAIL_DEFAULTS.front_rail_setback_mm },
        },
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
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
          >
            ‹ Choose a different item
          </button>
        )}
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
        ) : isShelfRail ? (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Span mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm} onChange={(e) => set("width_mm", e.target.value)} />
            </label>
            <label className={styles.fieldLabel}>
              Depth mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm} onChange={(e) => set("depth_mm", e.target.value)} />
            </label>
          </div>
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

function DoorBankFields({ cfg, onChangeNow, onChange, heightMm, part = null }) {
  // `part` lets the door/drawer window show one sub-group at a time as a
  // left-menu item ("layout" | "drilling" | "reveal"); null renders everything
  // (used inline for a mixed front's per-section editor).
  const show = (p) => !part || part === p;
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
      {show("layout") && (<>
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
      </>)}

      {show("drilling") && (<>
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
      </>)}

      {show("layout") && cols > 1 && (
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

      {show("reveal") && (<>
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
      </>)}
    </>
  );
}

// ---- Reusable drawer-bank layout (opening heights, finger-pull gap,
// runner type) — used both for a regular cabinet's top-level drawer_config
// and for an individual drawer-type section of a "mixed" front. A drawer
// bank is always a single column — a wide bank of drawers you'd see
// side-by-side is actually two separate cabinets, not one cabinet with
// multiple drawer columns.
function DrawerBankFields({ cfg, onChangeNow, onChange, heightMm, part = null }) {
  const show = (p) => !part || part === p;
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
      {show("layout") && (<>
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
      </>)}

      {show("finger") && (<>
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
      </>)}

      {show("runners") && (<>
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
      </>)}
    </>
  );
}

// Reusable board/finish picker for a door or drawer style — used for both
// the top-level Door Style / Drawer Style sections and (for Door Style
// only in practice, but written generically) a "mixed" front's shared
// per-type style. `style` is a door_style/drawer_style-shaped object;
// `onChange` merges a patch into it, always saved immediately (this is all
// discrete select/picker input from the shared colour modal, no free-typed
// text worth debouncing).
// Exported so MaterialDefaultsModal.js can reuse the exact same door/drawer
// style picker for project-level defaults. Edge mould is NOT set here — it's
// left to the quote editor. `simplified` (used in the cabinet Colours & finishes
// section) hides the profile selects so it reads as a clean public-style colour
// row; the project-defaults modal leaves it off to keep profile selection.
export function FrontStyleFields({ label, style, onChange, matchOptions = [], colourImages = null, simplified = false }) {
  const mat = style.material || "";
  const thk = style.thickness_mm ? `${style.thickness_mm}mm` : "";
  // The material picker stores lowercase values (e.g. "decorative board")
  // but the profile lookup tables key off the Title Case labels the quote
  // editor uses (e.g. "Decorative Board") — convert before looking up.
  const matLabel = materialLabelForType(mat);
  const profTypes = simplified ? [] : profileTypesForSelection(matLabel, thk);
  const profNames = simplified ? [] : profileNamesForSelection(style.profile_type || "", matLabel, thk);

  return (
    <>
      <ColourField
        label={label}
        value={style?.material || style?.colour ? style : null}
        matchOptions={matchOptions}
        thicknessDefault={18}
        colourImages={colourImages}
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
      {!simplified && (
      <label className={styles.fieldLabel}>
        3D front profile
        <select
          className={styles.fieldSelect}
          value={normaliseFrontProfile(style.front_profile)}
          onChange={(e) => onChange({ front_profile: e.target.value })}
        >
          {FRONT_PROFILE_PRESETS.map((profile) => (
            <option key={profile.value} value={profile.value}>{profile.label}</option>
          ))}
        </select>
      </label>
      )}
    </>
  );
}

// ---- Cabinet config form ----
// (The benchtop material picker was removed — we don't manufacture benchtops, so
// the design tool never quotes them. The pcd_benchtop_materials catalogue stays
// as-is for elsewhere; the benchtop here is drawn-only, visual colour only.)

// Handle / hinge picker (audit p2-3b) — reads the pcd_hardware catalogue for a
// given type and, on pick, sets the item's name + frozen unit cost. Cache keyed
// by type so the two pickers (and cabinet switches) don't refetch.
const _hardwareCache = {};
function HardwareField({ type, label, value, onPick }) {
  const [items, setItems] = useState(_hardwareCache[type] || []);
  useEffect(() => {
    if (_hardwareCache[type]) return;
    let alive = true;
    fetch(`/api/admin/hardware?type=${type}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.ok) { _hardwareCache[type] = d.hardware || []; setItems(_hardwareCache[type]); }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [type]);
  const active = items.filter((m) => m.is_active);
  const knownValue = !value || active.some((m) => m.name === value);
  return (
    <label className={styles.fieldLabel}>
      {label}
      <select
        className={styles.fieldSelect}
        value={value || ""}
        onChange={(e) => {
          const name = e.target.value;
          const m = items.find((x) => x.name === name);
          onPick({ name, cost: m ? Number(m.unit_cost_ex_gst) || 0 : 0 });
        }}
      >
        <option value="">Not supplied by us</option>
        {active.map((m) => (
          <option key={m.id} value={m.name}>{m.name} — ${Number(m.unit_cost_ex_gst).toFixed(0)} ea</option>
        ))}
        {!knownValue && <option value={value}>{value}</option>}
      </select>
    </label>
  );
}

function CabinetConfigForm({ item, allItems, room, materialDefaults, onItemChange, onSelectItem, openSection, toggleSection, fullWidth = false, colourImages = null }) {
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

  // Tall cabinets used to free a bay for an appliance through door_config.bays,
  // a second bay system alongside mixed-front bays. It is retired, so any
  // cabinet still on it converts the moment it is opened — otherwise its oven
  // bay would render but no longer be editable anywhere.
  useEffect(() => {
    const patch = legacyRowBayMigration(item);
    if (patch) setMultiNow(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Bay heights are stored as real millimetres because that is what the cut
  // list and the quote importer read. A cabinet height change has to be pushed
  // through them, or the cabinet keeps quoting the old panel sizes while the
  // elevation silently rescales and shows no problem.
  useEffect(() => {
    if (draft.front_type !== "mixed") return;
    const cur = Array.isArray(draft.section_config?.sections) ? draft.section_config.sections : [];
    if (!cur.length) return;
    const next = withResolvedBayHeights(cur, draft.height_mm);
    if (next.every((sec, i) => sec.height_mm === Math.round(Number(cur[i].height_mm) || 0))) return;
    setNow("section_config", { ...(draft.section_config || {}), sections: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.height_mm, draft.front_type]);

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

  const isCorner = isCornerType(draft);
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
  ].filter(Boolean).join(" · ");

  summary.carcass = [
    draft.back_panel_included === false ? "no back" : "back",
    draft.shelf_qty > 0 ? `${draft.shelf_qty} shelf${draft.shelf_qty === 1 ? "" : "s"}` : "no shelves",
    draft.has_rangehood ? "rangehood" : "",
  ].filter(Boolean).join(" · ");

  const FRONT_LABELS = { none: "None", doors: "Doors", drawers: "Drawers", mixed: "Bays" };
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
        colourImages={colourImages}
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
        colourImages={colourImages}
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
    // Switching to Bays with nothing set yet seeds a usable two-bay cabinet
    // rather than an empty front the elevation can't draw.
    if (val === "mixed" && !(Array.isArray(cur.section_config?.sections) && cur.section_config.sections.length)) {
      const seeded = withResolvedBayHeights([
        { type: "drawers", height_pct: 50 },
        { type: "doors", height_pct: 50, door: { columns: 1, hinges: ["L"], equal_width: true, width_ratios: [1] } },
      ], cur.height_mm);
      // One drawer filling its bay — real millimetres, so it draws and cuts at
      // the right size the moment the front type is switched on.
      seeded[0].drawer = { heights_mm: [seeded[0].height_mm] };
      patch.section_config = { ...(cur.section_config || {}), sections: seeded };
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
  const sectionsAnyDoors   = sections.some((s) => s.type === "doors");
  const sectionsAnyDrawers = sections.some((s) => s.type === "drawers");
  // Whether this cabinet's front actually has door / drawer faces — drives which
  // board-finish pickers appear in the consolidated "Board colours & cost"
  // section. A corner cabinet with doors counts as having doors.
  const frontHasDoors   = draft.front_type === "doors" || (draft.front_type === "mixed" && sectionsAnyDoors);
  const frontHasDrawers = draft.front_type === "drawers" || (draft.front_type === "mixed" && sectionsAnyDrawers);
  // Count of enabled applied panels — the summary for the "Add-on panels" group.
  const addonsOnCount = [
    draft.has_kickboard, draft.has_filler_panel, draft.has_bottom_panel, draft.has_back_panel,
    draft.end_panel_left, draft.end_panel_right, draft.side_filler_left, draft.side_filler_right,
    draft.back_panel_wall1, draft.back_panel_wall2,
  ].filter(Boolean).length;

  function currentSections() {
    const prev = latestRef.current.section_config || {};
    return Array.isArray(prev.sections) ? prev.sections : [];
  }

  // Every write goes through here, so `height_mm` is always the resolved answer
  // for the current mix of pinned and share bays. Nothing downstream — the
  // elevation, the 3D view, the cut list, the importer — has to know that
  // percentages exist.
  function commitSections(next, immediate = true) {
    const prev = latestRef.current.section_config || {};
    const sections = withResolvedBayHeights(next, latestRef.current.height_mm ?? draft.height_mm);
    if (immediate) setNow("section_config", { ...prev, sections });
    else set("section_config", { ...prev, sections });
  }

  function addSection() {
    const cur = currentSections();
    // A new bay takes an even share alongside the others rather than whatever
    // millimetres happen to be left over.
    commitSections([...cur, { type: "doors", height_pct: evenBaySharePct(cur.length + 1), door: { columns: 1, hinges: ["L"], equal_width: true, width_ratios: [1] } }]);
  }

  function removeSection(idx) {
    commitSections(currentSections().filter((_, i) => i !== idx));
  }

  function updateSection(idx, patch, immediate = true) {
    commitSections(currentSections().map((s, i) => (i === idx ? { ...s, ...patch } : s)), immediate);
  }

  function updateSectionType(idx, type) {
    const cur = currentSections();
    const sec = cur[idx] || {};
    const patch = { type };
    if (type === "doors" && !sec.door) patch.door = { columns: 1, hinges: ["L"], equal_width: true, width_ratios: [1] };
    if (type === "drawers" && !sec.drawer) patch.drawer = { heights_mm: [sec.height_mm || 300] };
    if (type === "appliance") {
      // An appliance is a real size, so its bay pins itself to that size the
      // moment it's chosen instead of floating on a share.
      const appliance = sec.appliance || "oven";
      patch.appliance = appliance;
      patch.height_lock_mm = Number(sec.height_lock_mm) > 0 ? sec.height_lock_mm : applianceBayHeightMm(appliance);
    } else {
      patch.appliance = undefined;
      // Release the pin only if it is still the one the appliance put there.
      // A height typed by hand is the operator's, and stays.
      if (sec.type === "appliance" && Number(sec.height_lock_mm) === applianceBayHeightMm(sec.appliance || "oven")) {
        patch.height_lock_mm = 0;
      }
    }
    updateSection(idx, patch);
  }

  // Pinning captures the height the bay has right now, so the cabinet doesn't
  // jump the instant the padlock is clicked. Unpinning hands that same height
  // back as a share, for the same reason.
  function setSectionPinned(idx, pinned) {
    const sec = currentSections()[idx] || {};
    const currentMm = Math.max(1, Math.round(Number(sec.height_mm) || 0));
    updateSection(idx, pinned
      ? { height_lock_mm: currentMm }
      : { height_lock_mm: 0, height_pct: bayPercentOfCabinet(currentMm, draft.height_mm) || evenBaySharePct(currentSections().length) });
  }

  function evenBaySharePct(count) {
    return Math.round(1000 / Math.max(1, count)) / 10;
  }

  function updateSectionSubConfig(idx, subKey, patch, immediate) {
    const cur = currentSections();
    const prevSub = cur[idx]?.[subKey] || {};
    commitSections(cur.map((s, i) => (i === idx ? { ...s, [subKey]: { ...prevSub, ...patch } } : s)), immediate);
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
    open: openSection === id,
    onToggle: () => toggleSection(id),
    theme: "light",
  });

  // Which heavy-config window is open (deep settings live in a 2-column window;
  // the sidebar keeps the everyday controls + on/off toggles). null = none.
  const [openWin, setOpenWin] = useState(null); // "front" | "panels" | "cutouts"
  const [panelPart, setPanelPart] = useState(null);
  const [frontPart, setFrontPart] = useState(null);

  // ── The Doors & drawers window: the deep front-layout controls, broken into
  //    left-menu sub-parts so each shows on its own instead of one long list. ──
  const frontParts = (() => {
    const fp = [];
    if (draft.front_type === "doors") {
      if (isCorner) { fp.push({ id: "corner", label: "Corner door" }, { id: "profile", label: "3D profile" }); return fp; }
      fp.push({ id: "layout", label: "Doors" }, { id: "profile", label: "3D profile" }, { id: "drilling", label: "Hinge drilling" }, { id: "reveal", label: "Reveal & finger-pull" });
    } else if (draft.front_type === "drawers" && !isCorner) {
      fp.push({ id: "layout", label: "Drawers" }, { id: "profile", label: "3D profile" }, { id: "finger", label: "Finger-pull" }, { id: "runners", label: "Runners" });
    } else if (draft.front_type === "mixed" && !isCorner) {
      fp.push({ id: "profile", label: "3D profile" });
      sections.forEach((s, i) => fp.push({ id: `sec-${i}`, label: `Bay ${i + 1}` }));
    }
    return fp;
  })();

  const renderCornerDoorFields = () => (
    <div className={styles.fieldGroup}>
      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
        A corner cabinet has one door split into two leaves that fold around the corner. Only the leaf hinged to the cabinet frame needs hinge drilling — the other leaf folds off it.
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
            {isMiddle ? `Hinge ${hIdx + 1} — evenly spaced between top & bottom (auto)` : isTop ? `Hinge ${hIdx + 1} — distance from top (mm)` : `Hinge ${hIdx + 1} — distance from bottom (mm)`}
            <input className={styles.fieldInput} type="number" min="0" max={cornerDoorHeightMm || undefined} value={displayValue} disabled={isMiddle}
              onChange={isMiddle ? undefined : (e) => {
                const raw = e.target.value;
                const storedVal = isTop && raw !== "" ? (cornerDoorHeightMm || 0) - Number(raw) : raw;
                setCornerHingePosition(hIdx, storedVal);
              }} />
          </label>
        );
      })}
      <RevealField cfg={cornerDoorCfg} onChange={(patch) => updCornerDoorCfg(patch, false)} />
      <FingerPullGapFields cfg={cornerDoorCfg} onChangeNow={(patch) => updCornerDoorCfg(patch, true)} onChange={(patch) => updCornerDoorCfg(patch, false)}
        label="Include a negative gap across the corner door"
        note="One reveal shortens both leaves equally, so they still line up when the door folds around the corner. A corner base cabinet sits under the 900mm bench-height line, so the grip is at the top." />
    </div>
  );


  // A bay is sized either as a SHARE of the cabinet (%) or PINNED to real
  // millimetres — an oven bay is 600mm however tall the cabinet is. The
  // resolved millimetres are shown either way, so what actually gets cut is
  // never a mystery.
  const renderBayHeightFields = (idx, sec) => {
    const pinned = bayIsPinned(sec);
    const resolvedMm = Math.round(Number(sec.height_mm) || 0);
    const resolvedPct = bayPercentOfCabinet(resolvedMm, draft.height_mm);
    const typedPct = Number(sec.height_pct);
    return (
      <>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            {pinned ? "Fixed height mm" : "Share of cabinet %"}
            {pinned ? (
              <input className={styles.fieldInput} type="number" min="1"
                value={Math.round(Number(sec.height_lock_mm) || 0) || ""}
                onChange={(e) => updateSection(idx, { height_lock_mm: Math.max(1, Number(e.target.value) || 0) }, false)} />
            ) : (
              <input className={styles.fieldInput} type="number" min="0.1" step="0.1"
                value={Number.isFinite(typedPct) && typedPct > 0 ? typedPct : resolvedPct}
                onChange={(e) => updateSection(idx, { height_pct: Math.max(0.1, Number(e.target.value) || 0) }, false)} />
            )}
          </label>
          <label className={styles.fieldLabel}>
            Sizing
            <select className={styles.fieldSelect} value={pinned ? "fixed" : "share"} onChange={(e) => setSectionPinned(idx, e.target.value === "fixed")}>
              <option value="share">Share of cabinet height</option>
              <option value="fixed">Fixed millimetres</option>
            </select>
          </label>
        </div>
        <p style={{ fontSize: 10.5, color: "var(--dt-text-muted, #888780)", margin: "0 0 2px", lineHeight: 1.4 }}>
          {pinned
            ? `Cuts at ${resolvedMm}mm (${resolvedPct}% of this ${draft.height_mm || 0}mm cabinet). Stays this size when the cabinet height changes — the share bays absorb the difference.`
            : `Cuts at ${resolvedMm}mm — ${resolvedPct}% of this ${draft.height_mm || 0}mm cabinet. Grows and shrinks with the cabinet.`}
        </p>
      </>
    );
  };

  // The everyday bay list on the sidebar: what each bay is and how tall, with
  // the deep per-bay door/drawer settings a click away in the window. Same
  // shape as the public tool so a customer's cabinet reads the same here.
  const renderBaySidebarList = () => (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
        Bays, top to bottom
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {sections.map((sec, i) => {
          const pinned = bayIsPinned(sec);
          const resolvedMm = Math.round(Number(sec.height_mm) || 0);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", width: 16, flexShrink: 0 }}>{i + 1}</span>
              <select className={styles.fieldSelect} style={{ flex: 1, minWidth: 0 }} value={sec.type || "doors"} onChange={(e) => updateSectionType(i, e.target.value)}>
                <option value="doors">Doors</option>
                <option value="drawers">Drawers</option>
                <option value="appliance">Appliance</option>
                <option value="open">Open space</option>
              </select>
              {pinned ? (
                <input className={styles.fieldInput} style={{ width: 78, flexShrink: 0 }} type="number" min="1"
                  title="Fixed height in millimetres"
                  value={Math.round(Number(sec.height_lock_mm) || 0) || ""}
                  onChange={(e) => updateSection(i, { height_lock_mm: Math.max(1, Number(e.target.value) || 0) }, false)} />
              ) : (
                <input className={styles.fieldInput} style={{ width: 78, flexShrink: 0 }} type="number" min="0.1" step="0.1"
                  title="Share of the cabinet height, as a percentage"
                  value={Number(sec.height_pct) > 0 ? Number(sec.height_pct) : bayPercentOfCabinet(resolvedMm, draft.height_mm)}
                  onChange={(e) => updateSection(i, { height_pct: Math.max(0.1, Number(e.target.value) || 0) }, false)} />
              )}
              <button type="button" title={pinned ? `Fixed at ${resolvedMm}mm — click to size by share` : `${resolvedMm}mm — click to fix this height`}
                onClick={() => setSectionPinned(i, !pinned)}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: "0 2px", flexShrink: 0, opacity: pinned ? 1 : 0.35 }}>
                {pinned ? "🔒" : "🔓"}
              </button>
              <button type="button" onClick={() => removeSection(i)} disabled={sections.length <= 1}
                title="Remove this bay"
                style={{ border: "none", background: "none", cursor: sections.length <= 1 ? "default" : "pointer", color: sections.length <= 1 ? "#ccc" : "#a03f2c", fontSize: 14, padding: "0 2px", flexShrink: 0 }}>✕</button>
            </div>
          );
        })}
      </div>
      <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} style={{ width: "100%", marginTop: 8 }} onClick={addSection}>+ Add bay</button>
      <p style={{ fontSize: 10.5, color: "var(--dt-text-muted, #888780)", margin: "6px 0 0", lineHeight: 1.4 }}>
        {sections.some(bayIsPinned)
          ? "Locked bays keep their millimetres; the rest share what is left of the cabinet height."
          : "Bays share the cabinet height by percentage. Lock one to hold it at a fixed size."}
      </p>
    </div>
  );

  const renderMixedSection = (idx) => {
    const sec = sections[idx];
    if (!sec) return null;
    return (
      <div className={styles.fieldGroup}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dt-text-muted, #888780)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Bay {idx + 1}{idx === 0 ? " (top)" : idx === sections.length - 1 ? " (bottom)" : ""}
          </span>
          <button type="button" onClick={() => { removeSection(idx); setFrontPart("sec-0"); }} style={{ background: "none", border: "none", padding: 0, color: "#c0392b", cursor: "pointer", fontSize: 11 }}>Remove</button>
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            Type
            <select className={styles.fieldSelect} value={sec.type || "doors"} onChange={(e) => updateSectionType(idx, e.target.value)}>
              <option value="doors">Doors</option>
              <option value="drawers">Drawers</option>
              <option value="appliance">Appliance</option>
              <option value="open">Open space</option>
            </select>
          </label>
          {sec.type === "appliance" ? (
            <label className={styles.fieldLabel}>
              Appliance
              <select className={styles.fieldSelect} value={sec.appliance || "oven"}
                onChange={(e) => updateSection(idx, { appliance: e.target.value, height_lock_mm: applianceBayHeightMm(e.target.value) })}>
                <option value="oven">Oven</option>
                <option value="microwave">Microwave</option>
                <option value="cooktop">Cooktop</option>
              </select>
            </label>
          ) : null}
        </div>
        {renderBayHeightFields(idx, sec)}
        {sec.type === "open" ? (
          <>
            <label className={styles.fieldLabel}>
              Shelves in this bay
              <input className={styles.fieldInput} type="number" min="0" max="10"
                value={Number(sec.shelf_qty) || 0}
                onChange={(e) => updateSection(idx, { shelf_qty: Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0)) })} />
            </label>
            <p style={{ fontSize: 10.5, color: "var(--dt-text-muted, #888780)", margin: 0, lineHeight: 1.4 }}>
              {Number(sec.shelf_qty) > 0
                ? "Spread evenly inside this bay. They cut and price as shelves, on the shelf board set in Board colours & cost."
                : "Left blank — an open recess. No board is cut and nothing is quoted for this section."}
            </p>
          </>
        ) : sec.type === "appliance" ? (
          <p style={{ fontSize: 10.5, color: "var(--dt-text-muted, #888780)", margin: 0, lineHeight: 1.4 }}>
            Oven / appliance recess — left open for a customer-supplied appliance (shown as an oven in 3D). No board is cut or quoted.
          </p>
        ) : sec.type === "drawers" ? (
          <DrawerBankFields cfg={sec.drawer || {}} heightMm={sec.height_mm} onChangeNow={(patch) => updateSectionSubConfig(idx, "drawer", patch, true)} onChange={(patch) => updateSectionSubConfig(idx, "drawer", patch, false)} />
        ) : (
          <DoorBankFields cfg={sec.door || {}} heightMm={sec.height_mm} onChangeNow={(patch) => updateSectionSubConfig(idx, "door", patch, true)} onChange={(patch) => updateSectionSubConfig(idx, "door", patch, false)} />
        )}
      </div>
    );
  };

  const renderFrontProfileFields = () => (
    <div className={styles.fieldGroup}>
      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
        These profiles change the 3D preview of the selected cabinet fronts.
      </p>
      {frontHasDoors && (
        <label className={styles.fieldLabel}>
          Door 3D profile
          <select
            className={styles.fieldSelect}
            value={normaliseFrontProfile(doorStyle.front_profile)}
            onChange={(e) => updDoorStyle({ front_profile: e.target.value })}
          >
            {FRONT_PROFILE_PRESETS.map((profile) => (
              <option key={profile.value} value={profile.value}>{profile.label}</option>
            ))}
          </select>
        </label>
      )}
      {frontHasDrawers && (
        <label className={styles.fieldLabel}>
          Drawer 3D profile
          <select
            className={styles.fieldSelect}
            value={normaliseFrontProfile(drawerStyle.front_profile)}
            onChange={(e) => updDrawerStyle({ front_profile: e.target.value })}
          >
            {FRONT_PROFILE_PRESETS.map((profile) => (
              <option key={profile.value} value={profile.value}>{profile.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  const renderFrontPart = (partId) => {
    if (draft.front_type === "none") {
      return <p style={{ fontSize: 12, color: "var(--dt-text-muted, #888780)" }}>No front on this cabinet — pick Doors, Drawers or Bays first.</p>;
    }
    if (partId === "profile") return renderFrontProfileFields();
    if (draft.front_type === "doors" && isCorner) return renderCornerDoorFields();
    if (draft.front_type === "doors") {
      return <div className={styles.fieldGroup}><DoorBankFields cfg={doorCfg} onChangeNow={updDoorCfg} onChange={updDoorCfgDebounced} heightMm={doorHeightMm} part={partId} /></div>;
    }
    if (draft.front_type === "drawers") {
      return <div className={styles.fieldGroup}><DrawerBankFields cfg={drawerCfg} onChangeNow={updDrawerCfg} onChange={updDrawerCfgDebounced} heightMm={draft.height_mm} part={partId} /></div>;
    }
    if (draft.front_type === "mixed") {
      return renderMixedSection(Number(String(partId).replace("sec-", "")));
    }
    return null;
  };

  // ── Panel detail renderers (numbers/spans/runs) — shown in the Panels window.
  //    The on/off toggles live on the sidebar. ──
  const renderKickboardDetail = () => {
    if (!draft.has_kickboard) return <PanelOffHint />;
    const isContinuous = (draft.kickboard_span ?? "continuous") === "continuous";
    const liveItems = allItems ? allItems.map((i) => (i.id === draft.id ? { ...i, ...draft } : i)) : [draft];
    const run = isContinuous ? computeKickboardRun(draft, liveItems, room) : null;
    const sharedLeg = run?.legs?.find((l) => l.count > 1 && l.firstItemId !== draft.id);
    const isFirstInRun = !sharedLeg;
    const firstItem = sharedLeg ? liveItems.find((i) => i.id === sharedLeg.firstItemId) : null;
    return (
      <div className={styles.fieldGroup}>
        {isFirstInRun ? (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Height mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.kickboard_height_mm ?? 120} onChange={(e) => set("kickboard_height_mm", e.target.value)} />
            </label>
            <label className={styles.fieldLabel}>Thickness mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.kickboard_thickness_mm ?? 16} onChange={(e) => set("kickboard_thickness_mm", e.target.value)} />
            </label>
          </div>
        ) : (
          <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
            Continuous kickboard run ({sharedLeg.count} cabinets, {firstItem?.kickboard_height_mm ?? 120}mm high) — height &amp; thickness are set on{" "}
            <button type="button" onClick={() => onSelectItem?.(sharedLeg.firstItemId)} style={runLinkStyle}>{firstItem?.label || firstItem?.item_type || "the first cabinet in this run"}</button>.
          </p>
        )}
        <label className={styles.fieldLabel}>Spanning style
          <select className={styles.fieldSelect} value={draft.kickboard_span ?? "continuous"} onChange={(e) => setNow("kickboard_span", e.target.value)}>
            <option value="continuous">Continuous (spans across adjacent cabinets)</option>
            <option value="individual">Individual (separate piece per cabinet)</option>
          </select>
        </label>
      </div>
    );
  };

  const renderFillerDetail = () => {
    if (!draft.has_filler_panel) return <PanelOffHint />;
    const isContinuous = (draft.filler_panel_span ?? "continuous") === "continuous";
    const liveItems = allItems ? allItems.map((i) => (i.id === draft.id ? { ...i, ...draft } : i)) : [draft];
    const run = isContinuous ? computeFillerPanelRun(draft, liveItems) : null;
    const isFirstInRun = !run || run.count <= 1 || run.firstItemId === draft.id;
    const firstItem = run && !isFirstInRun ? liveItems.find((i) => i.id === run.firstItemId) : null;
    return (
      <div className={styles.fieldGroup}>
        {isFirstInRun ? (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Height mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.filler_panel_height_mm ?? fillerPanelGapMm(draft, room, allItems)} onChange={(e) => set("filler_panel_height_mm", e.target.value)} />
            </label>
            <label className={styles.fieldLabel}>Thickness mm
              <input className={styles.fieldInput} type="number" min="1" value={draft.filler_panel_thickness_mm ?? 16} onChange={(e) => set("filler_panel_thickness_mm", e.target.value)} />
            </label>
          </div>
        ) : (
          <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
            Continuous filler run ({run.count} cabinets, {firstItem?.filler_panel_height_mm ?? fillerPanelGapMm(firstItem, room, allItems)}mm high) — height &amp; thickness are set on{" "}
            <button type="button" onClick={() => onSelectItem?.(run.firstItemId)} style={runLinkStyle}>{firstItem?.label || firstItem?.item_type || "the first cabinet in this run"}</button>.
          </p>
        )}
        <label className={styles.fieldLabel}>Spanning style
          <select className={styles.fieldSelect} value={draft.filler_panel_span ?? "continuous"} onChange={(e) => setNow("filler_panel_span", e.target.value)}>
            <option value="continuous">Continuous (spans across adjacent cabinets)</option>
            <option value="individual">Individual (separate piece per cabinet)</option>
          </select>
        </label>
        <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
          Height defaults to the gap above the cabinet ({fillerPanelGapMm(draft, room, allItems)}mm) — to the ceiling, or to the nearest obstruction above if closer.
        </p>
      </div>
    );
  };

  const renderUndersideDetail = () => {
    if (!draft.has_bottom_panel) return <PanelOffHint />;
    const isContinuous = (draft.bottom_panel_span ?? "continuous") === "continuous";
    const liveItems = allItems ? allItems.map((i) => (i.id === draft.id ? { ...i, ...draft } : i)) : [draft];
    const run = isContinuous ? computeBottomPanelRun(draft, liveItems) : null;
    const isFirstInRun = !run || run.firstItemId === draft.id;
    const firstItem = run && !isFirstInRun ? liveItems.find((i) => i.id === run.firstItemId) : null;
    return (
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Spanning style
          <select className={styles.fieldSelect} value={draft.bottom_panel_span ?? "continuous"} onChange={(e) => setNow("bottom_panel_span", e.target.value)}>
            <option value="continuous">Continuous (spans across adjacent cabinets)</option>
            <option value="individual">Individual (one panel, this cabinet only)</option>
          </select>
        </label>
        {isContinuous && (isFirstInRun ? (
          <label className={styles.fieldLabel}>Panel count {run && run.count > 1 ? `(run of ${run.count} cabinets)` : ""}
            <input className={styles.fieldInput} type="number" min="1" value={draft.bottom_panel_qty ?? 1} onChange={(e) => set("bottom_panel_qty", e.target.value)} />
          </label>
        ) : (
          <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
            Continuous underside run ({run.count} cabinets) — panel count is set on{" "}
            <button type="button" onClick={() => onSelectItem?.(run.firstItemId)} style={runLinkStyle}>{firstItem?.label || firstItem?.item_type || "the first cabinet in this run"}</button>.
          </p>
        ))}
      </div>
    );
  };

  const renderEndBackDetail = () => {
    const anyPanel = draft.end_panel_left || draft.end_panel_right || draft.has_back_panel;
    if (!draft.has_back_panel && !anyPanel) return <PanelOffHint />;
    const isContinuous = (draft.back_panel_span ?? "continuous") === "continuous";
    const liveItems = allItems ? allItems.map((i) => (i.id === draft.id ? { ...i, ...draft } : i)) : [draft];
    const run = draft.has_back_panel && isContinuous ? computeBackPanelRun(draft, liveItems) : null;
    const isFirstInRun = !run || run.firstItemId === draft.id;
    const firstItem = run && !isFirstInRun ? liveItems.find((i) => i.id === run.firstItemId) : null;
    return (
      <div className={styles.fieldGroup}>
        {draft.has_back_panel && (
          <>
            <label className={styles.fieldLabel}>Back panel spanning style
              <select className={styles.fieldSelect} value={draft.back_panel_span ?? "continuous"} onChange={(e) => setNow("back_panel_span", e.target.value)}>
                <option value="continuous">Continuous (spans across adjacent cabinets)</option>
                <option value="individual">Individual (one panel, this cabinet only)</option>
              </select>
            </label>
            {isContinuous && (isFirstInRun ? (
              <label className={styles.fieldLabel}>Panel count {run && run.count > 1 ? `(run of ${run.count} cabinets)` : ""}
                <input className={styles.fieldInput} type="number" min="1" value={draft.back_panel_qty ?? 1} onChange={(e) => set("back_panel_qty", e.target.value)} />
              </label>
            ) : (
              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                Continuous back panel run ({run.count} cabinets) — panel count is set on{" "}
                <button type="button" onClick={() => onSelectItem?.(run.firstItemId)} style={runLinkStyle}>{firstItem?.label || firstItem?.item_type || "the first cabinet in this run"}</button>.
              </p>
            ))}
          </>
        )}
        {anyPanel && (
          <>
            <label className={styles.fieldCheckLabel}>
              <input type="checkbox" checked={draft.panel_to_floor ?? false} onChange={(e) => setNow("panel_to_floor", e.target.checked)} />
              Panels run to floor (otherwise carcass height only, kickboard continues underneath)
            </label>
            <label className={styles.fieldCheckLabel}>
              <input type="checkbox" checked={draft.panel_to_ceiling ?? false} onChange={(e) => setNow("panel_to_ceiling", e.target.checked)} />
              Panels run to ceiling (full-height finished end, e.g. beside a fridge or oven tower)
            </label>
          </>
        )}
        {!anyPanel && <PanelOffHint />}
      </div>
    );
  };

  const renderCornerBacksDetail = () => (
    <div className={styles.fieldGroup}>
      <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
        Manual per leg — tick whichever leg(s) need a finished back, then choose whether they run to the floor.
      </p>
      {(draft.back_panel_wall1 || draft.back_panel_wall2) ? (
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={Boolean(draft.panel_to_floor)} onChange={(e) => setNow("panel_to_floor", e.target.checked)} />
          Panels run to floor (otherwise carcass height only, kickboard continues underneath)
        </label>
      ) : <PanelOffHint />}
    </div>
  );

  const renderCornerEndExtra = () => (
    <div className={styles.fieldGroup}>
      {(draft.end_panel_left || draft.end_panel_right) ? (
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={draft.panel_to_floor ?? false} onChange={(e) => setNow("panel_to_floor", e.target.checked)} />
          End panels run to the floor (past the kickboard recess)
        </label>
      ) : <PanelOffHint />}
    </div>
  );

  const renderSidePanelExtra = () => (
    <div className={styles.fieldGroup}>
      {(draft.end_panel_left || draft.end_panel_right) ? (
        <>
          {draft.has_bottom_panel && (
            <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: 0, lineHeight: 1.4 }}>
              Side panels extend down to cover the finished underside panel edge.
            </p>
          )}
          <label className={styles.fieldCheckLabel}>
            <input type="checkbox" checked={draft.panel_to_ceiling ?? false} onChange={(e) => setNow("panel_to_ceiling", e.target.checked)} />
            Side panels run to ceiling (finished side carries on to the ceiling)
          </label>
        </>
      ) : <PanelOffHint />}
    </div>
  );

  const renderSideFillerDetail = () => (
    <div className={styles.fieldGroup}>
      {draft.side_filler_left && (
        <label className={styles.fieldLabel}>Left gap width mm
          <input className={styles.fieldInput} type="number" min="1" value={draft.side_filler_left_width_mm ?? ""} onChange={(e) => set("side_filler_left_width_mm", e.target.value)} />
        </label>
      )}
      {draft.side_filler_right && (
        <label className={styles.fieldLabel}>Right gap width mm
          <input className={styles.fieldInput} type="number" min="1" value={draft.side_filler_right_width_mm ?? ""} onChange={(e) => set("side_filler_right_width_mm", e.target.value)} />
        </label>
      )}
      {(draft.side_filler_left || draft.side_filler_right) ? (
        <label className={styles.fieldLabel}>Thickness mm
          <input className={styles.fieldInput} type="number" min="1" value={draft.side_filler_thickness_mm ?? 18} onChange={(e) => set("side_filler_thickness_mm", e.target.value)} />
        </label>
      ) : <PanelOffHint />}
    </div>
  );

  // Which panels apply to this cabinet type — drives the sidebar toggles AND the
  // Panels window's left list. Each: { id, label, toggles:[{key,label,disabled}],
  // detail:() => node }.
  const panelGroups = [];
  if (isCorner) {
    panelGroups.push({ id: "corner-backs", label: "Finished backs", toggles: [
      { key: "back_panel_wall1", label: `Wall 1 finished back (${draft.wall || "—"})` },
      { key: "back_panel_wall2", label: draft.secondary_wall ? `Wall 2 finished back (${draft.secondary_wall})` : "Wall 2 finished back (set a second wall first)", disabled: !draft.secondary_wall },
    ], detail: renderCornerBacksDetail });
    panelGroups.push({ id: "corner-ends", label: "End panels", toggles: [
      { key: "end_panel_left", label: "Wall 1 end panel" },
      { key: "end_panel_right", label: "Wall 2 end panel" },
    ], detail: renderCornerEndExtra });
  }
  if (draft.item_type !== "wall_cabinet") {
    panelGroups.push({ id: "kickboard", label: "Kickboard / plinth", toggles: [{ key: "has_kickboard", label: "Include kickboard / plinth" }], detail: renderKickboardDetail });
  }
  if (draft.item_type === "wall_cabinet" || draft.item_type === "tall_cabinet" || draft.item_type === "corner_tall_cabinet") {
    panelGroups.push({ id: "filler", label: "Filler panel", toggles: [{ key: "has_filler_panel", label: "Include filler panel (to ceiling)" }], detail: renderFillerDetail });
  }
  if (draft.item_type === "wall_cabinet") {
    panelGroups.push({ id: "underside", label: "Underside panel", toggles: [{ key: "has_bottom_panel", label: "Finished underside panel" }], detail: renderUndersideDetail });
    panelGroups.push({ id: "side-panels", label: "Side panels", toggles: [
      { key: "end_panel_left", label: "Left side panel" },
      { key: "end_panel_right", label: "Right side panel" },
    ], detail: renderSidePanelExtra });
  }
  if (draft.item_type === "base_cabinet" || draft.item_type === "tall_cabinet" || draft.item_type === "blind_corner_cabinet") {
    panelGroups.push({ id: "end-back", label: "End & back panels", toggles: [
      { key: "end_panel_left", label: "Left end panel" },
      { key: "end_panel_right", label: "Right end panel" },
      { key: "has_back_panel", label: "Finished back panel" },
    ], detail: renderEndBackDetail });
  }
  if (!isCorner) {
    panelGroups.push({ id: "side-fillers", label: "Side fillers", toggles: [
      { key: "side_filler_left", label: "Left side filler" },
      { key: "side_filler_right", label: "Right side filler" },
    ], detail: renderSideFillerDetail });
  }
  const groupEnabled = (g) => g.toggles.some((tg) => draft[tg.key]);
  const enabledGroups = panelGroups.filter(groupEnabled);

  return (
    <>
      <div className={styles.rightScroll} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
        <ConfigSection title="Size & position" summary={summary.cabinet} {...section("size")}>
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
                  <SectionDivider label="Corner style" />
                  <label className={styles.fieldLabel}>
                    Shape
                    <select
                      className={styles.fieldSelect}
                      value={draft.corner_style || "l_shape"}
                      onChange={(e) => {
                        const val = e.target.value;
                        // A diagonal corner IS its single diagonal door — so if
                        // the front is still off, turn it on (with the project's
                        // door material default, mirroring onFrontTypeChange) so
                        // the door actually shows in 3D and the diagonal marker
                        // in elevation. Otherwise the plan draws the chamfer but
                        // the door silently never renders. L-shape is left as-is.
                        const cur = latestRef.current;
                        if (val === "diagonal" && (cur.front_type ?? "none") === "none") {
                          const patch = { corner_style: val, front_type: "doors" };
                          const doorDefault = materialDefaults?.door;
                          if (doorDefault && !String(cur.door_style?.material || "").trim()) {
                            patch.door_style = { ...cur.door_style, ...doorDefault };
                          }
                          setMultiNow(patch);
                        } else {
                          setNow("corner_style", val);
                        }
                      }}
                    >
                      <option value="l_shape">L-shape — two legs, bi-fold door</option>
                      <option value="diagonal">Diagonal — chamfered corner, single flat door</option>
                    </select>
                  </label>
                  <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0", lineHeight: 1.4 }}>
                    Diagonal cuts the room-facing corner off at an angle (depth kept on both walls) with one flat door
                    across the diagonal. The plan shows the true shape; the door width is the diagonal span.
                  </p>
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
        </ConfigSection>

        {/* Every board's finish in ONE place — carcass, doors, drawers, shelves,
            benchtop and every applied panel. Panels are toggled on/off in
            "Panels & finishing"; here we only pick their finish. */}
        <ConfigSection title="Colours & finishes" summary={summary.boards} {...section("colours")}>
            <div className={styles.fieldGroup}>
              <ColourField
                label="Carcass"
                value={{ material: draft.material, finish: draft.finish, colour: draft.colour, thickness_mm: draft.carcass_thickness_mm, cost_per_sqm: draft.cost_per_sqm_carcass }}
                matchOptions={matchOptions}
                colourImages={colourImages}
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

              {frontHasDoors && (
                <FrontStyleFields label="Doors" style={doorStyle} onChange={updDoorStyle} matchOptions={matchOptions} colourImages={colourImages} simplified />
              )}
              {frontHasDrawers && (
                <FrontStyleFields label="Drawers" style={drawerStyle} onChange={updDrawerStyle} matchOptions={matchOptions} colourImages={colourImages} simplified />
              )}
              {/* Shelves are colourable whenever there ARE any — the cabinet's
                  own, or shelves sitting inside an open bay of a mixed front. */}
              {(Number(draft.shelf_qty) > 0 || bayShelfCount(draft) > 0) && (
                <>
                  <ColourField
                    label="Shelves"
                    value={{ material: draft.shelf_material, finish: draft.shelf_finish, colour: draft.shelf_colour, thickness_mm: draft.shelf_thickness_mm, cost_per_sqm: draft.cost_per_sqm_shelf }}
                    matchHint="Matches carcass by default"
                    matchOptions={matchOptions}
                    colourImages={colourImages}
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
                </>
              )}
              {isBenchtopType && draft.has_benchtop && (() => {
                // A continuous benchtop is drawn once by the run's FIRST cabinet,
                // so its colour lives there. On any other cabinet in the run,
                // show the owner's colour read-only with a link (same pattern as
                // the kickboard / filler runs) instead of an empty "Not set" that
                // wouldn't do anything.
                const isContinuous = (draft.benchtop_span ?? "continuous") === "continuous";
                const liveItems = allItems ? allItems.map((i) => (i.id === draft.id ? { ...i, ...draft } : i)) : [draft];
                const run = isContinuous ? computeBenchtopRun(draft, liveItems) : null;
                const isOwner = !run || run.count <= 1 || run.firstItemId === draft.id;
                if (!isOwner) {
                  const owner = liveItems.find((i) => i.id === run.firstItemId) || {};
                  const ownerLabel = owner.label || TYPE_LABELS[owner.item_type] || "the first cabinet";
                  return (
                    <ColourField
                      label="Benchtop"
                      value={owner.benchtop_colour_style || null}
                      hideCost
                      colourImages={colourImages}
                      hex={owner.benchtop_colour_hex}
                      notice={
                        <div style={{ maxWidth: 440 }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: "#26251f", margin: "0 0 6px" }}>Set on the benchtop run</p>
                          <p style={{ fontSize: 13, color: "#5a574f", margin: "0 0 16px", lineHeight: 1.5 }}>
                            This is one continuous benchtop across the run, so its colour is set on <strong>{ownerLabel}</strong>.
                          </p>
                          <button type="button" onClick={() => onSelectItem?.(run.firstItemId)}
                            style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #1f6f4a", background: "#1f6f4a", color: "#fff", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600 }}>
                            Edit on {ownerLabel}
                          </button>
                        </div>
                      }
                      onChange={() => {}}
                    />
                  );
                }
                return (
                  <ColourField
                    label="Benchtop"
                    value={draft.benchtop_colour_style || null}
                    canReset
                    hideCost
                    matchOptions={matchOptions}
                    colourImages={colourImages}
                    hex={draft.benchtop_colour_hex}
                    allowFlat
                    onFlat={(h) => setMultiNow({ benchtop_colour_hex: h, benchtop_colour_style: null })}
                    onChange={(style) => setMultiNow({ benchtop_colour_style: style, benchtop_colour_hex: null })}
                  />
                );
              })()}
              {draft.item_type !== "wall_cabinet" && draft.has_kickboard &&
                renderOverridePicker("kickboard_style", "Kickboard", "Matches the carcass by default.")}
              {draft.has_filler_panel &&
                renderOverridePicker("filler_panel_style", "Filler", "Matches the doors on a doored cabinet, otherwise the carcass.")}
              {draft.item_type === "wall_cabinet" && draft.has_bottom_panel &&
                renderOverridePicker("bottom_panel_style", "Underside", "Matches the carcass by default.")}
              {draft.has_back_panel &&
                renderOverridePicker("back_panel_style", "Back panel", "Matches the carcass by default.")}
              {(draft.end_panel_left || draft.end_panel_right || draft.has_back_panel) && renderFinishPanelMaterial()}

              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "6px 0 0", lineHeight: 1.4 }}>
                Only pieces this cabinet actually has show up here. Turn panels on / off (and set their span &amp; sizes) in <strong>Panels &amp; finishing</strong>.
              </p>
            </div>
        </ConfigSection>

        {/* Doors & drawers — everyday choice on the sidebar; the detailed
            per-bay layout (hinges, runners, columns) opens in a window. Bays
            list inline here, the same way the public tool shows them. */}
        <ConfigSection title="Doors & drawers" summary={summary.front} {...section("front")}>
          <div className={styles.fieldGroup}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {[
                ["none", "None"],
                ["doors", "Doors"],
                ...(isCorner ? [] : [["drawers", "Drawers"], ["mixed", "Bays"]]),
              ].map(([val, label]) => (
                <label key={val} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--dt-text, #1c1c1a)", cursor: "pointer" }}>
                  <input type="radio" name={`front_type_${item.id}`} value={val} checked={(draft.front_type ?? "none") === val} onChange={() => onFrontTypeChange(val)} />
                  {label}
                </label>
              ))}
            </div>
            {draft.front_type === "mixed" && !isCorner && renderBaySidebarList()}
            {((draft.front_type && draft.front_type !== "none") || isCorner) && (
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} style={{ width: "100%", marginTop: 10 }} onClick={() => { setFrontPart(frontParts[0]?.id || null); setOpenWin("front"); }}>
                {draft.front_type === "mixed" && !isCorner ? "Edit bay layout →" : "Edit door / drawer layout →"}
              </button>
            )}
          </div>
        </ConfigSection>

        {/* Hardware — handles + hinge supply, priced from the Hardware catalogue.
            Only where the cabinet actually has a front. */}
        {((draft.front_type && draft.front_type !== "none") || isCornerType(draft)) && (
        <ConfigSection title="Hardware" summary={draft.handle_name || draft.hinge_model ? "On" : "Off"} {...section("hardware")}>
          <div className={styles.fieldGroup}>
            <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
              Priced from the Hardware catalogue — a handle per door/drawer front, and hinge supply per hinge (drilling is charged separately). Leave as <em>Not supplied by us</em> to keep it off the quote.
            </p>
            <HardwareField type="handle" label="Handle" value={draft.handle_name} onPick={({ name, cost }) => setMultiNow({ handle_name: name, handle_cost_ex_gst: cost })} />
            {draft.front_type !== "drawers" && (
              <HardwareField type="hinge" label="Hinge model (supply)" value={draft.hinge_model} onPick={({ name, cost }) => setMultiNow({ hinge_model: name, hinge_cost_ex_gst: cost })} />
            )}
          </div>
        </ConfigSection>
        )}

        <ConfigSection title="Inside" summary={summary.carcass} {...section("inside")}>
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
              {/* Shelf board finish lives in "Board colours & cost". */}

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
        </ConfigSection>

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
        <ConfigSection title="Benchtop" summary={summary.benchtop} {...section("benchtop")}>
            <div className={styles.fieldGroup}>
              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                Sizes, waterfall ends and cutouts — for the drawing only. We don&apos;t make benchtops, so they&apos;re never quoted. Pick a visual colour in <strong>Colours &amp; finishes</strong>.
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
                  <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} style={{ width: "100%" }} onClick={() => setOpenWin("cutouts")}>
                    Edit sink / cooktop cutouts →{benchtopCutouts(draft).length ? ` (${benchtopCutouts(draft).length})` : ""}
                  </button>
                </>
              )}
            </div>
        </ConfigSection>
        )}

        {/* ADD-ON PANELS — every applied panel's on/off toggle, spanning style
            and dimensions in one place. Board finishes for these live in
            "Board colours & cost"; here it's purely which panels exist and how
            big. Each sub-group shows only for the cabinet types it applies to. */}
        <ConfigSection title="Panels & finishing" summary={addonsOnCount ? `${addonsOnCount} on` : "Off"} {...section("panels")}>
          <div className={styles.fieldGroup}>
            <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
              Switch panels on or off here. Their sizes, spans and continuous-run settings are in <strong>Edit sizes, spans &amp; runs</strong>; their finish is in <strong>Colours &amp; finishes</strong>.
            </p>
            {panelGroups.map((g) => (
              <div key={g.id} style={{ marginTop: 2 }}>
                {panelGroups.length > 1 && <SectionDivider label={g.label} />}
                {g.toggles.map((tg) => (
                  <Toggle key={tg.key} theme="light" label={tg.label} checked={!!draft[tg.key]} disabled={tg.disabled} onChange={(v) => setNow(tg.key, v)} />
                ))}
              </div>
            ))}
            {!panelGroups.length && <p style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", margin: 0 }}>No add-on panels apply to this cabinet type.</p>}
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} style={{ width: "100%", marginTop: 10 }} disabled={!enabledGroups.length} onClick={() => { setPanelPart(enabledGroups[0]?.id || null); setOpenWin("panels"); }}>
              Edit sizes, spans &amp; runs →
            </button>
          </div>
        </ConfigSection>


        <ConfigSection title="Notes" summary={summary.notes} {...section("notes")}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                Notes
                <textarea className={styles.fieldTextarea} value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={6} />
              </label>
            </div>
        </ConfigSection>

        <SaveStatus saving={saving} error={saveError} onRetry={retrySave} />
      </div>

      {/* ── Heavy-config windows (2-column: parts list → its settings) ── */}
      {openWin === "front" && (
        <ConfigWindow
          theme="light" fullWidth={fullWidth}
          title="Door / drawer layout"
          subtitle={itemDisplayLabel(draft)}
          parts={frontParts}
          selectedId={frontPart}
          onSelect={setFrontPart}
          renderPart={(p) => renderFrontPart(p.id)}
          onClose={() => setOpenWin(null)}
          footer={draft.front_type === "mixed" && !isCorner
            ? <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} style={{ width: "100%" }} onClick={() => { addSection(); setFrontPart(`sec-${sections.length}`); }}>+ Add bay</button>
            : null}
        />
      )}

      {openWin === "panels" && (
        <ConfigWindow
          theme="light" fullWidth={fullWidth}
          title="Panel sizes, spans & runs"
          subtitle={itemDisplayLabel(draft)}
          parts={enabledGroups.map((g) => ({ id: g.id, label: g.label, badge: "on" }))}
          selectedId={panelPart}
          onSelect={setPanelPart}
          renderPart={(p) => (panelGroups.find((g) => g.id === p.id) || {}).detail?.() || null}
          onClose={() => setOpenWin(null)}
          footer={<p style={{ fontSize: 10.5, color: "var(--dt-text-muted, #888780)", lineHeight: 1.4, margin: 0 }}>Switch panels on / off in the sidebar. Their finish is in Colours &amp; finishes.</p>}
        />
      )}

      {openWin === "cutouts" && (
        <ConfigWindow
          theme="light" fullWidth={fullWidth}
          title="Benchtop cutouts"
          subtitle={itemDisplayLabel(draft)}
          parts={[{ id: "cutouts", label: `Cutouts (${(draft.benchtop_cutouts || []).length})` }]}
          selectedId="cutouts"
          onSelect={() => {}}
          renderPart={() => (
            <div className={styles.fieldGroup}>
              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                Centred on this cabinet. These aren&apos;t appliances — they only tell the fabricator a hole this size goes here.
              </p>
              {(draft.benchtop_cutouts || []).map((cut, idx) => (
                <div key={idx} className={styles.fieldRow} style={{ alignItems: "flex-end" }}>
                  <label className={styles.fieldLabel}>
                    Type
                    <select className={styles.fieldSelect} value={cut.type || "sink"} onChange={(e) => updCutout(idx, { type: e.target.value })}>
                      <option value="sink">Sink</option>
                      <option value="cooktop">Cooktop</option>
                    </select>
                  </label>
                  <label className={styles.fieldLabel}>
                    W mm
                    <input className={styles.fieldInput} type="number" min="1" value={cut.width_mm ?? ""} onChange={(e) => updCutout(idx, { width_mm: Number(e.target.value) || 0 })} />
                  </label>
                  <label className={styles.fieldLabel}>
                    D mm
                    <input className={styles.fieldInput} type="number" min="1" value={cut.depth_mm ?? ""} onChange={(e) => updCutout(idx, { depth_mm: Number(e.target.value) || 0 })} />
                  </label>
                  <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} style={{ marginBottom: 2 }} onClick={() => removeCutout(idx)}>Remove</button>
                </div>
              ))}
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={addCutout}>Add cutout</button>
            </div>
          )}
          onClose={() => setOpenWin(null)}
        />
      )}
    </>
  );
}

// ---- Door / panel flat form ----
// A floating shelf — a decorative-board box (top + bottom + front fascia, plus
// optional mitred end caps) in one finish, wall-mounted at a height. Edits
// width / depth / height / mount / thickness / colour and which ends are capped;
// on import each board becomes its own Panel line (see pcd-floating-shelf-utils).
// The evenly-spaced shelf heights for a bookcase of a given height and shelf
// count — the same spacing the elevation and the 3D view fall back to when
// shelf_heights_mm hasn't been set (or has gone stale against a new count).
function evenShelfHeights(heightMm, qty) {
  const h = Number(heightMm) || 2000;
  const n = Math.max(0, Number(qty) || 0);
  return Array.from({ length: n }, (_, i) => Math.round(((i + 1) * h) / (n + 1)));
}

// ---- Shelf & Rail ----
// The wardrobe module: a shelf spanning an opening on cleats, with an optional
// front rail. Deliberately short — the only real decisions are the span, the
// depth, what each end lands on, and the two colours. There is NO height field:
// the assembly is one cleat height plus one board thickness, both fixed, so the
// form asks for the height of the SHELF TOP (what's on a robe drawing) and
// converts to the stored mount height.
function ShelfRailForm({ item, allItems, room, onItemChange, openSection, toggleSection, colourImages = null }) {
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

  // Dragged up or down in the elevation — mirror it back so the shelf-top
  // readout doesn't go stale.
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
    latestRef.current = next; setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, [key]: val };
    clearTimeout(timerRef.current); setSaving(true);
    timerRef.current = setTimeout(flushPending, 600);
  }
  function setMultiNow(patch) {
    const next = { ...latestRef.current, ...patch };
    latestRef.current = next; setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    clearTimeout(timerRef.current); setSaving(true); flushPending();
  }
  // Every config edit merges into the stored blob rather than replacing it, so
  // a field this form doesn't show yet (the reserved rails array) survives.
  //
  // height_mm is DERIVED (cleat height + board thickness) but still written to
  // the row, because the drag, collision, gap-dimension and elevation engines
  // all measure items by height_mm. Deriving it at each of those call sites
  // instead would be four more places to forget.
  function setCfg(patch) {
    const prev = shelfRailConfig(latestRef.current);
    const next = { ...prev, ...patch };
    setMultiNow({
      shelf_rail_config: next,
      height_mm: shelfRailHeightMm({ ...latestRef.current, shelf_rail_config: next }),
    });
  }

  const cfg = shelfRailConfig(draft);
  const matchOptions = collectMatchOptions(allItems, draft);
  const warnings = shelfRailWarnings(draft);
  const derivedH = shelfRailHeightMm(draft);
  const topMm = shelfTopMm(draft);
  const limit = spanLimitMm(draft);

  // "Fit to opening" — snap the span to the clear gap between whatever is left
  // and right of it at this height, and set both ends from what it found.
  const opening = fitToOpeningMm(draft, allItems, room);
  function fitToOpening() {
    if (!opening) return;
    const next = { ...latestRef.current, ...opening };
    const found = detectSupports(next, allItems, room);
    setMultiNow({
      ...opening,
      shelf_rail_config: { ...shelfRailConfig(next), left_support: found.left, right_support: found.right },
    });
  }
  function redetect() {
    const found = detectSupports(latestRef.current, allItems, room);
    setCfg({ left_support: found.left, right_support: found.right });
  }

  const SUPPORTS = [
    { value: "wall", label: "Wall" },
    { value: "cabinet", label: "Cabinet gable" },
    { value: "panel", label: "Panel" },
    { value: "open", label: "Nothing" },
  ];

  const section = (id) => ({ open: openSection === id, onToggle: () => toggleSection(id), theme: "light" });
  const supportLabel = (v) => (SUPPORTS.find((s) => s.value === v) || {}).label || v;
  const summary = {
    size: `${draft.width_mm || "?"} span · ${draft.depth_mm || "?"} deep · ${topMm} high`,
    ends: `${supportLabel(cfg.left_support)} / ${supportLabel(cfg.right_support)}`,
    cleats: [
      `${cfg.rail_height_mm}mm`,
      cfg.front_rail.on ? "front rail" : "no front rail",
      [cfg.back_cleat && "back", cfg.end_cleat_left && "left", cfg.end_cleat_right && "right"].filter(Boolean).join(" + ") || "no cleats",
    ].join(" · "),
    colours: [draft.colour || draft.material || "no board", cfg.cleat_style?.colour ? `cleats ${cfg.cleat_style.colour}` : ""].filter(Boolean).join(" · "),
    notes: draft.notes ? String(draft.notes).split("\n")[0] : "",
  };

  return (
    <>
      <div className={styles.rightScroll} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
        <SaveStatus saving={saving} error={saveError} onRetry={retrySave} />

        {/* Outside the accordion deliberately — a shelf with nothing holding one
            end up shouldn't be hidden behind a collapsed section. */}
        {warnings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {warnings.map((w) => (
              <p key={w.code} style={{
                margin: 0, padding: "7px 9px", borderRadius: 6, fontSize: 11, lineHeight: 1.4,
                background: w.level === "error" ? "rgba(220,38,38,0.10)" : "rgba(245,158,11,0.12)",
                color: w.level === "error" ? "#b91c1c" : "#92400e",
                border: `1px solid ${w.level === "error" ? "rgba(220,38,38,0.3)" : "rgba(245,158,11,0.35)"}`,
              }}>
                {w.level === "error" ? "⛔ " : "⚠ "}{w.message}
              </p>
            ))}
          </div>
        )}

      <ConfigSection title="Size & position" summary={summary.size} {...section("size")}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>
          Label
          <input className={styles.fieldInput} value={draft.label || ""} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Long hang shelf" />
        </label>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            Span mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm ?? ""} onChange={(e) => set("width_mm", e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Depth mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm ?? ""} onChange={(e) => set("depth_mm", e.target.value)} />
          </label>
        </div>
        {opening && opening.width_mm !== draft.width_mm && (
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={fitToOpening}>
            Fit to opening ({opening.width_mm}mm)
          </button>
        )}
        <label className={styles.fieldLabel}>
          Shelf height mm (top of shelf)
          <input className={styles.fieldInput} type="number" min="0" value={topMm}
            onChange={(e) => set("mount_height_mm", mountForShelfTopMm(latestRef.current, e.target.value))} />
        </label>
        <p style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", margin: "2px 0 0", lineHeight: 1.4 }}>
          {`Overall ${derivedH}mm deep front-to-top — ${cfg.rail_height_mm}mm cleats plus the ${shelfThicknessLabel(draft)} shelf. Guide span for this build: ${limit}mm.`}
        </p>
      </div>
      </ConfigSection>

      <ConfigSection title="What each end lands on" summary={summary.ends} {...section("ends")}>
      <div className={styles.fieldGroup}>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            Left end
            <select className={styles.fieldSelect} value={cfg.left_support} onChange={(e) => setCfg({ left_support: e.target.value })}>
              {SUPPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Right end
            <select className={styles.fieldSelect} value={cfg.right_support} onChange={(e) => setCfg({ right_support: e.target.value })}>
              {SUPPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={redetect}>
          Detect from the plan
        </button>
      </div>
      </ConfigSection>

      <ConfigSection title="Cleats & front rail" summary={summary.cleats} {...section("cleats")}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={cfg.back_cleat} onChange={(e) => setCfg({ back_cleat: e.target.checked })} />
          Back cleat
        </label>
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={cfg.end_cleat_left} onChange={(e) => setCfg({ end_cleat_left: e.target.checked })} />
          Left end cleat
        </label>
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={cfg.end_cleat_right} onChange={(e) => setCfg({ end_cleat_right: e.target.checked })} />
          Right end cleat
        </label>
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={cfg.front_rail.on} onChange={(e) => setCfg({ front_rail: { ...cfg.front_rail, on: e.target.checked } })} />
          Front rail
        </label>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            Rail height mm
            <input className={styles.fieldInput} type="number" min="1" value={cfg.rail_height_mm}
              onChange={(e) => setCfg({ rail_height_mm: parseInt(e.target.value, 10) || SHELF_RAIL_DEFAULTS.rail_height_mm })} />
          </label>
          {cfg.front_rail.on && (
            <label className={styles.fieldLabel}>
              Rail setback mm
              <input className={styles.fieldInput} type="number" min="0" value={cfg.front_rail.setback_mm}
                onChange={(e) => setCfg({ front_rail: { ...cfg.front_rail, setback_mm: parseInt(e.target.value, 10) || 0 } })} />
            </label>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", margin: "2px 0 0", lineHeight: 1.4 }}>
          The cleats and the front rail share one height so both rip from the same strip. A deeper rail stiffens the
          shelf far more than a taller one costs — stiffness goes with depth cubed.
        </p>
      </div>
      </ConfigSection>

      <ConfigSection title="Colours & finishes" summary={summary.colours} {...section("colours")}>
      <div className={styles.fieldGroup}>
        <ColourField
          label="Shelf"
          value={{ material: draft.material, finish: draft.finish, colour: draft.colour, thickness_mm: draft.carcass_thickness_mm, cost_per_sqm: draft.cost_per_sqm_carcass }}
          matchHint="Sets the board thickness, which drives the span guide"
          matchOptions={matchOptions}
          thicknessDefault={18}
          colourImages={colourImages}
          onChange={(style) => {
            // A 16mm board changes the derived height AND tightens the span
            // guide, so both move with the colour choice.
            const t = style?.thickness_mm || draft.carcass_thickness_mm || 18;
            setMultiNow({
              material: style?.material || "",
              finish: style?.finish || "",
              colour: style?.colour || "",
              carcass_thickness_mm: t,
              cost_per_sqm_carcass: style?.cost_per_sqm ?? draft.cost_per_sqm_carcass ?? 0,
              height_mm: shelfRailHeightMm({ ...latestRef.current, carcass_thickness_mm: t }),
            });
          }}
        />
        <ColourField
          label="Cleats & front rail"
          value={cfg.cleat_style}
          matchHint="Matches the shelf by default"
          canReset
          matchOptions={matchOptions.filter((o) => Number(o.style?.thickness_mm) === CLEAT_THICKNESS_MM)}
          thicknessDefault={CLEAT_THICKNESS_MM}
          onlyThicknessMm={CLEAT_THICKNESS_MM}
          colourImages={colourImages}
          onChange={(style) => setCfg({ cleat_style: style })}
        />
        <p style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", margin: "2px 0 0", lineHeight: 1.4 }}>
          {`Cleats are always ${CLEAT_THICKNESS_MM}mm — they're the structural part, so only library colours stocked in ${CLEAT_THICKNESS_MM}mm are offered.`}
        </p>
      </div>
      </ConfigSection>

      <ConfigSection title="Notes" summary={summary.notes} {...section("notes")}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            Notes
            <textarea className={styles.fieldInput} rows={3} value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything the bench needs to know" />
          </label>
        </div>
      </ConfigSection>
      </div>
    </>
  );
}

function shelfThicknessLabel(item) {
  return `${Number(item?.carcass_thickness_mm) || SHELF_RAIL_DEFAULTS.shelf_thickness_mm}mm`;
}

// ---- Bookcase ----
// A bookcase is a cabinet in the data model (it cuts, prices and imports as
// one), but it is deliberately NOT configured through CabinetConfigForm: it has
// no doors, no drawers, no benchtop and no corner geometry, so it gets a short
// form of its own — size, the two colours, shelves, back and an optional
// kickboard — rather than a doors-and-benchtop panel with most of it hidden.
function BookcaseForm({ item, allItems, onItemChange, openSection, toggleSection, colourImages = null }) {
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

  // Shelves dragged in the elevation write straight to the item, so mirror them
  // back into the draft — otherwise the heights listed here go stale the moment
  // a shelf is moved on the drawing.
  useEffect(() => {
    setDraft((prev) => ({ ...prev, shelf_heights_mm: item.shelf_heights_mm }));
    latestRef.current = { ...latestRef.current, shelf_heights_mm: item.shelf_heights_mm };
  }, [item.shelf_heights_mm]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const shelfQty = Math.max(0, Number(draft.shelf_qty) || 0);
  const stored = Array.isArray(draft.shelf_heights_mm) ? draft.shelf_heights_mm : [];
  // Stored heights win, but only while they still match the shelf count — a
  // count change re-spaces from scratch rather than leaving orphaned heights.
  const shelfHeights = stored.length === shelfQty && shelfQty > 0
    ? stored.map((h) => Number(h) || 0)
    : evenShelfHeights(draft.height_mm, shelfQty);

  // Changing the count (or the overall height) re-spaces the shelves evenly.
  // They stay individually editable here and draggable in the elevation.
  function setShelfQty(value) {
    const qty = Math.max(0, Math.min(20, parseInt(value, 10) || 0));
    setMultiNow({ shelf_qty: qty, shelf_heights_mm: evenShelfHeights(latestRef.current.height_mm, qty) });
  }
  function setHeightMm(value) {
    const next = parseInt(value, 10);
    const cur = latestRef.current;
    const respace = Array.isArray(cur.shelf_heights_mm) && cur.shelf_heights_mm.length > 0;
    set("height_mm", value);
    if (respace && Number.isFinite(next) && next > 0) {
      set("shelf_heights_mm", evenShelfHeights(next, cur.shelf_qty));
    }
  }
  function setShelfHeightAt(index, value) {
    const next = shelfHeights.map((h, i) => (i === index ? (parseInt(value, 10) || 0) : h));
    set("shelf_heights_mm", next);
  }
  function respaceShelves() {
    setNow("shelf_heights_mm", evenShelfHeights(latestRef.current.height_mm, latestRef.current.shelf_qty));
  }

  const section = (id) => ({ open: openSection === id, onToggle: () => toggleSection(id), theme: "light" });
  const summary = {
    size: [
      [draft.width_mm, draft.height_mm, draft.depth_mm].every(Boolean) ? `${draft.width_mm}×${draft.height_mm}×${draft.depth_mm}` : "size not set",
      (draft.qty || 1) > 1 ? `×${draft.qty}` : "",
    ].filter(Boolean).join(" · "),
    colours: [draft.colour || draft.material || "no board", draft.shelf_colour ? `shelves ${draft.shelf_colour}` : ""].filter(Boolean).join(" · "),
    shelves: shelfQty > 0 ? `${shelfQty} shelf${shelfQty === 1 ? "" : "ves"}` : "no shelves",
    construction: [
      (draft.back_panel_included ?? true) ? "solid back" : "no back",
      draft.has_kickboard ? "kickboard" : "on the floor",
    ].join(" · "),
    notes: draft.notes ? String(draft.notes).split("\n")[0] : "",
  };

  return (
    <>
      <div className={styles.rightScroll} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
        <SaveStatus saving={saving} error={saveError} onRetry={retrySave} />

      <ConfigSection title="Size" summary={summary.size} {...section("size")}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>
          Label
          <input className={styles.fieldInput} value={draft.label || ""} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Living room bookcase" />
        </label>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            Width mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.width_mm ?? ""} onChange={(e) => set("width_mm", e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Height mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.height_mm ?? ""} onChange={(e) => setHeightMm(e.target.value)} />
          </label>
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            Depth mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.depth_mm ?? ""} onChange={(e) => set("depth_mm", e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Qty
            <input className={styles.fieldInput} type="number" min="1" value={draft.qty ?? 1} onChange={(e) => set("qty", e.target.value)} />
          </label>
        </div>
      </div>
      </ConfigSection>

      <ConfigSection title="Colours & finishes" summary={summary.colours} {...section("colours")}>
      <div className={styles.fieldGroup}>
        <ColourField
          label="Bookcase"
          value={{ material: draft.material, finish: draft.finish, colour: draft.colour, thickness_mm: draft.carcass_thickness_mm, cost_per_sqm: draft.cost_per_sqm_carcass }}
          matchHint="Sides, top, bottom and back"
          matchOptions={matchOptions}
          thicknessDefault={18}
          colourImages={colourImages}
          onChange={(style) => setMultiNow({
            material: style?.material || "",
            finish: style?.finish || "",
            colour: style?.colour || "",
            carcass_thickness_mm: style?.thickness_mm || draft.carcass_thickness_mm || 18,
            cost_per_sqm_carcass: style?.cost_per_sqm ?? draft.cost_per_sqm_carcass ?? 0,
          })}
        />
        <ColourField
          label="Shelves"
          value={{ material: draft.shelf_material, finish: draft.shelf_finish, colour: draft.shelf_colour, thickness_mm: draft.shelf_thickness_mm, cost_per_sqm: draft.cost_per_sqm_shelf }}
          matchHint="Picked separately from the bookcase"
          matchOptions={matchOptions}
          thicknessDefault={18}
          colourImages={colourImages}
          onChange={(style) => setMultiNow({
            shelf_material: style?.material || "",
            shelf_finish: style?.finish || "",
            shelf_colour: style?.colour || "",
            shelf_thickness_mm: style?.thickness_mm || draft.shelf_thickness_mm || 18,
            cost_per_sqm_shelf: style?.cost_per_sqm ?? draft.cost_per_sqm_shelf ?? 0,
          })}
        />
      </div>
      </ConfigSection>

      <ConfigSection title="Shelves" summary={summary.shelves} {...section("shelves")}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>
          How many shelves
          <input className={styles.fieldInput} type="number" min="0" max="20" value={draft.shelf_qty ?? 0} onChange={(e) => setShelfQty(e.target.value)} />
        </label>
        {shelfQty > 0 && (
          <>
            <p style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", margin: "2px 0 0", lineHeight: 1.4 }}>
              Heights are measured from the floor to the top of each shelf. Drag them in the elevation, or type them here.
            </p>
            {shelfHeights.map((h, i) => (
              <label key={i} className={styles.fieldLabel}>
                {`Shelf ${i + 1} height mm`}
                <input className={styles.fieldInput} type="number" min="0" value={h} onChange={(e) => setShelfHeightAt(i, e.target.value)} />
              </label>
            ))}
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={respaceShelves}>
              Space shelves evenly
            </button>
          </>
        )}
      </div>
      </ConfigSection>

      <ConfigSection title="Construction" summary={summary.construction} {...section("construction")}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={draft.back_panel_included ?? true} onChange={(e) => setNow("back_panel_included", e.target.checked)} />
          Solid back
        </label>
        {(draft.back_panel_included ?? true) && (
          <label className={styles.fieldLabel}>
            Back thickness mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.back_panel_thickness_mm ?? 16} onChange={(e) => set("back_panel_thickness_mm", e.target.value)} />
          </label>
        )}
        <label className={styles.fieldCheckLabel}>
          <input type="checkbox" checked={Boolean(draft.has_kickboard)} onChange={(e) => setNow("has_kickboard", e.target.checked)} />
          Kickboard
        </label>
        {draft.has_kickboard && (
          <label className={styles.fieldLabel}>
            Kickboard height mm
            <input className={styles.fieldInput} type="number" min="1" value={draft.kickboard_height_mm ?? 120} onChange={(e) => set("kickboard_height_mm", e.target.value)} />
          </label>
        )}
      </div>
      </ConfigSection>

      <ConfigSection title="Notes" summary={summary.notes} {...section("notes")}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            Notes
            <textarea className={styles.fieldInput} rows={3} value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything the bench needs to know" />
          </label>
        </div>
      </ConfigSection>
      </div>
    </>
  );
}

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

  // Keep the typed height in step when the item is dragged up or down in the
  // front elevation, the same way CabinetConfigForm does.
  useEffect(() => {
    setDraft((prev) => ({ ...prev, mount_height_mm: item.mount_height_mm }));
    latestRef.current = { ...latestRef.current, mount_height_mm: item.mount_height_mm };
  }, [item.mount_height_mm]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const isPanel = draft.item_type === "panel";
  const isScribe = draft.item_type === "scribe";

  // A standalone panel's thickness now lives in ONE canonical field,
  // panel_thickness_mm (mirroring scribe_thickness_mm), retiring the old
  // width_mm overload. width_mm is kept as a derived mirror so the plan/
  // elevation/3D geometry — which reads width_mm as the thin across-wall
  // footprint — keeps working with no change. The board "thickness" string
  // (e.g. "18mm", what gets imported into the quote) is also kept in step:
  // typing a thickness that matches one of the current material's options
  // updates it, and picking a board thickness below writes back here. Left
  // unsynced, it was easy to set one and forget the other — exactly what
  // left panels importing with the wrong width or a blank thickness column.
  function onPanelThicknessMmChange(value) {
    const patch = { panel_thickness_mm: value, width_mm: value };
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
    // Write the canonical thickness field and keep width_mm mirrored for the
    // plan/3D geometry.
    if (Number.isFinite(mm)) { patch.panel_thickness_mm = mm; patch.width_mm = mm; }
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
                value={(isPanel ? (draft.panel_thickness_mm ?? draft.width_mm) : draft.width_mm) || ""}
                onChange={(e) => isPanel ? onPanelThicknessMmChange(e.target.value) : set("width_mm", e.target.value)}
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
          {/* A scribe or panel is freestanding, so the top-down floor plan
              can't set how high off the floor it sits. Type it here, or drag
              it up and down in the front elevation. */}
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Height from floor mm
              <input className={styles.fieldInput} type="number" min="0" value={draft.mount_height_mm ?? 0} onChange={(e) => set("mount_height_mm", e.target.value)} />
            </label>
            <label className={styles.fieldLabel}>
              Qty
              <input className={styles.fieldInput} type="number" min="1" value={draft.qty ?? ""} onChange={(e) => set("qty", e.target.value)} />
            </label>
          </div>

          {/* Board — the shared tile colour modal (same as every other colour
              picker). The picker returns a colour style; we adapt it to the
              material→thickness→finish→colour shape the board handlers expect. */}
          <ColourField
            label="Board"
            value={{ material: draft.material, finish: draft.finish, colour: draft.colour, thickness_mm: parseInt(draft.thickness, 10) || undefined, cost_per_sqm: draft.unit_cost_per_sqm_ex_gst }}
            onChange={(style) => {
              const picked = {
                material: style?.material || "",
                thickness: style?.thickness_mm ? `${style.thickness_mm}mm` : "",
                finish: style?.finish || "",
                colour: style?.colour || "",
                costPerSqmExGst: style?.cost_per_sqm || 0,
              };
              if (isPanel) onPanelBoardChange(picked);
              else if (isScribe) onScribeBoardChange(picked);
              else setMultiNow({ material: picked.material, thickness: picked.thickness, finish: picked.finish, colour: picked.colour, unit_cost_per_sqm_ex_gst: Number(picked.costPerSqmExGst) || 0 });
            }}
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
  // Merge one key into the door_config jsonb (the brick pantry's door geometry;
  // the fridge door style). Persisted via the same PATCH path.
  function setDoorCfg(key, val) {
    set("door_config", { ...(latestRef.current.door_config || {}), [key]: val });
  }
  // Set several fields at once (used when switching appliance kind resets its
  // footprint) — one merged patch, one debounced save.
  function setMany(patch) {
    const next = { ...latestRef.current, ...patch };
    latestRef.current = next;
    setDraft(next);
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    clearTimeout(timerRef.current);
    setSaving(true);
    timerRef.current = setTimeout(flushPending, 600);
  }

  return (
    <div className={styles.rightScroll}>
      <div className={styles.formSection}>
        <div className={styles.fieldGroup}>
          {item.item_type === "appliance" && (
            <>
              <label className={styles.fieldLabel}>
                Appliance
                <select
                  className={styles.fieldSelect}
                  value={draft.appliance_kind || "fridge"}
                  onChange={(e) => setMany({ appliance_kind: e.target.value, ...applianceKindDefaults(e.target.value) })}
                >
                  <option value="fridge">Fridge</option>
                  <option value="freezer">Freezer</option>
                  <option value="dishwasher">Dishwasher</option>
                  <option value="oven">Oven</option>
                  <option value="cooktop">Cooktop</option>
                  <option value="rangehood">Rangehood</option>
                  <option value="microwave">Microwave</option>
                  <option value="washing_machine">Washing machine</option>
                  <option value="other">Other</option>
                </select>
              </label>
              {(draft.appliance_kind === "fridge" || draft.appliance_kind === "freezer") && (
                <label className={styles.fieldLabel}>
                  Door style
                  <select
                    className={styles.fieldSelect}
                    value={draft.door_config?.fridge_style || "double"}
                    onChange={(e) => setDoorCfg("fridge_style", e.target.value)}
                  >
                    <option value="single">Single door</option>
                    <option value="double">Double (side-by-side)</option>
                    <option value="french">French door (+ freezer drawer)</option>
                  </select>
                </label>
              )}
              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                Appliances are a visual reference — never quoted. Switching the appliance resets its size to a
                typical footprint; adjust below. A rangehood sits at mount height with a chimney to the ceiling.
              </p>
            </>
          )}
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
          {item.item_type === "brick_corner_pantry" && (
            <>
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>
                  Second wall
                  <select className={styles.fieldSelect} value={draft.secondary_wall || ""}
                    onChange={(e) => set("secondary_wall", e.target.value)} disabled={draft.wall === "island"}>
                    <option value="">None (island corner)</option>
                    {WALL_OPTIONS.filter((o) => o.value !== draft.wall).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.fieldLabel}>
                  Width mm (wall 2)
                  <input className={styles.fieldInput} type="number" min="1" value={draft.secondary_width_mm || ""}
                    onChange={(e) => set("secondary_width_mm", e.target.value)} />
                </label>
              </div>
              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                Bricked-in corner pantry — a decorative room feature (never quoted), with a door on the diagonal face.
                &quot;Width mm&quot; above is wall 1; set wall 2 and its width here.
              </p>
              <SectionDivider label="Door" />
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>
                  Door width mm
                  <input className={styles.fieldInput} type="number" min="1" placeholder="Auto-fit"
                    value={draft.door_config?.width_mm || ""}
                    onChange={(e) => setDoorCfg("width_mm", e.target.value === "" ? null : Number(e.target.value))} />
                </label>
                <label className={styles.fieldLabel}>
                  Door height mm
                  <input className={styles.fieldInput} type="number" min="1" placeholder="Auto-fit"
                    value={draft.door_config?.height_mm || ""}
                    onChange={(e) => setDoorCfg("height_mm", e.target.value === "" ? null : Number(e.target.value))} />
                </label>
              </div>
              <label className={styles.fieldLabel}>
                Handle side
                <select className={styles.fieldSelect} value={draft.door_config?.handle_side || "left"}
                  onChange={(e) => setDoorCfg("handle_side", e.target.value)}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <p style={{ fontSize: 10, color: "var(--dt-text-muted, #888780)", margin: "0 0 4px", lineHeight: 1.4 }}>
                The door is drawn with a frame + leaf, centred on the diagonal wall. Leave width/height blank to
                auto-fit the diagonal opening.
              </p>
            </>
          )}
          {/* Per-obstruction display colour — persists on the design tool only.
              Empty (null) falls back to the default obstruction grey. */}
          <label className={styles.fieldLabel}>
            Colour
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="color"
                value={draft.colour_hex || OBSTRUCTION_DEFAULT_HEX}
                onChange={(e) => set("colour_hex", e.target.value)}
                style={{ width: 44, height: 30, padding: 0, border: "1px solid var(--dt-border-soft, rgba(0,0,0,0.15))", borderRadius: 4, background: "none", cursor: "pointer" }}
                aria-label="Obstruction colour"
              />
              <span style={{ fontSize: 11, color: "var(--dt-text-muted, #888780)", fontVariantNumeric: "tabular-nums" }}>
                {draft.colour_hex ? draft.colour_hex.toUpperCase() : "Default"}
              </span>
              {draft.colour_hex && (
                <button
                  type="button"
                  onClick={() => set("colour_hex", null)}
                  style={{ marginLeft: "auto", background: "none", border: "none", padding: 0, color: "#2563eb", cursor: "pointer", fontSize: 11 }}
                >
                  Reset to default
                </button>
              )}
            </div>
          </label>
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
export default function DesignRightPanel({ item, allItems, room, materialDefaults, isAddingItem, isOverlapping, onAdd, onCancelAdd, onItemChange, onDeleteItem, onDuplicateItem, onSelectItem, allowedTypes, currentWall, fullWidth = false, pickedType: controlledPick = null, onPickType = null, colourImages = null }) {
  // `fullWidth` + `allowedTypes` are the mobile hooks: the modal renders the
  // exact same panel at 100% width and restricts which cabinet types can be
  // added. Desktop passes neither, so behaviour is unchanged.
  const panelClass = fullWidth ? `${styles.rightPanel} ${styles.rightPanelFull}` : styles.rightPanel;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [cutListOpen, setCutListOpen] = useState(false);

  // Which config groups are expanded. Deliberately held HERE and not inside
  // CabinetConfigForm: that's mounted with key={item.id}, so it remounts on
  // every selection — state living in it would slam every section shut each
  // time you clicked a different cabinet. Working through the kickboards of a
  // run should keep Finishing open the whole way.
  //
  // Cabinet opens by default because it's the "what and where" you always
  // want; everything else stays shut behind its summary until asked for.
  // Single-open accordion — opening one section collapses the rest. Held here
  // (not in the form) so the chosen section stays open across cabinet
  // selections. Default open = "size" (the what & where you set first).
  const [openSection, setOpenSection] = useState("size");
  const toggleSection = useCallback((id) => {
    setOpenSection((cur) => (cur === id ? null : id));
  }, []);

  // The visual "Add Item" flow is two steps: pick a type, then set its
  // dimensions in the form.
  //   - Desktop: the picker is the LEFT-rail catalogue, so the pick is
  //     controlled from above via `pickedType` + `onPickType`.
  //   - Mobile (fullWidth): the picker is the AddItemModal below, held in this
  //     component's own state.
  const [pickedTypeState, setPickedTypeState] = useState(null);
  useEffect(() => { if (!isAddingItem) setPickedTypeState(null); }, [isAddingItem]);
  const controlledAdd = typeof onPickType === "function";
  const activePick = controlledAdd ? controlledPick : pickedTypeState;
  const choosePick  = controlledAdd ? onPickType : (type, kind) => setPickedTypeState({ type, kind });
  const clearPick   = controlledAdd ? () => onPickType(null) : () => setPickedTypeState(null);

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
            <p className={styles.rightPanelSubtitle}>{activePick ? "Set the size, then drag to position" : "Pick an item on the left"}</p>
          </div>
        )}
        <div className={styles.rightScroll}>
          {activePick ? (
            <AddItemForm
              onAdd={onAdd}
              onCancel={onCancelAdd}
              onBack={clearPick}
              initialType={activePick.type}
              initialKind={activePick.kind}
              allowedTypes={allowedTypes}
              currentWall={currentWall}
            />
          ) : (
            <p className={styles.rightIdleHint} style={{ padding: 16 }}>
              {controlledAdd ? "Choose an item from the list on the left…" : "Choose an item from the picker…"}
            </p>
          )}
        </div>
        {/* Mobile keeps the pop-over picker; desktop uses the left-rail
            catalogue (controlled), so no modal here. */}
        {!controlledAdd && !activePick && (
          <AddItemModal
            allowedTypes={allowedTypes || ADDABLE_TYPES}
            typeLabels={TYPE_LABELS}
            onPick={(type, kind) => choosePick(type, kind)}
            onClose={onCancelAdd}
          />
        )}
      </div>
    );
  }

  if (item) {
    const isCabinet = CABINET_TYPES.includes(item.item_type);
    const hasCutList = isCabinet || item.item_type === "floating_shelf" || item.item_type === "shelf_rail";
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
        {item.item_type === "shelf_rail" ? (
          <ShelfRailForm key={item.id} item={item} allItems={allItems} room={room} onItemChange={onItemChange} openSection={openSection} toggleSection={toggleSection} colourImages={colourImages} />
        ) : item.item_type === "bookcase" ? (
          <BookcaseForm key={item.id} item={item} allItems={allItems} onItemChange={onItemChange} openSection={openSection} toggleSection={toggleSection} colourImages={colourImages} />
        ) : isCabinet ? (
          <CabinetConfigForm key={item.id} item={item} allItems={allItems} room={room} materialDefaults={materialDefaults} onItemChange={onItemChange} onSelectItem={onSelectItem} openSection={openSection} toggleSection={toggleSection} fullWidth={fullWidth} colourImages={colourImages} />
        ) : ["obstruction", "window", "door_opening", "appliance", "brick_corner_pantry"].includes(item.item_type) ? (
          <ObstructionForm key={item.id} item={item} onItemChange={onItemChange} />
        ) : item.item_type === "floating_shelf" ? (
          <ShelfForm key={item.id} item={item} allItems={allItems} onItemChange={onItemChange} />
        ) : (
          <DoorPanelForm key={item.id} item={item} room={room} onItemChange={onItemChange} />
        )}
        {/* Bottom rail — the per-cabinet cut list sits above the Duplicate /
            Delete row so nothing overlaps. */}
        <div className={styles.rightPanelFooter} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          {!fullWidth && hasCutList && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              style={{ width: "100%" }}
              onClick={() => setCutListOpen(true)}
            >
              View cut list
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Duplicate would add a second cabinet to the room — hidden on
                mobile, which is restricted to one cabinet per room. */}
            {!fullWidth && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ flex: 1 }}
                onClick={handleDuplicateClick}
                disabled={isDuplicating}
              >
                {isDuplicating ? "Duplicating…" : "Duplicate"}
              </button>
            )}
            <button
              type="button"
              className={`${styles.deleteItemBtn} ${confirmDelete ? styles.deleteItemBtnConfirm : ""}`}
              style={{ flex: 1 }}
              onClick={handleDeleteClick}
            >
              {confirmDelete ? "Confirm delete?" : "Delete item"}
            </button>
          </div>
        </div>
        {cutListOpen && (
          <CutListModal
            title={itemDisplayLabel(item)}
            subtitle="Cut list"
            onClose={() => setCutListOpen(false)}
          >
            <CabinetCutRows item={item} items={allItems} room={room} />
          </CutListModal>
        )}
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
