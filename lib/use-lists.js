"use client";

import { useEffect, useState } from "react";
import { LISTS, builtinItems, labelFor, optionsFor } from "./pcd-lists";

// THE LISTS, ONCE PER PAGE, for the screens that offer them.
//
// ── WHY A MODULE LEVEL CACHE ─────────────────────────────────────────────────
//
// An order page renders several dropdowns that read these, and a hook that
// fetched per component would ask for the same seven lists four times on one
// load. The promise is shared, so the second caller waits on the first request
// rather than starting another.
//
// It is deliberately not refreshed after that. These change when somebody edits
// them in Settings, which is a different page: a reload gets the new ones, and
// polling for a list that changes twice a year is not worth the requests.
//
// ── IT NEVER RENDERS NOTHING ─────────────────────────────────────────────────
//
// Before the fetch lands, and if it fails outright, the built-in items are
// returned. A dropdown that is briefly empty on load, or empty forever because
// of a network blip, reads as a decision somebody made rather than as a screen
// that has not finished.

let cache = null;
let inFlight = null;

const builtinAll = () => LISTS.flatMap((list) => builtinItems(list.key));

async function fetchLists() {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = fetch("/api/admin/lists", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload?.ok) throw new Error(payload?.error || "Could not load the lists.");
        cache = (payload.lists || []).flatMap((list) =>
          (list.items || []).map((item) => ({ ...item, list_key: list.key }))
        );
        return cache;
      })
      .catch((error) => {
        console.error(`[lists] falling back to the built-in options: ${error?.message || error}`);
        // NOT cached. A blip should not pin the built-ins in place for the rest
        // of the session; the next component to mount tries again.
        return builtinAll();
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Drop the cache, so the next read goes back to the server. */
export function forgetLists() {
  cache = null;
}

/**
 * @returns {{ready: boolean, itemsFor: Function, optionsFor: Function, labelFor: Function}}
 */
export function useLists() {
  const [items, setItems] = useState(() => cache || builtinAll());
  const [ready, setReady] = useState(Boolean(cache));

  useEffect(() => {
    let live = true;
    fetchLists().then((rows) => {
      if (!live) return;
      setItems(rows);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const itemsFor = (listKey) => items.filter((item) => item.list_key === listKey);

  return {
    ready,
    itemsFor,
    /** What a dropdown should offer, including whatever this record holds. */
    optionsFor: (listKey, currentKey = "") => optionsFor(itemsFor(listKey), currentKey),
    /** The words for a stored value, wherever it came from. */
    labelFor: (listKey, key) => labelFor(itemsFor(listKey), key, listKey),
  };
}
