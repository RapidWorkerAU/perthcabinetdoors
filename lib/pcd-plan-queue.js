// PLANNING A BIG ORDER WITHOUT BEING LOCKED OUT OF IT.
//
// ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
//
// Every field on the Item Planning, Supplier Made and Made To Order tables sent
// its own PATCH the moment it changed, and every field on that item was
// disabled until the PATCH came back. On a thirty line order that is thirty
// round trips, each one taking the row away from the person filling it in. It
// was slow to use and it read as broken.
//
// Two worse things were happening underneath that.
//
// ONE. Anything typed while a save was in flight was thrown away. The response
// carried the whole item back and it was written over the top of local state,
// so the field somebody had moved on to filling in reverted to what the server
// had been told a second earlier.
//
// TWO. Several rows belong to the SAME item. panel_planning is one jsonb blob
// keyed by panel, so two rows of one item saving at once each sent the whole
// blob, and the second one landed on top of the first. The lock was the only
// thing hiding that, and it hid it by making the screen unusable.
//
// ── THE SHAPE ────────────────────────────────────────────────────────────────
//
// Changes are collected per item, then per panel, then per field:
//
//   { [itemId]: { [panelKey]: { supplier_name: "Polytec", ... } } }
//
// Coalescing at the item level is what fixes the race: one item is only ever
// in flight once, and everything queued for it while that request is out goes
// in the next one. Coalescing at the field level is what makes it safe: a
// response is applied UNDER anything still queued, never over it, so a field
// somebody is part way through is never reverted by an older answer.
//
// Everything here is pure. The component owns the fetch and the timers; this
// owns what is queued, what goes out, and what a response is allowed to change.

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** A plain deep merge over the two levels planning actually has. */
function mergeLevel(base, patch) {
  const out = { ...(isObject(base) ? base : {}) };
  for (const [key, value] of Object.entries(isObject(patch) ? patch : {})) {
    out[key] = isObject(value) && isObject(out[key]) ? { ...out[key], ...value } : value;
  }
  return out;
}

/** One panel's worth of planning, merged onto what an item already has. */
export function mergePlanning(planning, patch) {
  return mergeLevel(planning, patch);
}

/**
 * Add an edit to the queue.
 *
 * Never replaces what is already queued for that panel: two edits to two fields
 * on the same row are both going, and the second must not drop the first.
 */
export function queueChange(pending, itemId, panelKey, changes) {
  if (!itemId || !panelKey) return pending;
  const forItem = pending[itemId] || {};
  return {
    ...pending,
    [itemId]: {
      ...forItem,
      [panelKey]: { ...(forItem[panelKey] || {}), ...changes },
    },
  };
}

/** Add a whole item-keyed patch at once, which is what a bulk apply produces. */
export function queuePatch(pending, patch) {
  let next = pending;
  for (const [itemId, panels] of Object.entries(patch || {})) {
    for (const [panelKey, changes] of Object.entries(panels || {})) {
      next = queueChange(next, itemId, panelKey, changes);
    }
  }
  return next;
}

/**
 * Pull one item's queued changes out to send.
 *
 * Taken OUT rather than copied, so anything typed from this moment on queues up
 * clean and is plainly newer than the request. That is the whole trick: what is
 * left in the queue after this call is by definition unsaved, and the response
 * is not allowed to touch it.
 */
export function takeInflight(pending, itemId) {
  const inflight = pending[itemId] || null;
  if (!inflight) return { inflight: null, pending };
  const rest = { ...pending };
  delete rest[itemId];
  return { inflight, pending: rest };
}

/** Put a failed request's changes back, UNDER anything newer that arrived. */
export function requeue(pending, itemId, inflight) {
  if (!inflight) return pending;
  const newer = pending[itemId] || {};
  const restored = {};
  for (const [panelKey, changes] of Object.entries(inflight)) {
    restored[panelKey] = { ...changes, ...(newer[panelKey] || {}) };
  }
  return { ...pending, [itemId]: { ...restored, ...panelsOnlyIn(newer, inflight) } };
}

function panelsOnlyIn(newer, inflight) {
  const out = {};
  for (const [panelKey, changes] of Object.entries(newer)) {
    if (!inflight[panelKey]) out[panelKey] = changes;
  }
  return out;
}

/**
 * What an item's planning should be once a response lands.
 *
 * The server's answer is the base, because it is the only thing that knows what
 * else changed. Anything still queued goes back ON TOP, because it is newer
 * than the request that was answered. This is the line that stops a field
 * reverting while somebody is filling it in.
 */
export function reconcilePlanning(serverPlanning, stillPending) {
  if (!stillPending) return isObject(serverPlanning) ? serverPlanning : {};
  return mergePlanning(serverPlanning, stillPending);
}

/** Items with work waiting, oldest first, so the queue drains in order. */
export function pendingItemIds(pending) {
  return Object.keys(pending || {});
}

export function hasPending(pending, itemId) {
  return Boolean(pending && pending[itemId] && Object.keys(pending[itemId]).length);
}

