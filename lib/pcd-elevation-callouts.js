// WHAT IS INSIDE A CABINET, AND HOW HIGH, FOR THE CUSTOMER'S DRAWING.
//
// An approval elevation shows closed doors. Everything the customer is
// actually buying, the hanging rails, the shoe rack, how tall each drawer is,
// how much hanging space there is under the top rail, was invisible on it:
// they signed off a black rectangle and found out the rest on installation
// day. Decided 13 September 2026.
//
// ── WHAT A CALLOUT IS ────────────────────────────────────────────────────────
//
// A LEVEL is a horizontal line inside a cabinet with a name: the top of a
// shelf, the centre of a rail, the base of a pull-out, the top of a drawer
// front. A GAP is the clear space between two consecutive levels, which is the
// number people actually ask about: how long is the hanging, how deep is that
// drawer, how far apart are the shelves.
//
// Every height here is ABOVE THE FINISHED FLOOR, not up from the carcass the
// way the tool stores them, because that is the only datum a customer can put
// a tape measure on.
//
// ── ONE DEFINITION ───────────────────────────────────────────────────────────
//
// Pure, and free of any drawing. The elevation reads it to place the ladder and
// the names; anything else that needs to say what is in a cabinet reads the
// same list rather than working it out again.

import { accessoryHeightMm, accessoryLabel, readAccessories } from "./pcd-cabinet-accessories";
import { bayShelfHeightsMm, cabinetShelfHeightsMm, drawerGapMm, frontRevealMm, mixedBaySections, scaleDrawerHeightsMm } from "./pcd-door-utils";
import { computeDrawerFrontHeights } from "./pcd-drawer-utils";
import { kickboardOffsetMm, mountHeightMm } from "./pcd-kickboard-utils";
import { shelfRailConfig } from "./pcd-shelf-rail-utils";

const CABINETS = new Set([
  "base_cabinet", "wall_cabinet", "tall_cabinet",
  "corner_base_cabinet", "corner_tall_cabinet", "blind_corner_cabinet", "bookcase",
]);

/** A gap smaller than this is a construction detail, not something to dimension. */
export const MIN_GAP_MM = 90;

/** Two levels within this of each other are the same line on a drawing. */
const SAME_LEVEL_MM = 12;

/**
 * Two ticks closer than this share one tick on the ladder.
 *
 * A drawer bank puts a 20mm reveal above every front, which is real and is on
 * the cut list, and which turned a ladder into seventeen ticks alternating 20
 * and 184. The reveal is not what anybody is reading the drawing for.
 */
const TICK_MERGE_MM = 40;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Where the bottom of this item's carcass sits above the floor. */
export function itemBaseMm(item = {}) {
  return num(mountHeightMm(item)) + num(kickboardOffsetMm(item));
}

/**
 * The levels inside one item, top down, each measured above the floor.
 *
 * Returns [] for anything with nothing worth saying, which is most obstructions
 * and any cabinet nobody has put anything in.
 */
