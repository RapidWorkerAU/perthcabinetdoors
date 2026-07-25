"use client";

// The public, no-login kitchen planner (Phase 4) — a full-screen, app-like
// experience modelled on consumer planners (IKEA et al): a slim top bar, an
// always-visible catalogue rail to add cabinets, an immersive plan/3D stage that
// fills the screen, and a contextual panel for the selected cabinet. No prices,
// no cut-lists — design + colour, then save a link (Send-to-PCD is a later step).

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import DesignCanvas from "../../admin/design/_components/DesignCanvas";
import FrontElevationView from "../../admin/design/_components/FrontElevationView";
import { Mockup } from "../../admin/design/_components/AddItemModal";
import PublicColourModal from "./PublicColourModal";
import { resolveColourSrc, slotColourFields } from "../../../lib/pcd-colour-images";
import usePublicDesign from "./usePublicDesign";

const Design3DView = dynamic(() => import("../../admin/design/_components/Design3DView"), {
  ssr: false,
  loading: () => <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#8a867c" }}>Loading 3D…</div>,
});

const CATALOGUE = [
  { type: "base_cabinet", label: "Base cabinet", desc: "Floor unit with a benchtop" },
  { type: "wall_cabinet", label: "Wall cabinet", desc: "Upper / overhead unit" },
  { type: "tall_cabinet", label: "Tall / pantry", desc: "Full-height tower" },
  { type: "corner_base_cabinet", label: "Corner cabinet", desc: "Wraps a corner" },
  { type: "floating_shelf", label: "Floating shelf", desc: "Wall-mounted open shelf" },
];
const TYPE_LABELS = Object.fromEntries(CATALOGUE.map((c) => [c.type, c.label]));
const HAS_BENCHTOP = new Set(["base_cabinet", "corner_base_cabinet"]);
const FLOOR_TYPES = new Set(["base_cabinet", "tall_cabinet", "corner_base_cabinet"]);
const isShelf = (item) => item?.item_type === "floating_shelf";
const isCorner = (item) => item?.item_type === "corner_base_cabinet";
// Melamine "carcass white" — the whole-item colour fallback, so a new cabinet
// reads white until a specific surface is coloured (carcass stays white even
// after the doors are changed, exactly as a real white-carcass unit).
const CARCASS_WHITE = "#efece3";

const frontStyle = (item) => (item?.front_type === "drawers" ? item?.drawer_style : item?.door_style);

// Whether the cabinet has any finished side/back/underside panel switched on.
const hasFinishPanels = (item) => Boolean(item?.end_panel_left || item?.end_panel_right || item?.has_back_panel || item?.has_bottom_panel);
// "Open" = no doors or drawers (front_type "none"), so the interior + shelves show.
const isOpenFront = (item) => (item?.front_type || "none") === "none" && !isShelf(item);

// Which colour-image slot a sidebar surface maps to (for the current swatch).
const slotForTarget = (item, target) => {
  if (target === "front") return item?.front_type === "drawers" ? "drawer" : "door";
  if (target === "shelf") return "shelf";
  if (target === "kickboard") return "kickboard";
  if (target === "benchtop") return "benchtop";
  if (target === "panels") return "endpanel";
  return "carcass";
};

// The colour surfaces available to edit for a given item, in tab order. Front
// hides when open; Shelves appears when an open cabinet has shelves; Panels when
// a finished side/back/underside panel is on.
function targetsFor(item) {
  if (!item) return [];
  if (isShelf(item)) return [{ key: "body", label: "Shelf" }];
  const open = isOpenFront(item);
  return [
    ...(open ? [] : [{ key: "front", label: item.front_type === "drawers" ? "Drawers" : "Doors" }]),
    ...(open && Number(item.shelf_qty) > 0 ? [{ key: "shelf", label: "Shelves" }] : []),
    { key: "body", label: "Carcass" },
    ...(item.has_kickboard ? [{ key: "kickboard", label: "Kickboard" }] : []),
    ...(hasFinishPanels(item) ? [{ key: "panels", label: "Panels" }] : []),
    ...(HAS_BENCHTOP.has(item.item_type) ? [{ key: "benchtop", label: "Benchtop" }] : []),
  ];
}

// Even drawer heights for an n-drawer bank of a given cabinet height.
function equalDrawers(heightMm, n) {
  const total = Number(heightMm) || 720;
  const each = Math.round(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - each * (n - 1) : each));
}

