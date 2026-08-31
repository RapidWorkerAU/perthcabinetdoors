"use client";

// The public planner's "brain", the no-login counterpart to the admin
// useDesignProgram hook. Same shape (project / one room / items / selection /
// colour map), but it talks to the PUBLIC /api/public/design routes scoped by an
// anonymous session code, and bootstraps that session on mount (resume from the
// URL / localStorage, else create a fresh one). Reuses the same colour-image
// map, placement and overlap helpers as the admin tool so the shared view
// components render identically.

import { useCallback, useEffect, useRef, useState } from "react";
import { findOverlappingItemIds } from "../../admin/design/_components/DesignCanvas";
import { buildColourImageMap, COLOUR_IMAGE_MATERIALS } from "../../../lib/pcd-colour-images";
import { findFreeWallSlot } from "../../../lib/pcd-plan-geometry";
import { publicItemDefaults } from "../../../lib/pcd-public-parts";
import { isPlaceholderDesignName } from "../../../lib/pcd-design-name";

const CODE_STORAGE_KEY = "pcd_public_design_code";
const FALLBACK_CARCASS_DEFAULT = {
  material: "decorative board",
  finish: "Matt",
  colour: "Carcass",
};

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

async function fetchCarcassDefault() {
  try {
    const res = await fetch("/api/colour-library?items=1");
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const exact = items.find((item) =>
      String(item.material || "").trim().toLowerCase() === "decorative board" &&
      String(item.finish || "").trim().toLowerCase() === "matt" &&
      String(item.colour || "").trim().toLowerCase() === "carcass"
    );
    const loose = items.find((item) =>
      String(item.finish || "").trim().toLowerCase() === "matt" &&
      String(item.colour || "").trim().toLowerCase() === "carcass"
    );
    const match = exact || loose;
    if (!match) return FALLBACK_CARCASS_DEFAULT;
    return {
      material: match.material || FALLBACK_CARCASS_DEFAULT.material,
      finish: match.finish || FALLBACK_CARCASS_DEFAULT.finish,
      colour: match.colour || FALLBACK_CARCASS_DEFAULT.colour,
    };
  } catch {
    return FALLBACK_CARCASS_DEFAULT;
  }
}

// A floating shelf carries its own finish, and a fridge space / window /
// doorway is a reference to what's already in the room, nothing is made, so
// none of them should be handed the project's carcass colour.
const NO_CARCASS_DEFAULT = new Set(["floating_shelf", "appliance", "window", "door_opening"]);

function itemNeedsCarcassDefault(item) {
  if (NO_CARCASS_DEFAULT.has(item?.item_type)) return false;
  // A cabinet is checked every time, because the carcass is enforced rather
  // than merely defaulted. Everything else is only topped up when blank.
  return true;
}

// The carcass is not a choice in the public tool: every cabinet is our standard
// 18mm carcass board, and publicItemDefaults() states that outright rather than
// only filling blanks. Shelves start there too but are left changeable, so their
// half only fills what is empty.
//
// Applied on load as well as on add, so a design drawn before this rule existed
// is brought into line rather than keeping whatever carcass it happened to have.
function applyCarcassDefault(item, carcassDefault) {
  if (!itemNeedsCarcassDefault(item)) return item;
  const forced = publicItemDefaults(item, carcassDefault);
  if (!Object.keys(forced).length) {
    return {
      ...item,
      material: item.material || carcassDefault.material,
      finish: item.finish || carcassDefault.finish,
      colour: item.colour || carcassDefault.colour,
    };
  }
  return { ...item, ...forced };
}

function readInitialCode() {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("c");
  if (fromUrl) return fromUrl;
  try { return window.localStorage.getItem(CODE_STORAGE_KEY); } catch { return null; }
}

function persistCode(code) {
  if (typeof window === "undefined" || !code) return;
  try { window.localStorage.setItem(CODE_STORAGE_KEY, code); } catch { /* private mode */ }
  const url = new URL(window.location.href);
  if (url.searchParams.get("c") !== code) {
    url.searchParams.set("c", code);
    window.history.replaceState(null, "", url.toString());
  }
}

// Starting over has to forget the code in BOTH places. Clearing only the stored
// one leaves ?c= in the address bar, and the next reload would quietly resume
// the design somebody had just chosen to abandon.
function forgetCode() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(CODE_STORAGE_KEY); } catch { /* private mode */ }
  const url = new URL(window.location.href);
  if (url.searchParams.has("c")) {
    url.searchParams.delete("c");
    window.history.replaceState(null, "", url.toString());
  }
}

