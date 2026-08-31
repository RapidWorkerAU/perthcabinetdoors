'use client'

import { useState } from 'react'
import DayBars, { type DayPoint } from './DayBars'
import type { Detail } from './detail'

// THE WEBSITE, ON THE DASHBOARD.
//
// ── NOT ONE PANEL BUT TWO KINDS OF PANEL ─────────────────────────────────────
//
// What the site PRODUCED, which has always been in the database, and who turned
// up, which needs the tracking to have collected something. They are kept apart
// on the screen because they are apart in fact: the first is exact and has been
// true since the first quote request, the second starts the day tracking goes
// live and is honest about not existing before then.
//
// ── NO ARITHMETIC HAPPENS HERE ───────────────────────────────────────────────
//
// Every figure arrives finished from lib/pcd-site-stats.js. That is the rule the
// dashboard's old financial panel broke: it built numbers from its own queries,
// dropped an error, and rendered a failed query as a confident $0. See
// test/financials-page.test.mjs.
//
// ── AND NO VERDICTS ──────────────────────────────────────────────────────────
//
// Figures and the change since last period. Never "traffic is healthy" or "the
// design tool is underperforming". Whether 3,900 visits is good depends on what
// was spent on ads that month, and the database cannot see that.

const GREEN  = '#6b9e61'
const BLUE   = '#1e5fa8'
const VIOLET = '#7b5ea7'
const OCHRE  = '#c98a2e'

const DEVICE_COLOURS: Record<string, string> = {
  mobile: GREEN, desktop: BLUE, tablet: OCHRE, unknown: '#cfd8c9',
}

export interface Counted { key: string; label: string; count: number; share?: number }

export interface SiteStats {
  periodLabel: string
  from:        string
  to:          string
  collecting:  boolean
  problems:    string[]
  traffic: {
    days:          { day: string; visits: number; pageViews: number; medianDwellMs: number | null }[]
    totals:        { visits: number; visitors: number; pageViews: number; bounced: number; botViews: number; medianDwellMs: number | null }
    change:        { visits: number | null; pageViews: number | null; medianDwellMs: number | null }
    bounceRate:    number | null
    pagesPerVisit: number | null
    pages:         { path: string; pageViews: number }[]
    channels:      Counted[]
    devices:       Counted[]
  }
  activity: {
    days:    { day: string; designStarted: number; designSaved: number; designSent: number; requests: number; enquiries: number }[]
    totals:  { designStarted: number; designSaved: number; designSent: number; requests: number; enquiries: number }
    change:  Record<string, number | null>
    sources: Counted[]
  }
  funnel: Counted[]
}

// ── small shared pieces ─────────────────────────────────────────────────────

export function Panel({ title, note, children, foot }: {
  title: string; note?: string; children: React.ReactNode; foot?: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="flex items-baseline justify-between gap-2 border-b border-[#edf4eb] px-4 py-3">
        <span className="text-[13px] font-semibold text-[#1a1a18]">{title}</span>
        {note && <span className="text-right text-[11px] text-[#8b8a81]">{note}</span>}
      </div>
      <div className="px-4 py-3">{children}</div>
      {foot && <p className="border-t border-[#edf4eb] bg-[#f5f8f4] px-4 py-2 text-[11px] leading-[1.5] text-[#8b8a81]">{foot}</p>}
    </div>
  )
}

