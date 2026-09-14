// WHAT IS FITTED INSIDE A CABINET: RAILS, BINS AND INSERTS.
//
// A wardrobe needs a hanging rail, a bin cabinet needs the bin. They are bought
// from the hardware library rather than cut from board, so a cabinet carries a
// list of them and each one becomes its own Hardware line on the quote, priced
// from the library the day it is staged. Decided 13 September 2026.
//
// ── WHAT AN ENTRY HOLDS ──────────────────────────────────────────────────────
//
//   id           ours, so a row can be changed and removed without ambiguity
//   hardware_id  the pcd_hardware row. THE price comes from here, every time:
//                the name and cost below are a copy for reading, never for
//                charging. See lib/pcd-design-to-lines.js.
//   name, type   what it was when it was picked, so a list still reads as
//                something if the library row is later retired
//   qty          how many in ONE cabinet. A cabinet's own qty multiplies it.
//   height_mm    up from the bottom of the carcass, the same datum shelf
//                heights use, so a drawing reads the two the same way. Null
//                means nobody has said, and it sits where that kind goes.
//   size         the library row's own width, height and depth, copied when it
//                was picked. FOR THE DRAWING ONLY: a shoe rail is drawn the
//                size the one we sell actually is. The price is never taken
//                from here, it is read from the library every time.
//
// Pure. Both the panel and the line generator read it, so a rail is in one
// place on screen and in the same place on the quote.

import { openBaySections } from "./pcd-door-utils";
import { hardwareTypeLabel, isAccessoryType } from "./pcd-hardware-types";

/** How many accessories one cabinet may carry. Far above anything real. */
const MAX_ACCESSORIES = 24;

const text = (value) => String(value ?? "").trim();

