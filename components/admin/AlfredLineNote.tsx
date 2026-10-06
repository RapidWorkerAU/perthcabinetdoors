'use client'

// ALFRED'S NOTE ON A LINE.
//
// Decided on the prototype: no pill and no extra column inside a line item
// table. A bow tie button sits in the Actions column beside the notes button,
// copper with a dot when Alfred left a note, with the same dark hover bubble as
// the notes button. Portalled to the body for the same reason LineNoteButton in
// QuoteEditor.js is: the Actions column is sticky, and a bubble inside it is
// painted over by the next row.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ALFRED, IconBowTie } from './AlfredMark'

const WIDTH = 300

export default function AlfredLineNote({ index, note }: { index: number; note?: string | null }) {
  const [anchor, setAnchor] = useState<null | { right: number; top?: number; bottom?: number }>(null)
  const hasNote = Boolean(String(note || '').trim())

  function show(event: { currentTarget: Element }) {
    const rect = event.currentTarget.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom > 170
    setAnchor({
      right: Math.max(12, window.innerWidth - rect.right),
      top: below ? rect.bottom + 6 : undefined,
      bottom: below ? undefined : window.innerHeight - rect.top + 6,
    })
  }
  const hide = () => setAnchor(null)

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <button
        type="button"
        onClick={event => (anchor ? hide() : show(event))}
        onKeyDown={event => {
          if (event.key === 'Escape') hide()
        }}
        aria-label={hasNote ? `Alfred's note on line ${index + 1}` : `Alfred had nothing to flag on line ${index + 1}`}
        className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors"
        style={
          hasNote
            ? { borderColor: ALFRED.border, background: ALFRED.bg, color: ALFRED.ink }
            : { borderColor: '#dbd8cc', background: '#fff', color: '#8b8a81' }
        }
      >
        <span className="relative inline-flex">
          <IconBowTie size={13} />
          {hasNote ? (
            <span className="absolute -right-[3px] -top-[3px] h-[5px] w-[5px] rounded-full ring-1 ring-white" style={{ background: ALFRED.strong }} />
          ) : null}
        </span>
      </button>
      {anchor && typeof document !== 'undefined'
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[60] flex flex-col gap-[2px] rounded-[6px] bg-[#1a1a18] px-3 py-[10px] text-[11px] leading-[1.45] text-white shadow-[0_8px_24px_rgba(26,26,24,0.28)]"
              style={{ width: WIDTH, right: anchor.right, top: anchor.top, bottom: anchor.bottom }}
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.09em]" style={{ color: ALFRED.border }}>
                Alfred
              </span>
              <span className="whitespace-pre-wrap break-words">{hasNote ? note : 'Nothing to flag on this line.'}</span>
            </span>,
            document.body
          )
        : null}
    </span>
  )
}

/** Alfred's note for a quote line: by the line's id, or its place if the id is unknown. */
export function alfredNoteFor(lineNotes: { lineId?: string | null; index?: number; note?: string }[] | null | undefined, line: { id?: string | null }, index: number) {
  const notes = Array.isArray(lineNotes) ? lineNotes : []
  const byId = line?.id ? notes.find(n => n.lineId === line.id) : null
  if (byId) return byId.note || ''
  const byIndex = notes.find(n => !n.lineId && n.index === index)
  return byIndex?.note || ''
}
