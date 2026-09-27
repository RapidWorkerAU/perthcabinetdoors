'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PERIODS, periodRange, inRange, money } from '../../../../lib/pcd-financials'
import { issuesReport } from '../../../../lib/pcd-report-issues'
import { cn } from '@/lib/utils'
import { tableStyles as t } from '@/components/ui/table-styles'
import {
  CARD, TH, TD, NUM, FOOT, money2, dateLabel, RailRow, RailDivider,
  ReportHeader, CustomRange, Segmented, Chip, HowWorkedOut,
} from '../_components/ReportParts'

// ORDER ISSUES.
//
// Every problem raised against a panel on an order: how many, what kind, who
// has to act, what it cost, and whether it is dealt with. Built from the same
// pieces as Financials, so it reads like the rest of Reporting.
//
// A $0 issue is "no cost recorded", never free: the table cannot tell a problem
// that cost nothing from one nobody costed. It is counted apart so the gap can
// be filled in, and the averages are taken over the costed ones only.

type Issue = {
  id: string
  order_id: string
  kind: string
  detail: string | null
  stage_at_report: string | null
  owner: string | null
  blocks: string | null
  extra_cost_ex_gst: number | string | null
  raised_by: string | null
  raised_at: string | null
  resolved_at: string | null
  resolution: string | null
  created_at: string | null
  panel_label: string | null
}

type Group = {
  key: string
  label: string
  issues: number
  open: number
  resolved: number
  withCost: number
  withoutCost: number
  cost: number
  openCost: number
}

type Row = {
  id: string
  order_id: string
  order: string
  customer: string
  raised_at: string | null
  kindLabel: string
  ownerLabel: string
  panel: string
  detail: string
  resolution: string
  cost: number
  hasCost: boolean
  status: 'open' | 'resolved'
  days: number | null
}

interface Props {
  loadFailed: boolean
  issues: Issue[]
  orders: { id: string; order_number: string | null; name: string | null; customer_name: string | null; status: string | null }[]
  agents: { id: string; name: string }[]
  kinds: { key: string; label: string }[]
  today: string
}

type View = 'issues' | 'byMonth' | 'byKind' | 'byOwner' | 'byStage' | 'byOrder'
type Filter = 'all' | 'open' | 'resolved' | 'costed' | 'uncosted'

const GROUP_VIEWS: { key: Exclude<View, 'issues'>; label: string; column: string }[] = [
  { key: 'byMonth', label: 'By month', column: 'Month raised' },
  { key: 'byKind', label: 'By kind', column: 'Kind' },
  { key: 'byOwner', label: 'By who acts', column: 'Who has to act' },
  { key: 'byStage', label: 'By stage', column: 'Stage when found' },
  { key: 'byOrder', label: 'By order', column: 'Order' },
]

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All issues',
  open: 'Still open',
  resolved: 'Resolved',
  costed: 'Cost recorded',
  uncosted: 'No cost recorded',
}

