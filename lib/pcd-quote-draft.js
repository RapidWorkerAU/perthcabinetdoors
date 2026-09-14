"use client";

import { useSyncExternalStore } from "react";

// THE QUOTE REQUEST SOMEBODY IS PART WAY THROUGH WRITING.
//
// Building the request is now three pages rather than one: the builder at
// /request-quote, the list at /request-quote/list, and who they are at
// /request-quote/send. Three pages means three component trees, and a list held
// in the builder's own state would not survive the walk to the second one.
//
// So the lines live here. The builder owns them while it is on screen and
// mirrors every change into this store; the other two read it. Somebody can
// close the tab on the way to find a tape measure and come back to their list,
// which is the behaviour a cart has and the reason it is worth the storage.
//
// ── WHY THIS IS NOT pcd-quote-list.js ────────────────────────────────────────
//
// That store holds ENTRIES: things chosen in the IKEA configurator, which each
// expand into several quote lines. It is an inbox. The builder drains it on
// mount and clears it, deliberately, so a cabinet cannot be imported twice.
//
// This holds LINES: the request itself, after the builder has had them. Two
// stores because they have opposite lifetimes. Merging them would mean either
// re-importing the configurator's cabinets on every visit, or losing the
// request the moment the inbox was cleared.
//
// ── WHAT IS AND IS NOT KEPT ──────────────────────────────────────────────────
//
// Lines and contact details. Not the name of the file somebody uploaded and not
// anything we would have to be careful about: it is a list of doors and a way
// to reach them about it, which is exactly what they are about to send us
// anyway. It is cleared the moment the request is sent.

const STORAGE_KEY = "pcd.quote-draft.v1";
const MAX_LINES = 200;

// ── "WE HAVE NOT LOOKED" IS NOT "IT IS EMPTY" ────────────────────────────────
//
// A server render has no localStorage, so the first paint of every page here is
// an empty list whatever the customer actually has. Without something marking
// that apart, the list page tells somebody with nine doors on it that their
// list is empty, for as long as it takes to hydrate. That is the one sentence
// on the page they must be able to believe.
//
// So the draft carries whether it has been read yet, and the pages hold their
// empty state until it has.
const SERVER_DRAFT = { lines: [], details: {}, ready: false };

let draft = SERVER_DRAFT;
let hydrated = false;
const listeners = new Set();

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Whatever came back off the disk, forced into the shape the pages expect.
 *
 * Always ready: this only ever runs where there is somewhere to have read from,
 * so an empty result here means an empty list rather than an unread one.
 */
function clean(value) {
  const source = value && typeof value === "object" ? value : {};
  const lines = Array.isArray(source.lines) ? source.lines.slice(0, MAX_LINES) : [];
  const details = source.details && typeof source.details === "object" ? source.details : {};
  return { lines, details, ready: true };
}

function hydrate() {
  if (hydrated || !canUseStorage()) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    draft = clean(raw ? JSON.parse(raw) : null);
  } catch {
    // Unreadable is still read: we looked, and there is nothing usable there.
    draft = clean(null);
  }
}

function persist() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Private browsing or a full quota. The pages still work for this visit;
    // the list just will not survive a reload. Not worth interrupting anyone
    // over, and certainly not worth blocking the request they came to send.
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function commit(next) {
  draft = clean(next);
  persist();
  emit();
}

function subscribe(listener) {
  hydrate();
  listeners.add(listener);
  // The same list open in two tabs. Editing it in one and sending it from the
  // other is how somebody ends up sending a request they thought they had
  // changed.
  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      draft = clean(event.newValue ? JSON.parse(event.newValue) : null);
    } catch {
      draft = clean(null);
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
  return draft;
}

// The same object every time, because returning a fresh one makes
// useSyncExternalStore loop. ready is false on it, which is how the pages know
// this is the server's answer and not the customer's.
function getServerSnapshot() {
  return SERVER_DRAFT;
}

export function useQuoteDraft() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** One-shot read, for the builder seeding its own state on mount. */
export function readQuoteDraft() {
  hydrate();
  return draft;
}

/** The builder handing over what it now holds. */
export function writeQuoteLines(lines) {
  hydrate();
  commit({ ...draft, lines: Array.isArray(lines) ? lines : [] });
}

export function writeQuoteDetails(details) {
  hydrate();
  commit({ ...draft, details: { ...draft.details, ...details } });
}

/**
 * One line, changed in place.
 *
 * The list page can change a quantity and remove a line, and nothing else: it
 * is a list, not a second copy of the builder. Anything more than a number goes
 * back to the builder, which is the only place that knows what a thermolaminate
 * front may and may not be asked.
 */
export function setLineQty(id, qty) {
  hydrate();
  const next = Math.max(1, Math.round(Number(qty) || 1));
  commit({
    ...draft,
    lines: draft.lines.map((line) => (line.id === id ? { ...line, qty: next } : line)),
  });
}

export function removeLine(id) {
  hydrate();
  commit({ ...draft, lines: draft.lines.filter((line) => line.id !== id) });
}

/** Sent, or deliberately abandoned. */
export function clearQuoteDraft() {
  hydrate();
  commit({ lines: [], details: {} });
}

/** How many things are on the list, for the badge in the nav. */
export function useQuoteDraftCount() {
  return draftItemCount(useQuoteDraft().lines);
}

/** How many things are on the list, counting quantities. */
export function draftItemCount(lines) {
  return (Array.isArray(lines) ? lines : []).reduce(
    (total, line) => total + Math.max(1, Number(line.qty) || 1),
    0
  );
}
