'use client'

import * as React from 'react'
import Link from 'next/link'
import { IconCalendarPlus, IconChevronLeft, IconChevronRight, IconRefresh, IconSettings } from '@tabler/icons-react'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { AdminPageHeader } from '@/components/ui/AdminPageHeader'
import { useToast } from '@/components/ui/Toast'
import AdminLoading from '@/components/admin/AdminLoading'
import useIsMobile from '@/hooks/useIsMobile'
import BookingModal, { KIND_COLOUR, type BookingDraft } from './BookingModal'
import {
  addDays,
  addMonths,
  bookingFromRow,
  bookingKindLabel,
  clipRun,
  defaultMinutesFor,
  defaultTitle,
  formatDay,
  formatHours,
  formatMinutes,
  formatMonth,
  isOutsideMonth,
  isUnclaimed,
  labelReach,
  monthGridWeeks,
  packIntoLanes,
  perthToday,
  runsFromOrders,
  runTileText,
  bookingTileDetail,
  bookingTileText,
  startOfMonth,
  startOfWeek,
  timeAgo,
  timelineDays,
  weekLabourHours,
} from '../../../lib/pcd-calendar'

// The job calendar.
//
// WEEKS AT ONCE, because the question it exists to answer is "what is on, and
// where is the gap", and that question is never about one day. Jobs are rows
// and days run across, so a run is one continuous bar and a week that is thick
// with work looks thick. Six weeks by default, three or four when the day
// columns need to be wide enough to read a booking without clicking it.
//
// A BOOKING IS ONE DAY WIDE, ALWAYS. It was two, so the time would fit inside
// it, which meant a one hour site measure was drawn as a two day event. Now the
// coloured block covers exactly the day it is on and only the WORDS spill into
// the days beside it, and only as far as the next thing booked in that lane.
//
// WHAT IS DRAWN AND WHAT IS STORED. Production bars come from pcd_orders and
// are never stored on the calendar: their dates live on the order and are
// changed on the order. Bookings are the only rows, and the only thing anybody
// adds here. See lib/pcd-calendar.js.
//
// THE HOURS FIGURE IS REPORTED, NOT GRADED. Each week header carries the labour
// hours locked into it and nothing else. No colour, no threshold, no verdict
// about whether that is full: too much of what makes a week workable is not in
// the database, and a system that pronounced on it would be confidently wrong
// often enough to be ignored, which is worse than saying nothing.

const LABEL_W = 208
const PRODUCTION_COLOUR = '#6b9e61'

// How many weeks the timeline may show. Six is the horizon for planning a
// quarter; three makes the columns wide enough to read a booking without
// clicking it.
const WEEK_CHOICES = [3, 4, 6]

// The three ways of looking at the same weeks. Each answers a different
// question, which is why all three earn their place rather than one being the
// "real" one.
const VIEWS = [
  { key: 'timeline', label: 'Timeline', hint: 'Weeks at once. What is on and where the gap is.' },
  { key: 'month',    label: 'Month',    hint: 'The familiar one. Good on a wall.' },
  { key: 'week',     label: 'Week',     hint: 'One week by the hour. Good for planning a day.' },
]
const VIEW_KEYS = VIEWS.map(view => view.key)

// The clock a work week is drawn against. Nothing is booked at four in the
// morning, and drawing the hours nobody works just makes the rest smaller.
//
// END IS EXCLUSIVE: the last row drawn is DAY_END_HOUR - 1, and it covers the
// hour after it. At 17 the last label was 4pm, which is earlier than deliveries
// and installs actually run.
const DAY_START_HOUR = 7
const DAY_END_HOUR = 19

// How far a booking's label may run past its own day before it is cut short.
// The coloured block is always exactly one day: the words are the only thing
// that borrows the space, and only where the space is genuinely empty.
const MAX_LABEL_DAYS = 4

// THE DAY COLUMNS STRETCH. Every column is an equal share of whatever room is
// left after the labels, so six weeks fill a wide screen instead of stopping
// short two thirds of the way across it. Bars are therefore placed as
// percentages of the row rather than in pixels, which is the only way the two
// can stay in step as the window is resized.
//
// The minimum below is what the columns are allowed to shrink to before the
// whole thing scrolls sideways instead. A day narrower than this cannot hold a
// two digit date.
const MIN_CELL = 28

/** Where a bar starts and how wide it is, as a share of the row. */
function span(from: number, width: number, total: number) {
  return {
    left:  `calc(${((from / total) * 100).toFixed(4)}% + 2px)`,
    width: `calc(${((width / total) * 100).toFixed(4)}% - 4px)`,
  }
}

// The order the bookings band is grouped in. A point in time on a job's own row
// would be lost against a bar, so bookings get their own lanes above the jobs,
// grouped by the kind of trip they are.
const BANDS = [
  { label: 'Site measures',          kinds: ['measure'] },
  { label: 'Deliveries and installs', kinds: ['delivery', 'install'] },
  { label: 'Reminders and other',     kinds: ['reminder', 'other'] },
]

interface Settings {
  weekends: boolean
  finished: boolean
  compact:  boolean
  weeks:    number
  view:     string
}

const DEFAULT_SETTINGS: Settings = { weekends: false, finished: false, compact: false, weeks: 6, view: 'timeline' }
const SETTINGS_KEY = 'pcd-calendar-settings'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Run = any
type Booking = any

interface Selection {
  type: 'run' | 'booking'
  run?: Run
  booking?: Booking
}

// Only a status worth remarking on gets a pill. "Active" is what a job on the
// calendar normally is, and labelling every row with it would be noise.
const STATUS_DOT: Record<string, string> = {
  pending_deposit: '#dcbf55',
  on_hold:         '#b42318',
  complete:        '#8b8a81',
}

/**
 * The same fact the timeline puts in a pill, in the space a bar has.
 *
 * Only ever drawn for a status worth remarking on: "active" is what a job on
 * the calendar normally is, and a dot against every one of them would be noise
 * that trained people to stop seeing the dots.
 */
function StatusDot({ status }: { status: string }) {
  const colour = STATUS_DOT[status]
  if (!colour) return null
  return (
    <span
      className="h-[6px] w-[6px] flex-none rounded-full ring-1 ring-white/70"
      style={{ backgroundColor: colour }}
      title={STATUS_PILL[status]?.label}
    />
  )
}

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  pending_deposit: { label: 'Deposit due', className: 'bg-[#fffdf0] text-[#8a6d0b] border-[#e8d68f]' },
  on_hold:         { label: 'On hold',     className: 'bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]' },
  complete:        { label: 'Finished',    className: 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]' },
}

