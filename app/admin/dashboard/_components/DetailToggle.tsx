'use client'

// HOW MUCH OF THE WEBSITE PANEL TO SHOW.
//
// ── IT BELONGS TO THE PERSON, NOT TO THE BUILD ───────────────────────────────
//
// Whether you want three panels or seven is not something to be decided once in
// code and imposed on everybody who opens the dashboard. It is set here, on the
// page, and remembered, and never asked about again.
//
// ── WHY A COOKIE AND NOT localStorage ────────────────────────────────────────
//
// /admin/dashboard is a server component. A cookie goes up with the request, so
// the server renders the right amount of detail in the first paint. Browser
// storage can only be read after the page has loaded, which means the standard
// view appears and then rearranges itself while somebody is reading it.
//
// It is remembered per browser either way, so the office computer and the phone
// can be set differently, which is usually what is wanted.
//
// ── IT IS QUIET ON PURPOSE ───────────────────────────────────────────────────
//
// Set at the weight of the date under the title rather than the weight of the
// stat strip, because it is a preference and not an action. The header row was
// already justify-between with nothing on the right; this is that slot.

import { DETAIL_COOKIE, type Detail } from './detail'

const OPTIONS: { value: Detail; label: string }[] = [
  { value: 'compact',  label: 'Less' },
  { value: 'standard', label: 'Standard' },
  { value: 'full',     label: 'More' },
]

export default function DetailToggle({
  value,
  onChange,
}: {
  value:    Detail
  onChange: (next: Detail) => void
}) {
  function choose(next: Detail) {
    if (next === value) return
    onChange(next)
    // A year, path-wide, lax. Nothing here is sensitive: it is which panels
    // somebody likes looking at.
    try {
      document.cookie = `${DETAIL_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    } catch {
      // A browser refusing cookies just means it is not remembered. The page
      // still works, and saying so would be noise about nothing.
    }
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-[9px]">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8b8a81]">Detail</span>
      <div className="flex gap-px" role="group" aria-label="How much website detail to show">
        {OPTIONS.map(option => {
          const on = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => choose(option.value)}
              className={`border px-[10px] py-[4px] text-[11.5px] transition-colors first:rounded-l-[6px] last:rounded-r-[6px] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6b9e61] ${
                on
                  ? 'border-[#dbd8cc] bg-white font-semibold text-[#1a1a18]'
                  : 'border-transparent font-medium text-[#8b8a81] hover:bg-[#f5f8f4] hover:text-[#5a5a52]'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
