"use client";

import { useState } from "react";
import styles from "./room-manager.module.css";

function emptyDraft() {
  return { name: "", width_mm: "", depth_mm: "", height_mm: "" };
}

function draftFromRoom(room) {
  return {
    name:      room.name      || "",
    width_mm:  String(room.width_mm  || ""),
    depth_mm:  String(room.depth_mm  || ""),
    height_mm: String(room.height_mm || ""),
  };
}

function formatDims(room) {
  const parts = [room.width_mm, room.depth_mm, room.height_mm].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(" × ") + "mm";
}

function DimFields({ draft, onChange }) {
  return (
    <>
      <label className={`${styles.formField} ${styles.formFieldDim}`}>
        Width mm
        <input
          className={styles.fieldInput}
          type="number"
          min="1"
          placeholder="3000"
          value={draft.width_mm}
          onChange={(e) => onChange("width_mm", e.target.value)}
        />
      </label>
      <label className={`${styles.formField} ${styles.formFieldDim}`}>
        Depth mm
        <input
          className={styles.fieldInput}
          type="number"
          min="1"
          placeholder="3000"
          value={draft.depth_mm}
          onChange={(e) => onChange("depth_mm", e.target.value)}
        />
      </label>
      <label className={`${styles.formField} ${styles.formFieldDim}`}>
        Height mm
        <input
          className={styles.fieldInput}
          type="number"
          min="1"
          placeholder="2400"
          value={draft.height_mm}
          onChange={(e) => onChange("height_mm", e.target.value)}
        />
      </label>
    </>
  );
}

function draftToPayload(draft) {
  return {
    name:      draft.name.trim(),
    width_mm:  parseInt(draft.width_mm)  || null,
    depth_mm:  parseInt(draft.depth_mm)  || null,
    height_mm: parseInt(draft.height_mm) || null,
  };
}

export default function RoomManager({ quoteId, rooms, onRoomAdd, onRoomUpdate, onRoomDelete, onOpenPlanner }) {
  const [isAddingRoom,  setIsAddingRoom]  = useState(false);
  const [addDraft,      setAddDraft]      = useState(emptyDraft());
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [editDraft,     setEditDraft]     = useState({});
  const [isBusy,        setIsBusy]        = useState(false);
  const [addFeedback,   setAddFeedback]   = useState("");
  const [editFeedback,  setEditFeedback]  = useState("");

  // ---- Add ----
  function openAdd() {
    setIsAddingRoom(true);
    setAddDraft(emptyDraft());
    setAddFeedback("");
    setEditingRoomId(null);
    setEditFeedback("");
  }

  function cancelAdd() {
    setIsAddingRoom(false);
    setAddFeedback("");
  }

  async function handleAdd() {
    if (!addDraft.name.trim()) { setAddFeedback("Room name is required."); return; }
    setIsBusy(true); setAddFeedback("");
    try {
      const res  = await fetch(`/api/admin/quotes/${quoteId}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(addDraft)),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not add room.");
      onRoomAdd(data.room);
      setIsAddingRoom(false);
      setAddDraft(emptyDraft());
    } catch (err) {
      setAddFeedback(err?.message || "Could not add room.");
    } finally {
      setIsBusy(false);
    }
  }

  // ---- Edit ----
  function openEdit(room) {
    setEditingRoomId(room.id);
    setEditDraft(draftFromRoom(room));
    setEditFeedback("");
    setIsAddingRoom(false);
    setAddFeedback("");
  }

  function cancelEdit() {
    setEditingRoomId(null);
    setEditFeedback("");
  }

  async function handleUpdate() {
    if (!editDraft.name.trim()) { setEditFeedback("Room name is required."); return; }
    setIsBusy(true); setEditFeedback("");
    try {
      const res  = await fetch(`/api/admin/quotes/${quoteId}/rooms/${editingRoomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(editDraft)),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not update room.");
      onRoomUpdate(data.room);
      setEditingRoomId(null);
    } catch (err) {
      setEditFeedback(err?.message || "Could not update room.");
    } finally {
      setIsBusy(false);
    }
  }

  // ---- Delete ----
  async function handleDelete(room) {
    if (!window.confirm(`Delete room "${room.name}"?\n\nAll cabinets in this room will also be removed.`)) return;
    setIsBusy(true);
    try {
      const res  = await fetch(`/api/admin/quotes/${quoteId}/rooms/${room.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not delete room.");
      onRoomDelete(room.id);
      if (editingRoomId === room.id) setEditingRoomId(null);
    } catch (err) {
      setEditFeedback(err?.message || "Could not delete room.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className={styles.roomManager}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <h3 className={styles.heading}>Rooms</h3>
          {rooms.length > 0 && (
            <span className={styles.roomCount}>{rooms.length}</span>
          )}
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={openAdd}
          disabled={isAddingRoom}
        >
          + Add room
        </button>
      </div>

      {/* Add form */}
      {isAddingRoom && (
        <div
          className={styles.inlineForm}
          onKeyDown={(e) => { if (e.key === "Enter" && !isBusy) handleAdd(); }}
        >
          <label className={`${styles.formField} ${styles.formFieldName}`}>
            Name
            <input
              className={styles.fieldInput}
              placeholder="e.g. Kitchen"
              value={addDraft.name}
              onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
            />
          </label>
          <DimFields
            draft={addDraft}
            onChange={(key, val) => setAddDraft((d) => ({ ...d, [key]: val }))}
          />
          <div className={styles.formActions}>
            <button type="button" className={styles.primaryButton} onClick={handleAdd} disabled={isBusy}>
              {isBusy ? "Adding…" : "Add"}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={cancelAdd} disabled={isBusy}>
              Cancel
            </button>
          </div>
          {addFeedback && <p className={styles.formFeedback}>{addFeedback}</p>}
        </div>
      )}

      {/* Room list */}
      {rooms.length === 0 && !isAddingRoom ? (
        <p className={styles.emptyState}>No rooms yet — add a room to start planning cabinet placements.</p>
      ) : (
        <ul className={styles.roomList}>
          {rooms.map((room) =>
            editingRoomId === room.id ? (
              /* Inline edit form */
              <li key={room.id}>
                <div
                  className={styles.inlineForm}
                  onKeyDown={(e) => { if (e.key === "Enter" && !isBusy) handleUpdate(); }}
                >
                  <label className={`${styles.formField} ${styles.formFieldName}`}>
                    Name
                    <input
                      className={styles.fieldInput}
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      autoFocus
                    />
                  </label>
                  <DimFields
                    draft={editDraft}
                    onChange={(key, val) => setEditDraft((d) => ({ ...d, [key]: val }))}
                  />
                  <div className={styles.formActions}>
                    <button type="button" className={styles.primaryButton} onClick={handleUpdate} disabled={isBusy}>
                      {isBusy ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={cancelEdit} disabled={isBusy}>
                      Cancel
                    </button>
                  </div>
                  {editFeedback && <p className={styles.formFeedback}>{editFeedback}</p>}
                </div>
              </li>
            ) : (
              /* Room row */
              <li key={room.id} className={styles.roomRow}>
                <div className={styles.roomInfo}>
                  <div className={styles.roomName}>{room.name}</div>
                  {formatDims(room) && (
                    <div className={styles.roomDims}>{formatDims(room)}</div>
                  )}
                </div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnEdit}`}
                    onClick={() => openEdit(room)}
                    disabled={isBusy}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                    onClick={() => handleDelete(room)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnPlanner}`}
                    onClick={() => onOpenPlanner?.(room)}
                    disabled={isBusy}
                  >
                    Open Planner
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
