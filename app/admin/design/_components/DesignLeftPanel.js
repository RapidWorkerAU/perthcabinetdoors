"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import styles from "../design.module.css";

const ITEM_COLORS = {
  base_cabinet:  "#3b82f6",
  wall_cabinet:  "#22c55e",
  tall_cabinet:  "#f97316",
  door:          "#a855f7",
  drawer_front:  "#8b5cf6",
  panel:         "#6b7280",
};

const TYPE_SHORT = {
  base_cabinet:  "base",
  wall_cabinet:  "wall",
  tall_cabinet:  "tall",
  door:          "door",
  drawer_front:  "drwr",
  panel:         "panel",
};

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet"];

// Returns position along the wall axis for adjacency detection.
// For left/right walls: old format stores position in x_mm; new format in y_mm.
function getWallAxisPos(item) {
  if (item.wall === "left" || item.wall === "right") {
    const x = item.x_mm || 0;
    const y = item.y_mm || 0;
    return (x > 0 && !y) ? x : y;
  }
  return item.x_mm || 0;
}

// Finds the continuous kickboard run that `item` belongs to across allItems.
// Returns { firstItemId, totalWidth, count } — only the first item in a run
// should output a kickboard cut, preventing double-counting.
function computeKickboardRun(item, allItems) {
  const ADJACENCY_TOLERANCE = 5; // mm gap tolerance for "touching"

  const candidates = allItems
    .filter((i) =>
      i.room_id === item.room_id &&
      i.wall === item.wall &&
      i.has_kickboard &&
      (i.kickboard_span || "continuous") === "continuous"
    )
    .sort((a, b) => getWallAxisPos(a) - getWallAxisPos(b));

  if (!candidates.length) {
    return { firstItemId: item.id, totalWidth: item.width_mm || 600, count: 1 };
  }

  const runs = [];
  let currentRun = [candidates[0]];
  for (let i = 1; i < candidates.length; i++) {
    const prev  = currentRun[currentRun.length - 1];
    const curr  = candidates[i];
    const prevEnd   = getWallAxisPos(prev) + (prev.width_mm || 600);
    const currStart = getWallAxisPos(curr);
    if (currStart <= prevEnd + ADJACENCY_TOLERANCE) {
      currentRun.push(curr);
    } else {
      runs.push([...currentRun]);
      currentRun = [curr];
    }
  }
  runs.push(currentRun);

  const myRun = runs.find((run) => run.some((i) => i.id === item.id));
  if (!myRun) return { firstItemId: item.id, totalWidth: item.width_mm || 600, count: 1 };

  return {
    firstItemId: myRun[0].id,
    totalWidth:  myRun.reduce((sum, i) => sum + (i.width_mm || 600), 0),
    count:       myRun.length,
  };
}

/**
 * Computes the board cut list for a cabinet item.
 * Standard box construction:
 *   - Left/right sides run full height and full depth
 *   - Top/bottom span between the sides (W − 2×T)
 *   - Back fits between the sides, full height (W − 2×T) × H
 *   - Shelves span between sides, set back 20mm from front
 *   - Kickboard: continuous runs show once (on run's first cabinet); individual shows per cabinet
 */