function cabinetDraft(type) {
  const base = { item_type: type, wall: "top", front_type: "doors", qty: 1, colour_hex: CARCASS_WHITE };
  switch (type) {
    case "wall_cabinet":
      return { ...base, width_mm: 600, height_mm: 720, depth_mm: 320, mount_height_mm: 1400, door_config: { columns: 1, rows: 1 } };
    case "tall_cabinet":
      return { ...base, width_mm: 600, height_mm: 2100, depth_mm: 560, has_kickboard: true, door_config: { columns: 1, rows: 2 } };
    case "corner_base_cabinet":
      return { ...base, width_mm: 900, secondary_width_mm: 900, height_mm: 720, depth_mm: 560, has_kickboard: true, has_benchtop: true, corner_style: "l_shape" };
    case "floating_shelf":
      // Wall-mounted board — no doors/benchtop; finish stored in the base
      // material/finish/colour columns (see floatingShelfStyle).
      return { item_type: "floating_shelf", wall: "top", qty: 1, width_mm: 900, depth_mm: 250, height_mm: 40, mount_height_mm: 1500, carcass_thickness_mm: 18 };
    case "base_cabinet":
    default:
      return { ...base, width_mm: 600, height_mm: 720, depth_mm: 560, has_kickboard: true, has_benchtop: true, door_config: { columns: 1, rows: 1 } };
  }
}

