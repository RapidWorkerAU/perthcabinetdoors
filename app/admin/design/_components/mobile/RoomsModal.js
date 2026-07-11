"use client";

import { useState } from "react";
import styles from "../../design.mobile.module.css";
import MobileModal from "./MobileModal";

/**
 * Mobile room manager. Calls the same hook handlers as the desktop left panel
 * (onAddRoom / onUpdateRoom / onDeleteRoom / onSelectRoom), so multiple rooms
 * per project work exactly as on desktop — only the layout is mobile-specific.
 */
export default function RoomsModal({
  rooms,
  selectedRoomId,
  onSelectRoom,
  onAddRoom,
  onUpdateRoom,
  onDeleteRoom,
  onClose,
}) {
  const selected = rooms.find((r) => r.id === selectedRoomId) || null;

  const [draft, setDraft] = useState(() => ({
    name:      selected?.name      ?? "",
    width_mm:  selected?.width_mm  ?? 4000,
    depth_mm:  selected?.depth_mm  ?? 3000,
    height_mm: selected?.height_mm ?? 2400,
  }));
  const [newRoomName, setNewRoomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function loadDraft(room) {
    setDraft({
      name:      room?.name      ?? "",
      width_mm:  room?.width_mm  ?? 4000,
      depth_mm:  room?.depth_mm  ?? 3000,
      height_mm: room?.height_mm ?? 2400,
    });
    setConfirmDelete(false);
  }

  function selectRoom(id) {
    onSelectRoom(id);
    loadDraft(rooms.find((r) => r.id === id));
  }

  async function saveDimensions() {
    if (!selected) return;
    setBusy(true);
    try {
      await onUpdateRoom(selected.id, {
        name:      draft.name?.trim() || undefined,
        width_mm:  draft.width_mm  ? Number(draft.width_mm)  : null,
        depth_mm:  draft.depth_mm  ? Number(draft.depth_mm)  : null,
        height_mm: draft.height_mm ? Number(draft.height_mm) : null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function addRoom() {
    const name = newRoomName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const room = await onAddRoom(name);
      setNewRoomName("");
      if (room) loadDraft(room);
    } catch { /* swallow — surfaced by hook */ }
    finally { setBusy(false); }
  }

  function deleteRoom() {
    if (!selected) return;
    if (confirmDelete) {
      onDeleteRoom(selected.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  }

  return (
    <MobileModal title="Rooms" onClose={onClose}>
      <div className={styles.modalBodyPad}>
        <div className={styles.roomList}>
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              className={`${styles.roomRow} ${room.id === selectedRoomId ? styles.roomRowActive : ""}`}
              onClick={() => selectRoom(room.id)}
            >
              <span className={styles.roomRowMain}>
                <span className={styles.roomRowName}>{room.name || "Untitled room"}</span>
                <span className={styles.roomRowDims}>
                  {(room.width_mm ?? 4000)} × {(room.depth_mm ?? 3000)} mm · {(room.height_mm ?? 2400)}mm high
                </span>
              </span>
              {room.id === selectedRoomId && <span className={styles.roomRowCheck}>✓</span>}
            </button>
          ))}
          {rooms.length === 0 && (
            <p className={styles.roomRowDims}>No rooms yet — add one below to start.</p>
          )}
        </div>

        <div className={styles.field}>
          <input
            className={styles.input}
            placeholder="New room name (e.g. Kitchen)"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
          />
        </div>
        <button type="button" className={styles.addRoomBtn} onClick={addRoom} disabled={busy || !newRoomName.trim()}>
          + Add room
        </button>

        {selected && (
          <>
            <p className={styles.sectionLabel}>Room dimensions</p>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Name</label>
              <input
                className={styles.input}
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Width mm</label>
                <input className={styles.input} type="number" inputMode="numeric" min="1"
                  value={draft.width_mm}
                  onChange={(e) => setDraft((d) => ({ ...d, width_mm: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Depth mm</label>
                <input className={styles.input} type="number" inputMode="numeric" min="1"
                  value={draft.depth_mm}
                  onChange={(e) => setDraft((d) => ({ ...d, depth_mm: e.target.value }))} />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Ceiling height mm</label>
              <input className={styles.input} type="number" inputMode="numeric" min="1"
                value={draft.height_mm}
                onChange={(e) => setDraft((d) => ({ ...d, height_mm: e.target.value }))} />
            </div>
            <button type="button" className={styles.primaryBtn} onClick={saveDimensions} disabled={busy}>
              {busy ? "Saving…" : "Save dimensions"}
            </button>

            <p className={styles.sectionLabel}>Danger zone</p>
            <button type="button" className={styles.dangerBtn} onClick={deleteRoom}>
              {confirmDelete ? "Tap again to confirm delete" : "Delete this room"}
            </button>
          </>
        )}
      </div>
    </MobileModal>
  );
}