export default function usePublicDesign() {
  const [code, setCode] = useState(null);
  const [project, setProject] = useState(null);
  const [room, setRoom] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [colourImages, setColourImages] = useState(null);
  const [carcassDefault, setCarcassDefault] = useState(FALLBACK_CARCASS_DEFAULT);
  // NOTHING IS CREATED UNTIL THE DESIGN HAS A NAME.
  //
  // This used to boot straight into an empty room and create the row on the
  // way, which is why every public design in the admin list was called "My
  // design": the planner had to write something and never asked for anything
  // better. Now the first screen is one field, and somebody who opens the
  // planner and thinks better of it leaves no row behind at all.
  const [needsName, setNeedsName] = useState(false);
  const [naming, setNaming] = useState(false);
  // Whether the gate is naming a design that already exists rather than
  // creating one. Every design made before the planner asked is called "My
  // design", and somebody coming back to one of those has to be asked too, or
  // the admin list stays unreadable for as long as anybody keeps using an old
  // session.
  const [namingExisting, setNamingExisting] = useState(false);
  const bootedRef = useRef(false);
  // The code as a ref as well as state. The gate answers in the same tick the
  // code was set, and a callback closed over the state would still be holding
  // the previous render's value, which is null.
  const codeRef = useRef(null);

  useEffect(() => { let live = true; fetchColourImageMap().then((m) => { if (live) setColourImages(m); }); return () => { live = false; }; }, []);
  useEffect(() => { let live = true; fetchCarcassDefault().then((m) => { if (live) setCarcassDefault(m); }); return () => { live = false; }; }, []);
  useEffect(() => {
    setItems((current) => current.map((item) => applyCarcassDefault(item, carcassDefault)));
  }, [carcassDefault]);

  const applyLoad = useCallback((data) => {
    setCode(data.code);
    codeRef.current = data.code;
    setProject(data.project);
    setRoom((data.rooms && data.rooms[0]) || data.room || null);
    setItems((data.items || []).map((item) => applyCarcassDefault(item, carcassDefault)));
    persistCode(data.code);
  }, [carcassDefault]);

  const startFresh = useCallback(async (name) => {
    const res = await fetch("/api/public/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Could not start a design.");
    applyLoad(data);
  }, [applyLoad]);

  /**
   * Rename by code rather than by reading state.
   *
   * Declared before the two that use it: a dependency array is read while the
   * component renders, so a const referenced above where it is defined is a
   * crash rather than a hoisted function.
   */
  const renameDesignByCode = useCallback(async (theCode, name) => {
    if (!theCode) return { ok: false, error: "No design to rename yet." };
    try {
      const res = await fetch(`/api/public/design/${encodeURIComponent(theCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, error: data.error || "Could not rename the design." };
      if (data.project) setProject(data.project);
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not rename the design. Please check your connection." };
    }
  }, []);

  /** Rename the design that is open, from the planner. */
  const renameDesign = useCallback((name) => renameDesignByCode(codeRef.current, name), [renameDesignByCode]);

  /**
   * The answer to the first screen.
   *
   * Two jobs, because the screen has two reasons to be up. With no design yet
   * it creates one. With a resumed design that never got a real name it renames
   * THAT one, so somebody's existing work is not thrown away to get a name onto
   * it. Deliberately one function: the screen should not have to know which
   * case it is in to do the one thing it does.
   */
  const nameAndStart = useCallback(async (name) => {
    setNaming(true);
    // Cleared rather than set on failure: the gate shows its own message
    // inline, and a stale error here would put the full screen error page up
    // behind it the moment the gate closed.
    setError(null);
    try {
      if (codeRef.current) {
        const renamed = await renameDesignByCode(codeRef.current, name);
        if (!renamed.ok) return renamed;
      } else {
        await startFresh(name);
      }
      setNeedsName(false);
      setNamingExisting(false);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || "Could not start your design." };
    } finally {
      setNaming(false);
    }
  }, [renameDesignByCode, startFresh]);

  // Bootstrap: resume an existing session, or ask for a name. Runs once.
  //
  // A code that no longer resolves falls through to the naming screen rather
  // than silently starting a new design, because somebody arriving on a shared
  // link that has expired should be told they are starting something new rather
  // than being dropped into an empty room that looks like theirs.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const existing = readInitialCode();
        if (existing) {
          const res = await fetch(`/api/public/design/${encodeURIComponent(existing)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.ok) {
              applyLoad(data);
              // A design made before the planner asked is called "My design".
              // Resuming one goes through the gate too, so the back catalogue
              // gets named as people come back to it rather than keeping the
              // shared name for ever. Their work is untouched: answering it
              // renames this design rather than starting another.
              if (isPlaceholderDesignName(data.project?.name)) {
                setNamingExisting(true);
                setNeedsName(true);
              }
              return;
            }
          }
          forgetCode();
        }
        setNeedsName(true);
      } catch (err) {
        setError(err?.message || "Could not start the design tool.");
      } finally {
        setLoading(false);
      }
    })();
  }, [applyLoad]);

  // ---- mutations ----

  async function addItem(draft) {
    if (!code) return null;
    const draftWithDefaults = applyCarcassDefault(draft, carcassDefault);
    const wall = draftWithDefaults.wall || "top";
    const placement = findFreeWallSlot(wall, draftWithDefaults, items, room);
    const res = await fetch(`/api/public/design/${encodeURIComponent(code)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draftWithDefaults, ...placement, sort_order: items.length }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) { setSaveError(data.error || "Could not add that."); return null; }
    const item = applyCarcassDefault(data.item, carcassDefault);
    setItems((it) => [...it, item]);
    setSelectedItemId(item.id);
    return item;
  }

  async function duplicateItem(itemId) {
    if (!code) return null;
    const original = items.find((i) => i.id === itemId);
    if (!original) return null;
    const {
      id,
      created_at,
      updated_at,
      design_project_id,
      room_id,
      ...rest
    } = original;
    const payload = applyCarcassDefault({
      ...rest,
      label: original.label ? `${original.label} (copy)` : original.label,
      x_mm: (original.x_mm || 0) + 100,
      y_mm: (original.y_mm || 0) + 100,
      sort_order: items.length,
    }, carcassDefault);
    const res = await fetch(`/api/public/design/${encodeURIComponent(code)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setSaveError(data.error || `Could not duplicate that (${res.status}).`);
      return null;
    }
    const item = applyCarcassDefault(data.item, carcassDefault);
    setItems((it) => [...it, item]);
    setSelectedItemId(item.id);
    return item;
  }

  async function updateItem(itemId, patch) {
    if (!code) return { ok: false };
    try {
      const res = await fetch(`/api/public/design/${encodeURIComponent(code)}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, error: data.error || `Save failed (${res.status}).` };
      setItems((it) => it.map((x) => (x.id === itemId ? applyCarcassDefault(data.item, carcassDefault) : x)));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || "Save failed." };
    }
  }

  // Optimistic move/edit with revert-on-failure (drag has no inline indicator).
  function optimisticUpdate(itemId, patch) {
    let prev = null;
    setItems((it) => it.map((x) => { if (x.id === itemId) { prev = { ...x }; return { ...x, ...patch }; } return x; }));
    return updateItem(itemId, patch).then((res) => {
      if (res && res.ok === false) {
        if (prev) setItems((it) => it.map((x) => (x.id === itemId ? prev : x)));
        setSaveError(res.error || "Save failed.");
      }
      return res;
    });
  }

  function handleItemDragEnd(itemId, pos) { return optimisticUpdate(itemId, pos); }

  async function deleteItem(itemId) {
    if (!code) return;
    const res = await fetch(`/api/public/design/${encodeURIComponent(code)}/items/${itemId}`, { method: "DELETE" });
    if (!res.ok) { setSaveError("Could not delete that."); return; }
    setItems((it) => it.filter((x) => x.id !== itemId));
    setSelectedItemId(null);
  }

  async function updateRoom(patch) {
    if (!code) return;
    const res = await fetch(`/api/public/design/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: patch }),
    });
    const data = await res.json();
    if (res.ok && data.ok) { setRoom((data.rooms && data.rooms[0]) || room); if (data.project) setProject(data.project); }
  }

  // Back to the first screen rather than straight into a new empty room, so a
  // second design gets named the same way the first one did.
  function startOver() {
    forgetCode();
    setSelectedItemId(null);
    setItems([]);
    setRoom(null);
    setProject(null);
    setCode(null);
    codeRef.current = null;
    setError(null);
    setNamingExisting(false);
    setNeedsName(true);
  }

  // "Send my design to PCD" → creates a quote request from this design.
  async function submitToPcd(details) {
    if (!code) return { ok: false, error: "No design to send yet." };
    try {
      const res = await fetch(`/api/public/design/${encodeURIComponent(code)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
      });
      return await res.json();
    } catch {
      return { ok: false, error: "Could not send. Please check your connection and try again." };
    }
  }

  const selectedItem = items.find((i) => i.id === selectedItemId) || null;
  const overlappingItemIds = room ? findOverlappingItemIds(items, room) : new Set();

  return {
    code, project, room, items, selectedItem, selectedItemId, setSelectedItemId,
    loading, error, saveError, dismissSaveError: () => setSaveError(null),
    needsName, naming, namingExisting, nameAndStart, renameDesign,
    designName: project?.name || "",
    colourImages,
    addItem, duplicateItem, updateItem, handleItemDragEnd, deleteItem, updateRoom, startOver, submitToPcd,
    overlappingItemIds,
  };
}