const C = {
  bar: "#2a2b28", barText: "#f3f1ea", panel: "#ffffff", edge: "#e4dfd4", ink: "#2a2925",
  soft: "#7a766c", green: "#1f6f4a", stage: "#eceae3",
};
const btn = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.edge}`, background: "#fff", cursor: "pointer", font: "inherit", fontSize: 13.5, color: C.ink };
const btnGhost = { ...btn, background: "transparent", border: `1px solid rgba(255,255,255,0.28)`, color: C.barText };
const btnPrimary = { ...btn, background: C.green, color: "#fff", borderColor: C.green, fontWeight: 600 };

export default function PublicDesignClient() {
  const d = usePublicDesign();
  const [view, setView] = useState("plan"); // plan | elevation | 3d
  const [elevWall, setElevWall] = useState("top");
  const [showColours, setShowColours] = useState(true);
  const [colourTarget, setColourTarget] = useState("front");
  const [colourModalOpen, setColourModalOpen] = useState(false);
  const [savePanel, setSavePanel] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false); // narrow: room sheet

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 860px)");
    const on = () => setNarrow(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Keep the colour target valid for the selected item (a shelf has only
  // "Shelf"; a non-benchtop cabinet has no "Benchtop").
  useEffect(() => {
    const item = d.selectedItem;
    if (!item) return;
    const keys = targetsFor(item).map((t) => t.key);
    if (!keys.includes(colourTarget)) setColourTarget(keys[0]);
  }, [d.selectedItem, colourTarget]);

  async function addCabinet(type) {
    await d.addItem(cabinetDraft(type));
  }

  function applyColour(sel) {
    const item = d.selectedItem;
    if (!item) return;
    const mfc = { material: sel.material, finish: sel.finish, colour: sel.colour };
    const mfcS = { ...mfc, supplier: sel.supplier }; // supplier kept in the jsonb so the chooser re-opens on the right brand
    if (colourTarget === "body") d.updateItem(item.id, mfc);
    else if (colourTarget === "shelf") d.updateItem(item.id, { shelf_material: sel.material, shelf_finish: sel.finish, shelf_colour: sel.colour });
    else if (colourTarget === "kickboard") d.updateItem(item.id, { kickboard_style: mfcS });
    else if (colourTarget === "panels") d.updateItem(item.id, { finish_panel_style: mfcS, back_panel_style: mfcS, bottom_panel_style: mfcS });
    else if (colourTarget === "benchtop") d.updateItem(item.id, { benchtop_colour_style: mfcS, benchtop_colour_hex: "" });
    else if (item.front_type === "drawers") d.updateItem(item.id, { drawer_style: { ...(item.drawer_style || {}), ...mfcS } });
    else d.updateItem(item.id, { front_type: "doors", door_style: { ...(item.door_style || {}), ...mfcS } });
    setColourModalOpen(false);
  }

  const colourValue = (() => {
    const item = d.selectedItem;
    if (!item) return null;
    if (colourTarget === "body") return { material: item.material, finish: item.finish, colour: item.colour };
    if (colourTarget === "shelf") return { material: item.shelf_material, finish: item.shelf_finish, colour: item.shelf_colour };
    if (colourTarget === "kickboard") return item.kickboard_style || null;
    if (colourTarget === "panels") return item.finish_panel_style || item.back_panel_style || item.bottom_panel_style || null;
    if (colourTarget === "benchtop") return item.benchtop_colour_style || null;
    return frontStyle(item) || null;
  })();

  const openColour = (target) => { setColourTarget(target); setColourModalOpen(true); };
  const surfaceLabel = (targetsFor(d.selectedItem).find((t) => t.key === colourTarget) || {}).label || "colour";

  const shell = { position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: C.stage, overflow: "hidden", zIndex: 1 };

  if (d.loading) return <div style={{ ...shell, alignItems: "center", justifyContent: "center", color: C.soft }}>Starting your design…</div>;
  if (d.error || !d.room) {
    return (
      <div style={{ ...shell, alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24 }}>
        <p style={{ color: "#b4442f" }}>{d.error || "Couldn't load your room."}</p>
        <button style={btn} onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const stage = (
    <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0, background: "#fff" }}>
      {view === "plan" ? (
        <DesignCanvas
          room={d.room} items={d.items} selectedItemId={d.selectedItemId} overlappingItemIds={d.overlappingItemIds}
          onItemClick={(item) => d.setSelectedItemId(item.id)} onDeselect={() => d.setSelectedItemId(null)}
          onItemDragEnd={d.handleItemDragEnd} onFrontView={(w) => { setElevWall(w); setView("elevation"); }} colourImages={d.colourImages} showColours={showColours}
        />
      ) : view === "elevation" ? (
        <FrontElevationView
          wall={elevWall} room={d.room} items={d.items}
          interactive chrome={false}
          colourImages={d.colourImages} showColours={showColours}
          selectedId={d.selectedItemId}
          onItemSelect={(id) => d.setSelectedItemId(id)}
          onItemChange={d.handleItemDragEnd}
          onClose={() => setView("plan")}
        />
      ) : (
        <Design3DView
          room={d.room} items={d.items} colourImages={d.colourImages} showColours={showColours}
          onToggleColours={() => setShowColours((s) => !s)} selectedItemId={d.selectedItemId}
          onSelectItem={(id) => d.setSelectedItemId(id)} onClose={() => setView("plan")} showClose={false}
        />
      )}
      {d.items.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <div style={{ background: "rgba(255,255,255,0.9)", border: `1px solid ${C.edge}`, borderRadius: 12, padding: "16px 20px", textAlign: "center", maxWidth: 340 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Start your kitchen design</div>
            <div style={{ fontSize: 13, color: C.soft, lineHeight: 1.5 }}>
              {narrow ? "Tap Add below to drop in your first cabinet, then drag it into place." : "Pick a cabinet from the left to drop it in, then drag it into place."}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={shell}>
      {/* Top bar */}
      <div style={{ height: 54, flexShrink: 0, background: C.bar, color: C.barText, display: "flex", alignItems: "center", gap: 10, padding: "0 12px" }}>
        <Link href="/" style={{ color: C.barText, textDecoration: "none", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>Perth Cabinet Doors</Link>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>·</span>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>Kitchen planner</span>

        <div style={{ flex: 1 }} />

        <div style={{ display: "inline-flex", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 8, overflow: "hidden" }}>
          {[{ v: "plan", label: "Plan" }, { v: "elevation", label: "Elevation" }, { v: "3d", label: "3D" }].map((o) => (
            <button key={o.v} type="button" onClick={() => setView(o.v)} style={{ ...btnGhost, border: "none", borderRadius: 0, background: view === o.v ? "rgba(255,255,255,0.16)" : "transparent" }}>{o.label}</button>
          ))}
        </div>
        {view === "elevation" && (
          <div style={{ display: "inline-flex", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 8, overflow: "hidden" }} title="Which wall to view">
            {[{ v: "top", label: "Back" }, { v: "left", label: "Left" }, { v: "right", label: "Right" }, { v: "bottom", label: "Front" }].map((o) => (
              <button key={o.v} type="button" onClick={() => setElevWall(o.v)} style={{ ...btnGhost, border: "none", borderRadius: 0, background: elevWall === o.v ? "rgba(255,255,255,0.16)" : "transparent" }}>{o.label}</button>
            ))}
          </div>
        )}
        <button type="button" style={btnGhost} onClick={() => setShowColours((s) => !s)} title="Show colours">{showColours ? "🎨 On" : "🎨 Off"}</button>
        {narrow && <button type="button" style={btnGhost} onClick={() => setRoomOpen(true)}>Room</button>}
        <div style={{ position: "relative" }}>
          <button type="button" style={btnGhost} onClick={() => setSavePanel((s) => !s)}>Save / share</button>
          {savePanel && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 300, background: "#fff", color: C.ink, border: `1px solid ${C.edge}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: 14, zIndex: 5 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Saved automatically. Copy this private link to come back on any device:</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} style={{ ...btn, flex: 1, minWidth: 0, cursor: "text", color: C.soft }} />
                <button type="button" style={btnPrimary} onClick={() => navigator.clipboard?.writeText(shareUrl)}>Copy</button>
              </div>
            </div>
          )}
        </div>
        <button type="button" style={btnGhost} onClick={() => { if (confirm("Start a new design? Your current one stays saved under its link.")) d.startOver(); }}>Start over</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* Catalogue rail (wide only) */}
        {!narrow && (
          <div style={{ width: 236, flexShrink: 0, background: C.panel, borderRight: `1px solid ${C.edge}`, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: C.soft, marginBottom: 10 }}>Add to your kitchen</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {CATALOGUE.map((c) => <AddCard key={c.type} row={c} onClick={() => addCabinet(c.type)} />)}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.edge}`, padding: 14 }}>
              <button type="button" style={{ ...btn, width: "100%" }} onClick={() => setRoomOpen(true)}>Edit room size</button>
            </div>
          </div>
        )}

        {stage}

        {/* Contextual panel (wide only) */}
        {!narrow && (
          <div style={{ width: 320, flexShrink: 0, background: C.panel, borderLeft: `1px solid ${C.edge}`, overflowY: "auto", padding: 16 }}>
            {d.selectedItem
              ? <ItemPanel item={d.selectedItem} onUpdate={d.updateItem} onDelete={() => d.deleteItem(d.selectedItem.id)} onDeselect={() => d.setSelectedItemId(null)} colourImages={d.colourImages} onChangeColour={openColour} />
              : <EmptyPrompt />}
          </div>
        )}
      </div>

      {/* Narrow: add bar + sheets */}
      {narrow && (
        <>
          <div style={{ flexShrink: 0, background: C.panel, borderTop: `1px solid ${C.edge}`, padding: "8px 10px", display: "flex", gap: 8, overflowX: "auto" }}>
            {CATALOGUE.map((c) => (
              <button key={c.type} type="button" onClick={() => addCabinet(c.type)} style={{ ...btn, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 92, padding: "6px" }}>
                <span style={{ width: 52, height: 38 }}><Mockup type={c.type} /></span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{c.label}</span>
              </button>
            ))}
          </div>
          {d.selectedItem && (
            <BottomSheet onClose={() => d.setSelectedItemId(null)}>
              <ItemPanel item={d.selectedItem} onUpdate={d.updateItem} onDelete={() => d.deleteItem(d.selectedItem.id)} onDeselect={() => d.setSelectedItemId(null)} colourImages={d.colourImages} onChangeColour={openColour} />
            </BottomSheet>
          )}
        </>
      )}

      {d.saveError && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#fbece9", border: "1px solid #e6b8ad", color: "#a03f2c", borderRadius: 8, padding: "8px 14px", fontSize: 13, zIndex: 6, display: "flex", gap: 12 }}>
          <span>{d.saveError}</span>
          <button type="button" onClick={d.dismissSaveError} style={{ border: "none", background: "none", cursor: "pointer", color: "#a03f2c" }}>✕</button>
        </div>
      )}

      {colourModalOpen && d.selectedItem && (
        <PublicColourModal surfaceLabel={surfaceLabel} value={colourValue} onPick={applyColour} onClose={() => setColourModalOpen(false)} />
      )}

      {roomOpen && (
        <RoomModal room={d.room} onUpdateRoom={d.updateRoom} onClose={() => setRoomOpen(false)} />
      )}
    </div>
  );
}

function AddCard({ row, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, border: `1px solid ${C.edge}`, background: "#faf8f3", cursor: "pointer", textAlign: "left" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.green; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.edge; }}>
      <span style={{ width: 46, height: 34, flexShrink: 0 }}><Mockup type={row.type} /></span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{row.label}</span>
        <span style={{ fontSize: 11, color: C.soft }}>{row.desc}</span>
      </span>
    </button>
  );
}

function BottomSheet({ children, onClose }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 7 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.28)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "68%", overflowY: "auto", background: "#fff", borderRadius: "16px 16px 0 0", padding: 16, boxShadow: "0 -10px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: C.edge, margin: "0 auto 12px" }} />
        {children}
      </div>
    </div>
  );
}

function ItemPanel({ item, onUpdate, onDelete, onDeselect, colourImages, onChangeColour }) {
  const shelf = isShelf(item);
  const corner = isCorner(item);
  const floor = FLOOR_TYPES.has(item.item_type);
  const wall = item.item_type === "wall_cabinet";
  const targets = targetsFor(item);
  const set = (patch) => onUpdate(item.id, patch);
  const [open, setOpen] = useState("colour"); // one section open at a time — Colour first

  const isDrawers = item.front_type === "drawers";
  const isOpen = isOpenFront(item);

  function setFront(type) {
    if (type === "drawers") set({ front_type: "drawers", drawer_config: { ...(item.drawer_config || {}), heights_mm: equalDrawers(item.height_mm, Math.max(2, (item.drawer_config?.heights_mm || []).length || 3)) } });
    else if (type === "open") set({ front_type: "none", shelf_qty: Number(item.shelf_qty) > 0 ? item.shelf_qty : 3 });
    else set({ front_type: "doors", door_config: item.door_config || { columns: 1, rows: 1 } });
  }

  const doorCount = Math.max(1, item.door_config?.columns || 1);
  const drawerCount = (Array.isArray(item.drawer_config?.heights_mm) && item.drawer_config.heights_mm.length) || 3;
  const shelfCount = Number(item.shelf_qty) || 0;
  const fingerOn = isDrawers ? !!item.drawer_config?.gap_enabled : !!item.door_config?.row_gap_enabled;
  const setDoorCount = (n) => set({ front_type: "doors", door_config: { ...(item.door_config || {}), columns: n, rows: 1 } });
  const setDrawerCount = (n) => set({ front_type: "drawers", drawer_config: { ...(item.drawer_config || {}), heights_mm: equalDrawers(item.height_mm, n) } });
  const setShelfCount = (n) => set({ shelf_qty: n });
  const setFinger = (on) => (isDrawers
    ? set({ drawer_config: { ...(item.drawer_config || {}), gap_enabled: on } })
    : set({ door_config: { ...(item.door_config || {}), row_gap_enabled: on } }));
  const frontValue = isOpen ? "open" : isDrawers ? "drawers" : "doors";
  const styleSummary = `${isOpen ? `Open · ${shelfCount} shelf${shelfCount === 1 ? "" : "ves"}` : isDrawers ? `${drawerCount} drawers` : `${doorCount} door${doorCount > 1 ? "s" : ""}`}${!isOpen && fingerOn ? " · finger pull" : ""}`;

  const anyFinishPanel = item.end_panel_left || item.end_panel_right || item.has_back_panel || item.has_bottom_panel;
  const panelCount = [item.has_kickboard, item.end_panel_left, item.end_panel_right, item.has_back_panel, item.has_bottom_panel].filter(Boolean).length;
  const sizeSummary = `${shelf ? `${item.width_mm || "?"}×${item.depth_mm || "?"}` : `${item.width_mm || "?"}×${item.height_mm || "?"}×${item.depth_mm || "?"}`} mm`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <strong style={{ fontSize: 14, color: C.ink }}>{TYPE_LABELS[item.item_type] || "Cabinet"}</strong>
        <button type="button" onClick={onDeselect} style={{ border: "none", background: "none", cursor: "pointer", color: C.soft, fontSize: 13 }}>Done</button>
      </div>

      {/* Colour & finish — each surface opens the brand→finish→colour chooser */}
      <AccSection k="colour" label="Colour & finish" openKey={open} setOpen={setOpen}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {targets.map((t) => {
            const slot = slotForTarget(item, t.key);
            const nm = slotColourFields(item, slot).colour;
            return (
              <ColourRow key={t.key} label={t.label}
                src={resolveColourSrc(colourImages, item, slot)}
                name={nm || (t.key === "body" ? "White (standard)" : "Standard")}
                hex={t.key === "body" ? item.colour_hex : null}
                onChange={() => onChangeColour(t.key)} />
            );
          })}
        </div>
      </AccSection>

      {/* Style */}
      {!shelf && !corner && (
        <AccSection k="style" label="Style" summary={styleSummary} openKey={open} setOpen={setOpen}>
          <Segmented value={frontValue} options={[{ v: "doors", label: "Doors" }, { v: "drawers", label: "Drawers" }, { v: "open", label: "Open" }]} onChange={setFront} />
          {isOpen ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>How many shelves?</div>
              <Segmented value={String(shelfCount)} options={[{ v: "0", label: "0" }, { v: "1", label: "1" }, { v: "2", label: "2" }, { v: "3", label: "3" }, { v: "4", label: "4" }]} onChange={(v) => setShelfCount(Number(v))} />
            </div>
          ) : isDrawers ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>How many drawers?</div>
              <Segmented value={String(drawerCount)} options={[{ v: "2", label: "2" }, { v: "3", label: "3" }, { v: "4", label: "4" }]} onChange={(v) => setDrawerCount(Number(v))} />
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>How many doors?</div>
              <Segmented value={String(doorCount)} options={[{ v: "1", label: "1" }, { v: "2", label: "2" }]} onChange={(v) => setDoorCount(Number(v))} />
            </div>
          )}
          {!isOpen && (
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${C.edge}` }}>
              <Toggle label="Finger pull (handleless)" checked={fingerOn} onChange={setFinger} />
            </div>
          )}
        </AccSection>
      )}

      {/* Panels & finishing */}
      {!shelf && (
        <AccSection k="panels" label="Panels & finishing" summary={`${panelCount} on`} openKey={open} setOpen={setOpen}>
          {floor && <Toggle label="Kickboard" checked={item.has_kickboard} onChange={(v) => set({ has_kickboard: v })} />}
          {corner ? (
            <>
              <Toggle label="Wall 1 end panel" checked={item.end_panel_left} onChange={(v) => set({ end_panel_left: v })} />
              <Toggle label="Wall 2 end panel" checked={item.end_panel_right} onChange={(v) => set({ end_panel_right: v })} />
            </>
          ) : (
            <>
              <Toggle label="Left side panel" checked={item.end_panel_left} onChange={(v) => set({ end_panel_left: v })} />
              <Toggle label="Right side panel" checked={item.end_panel_right} onChange={(v) => set({ end_panel_right: v })} />
            </>
          )}
          {(item.item_type === "base_cabinet" || item.item_type === "tall_cabinet") && (
            <Toggle label="Finished back panel" checked={item.has_back_panel} onChange={(v) => set({ has_back_panel: v })} />
          )}
          {wall && <Toggle label="Underside panel" checked={item.has_bottom_panel} onChange={(v) => set({ has_bottom_panel: v })} />}
          {anyFinishPanel && (floor || wall) && (
            <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.edge}` }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>Extend those panels:</div>
              {floor && <Toggle label="Down to the floor" checked={item.panel_to_floor} onChange={(v) => set({ panel_to_floor: v })} />}
              {(item.item_type === "tall_cabinet" || wall) && <Toggle label="Up to the ceiling" checked={item.panel_to_ceiling} onChange={(v) => set({ panel_to_ceiling: v })} />}
            </div>
          )}
          {item.item_type === "base_cabinet" && item.has_benchtop && (
            <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.edge}` }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>Waterfall benchtop end (drops to the floor):</div>
              <Toggle label="Left end" checked={item.benchtop_waterfall_left} onChange={(v) => set({ benchtop_waterfall_left: v })} />
              <Toggle label="Right end" checked={item.benchtop_waterfall_right} onChange={(v) => set({ benchtop_waterfall_right: v })} />
            </div>
          )}
        </AccSection>
      )}

      {/* Size */}
      <AccSection k="size" label="Size" summary={sizeSummary} openKey={open} setOpen={setOpen}>
        {shelf ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <NumberField label="Length" value={item.width_mm} onCommit={(v) => set({ width_mm: v })} />
            <NumberField label="Depth" value={item.depth_mm} onCommit={(v) => set({ depth_mm: v })} />
            <NumberField label="Height" value={item.height_mm} onCommit={(v) => set({ height_mm: v })} />
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <NumberField label="Width" value={item.width_mm} onCommit={(v) => set({ width_mm: v })} />
              <NumberField label="Height" value={item.height_mm} onCommit={(v) => set({ height_mm: v })} />
              <NumberField label="Depth" value={item.depth_mm} onCommit={(v) => set({ depth_mm: v })} />
            </div>
            {corner && <div style={{ marginTop: 8 }}><NumberField label="Return width" value={item.secondary_width_mm} onCommit={(v) => set({ secondary_width_mm: v })} /></div>}
          </>
        )}
        {(shelf || wall) && <div style={{ marginTop: 8 }}><NumberField label="Height off floor (mm)" value={item.mount_height_mm} onCommit={(v) => set({ mount_height_mm: v })} /></div>}
      </AccSection>

      <button type="button" onClick={onDelete} style={{ ...btn, color: "#a03f2c", borderColor: "#e0c3bb", marginTop: 4 }}>{shelf ? "Remove shelf" : "Remove cabinet"}</button>
    </div>
  );
}

