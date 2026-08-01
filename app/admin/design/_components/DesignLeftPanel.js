"use client";

import { useState, useRef } from "react";
import styles from "../design.module.css";
import { itemDisplayLabel } from "./CutListView";
import { CATALOG, CATEGORIES, Mockup } from "./AddItemModal";
import AddItemRail from "../../../../components/AddItemRail";

// The shared rail wants a `label` on every row; admin cabinet rows get theirs
// from the canonical label map, appliance rows carry their own.
const ADD_CATALOGUE = CATALOG.map((r) => ({ ...r, label: r.label || itemDisplayLabel({ item_type: r.type }) }));
// The rail adds its own "All items" option, so drop the CATALOG's "all" entry.
const ADD_CATEGORIES = CATEGORIES.filter((c) => c.key !== "all");

const ITEM_COLORS = {
  base_cabinet:  "#3b82f6",
  wall_cabinet:  "#22c55e",
  tall_cabinet:  "#f97316",
  corner_base_cabinet: "#0ea5e9",
  corner_tall_cabinet: "#0891b2",
  blind_corner_cabinet: "#06b6d4",
  door:          "#a855f7",
  drawer_front:  "#8b5cf6",
  panel:         "#6b7280",
  scribe:        "#ec4899",
  obstruction:   "#57534e",
  window:        "#38bdf8",
  door_opening:  "#b45309",
  appliance:     "#64748b",
  brick_corner_pantry: "#a0522d",
  floating_shelf: "#eab308",
  bookcase:      "#65a30d",
  shelf_rail:    "#d946ef",
};

// Plural group headings + the order groups appear in the list. Items whose
// type isn't listed here fall to the bottom under a generic "Other" heading.
const GROUP_ORDER = [
  "base_cabinet", "wall_cabinet", "tall_cabinet",
  "corner_base_cabinet", "corner_tall_cabinet", "blind_corner_cabinet",
  "bookcase", "shelf_rail", "floating_shelf", "panel", "scribe",
  "appliance", "window", "door_opening", "obstruction", "brick_corner_pantry",
];
const GROUP_LABELS = {
  base_cabinet:  "Base Cabinets",
  wall_cabinet:  "Wall Cabinets",
  tall_cabinet:  "Tall Cabinets",
  corner_base_cabinet: "Corner Base Cabinets",
  corner_tall_cabinet: "Corner Pantries",
  blind_corner_cabinet: "Blind Corner Cabinets",
  bookcase:      "Bookcases",
  shelf_rail:    "Shelves & Rails",
  floating_shelf: "Floating Shelves",
  panel:         "Panels",
  scribe:        "Scribes",
  appliance:     "Appliances",
  window:        "Windows",
  door_opening:  "Doorways",
  obstruction:   "Obstructions",
  brick_corner_pantry: "Brick Corner Pantries",
};

// Bucket a room's items into ordered type groups for the list.
function groupItems(list) {
  const byType = new Map();
  for (const it of list) {
    if (!byType.has(it.item_type)) byType.set(it.item_type, []);
    byType.get(it.item_type).push(it);
  }
  const groups = [];
  for (const type of GROUP_ORDER) {
    if (byType.has(type)) {
      groups.push({ type, label: GROUP_LABELS[type] || type, items: byType.get(type) });
      byType.delete(type);
    }
  }
  for (const [type, items] of byType) {
    groups.push({ type, label: GROUP_LABELS[type] || "Other", items });
  }
  return groups;
}

const TYPE_SHORT = {
  base_cabinet:  "base",
  wall_cabinet:  "wall",
  tall_cabinet:  "tall",
  corner_base_cabinet: "corner",
  corner_tall_cabinet: "pantry",
  blind_corner_cabinet: "blind",
  door:          "door",
  drawer_front:  "drwr",
  panel:         "panel",
  scribe:        "scribe",
  obstruction:   "obstr.",
  window:        "window",
  door_opening:  "doorway",
  appliance:     "appl.",
  brick_corner_pantry: "brick",
  floating_shelf: "shelf",
  bookcase:      "bookcase",
  shelf_rail:    "shelf+rail",
};

