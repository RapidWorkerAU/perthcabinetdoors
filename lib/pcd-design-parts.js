// What a design item is made of, as the customer picks it.
//
// The public planner used to send the WHOLE design when someone hit "Send to
// PCD". Someone who planned a full kitchen but only wanted a price on four
// doors had no way to say so. This file is the shared answer to "what can I
// choose on this item", used by BOTH ends:
//
//   the modal   - to draw the cards and remember what is ticked
//   the API     - to quote only what was ticked
//
// One definition, so the two can never drift. If the modal offers a part the
// route does not understand, or the other way round, that is a bug this file
// exists to make impossible.
//
// GROUPS, NOT BOARDS. "Doors" is one choice covering every door on that
// cabinet. A customer is never asked to tick board by board - they do not think
// that way and it would make a ten cabinet kitchen unusable.

import { isIkeaPreset, kickboardAllowedFor } from "./pcd-ikea-presets";
import { CABINET_TYPES } from "./pcd-design-item-io";

// Placed to show what is already in the room. Nothing is manufactured, so there
// is nothing to choose and nothing to quote. They still ride along in the notes
// as context - see the submit route.
// Things that are ALREADY IN THE ROOM. They are drawn so a run stops in the
// right place; nothing is made and nothing is quoted, so they are never offered
// as something to price.
//
// obstruction and brick_corner_pantry were missing from this list, and only
// from this list: the admin importer has always skipped all five
// (see app/api/admin/design/projects/[projectId]/import/route.js). The public
// planner therefore offered a wall, a nib wall and a bulkhead in the customer's
// "what would you like quoted" list as if each were a cabinet, and sending the
// design produced a base_cabinet line with no size and no board on it. Real
// designs in the database have those lines on them.
//
// Exported because the same question is asked in three places and used to be
// answered by three separate copies of this Set, which is how they came to
// disagree.
export const ROOM_REFERENCE_TYPES = new Set([
  "appliance",
  "window",
  "door_opening",
  "obstruction",
  "brick_corner_pantry",
]);

// Items that ARE the thing, rather than a box with parts on it. A standalone
// panel has no doors to choose.
const WHOLE_ITEM_TYPES = new Set(["panel", "floating_shelf", "shelf_rail"]);

const TYPE_LABEL = {
  base_cabinet: "Base cabinet",
  wall_cabinet: "Wall cabinet",
  tall_cabinet: "Tall cabinet",
  corner_base_cabinet: "Corner cabinet",
  // The two that used to fall through to the bare word "Cabinet". Both are
  // named on the plan PDF already, and both are now something somebody picks
  // from a dropdown on the order form, so they have to be named here too.
  corner_tall_cabinet: "Corner pantry",
  blind_corner_cabinet: "Blind corner",
  bookcase: "Bookcase",
  floating_shelf: "Floating shelf",
  shelf_rail: "Shelf & rail",
  panel: "Panel",
};

/**
 * The boxes we make, named the way a person names them.
 *
 * For anywhere somebody PICKS a cabinet type rather than reads one, the Excel
 * order form's carcass tab being the first. Built from CABINET_TYPES rather
 * than written out again: that list is already copied in more places than it
 * should be and this must not become another of them.
 */
export function cabinetTypeOptions() {
  return CABINET_TYPES.map((itemType) => ({ itemType, label: TYPE_LABEL[itemType] || "Cabinet" }));
}

/** A picked label back to the item_type behind it, or "" for one we do not know. */
export function cabinetTypeFromLabel(label) {
  const wanted = String(label || "").trim().toLowerCase();
  if (!wanted) return "";
  const found = cabinetTypeOptions().find((option) => option.label.toLowerCase() === wanted);
  return found ? found.itemType : "";
}

export function isRoomReference(item) {
  return ROOM_REFERENCE_TYPES.has(item?.item_type);
}

export function itemTypeLabel(item) {
  return TYPE_LABEL[item?.item_type] || "Cabinet";
}

// A cabinet the customer already owns, placed so they could plan what goes on
// the front of it. We do not supply the box, so it never offers a carcass part.
export function isCustomerOwned(item) {
  return isIkeaPreset(item);
}

function mm(value) {
  const n = Number(value) || 0;
  return n ? String(Math.round(n)) : "";
}

function size(item) {
  const w = mm(item?.width_mm);
  const h = mm(item?.height_mm);
  return w && h ? `${w} × ${h}mm` : "";
}

// A door grid is columns x rows, the same way the admin importer counts fronts
// for hardware. Either missing means one.
function doorCount(config) {
  return Math.max(1, Number(config?.columns) || 1) * Math.max(1, Number(config?.rows) || 1);
}

