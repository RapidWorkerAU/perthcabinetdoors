// ARCHIVING A QUOTE OR AN ORDER.
//
// WHAT IT MEANS. The record is still there and can still be opened, but it has
// stopped counting: no board card, no line in the financials, nothing in the
// dashboard totals, and out of the lists unless somebody goes looking. It is
// for the job that got quoted twice, the order raised by mistake, the enquiry
// that turned into nothing.
//
// It is not cancelled. Cancelled says "this was called off", which is a fact
// about the job and belongs in the history. Archived says "stop showing me
// this", which is a fact about the list.
//
// It is not a delete. Nothing is removed, and restoring puts the record back
// exactly as it was, because archiving records the status it had rather than
// overwriting it and hoping.
//
// ── ONE RULE, NOT TWELVE ─────────────────────────────────────────────────────
//
// Everything that lists or totals quotes and orders has to agree about which
// rows count. That is what liveOnly and the two patches below are for: a screen
// that asks the question itself is a screen that will disagree with the others
// the first time anybody adds a status.

export const ARCHIVED = "archived";

/** Is this row archived? Works on a row from either table. */
export function isArchived(row) {
  return String(row?.status || "") === ARCHIVED;
}

/**
 * Narrow a supabase query to the rows that still count.
 *
 * Written as a filter on the query rather than on the results, so an archived
 * record never travels to a page that might forget to drop it. Returns the
 * query so it chains.
 */
export function liveOnly(query) {
  return query.neq("status", ARCHIVED);
}

/**
 * What to write when archiving.
 *
 * The status it holds now is kept, because that is what restore puts back. An
 * already archived row keeps the status it was archived FROM, so archiving
 * twice cannot lose it.
 */
export function archivePatch(row, now = new Date().toISOString()) {
  return {
    status: ARCHIVED,
    archived_at: now,
    archived_from_status: isArchived(row) ? row?.archived_from_status || null : row?.status || null,
  };
}

/**
 * What to write when restoring.
 *
 * Back to the status it was archived from. A row with nothing recorded, which
 * means it was archived by hand in the table editor, falls back to the caller's
 * default rather than to a guess this module has no business making.
 */
export function restorePatch(row, fallbackStatus) {
  return {
    status: row?.archived_from_status || fallbackStatus,
    archived_at: null,
    archived_from_status: null,
  };
}

/** Sensible landing places for a restore with nothing recorded. */
export const QUOTE_RESTORE_FALLBACK = "draft";
export const ORDER_RESTORE_FALLBACK = "active";