function AccSection({ k, label, summary, openKey, setOpen, children }) {
  const isOpen = openKey === k;
  return (
    <div style={{ border: `1px solid ${C.edge}`, borderRadius: 10, overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen(isOpen ? null : k)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", background: isOpen ? "#f7f5ef" : "#fff", border: "none", cursor: "pointer", font: "inherit" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{label}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>{isOpen ? "" : summary}</span>
        <span style={{ color: C.soft, fontSize: 12 }}>{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && <div style={{ padding: "8px 12px 14px" }}>{children}</div>}
    </div>
  );
}

function ColourRow({ label, src, name, hex, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, border: "1px solid rgba(0,0,0,0.12)", background: src ? `center/cover no-repeat url(${src})` : (hex || "#e9e6df") }} />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{label}</span>
        <span style={{ fontSize: 11, color: C.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </span>
      <button type="button" onClick={onChange} style={{ ...btn, marginLeft: "auto", padding: "5px 10px", fontSize: 12 }}>Change</button>
    </div>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${C.edge}`, borderRadius: 8, overflow: "hidden" }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)}
            style={{ ...btn, border: "none", borderRadius: 0, background: on ? C.green : "#fff", color: on ? "#fff" : C.ink, fontWeight: on ? 600 : 400 }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "5px 0", cursor: "pointer", fontSize: 13, color: C.ink }}>
      <span>{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.green, cursor: "pointer" }} />
    </label>
  );
}

// Shown in the right panel when nothing is selected.
function EmptyPrompt() {
  return (
    <div style={{ height: "100%", minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8, padding: 20 }}>
      <div style={{ fontSize: 30, opacity: 0.7 }}>👆</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Nothing selected yet</div>
      <div style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>Click a cabinet in the plan or 3D to change its size, doors/drawers, colours and finish — its options will appear here.</div>
    </div>
  );
}

// A small centred modal for editing the room's overall size.
function RoomModal({ room, onUpdateRoom, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
      <div role="dialog" aria-modal="true" aria-label="Room size"
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: "min(380px, 92vw)", background: "#fff", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: `1px solid ${C.edge}` }}>
          <strong style={{ fontSize: 15, color: C.ink }}>Room size</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.edge}`, background: "#fff", cursor: "pointer", color: C.soft }}>✕</button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12.5, color: C.soft, margin: 0, lineHeight: 1.5 }}>Set your room&apos;s overall size in millimetres. You can change this any time.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <NumberField label="Width" value={room?.width_mm} onCommit={(v) => onUpdateRoom({ ...room, width_mm: v })} />
            <NumberField label="Depth" value={room?.depth_mm} onCommit={(v) => onUpdateRoom({ ...room, depth_mm: v })} />
            <NumberField label="Height" value={room?.height_mm} onCommit={(v) => onUpdateRoom({ ...room, height_mm: v })} />
          </div>
          <button type="button" style={{ ...btnPrimary, marginTop: 4 }} onClick={onClose}>Done</button>
        </div>
      </div>
    </>
  );
}

function NumberField({ label, value, onCommit }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setDraft(value ?? "");
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: C.soft }}>
      {label}
      <input type="number" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ ...btn, padding: "6px 8px", fontSize: 13, color: C.ink, width: "100%", boxSizing: "border-box" }} />
    </label>
  );
}