function computeCutList(item, allItems = []) {
  const W  = Number(item.width_mm)            || 0;
  const H  = Number(item.height_mm)           || 0;
  const D  = Number(item.depth_mm)            || 0;
  const T  = Number(item.carcass_thickness_mm) || 16;
  const BT = item.back_panel_included !== false
    ? (Number(item.back_panel_thickness_mm) || 16)
    : 0;
  const shelfQty = Number(item.shelf_qty) || 0;

  if (!W || !H || !D) return [];

  const innerW = W - 2 * T;
  const SHELF_SETBACK = 20;

  const parts = [];

  parts.push({ name: "Left Side",  dim1: H, axis1: "H", dim2: D, axis2: "D" });
  parts.push({ name: "Right Side", dim1: H, axis1: "H", dim2: D, axis2: "D" });
  parts.push({ name: "Top",    dim1: innerW, axis1: "W", dim2: D, axis2: "D" });
  parts.push({ name: "Bottom", dim1: innerW, axis1: "W", dim2: D, axis2: "D" });

  if (BT > 0) {
    parts.push({ name: "Back Panel", dim1: innerW, axis1: "W", dim2: H, axis2: "H", material: "back" });
  }

  for (let i = 0; i < shelfQty; i++) {
    const name = shelfQty === 1 ? "Shelf" : `Shelf ${i + 1}`;
    parts.push({ name, dim1: innerW, axis1: "W", dim2: D - SHELF_SETBACK, axis2: "D", material: "shelf" });
  }

  // Kickboard / plinth — not applicable to wall cabinets (they're not on the floor)
  if (item.has_kickboard && item.item_type !== "wall_cabinet") {
    const kH    = Number(item.kickboard_height_mm) || 150;
    const kSpan = item.kickboard_span || "continuous";

    if (kSpan === "continuous") {
      const run = computeKickboardRun(item, allItems);
      if (run.count <= 1) {
        // Single-cabinet continuous kickboard — stays in this cabinet's cut list
        parts.push({ name: "Kickboard", dim1: W, axis1: "W", dim2: kH, axis2: "H", material: "kickboard" });
      }
      // Multi-cabinet runs are shown as their own top-level line items — omit here entirely
    } else {
      // Individual span — always stays in this cabinet's cut list
      parts.push({ name: "Kickboard", dim1: W, axis1: "W", dim2: kH, axis2: "H", material: "kickboard" });
    }
  }

  return parts;
}

// Returns all continuous kickboard runs with 2+ cabinets for a given list of room items.
// Single-cabinet continuous or individual kickboards are NOT returned here.
function computeAllKickboardRuns(roomItems) {
  const ADJACENCY_TOLERANCE = 5;

  const kbItems = roomItems.filter((i) =>
    i.has_kickboard &&
    (i.kickboard_span || "continuous") === "continuous" &&
    i.item_type !== "wall_cabinet"
  );
  if (!kbItems.length) return [];

  const byWall = {};
  for (const item of kbItems) {
    const w = item.wall || "top";
    if (!byWall[w]) byWall[w] = [];
    byWall[w].push(item);
  }

  const allRuns = [];
  for (const [wall, wallItems] of Object.entries(byWall)) {
    const sorted = [...wallItems].sort((a, b) => getWallAxisPos(a) - getWallAxisPos(b));
    let currentRun = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev      = currentRun[currentRun.length - 1];
      const curr      = sorted[i];
      const prevEnd   = getWallAxisPos(prev) + (prev.width_mm || 600);
      const currStart = getWallAxisPos(curr);
      if (currStart <= prevEnd + ADJACENCY_TOLERANCE) {
        currentRun.push(curr);
      } else {
        if (currentRun.length >= 2) allRuns.push({ wall, items: [...currentRun] });
        currentRun = [curr];
      }
    }
    if (currentRun.length >= 2) allRuns.push({ wall, items: currentRun });
  }
  return allRuns;
}

const MAT_DOT_COLOR = {
  shelf:     "#3b82f6",
  back:      "#6b7280",
  kickboard: "#f59e0b",
};

function CutListRow({ part }) {
  const dotColor = MAT_DOT_COLOR[part.material] || null;
  return (
    <div className={styles.cutListRow}>
      {dotColor && <span className={styles.cutListMatDot} style={{ background: dotColor }} />}
      <span className={styles.cutListDim}>
        {part.dim1} <span className={styles.cutListAxis}>({part.axis1})</span>
        {" × "}
        {part.dim2} <span className={styles.cutListAxis}>({part.axis2})</span>
      </span>
      <span className={styles.cutListName}>{part.name}</span>
    </div>
  );
}

const WALL_SHORT = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };

function KickboardRunItem({ run, runId, openItems, toggleItem }) {
  const isExpanded = openItems.has(runId);
  const totalWidth = run.items.reduce((sum, i) => sum + (i.width_mm || 600), 0);
  const kHeight    = run.items[0]?.kickboard_height_mm || 150;

  return (
    <div className={styles.leftItemBlock}>
      <div className={styles.leftItemRow}>
        <span className={styles.leftItemDot} style={{ background: "#f59e0b" }} />
        <span className={styles.leftItemLabel}>
          Kickboard {WALL_SHORT[run.wall] || run.wall}
        </span>
        <span className={styles.leftItemType} style={{ color: "#f59e0b" }}>run</span>
        <button
          type="button"
          className={`${styles.leftItemExpand} ${isExpanded ? styles.leftItemExpandOpen : ""}`}
          onClick={(e) => toggleItem(runId, e)}
          title={isExpanded ? "Collapse" : "Show cabinets in this run"}
        >
          ›
        </button>
      </div>
      {isExpanded && (
        <div className={styles.cutList}>
          {run.items.map((item) => (
            <div key={item.id} className={styles.cutListRow}>
              <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
              <span className={styles.cutListDim}>
                {item.width_mm || 600} <span className={styles.cutListAxis}>(W)</span>
              </span>
              <span className={styles.cutListName}>{item.label || item.item_type}</span>
            </div>
          ))}
          <div className={styles.cutListRow} style={{ marginTop: 5, borderTop: "1px solid rgba(245,158,11,0.2)", paddingTop: 5 }}>
            <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
            <span className={styles.cutListDim} style={{ color: "rgba(245,158,11,0.9)" }}>
              {totalWidth} <span className={styles.cutListAxis}>(W)</span>
              {" × "}
              {kHeight} <span className={styles.cutListAxis}>(H)</span>
            </span>
            <span className={styles.cutListName}>Total cut</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DesignLeftPanel({
  project,
  rooms,
  items,
  selectedRoomId,
  selectedItemId,
  onSelectRoom,
  onSelectItem,
  onAddRoom,
  onUpdateRoom,
  onDeleteRoom,
  onDeleteItem,
  onOpenImport,
  onAddCabinet,
}) {
  const [openRooms, setOpenRooms]         = useState(() => rooms.map((r) => r.id));
  const [openItems, setOpenItems]         = useState(new Set());
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [roomDraft, setRoomDraft]         = useState({});
  const [addingRoom, setAddingRoom]       = useState(false);
  const [newRoomName, setNewRoomName]     = useState("");
  const [roomBusy, setRoomBusy]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: "room"|"item", id }
  const confirmTimerRef                   = useRef(null);

  function toggleRoom(id) {
    setOpenRooms((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleItem(id, e) {
    e.stopPropagation();
    setOpenItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function startEditRoom(e, room) {
    e.stopPropagation();
    setEditingRoomId(room.id);
    setRoomDraft({
      name:      room.name      || "",
      width_mm:  room.width_mm  ?? 4000,
      depth_mm:  room.depth_mm  ?? 3000,
      height_mm: room.height_mm ?? 2400,
    });
  }

  function cancelEditRoom(e) {
    e?.stopPropagation();
    setEditingRoomId(null);
    setRoomDraft({});
  }

  function requestDelete(type, id, e) {
    e?.stopPropagation();
    clearTimeout(confirmTimerRef.current);
    if (confirmDelete?.type === type && confirmDelete?.id === id) {
      // Second click — execute
      setConfirmDelete(null);
      if (type === "room") onDeleteRoom(id);
      else onDeleteItem?.(id);
    } else {
      setConfirmDelete({ type, id });
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(null), 3000);
    }
  }

  async function saveRoomDimensions(roomId) {
    await onUpdateRoom(roomId, {
      name:      roomDraft.name?.trim() || undefined,
      width_mm:  roomDraft.width_mm  ? Number(roomDraft.width_mm)  : null,
      depth_mm:  roomDraft.depth_mm  ? Number(roomDraft.depth_mm)  : null,
      height_mm: roomDraft.height_mm ? Number(roomDraft.height_mm) : null,
    });
    setEditingRoomId(null);
    setRoomDraft({});
  }

  async function handleAddRoom() {
    if (!newRoomName.trim()) return;
    setRoomBusy(true);
    try {
      const room = await onAddRoom(newRoomName.trim());
      if (room?.id) setOpenRooms((prev) => [...prev, room.id]);
      setNewRoomName("");
      setAddingRoom(false);
    } catch { /* swallow */ }
    finally { setRoomBusy(false); }
  }

  function renderItem(item, roomId) {
    const isCabinet  = CABINET_TYPES.includes(item.item_type);
    const isSelected = item.id === selectedItemId;
    const isExpanded = openItems.has(item.id);
    const cutList    = isCabinet && isExpanded ? computeCutList(item, items) : [];

    return (
      <div key={item.id} className={styles.leftItemBlock}>
        {/* Item header row */}
        <div
          className={`${styles.leftItemRow} ${isSelected ? styles.leftItemRowSelected : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => { if (roomId) onSelectRoom(roomId); onSelectItem(item.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { if (roomId) onSelectRoom(roomId); onSelectItem(item.id); } }}
        >
          <span
            className={styles.leftItemDot}
            style={{ background: ITEM_COLORS[item.item_type] || "#888" }}
          />
          <span className={styles.leftItemLabel}>
            {item.label || item.item_type}
            {item.qty > 1 && <span className={styles.leftItemQty}> ×{item.qty}</span>}
          </span>
          <span className={styles.leftItemType}>{TYPE_SHORT[item.item_type] || item.item_type}</span>
          {isCabinet && (
            <button
              type="button"
              className={`${styles.leftItemExpand} ${isExpanded ? styles.leftItemExpandOpen : ""}`}
              onClick={(e) => toggleItem(item.id, e)}
              title={isExpanded ? "Collapse cut list" : "Expand cut list"}
            >
              ›
            </button>
          )}
        </div>

        {/* Cut list + delete */}
        {isExpanded && (
          <div className={styles.cutList}>
            {cutList.length > 0 ? (
              cutList.map((part, i) => <CutListRow key={i} part={part} />)
            ) : (
              <p className={styles.cutListEmpty}>Set dimensions to see cut list</p>
            )}
            <button
              type="button"
              className={`${styles.itemDeleteBtn} ${confirmDelete?.type === "item" && confirmDelete?.id === item.id ? styles.itemDeleteBtnConfirm : ""}`}
              onClick={(e) => requestDelete("item", item.id, e)}
            >
              {confirmDelete?.type === "item" && confirmDelete?.id === item.id ? "Confirm delete?" : "Delete item"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.leftPanel}>
      {/* Header */}
      <div className={styles.leftHeader}>
        <div className={styles.leftHeaderTop}>
          <Link href="/admin/design" className={styles.backLink}>
            ← All projects
          </Link>
        </div>
        <p className={styles.projectName}>{project?.name || "Design Tool"}</p>
        <button
          type="button"
          className={styles.importBtn}
          onClick={onOpenImport}
        >
          Import to Quote
        </button>
      </div>

      {/* Room list */}
      <div className={styles.leftScroll}>
        {rooms.map((room) => {
          const roomItems = items.filter((i) => i.room_id === room.id);
          const isOpen    = openRooms.includes(room.id);
          const isActive  = room.id === selectedRoomId;

          const isEditing = editingRoomId === room.id;

          return (
            <div key={room.id} className={styles.roomSection}>
              <div
                className={`${styles.roomSectionHeader} ${isActive ? styles.roomSectionHeaderActive : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => { onSelectRoom(room.id); toggleRoom(room.id); }}
                onKeyDown={(e) => { if (e.key === "Enter") { onSelectRoom(room.id); toggleRoom(room.id); } }}
              >
                <span className={`${styles.roomSectionChevron} ${isOpen ? styles.roomSectionChevronOpen : ""}`} />
                <span className={styles.roomSectionName}>{room.name}</span>
                <span className={styles.roomSectionCount}>{roomItems.length}</span>
                <button
                  type="button"
                  className={styles.roomEditBtn}
                  onClick={(e) => isEditing ? cancelEditRoom(e) : startEditRoom(e, room)}
                  title={isEditing ? "Cancel edit" : "Edit room dimensions"}
                >
                  {isEditing ? "✕" : "✎"}
                </button>
                <button
                  type="button"
                  className={`${styles.roomDeleteBtn} ${confirmDelete?.type === "room" && confirmDelete?.id === room.id ? styles.roomDeleteBtnConfirm : ""}`}
                  onClick={(e) => requestDelete("room", room.id, e)}
                  title={confirmDelete?.type === "room" && confirmDelete?.id === room.id ? "Click again to confirm delete" : "Delete room"}
                >
                  {confirmDelete?.type === "room" && confirmDelete?.id === room.id ? "Sure?" : "✕"}
                </button>
              </div>

              {/* Inline room editor */}
              {isEditing && (
                <div className={styles.roomDimEditor} onClick={(e) => e.stopPropagation()}>
                  <label className={styles.roomDimLabel} style={{ marginBottom: 6 }}>
                    Room name
                    <input
                      className={styles.roomDimInput}
                      type="text"
                      placeholder="e.g. Kitchen"
                      value={roomDraft.name}
                      onChange={(e) => setRoomDraft((d) => ({ ...d, name: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRoomDimensions(room.id); if (e.key === "Escape") cancelEditRoom(); }}
                      autoFocus
                    />
                  </label>
                  <div className={styles.roomDimRow}>
                    <label className={styles.roomDimLabel}>
                      Width
                      <input
                        className={styles.roomDimInput}
                        type="number"
                        min="1"
                        placeholder="mm"
                        value={roomDraft.width_mm}
                        onChange={(e) => setRoomDraft((d) => ({ ...d, width_mm: e.target.value }))}
                      />
                    </label>
                    <label className={styles.roomDimLabel}>
                      Depth
                      <input
                        className={styles.roomDimInput}
                        type="number"
                        min="1"
                        placeholder="mm"
                        value={roomDraft.depth_mm}
                        onChange={(e) => setRoomDraft((d) => ({ ...d, depth_mm: e.target.value }))}
                      />
                    </label>
                    <label className={styles.roomDimLabel}>
                      Height
                      <input
                        className={styles.roomDimInput}
                        type="number"
                        min="1"
                        placeholder="mm"
                        value={roomDraft.height_mm}
                        onChange={(e) => setRoomDraft((d) => ({ ...d, height_mm: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className={styles.roomDimActions}>
                    <button type="button" className={styles.roomDimSave} onClick={() => saveRoomDimensions(room.id)}>
                      Save
                    </button>
                    <button type="button" className={styles.roomDimCancel} onClick={cancelEditRoom}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isOpen && (
                <>
                  {roomItems.map((item) => renderItem(item, room.id))}
                  {/* Continuous kickboard runs (2+ cabinets) — own line items */}
                  {computeAllKickboardRuns(roomItems).map((run) => {
                    const runId = `kb-${room.id}-${run.wall}-${run.items[0]?.id}`;
                    return (
                      <KickboardRunItem
                        key={runId}
                        run={run}
                        runId={runId}
                        openItems={openItems}
                        toggleItem={toggleItem}
                      />
                    );
                  })}
                  {roomItems.length === 0 && (
                    <p style={{ padding: "6px 16px 6px 32px", fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>
                      No items yet
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}

        {rooms.length === 0 && (
          <p style={{ padding: "16px", fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0, textAlign: "center" }}>
            No rooms yet
          </p>
        )}

        {/* Unassigned items (room_id = null) */}
        {(() => {
          const unassigned = items.filter((i) => !i.room_id);
          if (!unassigned.length) return null;
          return (
            <div className={styles.roomSection}>
              <div className={styles.roomSectionHeader} style={{ cursor: "default" }}>
                <span className={styles.roomSectionName} style={{ color: "rgba(255,180,0,0.7)" }}>Unassigned</span>
                <span className={styles.roomSectionCount}>{unassigned.length}</span>
              </div>
              {unassigned.map((item) => renderItem(item, null))}
            </div>
          );
        })()}
      </div>

      {/* Add cabinet button */}
      <div className={styles.addFreestandingRow}>
        <button
          type="button"
          className={styles.addFreestandingBtn}
          onClick={onAddCabinet}
          disabled={!selectedRoomId}
          title={selectedRoomId ? "Add a cabinet — drag it to set position and wall" : "Select a room first"}
        >
          + Add Cabinet
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