export function itemLevels(item = {}) {
  const base = itemBaseMm(item);
  const height = num(item.height_mm);
  const carcass = num(item.carcass_thickness_mm) || 16;
  const out = [];

  // A shelf and rail is its own thing: the item IS the shelf, and its stored
  // height is the cleat plus the board, so the top of the board is the top of
  // the item.
  if (item.item_type === "shelf_rail") {
    const cfg = shelfRailConfig(item);
    out.push({ y: base + height, name: "Shelf", kind: "shelf", railHeightMm: cfg.rail_height_mm });
    // It is a shelf on cleats, not a box, so its "inside" is simply itself.
    // Left unset these came out NaN and took the whole ladder with them.
    out.insideTop = base + height;
    out.insideBottom = base;
    return out;
  }

  if (!CABINETS.has(item.item_type)) return out;

  const front = item.front_type || "none";

  // Shelves. A mixed front's shelves belong to its open bays and are already
  // absolute; a plain cabinet's are measured from its own bottom.
  const shelves = front === "mixed" ? bayShelfHeightsMm(item) : cabinetShelfHeightsMm(item);
  shelves.forEach((h) => out.push({ y: base + num(h), name: "Shelf", kind: "shelf" }));

  // Accessories: a rail, a shoe rack, a trouser pull-out. The height is where
  // that one sits, which is the whole reason somebody dragged it there.
  readAccessories(item).forEach((entry) => {
    const y = base + num(accessoryHeightMm(entry, item));
    const boxH = num(entry.size?.height_mm);
    out.push({
      y,
      name: accessoryLabel(entry),
      kind: entry.type === "wardrobe_hanging_rail" ? "rail" : "accessory",
      boxH: boxH > 0 ? boxH : 0,
      qty: entry.qty > 1 ? entry.qty : 0,
    });
  });

  // DRAWER FRONTS, laid out exactly the way the elevation lays them out: the
  // stored heights scaled to fill their bay, each front with its gap recessed
  // above it, counted from the top. Working it out any other way would print a
  // number beside a front of a different size.
  const drawerRuns = [];
  if (front === "drawers") {
    drawerRuns.push({ top: base + height, span: height, cfg: item.drawer_config || {} });
  } else if (front === "mixed") {
    // mixedBaySections reports where each bay is, not what is configured in
    // it, so the drawer settings are read back off the section it came from.
    const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
    mixedBaySections(item).forEach((bay) => {
      if (bay.type !== "drawers") return;
      drawerRuns.push({
        top: base + num(bay.topMm), span: num(bay.topMm) - num(bay.bottomMm),
        cfg: sections[bay.index]?.drawer || {},
      });
    });
  }
  drawerRuns.forEach((run) => {
    const cfg = run.cfg || {};
    const stored = Array.isArray(cfg.heights_mm) && cfg.heights_mm.length ? cfg.heights_mm : [run.span];
    const storedTotal = stored.reduce((s, v) => s + num(v), 0) || run.span;
    const raw = scaleDrawerHeightsMm(stored, storedTotal, run.span);
    const gap = drawerGapMm(cfg);
    const fronts = computeDrawerFrontHeights(raw, gap > 0, gap, frontRevealMm(cfg));
    let cursor = 0;
    raw.forEach((openMm, i) => {
      const frontTop = cursor + gap;
      cursor += num(openMm);
      const fh = Math.max(0, num(fronts[i]));
      if (fh <= 0) return;
      out.push({
        y: run.top - frontTop - fh, top: run.top - frontTop, height: Math.round(fh),
        name: `Drawer ${i + 1}`, kind: "drawer",
      });
    });
  });

  // An open bay on a mixed front: the customer's "how tall is that gap".
  if (front === "mixed") {
    mixedBaySections(item).forEach((bay) => {
      if (bay.type !== "open") return;
      out.push({
        y: base + num(bay.bottomMm), top: base + num(bay.topMm),
        height: Math.round(num(bay.topMm) - num(bay.bottomMm)),
        name: "Open bay", kind: "open",
      });
    });
  }

  if (!out.length) return out;
  out.sort((a, b) => b.y - a.y);
  // Handy for the gaps below, and for anyone asking where the inside stops.
  // Only on a list with something in it, so an empty one stays a plain array.
  out.insideTop = base + height - carcass;
  out.insideBottom = base + carcass;
  return out;
}

/** Every horizontal line worth a tick, top down, boundaries included. */
export function itemStops(item = {}, levels = null) {
  const list = levels || itemLevels(item);
  if (!list.length) return [];
  const stops = [{ y: list.insideTop, boundary: true }];
  list.forEach((l) => {
    const top = l.top != null ? l.top : l.y + (l.boxH || 0);
    if (Math.abs(top - l.y) > 1) stops.push({ y: top, name: l.name, kind: l.kind });
    stops.push({ y: l.y, name: l.name, kind: l.kind });
  });
  stops.push({ y: list.insideBottom, boundary: true });
  stops.sort((a, b) => b.y - a.y);

  const clean = [];
  stops.forEach((s) => {
    const last = clean[clean.length - 1];
    if (last && Math.abs(last.y - s.y) <= SAME_LEVEL_MM) {
      if (!last.name && s.name) { last.name = s.name; last.kind = s.kind; last.boundary = false; }
      return;
    }
    clean.push({ ...s });
  });
  return clean;
}

