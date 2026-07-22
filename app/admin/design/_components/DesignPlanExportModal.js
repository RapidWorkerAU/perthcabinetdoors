"use client";

// Customer-facing PDF export for a design. Step 1 (only when the project has
// more than one room) picks which rooms to include. Step 2 configures the
// export: a global finish view, plus a live 3D view PER ROOM so the user can
// orbit and capture the angles they want in the PDF.
//
// Reliability note: only the ACTIVE room's 3D view (a WebGL context) is ever
// mounted — browsers cap concurrent WebGL contexts, so mounting one per room
// would fail on larger projects. The plan and elevation SVGs, by contrast, are
// plain DOM and cheap, so every selected room's stage is mounted off-screen at
// once and rasterised at generate time. Captured 3D angles are stored per room
// and survive tab switches.

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import DesignCanvas from "./DesignCanvas";
import FrontElevationView from "./FrontElevationView";
import { resolveColourSrc } from "../../../../lib/pcd-colour-images";
import { rasterizeSvg, tileToSwatchDataUrl } from "../../../../lib/pcd-svg-raster";

const Design3DView = dynamic(() => import("./Design3DView"), { ssr: false });

const WALL_LABELS = { top: "Wall 1", bottom: "Wall 2", left: "Wall 3", right: "Wall 4" };
const WALLS = ["top", "bottom", "left", "right"];
const COLOUR_MODES = [
  { key: "real", label: "Real finishes", hint: "Actual colour-library textures" },
  { key: "default", label: "Product colours", hint: "The tool's per-type colours" },
  { key: "line", label: "Line drawing", hint: "Outlines only, no fill" },
];
const PRESETS = [
  { key: null, label: "Current view" },
  { key: "frontLeft", label: "Front-left" },
  { key: "frontRight", label: "Front-right" },
  { key: "front", label: "Front on" },
];

const noop = () => {};
const emptySet = new Set();