// The left rail is now a clean list of the CURRENT room's items. Room switching
// lives in the top-bar dropdown; a cabinet's cut list opens from the right
// sidebar ("View cut list"); the whole-room cutting list (with shared runs)
// opens from the top-bar "Cut list" button.
export default function DesignLeftPanel({
  rooms,
  items,
  selectedRoomId,
  selectedItemId,
  onSelectRoom,
  onSelectItem,
  onAddRoom,
  onUpdateRoom,
  onDeleteRoom,
  onAddCabinet,
  isAddingItem,
  pickedType,
  onPickType,
  onCancelAdd,
}) {
  const [editingRoom, setEditingRoom]     = useState(false);
  const [roomDraft, setRoomDraft]         = useState({});
  const [addingRoom, setAddingRoom]       = useState(false);
  const [newRoomName, setNewRoomName]     = useState("");
  const [roomBusy, setRoomBusy]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false); // room delete confirm
  const [openGroups, setOpenGroups]       = useState(new Set()); // type groups start collapsed
  const confirmTimerRef                   = useRef(null);

  function toggleGroup(type) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  const currentRoom = rooms.find((r) => r.id === selectedRoomId) || null;
  const roomItems = items.filter((i) => i.room_id === selectedRoomId);
  const unassigned = items.filter((i) => !i.room_id);

  function startEditRoom() {
    if (!currentRoom) return;
    setRoomDraft({
      name:      currentRoom.name      || "",
      width_mm:  currentRoom.width_mm  ?? 4000,
      depth_mm:  currentRoom.depth_mm  ?? 3000,
      height_mm: currentRoom.height_mm ?? 2400,
    });
    setEditingRoom(true);
  }

  function cancelEditRoom() {
    setEditingRoom(false);
    setRoomDraft({});
  }

  async function saveRoomDimensions() {
    if (!currentRoom) return;
    await onUpdateRoom(currentRoom.id, {
      name:      roomDraft.name?.trim() || undefined,
      width_mm:  roomDraft.width_mm  ? Number(roomDraft.width_mm)  : null,
      depth_mm:  roomDraft.depth_mm  ? Number(roomDraft.depth_mm)  : null,
      height_mm: roomDraft.height_mm ? Number(roomDraft.height_mm) : null,
    });
    setEditingRoom(false);
    setRoomDraft({});
  }

  function requestDeleteRoom() {
    if (!currentRoom) return;
    clearTimeout(confirmTimerRef.current);
    if (confirmDelete) {
      setConfirmDelete(false);
      onDeleteRoom(currentRoom.id);
    } else {
      setConfirmDelete(true);
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  async function handleAddRoom() {
    if (!newRoomName.trim()) return;
    setRoomBusy(true);
    try {
      const room = await onAddRoom(newRoomName.trim());
      if (room?.id) onSelectRoom(room.id);
      setNewRoomName("");
      setAddingRoom(false);
    } catch { /* swallow */ }
    finally { setRoomBusy(false); }
  }

  function itemRow(item) {
    const isSelected = item.id === selectedItemId;
    return (
      <div
        key={item.id}
        className={`${styles.leftItemRow} ${isSelected ? styles.leftItemRowSelected : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelectItem(item.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectItem(item.id); }}
      >
        <span className={styles.leftItemDot} style={{ background: ITEM_COLORS[item.item_type] || "#888" }} />
        <span className={styles.leftItemLabel}>
          {itemDisplayLabel(item)}
          {item.qty > 1 && <span className={styles.leftItemQty}> ×{item.qty}</span>}
        </span>
        <span className={styles.leftItemType}>{TYPE_SHORT[item.item_type] || item.item_type}</span>
      </div>
    );
  }

  // While adding, the rail becomes the "Add to this room" catalogue (the same
  // card list the public planner shows) instead of the item list. Picking a
  // card sends the type to the right panel to set its size, then place it.
  if (isAddingItem) {
    return (
      <AddCatalogue
        roomName={currentRoom?.name}
        pickedType={pickedType}
        onPickType={onPickType}
        onCancel={onCancelAdd}
      />
    );
  }

  return (
    <div className={styles.leftPanel}>
      {/* Current-room header — name + edit size + delete. Switching rooms is
          done from the top-bar dropdown. */}
      {currentRoom ? (
        <div className={styles.leftHeader}>
          <div className={styles.leftHeaderTop}>
            <p className={styles.projectName} style={{ margin: 0 }}>{currentRoom.name}</p>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                className={styles.roomEditBtn}
                onClick={() => editingRoom ? cancelEditRoom() : startEditRoom()}
                title={editingRoom ? "Cancel edit" : "Edit room size"}
              >
                {editingRoom ? "✕" : "✎"}
              </button>
              <button
                type="button"
                className={`${styles.roomDeleteBtn} ${confirmDelete ? styles.roomDeleteBtnConfirm : ""}`}
                onClick={requestDeleteRoom}
                title={confirmDelete ? "Click again to confirm delete" : "Delete room"}
              >
                {confirmDelete ? "Sure?" : "✕"}
              </button>
            </div>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            {roomItems.length} item{roomItems.length === 1 ? "" : "s"}
            {currentRoom.width_mm && currentRoom.depth_mm ? ` · ${currentRoom.width_mm} × ${currentRoom.depth_mm} mm` : ""}
          </p>

          {editingRoom && (
            <div className={styles.roomDimEditor} style={{ marginTop: 10 }}>
              <label className={styles.roomDimLabel} style={{ marginBottom: 6 }}>
                Room name
                <input
                  className={styles.roomDimInput}
                  type="text"
                  placeholder="e.g. Kitchen"
                  value={roomDraft.name}
                  onChange={(e) => setRoomDraft((d) => ({ ...d, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") saveRoomDimensions(); if (e.key === "Escape") cancelEditRoom(); }}
                  autoFocus
                />
              </label>
              <div className={styles.roomDimRow}>
                <label className={styles.roomDimLabel}>
                  Width
                  <input className={styles.roomDimInput} type="number" min="1" placeholder="mm" value={roomDraft.width_mm} onChange={(e) => setRoomDraft((d) => ({ ...d, width_mm: e.target.value }))} />
                </label>
                <label className={styles.roomDimLabel}>
                  Depth
                  <input className={styles.roomDimInput} type="number" min="1" placeholder="mm" value={roomDraft.depth_mm} onChange={(e) => setRoomDraft((d) => ({ ...d, depth_mm: e.target.value }))} />
                </label>
                <label className={styles.roomDimLabel}>
                  Height
                  <input className={styles.roomDimInput} type="number" min="1" placeholder="mm" value={roomDraft.height_mm} onChange={(e) => setRoomDraft((d) => ({ ...d, height_mm: e.target.value }))} />
                </label>
              </div>
              <div className={styles.roomDimActions}>
                <button type="button" className={styles.roomDimSave} onClick={saveRoomDimensions}>Save</button>
                <button type="button" className={styles.roomDimCancel} onClick={cancelEditRoom}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.leftHeader}>
          <p className={styles.projectName} style={{ margin: 0 }}>No room selected</p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Add a room below to start.</p>
        </div>
      )}

      {/* Item list for the current room */}
      <div className={styles.leftScroll}>
        {currentRoom && (
          <>
            {groupItems(roomItems).map((g) => {
              const open = openGroups.has(g.type);
              return (
                <div key={g.type}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.type)}
                    style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 16px 4px", margin: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(255,255,255,0.4)", textAlign: "left" }}
                  >
                    <span style={{ display: "inline-block", transition: "transform 150ms ease", transform: open ? "rotate(90deg)" : "rotate(0deg)", color: "rgba(255,255,255,0.35)" }}>›</span>
                    <span style={{ flex: 1 }}>{g.label}</span>
                    <span style={{ color: "rgba(255,255,255,0.25)" }}>{g.items.length}</span>
                  </button>
                  {open && g.items.map((item) => itemRow(item))}
                </div>
              );
            })}
            {roomItems.length === 0 && (
              <p style={{ padding: "12px 16px", fontSize: 11, color: "rgba(255,255,255,0.3)", margin: 0 }}>
                No items yet — use “+ Add Item”.
              </p>
            )}
          </>
        )}

        {/* Orphaned items with no room (rare) — kept visible so they're never lost */}
        {unassigned.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 6 }}>
            <p style={{ padding: "8px 16px 4px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(255,180,0,0.7)", margin: 0 }}>Unassigned</p>
            {unassigned.map((item) => itemRow(item))}
          </div>
        )}
      </div>

      {/* Add item */}
      <div className={styles.addFreestandingRow}>
        <button
          type="button"
          className={styles.addFreestandingBtn}
          onClick={onAddCabinet}
          disabled={!selectedRoomId}
          title={selectedRoomId ? "Add an item — drag it to set position and wall" : "Select a room first"}
        >
          + Add Item
        </button>
      </div>

      {/* Add room */}
      <div className={styles.addRoomRow}>
        {addingRoom ? (
          <div className={styles.addRoomForm}>
            <div className={styles.addRoomInputRow}>
              <input
                className={styles.addRoomInput}
                placeholder="Room name"
                value={newRoomName}
                autoFocus
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !roomBusy) handleAddRoom();
                  if (e.key === "Escape") setAddingRoom(false);
                }}
              />
            </div>
            <div className={styles.addRoomFormBtns}>
              <button type="button" className={styles.addRoomSaveBtn} onClick={handleAddRoom} disabled={roomBusy}>
                {roomBusy ? "Adding…" : "Add"}
              </button>
              <button type="button" className={styles.addRoomCancelBtn} onClick={() => setAddingRoom(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.addRoomBtn} onClick={() => setAddingRoom(true)}>
            + Add Room
          </button>
        )}
      </div>
    </div>
  );
}

// The in-rail "Add an item" catalogue — the shared AddItemRail (dropdown filter
// + scrolling tiles), themed dark for the admin rail. Clicking a tile hands the
// type to the right panel to set dimensions before it's created.
function AddCatalogue({ roomName, pickedType, onPickType, onCancel }) {
  return (
    <div className={styles.leftPanel}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AddItemRail
          theme="dark"
          title="Add an item"
          subtitle={roomName ? `to ${roomName} · then set its size on the right` : "then set its size on the right"}
          catalogue={ADD_CATALOGUE}
          categories={ADD_CATEGORIES}
          renderMockup={(type, kind) => <Mockup type={type} kind={kind} />}
          pickedType={pickedType}
          onPick={onPickType}
          onCancel={onCancel}
        />
      </div>
      <div className={styles.addFreestandingRow}>
        <button type="button" className={styles.addFreestandingBtn} onClick={onCancel}>
          ← Back to items
        </button>
      </div>
    </div>
  );
}