// How many doors and drawer fronts an item carries, so the part row can say
// "2 doors" rather than just "Doors".
export function frontCounts(item) {
  const front = item?.front_type || "none";
  if (front === "doors") {
    // Columns AND rows. A pantry set up as one column of two doors is two
    // doors: counting columns alone said "1 door" on the card while the quote
    // request carried two, which is exactly the kind of mismatch that makes a
    // customer distrust the whole list.
    return { doors: doorCount(item?.door_config), drawers: 0 };
  }
  if (front === "drawers") {
    const heights = item?.drawer_config?.heights_mm;
    return { doors: 0, drawers: Math.max(1, Array.isArray(heights) ? heights.length : 1) };
  }
  if (front === "mixed") {
    const sections = Array.isArray(item?.section_config?.sections) ? item.section_config.sections : [];
    let doors = 0;
    let drawers = 0;
    sections.forEach((section) => {
      const type = section?.type || "doors";
      if (type === "drawers") {
        const heights = section?.drawer_config?.heights_mm;
        drawers += Math.max(1, Array.isArray(heights) ? heights.length : 1);
      } else if (type === "doors") {
        doors += doorCount(section?.door_config);
      }
      // An appliance bay is an opening, not a front we make.
    });
    return { doors, drawers };
  }
  return { doors: 0, drawers: 0 };
}

// Which finished panels are switched on, named the way the customer switched
// them on rather than as database columns.
function panelNames(item) {
  const names = [];
  if (item?.end_panel_left) names.push("left side");
  if (item?.end_panel_right) names.push("right side");
  if (item?.has_back_panel) names.push("back");
  if (item?.has_top_panel) names.push("top");
  if (item?.has_bottom_panel) names.push("underside");
  return names;
}

// THE definition. Every part a customer can tick on one item, in the order they
// read down the card. An empty array means the item is not quotable at all.
export function partsForItem(item) {
  if (!item || isRoomReference(item)) return [];

  if (WHOLE_ITEM_TYPES.has(item.item_type)) {
    // A standalone panel keeps its finished face width in depth_mm; width_mm is
    // its on-edge thickness. Everything else measures the normal way round.
    const detail =
      item.item_type === "panel"
        ? [mm(item.depth_mm), mm(item.height_mm)].filter(Boolean).join(" × ") + "mm"
        : size(item);
    return [{ key: "body", label: itemTypeLabel(item), detail }];
  }

  const parts = [];

  if (!isCustomerOwned(item)) {
    parts.push({ key: "carcass", label: "Cabinet", detail: size(item) });
  }

  const counts = frontCounts(item);
  if (counts.doors > 0) {
    parts.push({
      key: "doors",
      label: counts.doors === 1 ? "Door" : "Doors",
      detail: counts.doors === 1 ? "1 door" : `${counts.doors} doors`,
    });
  }
  if (counts.drawers > 0) {
    parts.push({
      key: "drawers",
      label: "Drawer fronts",
      detail: counts.drawers === 1 ? "1 front" : `${counts.drawers} fronts`,
    });
  }

  const panels = panelNames(item);
  if (panels.length) {
    parts.push({
      key: "endpanels",
      label: panels.length === 1 ? "Finished panel" : "Finished panels",
      detail: panels.join(", "),
    });
  }

  if (item.has_filler_panel) {
    parts.push({
      key: "filler",
      label: "Filler panel",
      detail: mm(item.filler_panel_height_mm) ? `${mm(item.filler_panel_height_mm)}mm high` : "",
    });
  }

  // kickboardAllowedFor, not has_kickboard alone: an IKEA cabinet comes with
  // its own plinth, and only Metod is ever fronted with one of ours. An item
  // saved before that rule existed can still carry the flag, and it must not
  // put a kickboard on somebody's quote.
  if (item.has_kickboard && kickboardAllowedFor(item)) {
    parts.push({
      key: "kickboard",
      label: "Kickboard",
      detail: mm(item.kickboard_height_mm) ? `${mm(item.kickboard_height_mm)}mm high` : "",
    });
  }

  return parts;
}

// Items worth showing in the picker at all.
export function quotableItems(items) {
  return (items || []).filter((item) => partsForItem(item).length > 0);
}

// ── selection ────────────────────────────────────────────────────────────────
//
// Shape: { [itemId]: { [partKey]: true } }. Only truthy keys are stored, so an
// empty object and a missing key mean the same thing and there is one way to
// ask "is this on".

export function isPartSelected(selection, itemId, partKey) {
  return Boolean(selection?.[itemId]?.[partKey]);
}

export function selectedPartKeys(selection, item) {
  const keys = partsForItem(item).map((part) => part.key);
  return keys.filter((key) => isPartSelected(selection, item.id, key));
}

export function countSelectedParts(selection, items) {
  return (items || []).reduce((total, item) => total + selectedPartKeys(selection, item).length, 0);
}

export function itemsWithSelection(selection, items) {
  return (items || []).filter((item) => selectedPartKeys(selection, item).length > 0);
}

export const PRESETS = {
  // Everything we would make. A cabinet the customer owns has no carcass part,
  // so it contributes its fronts and panels here exactly as it does below.
  everything: { id: "everything", label: "The whole design" },
  // Everything except the boxes. This is the common one: PCD's bread and butter
  // is refronting cabinets someone already has.
  fronts: { id: "fronts", label: "Fronts and panels only" },
};

