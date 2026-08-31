// HOW MUCH OF THE WEBSITE PANEL TO SHOW: the fact, on its own.
//
// ── WHY THIS IS NOT IN DetailToggle.tsx ──────────────────────────────────────
//
// That file is 'use client'. Every export of a client module is turned into a
// client reference by the bundler, so a server component importing a plain
// function out of one gets a proxy rather than the function and throws the
// moment it calls it. The page is a server component and has to read the cookie
// before it renders anything, so the cookie's name and the rule for reading it
// live here, where both sides can have them.

export const DETAIL_COOKIE = 'pcd_dashboard_detail'

export const DETAIL_LEVELS = ['compact', 'standard', 'full'] as const
export type Detail = (typeof DETAIL_LEVELS)[number]

// What somebody sees before they have ever touched the control.
export const DEFAULT_DETAIL: Detail = 'full'

/**
 * A stored value we recognise, or the default.
 *
 * Anything unrecognised falls back rather than breaking the page: a cookie left
 * over from an older version, or one somebody has edited by hand, must not be
 * able to render an empty dashboard.
 */
export function readDetail(value: string | undefined | null): Detail {
  return DETAIL_LEVELS.includes(value as Detail) ? (value as Detail) : DEFAULT_DETAIL
}
