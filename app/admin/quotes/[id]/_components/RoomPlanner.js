"use client";

import { useEffect, useState } from "react";
import styles from "./room-planner.module.css";

// ---- SVG layout constants ----
const VB_W = 800;
const VB_H = 600;
const PAD = 68;
const WALL_BAND = 34; // px depth of clickable wall stripe

// ---- Cabinet type colours ----
const TYPE_FILL = {
  base:        "#3b82f6",
  wall:        "#22c55e",
  tall:        "#f97316",
  corner_base: "#a855f7",
  corner_wall: "#8b5cf6",
  island:      "#6b7280",
};

const TYPE_LABELS = {
  base:        "Base",
  wall:        "Wall",
  tall:        "Tall",
  corner_base: "Corner Base",
  corner_wall: "Corner Wall",
  island:      "Island",
};

const CABINET_TYPES = ["base", "wall", "tall", "corner_base", "corner_wall", "island"];
const WALLS        = ["top", "bottom", "left", "right", "island"];

// ---- Helpers ----
function fmm(v) { return v ? `${v}mm` : "–"; }
function ftype(t) { return TYPE_LABELS[t] || t; }

function lineItemLabel(line) {
  const name = line.product_name || line.description || "Item";
  const dims = [line.width_mm, line.height_mm].filter(Boolean);
  return dims.length ? `${name} (${dims.join("×")})` : name;
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function emptyDraft(wall = "top") {
  return {
    cabinet_type: wall === "island" ? "island" : "base",
    wall,
    label:              "",
    x_mm:               "0",
    width_mm:           "600",
    height_mm:          "720",
    depth_mm:           "580",
    notes:              "",
    quote_line_item_id: "",
  };
}

function draftFromCabinet(c) {
  return {
    cabinet_type:       c.cabinet_type || "base",
    wall:               c.wall || "top",
    label:              c.label || "",
    x_mm:               String(c.x_mm ?? "0"),
    width_mm:           String(c.width_mm ?? "600"),
    height_mm:          String(c.height_mm ?? "720"),
    depth_mm:           String(c.depth_mm ?? "580"),
    notes:              c.notes || "",
    quote_line_item_id: c.quote_line_item_id || "",
  };
}

function computeLayout(room) {
  const rw = room.width_mm || 3000;
  const rd = room.depth_mm || 3000;
  const avW = VB_W - PAD * 2;
  const avH = VB_H - PAD * 2;
  const scale = Math.min(avW / rw, avH / rd);
  const roomW = rw * scale;
  const roomH = rd * scale;
  const ox = (VB_W - roomW) / 2;
  const oy = (VB_H - roomH) / 2;
  return { scale, roomW, roomH, ox, oy };
}

function wallCabinetRect(cabinet, lay) {
  const { scale, roomW, roomH, ox, oy } = lay;
  const xMm  = Number(cabinet.x_mm) || 0;
  const wMm  = Number(cabinet.width_mm) || 600;
  const dMm  = Number(cabinet.depth_mm) || 580;
  const cap  = Math.min(roomW, roomH) * 0.36;
  const dPx  = Math.min(dMm * scale, cap);
  const xPx  = xMm * scale;

  // Clamp width/length to wall edge so cabinets never overflow the room outline
  switch (cabinet.wall) {
    case "top": {
      const x = ox + xPx;
      const w = Math.min(wMm * scale, ox + roomW - x);
      return { x, y: oy, w: Math.max(w, 0), h: dPx };
    }
    case "bottom": {
      const x = ox + xPx;
      const w = Math.min(wMm * scale, ox + roomW - x);
      return { x, y: oy + roomH - dPx, w: Math.max(w, 0), h: dPx };
    }
    case "left": {
      const y = oy + xPx;
      const h = Math.min(wMm * scale, oy + roomH - y);
      return { x: ox, y, w: dPx, h: Math.max(h, 0) };
    }
    case "right": {
      const y = oy + xPx;
      const h = Math.min(wMm * scale, oy + roomH - y);
      return { x: ox + roomW - dPx, y, w: dPx, h: Math.max(h, 0) };
    }
    default:
      return null;
  }
}

function islandPositions(cabinets, lay) {
  const { scale, roomW, roomH, ox, oy } = lay;
  const totalW = cabinets.reduce((s, c) => s + (Number(c.width_mm) || 600) * scale, 0)
               + Math.max(0, cabinets.length - 1) * 8;
  let runX = ox + roomW / 2 - totalW / 2;
  return cabinets.map((c) => {
    const wPx = (Number(c.width_mm) || 600) * scale;
    const dPx = Math.min((Number(c.depth_mm) || 580) * scale, roomH * 0.36);
    const x   = runX;
    const y   = oy + roomH / 2 - dPx / 2;
    runX += wPx + 8;
    return { cabinet: c, x, y, w: wPx, h: dPx };
  });
}

// ---- CabinetShape: reusable SVG group with optional linked-item badge ----
function CabinetShape({ cabinet, x, y, w, h, isSelected, quoteLineItems, onEdit }) {
  const fill      = TYPE_FILL[cabinet.cabinet_type] || "#888";
  const mainLabel = cabinet.label || ftype(cabinet.cabinet_type);
  const linked    = cabinet.quote_line_item_id
    ? (quoteLineItems || []).find((l) => l.id === cabinet.quote_line_item_id) ?? null
    : null;
  const linkedLabel = linked ? truncate(linked.product_name || linked.description || "Linked", 11) : null;
  const hasLink     = Boolean(linkedLabel);

  const showMainLabel = w >= 24 && h >= 14;
  const showLinkText  = hasLink && w >= 30 && h >= 28;

  const mainFontSize = Math.max(Math.min(10, (w / Math.max(mainLabel.length, 1)) * 1.5), 7);
  const linkFontSize = Math.max(Math.min(8,  (w / Math.max((linkedLabel?.length || 1), 1)) * 1.4), 6);
  const mainLabelCY  = showLinkText ? y + h * 0.37 : y + h / 2;

  return (
    <g style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onEdit(cabinet); }}>
      <rect
        x={x} y={y} width={w} height={h}
        fill={fill}
        fillOpacity={0.82}
        stroke={isSelected ? "#111" : hasLink ? "rgba(255,255,255,0.65)" : fill}
        strokeWidth={isSelected ? 2.5 : hasLink ? 1.5 : 0.75}
        rx={2}
      />
      {showMainLabel && (
        <text
          x={x + w / 2} y={mainLabelCY}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={mainFontSize} fill="#fff" fontWeight="700"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {mainLabel}
        </text>
      )}
      {showLinkText && (
        <>
          <line
            x1={x + 4} y1={y + h * 0.58}
            x2={x + w - 4} y2={y + h * 0.58}
            stroke="rgba(255,255,255,0.28)" strokeWidth={0.5}
            style={{ pointerEvents: "none" }}
          />
          <text
            x={x + w / 2} y={y + h * 0.77}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={linkFontSize} fill="rgba(255,255,255,0.82)"
            fontStyle="italic"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {linkedLabel}
          </text>
        </>
      )}
    </g>
  );
}

