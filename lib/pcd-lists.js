// THE LISTS YOU CAN ADD TO YOURSELF.
//
// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
//
// A handful of dropdowns in the admin are plain vocabulary: a set of words
// somebody picks from, stored as text, that nothing in the code makes decisions
// about. Adding one used to mean editing a constant and deploying. This moves
// those into the database so they can be added to from Settings, Lists.
//
// ── WHAT IS DELIBERATELY NOT HERE, AND WHY ───────────────────────────────────
//
// MOST LISTS IN THIS CODEBASE MUST NOT BE EDITABLE. Three kinds, and each would
// break in a different way:
//
//   WORKFLOW STATUSES. quote, order, variation, line and production statuses.
//   The code branches on the exact values in dozens of places and the database
//   holds check constraints on them. A new quote status would sail past the
//   document lock, land in no column on the board, and count as neither won nor
//   lost in the conversion report.
//
//   FIELD AND COLUMN MAPS. Job cost types name real money columns on
//   pcd_orders; contact details, CSV columns and panel definitions describe
//   structure. An extra entry needs a schema change, not a row.
//
//   THINGS WITH GEOMETRY OR A RANGE BEHIND THEM. Appliance kinds each have a
//   drawing; IKEA ranges each have frame sizes; profile kinds are two
//   incompatible supplier ranges. A new name with nothing behind it is a
//   dropdown entry that produces a blank.
//
// So this file names the lists that ARE safe, and adding another one to it is a
// deliberate act with that reasoning to answer first.
//
// ── NOTHING IS EVER DELETED ──────────────────────────────────────────────────
//
// There is no delete, anywhere, by design. Records already hold these values:
// an order raised last year says its issue was "Damaged from supplier", and
// removing that item would leave the order saying nothing. An item is switched
// off instead, which stops it being OFFERED without touching what already
// refers to it.
//
// That second half is the rule everything here exists to protect, and it is
// worth saying plainly: A SWITCHED OFF ITEM STILL SHOWS ON RECORDS THAT USE IT.
// See optionsFor below.

import { ISSUE_KINDS } from "./pcd-order-issues";
import { PRODUCTION_TIMEFRAMES } from "./pcd-order-schedule";
import { SETTLEMENT_METHODS } from "./pcd-payment-settlement";
import { DISMISS_REASONS } from "./pcd-board-dismissal";
import { COLOUR_SUPPLIERS } from "./pcd-colour-library";
import { PROFILE_SUPPLIERS } from "./pcd-profile-suppliers";
import { ROOM_AREAS, PANEL_USES } from "./pcd-line-details";
// Shared with the modules that define the built-in items, because they cannot
// import anything back from this file without making a cycle. See
// lib/pcd-list-keys.js.
import { itemKeyFrom, keyAsWords } from "./pcd-list-keys";

export { itemKeyFrom, keyAsWords };

export const LIST_ITEMS_TABLE = "pcd_list_items";

/** A brand list is plain strings, where the name IS the stored value. */
const asNamed = (values) => values.map((value) => ({ key: value, label: value }));

/**
 * Every list somebody may add to, and what each item of it carries.
 *
 * `fields` are the settings an item has BEYOND its name. A payment method
 * records whether it asks for a reference; a timeframe is a number of days.
 * Without them the screen could offer an Add button that produced an item the
 * rest of the app could not use.
 */
