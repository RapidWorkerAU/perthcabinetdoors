"use client";

import { useCallback, useEffect, useState } from "react";
import { findOverlappingItemIds } from "./DesignCanvas";
import { buildColourImageMap, COLOUR_IMAGE_MATERIALS } from "../../../../lib/pcd-colour-images";

// Loads the colour library once and builds the name → tile-image lookup the
// views use for "show colours". Best-effort: any failure just yields an empty
// map, and every view falls back to its flat type colours.
async function fetchColourImageMap() {
  const entries = await Promise.all(
    COLOUR_IMAGE_MATERIALS.map(async (material) => {
      try {
        const res = await fetch(`/api/colour-library?material=${encodeURIComponent(material)}`);
        const data = await res.json();
        return { material, groups: data?.colourFamily?.groups || [] };
      } catch {
        return { material, groups: [] };
      }
    })
  );
  return buildColourImageMap(entries);
}

/**
 * All design-tool state, data loading, and mutations for a single project.
 *
 * Extracted verbatim from DesignProgram so that both the desktop
 * (DesignProgram) and mobile (DesignProgramMobile) shells share one brain —
 * identical state, identical save API. A cabinet created in either shell is
 * the same row, so switching between them needs no conversion.
 */
export default function useDesignProgram(projectId) {
  const [project, setProject]           = useState(null);
  const [rooms, setRooms]               = useState([]);
  const [items, setItems]               = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [isAddingItem, setIsAddingItem]  = useState(false);
  const [importOpen, setImportOpen]     = useState(false);
  const [materialDefaultsOpen, setMaterialDefaultsOpen] = useState(false);
  const [frontViewWall, setFrontViewWall] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  // Surfaced for saves that have no inline indicator of their own — a drag, or
  // an edit in the elevation view. The config forms show their own error.
  const [saveError, setSaveError]       = useState(null);
  // The colour-tile lookup for "show colours", loaded once. Null until ready.
  const [colourImages, setColourImages] = useState(null);
  useEffect(() => { let live = true; fetchColourImageMap().then((m) => { if (live) setColourImages(m); }); return () => { live = false; }; }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, rRes, iRes] = await Promise.all([
        fetch(`/api/admin/design/projects/${projectId}`),
        fetch(`/api/admin/design/projects/${projectId}/rooms`),
        fetch(`/api/admin/design/projects/${projectId}/items`),
      ]);
      const [pData, rData, iData] = await Promise.all([pRes.json(), rRes.json(), iRes.json()]);
      if (!pData.ok) throw new Error(pData.error || "Could not load project.");
      setProject(pData.project);
      setRooms(rData.ok ? rData.rooms : []);
      setItems(iData.ok ? iData.items : []);
      if (!selectedRoomId && rData.rooms?.length) {
        setSelectedRoomId(rData.rooms[0].id);
      }
    } catch (err) {
      setError(err?.message || "Could not load design project.");
    } finally {
      setLoading(false);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- Room ops ----

  async function handleAddRoom(name) {
    const res = await fetch(`/api/admin/design/projects/${projectId}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sort_order: rooms.length }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Could not add room.");
    setRooms((r) => [...r, data.room]);
    setSelectedRoomId(data.room.id);
    return data.room;
  }

  async function handleUpdateRoom(roomId, patch) {
    const res = await fetch(`/api/admin/design/projects/${projectId}/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return;
    setRooms((r) => r.map((x) => (x.id === roomId ? data.room : x)));
  }

  async function handleDeleteRoom(roomId) {
    const res = await fetch(`/api/admin/design/projects/${projectId}/rooms/${roomId}`, { method: "DELETE" });
    if (!res.ok) return;
    setRooms((r) => r.filter((x) => x.id !== roomId));
    setItems((it) => it.filter((x) => x.room_id !== roomId));
    if (selectedRoomId === roomId) setSelectedRoomId(rooms.find((r) => r.id !== roomId)?.id || null);
    if (selectedItemId && items.find((i) => i.id === selectedItemId && i.room_id === roomId)) {
      setSelectedItemId(null);
      setIsAddingItem(false);
    }
  }

  // ---- Item ops ----

  async function handleAddItem(draft) {
    // Start at top wall x=0 — user drags to final position which auto-assigns wall
    const res = await fetch(`/api/admin/design/projects/${projectId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, wall: draft.wall || "top", x_mm: 0, y_mm: 0, room_id: selectedRoomId, sort_order: items.length }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Could not add item.");
    setItems((it) => [...it, data.item]);
    setIsAddingItem(false);
    setSelectedItemId(data.item.id);
    return data.item;
  }

  // Returns { ok, error } rather than swallowing failures. A silent failure
  // here is invisibly destructive: "Saving" vanishes as if it worked, the
  // item never updates so the plan doesn't change, and the next interaction
  // remounts the form showing the old value — the user's edit is gone with no
  // signal. The caller is expected to surface the error and keep the draft.
  async function handleItemChange(itemId, patch) {
    try {
      const res = await fetch(`/api/admin/design/projects/${projectId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || `Save failed (${res.status}).` };
      }
      setItems((it) => it.map((x) => (x.id === itemId ? data.item : x)));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || "Save failed — network error." };
    }
  }

  // Optimistic update, then save, then REVERT if the save fails — used by the
  // drag and the elevation view, which have no inline save indicator. Without
  // the revert a failed drag left the cabinet looking moved but unsaved, so it
  // would silently jump back on the next reload. On failure it also surfaces a
  // banner, since these paths have nowhere else to show it.
  function handleOptimisticItemChange(itemId, patch) {
    let prev = null;
    setItems((it) => it.map((x) => {
      if (x.id === itemId) { prev = { ...x }; return { ...x, ...patch }; }
      return x;
    }));
    return handleItemChange(itemId, patch).then((res) => {
      if (res && res.ok === false) {
        if (prev) setItems((it) => it.map((x) => (x.id === itemId ? prev : x)));
        setSaveError(res.error || "Save failed.");
      }
      return res;
    });
  }

  function handleItemDragEnd(itemId, pos) {
    return handleOptimisticItemChange(itemId, pos);
  }

  // Copies every field of an existing item into a brand new row — same
  // wall/material/door_config/etc, nudged 100mm along the wall so it isn't
  // rendered exactly on top of the original (still needs a drag afterward,
  // same as any freshly added item).
  async function handleDuplicateItem(itemId) {
    const original = items.find((i) => i.id === itemId);
    if (!original) return;
    const { id, created_at, updated_at, ...rest } = original;
    const payload = {
      ...rest,
      label: original.label ? `${original.label} (copy)` : original.label,
      x_mm: (original.x_mm || 0) + 100,
      y_mm: (original.y_mm || 0) + 100,
      sort_order: items.length,
    };
    const res = await fetch(`/api/admin/design/projects/${projectId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Could not duplicate item.");
    setItems((it) => [...it, data.item]);
    setSelectedItemId(data.item.id);
    setIsAddingItem(false);
    return data.item;
  }

  async function handleDeleteItem(itemId) {
    const res = await fetch(`/api/admin/design/projects/${projectId}/items/${itemId}`, { method: "DELETE" });
    if (!res.ok) return;
    setItems((it) => it.filter((x) => x.id !== itemId));
    setSelectedItemId(null);
  }

  // ---- Canvas interactions ----

  function handleCanvasItemClick(item) {
    setSelectedItemId(item.id);
    setIsAddingItem(false);
  }

  function handleCanvasDeselect() {
    setSelectedItemId(null);
  }

  // ---- Derived ----

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;
  const roomItems    = items.filter((i) => i.room_id === selectedRoomId);
  const selectedItem = items.find((i) => i.id === selectedItemId) || null;
  // Collision is otherwise only checked during an interactive drag, so this
  // recomputes on every render (cheap for realistic item counts) to also
  // catch overlaps introduced by editing width/height/depth/mount height
  // via the right panel's number inputs.
  const overlappingItemIds = selectedRoom ? findOverlappingItemIds(roomItems, selectedRoom) : new Set();
  const selectedItemOverlaps = Boolean(selectedItem && overlappingItemIds.has(selectedItem.id));

  return {
    // raw state
    project, setProject,
    rooms, items,
    selectedRoomId, setSelectedRoomId,
    selectedItemId, setSelectedItemId,
    isAddingItem, setIsAddingItem,
    importOpen, setImportOpen,
    materialDefaultsOpen, setMaterialDefaultsOpen,
    frontViewWall, setFrontViewWall,
    loading, error,
    saveError, dismissSaveError: () => setSaveError(null),
    colourImages,
    setItems,
    // data
    loadAll,
    // room ops
    handleAddRoom, handleUpdateRoom, handleDeleteRoom,
    // item ops
    handleAddItem, handleItemChange, handleItemDragEnd, handleOptimisticItemChange,
    handleDuplicateItem, handleDeleteItem,
    // canvas
    handleCanvasItemClick, handleCanvasDeselect,
    // derived
    selectedRoom, roomItems, selectedItem,
    overlappingItemIds, selectedItemOverlaps,
  };
}