// The Perth calendar day an issue was raised, which is what a period means.
function perthDay(iso: string | null): string {
  const time = Date.parse(iso || '')
  if (!Number.isFinite(time)) return ''
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const days = (n: number | null) => (n === null ? '·' : plural(n, 'day'))

function StatusChip({ row }: { row: Row }) {
  return row.status === 'resolved'
    ? <Chip tone="done">Resolved · {days(row.days)}</Chip>
    : <Chip tone="wait">Open · {days(row.days)}</Chip>
}

function CostCell({ row }: { row: Row }) {
  return row.hasCost
    ? <>{money2(row.cost)}</>
    : <span className="text-[11px] italic text-[#8b8a81]">Not recorded</span>
}

export default function IssuesClient({ loadFailed, issues, orders, agents, kinds, today }: Props) {
  const [periodId, setPeriodId] = useState('this_fy')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [view, setView] = useState<View>('issues')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const range = useMemo(
    () => periodRange(periodId, today, { from: customFrom, to: customTo }),
    [periodId, today, customFrom, customTo]
  )
  const periodLabel = PERIODS.find(p => p.id === periodId)?.label || 'Selected period'
  const rangeLabel = range.from || range.to
    ? `${dateLabel(range.from)} to ${range.to ? dateLabel(range.to) : 'today'}`
    : 'Everything on record'

  const report = useMemo(() => {
    const inPeriod = issues.filter(issue => inRange(perthDay(issue.raised_at || issue.created_at), range))
    return issuesReport(inPeriod, {
      orders: new Map(orders.map(o => [o.id, o])),
      kinds,
      agents: new Map(agents.map(a => [a.id, a.name])),
      now: Date.parse(`${today}T12:00:00+08:00`),
    })
  }, [issues, orders, agents, kinds, range, today])

  const totals = report.totals

  // The rail's figures list their issues. Picking one shows the issues view.
  function pick(next: Filter) {
    setFilter(current => (current === next ? 'all' : next))
    setView('issues')
  }

  const rows: Row[] = report.rows as Row[]
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(row =>
      (filter === 'all'
        || (filter === 'open' && row.status === 'open')
        || (filter === 'resolved' && row.status === 'resolved')
        || (filter === 'costed' && row.hasCost)
        || (filter === 'uncosted' && !row.hasCost))
      && (!q || `${row.order} ${row.customer} ${row.kindLabel} ${row.panel} ${row.detail}`.toLowerCase().includes(q))
    )
  }, [rows, filter, search])
  const shownCost = shown.reduce((sum, row) => sum + row.cost, 0)

  const groupView = GROUP_VIEWS.find(g => g.key === view)
  const groups: Group[] = groupView ? (report[groupView.key] as Group[]) : []
  const groupTotals = groups.reduce(
    (sum, g) => ({
      issues: sum.issues + g.issues, open: sum.open + g.open, resolved: sum.resolved + g.resolved,
      withCost: sum.withCost + g.withCost, withoutCost: sum.withoutCost + g.withoutCost,
      cost: sum.cost + g.cost, openCost: sum.openCost + g.openCost,
    }),
    { issues: 0, open: 0, resolved: 0, withCost: 0, withoutCost: 0, cost: 0, openCost: 0 }
  )

  return (
    <div className="p-4 md:p-5 max-w-[1400px]">

      <ReportHeader
        title="Order issues"
        subtitle="Every problem raised on an order, and what it cost."
        periodId={periodId}
        onPeriod={setPeriodId}
      />

      {periodId === 'custom' && (
        <CustomRange from={customFrom} to={customTo} onFrom={setCustomFrom} onTo={setCustomTo} />
      )}

      {loadFailed && (
        <div className="mb-4 border border-[#fca5a5] bg-[#fef5f5] rounded-[8px] px-4 py-3">
          <p className="text-[12px] font-semibold text-[#991b1b]">These figures could not be loaded.</p>
          <p className="text-[11px] text-[#991b1b] mt-[2px]">
            The counts below are not zero, they are unknown. Reload the page before making a decision on anything here.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[236px_1fr] gap-4 items-start">

        {/* ── The rail ── */}
        <div className="flex flex-col gap-3">
          <div className={`${CARD} overflow-hidden`}>
            <div className="px-3 py-2 border-b border-[#dbd8cc]">
              <h2 className="text-[13px] font-semibold text-[#1a1a18]">{periodLabel}</h2>
              <p className="text-[10px] text-[#8b8a81] mt-[1px]">{rangeLabel}</p>
            </div>
            <RailRow
              label="Issues raised"
              value={String(totals.issues)}
              sub={`on ${plural(totals.orders, 'order')}`}
              strong
              active={view === 'issues' && filter === 'all'}
              onClick={() => { setFilter('all'); setView('issues') }}
            />
            <RailRow
              label="Still open"
              value={String(totals.open)}
              sub={totals.oldestOpenDays !== null ? `oldest open ${days(totals.oldestOpenDays)}` : 'nothing open'}
              active={view === 'issues' && filter === 'open'}
              onClick={() => pick('open')}
            />
            <RailRow
              label="Resolved"
              value={String(totals.resolved)}
              sub={totals.medianDaysToResolve !== null ? `usually resolved in ${days(totals.medianDaysToResolve)} (median)` : 'none resolved yet'}
              active={view === 'issues' && filter === 'resolved'}
              onClick={() => pick('resolved')}
            />
            <RailDivider />
            <RailRow
              label="Cost recorded"
              value={money(totals.cost)}
              sub={`on ${plural(totals.withCost, 'issue')} · ex GST`}
              strong
              active={view === 'issues' && filter === 'costed'}
              onClick={() => pick('costed')}
            />
            <RailRow
              label="Average per costed issue"
              value={money(totals.averageCost)}
              sub="ex GST · issues with no cost left out"
            />
            <RailRow
              label="Cost on open issues"
              value={money(totals.openCost)}
              sub="ex GST · still being dealt with"
            />
          </div>

          {/* The gap in the cost figures, in the same place and colour as the
              owed figure on Financials: something to go and fill in. */}
          <button
            type="button"
            onClick={() => pick('uncosted')}
            aria-pressed={view === 'issues' && filter === 'uncosted'}
            className="w-full text-left border border-[#f0d060] rounded-[10px] px-3 py-[10px] bg-[#fffef0] hover:bg-[#fdf8e0] transition-colors"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#8a6d0b]">No cost recorded</span>
              <span className="text-[10px] font-medium text-[#8a6d0b]">{view === 'issues' && filter === 'uncosted' ? 'Listed' : 'List them'}</span>
            </div>
            <div className={`${NUM} text-[17px] font-medium text-[#8a6d0b] mt-[2px]`}>{totals.withoutCost}</div>
            <div className="text-[10px] text-[#8a6d0b] mt-[2px] leading-[1.4]">
              {totals.issues ? `${Math.round((totals.withoutCost / totals.issues) * 100)}% of issues · ` : ''}saved at $0, so the cost is unknown rather than nothing
            </div>
          </button>
        </div>

        {/* ── The ledger ── */}
        <div className={t.card}>
          {/* The views on one line, and the search on its own line under them
              when the issue list is showing. */}
          <div className="flex flex-col gap-2 px-3 py-[10px] border-b border-[#dbd8cc]">
            <Segmented<View>
              options={[{ key: 'issues', label: `Issues · ${shown.length}` }, ...GROUP_VIEWS.map(g => ({ key: g.key, label: g.label }))]}
              value={view}
              onChange={setView}
            />
            {view === 'issues' && (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search order, customer or issue"
                className="h-[40px] px-3 text-[16px] md:h-[28px] md:px-2.5 md:text-[12px] border border-[#dbd8cc] rounded-[6px] w-full sm:w-[320px] text-[#1a1a18] placeholder:text-[#b5b3aa]"
              />
            )}
          </div>

          {view === 'issues' && filter !== 'all' && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#edf4eb] text-[11px] text-[#5a5a52]">
              <span>Showing <b className="font-semibold text-[#1a1a18]">{FILTER_LABELS[filter].toLowerCase()}</b> only</span>
              <button type="button" onClick={() => setFilter('all')} className="font-medium text-[#2d5e28] hover:underline">Show all</button>
            </div>
          )}

          {view === 'issues' ? (
            shown.length === 0 ? (
              <p className={t.empty}>
                {rows.length === 0 ? `No issues were raised in ${periodLabel.toLowerCase()}.` : 'Nothing matches that.'}
              </p>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className={t.table}>
                    <thead>
                      <tr>
                        <th className={TH}>Raised</th>
                        <th className={TH}>Order</th>
                        <th className={TH}>Customer</th>
                        <th className={TH}>Kind</th>
                        <th className={TH}>Panel</th>
                        <th className={TH}>Who acts</th>
                        <th className={TH}>Status</th>
                        <th className={cn(TH, 'text-right')}>Cost ex GST</th>
                      </tr>
                    </thead>
                    <tbody className={t.body}>
                      {shown.map(row => (
                        <tr key={row.id}>
                          <td className={cn(TD, 'text-[#5a5a52]')}>{dateLabel(row.raised_at)}</td>
                          <td className={TD}>
                            <Link href={`/admin/orders/${row.order_id}`} className="font-medium text-[#2d5e28] hover:underline">{row.order}</Link>
                          </td>
                          <td className={cn(TD, 'text-[#5a5a52]')}>{row.customer || '·'}</td>
                          <td className={TD} title={row.resolution ? `${row.detail}\n\nResolved: ${row.resolution}` : row.detail}>{row.kindLabel}</td>
                          <td className={cn(TD, 'text-[#5a5a52]')}>{row.panel || '·'}</td>
                          <td className={cn(TD, 'text-[#5a5a52]')}>{row.ownerLabel}</td>
                          <td className={TD}><StatusChip row={row} /></td>
                          <td className={cn(TD, NUM, 'text-right')}><CostCell row={row} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className={cn(FOOT, 'text-[12px] text-[#8b8a81]')} colSpan={7}>
                          {shown.length}{shown.length !== rows.length ? ` of ${rows.length}` : ''} {shown.length === 1 ? 'issue' : 'issues'} · {periodLabel.toLowerCase()}
                        </td>
                        <td className={cn(FOOT, NUM, 'text-right')}>{money2(shownCost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="md:hidden flex flex-col">
                  {shown.map(row => (
                    <article key={row.id} className="px-3 py-[14px] border-b border-[#edf4eb] last:border-b-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/admin/orders/${row.order_id}`} className="block break-words text-[13px] font-semibold text-[#2d5e28] hover:underline">{row.order}</Link>
                          <p className="truncate text-[12px] text-[#5a5a52]">{row.kindLabel}{row.panel ? ` · ${row.panel}` : ''}</p>
                        </div>
                        <div className={`${NUM} text-[14px] font-medium text-[#1a1a18] whitespace-nowrap`}><CostCell row={row} /></div>
                      </div>
                      {row.detail && <p className="mt-1 text-[12px] text-[#1a1a18]">{row.detail}</p>}
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px]">
                        <div>
                          <dt className="text-[#8b8a81]">Raised</dt>
                          <dd className="text-[#1a1a18]">{dateLabel(row.raised_at)}</dd>
                        </div>
                        <div>
                          <dt className="text-[#8b8a81]">Who acts</dt>
                          <dd className="text-[#1a1a18]">{row.ownerLabel}</dd>
                        </div>
                      </dl>
                      <div className="mt-2"><StatusChip row={row} /></div>
                    </article>
                  ))}
                  <div className="px-3 py-3 bg-[#faf9f5] border-t border-[#dbd8cc] flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold text-[#8b8a81]">
                      {shown.length}{shown.length !== rows.length ? ` of ${rows.length}` : ''} {shown.length === 1 ? 'issue' : 'issues'}
                    </span>
                    <span className={`${NUM} text-[14px] font-semibold text-[#1a1a18]`}>{money2(shownCost)}</span>
                  </div>
                </div>
              </>
            )
          ) : groups.length === 0 ? (
            <p className={t.empty}>No issues were raised in {periodLabel.toLowerCase()}.</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className={t.table}>
                  <thead>
                    <tr>
                      <th className={TH}>{groupView?.column}</th>
                      <th className={cn(TH, 'text-right')}>Issues</th>
                      <th className={cn(TH, 'text-right')}>Open</th>
                      <th className={cn(TH, 'text-right')}>Resolved</th>
                      <th className={cn(TH, 'text-right')}>Costed</th>
                      <th className={cn(TH, 'text-right')}>No cost</th>
                      <th className={cn(TH, 'text-right')}>Cost ex GST</th>
                      <th className={cn(TH, 'text-right')}>Cost still open</th>
                    </tr>
                  </thead>
                  <tbody className={t.body}>
                    {groups.map(g => (
                      <tr key={g.key || g.label}>
                        <td className={TD}>
                          {view === 'byOrder' && g.key
                            ? <Link href={`/admin/orders/${g.key}`} className="font-medium text-[#2d5e28] hover:underline">{g.label}</Link>
                            : g.label}
                        </td>
                        <td className={cn(TD, NUM, 'text-right')}>{g.issues}</td>
                        <td className={cn(TD, NUM, 'text-right text-[#5a5a52]')}>{g.open}</td>
                        <td className={cn(TD, NUM, 'text-right text-[#5a5a52]')}>{g.resolved}</td>
                        <td className={cn(TD, NUM, 'text-right text-[#5a5a52]')}>{g.withCost}</td>
                        <td className={cn(TD, NUM, 'text-right text-[#5a5a52]')}>{g.withoutCost}</td>
                        <td className={cn(TD, NUM, 'text-right')}>{money2(g.cost)}</td>
                        <td className={cn(TD, NUM, 'text-right text-[#5a5a52]')}>{money2(g.openCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className={cn(FOOT, 'text-[12px] text-[#8b8a81]')}>{periodLabel}</td>
                      <td className={cn(FOOT, NUM, 'text-right')}>{groupTotals.issues}</td>
                      <td className={cn(FOOT, NUM, 'text-right text-[#5a5a52]')}>{groupTotals.open}</td>
                      <td className={cn(FOOT, NUM, 'text-right text-[#5a5a52]')}>{groupTotals.resolved}</td>
                      <td className={cn(FOOT, NUM, 'text-right text-[#5a5a52]')}>{groupTotals.withCost}</td>
                      <td className={cn(FOOT, NUM, 'text-right text-[#5a5a52]')}>{groupTotals.withoutCost}</td>
                      <td className={cn(FOOT, NUM, 'text-right')}>{money2(groupTotals.cost)}</td>
                      <td className={cn(FOOT, NUM, 'text-right text-[#5a5a52]')}>{money2(groupTotals.openCost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="md:hidden flex flex-col">
                {groups.map(g => (
                  <article key={g.key || g.label} className="px-3 py-[14px] border-b border-[#edf4eb] last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-[13px] font-semibold text-[#1a1a18]">
                        {view === 'byOrder' && g.key
                          ? <Link href={`/admin/orders/${g.key}`} className="text-[#2d5e28] hover:underline">{g.label}</Link>
                          : g.label}
                      </div>
                      <div className={`${NUM} text-[14px] font-medium text-[#1a1a18] whitespace-nowrap`}>{money2(g.cost)}</div>
                    </div>
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2 text-[11px]">
                      <div><dt className="text-[#8b8a81]">Issues</dt><dd className={`${NUM} text-[#1a1a18]`}>{g.issues}</dd></div>
                      <div><dt className="text-[#8b8a81]">Open</dt><dd className={`${NUM} text-[#1a1a18]`}>{g.open}</dd></div>
                      <div><dt className="text-[#8b8a81]">No cost</dt><dd className={`${NUM} text-[#1a1a18]`}>{g.withoutCost}</dd></div>
                    </dl>
                  </article>
                ))}
                <div className="px-3 py-3 bg-[#faf9f5] border-t border-[#dbd8cc] flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold text-[#8b8a81]">{plural(groupTotals.issues, 'issue')}</span>
                  <span className={`${NUM} text-[14px] font-semibold text-[#1a1a18]`}>{money2(groupTotals.cost)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <HowWorkedOut>
        <li><b className="text-[#1a1a18]">Issues</b> are dated from when they were raised, in Perth time, so a period means problems found in it.</li>
        <li><b className="text-[#1a1a18]">Cost</b> is the extra cost entered on the issue, ex GST: a remade panel, a second delivery.</li>
        <li><b className="text-[#1a1a18]">No cost recorded</b> is an issue saved at $0. The system cannot tell one that cost nothing from one nobody costed, so it is counted apart and never lowers the average.</li>
        <li><b className="text-[#1a1a18]">Open</b> means nobody has marked it resolved. Its days run from when it was raised to today; a resolved one&apos;s run to when it was resolved.</li>
        <li><b className="text-[#1a1a18]">Usually resolved in</b> is the median, the middle value, so one issue left open for months does not drag it out.</li>
        <li><b className="text-[#1a1a18]">The financial year</b> runs July to June.</li>
      </HowWorkedOut>
    </div>
  )
}