export const LISTS = [
  {
    key: "issue_kinds",
    label: "Issue kinds",
    note: "What has gone wrong with a panel.",
    where: "Raising an issue on an order",
    fields: [],
    builtin: ISSUE_KINDS,
  },
  {
    key: "production_timeframes",
    label: "Production timeframes",
    note: "How long a job takes, offered when scheduling one.",
    where: "The schedule on an order",
    fields: [
      {
        key: "days",
        label: "Working days",
        type: "number",
        required: true,
        hint: "The number this timeframe means. The target completion date is worked out from it.",
      },
    ],
    // Timeframes have no key of their own, so the number of days is the key.
    builtin: PRODUCTION_TIMEFRAMES.map((entry) => ({
      key: String(entry.days),
      label: entry.label,
      extras: { days: entry.days },
    })),
  },
  {
    key: "settlement_methods",
    label: "Payment methods",
    note: "How money reached us, recorded when a payment is marked paid.",
    where: "Marking a payment received",
    fields: [
      {
        key: "wantsReference",
        label: "Asks for a reference",
        type: "boolean",
        hint: "Tick for anything with a receipt number or transaction id worth keeping. Cash does not.",
      },
    ],
    builtin: SETTLEMENT_METHODS.map((entry) => ({
      key: entry.key,
      label: entry.label,
      extras: { wantsReference: Boolean(entry.wantsReference) },
    })),
  },
  // NOTE SOURCES ARE NOT HERE, and were taken out again after being listed.
  //
  // They read like vocabulary, and they are not: a note's source is decided by
  // WHICH FIELD it came from, panel or production or the quote, and nobody ever
  // picks one. Adding a seventh source would put a word in a list that nothing
  // writes and nothing reads, which is a worse answer than not offering it.
  {
    key: "dismiss_reasons",
    label: "Set aside reasons",
    note: "Why a board card was cleared. The wording is written into the customer's own timeline.",
    where: "Setting a card aside on the board",
    fields: [
      {
        key: "words",
        label: "What the timeline says",
        type: "text",
        required: true,
        hint: "A short sentence. It is read months later by somebody asking what happened, so write it for them.",
      },
    ],
    builtin: DISMISS_REASONS.map((entry) => ({
      key: entry.key,
      label: entry.label,
      extras: { words: entry.words },
    })),
  },
  {
    key: "colour_suppliers",
    label: "Board suppliers",
    note: "The brands boards are bought from. The name here is the spelling used everywhere.",
    where: "The supplier on a colour, and the brand filters on the website",
    fields: [],
    builtin: asNamed(COLOUR_SUPPLIERS),
  },
  {
    key: "profile_suppliers",
    label: "Profile suppliers",
    note: "The brands door and edge profiles are bought from.",
    where: "The supplier on a profile",
    fields: [],
    builtin: asNamed(PROFILE_SUPPLIERS),
  },
  {
    key: "room_areas",
    label: "Rooms",
    note: "Which room a measured line belongs to, on a job with more than one.",
    where: "Every tab of the Excel order form",
    fields: [],
    builtin: asNamed(ROOM_AREAS),
  },
  {
    key: "panel_uses",
    label: "Panel uses",
    note: "What a panel actually is. An end panel, a filler and a kickboard all quote as Panel.",
    where: "The fronts and panels tab of the Excel order form",
    fields: [],
    builtin: asNamed(PANEL_USES),
  },
  // GRAIN DIRECTION, THE EDGES AND WHO SUPPLIES A HARDWARE LINE ARE NOT HERE.
  // Each one changes what the workshop does or whether a line is priced at all,
  // so they belong with the rules that read them rather than in a list somebody
  // can add a word to. See lib/pcd-line-details.js.
  //
  // NEITHER IS THE CABINET TYPE on the carcass tab. A box type has a cut list
  // and a drawing behind it, and a name added here with neither would be a
  // dropdown entry that produces an empty cabinet. It comes from CABINET_TYPES,
  // via cabinetTypeOptions in lib/pcd-design-parts.js.
];

export const LIST_KEYS = LISTS.map((list) => list.key);

export function listSpec(key) {
  return LISTS.filter((list) => list.key === key)[0] || null;
}

export function isListKey(key) {
  return LIST_KEYS.includes(String(key || ""));
}

/** One row in the shape the app uses, whatever the row is missing. */
export function normaliseListItem(row = {}) {
  const extras = row.extras && typeof row.extras === "object" && !Array.isArray(row.extras) ? row.extras : {};
  return {
    id: row.id || null,
    list_key: String(row.list_key || ""),
    key: String(row.item_key || row.key || ""),
    label: String(row.label || "").trim(),
    sort_order: Number(row.sort_order) || 0,
    // A row with no flag at all is on. Only an explicit false switches it off,
    // so a column added later cannot silently hide every existing item.
    is_active: row.is_active !== false,
    is_builtin: Boolean(row.is_builtin),
    extras,
  };
}

/**
 * The items of one list, ready to seed the table.
 *
 * Built-ins keep the order they are written in, which is the order they have
 * always appeared in the dropdowns: the common choice first and "Something
 * else" last.
 */
