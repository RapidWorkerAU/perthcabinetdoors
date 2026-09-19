// WHAT DAYS THE WEBSITE MAY OFFER, AND WHY EACH ONE IS OR IS NOT ON IT.
//
// ── WHY THIS IS PURE, AND ITS OWN FILE ───────────────────────────────────────
//
// Two things decide what is bookable, and they must never disagree:
//
//   the public page  draws a day as available
//   the API route    accepts or refuses the booking for that day
//
// If the page offered a day the route refused, a customer reaches a payment
// page for a day that is full. If the route accepted a day the page never
// offered, capacity means nothing. So the rule lives here, once, with no
// database and no framework anywhere near it, and both read it.
//
// ── PERTH, NOT THE SERVER, AND NOT THE BROWSER ───────────────────────────────
//
// Every day boundary in here is a Perth day. Taken as UTC the calendar is a day
// behind for the first eight hours of every working day, which is the same bug
// the board and the calendar have both already had to fix. See pcd-calendar.js.
//
// ── A SNAPSHOT IS TAKEN, NOT A REFERENCE ─────────────────────────────────────
//
// The window a customer is shown is written onto their booking. Moving Tuesday
// from the afternoon to the morning must not rewrite what an existing Tuesday
// booking promised. Nothing here reads a stored booking's window back through
// the settings, and nothing should.

import { addDays, dayOfWeek, formatDay, formatMinutes, parseDay, perthToday } from "./pcd-calendar";

/** Monday first, because the working week is. Index matches dayOfWeek order below. */
export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const DAY_LABELS = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

/** The order a person reads a week in, which is not the order dayOfWeek returns. */
export const WEEK_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * What the website offers when the settings row cannot be read.
 *
 * NOT a fallback that quietly wins. is_live is false here, so an unreadable
 * settings row means the booking page says it is not taking bookings rather
 * than inventing an availability nobody configured. The safe direction for
 * something that takes money.
 */