/** The clear openings between them, named the way somebody would ask. */
export function itemGaps(item = {}, levels = null) {
  const list = levels || itemLevels(item);
  const stops = itemStops(item, list);
  const gaps = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const hi = stops[i], lo = stops[i + 1];
    const clear = Math.round(hi.y - lo.y);
    if (clear < MIN_GAP_MM) continue;
    // A drawer's own height is already its callout; the space under it is the
    // next drawer, not an opening.
    if (hi.kind === "drawer") continue;
    let name = "Clear";
    if (hi.kind === "rail") name = "Hanging";
    else if (hi.kind === "shelf" && (lo.kind === "shelf" || lo.boundary)) name = "Shelf gap";
    gaps.push({ from: lo.y, to: hi.y, clear, name });
  }
  return gaps;
}

/**
 * Everything to draw beside one wall's elevation.
 *
 * Levels that land at the same height across several cabinets are ONE entry
 * with a count. A wall of three matching wardrobes has three top shelves at the
 * same height, and printing that three times is what turns a margin into a
 * wall of text.
 *
 * @returns {{ticks: Array, notes: Array}}
 *   ticks  every height worth a tick on the ladder, top down, with its clear
 *          opening down to the next one
 *   notes  what to write in the margin, top down
 */
export function wallCallouts(wallItems = []) {
  const levelBuckets = new Map();
  const gapBuckets = new Map();
  const tickHeights = [];

  const bucket = (map, key, entry, who) => {
    const found = map.get(key);
    if (found) { found.count += 1; found.items.push(who); return found; }
    map.set(key, { ...entry, items: [who] });
    return map.get(key);
  };

  const annotated = [];
  wallItems.forEach((item) => {
    const levels = itemLevels(item);
    if (!levels.length) return;
    const who = String(item.label || "").trim();
    annotated.push(who);

    levels.forEach((l) => {
      const y = Math.round(l.y);
      bucket(levelBuckets, `${l.name}|${y}|${l.height || 0}`, {
        y, name: l.name, kind: l.kind, height: l.height || 0, count: 1,
      }, who);
      tickHeights.push(y);
      if (l.top != null) tickHeights.push(Math.round(l.top));
    });

    itemGaps(item, levels).forEach((g) => {
      const key = `${g.name}|${g.clear}|${Math.round(g.to)}`;
      bucket(gapBuckets, key, { ...g, to: Math.round(g.to), from: Math.round(g.from), count: 1 }, who);
    });

    tickHeights.push(Math.round(levels.insideTop), Math.round(levels.insideBottom));
  });

  // One tick per distinct height, and the clear run down to the next one.
  const sorted = [...new Set(tickHeights)].sort((a, b) => b - a);
  const ticks = [];
  sorted.forEach((y) => {
    const last = ticks[ticks.length - 1];
    if (last && last.y - y <= TICK_MERGE_MM) return;
    ticks.push({ y, clear: 0 });
  });
  for (let i = 0; i < ticks.length - 1; i += 1) ticks[i].clear = ticks[i].y - ticks[i + 1].y;

  // WHICH CABINET, but only when it is not all of them. Three matching
  // wardrobes share every level, and naming each one three times is how a
  // margin turns into a wall of text; one cabinet out of three that is
  // different is exactly the thing somebody needs told.
  const total = annotated.length;
  const nameFor = (n) => {
    const unique = [...new Set(n.items.filter(Boolean))];
    if (!unique.length || unique.length >= total || total < 2) return "";
    return unique.join(", ");
  };

  const notes = [...levelBuckets.values(), ...gapBuckets.values()]
    .map((n) => (n.clear != null
      ? { y: (n.from + n.to) / 2, label: n.name, detail: `${n.clear} clear`, soft: true, count: n.count, where: nameFor(n) }
      : { y: n.y, label: n.name, kind: n.kind, height: n.height, count: n.count, where: nameFor(n) }))
    .sort((a, b) => b.y - a.y);

  return { ticks, notes };
}