export function buildPreset(items, presetId) {
  const selection = {};
  (items || []).forEach((item) => {
    partsForItem(item).forEach((part) => {
      if (presetId === "fronts" && part.key === "carcass") return;
      if (!selection[item.id]) selection[item.id] = {};
      selection[item.id][part.key] = true;
    });
  });
  return selection;
}

// Which preset the current selection matches, or "custom". Drives which card
// reads as chosen.
export function matchPreset(items, selection) {
  let everything = true;
  let fronts = true;
  (items || []).forEach((item) => {
    partsForItem(item).forEach((part) => {
      const on = isPartSelected(selection, item.id, part.key);
      if (part.key === "carcass") {
        if (!on) everything = false;
        if (on) fronts = false;
        return;
      }
      if (!on) {
        everything = false;
        fronts = false;
      }
    });
  });
  if (everything) return "everything";
  if (fronts) return "fronts";
  return "custom";
}

// ── summary ──────────────────────────────────────────────────────────────────

const GROUP_LABELS = {
  carcass: ["Cabinet", "Cabinets"],
  doors: ["Set of doors", "Sets of doors"],
  drawers: ["Drawer front set", "Drawer front sets"],
  endpanels: ["Finished panel", "Finished panels"],
  filler: ["Filler panel", "Filler panels"],
  kickboard: ["Kickboard", "Kickboards"],
  body: ["Panel or shelf", "Panels and shelves"],
};

// Plain-English tally of what is being sent, in the order the parts first
// appear so it reads down the design rather than alphabetically.
export function summariseSelection(items, selection) {
  const order = [];
  const counts = {};
  (items || []).forEach((item) => {
    selectedPartKeys(selection, item).forEach((key) => {
      if (!(key in counts)) {
        counts[key] = 0;
        order.push(key);
      }
      counts[key] += 1;
    });
  });
  return order.map((key) => {
    const n = counts[key];
    const pair = GROUP_LABELS[key] || [key, key];
    return { key, n, label: n === 1 ? pair[0] : pair[1] };
  });
}

// ── drawing ──────────────────────────────────────────────────────────────────

// The front pieces of an item, for CabinetElevation. Doors sit side by side,
// drawer fronts stack, and a mixed front stacks its bays. An open cabinet
// returns a single panel piece so the card still draws its outline rather than
// rendering nothing.
//
// `box` is what the elevation is drawn inside. It is the item's own size except
// on a standalone panel, whose finished face width lives in depth_mm.
export function frontPiecesForItem(item) {
  const rawWidth = Number(item?.width_mm) || 0;
  const height = Number(item?.height_mm) || 0;
  const isStandalonePanel = item?.item_type === "panel";
  const width = isStandalonePanel ? Number(item?.depth_mm) || rawWidth : rawWidth;
  const empty = { box: { width: 0, height: 0 }, pieces: [], arrangement: "single" };
  if (!width || !height) return empty;
  const box = { width, height };

  if (WHOLE_ITEM_TYPES.has(item?.item_type)) {
    return { box, pieces: [{ width, height, type: "Panel" }], arrangement: "single" };
  }

  const front = item?.front_type || "none";

  if (front === "doors") {
    const columns = Math.max(1, Number(item?.door_config?.columns) || 1);
    return {
      box,
      pieces: Array.from({ length: columns }, () => ({ width: width / columns, height, type: "Door" })),
      arrangement: columns > 1 ? "columns" : "single",
    };
  }

  if (front === "drawers") {
    const heights = Array.isArray(item?.drawer_config?.heights_mm) ? item.drawer_config.heights_mm : [];
    const usable = heights.filter((value) => Number(value) > 0);
    if (!usable.length) {
      return { box, pieces: [{ width, height, type: "Drawer front" }], arrangement: "single" };
    }
    return {
      box,
      pieces: usable.map((value) => ({ width, height: Number(value), type: "Drawer front" })),
      arrangement: usable.length > 1 ? "rows" : "single",
    };
  }

  if (front === "mixed") {
    const sections = Array.isArray(item?.section_config?.sections) ? item.section_config.sections : [];
    if (!sections.length) return { box, pieces: [{ width, height, type: "Panel" }], arrangement: "single" };
    // Bay heights are resolved against the cabinet elsewhere; an even split is
    // enough for a thumbnail and never wrong about the ORDER of the bays.
    const each = height / sections.length;
    return {
      box,
      pieces: sections.map((section) => ({
        width,
        height: each,
        type: (section?.type || "doors") === "drawers" ? "Drawer front" : "Door",
      })),
      arrangement: "rows",
    };
  }

  // Open front: draw the carcass with one plain face so the outline still reads.
  return { box, pieces: [{ width, height, type: "Panel" }], arrangement: "single" };
}