// ---- Component ----
export default function RoomPlanner({
  quoteId,
  rooms,
  quoteLineItems,
  refreshKey,
  onCabinetAdd,
  onCabinetUpdate,
  onCabinetDelete,
}) {
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id ?? null);

  const [cabinets,        setCabinets]        = useState([]);
  const [cabinetsLoading, setCabinetsLoading] = useState(false);

  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [addingToWall,    setAddingToWall]    = useState(null);
  const [cabinetDraft,    setCabinetDraft]    = useState(emptyDraft("top"));

  const [isBusy,    setIsBusy]    = useState(false);
  const [feedback,  setFeedback]  = useState("");

  // Derived: active room (falls back to first if selectedRoomId is stale)
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0] ?? null;

  // Sync selectedRoomId when rooms list changes (e.g. first room added, or deleted room)
  useEffect(() => {
    if (!rooms.find((r) => r.id === selectedRoomId) && rooms[0]) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  // Fetch cabinets whenever the active room changes
  useEffect(() => {
    if (!selectedRoom?.id) { setCabinets([]); return; }
    setCabinetsLoading(true);
    setSelectedCabinet(null);
    setAddingToWall(null);
    setFeedback("");
    fetch(`/api/admin/quotes/${quoteId}/rooms/${selectedRoom.id}/cabinets`, { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => { if (payload.ok) setCabinets(payload.cabinets || []); })
      .catch(() => {})
      .finally(() => setCabinetsLoading(false));
  }, [quoteId, selectedRoom?.id, refreshKey]);

  // ---- Cabinet panel helpers ----
  function openAdd(wall) {
    setSelectedCabinet(null);
    setAddingToWall(wall);
    setCabinetDraft(emptyDraft(wall));
    setFeedback("");
  }

  function openEdit(cabinet) {
    setAddingToWall(null);
    setSelectedCabinet(cabinet);
    setCabinetDraft(draftFromCabinet(cabinet));
    setFeedback("");
  }

  function closePanel() {
    setSelectedCabinet(null);
    setAddingToWall(null);
    setFeedback("");
  }

  // ---- Cabinet handlers ----
  async function handleSaveCabinet() {
    setIsBusy(true); setFeedback("");
    const payload = {
      cabinet_type:       cabinetDraft.cabinet_type,
      wall:               cabinetDraft.wall,
      label:              cabinetDraft.label || null,
      x_mm:               parseInt(cabinetDraft.x_mm) || 0,
      width_mm:           parseInt(cabinetDraft.width_mm) || null,
      height_mm:          parseInt(cabinetDraft.height_mm) || null,
      depth_mm:           parseInt(cabinetDraft.depth_mm) || null,
      notes:              cabinetDraft.notes || null,
      quote_line_item_id: cabinetDraft.quote_line_item_id || null,
    };
    try {
      if (selectedCabinet) {
        const updated = await onCabinetUpdate(selectedRoom.id, selectedCabinet.id, payload);
        const merged  = updated ?? { ...selectedCabinet, ...payload };
        setCabinets((prev) => prev.map((c) => (c.id === selectedCabinet.id ? merged : c)));
        setSelectedCabinet(merged);
      } else {
        const created = await onCabinetAdd(selectedRoom.id, payload);
        if (created) setCabinets((prev) => [...prev, created]);
        setAddingToWall(null);
      }
    } catch (err) {
      setFeedback(err?.message || "Could not save cabinet.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteCabinet() {
    if (!selectedCabinet) return;
    setIsBusy(true); setFeedback("");
    try {
      await onCabinetDelete(selectedRoom.id, selectedCabinet.id);
      setCabinets((prev) => prev.filter((c) => c.id !== selectedCabinet.id));
      closePanel();
    } catch (err) {
      setFeedback(err?.message || "Could not delete cabinet.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLinkChange(newId) {
    setCabinetDraft((d) => ({ ...d, quote_line_item_id: newId }));
    if (!selectedCabinet) return;
    setFeedback("");
    try {
      const updated = await onCabinetUpdate(selectedRoom.id, selectedCabinet.id, {
        quote_line_item_id: newId || null,
      });
      const merged = updated ?? { ...selectedCabinet, quote_line_item_id: newId || null };
      setCabinets((prev) => prev.map((c) => (c.id === selectedCabinet.id ? merged : c)));
      setSelectedCabinet(merged);
    } catch (err) {
      setFeedback(err?.message || "Could not link quote line.");
    }
  }

  // ---- SVG rendering ----
  function renderCanvas() {
    if (!selectedRoom) return null;
    const lay  = computeLayout(selectedRoom);
    const { scale, roomW, roomH, ox, oy } = lay;
    const rw = selectedRoom.width_mm || 3000;
    const rd = selectedRoom.depth_mm || 3000;

    const wallCabs   = cabinets.filter((c) => c.wall !== "island").sort((a, b) => a.sort_order - b.sort_order);
    const islandCabs = cabinets.filter((c) => c.wall === "island").sort((a, b) => a.sort_order - b.sort_order);
    const islandRects = islandPositions(islandCabs, lay);

    const wallBands = [
      { wall: "top",    x: ox,                    y: oy,                     w: roomW,      h: WALL_BAND },
      { wall: "bottom", x: ox,                    y: oy + roomH - WALL_BAND, w: roomW,      h: WALL_BAND },
      { wall: "left",   x: ox,                    y: oy,                     w: WALL_BAND,  h: roomH     },
      { wall: "right",  x: ox + roomW - WALL_BAND, y: oy,                    w: WALL_BAND,  h: roomH     },
    ];

    return (
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        className={styles.roomSvg}
        onClick={closePanel}
        aria-label={`Floor plan for ${selectedRoom.name}`}
      >
        {/* Room floor */}
        <rect
          x={ox} y={oy} width={roomW} height={roomH}
          fill="#f9f9f7"
          stroke="#1a2e20"
          strokeWidth={2}
        />

        {/* Clickable wall bands */}
        {wallBands.map(({ wall, x, y, w, h }) => (
          <rect
            key={wall}
            x={x} y={y} width={w} height={h}
            fill="transparent"
            style={{ cursor: "crosshair" }}
            onClick={(e) => { e.stopPropagation(); openAdd(wall); }}
          />
        ))}

        {/* Clickable island/interior zone */}
        <rect
          x={ox + WALL_BAND}
          y={oy + WALL_BAND}
          width={roomW - WALL_BAND * 2}
          height={roomH - WALL_BAND * 2}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onClick={(e) => { e.stopPropagation(); openAdd("island"); }}
        />

        {/* Wall-mounted cabinets */}
        {wallCabs.map((cabinet) => {
          const rect = wallCabinetRect(cabinet, lay);
          if (!rect || rect.w <= 0 || rect.h <= 0) return null;
          return (
            <CabinetShape
              key={cabinet.id}
              cabinet={cabinet}
              x={rect.x} y={rect.y} w={rect.w} h={rect.h}
              isSelected={selectedCabinet?.id === cabinet.id}
              quoteLineItems={quoteLineItems}
              onEdit={openEdit}
            />
          );
        })}

        {/* Island cabinets */}
        {islandRects.map(({ cabinet, x, y, w, h }) => (
          <CabinetShape
            key={cabinet.id}
            cabinet={cabinet}
            x={x} y={y} w={w} h={h}
            isSelected={selectedCabinet?.id === cabinet.id}
            quoteLineItems={quoteLineItems}
            onEdit={openEdit}
          />
        ))}

        {/* Room outline drawn on top so wall lines stay crisp */}
        <rect
          x={ox} y={oy} width={roomW} height={roomH}
          fill="none"
          stroke="#1a2e20"
          strokeWidth={2}
        />

        {/* Wall dimension labels */}
        <text x={ox + roomW / 2} y={oy - 14} textAnchor="middle" fontSize={11} fill="#5f5e5a">
          Top — {fmm(rw)}
        </text>
        <text x={ox + roomW / 2} y={oy + roomH + 24} textAnchor="middle" fontSize={11} fill="#5f5e5a">
          Bottom — {fmm(rw)}
        </text>
        <text
          x={ox - 14} y={oy + roomH / 2}
          textAnchor="middle" fontSize={11} fill="#5f5e5a"
          transform={`rotate(-90, ${ox - 14}, ${oy + roomH / 2})`}
        >
          Left — {fmm(rd)}
        </text>
        <text
          x={ox + roomW + 14} y={oy + roomH / 2}
          textAnchor="middle" fontSize={11} fill="#5f5e5a"
          transform={`rotate(90, ${ox + roomW + 14}, ${oy + roomH / 2})`}
        >
          Right — {fmm(rd)}
        </text>

        {/* Empty-room hint */}
        {cabinets.length === 0 && (
          <text x={VB_W / 2} y={VB_H / 2} textAnchor="middle" fontSize={12} fill="#888780">
            Click a wall band or interior to add a cabinet
          </text>
        )}
      </svg>
    );
  }

  // ---- Render ----
  return (
    <div className={styles.roomPlanner}>
      {/* Room tabs — navigation only */}
      {rooms.length > 1 && (
        <div className={styles.roomTabs}>
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              className={[styles.roomTab, room.id === selectedRoom?.id ? styles.roomTabActive : ""].join(" ")}
              onClick={() => { setSelectedRoomId(room.id); closePanel(); }}
            >
              {room.name}
            </button>
          ))}
        </div>
      )}

      {selectedRoom ? (
        <div className={styles.plannerBody}>
          {/* SVG canvas */}
          <div className={styles.canvasWrap}>
            {cabinetsLoading ? (
              <div className={styles.canvasLoading}>Loading…</div>
            ) : (
              renderCanvas()
            )}
          </div>

          {/* Side panel */}
          <aside className={styles.sidePanel}>

            {/* Cabinet add / edit form */}
            {(addingToWall !== null || selectedCabinet) && (
              <div className={styles.panelSection}>
                <p className={styles.panelTitle}>
                  {selectedCabinet
                    ? (selectedCabinet.label || ftype(selectedCabinet.cabinet_type))
                    : `Add cabinet — ${addingToWall}`}
                </p>

                <label className={styles.fieldLabel}>
                  Type
                  <select
                    className={styles.fieldInput}
                    value={cabinetDraft.cabinet_type}
                    onChange={(e) => setCabinetDraft((d) => ({ ...d, cabinet_type: e.target.value }))}
                  >
                    {CABINET_TYPES.map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.fieldLabel}>
                  Wall
                  <select
                    className={styles.fieldInput}
                    value={cabinetDraft.wall}
                    onChange={(e) => setCabinetDraft((d) => ({ ...d, wall: e.target.value }))}
                  >
                    {WALLS.map((w) => (
                      <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.fieldLabel}>
                  Label <span style={{ fontWeight: 400 }}>(optional)</span>
                  <input
                    className={styles.fieldInput}
                    placeholder="e.g. Pantry"
                    value={cabinetDraft.label}
                    onChange={(e) => setCabinetDraft((d) => ({ ...d, label: e.target.value }))}
                  />
                </label>

                <label className={styles.fieldLabel}>
                  Position from left / top (mm)
                  <input
                    className={styles.fieldInput}
                    type="number" min="0"
                    value={cabinetDraft.x_mm}
                    onChange={(e) => setCabinetDraft((d) => ({ ...d, x_mm: e.target.value }))}
                  />
                </label>

                <div className={styles.dimensionRow}>
                  <label className={styles.fieldLabel}>
                    Width mm
                    <input
                      className={styles.fieldInput}
                      type="number" min="1"
                      value={cabinetDraft.width_mm}
                      onChange={(e) => setCabinetDraft((d) => ({ ...d, width_mm: e.target.value }))}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Height mm
                    <input
                      className={styles.fieldInput}
                      type="number" min="1"
                      value={cabinetDraft.height_mm}
                      onChange={(e) => setCabinetDraft((d) => ({ ...d, height_mm: e.target.value }))}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Depth mm
                    <input
                      className={styles.fieldInput}
                      type="number" min="1"
                      value={cabinetDraft.depth_mm}
                      onChange={(e) => setCabinetDraft((d) => ({ ...d, depth_mm: e.target.value }))}
                    />
                  </label>
                </div>

                {quoteLineItems?.length > 0 && (() => {
                  const linkedLine = quoteLineItems.find((l) => l.id === cabinetDraft.quote_line_item_id) ?? null;
                  return (
                    <>
                      <label className={styles.fieldLabel}>
                        Quote line
                        <select
                          className={styles.fieldInput}
                          value={cabinetDraft.quote_line_item_id}
                          onChange={(e) => handleLinkChange(e.target.value)}
                        >
                          <option value="">— not linked —</option>
                          {quoteLineItems.map((line) => (
                            <option key={line.id} value={line.id}>
                              {lineItemLabel(line)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {linkedLine && (
                        <p className={styles.linkedItemNote}>&#10003; {lineItemLabel(linkedLine)}</p>
                      )}
                    </>
                  );
                })()}

                <label className={styles.fieldLabel}>
                  Notes
                  <textarea
                    className={styles.textareaInput}
                    rows={2}
                    value={cabinetDraft.notes}
                    onChange={(e) => setCabinetDraft((d) => ({ ...d, notes: e.target.value }))}
                  />
                </label>

                {feedback && <p className={styles.feedback}>{feedback}</p>}

                <div className={styles.panelActions}>
                  <button type="button" className={styles.primaryButton} onClick={handleSaveCabinet} disabled={isBusy}>
                    {isBusy ? "Saving…" : selectedCabinet ? "Save changes" : "Add cabinet"}
                  </button>
                  {selectedCabinet && (
                    <button type="button" className={styles.dangerButton} onClick={handleDeleteCabinet} disabled={isBusy}>
                      Delete
                    </button>
                  )}
                  <button type="button" className={styles.secondaryButton} onClick={closePanel} disabled={isBusy}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Legend (shown when no cabinet form is open) */}
            {!selectedCabinet && addingToWall === null && (
              <div className={styles.panelSection}>
                <p className={styles.panelTitle}>Cabinet types</p>
                <ul className={styles.legend}>
                  {CABINET_TYPES.map((type) => (
                    <li key={type} className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ background: TYPE_FILL[type] }} />
                      {TYPE_LABELS[type]}
                    </li>
                  ))}
                </ul>
                <p className={styles.legendHint}>Click a coloured wall band or interior to add a cabinet. Click a placed cabinet to edit it.</p>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
