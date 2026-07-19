"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import mobile from "../design.mobile.module.css";
import { formatMoney } from "@/lib/pcd-quote-utils";
import { includedItemCost } from "./mobile/cabinetPricing";
import useDesignProgram from "./useDesignProgram";
import DesignCanvas from "./DesignCanvas";
import FrontElevationView from "./FrontElevationView";
import PinchZoom from "./PinchZoom";
import RoomsModal from "./mobile/RoomsModal";
import CabinetModal from "./mobile/CabinetModal";
import RoomPriceModal from "./mobile/RoomPriceModal";

// three.js is heavy and client-only (r3f), so it's split out of the initial
// mobile bundle exactly as the desktop shell does — it loads only when the
// viewer first opens the 3D tab, never on first paint.
const Design3DView = dynamic(() => import("./Design3DView"), {
  ssr: false,
  loading: () => (
    <div className={mobile.emptyState}>
      <span className={mobile.emptyHint}>Loading 3D view…</span>
    </div>
  ),
});

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet", "blind_corner_cabinet"];
const TYPE_COLORS = {
  base_cabinet: "#3b82f6", wall_cabinet: "#22c55e", tall_cabinet: "#f97316",
  corner_base_cabinet: "#0ea5e9", panel: "#6b7280", scribe: "#ec4899", obstruction: "#57534e",
};
const TYPE_SHORT = {
  base_cabinet: "Base", wall_cabinet: "Wall", tall_cabinet: "Tall",
  corner_base_cabinet: "Corner", panel: "Panel", scribe: "Scribe", obstruction: "Obstr.",
};
const WALLS = ["top", "bottom", "left", "right"];
const NUDGE_MM = 10;
const VIEW_LABELS = { plan: "Plan", elevation: "Elevation", "3d": "3D" };

/**
 * Mobile design shell — full multi-cabinet editor. Same brain as desktop
 * (useDesignProgram); the two sidebars become full-screen modals and the canvas
 * is the primary editor. One finger drags a cabinet, two fingers pinch-zoom.
 */
