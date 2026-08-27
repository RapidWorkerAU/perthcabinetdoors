'use client'

import * as React from 'react'

// LANDING ON THE ROW YOU CLICKED, not on the list it lives in.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Enquiries and quote requests have no page of their own. They are rows in a
// manager with a preview modal, so anything linking to one could only ever send
// somebody to /admin/enquiries and leave them to find it again by eye. The
// dashboard queue names a specific person and a specific job, and then losing
// that row on arrival is the small failure that stops people trusting a link.
//
// So those links carry ?focus=<id> and this opens it.
//
// ── READ ONCE, FROM THE ADDRESS BAR ──────────────────────────────────────────
//
// Deliberately not useSearchParams. This is a one shot read on arrival rather
// than something that should re-run when the route changes, and useSearchParams
// drags a Suspense boundary in behind it for a value that is looked at exactly
// once.
//
// ── AND THEN IT TAKES THE PARAMETER OFF ──────────────────────────────────────
//
// Otherwise the address in the bar still says focus=<id>, so refreshing the
// page, or coming back to it later with the back button, reopens something that
// was dealt with an hour ago.

export function useFocusedRow<T extends { id: string }>(rows: T[], onFound: (row: T) => void) {
  const handled = React.useRef(false)

  React.useEffect(() => {
    if (handled.current || !rows.length || typeof window === 'undefined') return

    const focusId = new URL(window.location.href).searchParams.get('focus')
    if (!focusId) {
      // Nothing to do, and nothing to do next time either.
      handled.current = true
      return
    }

    const row = rows.find(candidate => candidate.id === focusId)
    // Not here yet. The rows may still be loading, so this is left for the next
    // render rather than being given up on.
    if (!row) return

    handled.current = true
    onFound(row)

    const url = new URL(window.location.href)
    url.searchParams.delete('focus')
    window.history.replaceState({}, '', url.pathname + url.search)
  }, [rows, onFound])
}