/** Bars in a row: one hue, longest first, the value at the tip. */
function BarRows({ items, colour, empty }: { items: Counted[]; colour: string; empty: string }) {
  if (!items.length) return <p className="py-2 text-[12px] text-[#8b8a81]">{empty}</p>
  const top = items[0].count || 1
  return (
    <div className="flex flex-col gap-[9px]">
      {items.map(item => (
        <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-[10px] gap-y-[3px]">
          <span className="truncate text-[12.5px] text-[#1a1a18]">{item.label}</span>
          <span className="font-mono text-[12px] font-medium tabular-nums text-[#5a5a52]">{item.count.toLocaleString('en-AU')}</span>
          <span className="col-span-2 h-[8px] overflow-hidden rounded-[4px] bg-[#edf4eb]">
            <span className="block h-full rounded-r-[4px]" style={{ background: colour, width: `${Math.max((item.count / top) * 100, 1)}%` }} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** A signed change, or nothing at all when there is nothing to compare to. */
function Change({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return null
  const good = invert ? value < 0 : value > 0
  const tone = value === 0 ? 'text-[#8b8a81]' : good ? 'text-[#2d5e28]' : 'text-[#a32b21]'
  return (
    <span className={`text-[10.5px] font-semibold ${tone}`}>
      {value > 0 ? '▲' : value < 0 ? '▼' : ''}{Math.abs(value)}%
    </span>
  )
}

const secs = (ms: number | null) => {
  if (!ms || ms <= 0) return '—'
  const total = Math.round(ms / 1000)
  return total >= 60 ? `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s` : `${total}s`
}

const peakOf = (points: DayPoint[]) =>
  points.reduce((best, point, index) => (point.value > points[best].value ? index : best), 0)

// ── the panels ──────────────────────────────────────────────────────────────

/**
 * The chart, with the numbers behind a toggle underneath it.
 *
 * The table is not decoration. A bar chart is unreadable to somebody using a
 * screen reader and awkward to read exact values off for anybody, so the same
 * figures are always one click away in a form that can be read out or copied.
 */
function ChartPanel({ title, note, points, colour, unit, foot }: {
  title: string; note: string; points: DayPoint[]; colour: string; unit: string; foot: React.ReactNode
}) {
  const [numbers, setNumbers] = useState(false)
  return (
    <Panel title={title} note={note} foot={foot}>
      <DayBars days={points} colour={colour} unit={unit} peakIndex={peakOf(points)} />
      <div className="mt-2 border-t border-[#edf4eb] pt-2">
        <button
          type="button"
          onClick={() => setNumbers(v => !v)}
          className="text-[11.5px] font-medium text-[#2d5e28] underline hover:text-[#1c2b1e]"
        >
          {numbers ? 'Hide the numbers' : 'Show the numbers'}
        </button>
        {numbers && (
          <div className="mt-2 max-h-[200px] overflow-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr>
                  <th className="border-b border-[#edf4eb] px-1 py-1 text-left font-semibold text-[#8b8a81]">Day</th>
                  <th className="border-b border-[#edf4eb] px-1 py-1 text-right font-semibold text-[#8b8a81]">{unit || 'Count'}</th>
                </tr>
              </thead>
              <tbody>
                {points.map(point => (
                  <tr key={point.day}>
                    <td className="border-b border-[#edf4eb] px-1 py-1 font-mono tabular-nums">
                      {new Date(`${point.day}T00:00:00Z`).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="border-b border-[#edf4eb] px-1 py-1 text-right font-mono tabular-nums">{point.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  )
}

/** What the website produced. Always available, never needs tracking. */
function ProducedPanel({ site }: { site: SiteStats }) {
  const rows: { label: string; value: number; change: number | null }[] = [
    { label: 'Design tool started', value: site.activity.totals.designStarted, change: site.activity.change.designStarted },
    { label: 'Designs saved',       value: site.activity.totals.designSaved,   change: site.activity.change.designSaved },
    { label: 'Designs sent to us',  value: site.activity.totals.designSent,    change: site.activity.change.designSent },
    { label: 'Quote requests',      value: site.activity.totals.requests,      change: site.activity.change.requests },
    { label: 'Enquiries',           value: site.activity.totals.enquiries,     change: site.activity.change.enquiries },
  ]
  return (
    <Panel
      title="What the site produced"
      note={site.periodLabel}
      foot="Every one of these is a row that already existed. None of it needs the visit tracking."
    >
      <div className="flex flex-col">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={`flex items-baseline justify-between gap-[10px] py-[8px] ${index < rows.length - 1 ? 'border-b border-[#edf4eb]' : ''}`}
          >
            <span className="text-[12.5px] text-[#1a1a18]">{row.label}</span>
            <span className="flex items-baseline gap-[9px]">
              <Change value={row.change} />
              <span className="font-mono text-[13px] font-medium tabular-nums text-[#1a1a18]">{row.value}</span>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/** Landing to enquiry. Every step is an exact count, never an estimate. */
function FunnelPanel({ site }: { site: SiteStats }) {
  const top = site.funnel[0]?.count || 1
  return (
    <Panel
      title="The design tool path"
      note={site.collecting ? 'landing to enquiry' : 'what we can count exactly'}
      foot={
        <>
          Each step is counted on its own, never worked back from the one above.{' '}
          <b className="text-[#5a5a52]">{site.activity.totals.requests}</b> quote requests came in over the
          same period, most of them through the form rather than the design tool.
        </>
      }
    >
      <div className="flex flex-col">
        {site.funnel.map((step, index) => {
          const next = site.funnel[index + 1]
          return (
            <div key={step.key}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-[10px] gap-y-[2px]">
                <span className="text-[12.5px] text-[#1a1a18]">{step.label}</span>
                <span className="font-mono text-[12.5px] font-medium tabular-nums text-[#1a1a18]">
                  {step.count.toLocaleString('en-AU')}
                </span>
                <span
                  className="col-span-2 h-[20px] rounded-r-[4px]"
                  style={{ background: GREEN, opacity: 1 - index * 0.14, width: `${Math.max((step.count / top) * 100, 1.5)}%` }}
                />
              </div>
              {next && (
                <p className="px-[2px] pb-[5px] pt-[3px] text-[10.5px] text-[#8b8a81]">
                  {step.count === 0 ? ' ' : next.count === 0 ? 'none went further' : `${Math.round((next.count / step.count) * 100)}% went on`}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function DevicePanel({ site }: { site: SiteStats }) {
  return (
    <Panel title="Phone or desktop" note="share of visits" foot="Worth knowing before the next page gets designed on a laptop.">
      <div className="mb-[10px] flex h-[22px] gap-[2px]">
        {site.traffic.devices.map(device => (
          <span
            key={device.key}
            className="rounded-[3px]"
            style={{ background: DEVICE_COLOURS[device.key] || '#cfd8c9', flex: device.count }}
            title={device.label}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-[14px] gap-y-[5px]">
        {site.traffic.devices.map(device => (
          <span key={device.key} className="flex items-center gap-[6px] text-[11.5px] text-[#5a5a52]">
            <i className="block h-[9px] w-[9px] rounded-[2px]" style={{ background: DEVICE_COLOURS[device.key] || '#cfd8c9' }} />
            {device.label} <b className="font-mono text-[11.5px] font-medium">{device.share ?? 0}%</b>
          </span>
        ))}
      </div>
    </Panel>
  )
}

// ── the whole section ───────────────────────────────────────────────────────

export default function WebsitePanels({ site, detail }: { site: SiteStats; detail: Detail }) {
  const visitPoints: DayPoint[] = site.traffic.days.map(day => ({
    day: day.day,
    value: day.visits,
    note: day.pageViews ? `${day.pageViews} page views` : undefined,
  }))
  const designPoints: DayPoint[] = site.activity.days.map(day => ({
    day: day.day,
    value: day.designStarted,
    note: day.requests ? `${day.requests} quote request${day.requests === 1 ? '' : 's'}` : undefined,
  }))

  const pages: Counted[] = site.traffic.pages
    .slice(0, detail === 'compact' ? 5 : detail === 'full' ? 10 : 7)
    .map(page => ({ key: page.path, label: page.path, count: page.pageViews }))

  return (
    <div className="flex flex-col gap-4">
      {/* SAID OUT LOUD. An empty panel and a panel that could not be built look
          identical, and the second one is the dangerous one. */}
      {site.problems.length > 0 && (
        <p className="rounded-[6px] border border-[#fde68a] bg-[#fffbeb] px-4 py-[9px] text-[12px] text-[#5c4200]">
          These figures are incomplete: {site.problems.join(', ')} could not be loaded just now. Refresh, and
          if it keeps happening the detail is in the server log.
        </p>
      )}

      {site.collecting ? (
        <ChartPanel
          title="Visits a day"
          note={site.periodLabel}
          points={visitPoints}
          colour={GREEN}
          unit="visits"
          foot={
            <>
              {site.traffic.totals.pageViews.toLocaleString('en-AU')} page views,{' '}
              {site.traffic.pagesPerVisit ?? '—'} pages a visit, median stay {secs(site.traffic.totals.medianDwellMs)}.
              {site.traffic.totals.botViews > 0 && ` ${site.traffic.totals.botViews.toLocaleString('en-AU')} crawler views were left out.`}
            </>
          }
        />
      ) : (
        <div className="rounded-[6px] border border-l-[3px] border-[#e6cf8a] bg-[#fffbeb] px-4 py-3 text-[12.5px] leading-[1.6] text-[#5c4200]">
          <b>No visit figures yet.</b> Visits, time on site, popular pages and where people came from all come
          from the page tracking, which has not recorded anything so far. It starts collecting the moment the
          tables exist and <span className="font-mono text-[11.5px]">SITE_TRACKING_SALT</span> is set, and the
          first full day appears here after the nightly roll up. Everything below is already exact.
        </div>
      )}

      <ChartPanel
        title="Design tool started a day"
        note="its own scale, deliberately"
        points={designPoints}
        colour={BLUE}
        unit="sessions"
        foot="A chart of its own rather than a second line on the one above. Visits and design starts are an order of magnitude apart, so sharing an axis would flatten this one along the floor and invent a pattern that is not there."
      />

      {site.collecting && detail !== 'compact' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Most read pages" note="page views" foot="Page views add up across pages. Visits do not, so they are not shown here.">
            <BarRows items={pages} colour={GREEN} empty="Nothing recorded yet." />
          </Panel>
          <Panel
            title="How they found us"
            note="visits"
            foot="Ads are matched on the gclid already on the link, so this lines up with what the ads account bills."
          >
            <BarRows items={site.traffic.channels} colour={BLUE} empty="Nothing recorded yet." />
          </Panel>
        </div>
      )}

      {detail === 'full' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <FunnelPanel site={site} />
          {site.collecting && <DevicePanel site={site} />}
          <Panel
            title="Where requests came from"
            note="quote requests"
            foot="Straight off pcd_quote_requests.source, which has recorded this since the first request."
          >
            <BarRows items={site.activity.sources} colour={VIOLET} empty="No requests in this period." />
          </Panel>
        </div>
      )}
    </div>
  )
}

export { ProducedPanel }
