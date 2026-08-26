'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconRefresh, IconAlertTriangle, IconMail } from '@tabler/icons-react'
import {
  ACTORS,
  AGE_COLS,
  COLUMNS,
  COLUMN_KEYS,
  clockFor,
  groupCards,
  crossOptions,
  missingWords,
  visibleCards,
  splitByActor,
  counts,
} from '../../../lib/pcd-board'
import { formatMoney } from '../../../lib/pcd-quote-utils'
import { DISMISS_REASONS } from '../../../lib/pcd-board-dismissal'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'

type Card = {
  id: string
  cat: string
  who: string
  what: string
  why: string
  days: number
  late: boolean
  amt: number
  tags: [string, string][]
  theirs: boolean
  blocks: boolean
  href: string
  ticketId?: string | null
  customerId?: string | null
  subjectId?: string | null
  subjectType?: string | null
  stamp?: string | null
}

interface Props {
  cards: Card[]
  failed: string[]
  today: string
  loadedAt: string
  setAsideCount?: number
}

// What puts each kind of card back on the board, in the words of that card.
// Setting one aside is a line drawn in time rather than a delete, so the person
// doing it is told exactly what will undo it.
const COMES_BACK: Record<string, string> = {
  reply: 'Set aside. Their next email brings it straight back.',
  price: 'Set aside. It comes back if they ask again.',
  chase: 'Set aside. Reissuing it, or them writing back, brings it back.',
  depo: 'Set aside. It comes back if the deposit is requested again.',
  issue: 'Set aside. It comes back if the issue is raised again.',
}

function comeBackWording(cat: string) {
  return COMES_BACK[cat] || 'Set aside. It comes back if anything about it changes.'
}

// One hue per action, so a card is recognisable whichever way the columns are
// grouped. Matched to the admin's existing status colours where they overlap.
const HUE: Record<string, string> = {
  issue: '#b91c1c',
  reply: '#0e7490',
  price: '#7c3aed',
  depo: '#be123c',
  plan: '#15803d',
  materials: '#0369a1',
  late: '#4338ca',
  chase: '#b45309',
}

// HOW YOU LEFT IT.
//
// The grouping and the two filters are remembered in the browser, so a refresh,
// a trip to an order and back, or coming in tomorrow morning all put the board
// back the way you had it. It is a board somebody looks at ten times a day, and
// re-picking the grouping every time is the sort of small friction that ends
// with people not looking.
//
// Kept in the browser rather than the url or the database on purpose: it is a
// preference, not a place, and it belongs to the person rather than to the
// board. Versioned so a change to what the values MEAN can retire the old ones
// instead of restoring something that no longer exists.
const VIEW_KEY = 'pcd.board.view.v1'

type SavedView = { view: 'age' | 'cat'; actor: string; cross: string }

// A STORED FILTER THAT IS NO LONGER MEANINGFUL IS DROPPED, NOT RESTORED.
//
// The cross filter holds a category in the age view and an age band in the
// other, so restoring one against the wrong grouping would filter on a value
// nothing can match: a board showing nothing at all, on a Monday, with no way
// to tell that from having nothing to do.
function readSavedView(): SavedView | null {
  try {
    const raw = window.localStorage.getItem(VIEW_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<SavedView>
    const view: 'age' | 'cat' = saved.view === 'cat' ? 'cat' : 'age'
    const actor = ACTORS.some(a => a.key === saved.actor) ? String(saved.actor) : 'all'
    const valid = view === 'age' ? COLUMN_KEYS : AGE_COLS.map(a => a.key)
    const cross = valid.includes(String(saved.cross)) ? String(saved.cross) : ''
    return { view, actor, cross }
  } catch {
    // A browser with site data blocked keeps the defaults rather than breaking.
    return null
  }
}

// The board refreshes itself, because one that is an hour stale is dangerous
// for something whose whole job is stopping things being missed.
const REFRESH_MS = 4 * 60 * 1000

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
}