export default function CalendarManager() {
  const { toast } = useToast()

  // The detail panel needs about 300px beside the timeline. Below that the
  // same detail opens as a sheet instead. 1024 is Tailwind lg.
  const narrow = useIsMobile(1024)
  // A phone gets a layout of its own rather than a squeezed desktop one, so
  // below this width the toolbar steps and labels months whatever the toggle
  // says. See MobileCalendar.
  const phone = useIsMobile(768)

  const today = React.useMemo(() => perthToday(), [])
  // A plain day. Each view decides what it means: the timeline and the week
  // take the Monday of it, the month grid takes its month. Rounding it here
  // would open the month grid on August for the whole of the first of September.
  const [anchor, setAnchor] = React.useState(() => perthToday())
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS)

  const [orders, setOrders]   = React.useState<Run[]>([])
  const [events, setEvents]   = React.useState<Booking[]>([])
  const [isLoading, setLoading]     = React.useState(true)
  const [setupRequired, setSetup]   = React.useState(false)
  const [loadError, setLoadError]   = React.useState('')

  const [sync, setSync]           = React.useState<Record<string, unknown> | null>(null)
  const [isSyncing, setSyncing]   = React.useState(false)

  const [selected, setSelected]     = React.useState<Selection | null>(null)
  const [draft, setDraft]           = React.useState<BookingDraft | null>(null)
  const [bookingOpen, setBooking]   = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [cancelling, setCancelling] = React.useState<Booking | null>(null)
  // Which day the phone's month grid is showing underneath. Empty means today,
  // and moving to another month clears it rather than leaving a day selected
  // that is no longer on screen.
  const [pickedDay, setPickedDay] = React.useState('')

  // Read in an effect rather than in the state initialiser, because the server
  // renders this component too and has no localStorage. Reading it up there
  // would make the first paint disagree with the second.
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SETTINGS_KEY)
      if (!saved) return
      const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
      // A remembered week count from an older version, or one edited by hand,
      // must not be able to ask for a hundred weeks of orders.
      if (!WEEK_CHOICES.includes(parsed.weeks)) parsed.weeks = DEFAULT_SETTINGS.weeks
      // Same guard for the view. A remembered name from a version that had a
      // fourth layout must not leave the page with nothing to draw.
      if (!VIEW_KEYS.includes(parsed.view)) parsed.view = DEFAULT_SETTINGS.view
      setSettings(parsed)
    } catch {
      // A browser with site data blocked still gets a working calendar, just
      // not a remembered one.
    }
  }, [])

  function saveSettings(next: Settings) {
    setSettings(next)
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch { /* see above */ }
  }

  // WHAT STRETCH OF DAYS THIS VIEW IS LOOKING AT. Worked out once so the
  // request, the drawing and the label in the toolbar cannot disagree about it.
  // The anchor is a single day for all three; each view decides what it means.
  const viewWindow = React.useMemo(() => {
    if (phone || settings.view === 'month') {
      const weeks = monthGridWeeks(anchor)
      return { from: weeks[0], to: addDays(weeks[weeks.length - 1], 6), weeks }
    }
    if (!phone && settings.view === 'week') {
      const from = startOfWeek(anchor)
      return { from, to: addDays(from, 6), weeks: [from] }
    }
    const from = startOfWeek(anchor)
    return {
      from,
      to: addDays(from, settings.weeks * 7 - 1),
      weeks: Array.from({ length: settings.weeks }, (_, index) => addDays(from, index * 7)),
    }
  }, [anchor, phone, settings.view, settings.weeks])

  const windowStart = viewWindow.from
  const windowEnd = viewWindow.to

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/calendar?from=${windowStart}&to=${windowEnd}`, { cache: 'no-store' })
      const payload = await res.json()
      setSetup(!!payload.setupRequired)
      setLoadError(payload.error || '')
      setOrders(payload.orders || [])
      setEvents(payload.events || [])
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'The calendar could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [windowStart, windowEnd])

  React.useEffect(() => { load() }, [load])

  // Checked once on arrival. The answer changes rarely and a page that asked on
  // every render would be pestering Microsoft for no reason.
  React.useEffect(() => {
    fetch('/api/admin/calendar/sync', { cache: 'no-store' })
      .then(res => res.json())
      .then(setSync)
      .catch(() => setSync({ ok: false, error: 'The Outlook link could not be checked.' }))
  }, [])

  async function runSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/calendar/sync', { method: 'POST' })
      const payload = await res.json()
      if (!payload.ok) {
        toast({ title: 'The mailbox calendar could not be reached.', description: payload.error, variant: 'error' })
      } else {
        const pulled = payload.pulled || {}
        const changed = (pulled.updated || 0) + (pulled.created || 0) + (pulled.cancelled || 0)
        toast({
          title: changed ? `${changed} change${changed === 1 ? '' : 's'} brought back from Outlook.` : 'Already up to date with Outlook.',
          variant: 'success',
        })
        await load()
      }
      const fresh = await fetch('/api/admin/calendar/sync', { cache: 'no-store' }).then(r => r.json())
      setSync(fresh)
    } catch (error: unknown) {
      toast({ title: error instanceof Error ? error.message : 'The sync failed.', variant: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  // ── What is drawn ─────────────────────────────────────────────────────────

  const runs = React.useMemo(() => {
    const all = runsFromOrders(orders)
    return settings.finished ? all : all.filter((run: Run) => run.status !== 'complete')
  }, [orders, settings.finished])

  const bookings = React.useMemo(
    () => events.map(bookingFromRow).filter(Boolean),
    [events]
  )

  const days = React.useMemo(
    () => timelineDays(viewWindow.from, viewWindow.weeks.length, { includeWeekends: settings.weekends }),
    [viewWindow, settings.weekends]
  )

  const visibleRuns = React.useMemo(
    () => runs.filter((run: Run) => clipRun(run, days)),
    [runs, days]
  )

  const dayIndex = React.useMemo(() => {
    const map = new Map<string, number>()
    days.forEach((day: string, index: number) => map.set(day, index))
    return map
  }, [days])

  const rowH  = settings.compact ? 26 : 34
  const laneH = settings.compact ? 20 : 24
  // The narrowest the six weeks are allowed to get before the panel scrolls
  // sideways rather than squeezing the days into something unreadable.
  const minGridW = LABEL_W + days.length * MIN_CELL
  // The arrows move half a window at a time, so there is always an overlap with
  // what you were just looking at rather than a jump to somewhere unfamiliar.
  const step = Math.max(1, Math.floor(settings.weeks / 2)) * 7

  // Moving, and saying where you are. Both follow the view: a month grid that
  // jumped three weeks, or a heading reading "24 Aug to 4 Oct" over a grid of
  // August, would be the page disagreeing with itself.
  const shownView = phone ? 'month' : settings.view
  const move = (next: string) => { setAnchor(next); setPickedDay('') }
  const goBack = () =>
    move(shownView === 'month' ? addMonths(anchor, -1)
      : shownView === 'week' ? addDays(anchor, -7)
      : addDays(anchor, -step))
  const goForward = () =>
    move(shownView === 'month' ? addMonths(anchor, 1)
      : shownView === 'week' ? addDays(anchor, 7)
      : addDays(anchor, step))
  const stepLabel =
    shownView === 'month' ? 'a month'
      : shownView === 'week' ? 'a week'
      : `${step / 7} weeks`
  // What to call the stretch on screen, in the words a person would use.
  const periodWords =
    shownView === 'month' ? 'this month'
      : shownView === 'week' ? 'this week'
      : `these ${settings.weeks} weeks`
  const rangeLabel =
    shownView === 'month'
      ? formatMonth(anchor)
      : `${formatDay(windowStart)} to ${formatDay(windowEnd, { long: true })}`

  function openBooking(day: string, kind = 'measure') {
    setDraft({
      kind,
      title: defaultTitle(kind, ''),
      day,
      startMinutes: 9 * 60,
      minutes: defaultMinutesFor(kind),
      customerId: null,
      customerName: '',
      orderId: null,
      siteAddress: '',
      notes: '',
      addToOutlook: true,
    })
    setBooking(true)
  }

  function editBooking(booking: Booking) {
    setDraft({
      id: booking.id,
      kind: booking.kind,
      title: booking.title,
      day: booking.day,
      startMinutes: booking.startMinutes,
      minutes: booking.minutes,
      customerId: booking.customerId,
      customerName: booking.customerName,
      orderId: booking.orderId,
      siteAddress: booking.siteAddress,
      notes: booking.notes,
      addToOutlook: booking.syncState !== 'skipped',
      // So the form can say the change is going back to the same Outlook event
      // rather than leaving somebody wondering whether it made a second one.
      fromOutlook: booking.source === 'outlook',
      unclaimed: isUnclaimed(booking),
    })
    setSelected(null)
    setBooking(true)
  }

  /** Booking a trip for a job that is already on the calendar. */
  function bookFor(run: Run, kind: string) {
    setDraft({
      kind,
      title: defaultTitle(kind, run.customerName),
      // The day the job is due, because that is when it is ready to leave.
      // Editable in the form like everything else.
      day: run.end,
      startMinutes: kind === 'install' ? 8 * 60 : 7 * 60 + 30,
      minutes: defaultMinutesFor(kind),
      customerId: run.customerId,
      customerName: run.customerName,
      orderId: run.orderId,
      siteAddress: run.suburb,
      notes: '',
      addToOutlook: true,
    })
    setSelected(null)
    setBooking(true)
  }

  async function cancelBooking(booking: Booking) {
    try {
      const res = await fetch(`/api/admin/calendar/${booking.id}`, { method: 'DELETE' })
      const payload = await res.json()
      if (!payload.ok) {
        toast({ title: payload.error || 'The booking could not be cancelled.', variant: 'error' })
        return
      }
      toast({ title: 'Cancelled here and taken off the mailbox calendar.', variant: 'success' })
      setSelected(null)
      await load()
    } catch (error: unknown) {
      toast({ title: error instanceof Error ? error.message : 'The booking could not be cancelled.', variant: 'error' })
    } finally {
      setCancelling(null)
    }
  }

  if (isLoading && !orders.length && !events.length) {
    return <AdminLoading steps={['Reading what is on', 'Checking the mailbox calendar']} label="Loading the calendar" />
  }

  const hasAnything = visibleRuns.length > 0 || bookings.length > 0

  return (
    // The page's own padding, the same as Orders, Customers and Quotes. The
    // admin shell deliberately gives <main> none, so a page without this sits
    // flush against the chrome and reads as broken next to every other one.
    <div className="flex flex-col gap-4 p-4 md:p-6">

      <AdminPageHeader
        title="Calendar"
        subtitle="What is on each week, and what is booked out of the workshop."
        actions={
          <>
            {/* Left of everything else, because it decides what the rest of the
                page is. Built to the same height as the buttons beside it so the
                row reads as one row. */}
            <span className="hidden md:inline-flex">
              <ViewToggle
                value={settings.view}
                onPick={view => saveSettings({ ...settings, view })}
              />
            </span>
            <Button variant="secondary" size="sm" iconLeft={<IconRefresh size={15} />} onClick={runSync} loading={isSyncing}>
              Sync now
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<IconSettings size={15} />} onClick={() => setSettingsOpen(true)}>
              Settings
            </Button>
            <Button size="sm" iconLeft={<IconCalendarPlus size={15} />} onClick={() => openBooking(today)}>
              Book something
            </Button>
          </>
        }
        className="mb-0"
      />

      {/* Under the buttons rather than among them: it is something you glance
          at, not something you press. It only raises its voice when the answer
          is that the calendar is NOT current. */}
      <SyncLine sync={sync} />

      {setupRequired && (
        <div className="rounded-[8px] border border-[#e8d68f] bg-[#fffdf0] px-4 py-3 text-[13px] text-[#8a6d0b]">
          The calendar tables are not in the database yet. Run{' '}
          <span className="font-mono text-[12px]">supabase/202608241600_pcd_calendar_setup.sql</span> and reload.
          {loadError ? <span className="mt-1 block text-[12px]">{loadError}</span> : null}
        </div>
      )}

      {/* ── Range and legend ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[#dbd8cc] bg-white px-3 py-[10px]">
        <div className="flex items-center gap-[6px]">
          <Button variant="secondary" size="sm" iconOnly aria-label={`Back ${stepLabel}`} onClick={goBack}>
            <IconChevronLeft size={16} />
          </Button>
          <Button variant="secondary" size="sm" iconOnly aria-label={`Forward ${stepLabel}`} onClick={goForward}>
            <IconChevronRight size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setAnchor(today); setPickedDay('') }}>Today</Button>
        </div>
        <span className="text-[14px] font-bold tracking-[-0.01em] text-[#1a1a18]">
          {rangeLabel}
        </span>
        <div className="ml-auto hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5a5a52] md:flex">
          <Swatch colour={PRODUCTION_COLOUR} label="Production run" />
          <Swatch colour={KIND_COLOUR.measure} label="Site measure" />
          <Swatch colour={KIND_COLOUR.delivery} label="Delivery" />
          <Swatch colour={KIND_COLOUR.install} label="Install" />
          <Swatch colour={KIND_COLOUR.reminder} label="Reminder" />
          <span className="flex items-center gap-[5px]">
            <span className="inline-block h-[9px] w-[9px] rounded-[2.5px] border border-dashed border-[#8b8a81] bg-[repeating-linear-gradient(135deg,transparent_0_3px,#f5f8f4_3px_6px)]" />
            From Outlook, not claimed
          </span>
        </div>
      </div>

      {!hasAnything && !isLoading && (
        <div className="hidden md:block">
        <EmptyState
          title={`Nothing on ${periodWords}`}
          description="No job is scheduled to run and nothing is booked. Jobs appear here on their own once an order has a start date and a timeframe."
          action={<Button size="sm" onClick={() => openBooking(today)}>Book something</Button>}
        />
        </div>
      )}

      {/* ── The timeline, and the detail panel beside it ───────────────── */}
      {hasAnything && (
      <div className="flex items-start gap-4">
        <div className="hidden min-w-0 flex-1 overflow-x-auto rounded-[8px] border border-[#dbd8cc] bg-white md:block">
          {settings.view === 'month' ? (
            <MonthGrid
              weeks={viewWindow.weeks}
              monthAnchor={startOfMonth(anchor)}
              runs={runs}
              bookings={bookings}
              today={today}
              settings={settings}
              selected={selected}
              onSelectRun={run => setSelected({ type: 'run', run })}
              onSelectBooking={booking => setSelected({ type: 'booking', booking })}
            />
          ) : settings.view === 'week' ? (
            <WorkWeek
              weekStart={viewWindow.from}
              runs={runs}
              bookings={bookings}
              today={today}
              settings={settings}
              selected={selected}
              onSelectRun={run => setSelected({ type: 'run', run })}
              onSelectBooking={booking => setSelected({ type: 'booking', booking })}
            />
          ) : (
          <div style={{ minWidth: minGridW }}>

            {/* Week headers, carrying the hours locked into each one. */}
            <Row labelWidth={LABEL_W}>
              <div className="sticky left-0 z-[3] flex items-end bg-white px-3 pb-[6px] pt-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">
                  Labour hours locked in
                </span>
              </div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${settings.weeks}, minmax(0, 1fr))` }}>
                {Array.from({ length: settings.weeks }, (_, week) => {
                  const weekStart = addDays(anchor, week * 7)
                  return (
                    <div key={weekStart} className="flex items-baseline gap-[6px] border-b border-r border-[#edf4eb] px-2 py-[6px]">
                      <b className="font-mono text-[13px] font-bold tabular-nums text-[#1a1a18]">
                        {formatHours(weekLabourHours(runs, weekStart))}
                      </b>
                      <span className="text-[10px] font-semibold text-[#8b8a81]">wk {formatDay(weekStart).replace(/^\w+\s/, '')}</span>
                    </div>
                  )
                })}
              </div>
            </Row>

            {/* Day numbers. */}
            <Row labelWidth={LABEL_W}>
              <div className="sticky left-0 z-[3] bg-white" />
              <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((day: string) => (
                  <DayHeader key={day} day={day} isToday={day === today} />
                ))}
              </div>
            </Row>

            {/* ── Bookings ─────────────────────────────────────────────── */}
            <SectionLabel>Bookings</SectionLabel>
            {BANDS.map(band => {
              const items = bookings.filter((b: Booking) => band.kinds.includes(b.kind) && dayIndex.has(b.day))
              if (!items.length) return null
              // A booking ends on the day it starts, so two only share a lane when they
              // are genuinely on the same day. Telling the packer it ended the day AFTER
              // was left over from the two day tile, and made a measure every day Mon to
              // Fri zigzag across two rows as though something overlapped.
              const packed = packIntoLanes(items, (x: Booking) => x.day, (x: Booking) => x.day)
              const lanes = packed.reduce((most: number, entry: { lane: number }) => Math.max(most, entry.lane + 1), 0)
              const height = Math.max(rowH, lanes * laneH + 8)

              // HOW FAR THE WORDS MAY RUN. The coloured block is always exactly
              // one day, because a booking is on one day and a tile spanning two
              // was the calendar telling a lie. The label alone is allowed to
              // spill into the days beside it, and only up to whatever is booked
              // next in the same lane, so it never covers something real.
              const occupied = new Map<number, number[]>()
              packed.forEach(({ item, lane }: { item: Booking; lane: number }) => {
                if (!occupied.has(lane)) occupied.set(lane, [])
                occupied.get(lane)!.push(dayIndex.get(item.day) as number)
              })
              occupied.forEach(list => list.sort((a, b) => a - b))

              const labelDays = (lane: number, from: number) =>
                labelReach(from, occupied.get(lane) || [], { max: MAX_LABEL_DAYS, total: days.length })

              return (
                <Row key={band.label} labelWidth={LABEL_W}>
                  <div className="sticky left-0 z-[3] flex flex-col justify-center bg-white px-3 py-1">
                    <span className="truncate text-[12.5px] font-bold tracking-[-0.01em] text-[#1a1a18]">{band.label}</span>
                    <span className="truncate text-[10.5px] text-[#8b8a81]">{items.length} booked</span>
                  </div>
                  <div className="relative" style={{ height }}>
                    <Grid days={days} today={today} />
                    {packed.map(({ item, lane }: { item: Booking; lane: number }) => {
                      const from = dayIndex.get(item.day) as number
                      const reach = labelDays(lane, from)
                      // Hatched only while nobody has said what it is. See isUnclaimed.
                      const unclaimed = isUnclaimed(item)
                      const selectedHere = selected?.type === 'booking' && selected.booking?.id === item.id

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelected({ type: 'booking', booking: item })}
                          title={`${item.title}, ${formatDay(item.day)} at ${formatMinutes(item.startMinutes)}`}
                          className="absolute flex items-center overflow-hidden rounded-[4px] text-left hover:bg-[#f5f8f4]"
                          style={{ ...span(from, reach, days.length), top: 4 + lane * laneH, height: laneH - 4 }}
                        >
                          {/* The day itself. One column, never more. */}
                          <span
                            className={[
                              'h-full flex-none rounded-[4px]',
                              unclaimed
                                ? 'border border-dashed border-[#8b8a81] bg-[repeating-linear-gradient(135deg,#fff_0_4px,#dbd8cc_4px_8px)]'
                                : 'border border-black/[0.14]',
                              selectedHere ? 'ring-2 ring-[#1a1a18]' : '',
                            ].join(' ')}
                            style={{
                              width: `${(100 / reach).toFixed(4)}%`,
                              ...(unclaimed ? {} : { backgroundColor: KIND_COLOUR[item.kind] || KIND_COLOUR.other }),
                            }}
                          />
                          {/* The words, on whatever empty space is next to it. */}
                          <span
                            className={[
                              'truncate pl-[5px] pr-[3px] text-[11px] font-semibold',
                              unclaimed ? 'text-[#8b8a81]' : 'text-[#1a1a18]',
                            ].join(' ')}
                          >
                            {bookingTileText(item)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </Row>
              )
            })}

            {/* ── Jobs ─────────────────────────────────────────────────── */}
            <SectionLabel>Jobs in production</SectionLabel>
            {visibleRuns.map((run: Run) => {
              const clip = clipRun(run, days)
              if (!clip) return null
              const pill = STATUS_PILL[run.status]

              return (
                <Row key={run.id} labelWidth={LABEL_W}>
                  <div className="sticky left-0 z-[3] flex flex-col justify-center bg-white px-3 py-1">
                    <span className="flex items-center gap-[6px]">
                      <span className="truncate text-[12.5px] font-bold tracking-[-0.01em] text-[#1a1a18]">{run.name}</span>
                      {pill && (
                        <span className={`flex-none rounded-full border px-[5px] text-[9.5px] font-semibold ${pill.className}`}>
                          {pill.label}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[10.5px] text-[#8b8a81]">
                      {[run.customerName, run.suburb].filter(Boolean).join(', ') || run.orderNumber}
                    </span>
                  </div>
                  <div className="relative" style={{ height: rowH }}>
                    <Grid days={days} today={today} />
                    <button
                      type="button"
                      onClick={() => setSelected({ type: 'run', run })}
                      title={`${run.orderNumber}, ${formatDay(run.start)} to ${formatDay(run.end)}`}
                      className={[
                        'absolute flex items-center gap-[6px] overflow-hidden whitespace-nowrap px-[7px]',
                        'border border-black/[0.14] text-[11.5px] font-semibold text-white',
                        'shadow-[0_1px_2px_rgba(28,43,30,0.08)] hover:brightness-[1.07]',
                        clip.continuesBefore ? 'rounded-l-none border-l-dashed' : 'rounded-l-[5px]',
                        clip.continuesAfter ? 'rounded-r-none border-r-dashed' : 'rounded-r-[5px]',
                        run.status === 'complete' ? 'opacity-55' : '',
                        // A job with a promised date and no plan behind it is
                        // drawn hollow, so "due then, unscheduled" never reads
                        // as a booked run.
                        run.scheduled ? '' : 'opacity-70',
                      ].join(' ')}
                      style={{
                        ...span(clip.from, clip.span, days.length),
                        top: 5,
                        height: rowH - 10,
                        backgroundColor: PRODUCTION_COLOUR,
                      }}
                    >
                      <StatusDot status={run.status} />
                      <span className="truncate">{runTileText(run)}</span>
                      {run.labourHours > 0 && (
                        <span className="ml-auto flex-none font-mono text-[10px] tabular-nums opacity-90">{run.labourHours}h</span>
                      )}
                    </button>
                  </div>
                </Row>
              )
            })}
            {!visibleRuns.length && (
              <p className="px-3 py-4 text-[12.5px] text-[#8b8a81]">
                No job is scheduled to run in {periodWords}.
              </p>
            )}
          </div>
          )}
        </div>

        {/* Stays open as you click from one thing to the next, so several jobs
            can be read across without opening and closing anything. Below this
            width there is no room for it and the same detail opens as a sheet. */}
        <aside className="hidden w-[304px] flex-none rounded-[8px] border border-[#dbd8cc] bg-white p-4 lg:block">
          <DetailBody
            selection={selected}
            runs={runs}
            bookings={bookings}
            today={today}
            onEdit={editBooking}
            onCancel={booking => setCancelling(booking)}
            onBookFor={bookFor}
          />
        </aside>
      </div>
      )}

      {/* ── The phone ──────────────────────────────────────────────────── */}
      {!isLoading && (
        <MobileCalendar
          weeks={viewWindow.weeks}
          monthAnchor={startOfMonth(anchor)}
          runs={runs}
          bookings={bookings}
          today={today}
          selectedDay={pickedDay}
          onPickDay={setPickedDay}
          onPickRun={run => setSelected({ type: 'run', run })}
          onPickBooking={booking => setSelected({ type: 'booking', booking })}
        />
      )}

      {/* ── The same detail, where the panel does not fit ───────────────── */}
      <Modal
        // Only where the panel does not fit. Rendering it hidden behind a CSS
        // breakpoint would still trap focus and lock the page behind an
        // invisible dialog every time something was selected.
        open={Boolean(selected) && narrow}
        onClose={() => setSelected(null)}
        title={selected?.type === 'run' ? selected.run.name : selected?.booking?.title || ''}
        subtitle={
          selected?.type === 'run'
            ? selected.run.orderNumber
            : selected
              ? `${bookingKindLabel(selected.booking.kind)}, ${formatDay(selected.booking.day, { long: true })}`
              : ''
        }
        size="lg"
      >
        <DetailBody
          selection={selected}
          runs={runs}
          bookings={bookings}
          today={today}
          hideHeading
          onEdit={editBooking}
          onCancel={booking => setCancelling(booking)}
          onBookFor={bookFor}
        />
      </Modal>

      <BookingModal
        open={bookingOpen}
        onClose={() => setBooking(false)}
        onSaved={load}
        draft={draft}
        orders={orders}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={saveSettings}
      />

      <ConfirmModal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancelBooking(cancelling)}
        title="Cancel this booking?"
        description={
          cancelling
            ? `${cancelling.title} on ${formatDay(cancelling.day, { long: true })} will be taken off the mailbox calendar. The record of it is kept here.`
            : ''
        }
        confirmLabel="Cancel the booking"
        cancelLabel="Keep it"
        variant="danger"
      />
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Row({ labelWidth, children }: { labelWidth: number; children: React.ReactNode }) {
  return (
    <div className="grid items-stretch" style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky left-0 px-3 pb-[5px] pt-[14px] text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8b8a81]">
      {children}
    </div>
  )
}

