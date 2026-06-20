"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import RoomPlanner from "./RoomPlanner";
import styles from "./planner-overlay.module.css";

function formatDims(room) {
  return [
    room.width_mm ? `W ${room.width_mm}mm` : null,
    room.depth_mm ? `D ${room.depth_mm}mm` : null,
    room.height_mm ? `H ${room.height_mm}mm` : null,
  ].filter(Boolean).join(" × ");
}

export default function PlannerOverlay({ room, quoteId, quoteLineItems, onClose, onSaved }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleCabinetAdd(roomId, payload) {
    const res = await fetch(`/api/admin/quotes/${quoteId}/rooms/${roomId}/cabinets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Could not add cabinet.");
    return data.cabinet;
  }

  async function handleCabinetUpdate(roomId, cabinetId, payload) {
    const res = await fetch(`/api/admin/quotes/${quoteId}/rooms/${roomId}/cabinets/${cabinetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Could not update cabinet.");
    return data.cabinet;
  }

  async function handleCabinetDelete(roomId, cabinetId) {
    const res = await fetch(`/api/admin/quotes/${quoteId}/rooms/${roomId}/cabinets/${cabinetId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Could not delete cabinet.");
  }

  const dims = formatDims(room);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Room planner — ${room.name}`}
      >
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <span className={styles.roomName}>{room.name}</span>
            {dims && <span className={styles.roomDims}>{dims}</span>}
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.saveButton} onClick={onSaved}>
              Save &amp; Close
            </button>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close planner">
              ✕
            </button>
          </div>
        </div>
        <div className={styles.body}>
          <RoomPlanner
            quoteId={quoteId}
            rooms={[room]}
            quoteLineItems={quoteLineItems}
            onCabinetAdd={handleCabinetAdd}
            onCabinetUpdate={handleCabinetUpdate}
            onCabinetDelete={handleCabinetDelete}
          />
        </div>
      </div>
    </>,
    document.body
  );
}
