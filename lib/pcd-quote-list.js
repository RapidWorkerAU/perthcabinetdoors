"use client";

import { useSyncExternalStore } from "react";

// The one list of things a customer wants quoted, shared by every page.
//
// The site used to hold two lists that could not see each other: the IKEA
// configurator kept its own array in component state, and /request-quote had a
// separate line-item builder. Leaving the configurator threw its list away,
// which is why "Need a whole new cabinet?" read as a dead end - it was one.
//
// This is a plain module-level store rather than React context because the nav
// is rendered per page rather than once in a layout, so there is no single tree
// to hang a provider on. Components subscribe with useQuoteList().
//
// An ENTRY is one thing the customer chose ("3 drawers on a 600x800 Metod").
// A configured entry expands to several quote LINES, because three drawers are
// three fronts at different heights and each needs its own price. The drawer
// shows entries; /request-quote receives lines.

const STORAGE_KEY = "pcd.quote-list.v1";
const MAX_ENTRIES = 200;

let entries = [];
let hydrated = false;
const listeners = new Set();

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function hydrate() {
  if (hydrated || !canUseStorage()) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) entries = parsed.slice(0, MAX_ENTRIES);
  } catch {
    entries = [];
  }
}

function persist() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Private browsing or a full quota — the list still works for this page
    // view, it just will not survive a reload. Not worth interrupting anyone.
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function commit(next) {
  entries = next.slice(0, MAX_ENTRIES);
  persist();
  emit();
}

function subscribe(listener) {
  hydrate();
  listeners.add(listener);
  // Another tab editing the same list should update this one.
  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      const parsed = event.newValue ? JSON.parse(event.newValue) : [];
      entries = Array.isArray(parsed) ? parsed : [];
    } catch {
      entries = [];
    }
    emit();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  hydrate();
  return entries;
}

// Server render has no localStorage, so it always starts empty and fills in
// after hydration. The badge is hidden at zero, so nothing visibly flickers.
const EMPTY = [];
function getServerSnapshot() {
  return EMPTY;
}

export function useQuoteList() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// One-shot read for code that wants the list without subscribing to it -
// /request-quote imports the entries once on mount and then owns them.
export function readQuoteList() {
  hydrate();
  return entries;
}

export function useQuoteListCount() {
  const list = useQuoteList();
  return list.reduce((total, entry) => total + Math.max(1, Number(entry.qty) || 1), 0);
}

function makeId() {
  return `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function addEntry(entry) {
  hydrate();
  const next = { ...entry, id: entry.id || makeId(), qty: Math.max(1, Number(entry.qty) || 1) };
  commit([...entries, next]);
  return next.id;
}

export function removeEntry(id) {
  hydrate();
  commit(entries.filter((entry) => entry.id !== id));
}

export function setEntryQty(id, qty) {
  hydrate();
  const clamped = Math.max(1, Number(qty) || 1);
  commit(entries.map((entry) => (entry.id === id ? { ...entry, qty: clamped } : entry)));
}

export function clearList() {
  hydrate();
  commit([]);
}

export function replaceList(nextEntries) {
  hydrate();
  commit(Array.isArray(nextEntries) ? nextEntries : []);
}

// Expands entries into the line shape /request-quote's builder already uses, so
// items arriving from the configurator are indistinguishable from ones typed in
// by hand — same fields, same editing, same submit.
export function entriesToQuoteLines(list = entries) {
  const lines = [];

  list.forEach((entry) => {
    const qty = Math.max(1, Number(entry.qty) || 1);

    if (entry.kind === "custom") {
      lines.push({
        type: entry.itemType || "",
        material: entry.material || "",
        thickness: entry.thickness || "",
        width: entry.width ? String(entry.width) : "",
        height: entry.height ? String(entry.height) : "",
        qty: String(qty),
        finish: entry.finish || "",
        colour: entry.colour || "",
        colourSrc: "",
        edgeMould: "",
        profileType: entry.profileType || "",
        profile: entry.profile || "",
        preDrill: false,
        hinges: false,
        hingeQty: "",
        note: entry.note || "",
        fromList: true,
      });
      return;
    }

    // A front layout is several pieces at different sizes — one line each.
    (entry.pieces || []).forEach((piece) => {
      lines.push({
        type: piece.type || "",
        material: entry.material || "",
        thickness: entry.thickness || "",
        width: piece.width ? String(Math.round(piece.width)) : "",
        height: piece.height ? String(Math.round(piece.height)) : "",
        qty: String(qty),
        finish: entry.finish || "",
        colour: entry.colour || "",
        colourSrc: "",
        edgeMould: "",
        profileType: entry.profileType || "",
        profile: entry.profile || "",
        preDrill: piece.type === "Door",
        hinges: false,
        hingeQty: "",
        note: entry.title || "",
        fromList: true,
      });
    });
  });

  return lines;
}