/**
 * The three layouts, as one control.
 *
 * Built to 32px, the same height the small buttons beside it are, so the action
 * row reads as one row rather than as a control that wandered in. The choice is
 * kept with the other calendar settings, so it is remembered per device exactly
 * as weekends and row height are.
 */
function ViewToggle({ value, onPick }: { value: string; onPick: (view: string) => void }) {
  return (
    <div className="inline-flex h-[32px] overflow-hidden rounded-[6px] border border-[#dbd8cc]" role="group" aria-label="Calendar layout">
      {VIEWS.map(view => {
        const on = value === view.key
        return (
          <button
            key={view.key}
            type="button"
            aria-pressed={on}
            title={view.hint}
            onClick={() => onPick(view.key)}
            className={[
              'h-full border-r border-[#dbd8cc] px-3 text-[12.5px] font-semibold last:border-r-0 transition-colors',
              on ? 'bg-[#1c2b1e] text-white' : 'bg-white text-[#5a5a52] hover:bg-[#f5f8f4]',
            ].join(' ')}
          >
            {view.label}
          </button>
        )
      })}
    </div>
  )
}

function Swatch({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-[5px]">
      <span className="inline-block h-[9px] w-[9px] rounded-[2.5px]" style={{ backgroundColor: colour }} />
      {label}
    </span>
  )
}