export default function BoardClient({ cards, failed, loadedAt, setAsideCount = 0 }: Props) {
  const router = useRouter()
  const [view, setView] = useState<'age' | 'cat'>('age')
  const [actor, setActor] = useState('all')
  const [cross, setCross] = useState('')
  const [stamp, setStamp] = useState(loadedAt)
  const [refreshing, setRefreshing] = useState(false)
  const [checkingMail, setCheckingMail] = useState(false)
  const [mobileCol, setMobileCol] = useState(0)
  const strip = useRef<HTMLDivElement | null>(null)
  const { toast } = useToast()

  // Closing a conversation is not a dismissal. It draws a line in time, and a
  // new email from the same person reopens the ticket by itself.
  const [closing, setClosing] = useState<Card | null>(null)
  const [reason, setReason] = useState('no_reply_needed')
  const [detail, setDetail] = useState('')
  const [saving, setSaving] = useState(false)

  // Setting a card aside is not a delete and not a permanent hide. It records
  // where the card's own clock was, so the card comes back by itself the moment
  // that clock moves: a new email, a reissued quote, another payment request.
  async function setAside() {
    if (!closing?.subjectId) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/board/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cat: closing.cat,
          subjectType: closing.subjectType,
          subjectId: closing.subjectId,
          stamp: closing.stamp,
          label: `${closing.who}: ${closing.what}`,
          reason,
          detail,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) {
        toast({ title: result.error || 'Could not set it aside.', variant: 'error' })
        return
      }
      setClosing(null)
      setDetail('')
      setReason('no_reply_needed')
      router.refresh()
      toast({ title: comeBackWording(closing.cat) })
    } catch (error) {
      toast({ title: (error as Error)?.message || 'Could not set it aside.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // Put it back the way it was left, once, on the client. Restoring during the
  // render instead would disagree with what the server sent and React would
  // throw the whole thing away and re-render it.
  const restored = useRef(false)
  useEffect(() => {
    const saved = readSavedView()
    if (saved) {
      setView(saved.view)
      setActor(saved.actor)
      setCross(saved.cross)
    }
    restored.current = true
  }, [])

  // Saved only AFTER the restore has happened. Writing on the first render
  // would store the defaults over what was there and remember nothing.
  useEffect(() => {
    if (!restored.current) return
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify({ view, actor, cross }))
    } catch {
      // Nothing to do about a browser that will not store it, and it is not
      // worth interrupting somebody's morning over a remembered dropdown.
    }
  }, [view, actor, cross])

  useEffect(() => { setStamp(loadedAt) }, [loadedAt])

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [router])

  // A tick so "3 minutes ago" does not sit there saying "just now" all morning.
  const [, force] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => force(n => n + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  const shown = useMemo(() => visibleCards(cards, { actor, view, cross }), [cards, actor, view, cross])
  const columns = useMemo(() => groupCards(shown, view, failed), [shown, view, failed])
  const options = useMemo(() => crossOptions(cards, view, actor), [cards, view, actor])
  const total = useMemo(() => counts(cards), [cards])
  // What is on screen right now, which is not the same as everything once a
  // filter is on. The header says which it is showing.
  const onScreen = useMemo(() => counts(shown), [shown])

  // Switching the grouping clears the filter: a category value means nothing
  // in the age view, and an age band means nothing in the other.
  function changeView(next: 'age' | 'cat') {
    setView(next)
    setCross('')
    setMobileCol(0)
    if (strip.current) strip.current.scrollTo({ left: 0 })
  }

  // REFRESH IS NOT THE SAME AS READING THE MAIL, and the difference is the
  // whole reason this button exists. refresh() re-reads the DATABASE, which is
  // what the sixty second timer does; it cannot know about a reply typed in
  // Outlook two minutes ago, because nothing has fetched it yet.
  //
  // So a card saying a customer is waiting on us stayed up all afternoon after
  // somebody had already answered them, and no amount of pressing "Updated"
  // would shift it. This goes and gets the mail first.
  function refresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 800)
  }

  async function checkMailbox() {
    setCheckingMail(true)
    toast({ title: 'Reading the mailbox. This can take a minute.' })
    try {
      const response = await fetch('/api/admin/customer-desk/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || 'Could not read the mailbox.', variant: 'error' })
        return
      }

      // Only now is the board looking at anything new.
      router.refresh()
      setStamp(new Date().toISOString())

      toast({
        // A run that stopped at its ceiling has left mail unread, and saying
        // "done" at that point is the exact failure the mail sync was rewritten
        // to stop making. See lib/pcd-desk-sync.js.
        title: payload.capped
          ? `${payload.added} message${payload.added === 1 ? '' : 's'} filed, and there is more still to read. Run it again.`
          : payload.added
            ? `${payload.added} new message${payload.added === 1 ? '' : 's'} filed.`
            : 'Nothing new in the mailbox.',
        variant: payload.capped ? 'error' : 'success',
      })
    } catch (error: unknown) {
      toast({
        title: error instanceof Error ? error.message : 'Could not read the mailbox.',
        variant: 'error',
      })
    } finally {
      setCheckingMail(false)
    }
  }

  // On a phone one column fills the screen and the strip snaps between them,
  // so a card is never squeezed. The chips above jump straight to a column.
  function jumpTo(index: number) {
    setMobileCol(index)
    const el = strip.current
    if (!el) return
    const child = el.children[index] as HTMLElement | undefined
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: 'smooth' })
  }

  function onStripScroll() {
    const el = strip.current
    if (!el) return
    const children = Array.from(el.children) as HTMLElement[]
    const middle = el.scrollLeft + el.clientWidth / 2
    let nearest = 0
    children.forEach((child, i) => {
      if (child.offsetLeft - el.offsetLeft <= middle) nearest = i
    })
    if (nearest !== mobileCol) setMobileCol(nearest)
  }

  const anyFailed = failed.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">

      {/* Header, pinned. Everything that moves, moves inside a column. */}
      <div className="flex-shrink-0 border-b border-[#dbd8cc] bg-white px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[#1a1a18]">The Board</h1>
          <span className="text-[12.5px] text-[#8b8a81]">
            {onScreen.us} need us{actor !== 'us' && onScreen.customer ? `, ${onScreen.customer} need the customer` : ''}
            {cross ? ' in this filter' : ''}
          </span>
          {/* Said out loud, because a board that quietly hides things is worse
              than a long one. Each of these comes back on its own the moment
              anything about it changes. */}
          {setAsideCount > 0 && (
            <span className="text-[11.5px] text-[#8b8a81]">
              · {setAsideCount} set aside
            </span>
          )}
          {/* Two controls, because they do two different things. The left one
              goes and gets the mail; the right one re-reads what is already
              here, which is also what the timer does on its own. */}
          <button
            type="button"
            onClick={checkMailbox}
            disabled={checkingMail}
            title="Read the sales mailbox now, so a reply you have just sent stops the card asking for one"
            className="ml-auto inline-flex min-h-[28px] items-center gap-1.5 rounded-[6px] border border-[#dbd8cc] px-2.5 text-[11.5px] font-semibold text-[#5a5a52] transition-colors hover:bg-[#f5f8f4] hover:text-[#1a1a18] disabled:opacity-50"
          >
            <IconMail size={13} className={checkingMail ? 'animate-pulse' : ''} />
            {checkingMail ? 'Reading…' : 'Check mailbox'}
          </button>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 text-[11.5px] text-[#8b8a81] transition-colors hover:text-[#1a1a18]"
          >
            <IconRefresh size={13} className={refreshing ? 'animate-spin' : ''} />
            Updated {ago(stamp)}
          </button>
        </div>

        {anyFailed && (
          <div className="mt-2.5 flex items-start gap-2 rounded-[6px] border border-[#fca5a5] bg-[#fef5f5] px-3 py-2">
            <IconAlertTriangle size={15} className="mt-[1px] flex-shrink-0 text-[#991b1b]" />
            <p className="text-[11.5px] leading-[1.5] text-[#991b1b]">
              <b className="font-semibold">Part of this board could not load.</b> Everything that did load is shown
              below, but <b className="font-semibold">{missingWords(failed) || 'one source'}</b> is missing from it.
              Reload before deciding nothing needs doing.
            </p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Control label="Group by">
            <Segmented
              value={view}
              onChange={v => changeView(v as 'age' | 'cat')}
              options={[{ value: 'age', label: 'Age' }, { value: 'cat', label: "What you'd be doing" }]}
            />
          </Control>

          <Control label="Show">
            <Segmented
              value={actor}
              onChange={setActor}
              options={ACTORS.map(a => ({
                value: a.key,
                label: a.label,
                count: a.key === 'all' ? total.all : a.key === 'us' ? total.us : total.customer,
              }))}
            />
          </Control>

          <Control label="Only">
            <select
              value={cross}
              onChange={e => setCross(e.target.value)}
              className={`h-[32px] max-w-[230px] rounded-[8px] border px-2.5 text-[12.5px] font-semibold outline-none transition-colors ${
                cross ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white' : 'border-[#dbd8cc] bg-white text-[#5a5a52]'
              }`}
            >
              <option value="">{view === 'age' ? 'Any kind of work' : 'Any age'}</option>
              {options.map(o => (
                <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
              ))}
            </select>
          </Control>

        </div>

        {/* Phone only: jump straight to a column rather than swiping through. */}
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 md:hidden">
          {columns.map((col, i) => (
            <button
              key={col.key}
              type="button"
              onClick={() => jumpTo(i)}
              className={`flex-shrink-0 rounded-full border px-2.5 py-[5px] text-[11.5px] font-semibold transition-colors ${
                mobileCol === i
                  ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white'
                  : 'border-[#dbd8cc] bg-white text-[#5a5a52]'
              }`}
            >
              {col.label}
              <span className="ml-1.5 font-mono opacity-70">{col.cards.length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* The columns fill what is left. Each scrolls inside itself, so a long
          one can never push another off the screen. */}
      <div
        ref={strip}
        onScroll={onStripScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-4 py-3 md:snap-none md:px-5"
      >
        {columns.map(col => {
          const split = splitByActor(col.cards)
          return (
            <section
              key={col.key}
              // ONE COLUMN WIDTH, BOTH VIEWS. The row scrolls sideways rather
              // than the columns resizing to whatever space is left.
              //
              // The age view used to stretch its four columns to fill, on the
              // grounds that four fit and stretching beat leaving a gap. That
              // stopped being true the moment the second sidebar took 220px:
              // the same four columns were then squeezed into the remainder, so
              // a card said less on the age view than on the category view for
              // no reason a person could see. A column that changes width
              // depending on which tab you are on is a column you cannot learn.
              className={`flex min-h-0 w-[86vw] flex-shrink-0 snap-start flex-col rounded-[11px] border bg-white md:w-[320px] md:snap-align-none ${
                col.failed ? 'border-[#fca5a5]'
                  : col.incomplete ? 'border-[#e8d68f]'
                  : col.urgent && split.ours.length ? 'border-[#f0bcbc]' : 'border-[#dbd8cc]'
              }`}
            >
              <header
                className={`flex-shrink-0 rounded-t-[10px] border-b border-[#edf4eb] px-3 py-2.5 ${
                  col.failed ? 'bg-[#fef5f5]'
                    : col.incomplete ? 'bg-[#fffdf0]'
                    : col.urgent && split.ours.length ? 'bg-[#fef5f5]' : ''
                }`}
                style={view === 'cat' ? { borderTop: `3px solid ${HUE[col.key] || '#dbd8cc'}` } : undefined}
              >
                <span className="float-right font-mono text-[15px] font-bold" style={view === 'cat' ? { color: HUE[col.key] } : undefined}>
                  {col.failed ? '?' : col.cards.length}
                </span>
                <h2 className={`text-[12.5px] font-bold tracking-[-0.01em] ${col.urgent && split.ours.length ? 'text-[#991b1b]' : 'text-[#1a1a18]'}`}>
                  {col.label}
                </h2>
                <p className={`mt-[3px] text-[10.5px] leading-[1.35] ${col.incomplete ? 'text-[#8a6d0b]' : 'text-[#8b8a81]'}`}>
                  {col.failed
                    ? 'Could not load. This is not zero, it is unknown.'
                    : col.incomplete
                      ? 'Some of this is missing. See the note above.'
                      : col.note}
                </p>
              </header>

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
                {col.failed ? (
                  <p className="px-2 py-6 text-center text-[11.5px] italic text-[#991b1b]">Nothing can be shown here.</p>
                ) : !col.cards.length ? (
                  <p className="px-2 py-6 text-center text-[11.5px] italic text-[#8b8a81]">Nothing here</p>
                ) : (
                  <>
                    {split.ours.map(c => <BoardCard key={c.id} card={c} showCat={view === 'age'} onClose={setClosing} />)}
                    {Boolean(split.theirs.length) && (
                      <div className="mx-[1px] mt-[3px] flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#8b8a81] before:h-px before:flex-1 before:bg-[#edeae0] after:h-px after:flex-1 after:bg-[#edeae0]">
                        Customer action
                      </div>
                    )}
                    {split.theirs.map(c => <BoardCard key={c.id} card={c} showCat={view === 'age'} onClose={setClosing} />)}
                  </>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <Modal
        open={Boolean(closing)}
        onClose={() => setClosing(null)}
        title="Set this aside"
        subtitle={closing ? `${closing.who} · ${closing.what}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClosing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={setAside} disabled={saving || (reason === 'other' && detail.trim().length < 4)}>
              Set it aside
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-medium text-[#5a5a52]">Why <span className="text-[#991b1b]">*</span></span>
            <div className="flex flex-wrap gap-[6px]">
              {DISMISS_REASONS.map(r => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(r.key)}
                  className={`rounded-[6px] border px-3 py-[6px] text-[12px] font-medium transition-colors ${
                    reason === r.key
                      ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white'
                      : 'border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="Anything to add"
            optional={reason !== 'other'}
            rows={2}
            placeholder={reason === 'other' ? 'Say why, in a few words.' : 'Only if it needs saying.'}
            value={detail}
            onChange={e => setDetail(e.target.value)}
          />

          <p className="rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 py-[10px] text-[11.5px] leading-[1.5] text-[#5a5a52]">
            Nothing is deleted. The reason is written into the customer or order timeline, and the card is
            held against where it stands today.
            <b className="text-[#1a1a18]"> {closing ? comeBackWording(closing.cat) : ''}</b>
          </p>
        </div>
      </Modal>
    </div>
  )
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#8b8a81]">{label}</span>
      {children}
    </span>
  )
}

function Segmented({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; count?: number }[]
}) {
  return (
    <span className="inline-flex gap-[3px] rounded-[8px] border border-[#dbd8cc] bg-[#f5f4ee] p-[3px]">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-[6px] px-3 py-[6px] text-[12.5px] font-semibold transition-colors ${
            value === o.value ? 'bg-[#1c2b1e] text-white' : 'text-[#5a5a52] hover:text-[#1a1a18]'
          }`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 font-mono text-[11px] opacity-75">{o.count}</span>}
        </button>
      ))}
    </span>
  )
}

// Compact. The name and the money share the top line, the money fixed and the
// name trimmed, so a narrow column can never push the figure off the edge.
// TWO LINKS ON ONE CARD, AND ONLY ONE OF THEM IS THE CARD.
//
// The body goes where the work is: the order, the quote, the issues tab. The
// NAME goes to the person, which is the other question somebody has in front of
// a card and used to mean leaving the board to search for them.
//
// An anchor cannot be nested inside another anchor. The browser closes the
// outer one at the inner one and the rest of the card stops being a link at
// all, silently. So the card is a div, the card's own link is an invisible
// layer over the whole of it, and the name sits above that layer. Both are real
// links: keyboard focus, middle click and open-in-new-tab all work on each.
function BoardCard({ card, showCat, onClose }: { card: Card; showCat: boolean; onClose?: (c: Card) => void }) {
  const hue = HUE[card.cat] || '#dbd8cc'
  const colLabel = COLUMNS.filter(c => c.key === card.cat)[0]?.label || ''

  return (
    <div
      className={`group relative block min-w-0 rounded-[8px] border p-[9px_11px_10px] transition-colors ${
        card.theirs ? 'border-dashed bg-[#fcfcfa]' : 'bg-white'
      } ${card.blocks ? 'border-[#f0bcbc] shadow-[inset_0_0_0_1px_#f0bcbc]' : 'border-[#dbd8cc] hover:border-[#c8c4b6]'}`}
      style={{ borderLeft: `3px solid ${card.theirs ? '#c9c6bc' : hue}` }}
    >
      {/* The card's own link, covering the card. Behind everything that is
          itself clickable, so the name and the set aside button win. */}
      <a
        href={card.href}
        aria-label={`${card.who}: ${card.what}`}
        className="absolute inset-0 z-0 rounded-[8px]"
      />
      {showCat && (
        <span
          className="block text-[9.5px] font-bold uppercase leading-[1.3] tracking-[0.05em]"
          style={{ color: card.theirs ? '#8b8a81' : hue }}
        >
          {colLabel}
        </span>
      )}

      <div className="relative z-10 flex items-baseline gap-2">
        {card.customerId ? (
          <a
            href={`/admin/customers/${card.customerId}`}
            title={`Open ${card.who}`}
            className={`min-w-0 flex-1 truncate text-[12.5px] font-bold tracking-[-0.01em] underline-offset-2 hover:underline focus-visible:underline ${
              card.theirs ? 'text-[#5a5a52]' : 'text-[#1a1a18]'
            }`}
          >
            {card.who}
          </a>
        ) : (
          // Nobody to open. A website enquiry from an address we have never
          // seen has no record behind it, so the name stays plain text rather
          // than a link that goes nowhere.
          <span className={`min-w-0 flex-1 truncate text-[12.5px] font-bold tracking-[-0.01em] ${card.theirs ? 'text-[#5a5a52]' : 'text-[#1a1a18]'}`}>
            {card.who}
          </span>
        )}
        {Boolean(card.amt) && (
          <span className="flex-shrink-0 font-mono text-[12px] font-bold text-[#1a1a18]">
            {formatMoney(card.amt, 'AUD')}
          </span>
        )}
      </div>

      <p className="relative z-10 mt-[2px] line-clamp-2 text-[11.5px] leading-[1.4] text-[#5a5a52] pointer-events-none">{card.what}</p>

      {Boolean(card.tags.length) && (
        <div className="relative z-10 mt-[7px] flex flex-wrap gap-1 pointer-events-none">
          {card.tags.map(([text, kind], i) => (
            <span
              key={`${text}-${i}`}
              className={`inline-flex whitespace-nowrap rounded-[5px] border px-1.5 py-px text-[9.5px] font-semibold ${
                kind === 'miss'
                  ? 'border-[#e8d68f] bg-[#fffdf0] text-[#8a6d0b]'
                  : kind === 'new'
                    ? 'border-[#c3dcf2] bg-[#eff4fa] text-[#185fa5]'
                    : 'border-[#dbd8cc] bg-[#f5f4ee] text-[#5a5a52]'
              } ${kind === 'ref' ? 'font-mono' : ''}`}
            >
              {text}
            </span>
          ))}
        </div>
      )}

      <p className="relative z-10 mt-[7px] line-clamp-2 border-t border-dotted border-[#dbd8cc] pt-[6px] text-[10px] leading-[1.4] text-[#8b8a81] pointer-events-none">
        {card.why}
      </p>

      <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex whitespace-nowrap rounded-[5px] border px-1.5 py-px font-mono text-[9.5px] font-semibold ${
            card.late ? 'border-[#f0bcbc] bg-[#fef5f5] text-[#991b1b]' : 'border-[#dbd8cc] bg-[#f5f4ee] text-[#5a5a52]'
          }`}
        >
          {card.days}d {clockFor(card.cat)}
        </span>
        {card.theirs && (
          <span className="inline-flex whitespace-nowrap rounded-[5px] border border-[#dbd8cc] bg-[#f5f4ee] px-1.5 py-px text-[9.5px] font-semibold text-[#5a5a52]">
            Customer action
          </span>
        )}
        {Boolean(card.subjectId) && onClose && (
          <button
            type="button"
            title="Take it off the board. It comes back if anything changes."
            onClick={event => { event.preventDefault(); event.stopPropagation(); onClose(card) }}
            className="ml-auto whitespace-nowrap rounded-[5px] border border-[#dbd8cc] bg-white px-1.5 py-px text-[9.5px] font-semibold text-[#5a5a52] transition-colors hover:border-[#c8c4b6] hover:text-[#1a1a18]"
          >
            Set aside
          </button>
        )}
      </div>
    </div>
  )
}