export default function DesignPlanExportModal({ projectId, project, rooms, items, currentRoomId, colourImages, onClose }) {
  const roomList = useMemo(() => rooms || [], [rooms]);
  const singleRoom = roomList.length <= 1;

  const [mode, setMode] = useState("real");
  const [step, setStep] = useState(singleRoom ? 2 : 1);
  const [selectedIds, setSelectedIds] = useState(() => roomList.map((r) => r.id));
  const [activeIdx, setActiveIdx] = useState(0);
  const [rendersByRoom, setRendersByRoom] = useState({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const captureApiRef = useRef(null);
  const planRefs = useRef({});
  const elevRefs = useRef({});

  const showColours = mode === "real";
  const lineOnly = mode === "line";

  // Items grouped by room, once.
  const itemsByRoom = useMemo(() => {
    const map = new Map(roomList.map((r) => [r.id, []]));
    for (const it of items || []) {
      if (map.has(it.room_id)) map.get(it.room_id).push(it);
    }
    return map;
  }, [roomList, items]);

  const selectedRooms = roomList.filter((r) => selectedIds.includes(r.id));
  const activeRoom = selectedRooms[activeIdx] || selectedRooms[0] || null;
  const activeItems = activeRoom ? itemsByRoom.get(activeRoom.id) || [] : [];

  function wallsWithCabinets(roomId) {
    const set = new Set();
    for (const it of itemsByRoom.get(roomId) || []) {
      if (it?.wall && it.item_type && it.item_type !== "obstruction" && WALLS.includes(it.wall)) set.add(it.wall);
    }
    return WALLS.filter((w) => set.has(w));
  }
  const wallWidthMm = (room, w) => (w === "top" || w === "bottom" ? room?.width_mm : room?.depth_mm) || 0;

  function toggleRoom(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  const selectAllRooms = () => setSelectedIds(roomList.map((r) => r.id));
  const clearRooms = () => setSelectedIds([]);
  const onlyRoom = (id) => setSelectedIds([id]);
  const allSelected = selectedIds.length === roomList.length;

  function goToConfigure() {
    if (!selectedIds.length) return;
    setActiveIdx(0);
    setStep(2);
  }

  function addRender(preset, label) {
    const api = captureApiRef.current;
    if (!api || !activeRoom) return;
    if (preset) api.setAngle(preset);
    const image = api.grab();
    if (!image) return;
    setRendersByRoom((prev) => {
      const list = prev[activeRoom.id] || [];
      return { ...prev, [activeRoom.id]: [...list, { id: `${activeRoom.id}-${label}-${list.length}`, label, image }] };
    });
  }

  function removeRender(id) {
    if (!activeRoom) return;
    setRendersByRoom((prev) => ({ ...prev, [activeRoom.id]: (prev[activeRoom.id] || []).filter((r) => r.id !== id) }));
  }

  async function buildPalette(roomItems) {
    if (!colourImages) return [];
    const rows = [];
    const seen = new Set();
    const add = (role, material, finish, colour, src) => {
      const name = [material, finish, colour].filter(Boolean).join(" ");
      if (!name) return;
      const key = `${role}|${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ role, name, src });
    };
    for (const it of roomItems || []) {
      if (!it?.wall || it.item_type === "obstruction") continue;
      add("Carcass", it.material, it.finish, it.colour, resolveColourSrc(colourImages, it, "carcass"));
      if (it.door_style?.colour) add("Doors", it.door_style.material, it.door_style.finish, it.door_style.colour, resolveColourSrc(colourImages, it, "door"));
      if (it.drawer_style?.colour) add("Drawers", it.drawer_style.material, it.drawer_style.finish, it.drawer_style.colour, resolveColourSrc(colourImages, it, "drawer"));
    }
    return Promise.all(rows.map(async (r) => ({
      role: r.role,
      name: r.name,
      image: r.src ? await tileToSwatchDataUrl(r.src) : null,
    })));
  }

  async function handleGenerate() {
    if (!selectedRooms.length) return;
    setGenerating(true);
    setError(null);
    try {
      const roomPayloads = [];
      for (const room of selectedRooms) {
        const roomItems = itemsByRoom.get(room.id) || [];

        const planSvg = planRefs.current[room.id]?.querySelector("svg");
        const plan = planSvg ? await rasterizeSvg(planSvg, { scale: 2 }) : null;

        const elevations = [];
        for (const w of wallsWithCabinets(room.id)) {
          const svg = elevRefs.current[`${room.id}:${w}`]?.querySelector("svg");
          if (!svg) continue;
          const image = await rasterizeSvg(svg, { scale: 2 });
          if (image) elevations.push({ wall: w, label: WALL_LABELS[w], image, widthMm: wallWidthMm(room, w) });
        }

        const palette = await buildPalette(roomItems);
        const renders = (rendersByRoom[room.id] || []).map((r) => ({ label: r.label, image: r.image }));
        roomPayloads.push({ roomId: room.id, captures: { plan, elevations, renders }, palette });
      }

      const res = await fetch(`/api/admin/design/projects/${projectId}/plan-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: roomPayloads, options: { colourMode: mode } }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Export failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `design-plan-${(project?.name || "design").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(e?.message || "Could not generate the PDF.");
    } finally {
      setGenerating(false);
    }
  }

  const totalRenders = Object.values(rendersByRoom).reduce((n, list) => n + (list?.length || 0), 0);

  return (
    <div style={overlay} onClick={generating ? undefined : onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={headerRow}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1c1c1a" }}>Export design plan (PDF)</div>
            <div style={{ fontSize: 12, color: "#78716c" }}>
              {step === 1
                ? `Choose which of the ${roomList.length} rooms to include`
                : `${selectedRooms.length} room${selectedRooms.length === 1 ? "" : "s"} · floor plan, elevations, 3D, schedule & finishes`}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={generating} style={ghostBtn}>Close</button>
        </div>

        {/* ── Step 1: room selection ─────────────────────────────────────── */}
        {step === 1 ? (
          <div style={{ padding: "16px 20px", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ ...sectionLabel, marginBottom: 0 }}>Rooms to export</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={selectAllRooms} disabled={allSelected} style={linkBtn}>Select all</button>
                <span style={{ color: "#d6d3cd" }}>·</span>
                <button type="button" onClick={clearRooms} disabled={!selectedIds.length} style={linkBtn}>Deselect all</button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roomList.map((r) => {
                const checked = selectedIds.includes(r.id);
                const count = (itemsByRoom.get(r.id) || []).filter((it) => it.item_type !== "obstruction").length;
                const isOnly = checked && selectedIds.length === 1;
                return (
                  <label key={r.id} style={{ ...roomRow, ...(checked ? roomRowActive : null) }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleRoom(r.id)} style={{ width: 16, height: 16 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1c1c1a", flex: 1 }}>
                      {r.name || "Untitled room"}
                      {r.id === currentRoomId && <span style={{ fontSize: 11, color: "#78716c", fontWeight: 500 }}> · current</span>}
                    </span>
                    <span style={{ fontSize: 12, color: "#78716c" }}>{count} item{count === 1 ? "" : "s"}</span>
                    {/* "Only" isolates this room — selects it and drops the rest. */}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onlyRoom(r.id); }}
                      disabled={isOnly}
                      style={{ ...linkBtn, opacity: isOnly ? 0.4 : 1 }}
                      title="Export only this room"
                    >
                      Only
                    </button>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Step 2: per-room configuration ────────────────────────────── */
          <div style={{ padding: "16px 20px", overflowY: "auto" }}>
            <div style={sectionLabel}>Finish view (applies to every room)</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {COLOUR_MODES.map((m) => (
                <button key={m.key} type="button" onClick={() => setMode(m.key)} style={{ ...chip, ...(mode === m.key ? chipActive : null) }} title={m.hint}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Room tabs — one live 3D view at a time; captures persist per room. */}
            {selectedRooms.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {selectedRooms.map((r, i) => {
                  const captured = (rendersByRoom[r.id] || []).length;
                  return (
                    <button key={r.id} type="button" onClick={() => setActiveIdx(i)} style={{ ...tab, ...(i === activeIdx ? tabActive : null) }}>
                      {r.name || `Room ${i + 1}`}
                      <span style={{ ...tabBadge, ...(i === activeIdx ? tabBadgeActive : null) }}>{captured}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeRoom && (
              <>
                <div style={sectionLabel}>
                  {selectedRooms.length > 1 ? `${activeRoom.name || "Room"} — ` : ""}Floor plan preview ({COLOUR_MODES.find((m) => m.key === mode)?.label})
                </div>
                <div style={{ width: "100%", height: 240, border: "1px solid #e7e5e4", borderRadius: 8, overflow: "hidden", marginBottom: 20, background: "#fff" }}>
                  <DesignCanvas
                    key={`preview-${activeRoom.id}-${mode}`}
                    room={activeRoom}
                    items={activeItems}
                    selectedItemId={null}
                    overlappingItemIds={emptySet}
                    onItemClick={noop}
                    onDeselect={noop}
                    onItemDragEnd={noop}
                    onFrontView={noop}
                    colourImages={colourImages}
                    showColours={showColours}
                    lineOnly={lineOnly}
                    printMode
                    interactive={false}
                  />
                </div>

                <div style={sectionLabel}>
                  3D views — {activeRoom.name || "room"} ({(rendersByRoom[activeRoom.id] || []).length} added)
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ width: "min(460px, 100%)", height: 300, borderRadius: 8, overflow: "hidden", border: "1px solid #e7e5e4", flexShrink: 0, background: "#f2f1ee" }}>
                    <Design3DView
                      key={`3d-${activeRoom.id}`}
                      room={activeRoom}
                      items={activeItems}
                      colourImages={colourImages}
                      showColours={showColours}
                      mono={lineOnly}
                      onClose={noop}
                      onCaptureReady={(api) => { captureApiRef.current = api; }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                      {PRESETS.map((p) => (
                        <button key={p.label} type="button" style={smallBtn} onClick={() => addRender(p.key, p.label)}>+ {p.label}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(rendersByRoom[activeRoom.id] || []).map((r) => (
                        <div key={r.id} style={{ position: "relative" }}>
                          <img src={r.image} alt={r.label} style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 4, border: "1px solid #e7e5e4" }} />
                          <button type="button" onClick={() => removeRender(r.id)} style={thumbClose} title="Remove">×</button>
                        </div>
                      ))}
                      {(rendersByRoom[activeRoom.id] || []).length === 0 && (
                        <span style={{ fontSize: 12, color: "#a8a29e" }}>Orbit the model, then add the angles you want in this room&apos;s pages.</span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {error && <div style={{ padding: "0 20px 10px", color: "#b91c1c", fontSize: 13 }}>{error}</div>}

        <div style={footerRow}>
          <span style={{ fontSize: 11, color: "#a8a29e" }}>
            {step === 1
              ? "The plan, elevations, schedule and finishes are added automatically per room."
              : `Renders capture the current finish view.${totalRenders ? ` ${totalRenders} angle${totalRenders === 1 ? "" : "s"} added.` : ""}`}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 auto" }}>
            {step === 2 && !singleRoom && (
              <button type="button" onClick={() => setStep(1)} disabled={generating} style={ghostBtn}>Back to rooms</button>
            )}
            <button type="button" onClick={onClose} disabled={generating} style={ghostBtn}>Cancel</button>
            {step === 1 ? (
              <button type="button" onClick={goToConfigure} disabled={!selectedIds.length} style={primaryBtn}>
                Next: configure {selectedIds.length} room{selectedIds.length === 1 ? "" : "s"}
              </button>
            ) : (
              <button type="button" onClick={handleGenerate} disabled={generating || !selectedRooms.length} style={primaryBtn}>
                {generating ? "Generating…" : `Generate PDF${selectedRooms.length > 1 ? ` (${selectedRooms.length} rooms)` : ""}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Off-screen capture stage — every selected room's plan + elevation SVGs
          (plain DOM, so all rooms can mount at once), rasterised at generate
          time. The 3D view is NOT here: it's WebGL and mounts one-at-a-time
          above, its images captured to state as the user adds them. */}
      {step === 2 && (
        <div aria-hidden style={offscreen}>
          {selectedRooms.map((r) => {
            const roomItems = itemsByRoom.get(r.id) || [];
            return (
              <div key={r.id}>
                <div ref={(el) => { planRefs.current[r.id] = el; }} style={{ width: 1000, height: 640 }}>
                  <DesignCanvas
                    room={r}
                    items={roomItems}
                    selectedItemId={null}
                    overlappingItemIds={emptySet}
                    onItemClick={noop}
                    onDeselect={noop}
                    onItemDragEnd={noop}
                    onFrontView={noop}
                    colourImages={colourImages}
                    showColours={showColours}
                    lineOnly={lineOnly}
                    printMode
                    interactive={false}
                  />
                </div>
                {wallsWithCabinets(r.id).map((w) => (
                  <div key={w} ref={(el) => { elevRefs.current[`${r.id}:${w}`] = el; }} style={{ width: 1000, height: 640 }}>
                    <FrontElevationView
                      wall={w}
                      room={r}
                      items={roomItems}
                      onClose={noop}
                      onItemChange={noop}
                      onItemSelect={noop}
                      interactive={false}
                      colourImages={colourImages}
                      showColours={showColours}
                      lineOnly={lineOnly}
                      printMode
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const panel = { width: "min(880px, 96vw)", maxHeight: "92vh", background: "#fff", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" };
const headerRow = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #f0efec" };
const footerRow = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid #f0efec", gap: 12, flexWrap: "wrap" };
const sectionLabel = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#a8a29e", marginBottom: 8 };
const chip = { padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #e7e5e4", background: "#fafaf9", color: "#57534e", cursor: "pointer" };
const chipActive = { background: "#1c1917", color: "#fff", border: "1px solid #1c1917" };
const tab = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", color: "#57534e", cursor: "pointer" };
const tabActive = { background: "#f0efec", color: "#1c1c1a", border: "1px solid #d6d3cd" };
const tabBadge = { minWidth: 16, height: 16, borderRadius: 8, background: "#e7e5e4", color: "#57534e", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" };
const tabBadgeActive = { background: "#1c1917", color: "#fff" };
const roomRow = { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid #e7e5e4", borderRadius: 8, background: "#fff", cursor: "pointer" };
const roomRowActive = { border: "1px solid #d6d3cd", background: "#fafaf9" };
const smallBtn = { padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #e7e5e4", background: "#fff", color: "#1c1c1a", cursor: "pointer" };
const linkBtn = { background: "none", border: "none", padding: 0, color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const ghostBtn = { padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", color: "#57534e", cursor: "pointer" };
const primaryBtn = { padding: "8px 18px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: "#1c1917", color: "#fff", cursor: "pointer" };
const thumbClose = { position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: "none", background: "#1c1917", color: "#fff", fontSize: 12, lineHeight: "18px", cursor: "pointer", padding: 0 };
const offscreen = { position: "fixed", left: -100000, top: 0, opacity: 0, pointerEvents: "none" };
