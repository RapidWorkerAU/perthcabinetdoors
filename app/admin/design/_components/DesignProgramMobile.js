"use client";

import { useState } from "react";
import mobile from "../design.mobile.module.css";
import { calculateCabinetTotals } from "@/lib/pcd-cabinet-utils";
import { formatMoney } from "@/lib/pcd-quote-utils";
import useDesignProgram from "./useDesignProgram";
import DesignCanvas from "./DesignCanvas";
import FrontElevationView from "./FrontElevationView";
import RoomsModal from "./mobile/RoomsModal";
import CabinetModal from "./mobile/CabinetModal";
import CabinetPriceModal from "./mobile/CabinetPriceModal";

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet"];

/**
 * Mobile design shell. Same brain as desktop (useDesignProgram) — a persistent
 * canvas with the two sidebars re-housed as full-screen modals. Restricted to
 * one cabinet per room so the canvas can stay view-only (no touch dragging).
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
    handleItemChange, handleDeleteItem,
  } = d;

  const [openModal, setOpenModal] = useState(null); // 'rooms' | 'cabinet' | 'price'
  const [view, setView] = useState("plan");          // 'plan' | 'elevation'

  // One cabinet per room: the room's cabinet is the sole cabinet-type item.
  const cabinets = roomItems.filter((i) => CABINET_TYPES.includes(i.item_type));
  const cabinet = cabinets[0] || null;
  // A room carrying more than one item was built on desktop — we don't try to
  // represent it as a single cabinet; we show it read-only with a notice.
  const isComplexRoom = roomItems.length > 1;

  function openRooms() { setOpenModal("rooms"); }

  function openCabinet() {
    if (!selectedRoom) return;
    if (cabinet) {
      setSelectedItemId(cabinet.id);
      setIsAddingItem(false);
    } else {
      setSelectedItemId(null);
      setIsAddingItem(true);
    }
    setOpenModal("cabinet");
  }

  function closeCabinet() {
    setIsAddingItem(false);
    setOpenModal(null);
  }

  async function onAddCabinet(draft) {
    const created = await handleAddItem(draft);
    // Stay in the modal — it now shows the edit form for the new cabinet.
    return created;
  }

  // Live price for the strip (material cut-list cost, ex GST).
  let priceLabel = null;
  if (cabinet) {
    const totals = calculateCabinetTotals({ ...cabinet, is_corner: cabinet.item_type === "corner_base_cabinet" });
    priceLabel = formatMoney(totals.calculated_material_cost_ex_gst || 0);
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

  const canElevation = Boolean(cabinet) && !isComplexRoom;

  return (
    <div className={mobile.mobileRoot}>
      {/* ---- Top bar ---- */}
      <div className={mobile.topBar}>
        <div className={mobile.topBarTitles}>
          <span className={mobile.topBarProject}>{project?.name || "Design"}</span>
          <span className={mobile.topBarRoom}>{selectedRoom?.name || "No room"}</span>
        </div>
        <div className={mobile.viewToggle}>
          <button
            type="button"
            className={`${mobile.viewToggleBtn} ${view === "plan" ? mobile.viewToggleBtnActive : ""}`}
            onClick={() => setView("plan")}
          >Plan</button>
          <button
            type="button"
            className={`${mobile.viewToggleBtn} ${view === "elevation" ? mobile.viewToggleBtnActive : ""}`}
            onClick={() => setView("elevation")}
            disabled={!canElevation}
          >Elevation</button>
        </div>
      </div>

      {/* ---- Canvas ---- */}
      <div className={mobile.canvasWrap}>
        {!selectedRoom ? (
          <div className={mobile.emptyState}>
            <span className={mobile.emptyTitle}>No room yet</span>
            <span className={mobile.emptyHint}>Add a room to set your dimensions and start a cabinet.</span>
            <button type="button" className={mobile.primaryBtn} style={{ maxWidth: 200 }} onClick={openRooms}>+ Add room</button>
          </div>
        ) : (
          <>
            {isComplexRoom && (
              <p className={mobile.multiItemNotice}>
                This room has multiple items. Mobile supports one cabinet per room —
                open it on desktop to edit the full layout.
              </p>
            )}
            {view === "elevation" && canElevation ? (
              <FrontElevationView
                interactive={false}
                wall={cabinet.wall || "top"}
                room={selectedRoom}
                items={roomItems}
                onClose={() => setView("plan")}
                onItemChange={handleItemChange}
                onItemSelect={(id) => setSelectedItemId(id)}
              />
            ) : (
              <div className={mobile.planFill}>
                <DesignCanvas
                  interactive={false}
                  room={selectedRoom}
                  items={roomItems}
                  selectedItemId={selectedItemId}
                  overlappingItemIds={new Set()}
                  onItemClick={(it) => setSelectedItemId(it.id)}
                  onDeselect={() => {}}
                  onItemDragEnd={() => {}}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- Price strip ---- */}
      {cabinet && !isComplexRoom && (
        <button type="button" className={mobile.priceStrip} onClick={() => setOpenModal("price")}>
          <span>
            <span className={mobile.priceStripLabel}>Material cost (ex GST)</span><br />
            <span className={mobile.priceStripValue}>{priceLabel}</span>
          </span>
          <span className={mobile.priceStripCta}>View price →</span>
        </button>
      )}

      {/* ---- Bottom action bar ---- */}
      <div className={mobile.bottomBar}>
        <button type="button" className={mobile.actionBtn} onClick={openRooms}>
          <span className={mobile.actionBtnIcon}>▦</span>
          Rooms
        </button>
        <button
          type="button"
          className={`${mobile.actionBtn} ${mobile.actionBtnPrimary}`}
          onClick={openCabinet}
          disabled={!selectedRoom || isComplexRoom}
        >
          <span className={mobile.actionBtnIcon}>▤</span>
          {cabinet ? "Cabinet" : "Add cabinet"}
        </button>
        <button
          type="button"
          className={mobile.actionBtn}
          onClick={() => setOpenModal("price")}
          disabled={!cabinet || isComplexRoom}
        >
          <span className={mobile.actionBtnIcon}>$</span>
          Price
        </button>
      </div>

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

      {openModal === "cabinet" && selectedRoom && (
        <CabinetModal
          item={isAddingItem ? null : cabinet}
          roomItems={roomItems}
          room={selectedRoom}
          materialDefaults={project?.material_defaults}
          isAddingItem={isAddingItem}
          onAdd={onAddCabinet}
          onCancelAdd={closeCabinet}
          onItemChange={handleItemChange}
          onDeleteItem={(id) => { handleDeleteItem(id); closeCabinet(); }}
          onSelectItem={(id) => setSelectedItemId(id)}
          onClose={closeCabinet}
        />
      )}

      {openModal === "price" && cabinet && (
        <CabinetPriceModal item={cabinet} onClose={() => setOpenModal(null)} />
      )}
    </div>
  );
}