export const DEFAULT_BOOKING_SETTINGS = {
  days: {
    mon: { open: false, from: "09:00", to: "12:00" },
    tue: { open: true,  from: "15:00", to: "18:00" },
    wed: { open: true,  from: "15:00", to: "18:00" },
    thu: { open: true,  from: "09:00", to: "12:00" },
    fri: { open: false, from: "09:00", to: "12:00" },
    sat: { open: false, from: "09:00", to: "12:00" },
    sun: { open: false, from: "09:00", to: "12:00" },
  },
  max_per_day: 2,
  fee_inc_gst: 100,
  notice_days: 3,
  horizon_weeks: 8,
  confirm_hours: 48,
  closed_dates: [],
  postcodes: "",
  is_live: false,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function clampInt(value, fallback, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanTime(value, fallback) {
  const text = String(value || "").slice(0, 5);
  return TIME_RE.test(text) ? text : fallback;
}

/** Minutes past midnight for "15:00". Null when it is not a time. */
export function minutesOfTime(value) {
  const text = String(value || "").slice(0, 5);
  if (!TIME_RE.test(text)) return null;
  const [hours, minutes] = text.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * The settings, whatever shape the row came back in.
 *
 * A day whose window is backwards is treated as CLOSED rather than corrected.
 * Correcting it would invent a window nobody chose and sell it; closing it is
 * visible on the settings screen and costs one booking, not one wrong promise.
 */
export function normalizeBookingSettings(row = {}) {
  const source = row || {};
  const rawDays = source.days && typeof source.days === "object" ? source.days : {};
  const days = {};

  for (const key of WEEK_ORDER) {
    const fallback = DEFAULT_BOOKING_SETTINGS.days[key];
    // A day the row does not mention at all falls back to the default, INCLUDING
    // whether it is open. A day it does mention is read as written, so a
    // deliberately closed Tuesday stays closed. Reading a missing key as false
    // closed every day the moment anything called this without a days object,
    // which is every caller that has only a fee to apply.
    const stored = rawDays[key] && typeof rawDays[key] === "object" ? rawDays[key] : null;
    const entry = stored || fallback;
    const from = cleanTime(entry.from, fallback.from);
    const to = cleanTime(entry.to, fallback.to);
    // A window that closes before it opens shuts the day rather than being
    // silently corrected. Correcting it would invent a window nobody chose and
    // then sell it; shutting it is visible on the settings screen.
    const usable = minutesOfTime(to) > minutesOfTime(from);
    days[key] = { open: Boolean(entry.open) && usable, from, to };
  }

  return {
    days,
    max_per_day: clampInt(source.max_per_day, DEFAULT_BOOKING_SETTINGS.max_per_day, 1, 20),
    fee_inc_gst: Math.max(0, Math.round((Number(source.fee_inc_gst ?? DEFAULT_BOOKING_SETTINGS.fee_inc_gst) || 0) * 100) / 100),
    notice_days: clampInt(source.notice_days, DEFAULT_BOOKING_SETTINGS.notice_days, 0, 60),
    horizon_weeks: clampInt(source.horizon_weeks, DEFAULT_BOOKING_SETTINGS.horizon_weeks, 1, 52),
    confirm_hours: clampInt(source.confirm_hours, DEFAULT_BOOKING_SETTINGS.confirm_hours, 1, 336),
    closed_dates: Array.isArray(source.closed_dates)
      ? [...new Set(source.closed_dates.map((d) => String(d).slice(0, 10)).filter((d) => parseDay(d)))].sort()
      : [],
    postcodes: String(source.postcodes || ""),
    is_live: Boolean(source.is_live),
  };
}

/** The mon..sun key for a plain day. */
export function dayKeyOf(day) {
  return DAY_KEYS[dayOfWeek(day)] || "mon";
}

/** The window for a day, or null when we are not out that weekday. */
export function windowForDay(settings, day) {
  const entry = settings?.days?.[dayKeyOf(day)];
  if (!entry || !entry.open) return null;
  const from = minutesOfTime(entry.from);
  const to = minutesOfTime(entry.to);
  if (from === null || to === null || to <= from) return null;
  return { from: entry.from, to: entry.to, fromMinutes: from, toMinutes: to };
}

/** How long the block runs, in whole hours where it divides, else one decimal. */
export function windowHours(window) {
  if (!window) return 0;
  const hours = (window.toMinutes - window.fromMinutes) / 60;
  return Math.round(hours * 10) / 10;
}

/** "3pm and 6pm", the shape the sentence around it expects. */
export function windowWords(window) {
  if (!window) return "";
  return `${formatMinutes(window.fromMinutes)} and ${formatMinutes(window.toMinutes)}`;
}

/** The first and last day the website will offer, as plain days. */
export function bookableRange(settings, today = perthToday()) {
  return {
    earliest: addDays(today, Math.max(0, Number(settings?.notice_days) || 0)),
    latest: addDays(today, (Number(settings?.horizon_weeks) || 1) * 7),
  };
}

/**
 * Why a day is or is not offered.
 *
 * Returns one of:
 *   "free"    offered, with room left
 *   "full"    the right weekday, inside the range, and already at capacity
 *   "closed"  a day we do not go out, a closed date, or outside the range
 *
 * THREE ANSWERS, NOT TWO, because "full" and "closed" are different things to
 * a customer looking at a calendar, and a day that is simply not a day we work
 * should not read as one we have sold out.
 */
export function dayState(settings, day, { today = perthToday(), used = 0 } = {}) {
  if (!parseDay(day)) return "closed";
  if (!windowForDay(settings, day)) return "closed";
  if ((settings?.closed_dates || []).includes(day)) return "closed";

  const { earliest, latest } = bookableRange(settings, today);
  if (day < earliest || day > latest) return "closed";

  const cap = Math.max(1, Number(settings?.max_per_day) || 1);
  return used >= cap ? "full" : "free";
}

/** Places left on a day. Never negative, because a day sold twice is still sold. */
export function placesLeft(settings, used = 0) {
  const cap = Math.max(1, Number(settings?.max_per_day) || 1);
  return Math.max(0, cap - (Number(used) || 0));
}

/**
 * Every day the website should draw, from the earliest bookable to the horizon.
 *
 * Returns rows the page renders directly, so the page does no date arithmetic
 * of its own. usedByDay is { "2026-10-06": 2 }, counted by the caller from the
 * bookings table, because only the server can know that.
 */
export function availabilityCalendar(settings, { today = perthToday(), usedByDay = {} } = {}) {
  const { earliest, latest } = bookableRange(settings, today);
  const out = [];
  let day = earliest;
  let guard = 0;

  while (day && day <= latest && guard < 400) {
    guard += 1;
    const used = Number(usedByDay[day]) || 0;
    const state = dayState(settings, day, { today, used });
    const window = windowForDay(settings, day);
    out.push({
      day,
      state,
      left: state === "free" ? placesLeft(settings, used) : 0,
      window: window ? { from: window.from, to: window.to } : null,
      windowWords: windowWords(window),
      hours: windowHours(window),
      label: formatDay(day, { long: true }),
    });
    day = addDays(day, 1);
  }
  return out;
}

/**
 * Is this postcode one we drive to?
 *
 * The list is "6000-6199, 6207", the same spelling the delivery pricing uses.
 * An EMPTY list means yes to everything, deliberately: refusing every customer
 * because nobody filled the box in would be a silent outage, and the box being
 * empty is visible on the settings screen.
 */
export function postcodeAllowed(settings, postcode) {
  const list = String(settings?.postcodes || "").trim();
  if (!list) return true;
  const value = Number(String(postcode || "").trim());
  if (!Number.isFinite(value)) return false;

  return list.split(",").some((part) => {
    const piece = part.trim();
    if (!piece) return false;
    const range = piece.match(/^(\d{3,4})\s*-\s*(\d{3,4})$/);
    if (range) return value >= Number(range[1]) && value <= Number(range[2]);
    return Number(piece) === value;
  });
}

/**
 * Everything the public page is allowed to know.
 *
 * The settings row holds a postcode list and a live flag that are ours, not
 * theirs. This is what crosses to the browser, and it is built here rather than
 * in the route so a second route cannot leak a different shape.
 */
export function publicBookingView(settings, { today = perthToday(), usedByDay = {} } = {}) {
  const days = availabilityCalendar(settings, { today, usedByDay });
  return {
    isLive: Boolean(settings?.is_live),
    fee: Number(settings?.fee_inc_gst) || 0,
    confirmHours: Number(settings?.confirm_hours) || 48,
    noticeDays: Number(settings?.notice_days) || 0,
    today,
    days,
    // Convenience for a page that only wants what it can sell.
    firstFree: days.find((d) => d.state === "free")?.day || null,
    anyFree: days.some((d) => d.state === "free"),
  };
}
