"use client";

import { useEffect, useState } from "react";
import styles from "./elevation-panel.module.css";
import RoomElevation from "./RoomElevation";

const BASE_WALLS = ["top", "bottom", "left", "right"];

const WALL_LABELS = {
  top:    "Top",
  bottom: "Bottom",
  left:   "Left",
  right:  "Right",
  island: "Island",
};

export default function ElevationPanel({ rooms, quoteId, quoteNumber }) {
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id ?? null);
  const [activeWall,      setActiveWall]      = useState("top");

  // Cache: { [roomId]: cabinet[] } — populated once per room, never re-fetched
  const [cabinetsByRoom,  setCabinetsByRoom]  = useState({});
  const [loadingRoomId,   setLoadingRoomId]   = useState(null);
  const [error,           setError]           = useState("");
  const [pdfLoading,      setPdfLoading]      = useState(false);

  // ---- Derived ----
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0] ?? null;

  // null  → not yet fetched
  // array → loaded (may be empty)
  const allCabinets   = selectedRoomId != null
    ? (cabinetsByRoom[selectedRoomId] ?? null)
    : null;

  const hasIsland    = allCabinets?.some((c) => c.wall === "island") ?? false;
  const wallCabinets = allCabinets ? allCabinets.filter((c) => c.wall === activeWall) : [];
  const isLoading    = loadingRoomId === selectedRoomId;

  // ---- Effects ----

  // Keep selectedRoomId valid when the rooms array changes
  useEffect(() => {
    if (!rooms.length) { setSelectedRoomId(null); return; }
    if (!rooms.find((r) => r.id === selectedRoomId)) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  // If the island tab is active but this room has no island cabinets, fall back
  useEffect(() => {
    if (activeWall === "island" && allCabinets !== null && !hasIsland) {
      setActiveWall("top");
    }
  }, [activeWall, allCabinets, hasIsland]);

  // Fetch cabinets for the selected room — skip if already cached
  useEffect(() => {
    if (!selectedRoomId || cabinetsByRoom[selectedRoomId] !== undefined) return;

    setLoadingRoomId(selectedRoomId);
    setError("");

    const roomId = selectedRoomId; // capture for closure

    fetch(`/api/admin/quotes/${quoteId}/rooms/${roomId}/cabinets`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setCabinetsByRoom((prev) => ({ ...prev, [roomId]: data.cabinets || [] }));
        } else {
          setError(data.error || "Could not load cabinets.");
        }
      })
      .catch(() => setError("Could not load cabinets."))
      .finally(() => setLoadingRoomId((id) => (id === roomId ? null : id)));

    // cabinetsByRoom intentionally excluded: we check it inside the guard above.
    // Including it would re-run the effect after each cache write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, quoteId]);

  // ---- Handlers ----

  function handleRoomChange(roomId) {
    setSelectedRoomId(roomId);
    setActiveWall("top");
    setError("");
  }

  async function handleDownloadPdf() {
    setPdfLoading(true);
    setError("");
    try {
      // Ensure cabinets are fetched for every room, not just the one currently viewed
      const allCabs = { ...cabinetsByRoom };
      const uncached = rooms.filter((r) => allCabs[r.id] === undefined);

      if (uncached.length) {
        const results = await Promise.all(
          uncached.map((room) =>
            fetch(`/api/admin/quotes/${quoteId}/rooms/${room.id}/cabinets`, { cache: "no-store" })
              .then((r) => r.json())
              .then((data) => ({ roomId: room.id, cabinets: data.ok ? (data.cabinets || []) : [] }))
              .catch(() => ({ roomId: room.id, cabinets: [] }))
          )
        );
        results.forEach(({ roomId, cabinets }) => {
          allCabs[roomId] = cabinets;
        });
        setCabinetsByRoom(allCabs);
      }

      const res = await fetch(`/api/admin/quotes/${quoteId}/elevation-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms, cabinets: allCabs }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not generate PDF.");
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${quoteNumber || quoteId}-elevations.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not generate PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  // ---- Early exit: no rooms ----
  if (!rooms.length) {
    return (
      <div className={styles.elevationPanel}>
        <p className={styles.emptyRooms}>
          No rooms — add a room in the Room Planner above to view wall elevations.
        </p>
      </div>
    );
  }

  const visibleWalls = hasIsland ? [...BASE_WALLS, "island"] : BASE_WALLS;

  // ---- Render ----
  return (
    <div className={styles.elevationPanel}>

      {/* Header: room selector (multi-room) + Export PDF button */}
      <div className={styles.panelHeader}>
        {rooms.length > 1 ? (
          <>
            <span className={styles.roomSelectLabel}>Room</span>
            <select
              className={styles.roomSelect}
              value={selectedRoomId ?? ""}
              onChange={(e) => handleRoomChange(e.target.value)}
            >
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </>
        ) : (
          <span className={styles.roomSingleName}>{selectedRoom?.name}</span>
        )}
        <button
          type="button"
          className={styles.pdfButton}
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
        >
          {pdfLoading ? "Generating…" : "Export PDF"}
        </button>
      </div>

      {/* Wall tab strip */}
      {selectedRoom && (
        <div className={styles.wallTabs} role="tablist" aria-label="Wall elevation">
          {visibleWalls.map((wall) => (
            <button
              key={wall}
              type="button"
              role="tab"
              aria-selected={activeWall === wall}
              className={[
                styles.wallTab,
                activeWall === wall  ? styles.wallTabActive : "",
                wall === "island"    ? styles.islandTab     : "",
              ].filter(Boolean).join(" ")}
              onClick={() => setActiveWall(wall)}
            >
              {WALL_LABELS[wall]}
            </button>
          ))}
        </div>
      )}

      {/* Canvas area */}
      <div className={styles.canvasArea}>
        {!selectedRoom ? (
          <p className={styles.statusMessage}>Select a room to view wall elevations.</p>
        ) : error ? (
          <p className={styles.errorMessage}>{error}</p>
        ) : isLoading || allCabinets === null ? (
          <p className={styles.statusMessage}>Loading cabinets…</p>
        ) : (
          <RoomElevation
            room={selectedRoom}
            cabinets={wallCabinets}
            wall={activeWall}
          />
        )}
      </div>

    </div>
  );
}