export default function DesignProgramMobile({ projectId }) {
  const d = useDesignProgram(projectId);
  const {
    project, rooms, selectedRoom, roomItems,
    selectedItemId, setSelectedItemId,
    isAddingItem, setIsAddingItem,
    selectedRoomId, setSelectedRoomId,
    loading, error, loadAll,
    handleAddRoom, handleUpdateRoom, handleDeleteRoom, handleAddItem,
    handleItemChange, handleItemDragEnd, handleDuplicateItem, handleDeleteItem,
    colourImages,
  } = d;

  const [openModal, setOpenModal] = useState(null); // 'rooms' | 'item' | 'price'
  const [view, setView] = useState("plan");          // 'plan' | 'elevation' | '3d'
  const [elevationWall, setElevationWall] = useState("top");
  // Paint cabinets with their real colour-library finishes in 3D. Off by
  // default so the first look is the familiar coloured-by-type one, matching
  // the desktop tool's default.
  const [showColours, setShowColours] = useState(false);
  // Per-item "pricing scope": which cost categories (Carcass, Doors, …) are
  // excluded from a cabinet's total. Ephemeral (on-the-run only, not saved),
  // keyed by item id → array of excluded category names. Lifted here so the
  // price strip and the price modal show the same scoped number.
  const [excludedByItem, setExcludedByItem] = useState({});
  // Fullscreen strips the screen down to just the top bar, the canvas and (in
  // elevation) the wall picker — for editing on a tiny screen without the
  // legend, chips, price strip and bottom bar competing for space. The
  // selection bar and modals still work.
  const [fullscreen, setFullscreen] = useState(false);
  // The Plan/Elevation/3D control is a dropdown (was a 3-way segmented toggle)
  // to free up top-bar space and hold the fullscreen switch.
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  const selectedItem = roomItems.find((i) => i.id === selectedItemId) || null;
  // Everything that carries a material cost: cabinets plus standalone panels and
  // scribes placed on their own on the plan (loose finishing pieces are a real
  // line in a refresh job, so they belong in the room price).
  const priceItems = roomItems.filter(
    (i) => CABINET_TYPES.includes(i.item_type) || i.item_type === "panel" || i.item_type === "scribe"
  );
  const roomTotal = priceItems.reduce(
    (s, c) => s + includedItemCost(c, roomItems, selectedRoom, new Set(excludedByItem[c.id] || [])),
    0,
  );

  function openRooms() { setOpenModal("rooms"); }

  function openAdd() {
    if (!selectedRoom) return;
    setSelectedItemId(null);
    setIsAddingItem(true);
    setOpenModal("item");
  }

  function editSelected() {
    if (!selectedItem) return;
    setIsAddingItem(false);
    setOpenModal("item");
  }

  function closeItemModal() {
    setIsAddingItem(false);
    setOpenModal(null);
  }

  async function onAddItem(draft) {
    return handleAddItem(draft); // modal switches to edit for the new item
  }

  // Nudging accumulates each tap onto the latest position immediately
  // (optimistic), then saves only once the burst settles. Rapid taps used to
  // jump back: each tap read a stale position and each fired its own PATCH, so
  // an out-of-order response could overwrite a newer position. Now the move is
  // applied straight to the items array (so taps accumulate correctly) and the
  // save is debounced + fire-and-forget — the server stores x/y/mount verbatim
  // (no snapping), so there's no echo to overwrite the optimistic position.
  const pendingRef = useRef({});    // itemId -> partial position patch
  const saveTimerRef = useRef({});  // itemId -> debounce timer

  function applyNudge(id, key, delta) {
    const item = roomItems.find((i) => i.id === id);
    if (!item) return;
    const base = pendingRef.current[id] || {};
    const current = base[key] != null ? base[key] : (Number(item[key]) || 0);
    let next = current + delta;
    if (key === "mount_height_mm") next = Math.max(0, next);
    pendingRef.current[id] = { ...base, [key]: next };
    d.setItems((items) => items.map((it) => (it.id === id ? { ...it, [key]: next } : it)));

    clearTimeout(saveTimerRef.current[id]);
    saveTimerRef.current[id] = setTimeout(() => {
      const pos = pendingRef.current[id];
      delete pendingRef.current[id];
      if (!pos) return;
      fetch(`/api/admin/design/projects/${projectId}/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pos),
      }).catch(() => {});
    }, 350);
  }

  // Direction is view-aware: in plan the arrows move the item in room space;
  // in elevation left/right move it along its wall and up/down change its
  // mount height.
  //
  // Both branches must respect which field actually holds the along-wall
  // position. On the left/right walls that's y_mm, and x_mm has to stay 0 —
  // getAbsPos() reads ANY x_mm > 0 on those walls as a legacy-format row and
  // takes the position from it instead. The plan arrows used to write x_mm
  // unconditionally, so one 10mm tap on a left-wall cabinet at y=800 flipped
  // it to legacy interpretation and teleported it to y=10.
  function nudge(dir) {
    const item = selectedItem;
    if (!item) return;

    if (view === "elevation") {
      const onSideWall = elevationWall === "left" || elevationWall === "right";
      const along = onSideWall ? "y_mm" : "x_mm";
      // The elevation mirrors the bottom and left walls so svg-left is always
      // the viewer's left (see axisFlipped in FrontElevationView). The arrows
      // have to mirror with it, or "left" visibly moves the cabinet right.
      const flip = elevationWall === "bottom" || elevationWall === "left";
      const step = flip ? -NUDGE_MM : NUDGE_MM;
      if (dir === "left")  applyNudge(item.id, along, -step);
      if (dir === "right") applyNudge(item.id, along, +step);
      if (dir === "up")    applyNudge(item.id, "mount_height_mm", +NUDGE_MM);
      if (dir === "down")  applyNudge(item.id, "mount_height_mm", -NUDGE_MM);
      return;
    }

    // Plan. An island is free in both axes; a wall-mounted item only has one
    // meaningful axis — the other is derived from its wall, so writing it
    // would corrupt the position rather than move the cabinet.
    if (item.wall === "island") {
      if (dir === "left")  applyNudge(item.id, "x_mm", -NUDGE_MM);
      if (dir === "right") applyNudge(item.id, "x_mm", +NUDGE_MM);
      if (dir === "up")    applyNudge(item.id, "y_mm", -NUDGE_MM);
      if (dir === "down")  applyNudge(item.id, "y_mm", +NUDGE_MM);
      return;
    }
    if (item.wall === "left" || item.wall === "right") {
      if (dir === "up")   applyNudge(item.id, "y_mm", -NUDGE_MM);
      if (dir === "down") applyNudge(item.id, "y_mm", +NUDGE_MM);
    } else {
      if (dir === "left")  applyNudge(item.id, "x_mm", -NUDGE_MM);
      if (dir === "right") applyNudge(item.id, "x_mm", +NUDGE_MM);
    }
  }

  function enterElevation() {
    setElevationWall(selectedItem?.wall && WALLS.includes(selectedItem.wall) ? selectedItem.wall : "top");
    setView("elevation");
  }

  function chooseView(v) {
    setViewMenuOpen(false);
    if (v === "elevation") enterElevation();
    else setView(v);
  }

  if (loading) {
    return <div className={mobile.mobileRoot}><div className={mobile.emptyState}><span className={mobile.emptyHint}>Loading…</span></div></div>;
  }
  if (error) {
    return (
      <div className={mobile.mobileRoot}>
        <div className={mobile.emptyState}>
          <span className={mobile.emptyTitle}>Couldn’t load project</span>
          <span className={mobile.emptyHint}>{error}</span>
          <button type="button" className={mobile.primaryBtn} style={{ maxWidth: 200 }} onClick={loadAll}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className={mobile.mobileRoot}>
      {/* ---- Top bar ---- */}
      <div className={mobile.topBar}>
        <div className={mobile.topBarTitles}>
          <span className={mobile.topBarProject}>{project?.name || "Design"}</span>
          <span className={mobile.topBarRoom}>{selectedRoom?.name || "No room"}</span>
        </div>
        <div className={mobile.viewMenuWrap}>
          <button
            type="button"
            className={mobile.viewMenuTrigger}
            onClick={() => setViewMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={viewMenuOpen}
          >
            <span>{VIEW_LABELS[view]}</span>
            {fullscreen && <span className={mobile.viewMenuFsTag}>Fullscreen</span>}
            <span className={mobile.viewMenuCaret}>▾</span>
          </button>
          {viewMenuOpen && (
            <>
              <div className={mobile.viewMenuBackdrop} onClick={() => setViewMenuOpen(false)} />
              <div className={mobile.viewMenu} role="menu">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={view === "plan"}
                  className={`${mobile.viewMenuItem} ${view === "plan" ? mobile.viewMenuItemActive : ""}`}
                  onClick={() => chooseView("plan")}
                >Plan</button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={view === "elevation"}
                  className={`${mobile.viewMenuItem} ${view === "elevation" ? mobile.viewMenuItemActive : ""}`}
                  onClick={() => chooseView("elevation")}
                  disabled={!selectedRoom || roomItems.length === 0}
                >Elevation</button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={view === "3d"}
                  className={`${mobile.viewMenuItem} ${view === "3d" ? mobile.viewMenuItemActive : ""}`}
                  onClick={() => chooseView("3d")}
                  disabled={!selectedRoom}
                >3D</button>
                <div className={mobile.viewMenuDivider} />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={fullscreen}
                  className={`${mobile.viewMenuItem} ${fullscreen ? mobile.viewMenuItemActive : ""}`}
                  onClick={() => { setFullscreen((f) => !f); setViewMenuOpen(false); }}
                >
                  <span className={mobile.viewMenuCheck}>{fullscreen ? "✓" : ""}</span>
                  View fullscreen
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- Elevation wall selector ---- */}
      {view === "elevation" && selectedRoom && (
        <div className={mobile.wallPicker}>
          <span className={mobile.wallPickerLabel}>Wall</span>
          {WALLS.map((w) => {
            const count = roomItems.filter((i) => i.wall === w).length;
            return (
              <button
                key={w}
                type="button"
                className={`${mobile.wallBtn} ${w === elevationWall ? mobile.wallBtnActive : ""}`}
                onClick={() => setElevationWall(w)}
              >
                {w[0].toUpperCase()}{w.slice(1)} <span className={mobile.wallBtnCount}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---- Item chip strip (reliable selection; hidden in fullscreen) ---- */}
      {view === "plan" && selectedRoom && roomItems.length > 0 && !fullscreen && (
        <div className={mobile.itemStrip}>
          {roomItems.map((it) => (
            <button
              key={it.id}
              type="button"
              className={`${mobile.itemChip} ${it.id === selectedItemId ? mobile.itemChipActive : ""}`}
              onClick={() => setSelectedItemId(it.id === selectedItemId ? null : it.id)}
            >
              <span className={mobile.itemChipDot} style={{ background: TYPE_COLORS[it.item_type] || "#888" }} />
              {it.label || TYPE_SHORT[it.item_type] || it.item_type}
            </button>
          ))}
        </div>
      )}

      {/* ---- Canvas ---- */}
      <div className={mobile.canvasWrap}>
        {!selectedRoom ? (
          <div className={mobile.emptyState}>
            <span className={mobile.emptyTitle}>No room yet</span>
            <span className={mobile.emptyHint}>Add a room to set your dimensions and start designing.</span>
            <button type="button" className={mobile.primaryBtn} style={{ maxWidth: 200 }} onClick={openRooms}>+ Add room</button>
          </div>
        ) : view === "3d" ? (
          <div className={mobile.view3dFill}>
            <Design3DView
              touch
              showClose={false}
              room={selectedRoom}
              items={roomItems}
              colourImages={colourImages}
              showColours={showColours}
              onToggleColours={() => setShowColours((v) => !v)}
              selectedItemId={selectedItemId}
              onSelectItem={(id) => setSelectedItemId(id)}
              onClose={() => setView("plan")}
            />
          </div>
        ) : view === "elevation" ? (
          <FrontElevationView
            interactive={false}
            zoomable
            chrome={!fullscreen}
            wall={elevationWall}
            room={selectedRoom}
            items={roomItems}
            selectedId={selectedItemId}
            onClose={() => setView("plan")}
            onItemChange={handleItemChange}
            onItemSelect={(id) => setSelectedItemId(id)}
          />
        ) : (
          <PinchZoom oneFingerPan={false}>
            <DesignCanvas
              interactive
              room={selectedRoom}
              items={roomItems}
              selectedItemId={selectedItemId}
              overlappingItemIds={new Set()}
              onItemClick={(it) => setSelectedItemId(it.id === selectedItemId ? null : it.id)}
              onDeselect={() => setSelectedItemId(null)}
              onItemDragEnd={handleItemDragEnd}
              onFrontView={(wall) => { setElevationWall(wall); setView("elevation"); }}
            />
          </PinchZoom>
        )}
      </div>

      {/* ---- Selection action bar (plan + elevation; 3D is read-only) ---- */}
      {selectedItem && view !== "3d" && (
        <div className={mobile.selectionBar}>
          <div className={mobile.selRow}>
            <button
              type="button"
              className={mobile.selClose}
              onClick={() => setSelectedItemId(null)}
              aria-label="Deselect cabinet"
              title="Deselect"
            >✕</button>
            <span className={mobile.selName}>{selectedItem.label || TYPE_SHORT[selectedItem.item_type] || selectedItem.item_type}</span>
            <button type="button" className={mobile.selBtn} onClick={editSelected}>Edit</button>
            <button type="button" className={mobile.selBtn} onClick={() => handleDuplicateItem(selectedItem.id)}>Duplicate</button>
            <button type="button" className={`${mobile.selBtn} ${mobile.selBtnDanger}`} onClick={() => handleDeleteItem(selectedItem.id)}>Delete</button>
          </div>
          <div className={mobile.nudgeRow}>
            <span className={mobile.nudgeHint}>{view === "elevation" ? `Move / height ${NUDGE_MM}mm` : `Nudge ${NUDGE_MM}mm`}</span>
            <button type="button" className={mobile.nudgeBtn} onClick={() => nudge("left")} aria-label="Left">◀</button>
            <button type="button" className={mobile.nudgeBtn} onClick={() => nudge("up")} aria-label="Up">▲</button>
            <button type="button" className={mobile.nudgeBtn} onClick={() => nudge("down")} aria-label="Down">▼</button>
            <button type="button" className={mobile.nudgeBtn} onClick={() => nudge("right")} aria-label="Right">▶</button>
          </div>
        </div>
      )}

      {/* ---- Price strip (hidden in fullscreen) ---- */}
      {priceItems.length > 0 && !fullscreen && (
        <button type="button" className={mobile.priceStrip} onClick={() => setOpenModal("price")}>
          <span>
            <span className={mobile.priceStripLabel}>Room material cost (ex GST)</span><br />
            <span className={mobile.priceStripValue}>{formatMoney(roomTotal)}</span>
          </span>
          <span className={mobile.priceStripCta}>View price →</span>
        </button>
      )}

      {/* ---- Bottom action bar (hidden in fullscreen) ---- */}
      {!fullscreen && (
      <div className={mobile.bottomBar}>
        <button type="button" className={mobile.actionBtn} onClick={openRooms}>
          <span className={mobile.actionBtnIcon}>▦</span>
          Rooms
        </button>
        <button
          type="button"
          className={`${mobile.actionBtn} ${mobile.actionBtnPrimary}`}
          onClick={openAdd}
          disabled={!selectedRoom}
        >
          <span className={mobile.actionBtnIcon}>＋</span>
          Add item
        </button>
        <button
          type="button"
          className={mobile.actionBtn}
          onClick={() => setOpenModal("price")}
          disabled={priceItems.length === 0}
        >
          <span className={mobile.actionBtnIcon}>$</span>
          Price
        </button>
      </div>
      )}

      {/* ---- Modals ---- */}
      {openModal === "rooms" && (
        <RoomsModal
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={(id) => { setSelectedRoomId(id); setSelectedItemId(null); setView("plan"); }}
          onAddRoom={handleAddRoom}
          onUpdateRoom={handleUpdateRoom}
          onDeleteRoom={handleDeleteRoom}
          onClose={() => setOpenModal(null)}
        />
      )}

      {openModal === "item" && selectedRoom && (
        <CabinetModal
          item={isAddingItem ? null : selectedItem}
          roomItems={roomItems}
          room={selectedRoom}
          materialDefaults={project?.material_defaults}
          isAddingItem={isAddingItem}
          onAdd={onAddItem}
          onCancelAdd={closeItemModal}
          onItemChange={handleItemChange}
          onDeleteItem={(id) => { handleDeleteItem(id); closeItemModal(); }}
          onSelectItem={(id) => setSelectedItemId(id)}
          onClose={closeItemModal}
        />
      )}

      {openModal === "price" && priceItems.length > 0 && (
        <RoomPriceModal
          items={priceItems}
          roomItems={roomItems}
          room={selectedRoom}
          excludedByItem={excludedByItem}
          onExcludedChange={setExcludedByItem}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  );
}