export function pendingCount(pending) {
  let n = 0;
  for (const panels of Object.values(pending || {})) n += Object.keys(panels || {}).length;
  return n;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BULK

   Thirty lines on one order are usually thirty of the same answer. Every one
   of them was made to order, or every one had its board ordered on the Monday.
   Setting that thirty times is the actual complaint, and it is a worse problem
   than the lock because no amount of speed fixes it.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * What each table may set across a selection.
 *
 * Deliberately not "every field on the row". A bulk edit is applied without
 * being read back one line at a time, so the fields it offers are the ones
 * where one answer really is the same answer for all of them. Anything
 * genuinely per line, a panel note or an issue, is not here.
 */
export const BULK_FIELDS = {
  items: [
    { field: "fulfilment_method", label: "Fulfilment", kind: "select" },
  ],
  supplierMade: [
    { field: "status", label: "Order status", kind: "select" },
    { field: "supplier_name", label: "Supplier", kind: "text" },
    { field: "supplier_order_ref", label: "Order ref", kind: "text" },
    { field: "supplier_ordered_at", label: "Ordered", kind: "date" },
    { field: "supplier_eta", label: "ETA", kind: "date" },
  ],
  madeInHouse: [
    { field: "board_required", label: "Board required", kind: "select" },
    { field: "supplier_name", label: "Board supplier", kind: "text" },
    { field: "supplier_order_ref", label: "Order ref", kind: "text" },
    { field: "supplier_ordered_at", label: "Ordered", kind: "date" },
    { field: "supplier_eta", label: "ETA", kind: "date" },
    { field: "production_stage", label: "Production stage", kind: "select" },
  ],
};

export function bulkFieldsFor(sectionKey) {
  return BULK_FIELDS[sectionKey] || [];
}

/**
 * Is this row allowed to take this field?
 *
 * A board supplier on a line that needs no board is an answer to a question
 * that line was never asked, and it would show up later as a supplier order
 * nobody placed. Those rows are skipped and the count says how many, rather
 * than the apply quietly doing less than it said it would.
 */
export function bulkAppliesTo(field, row) {
  const plan = row?.plan || {};
  const boardFields = new Set(["supplier_name", "supplier_order_ref", "supplier_ordered_at", "supplier_eta"]);
  if (row?.section === "madeInHouse" && boardFields.has(field) && !plan.board_required) return false;
  // A thermolaminated item is made by the supplier and cannot be anything else,
  // which the single row picker already enforces by disabling itself.
  if (field === "fulfilment_method" && row?.fulfilmentLocked) return false;
  return true;
}

/**
 * Turn a selection plus a set of answers into one item-keyed patch.
 *
 * Rows of the same item collapse into one entry, which is what stops a bulk
 * apply across thirty rows of six items becoming thirty requests that fight
 * each other over the same blob.
 *
 * Returns the patch and what was left out, because "applied to 24 of 30" is
 * the only honest thing to say when six of them could not take the value.
 */
export function bulkChanges(rows, selectedKeys, changes) {
  const wanted = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);
  const fields = Object.entries(changes || {}).filter(([, value]) => value !== undefined);
  const patch = {};
  let applied = 0;
  let skipped = 0;

  for (const row of rows || []) {
    if (!wanted.has(row.key)) continue;
    const forRow = {};
    let took = false;
    for (const [field, value] of fields) {
      if (!bulkAppliesTo(field, row)) continue;
      forRow[field] = value;
      took = true;
    }
    if (!took) { skipped += 1; continue; }
    const itemId = row.item?.id;
    if (!itemId || !row.panelKey) { skipped += 1; continue; }
    patch[itemId] = patch[itemId] || {};
    patch[itemId][row.panelKey] = { ...(patch[itemId][row.panelKey] || {}), ...forRow };
    applied += 1;
  }

  return { patch, applied, skipped, itemCount: Object.keys(patch).length };
}

/** Plain words for what a bulk apply just did. */
export function bulkSummary({ applied, skipped }) {
  if (!applied && !skipped) return "Nothing was selected.";
  const lines = `${applied} line${applied === 1 ? "" : "s"} updated`;
  if (!skipped) return `${lines}.`;
  return `${lines}, ${skipped} skipped because the field does not apply to ${skipped === 1 ? "it" : "them"}.`;
}

/**
 * Which lines a bulk apply should touch.
 *
 * "all"   every line in the table you are looking at, which is already filtered
 *         to supplier made or made to order, so it means what it says.
 * "blank" only the lines where none of the fields being set has an answer yet.
 *         This is the one people actually want the second time: the ordered
 *         date went on twenty eight lines on Monday, two more arrived, and
 *         setting it on all thirty again would stamp Monday over work somebody
 *         did by hand. Filling the gaps leaves those alone.
 *
 * Returns row keys, which is what bulkChanges takes, so the scope and a future
 * hand-picked selection are the same thing to everything downstream.
 */
export function scopeKeys(rows, scope, changes) {
  const fields = Object.keys(changes || {}).filter((f) => changes[f] !== undefined);
  const out = [];
  for (const row of rows || []) {
    if (!row?.key) continue;
    if (scope === "blank") {
      const plan = row.plan || {};
      const anyAnswered = fields.some((f) => {
        const value = plan[f];
        // false is an answer for board_required. Only nothing is nothing.
        return value !== undefined && value !== null && value !== "";
      });
      if (anyAnswered) continue;
    }
    out.push(row.key);
  }
  return out;
}