// Null, undefined and "" all mean "nobody has said", which for a height is a
// real answer: it sits where that kind goes. Number("") is 0, so this cannot be
// a bare Number() or an empty height box would pin a rail to the floor.
function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A fresh id. Ours, not the hardware row's: the same rail can be fitted twice. */
export function newAccessoryId() {
  return `acc-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The accessories on an item, always an array, always in the stored shape.
 *
 * Anything that is not an accessory kind is dropped rather than shown: a
 * handle that somehow reached this list is asked for on the Hardware section
 * and must not be charged twice.
 */
export function readAccessories(item = {}) {
  const raw = Array.isArray(item.accessories) ? item.accessories : [];
  return raw
    .filter((entry) => entry && typeof entry === "object" && text(entry.hardware_id) && isAccessoryType(entry.type))
    .slice(0, MAX_ACCESSORIES)
    .map((entry) => ({
      id: text(entry.id) || newAccessoryId(),
      hardware_id: text(entry.hardware_id),
      name: text(entry.name),
      type: text(entry.type),
      qty: Math.max(1, Math.round(number(entry.qty) || 1)),
      height_mm: number(entry.height_mm),
      size: readSize(entry.size),
    }));
}

/**
 * The library row's own size, cleaned. Empty when the row has none, which is
 * most of them: a drawing falls back to what fits the cabinet.
 */
export function readSize(size) {
  const out = {};
  for (const key of ["width_mm", "height_mm", "depth_mm"]) {
    const mm = number(size?.[key]);
    if (mm !== null && mm > 0) out[key] = mm;
  }
  return out;
}

/** The size to copy onto an accessory from the hardware row behind it. */
export function sizeFromHardware(row = {}) {
  return readSize({
    // A rail or a rack is listed either way round in the library, so a length
    // counts as a width when there is no width of its own.
    width_mm: row.width_mm ?? row.length_mm,
    height_mm: row.height_mm,
    depth_mm: row.depth_mm ?? row.projection_mm,
  });
}

export function accessoryCount(item = {}) {
  return readAccessories(item).reduce((total, entry) => total + entry.qty, 0);
}

/** "Oval Hanging Rail", or the kind when the row was saved without a name. */
export function accessoryLabel(entry = {}) {
  return text(entry.name) || hardwareTypeLabel(entry.type);
}

/** The section's collapsed summary: what is in there, not how many kinds. */
export function accessorySummary(item = {}) {
  const list = readAccessories(item);
  if (!list.length) return "None";
  return list.map((entry) => (entry.qty > 1 ? `${entry.qty} x ${accessoryLabel(entry)}` : accessoryLabel(entry))).join(", ");
}

// ── THE INSIDE OF THE CABINET ────────────────────────────────────────────────
//
// The same arithmetic the cut list does (lib/pcd-cabinet-utils.js): the box
// less a board either side. Here so the panel can offer a sensible height and
// the quote can say how long to cut a rail, without pulling the whole cut list
// in to answer it.

export function carcassThicknessMm(item = {}) {
  return Math.max(0, number(item.carcass_thickness_mm) || 16);
}

export function insideWidthMm(item = {}) {
  const width = number(item.width_mm) || 0;
  return Math.max(0, width - carcassThicknessMm(item) * 2);
}

export function insideHeightMm(item = {}) {
  const height = number(item.height_mm) || 0;
  return Math.max(0, height - carcassThicknessMm(item) * 2);
}

/**
 * Where this kind normally goes, up from the bottom of the carcass.
 *
 * A hanging rail hangs near the top with room for a hanger to come off it; a
 * bin stands on the floor of the cabinet; a light sits under the top. Every one
 * of them can be typed over, and phase B lets them be dragged.
 */
export const RAIL_DROP_MM = 60;

/** A trouser rack hangs near the top, because the trousers need the drop. */
export const TROUSER_RACK_DROP_MM = 150;

export function accessoryDefaultHeightMm(type, item = {}) {
  const thickness = carcassThicknessMm(item);
  // ON A MIXED FRONT THE OPEN BAY IS THE CABINET, as far as an accessory is
  // concerned. A wardrobe that is drawers below and open above has one place a
  // rail can go, and putting it 60mm under the cabinet's own top would hang it
  // inside the drawer bank on a cabinet built the other way up.
  // Only on a mixed front. A cabinet switched back to plain doors can still be
  // carrying the bays it used to have, and they mean nothing now.
  const bays = (item.front_type || "none") === "mixed" ? openBaySections(item) : [];
  const top = bays.length ? Math.max(...bays.map((bay) => Number(bay.topMm) || 0)) : thickness + insideHeightMm(item);
  const floor = bays.length
    ? Math.min(...bays.filter((bay) => (Number(bay.topMm) || 0) === top).map((bay) => Number(bay.bottomMm) || 0))
    : thickness;

  if (type === "wardrobe_hanging_rail") return Math.max(floor, Math.round(top - RAIL_DROP_MM));
  if (type === "cabinet_inserts") return Math.max(floor, Math.round(top));
  if (type === "pull_out_trouser_rack") return Math.max(floor, Math.round(top - TROUSER_RACK_DROP_MM));
  return Math.round(floor);
}

/**
 * Whether this accessory can be seen in the room, or is behind a closed front.
 *
 * The rule shelves already follow, and the reason a rail added to a wardrobe
 * with drawers below and open space above did not appear in 3D: the check was
 * "is the whole front open", so a mixed cabinet hid everything inside it, open
 * bay and all. A mixed front is judged bay by bay instead, on the same datum
 * the height is set in.
 *
 * The elevation is a working drawing and shows accessories whatever is in
 * front of them; this is only for the 3D room, where a door is a door.
 */
export function accessoryShowsInRoom(entry = {}, item = {}) {
  const front = item.front_type || "none";
  if (front === "none") return true;
  if (front !== "mixed") return false;
  const height = accessoryHeightMm(entry, item);
  return openBaySections(item).some(
    (bay) => height >= (Number(bay.bottomMm) || 0) && height <= (Number(bay.topMm) || 0)
  );
}

/** The height to use for an entry: what was set, or where that kind goes. */
export function accessoryHeightMm(entry = {}, item = {}) {
  const set = number(entry.height_mm);
  return set === null ? accessoryDefaultHeightMm(entry.type, item) : set;
}

// ── CHANGING THE LIST ────────────────────────────────────────────────────────
//
// Each returns the WHOLE list, ready to save, the same way withPanelOption
// returns the whole panel map.

export function withAccessory(item = {}, entry = {}) {
  const list = readAccessories(item);
  const id = text(entry.id) || newAccessoryId();
  const next = {
    id,
    hardware_id: text(entry.hardware_id),
    name: text(entry.name),
    type: text(entry.type),
    qty: Math.max(1, Math.round(number(entry.qty) || 1)),
    height_mm: number(entry.height_mm),
    size: readSize(entry.size),
  };
  if (!next.hardware_id || !isAccessoryType(next.type)) return list;
  const found = list.some((row) => row.id === id);
  if (found) return list.map((row) => (row.id === id ? next : row));
  return list.length >= MAX_ACCESSORIES ? list : [...list, next];
}

export function patchAccessory(item = {}, id, patch = {}) {
  return readAccessories(item).map((row) => {
    if (row.id !== id) return row;
    const next = { ...row, ...patch };
    return {
      ...next,
      qty: Math.max(1, Math.round(number(next.qty) || 1)),
      height_mm: number(next.height_mm),
      size: readSize(next.size),
    };
  });
}

export function withoutAccessory(item = {}, id) {
  return readAccessories(item).filter((row) => row.id !== id);
}

/**
 * The list again with each entry brought back in line with the library row it
 * came from: its kind, its name and its size.
 *
 * An accessory copies those three when it is picked, so a row retyped or
 * remeasured afterwards leaves every cabinet already carrying it stuck with the
 * old answer, and a rack filed under the wrong kind is drawn as the wrong kind
 * or not at all. Returns null when nothing needs changing, so the panel can
 * leave the design alone rather than save on every open.
 *
 * The height is never touched: that is the designer's, not the library's. A row
 * that has been deleted or retired is left exactly as it is, because losing an
 * accessory off a cabinet is worse than showing a stale name.
 */
export function refreshedAccessories(item = {}, rows = []) {
  const byId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = text(row?.id);
    if (id) byId.set(id, row);
  }
  const list = readAccessories(item);
  let changed = false;
  const next = list.map((entry) => {
    const row = byId.get(entry.hardware_id);
    if (!row || !isAccessoryType(row.type)) return entry;
    const name = text([row.brand, row.name].filter(Boolean).join(" ")) || entry.name;
    const size = sizeFromHardware(row);
    const same =
      row.type === entry.type &&
      name === entry.name &&
      size.width_mm === entry.size.width_mm &&
      size.height_mm === entry.size.height_mm &&
      size.depth_mm === entry.size.depth_mm;
    if (same) return entry;
    changed = true;
    return { ...entry, type: row.type, name, size };
  });
  return changed ? next : null;
}

// ── WHAT IS WRONG WITH ONE ───────────────────────────────────────────────────

/**
 * Anything on this cabinet's accessories somebody should look at, in plain
 * words. Read by the staging pre-flight, so a rail sitting outside the box is
 * seen before the quote is made rather than on the bench.
 */
export function accessoryProblems(item = {}) {
  const problems = [];
  const thickness = carcassThicknessMm(item);
  const top = thickness + insideHeightMm(item);
  for (const entry of readAccessories(item)) {
    const height = accessoryHeightMm(entry, item);
    if (height < thickness || height > top) {
      problems.push(`${accessoryLabel(entry)} sits at ${Math.round(height)}mm, outside this cabinet.`);
    }
  }
  return problems;
}
