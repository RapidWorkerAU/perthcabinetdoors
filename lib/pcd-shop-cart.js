"use client";

import { useSyncExternalStore } from "react";
import { cartPieceCount } from "./pcd-shop";

// THE CART. SEPARATE FROM THE QUOTE LIST, AND ONLY EVER SEPARATE.
//
// Two baskets that cannot be mixed, decided 8 September 2026: this one holds
// decorative board fronts with a live price that can be paid for now, and the
// quote list (lib/pcd-quote-draft.js) holds anything at all, unpriced, to be
// sent. Two stores, two keys, two pages. Neither ever adds the other into its
// own total; each only names the other and links across.
//
// Built the same way as the quote draft: kept in the browser so it survives a
// closed tab and a walk to find the tape measure, in sync across tabs, and
// honest about not having looked yet on the first server render.
//
// ── WHAT A LINE CARRIES ──────────────────────────────────────────────────────
//
// The shop line (see lib/pcd-shop.js), plus `price`: what it cost when it went
// in, so the cart can show a figure before the server has answered. The cart
// asks the server again every time it opens and the checkout charges only what
// the server says, so this is a first paint and never a promise.

const STORAGE_KEY = "pcd.shop-cart.v1";
const MAX_LINES = 100;

const SERVER_CART = { lines: [], details: {}, lastQuoteId: "", ready: false };

let cart = SERVER_CART;
let hydrated = false;
const listeners = new Set();

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function clean(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    lines: Array.isArray(source.lines) ? source.lines.slice(0, MAX_LINES) : [],
    details: source.details && typeof source.details === "object" ? source.details : {},
    lastQuoteId: typeof source.lastQuoteId === "string" ? source.lastQuoteId : "",
    ready: true,
  };
}

function hydrate() {
  if (hydrated || !canUseStorage()) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cart = clean(raw ? JSON.parse(raw) : null);
  } catch {
    cart = clean(null);
  }
}

function persist() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Private browsing or a full quota: the cart works for this visit and
    // simply will not survive a reload.
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function commit(next) {
  cart = clean(next);
  persist();
  emit();
}

function subscribe(listener) {
  hydrate();
  listeners.add(listener);
  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      cart = clean(event.newValue ? JSON.parse(event.newValue) : null);
    } catch {
      cart = clean(null);
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
  return cart;
}

function getServerSnapshot() {
  return SERVER_CART;
}

export function useShopCart() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function readShopCart() {
  hydrate();
  return cart;
}

/** A new line, or a changed one replacing the line it was opened from. */
export function saveCartLine(line) {
  hydrate();
  const exists = cart.lines.some((entry) => entry.id === line.id);
  commit({
    ...cart,
    lines: exists ? cart.lines.map((entry) => (entry.id === line.id ? line : entry)) : [...cart.lines, line],
  });
  return exists;
}

export function setCartLineQty(id, qty) {
  hydrate();
  const next = Math.max(1, Math.round(Number(qty) || 1));
  commit({ ...cart, lines: cart.lines.map((line) => (line.id === id ? { ...line, qty: next } : line)) });
}

export function removeCartLine(id) {
  hydrate();
  commit({ ...cart, lines: cart.lines.filter((line) => line.id !== id) });
}

/** The server's latest figure for each line, kept for the next first paint. */
export function rememberCartPrices(prices = []) {
  hydrate();
  const byId = new Map(prices.filter((entry) => entry.ok).map((entry) => [entry.id, entry]));
  if (!byId.size) return;
  commit({
    ...cart,
    lines: cart.lines.map((line) => (byId.has(line.id) ? { ...line, price: byId.get(line.id) } : line)),
  });
}

export function writeCheckoutDetails(details) {
  hydrate();
  commit({ ...cart, details: { ...cart.details, ...details } });
}

/** The quote behind the payment page they were last sent to, so a second go can close the first. */
export function rememberCheckout(quoteId) {
  hydrate();
  commit({ ...cart, lastQuoteId: quoteId || "" });
}

/** Paid. The lines are made now, so the cart is emptied; their details are kept for next time. */
export function clearShopCart() {
  hydrate();
  commit({ lines: [], details: cart.details, lastQuoteId: "" });
}

export function useCartCount() {
  return cartPieceCount(useShopCart().lines);
}