// ── Month grid ──────────────────────────────────────────────────────────────
//
// The familiar one. Whole weeks, so it reaches into the month either side and
// draws those days faded rather than blank: a job running over the turn of the
// month has to be visible on both. The hours locked into each week sit in a
// gutter down the right, the same figure the timeline puts in its header.

function MonthGrid({
  weeks, monthAnchor, runs, bookings, today, settings, selected, onSelectRun, onSelectBooking,
}: {
  weeks: string[]
  monthAnchor: string
  runs: Run[]
  bookings: Booking[]
  today: string
  settings: Settings
  selected: Selection | null
  onSelectRun: (run: Run) => void
  onSelectBooking: (booking: Booking) => void
}) {
  const laneH = settings.compact ? 18 : 21
  const columns = settings.weekends ? 7 : 5
  const gutter = 92
  const template = `repeat(${columns}, minmax(0, 1fr)) ${gutter}px`

  return (
    <div style={{ minWidth: columns * 96 + gutter }}>
      <div className="grid border-b border-[#dbd8cc] bg-[#f5f8f4]" style={{ gridTemplateColumns: template }}>
        {timelineDays(weeks[0], 1, { includeWeekends: settings.weekends }).map(day => (
          <div key={day} className="border-r border-[#f0efe8] px-2 py-[6px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">
            {formatDay(day).split(' ')[0]}
          </div>
        ))}
        <div className="px-2 py-[6px] text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">Hours</div>
      </div>

      {weeks.map(weekStart => {
        const days = timelineDays(weekStart, 1, { includeWeekends: settings.weekends })
        const weekEnd = addDays(weekStart, 6)
        const jobs = runs.filter((run: Run) => run.start <= weekEnd && run.end >= weekStart)
        const packed = packIntoLanes(
          jobs,
          (run: Run) => (run.start < weekStart ? weekStart : run.start),
          (run: Run) => (run.end > weekEnd ? weekEnd : run.end)
        )
        const lanes = packed.reduce((most: number, entry: { lane: number }) => Math.max(most, entry.lane + 1), 0)
        const barsHeight = lanes * (laneH + 2)

        return (
          <div key={weekStart} className="relative grid border-b border-[#dbd8cc] last:border-b-0" style={{ gridTemplateColumns: template }}>
            {days.map(day => (
              <div
                key={day}
                className={[
                  'flex min-h-[104px] flex-col border-r border-[#f0efe8] px-[5px] pb-[6px] pt-[4px]',
                  isWeekendDay(day) ? 'bg-[#f5f8f4]' : '',
                  isOutsideMonth(day, monthAnchor) ? 'opacity-45' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'self-start rounded-[5px] px-[5px] font-mono text-[11.5px] font-bold tabular-nums',
                    day === today ? 'bg-[#2d5e28] text-white' : 'text-[#5a5a52]',
                  ].join(' ')}
                >
                  {new Date(`${day}T00:00:00Z`).getUTCDate()}
                </span>

                {/* Room for the bars drawn over the top of this row. */}
                <div style={{ height: barsHeight }} />

                <div className="mt-auto flex flex-col gap-[2px]">
                  {bookings.filter((booking: Booking) => booking.day === day).map((booking: Booking) => {
                    const unclaimed = isUnclaimed(booking)
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => onSelectBooking(booking)}
                        title={`${booking.title}${booking.siteAddress ? `, ${booking.siteAddress}` : ''}`}
                        className={[
                          'flex h-[18px] items-center gap-[4px] overflow-hidden rounded-[4px] px-[4px] text-left text-[10.5px] font-semibold',
                          unclaimed ? 'border border-dashed border-[#8b8a81] text-[#5a5a52]' : 'text-white',
                          selected?.type === 'booking' && selected.booking?.id === booking.id ? 'ring-2 ring-[#1a1a18]' : '',
                        ].join(' ')}
                        style={unclaimed ? {} : { backgroundColor: KIND_COLOUR[booking.kind] || KIND_COLOUR.other }}
                      >
                        <span className="truncate">{bookingTileText(booking)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="flex flex-col items-end justify-center border-l border-[#dbd8cc] bg-[#f5f8f4] px-[9px]">
              <b className="font-mono text-[14px] font-bold tabular-nums leading-[1.1] text-[#1a1a18]">
                {formatHours(weekLabourHours(runs, weekStart))}
              </b>
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-[#8b8a81]">locked in</span>
            </div>

            {/* The bars, over the cells rather than inside any one of them, so a
                run crossing four days is one bar and not four. */}
            <div className="pointer-events-none absolute left-0 top-[24px]" style={{ right: gutter }}>
              {packed.map(({ item: run, lane }: { item: Run; lane: number }) => {
                const clip = clipRun(run, days)
                if (!clip) return null
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => onSelectRun(run)}
                    title={`${run.orderNumber}, ${formatDay(run.start)} to ${formatDay(run.end)}`}
                    className={[
                      'pointer-events-auto absolute flex items-center gap-[5px] overflow-hidden whitespace-nowrap px-[6px]',
                      'border border-black/[0.14] text-[10.5px] font-semibold text-white shadow-[0_1px_2px_rgba(28,43,30,0.08)]',
                      clip.continuesBefore ? 'rounded-l-none border-l-dashed' : 'rounded-l-[4px]',
                      clip.continuesAfter ? 'rounded-r-none border-r-dashed' : 'rounded-r-[4px]',
                      run.status === 'complete' ? 'opacity-55' : '',
                      selected?.type === 'run' && selected.run?.id === run.id ? 'ring-2 ring-[#1a1a18]' : '',
                    ].join(' ')}
                    style={{
                      ...span(clip.from, clip.span, days.length),
                      top: lane * (laneH + 2),
                      height: laneH,
                      backgroundColor: PRODUCTION_COLOUR,
                    }}
                  >
                    <StatusDot status={run.status} />
                    <span className="truncate">{runTileText(run, { withIdentity: true })}</span>
                    {run.labourHours > 0 && (
                      <span className="ml-auto flex-none font-mono text-[9.5px] tabular-nums opacity-90">{run.labourHours}h</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Work week ───────────────────────────────────────────────────────────────
//
// One week against a clock. Production runs are day long facts, so they sit in
// a strip above rather than being smeared down the hours; the bookings below
// are at the time they are actually at, which is what makes this the view for
// planning a Tuesday.

function WorkWeek({
  weekStart, runs, bookings, today, settings, selected, onSelectRun, onSelectBooking,
}: {
  weekStart: string
  runs: Run[]
  bookings: Booking[]
  today: string
  settings: Settings
  selected: Selection | null
  onSelectRun: (run: Run) => void
  onSelectBooking: (booking: Booking) => void
}) {
  const hourH = settings.compact ? 44 : 56
  const days = timelineDays(weekStart, 1, { includeWeekends: settings.weekends })
  const weekEnd = addDays(weekStart, 6)
  const template = `58px repeat(${days.length}, minmax(0, 1fr))`
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index)

  const jobs = runs.filter((run: Run) => run.start <= weekEnd && run.end >= weekStart)
  const packed = packIntoLanes(
    jobs,
    (run: Run) => (run.start < weekStart ? weekStart : run.start),
    (run: Run) => (run.end > weekEnd ? weekEnd : run.end)
  )
  const lanes = packed.reduce((most: number, entry: { lane: number }) => Math.max(most, entry.lane + 1), 0)

  return (
    <div style={{ minWidth: 58 + days.length * 96 }}>
      <div className="grid border-b border-[#dbd8cc] bg-[#f5f8f4]" style={{ gridTemplateColumns: template }}>
        <div className="flex flex-col justify-center border-r border-[#f0efe8] px-2 py-[6px]">
          <b className="font-mono text-[14px] font-bold tabular-nums text-[#1a1a18]">{formatHours(weekLabourHours(runs, weekStart))}</b>
          <span className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[#8b8a81]">locked in</span>
        </div>
        {days.map(day => (
          <div key={day} className="border-r border-[#f0efe8] px-2 py-[6px] text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b8a81]">{formatDay(day).split(' ')[0]}</div>
            <div className={`font-mono text-[17px] font-bold tabular-nums ${day === today ? 'text-[#2d5e28]' : 'text-[#1a1a18]'}`}>
              {new Date(`${day}T00:00:00Z`).getUTCDate()}
            </div>
          </div>
        ))}
      </div>

      {/* In production. Day long, so above the clock rather than down it. The
          heading is its own row: squeezed into the hour gutter beside it, the
          word "production" was wider than the column and ran out under the
          first bar. */}
      <div className="border-b border-[#f0efe8] bg-[#f5f8f4] px-3 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#8b8a81]">
        Jobs in production
      </div>
      <div className="relative grid border-b border-[#dbd8cc]" style={{ gridTemplateColumns: template, minHeight: Math.max(38, lanes * 22 + 12) }}>
        <div className="border-r border-[#f0efe8] bg-[#f5f8f4]" />
        {days.map(day => (
          <div key={day} className={`border-r border-[#f0efe8] ${isWeekendDay(day) ? 'bg-[#f5f8f4]' : ''}`} />
        ))}

        <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: 58 }}>
          {packed.map(({ item: run, lane }: { item: Run; lane: number }) => {
            const clip = clipRun(run, days)
            if (!clip) return null
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelectRun(run)}
                title={`${run.orderNumber}, ${formatDay(run.start)} to ${formatDay(run.end)}`}
                className={[
                  'pointer-events-auto absolute flex items-center gap-[5px] overflow-hidden whitespace-nowrap px-[6px]',
                  'border border-black/[0.14] text-[11px] font-semibold text-white shadow-[0_1px_2px_rgba(28,43,30,0.08)]',
                  clip.continuesBefore ? 'rounded-l-none border-l-dashed' : 'rounded-l-[4px]',
                  clip.continuesAfter ? 'rounded-r-none border-r-dashed' : 'rounded-r-[4px]',
                  run.status === 'complete' ? 'opacity-55' : '',
                  selected?.type === 'run' && selected.run?.id === run.id ? 'ring-2 ring-[#1a1a18]' : '',
                ].join(' ')}
                style={{ ...span(clip.from, clip.span, days.length), top: 5 + lane * 22, height: 19, backgroundColor: PRODUCTION_COLOUR }}
              >
                <StatusDot status={run.status} />
                <span className="truncate">{runTileText(run, { withIdentity: true })}</span>
                {run.labourHours > 0 && <span className="ml-auto flex-none font-mono text-[10px] tabular-nums opacity-90">{run.labourHours}h</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* The clock. */}
      <div className="grid" style={{ gridTemplateColumns: template }}>
        <div className="border-r border-[#f0efe8] bg-[#f5f8f4]">
          {hours.map(hour => (
            <div
              key={hour}
              className="border-b border-[#f0efe8] px-[6px] pt-[1px] text-right font-mono text-[9.5px] text-[#8b8a81]"
              style={{ height: hourH }}
            >
              {formatMinutes(hour * 60)}
            </div>
          ))}
        </div>

        {days.map(day => (
          <div
            key={day}
            className={[
              'relative border-r border-[#f0efe8]',
              isWeekendDay(day) ? 'bg-[#f5f8f4]' : '',
              day === today ? 'bg-[#fdf8e8]' : '',
            ].join(' ')}
          >
            {hours.map(hour => <div key={hour} className="border-b border-[#f0efe8]" style={{ height: hourH }} />)}

            {bookings.filter((booking: Booking) => booking.day === day).map((booking: Booking) => {
              const unclaimed = isUnclaimed(booking)
              // Anything before the working day starts is pinned to the top
              // rather than drawn off the grid: an early delivery is exactly the
              // thing you must not lose.
              //
              // AND THE SAME AT THE OTHER END. Only the top was clamped, so a
              // booking after the last row was drawn below the grid and clipped
              // away entirely. A late install is no less real than an early one,
              // and a booking you cannot see is worse than one in the wrong row.
              const gridHeight = hours.length * hourH
              const height = Math.max(20, (booking.minutes / 60) * hourH - 3)
              const top = Math.min(
                Math.max(0, ((booking.startMinutes - DAY_START_HOUR * 60) / 60) * hourH),
                Math.max(0, gridHeight - height),
              )
              const detail = bookingTileDetail(booking)
              return (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => onSelectBooking(booking)}
                  className={[
                    'absolute left-[3px] right-[3px] overflow-hidden rounded-[5px] border px-[5px] py-[3px] text-left',
                    unclaimed ? 'border-dashed border-[#8b8a81] bg-white text-[#5a5a52]' : 'border-black/[0.14] text-white',
                    selected?.type === 'booking' && selected.booking?.id === booking.id ? 'ring-2 ring-[#1a1a18]' : '',
                  ].join(' ')}
                  title={[booking.title, detail.when, detail.where].filter(Boolean).join(' · ')}
                  style={{ top, height, ...(unclaimed ? {} : { backgroundColor: KIND_COLOUR[booking.kind] || KIND_COLOUR.other }) }}
                >
                  <span className="block truncate text-[10.5px] font-semibold">{detail.who}</span>
                  <span className="block truncate text-[9.5px] opacity-90">{detail.when}</span>
                  {detail.where && height > 44 && (
                    <span className="block truncate text-[9.5px] opacity-80">{detail.where}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The ruled background a row's bars sit on. */
function Grid({ days, today }: { days: string[]; today: string }) {
  return (
    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map(day => (
        <div
          key={day}
          className={[
            'border-r border-[#f0efe8]',
            isWeekendDay(day) ? 'bg-[#f5f8f4]' : '',
            day === today ? 'bg-[#fdf8e8]' : '',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

function DayHeader({ day, isToday }: { day: string; isToday: boolean }) {
  const date = new Date(`${day}T00:00:00Z`)
  const dayNumber = date.getUTCDate()
  return (
    <div
      className={[
        'border-b border-r border-[#dbd8cc] px-0 pb-[5px] pt-[3px] text-center',
        isWeekendDay(day) ? 'bg-[#f5f8f4]' : '',
        isToday ? 'bg-[#fdf8e8]' : '',
      ].join(' ')}
    >
      <span className="block text-[9.5px] text-[#8b8a81]">
        {/* The month is named on its first day rather than in a header of its
            own, which is the only place it is ever actually needed. */}
        {dayNumber === 1
          ? new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'short' }).format(date)
          : new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'narrow' }).format(date)}
      </span>
      <b className={`block font-mono text-[12px] font-bold tabular-nums ${isToday ? 'text-[#2d5e28]' : 'text-[#5a5a52]'}`}>
        {dayNumber}
      </b>
    </div>
  )
}

function isWeekendDay(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return weekday === 0 || weekday === 6
}

/**
 * One quiet line saying whether what you are looking at is current.
 *
 * This used to be a pill in the button row reading "Not listening to Outlook",
 * which took a slot to say something true but not useful: the question a person
 * has is "is this up to date", and a subscription is our problem, not theirs.
 *
 * So it answers that question in the words they would use, and only raises its
 * voice when the honest answer is no. Nothing about a healthy sync needs colour.
 */
function SyncLine({ sync }: { sync: Record<string, unknown> | null }) {
  const line = (text: string, tone: 'quiet' | 'warn' = 'quiet', title?: string) => (
    <p
      title={title}
      className={`-mt-1 text-right text-[12px] ${tone === 'warn' ? 'font-semibold text-[#8a6d0b]' : 'text-[#8b8a81]'}`}
    >
      {text}
    </p>
  )

  if (!sync) return line('Checking Outlook')

  const calendar = sync.calendar as { ok?: boolean; configured?: boolean; error?: string } | undefined
  if (calendar && !calendar.configured) {
    return line('Outlook is not connected yet', 'warn', 'MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MS_MAILBOX are all needed.')
  }
  if (calendar && !calendar.ok) {
    return line('Outlook could not be reached', 'warn', calendar.error)
  }

  const last = sync.lastPullAt ? timeAgo(String(sync.lastPullAt)) : ''
  const when = last ? `Last synced with Outlook ${last}` : 'Not synced with Outlook yet'

  // Saved here, not there. Worth saying out loud, because the booking looks
  // exactly the same on this page either way.
  const waiting = Number(sync.waiting || 0)
  if (waiting > 0) {
    return line(
      `${waiting} booking${waiting === 1 ? '' : 's'} not in Outlook yet · ${when.toLowerCase()}`,
      'warn',
      'Saved here, but the mailbox calendar has not taken them yet. Sync now tries again.'
    )
  }

  return line(when, 'quiet', sync.lastPullAt ? new Date(String(sync.lastPullAt)).toLocaleString('en-AU') : undefined)
}

// ── Detail ──────────────────────────────────────────────────────────────────

// One definition of what a thing's detail says, used by the panel beside the
// timeline and by the sheet that replaces it on a narrow screen. Two copies
// would drift, and the one nobody looks at on a big monitor would be the one
// that ended up missing a field.
function DetailBody({
  selection, runs, bookings, today, hideHeading = false, onEdit, onCancel, onBookFor,
}: {
  selection:    Selection | null
  runs:         Run[]
  bookings:     Booking[]
  today:        string
  hideHeading?: boolean
  onEdit:       (booking: Booking) => void
  onCancel:     (booking: Booking) => void
  onBookFor:    (run: Run, kind: string) => void
}) {
  // Nothing selected. Rather than an empty box, the panel answers the question
  // somebody opening a calendar has anyway: what does this week look like.
  if (!selection) {
    const weekStart = startOfWeek(today)
    const weekEnd = addDays(weekStart, 6)
    const running = runs.filter((run: Run) => run.start <= weekEnd && run.end >= weekStart)
    const out = bookings.filter(
      (booking: Booking) => booking.day >= weekStart && booking.day <= weekEnd && booking.source !== 'outlook'
    )

    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-[15px] font-bold tracking-[-0.01em] text-[#1a1a18]">This week</h3>
        <div>
          <Field label="Labour locked in" value={formatHours(weekLabourHours(runs, weekStart))} />
          <Field label="Jobs running" value={String(running.length)} />
          <Field label="Trips out" value={String(out.length)} />
        </div>
        <p className="text-[12.5px] leading-[1.6] text-[#8b8a81]">
          Click a bar to see the order behind it, or a booking to see the customer, the address and whether it is in Outlook yet.
        </p>
        <p className="text-[12.5px] leading-[1.6] text-[#8b8a81]">
          Production bars are drawn from the order, so they are never typed in twice. Bookings are the only thing you add here.
        </p>
      </div>
    )
  }

  if (selection.type === 'run') {
    const run = selection.run
    return (
      <div className="flex flex-col gap-3">
        {!hideHeading && (
          <div>
            <span className="flex items-center gap-[6px] text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ color: PRODUCTION_COLOUR }}>
              <span className="h-[9px] w-[9px] rounded-[2.5px]" style={{ backgroundColor: PRODUCTION_COLOUR }} />
              Production run
            </span>
            <h3 className="mt-[3px] break-words text-[15px] font-bold tracking-[-0.01em] text-[#1a1a18]">{run.name}</h3>
            <p className="font-mono text-[11.5px] text-[#8b8a81]">{run.orderNumber}</p>
          </div>
        )}

        <div>
          <Field label="Customer" value={run.customerName || 'Not recorded'} />
          <Field label="Suburb" value={run.suburb || 'Not recorded'} />
          <Field label="Starts" value={run.scheduled ? formatDay(run.start, { long: true }) : 'Not scheduled'} />
          <Field label="Due" value={formatDay(run.end, { long: true })} />
          <Field label="Labour" value={run.labourHours ? `${run.labourHours} hours` : 'Not costed'} />
          <Field label="Status" value={STATUS_PILL[run.status]?.label || 'Active'} />
        </div>

        <p className="rounded-[7px] border border-[#edf4eb] bg-[#f5f8f4] px-[10px] py-[9px] text-[12px] leading-[1.55] text-[#5a5a52]">
          {run.scheduled
            ? 'These dates live on the order, not on the calendar. Change the start or the timeframe there and this bar moves with it, and the due date follows, pulled back to the Friday if it lands on a weekend.'
            : 'This job has a due date typed on it but no scheduled start, so there is nothing to draw a run from. Give it a start and a timeframe on the order and it becomes a bar.'}
        </p>

        <div className="flex flex-wrap gap-[6px]">
          <Button variant="secondary" size="sm" onClick={() => onBookFor(run, 'delivery')}>Book a delivery</Button>
          <Button variant="secondary" size="sm" onClick={() => onBookFor(run, 'install')}>Book an install</Button>
          <Link href={`/admin/orders/${run.orderId}`}><Button size="sm">Open the order</Button></Link>
        </div>
      </div>
    )
  }

  const booking = selection.booking
  const fromOutlook = booking.source === 'outlook'
  const unclaimed = isUnclaimed(booking)
  const colour = KIND_COLOUR[booking.kind] || KIND_COLOUR.other

  return (
    <div className="flex flex-col gap-3">
      {!hideHeading && (
        <div>
          <span className="flex items-center gap-[6px] text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ color: unclaimed ? '#8b8a81' : colour }}>
            <span className="h-[9px] w-[9px] rounded-[2.5px]" style={{ backgroundColor: unclaimed ? '#8b8a81' : colour }} />
            {unclaimed ? 'From Outlook, not claimed' : bookingKindLabel(booking.kind)}
          </span>
          <h3 className="mt-[3px] break-words text-[15px] font-bold tracking-[-0.01em] text-[#1a1a18]">{booking.title}</h3>
          <p className="text-[11.5px] text-[#8b8a81]">{formatDay(booking.day, { long: true })}</p>
        </div>
      )}

      <div>
        <Field label="When" value={`${formatMinutes(booking.startMinutes)} to ${formatMinutes(booking.startMinutes + booking.minutes)}`} />
        {booking.customerName && (
          <Field
            label="Customer"
            value={
              booking.customerId
                ? <Link className="font-semibold text-[#2d5e28] underline" href={`/admin/customers/${booking.customerId}`}>{booking.customerName}</Link>
                : booking.customerName
            }
          />
        )}
        {booking.siteAddress && <Field label="Address" value={booking.siteAddress} />}
        {booking.orderId && (
          <Field
            label="About"
            value={<Link className="font-semibold text-[#2d5e28] underline" href={`/admin/orders/${booking.orderId}`}>Open the order</Link>}
          />
        )}
        <Field
          label="In Outlook"
          value={
            booking.syncState === 'skipped' ? 'Deliberately kept off it'
              : booking.inOutlook ? 'Yes'
              : booking.syncState === 'failed' ? 'Not yet, last try failed'
              : 'Not yet'
          }
        />
      </div>

      {booking.syncError && (
        <p className="break-words rounded-[7px] border border-[#e8d68f] bg-[#fffdf0] px-[10px] py-[9px] text-[12px] leading-[1.55] text-[#8a6d0b]">
          {booking.syncError}
        </p>
      )}

      {booking.notes && (
        <p className="whitespace-pre-wrap break-words rounded-[7px] border border-[#edf4eb] bg-[#f5f8f4] px-[10px] py-[9px] text-[12px] leading-[1.55] text-[#5a5a52]">
          {booking.notes}
        </p>
      )}

      {/* WHERE IT WAS TYPED IS NOT WHERE IT HAS TO BE MANAGED. An entry made in
          Outlook used to be read only here, which meant a measure booked on a
          phone in somebody's kitchen could never be attached to that customer.
          It carries an Outlook event id like any other, so an edit here is an
          update to the same event rather than a second copy of it. */}
      {fromOutlook && (
        <p className="rounded-[7px] border border-[#edf4eb] bg-[#f5f8f4] px-[10px] py-[9px] text-[12px] leading-[1.55] text-[#5a5a52]">
          {unclaimed
            ? 'This was typed into the sales mailbox calendar and nobody has said what it is yet. Say what it is and who it is for and it joins the rest of the calendar.'
            : 'This was typed into the sales mailbox calendar. Changes made here go back to the same Outlook event.'}
        </p>
      )}

      <div className="flex flex-wrap gap-[6px]">
        <Button size="sm" onClick={() => onEdit(booking)}>
          {unclaimed ? 'Say what it is' : 'Edit'}
        </Button>
        <Button variant="danger" size="sm" onClick={() => onCancel(booking)}>Cancel booking</Button>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#edf4eb] pb-[6px] text-[13px]">
      <span className="flex-none font-medium text-[#8b8a81]">{label}</span>
      {/* min-w-0 AND break-words, because neither alone is enough. A flex child
          will not shrink below its content without the first, and a Zoom link
          has no spaces to break at without the second. An address pasted out of
          a meeting invite ran straight out of the panel. */}
      <span className="min-w-0 break-words text-right font-semibold text-[#1a1a18]">{value}</span>
    </div>
  )
}

// ── Settings ────────────────────────────────────────────────────────────────

function SettingsModal({
  open, onClose, settings, onChange,
}: {
  open: boolean
  onClose: () => void
  settings: Settings
  onChange: (next: Settings) => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Calendar settings"
      subtitle="Remembered on this device."
      size="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-1">
        {/* Only the timeline has a choice about this. A month is a month and a
            week is a week, so offering it alongside them would be a control
            that quietly does nothing. */}
        <Choice
          label="Weeks on screen"
          why="How far the Timeline reaches. Six is the horizon for planning a quarter. Three makes the day columns wide enough to read a booking without clicking it. The arrows move half a window at a time whichever you pick."
          options={WEEK_CHOICES.map(weeks => [`${weeks} weeks`, weeks] as [string, number])}
          value={settings.weeks}
          onPick={value => onChange({ ...settings, weeks: value as number })}
          hidden={settings.view !== 'timeline'}
        />
        <Choice
          label="Weekends"
          why="Nothing is cut on a Saturday, so five columns fit more weeks on one screen. Show them when a delivery or an install lands on one. A job still runs across the weekend either way."
          options={[['Hide', false], ['Show', true]]}
          value={settings.weekends}
          onPick={value => onChange({ ...settings, weekends: value as boolean })}
        />
        <Choice
          label="Finished jobs"
          why="Off keeps the calendar about what is coming. On is how you look back at a month that has been."
          options={[['Hide', false], ['Show', true]]}
          value={settings.finished}
          onPick={value => onChange({ ...settings, finished: value as boolean })}
        />
        <Choice
          label="Row height"
          why="Compact fits about half again as many jobs before you scroll, and on the Week view it shortens the hours. Comfortable is easier to read across a room."
          options={[['Comfortable', false], ['Compact', true]]}
          value={settings.compact}
          onPick={value => onChange({ ...settings, compact: value as boolean })}
        />
      </div>
    </Modal>
  )
}

function Choice({
  label, why, options, value, onPick, hidden = false,
}: {
  label: string
  why: string
  hidden?: boolean
  // A setting is either a yes or no or one of a short list, and both are the
  // same control, so this takes whichever rather than having two of them.
  options: [string, boolean | number][]
  value: boolean | number
  onPick: (value: boolean | number) => void
}) {
  if (hidden) return null
  return (
    <div className="border-b border-[#edf4eb] py-3 last:border-b-0">
      <div className="text-[13px] font-semibold text-[#1a1a18]">{label}</div>
      <p className="mb-[8px] mt-[3px] max-w-[62ch] text-[12px] leading-[1.5] text-[#5a5a52]">{why}</p>
      <div className="inline-flex overflow-hidden rounded-[6px] border border-[#dbd8cc]">
        {options.map(([optionLabel, optionValue]) => (
          <button
            key={optionLabel}
            type="button"
            aria-pressed={value === optionValue}
            onClick={() => onPick(optionValue)}
            className={[
              'min-h-[36px] border-r border-[#dbd8cc] px-3 text-[12.5px] font-semibold last:border-r-0 transition-colors',
              value === optionValue ? 'bg-[#2d5e28] text-white' : 'bg-white text-[#5a5a52] hover:bg-[#f5f8f4]',
            ].join(' ')}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── The phone ───────────────────────────────────────────────────────────────
//
// A six week timeline cannot be made to work on a phone, and shrinking it until
// it fits would leave something unreadable rather than something useful. What a
// phone is actually for here is "what is on today and this week", so it gets a
// day by day list of exactly that.

// ── The phone ───────────────────────────────────────────────────────────────
//
// NOT A SQUEEZED DESKTOP LAYOUT. None of the three fit: a six week timeline
// needs a metre of width, and a week of hour columns on a phone is five
// slivers. What a phone is actually for here is "what is on, and what is on
// that day", so it gets the shape people already know from the calendar on
// their phone: a month of dots, tap a day, read the day.
//
// The dots are the compromise that makes it work. A month cell is about 44px
// wide, which holds a date and three dots and nothing else, so the cell says
// HOW MUCH and WHAT KIND and the list underneath says the rest.

function dayDots(day: string, runs: Run[], bookings: Booking[]) {
  const dots: string[] = []
  if (runs.some((run: Run) => run.start <= day && run.end >= day)) dots.push(PRODUCTION_COLOUR)
  for (const booking of bookings) {
    if (booking.day !== day) continue
    const colour = isUnclaimed(booking) ? '#8b8a81' : KIND_COLOUR[booking.kind] || KIND_COLOUR.other
    if (!dots.includes(colour)) dots.push(colour)
  }
  return dots
}

function MobileCalendar({
  weeks, monthAnchor, runs, bookings, today, selectedDay, onPickDay, onPickRun, onPickBooking,
}: {
  weeks: string[]
  monthAnchor: string
  runs: Run[]
  bookings: Booking[]
  today: string
  selectedDay: string
  onPickDay: (day: string) => void
  onPickRun: (run: Run) => void
  onPickBooking: (booking: Booking) => void
}) {
  const day = selectedDay || today
  const dayRuns = runs.filter((run: Run) => run.start <= day && run.end >= day)
  const dayBookings = bookings
    .filter((booking: Booking) => booking.day === day)
    .sort((a: Booking, b: Booking) => a.startMinutes - b.startMinutes)

  return (
    <div className="flex flex-col gap-3 md:hidden">

      {/* The month. Seven columns always: a five day month on a phone reads as
          a broken calendar rather than as a working week. */}
      <div className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
        <div className="grid grid-cols-7 border-b border-[#edf4eb] bg-[#f5f8f4]">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, index) => (
            <div key={index} className="py-[5px] text-center text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b8a81]">
              {letter}
            </div>
          ))}
        </div>

        {weeks.map(weekStart => (
          <div key={weekStart} className="grid grid-cols-7">
            {Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).map(cell => {
              const dots = dayDots(cell, runs, bookings)
              const isToday = cell === today
              const chosen = cell === day
              return (
                <button
                  key={cell}
                  type="button"
                  onClick={() => onPickDay(cell)}
                  aria-pressed={chosen}
                  aria-label={formatDay(cell, { long: true })}
                  className={[
                    'flex min-h-[48px] flex-col items-center justify-center gap-[3px] border-b border-r border-[#f0efe8] transition-colors',
                    isOutsideMonth(cell, monthAnchor) ? 'text-[#c5c3b8]' : 'text-[#1a1a18]',
                    chosen ? 'bg-[#edf4eb]' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex h-[22px] w-[22px] items-center justify-center rounded-full font-mono text-[12.5px] font-bold tabular-nums',
                      isToday ? 'bg-[#2d5e28] text-white' : '',
                      chosen && !isToday ? 'ring-1 ring-[#2d5e28]' : '',
                    ].join(' ')}
                  >
                    {new Date(cell + "T00:00:00Z").getUTCDate()}
                  </span>
                  {/* Three at most, then a count. Four dots in a 44px cell is a
                      smudge, and a smudge says less than a number does. */}
                  <span className="flex h-[5px] items-center gap-[2px]">
                    {dots.slice(0, 3).map(colour => (
                      <span key={colour} className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: colour }} />
                    ))}
                    {dots.length > 3 && <span className="text-[8px] font-bold leading-none text-[#8b8a81]">+{dots.length - 3}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* The day. Everything on it, in the order it happens. */}
      <div className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
        <div className="flex items-baseline gap-2 border-b border-[#edf4eb] bg-[#faf9f6] px-3 py-[9px]">
          <span className="text-[13px] font-bold text-[#1a1a18]">{formatDay(day, { long: true })}</span>
          {day === today && <span className="rounded-full bg-[#edf4eb] px-2 text-[10px] font-semibold text-[#2d5e28]">Today</span>}
        </div>

        {!dayRuns.length && !dayBookings.length ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-[#8b8a81]">Nothing on this day.</p>
        ) : (
          <div className="flex flex-col">
            {dayBookings.map((booking: Booking) => {
              const detail = bookingTileDetail(booking)
              const unclaimed = isUnclaimed(booking)
              return (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => onPickBooking(booking)}
                  className="flex min-h-[52px] w-full items-center gap-[10px] border-b border-[#edf4eb] px-3 py-[9px] text-left last:border-b-0 active:bg-[#f5f8f4]"
                >
                  <span
                    className="h-[32px] w-[3px] flex-none rounded-full"
                    style={{ backgroundColor: unclaimed ? '#8b8a81' : KIND_COLOUR[booking.kind] || KIND_COLOUR.other }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[#1a1a18]">{booking.title}</span>
                    <span className="block truncate text-[11.5px] text-[#8b8a81]">
                      {[detail.when, detail.where].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="flex-none text-[16px] leading-none text-[#c5cdd8]">&rsaquo;</span>
                </button>
              )
            })}

            {dayRuns.map((run: Run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => onPickRun(run)}
                className="flex min-h-[52px] w-full items-center gap-[10px] border-b border-[#edf4eb] px-3 py-[9px] text-left last:border-b-0 active:bg-[#f5f8f4]"
              >
                <span className="h-[32px] w-[3px] flex-none rounded-full" style={{ backgroundColor: PRODUCTION_COLOUR }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-[6px]">
                    <StatusDot status={run.status} />
                    <span className="truncate text-[13px] font-semibold text-[#1a1a18]">{run.name}</span>
                  </span>
                  <span className="block truncate text-[11.5px] text-[#8b8a81]">
                    {[run.customerName, run.suburb].filter(Boolean).join(', ') || run.orderNumber}
                    {run.start === day ? ' · goes on the bench' : run.end === day ? ' · due' : ' · in production'}
                  </span>
                </span>
                <span className="flex-none text-[16px] leading-none text-[#c5cdd8]">&rsaquo;</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