export function builtinItems(listKey) {
  const spec = listSpec(listKey);
  if (!spec) return [];
  return spec.builtin.map((entry, index) =>
    normaliseListItem({
      list_key: listKey,
      item_key: entry.key,
      label: entry.label,
      sort_order: index * 10,
      is_active: true,
      is_builtin: true,
      extras: entry.extras || {},
    })
  );
}

/** Ordered, and only what a person may still pick. */
export function activeOnly(items = []) {
  return items.filter((item) => item.is_active).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * WHAT A DROPDOWN SHOULD OFFER, including whatever this record already holds.
 *
 * THE RULE THIS FILE EXISTS FOR. Switching an item off stops it being chosen
 * again; it does not rewrite history. An order raised last year still says its
 * issue was "Damaged from supplier", and a dropdown built only from the active
 * items would either show blank on that order or silently change it to the
 * first option in the list.
 *
 * So the value the record already holds is always in its own dropdown, marked
 * as retired so nobody wonders why it is there.
 */
export function optionsFor(items = [], currentKey = "") {
  const live = activeOnly(items);
  const held = String(currentKey || "");
  if (!held || live.some((item) => item.key === held)) return live;

  const retired = items.filter((item) => item.key === held)[0];
  return [
    ...live,
    retired
      ? { ...retired, retired: true }
      : // Not in the list at all: a value from before any of this existed, or
        // one typed straight into the database. Shown as itself rather than
        // dropped, because dropping it is how a record quietly loses a field.
        { id: null, list_key: "", key: held, label: keyAsWords(held), sort_order: 9999, is_active: false, is_builtin: false, extras: {}, retired: true },
  ];
}

/**
 * The label for a stored value.
 *
 * Falls back through the list, then the built-ins, then the key read as words.
 * That last step is what keeps a custom item readable in a PDF or anywhere else
 * the database is out of reach.
 */
export function labelFor(items = [], key, listKey = "") {
  const held = String(key || "");
  if (!held) return "";
  const found = items.filter((item) => item.key === held)[0];
  if (found) return found.label;
  const builtin = listKey ? builtinItems(listKey).filter((item) => item.key === held)[0] : null;
  return builtin ? builtin.label : keyAsWords(held);
}

/** Everything, grouped, for the Lists screen. */
export function groupByList(rows = []) {
  const items = rows.map(normaliseListItem);
  return LISTS.map((spec) => ({
    ...spec,
    items: items.filter((item) => item.list_key === spec.key).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

/** What a new item needs before it can be saved. */
export function validateNewItem(listKey, payload = {}, existing = []) {
  const spec = listSpec(listKey);
  const errors = {};
  if (!spec) {
    errors.list = "That is not a list you can add to.";
    return errors;
  }

  const label = String(payload.label || "").trim();
  if (label.length < 2) errors.label = "Give it a name.";
  if (label.length > 80) errors.label = "That name is too long.";

  const key = itemKeyFrom(label);
  if (label.length >= 2 && !key) errors.label = "That name needs at least one letter or number in it.";
  // Case and punctuation ignored, because "Bank Transfer" and "bank transfer"
  // would become two items that read identically in a dropdown.
  if (key && existing.some((item) => item.key === key)) {
    errors.label = "That is already on this list. Switch it back on rather than adding it twice.";
  }

  for (const field of spec.fields) {
    if (!field.required) continue;
    const value = payload.extras?.[field.key];
    if (field.type === "number") {
      if (!Number.isFinite(Number(value)) || Number(value) <= 0) errors[field.key] = `${field.label} has to be a number above zero.`;
    } else if (!String(value ?? "").trim()) {
      errors[field.key] = `${field.label} is needed.`;
    }
  }

  return errors;
}

/** The extras for a row, kept to the fields that list actually has. */
export function cleanExtras(listKey, extras = {}) {
  const spec = listSpec(listKey);
  if (!spec) return {};
  const out = {};
  for (const field of spec.fields) {
    const value = extras?.[field.key];
    if (field.type === "number") out[field.key] = Number(value) || 0;
    else if (field.type === "boolean") out[field.key] = Boolean(value);
    else out[field.key] = String(value ?? "").trim();
  }
  return out;
}
