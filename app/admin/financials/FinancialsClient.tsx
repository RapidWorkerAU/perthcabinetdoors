'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  PAYMENT_TYPE_LABELS,
  PERIODS,
  periodRange,
  sumAmounts,
  outstandingPayments,
  receivedPayments,
  confirmedOrders,
  openPipeline,
  grossProfit,
  gstOf,
  gstOnReceived,
  marginPercent,
  money,
} from '../../../lib/pcd-financials'

// ─── Types ───────────────────────────────────────────────────────────────────

type Payment = {
  id: string
  orderId: string
  orderNumber: string | null
  customerName: string | null
  order_status: string | null
  payment_type: string
  amount: number
  is_paid: boolean
  paid_at: string | null
  requested_at: string | null
  request_status: string
  created_at: string | null
}

type Order = {
  id: string
  quote_id: string | null
  orderNumber: string | null
  customerName: string | null
  status: string | null
  total_inc_gst: number
  gst_amount: number
  accepted_at: string | null
  created_at: string | null
}

type Quote = {
  id: string
  quoteNumber: string | null
  customerName: string | null
  status: string | null
  total_inc_gst: number
  gst_amount: number
  sent_at: string | null
  updated_at: string | null
  created_at: string | null
  order_id: string | null
  markup_amount_ex_gst: number
  labour_cost_ex_gst: number
}

type Split = { id: string; markup_amount_ex_gst: number; labour_cost_ex_gst: number }

interface Props {
  // True when a query behind these figures failed. A failed query returns no
  // rows, which renders as a confident $0, and nobody doubts a total.
  loadFailed: boolean
  payments: Payment[]
  orders: Order[]
  quotes: Quote[]
  splits: Split[]
  orderQuoteIds: string[]
  today: string
}

// A row in the one table this page has, whichever side it is showing.
type LedgerRow = {
  id: string
  href: string
  ref: string
  customer: string
  status: string
  on: string
  amount: number
  gst: number
  profit: number | null
}

// ─── Small pieces ────────────────────────────────────────────────────────────

const CARD = 'bg-white border border-[#dbd8cc] rounded-[10px]'
const TH = 'text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-[#8b8a81] px-3 py-2 border-b border-[#dbd8cc] whitespace-nowrap'
const TD = 'px-3 py-2 text-[12px] text-[#1a1a18] border-b border-black/5 whitespace-nowrap'
const NUM = 'font-mono tabular-nums'

function dateLabel(value: string | null): string {
  if (!value) return '·'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '·'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
}

function titleCase(s: string): string {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Cents, unlike the headline figures. A total is read for its size; a row is
// read to be matched against an invoice, and $255 does not match $255.75.
function money2(value: number): string {
  return Number(value || 0).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const STATUS_CHIP: Record<string, string> = {
  active: 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]',
  complete: 'bg-[#f2f2f0] text-[#5a5a52] border-[#dbd8cc]',
  pending_deposit: 'bg-[#fffef0] text-[#8a6d0b] border-[#f0d060]',
  sent: 'bg-[#f4f2ec] text-[#5a5a52] border-[#d3cec0]',
  viewed: 'bg-[#fdf8ea] text-[#8a6d0b] border-[#e7d3b0]',
}

function StatusChip({ status }: { status: string }) {
  if (!status) return <span className="text-[#c5cdd8]">·</span>
  return (
    <span className={`inline-flex items-center px-2 py-[1px] rounded-full text-[10px] font-semibold border ${STATUS_CHIP[status] || STATUS_CHIP.complete}`}>
      {titleCase(status)}
    </span>
  )
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-[26px] px-[10px] text-[11px] font-medium rounded-[6px] border transition-colors ${
        on ? 'bg-[#1c2b1e] text-white border-[#1c2b1e]' : 'bg-white text-[#5a5a52] border-[#dbd8cc] hover:border-[#6b9e61]'
      }`}
    >
      {children}
    </button>
  )
}

// One line of the rail. Clicking a figure that has a table behind it switches
// the table to it, so the summary and the list are never showing two different
// things without the person having asked for that.
function RailRow({ label, value, sub, strong, onClick, active }: {
  label: string
  value: string
  sub?: string
  strong?: boolean
  onClick?: () => void
  active?: boolean
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[#8b8a81]">{label}</span>
        {active && <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#6b9e61]">Listed</span>}
      </div>
      <div className={`${NUM} ${strong ? 'text-[17px] text-[#1a1a18]' : 'text-[14px] text-[#5a5a52]'} font-medium mt-[2px]`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#8b8a81] mt-[2px] leading-[1.4]">{sub}</div>}
    </>
  )

  if (!onClick) return <div className="px-3 py-[9px] border-b border-[#edf4eb] last:border-b-0">{body}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-[9px] border-b border-[#edf4eb] last:border-b-0 transition-colors ${
        active ? 'bg-[#f5fff5]' : 'hover:bg-[#faf9f5]'
      }`}
    >
      {body}
    </button>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function FinancialsClient({
  loadFailed, payments, orders, quotes, splits, orderQuoteIds, today,
}: Props) {
  const [periodId, setPeriodId] = useState('this_fy')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [tab, setTab] = useState<'orders' | 'quotes'>('orders')
  const [search, setSearch] = useState('')
  const [owedOpen, setOwedOpen] = useState(false)

  const range = useMemo(
    () => periodRange(periodId, today, { from: customFrom, to: customTo }),
    [periodId, today, customFrom, customTo]
  )
  const periodLabel = PERIODS.find(p => p.id === periodId)?.label || 'Selected period'
  const rangeLabel = range.from || range.to
    ? `${dateLabel(range.from)} to ${range.to ? dateLabel(range.to) : 'today'}`
    : 'Everything on record'

  const splitById = useMemo(() => new Map(splits.map(s => [s.id, s])), [splits])
  const linkedQuoteIds = useMemo(() => new Set(orderQuoteIds), [orderQuoteIds])
  const ordersById = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders])

  // Outstanding is a position, not a period: it is what is owed right now, so
  // the period filter deliberately does not touch it.
  const outstanding = useMemo(() => outstandingPayments(payments, today), [payments, today])
  const owedTotal = sumAmounts(outstanding)
  const oldestWait = outstanding.reduce((max, p) => Math.max(max, p.ageDays ?? 0), 0)

  const won = useMemo(
    () => confirmedOrders(orders, range).sort((a, b) => String(b.on).localeCompare(String(a.on))),
    [orders, range]
  )
  const pipeline = useMemo(
    () => openPipeline(quotes, linkedQuoteIds, range).sort((a, b) => String(b.on).localeCompare(String(a.on))),
    [quotes, linkedQuoteIds, range]
  )
  const received = useMemo(() => receivedPayments(payments, range), [payments, range])

  const profitWon = useMemo(() => grossProfit(won, splitById), [won, splitById])
  // A quote carries its own split, so the pipeline is matched against itself.
  const profitPipeline = useMemo(
    () => grossProfit(pipeline, new Map(pipeline.map(q => [q.id, q]))),
    [pipeline]
  )

  const gstCash = useMemo(() => gstOnReceived(received, ordersById), [received, ordersById])
  const gstWon = gstOf(won)

  // The two sides of the same period, in one shape, so the table below does not
  // care which one it is showing.
  const ledger: LedgerRow[] = useMemo(() => {
    if (tab === 'orders') {
      return won.map(o => {
        const split = o.quote_id ? splitById.get(o.quote_id) : null
        return {
          id: o.id,
          href: `/admin/orders/${o.id}`,
          ref: o.orderNumber || 'Order',
          customer: o.customerName || '',
          status: o.status || '',
          on: o.on,
          amount: o.amount,
          gst: o.gst_amount,
          profit: split ? split.markup_amount_ex_gst + split.labour_cost_ex_gst : null,
        }
      })
    }
    return pipeline.map(q => ({
      id: q.id,
      href: `/admin/quotes/${q.id}`,
      ref: q.quoteNumber || 'Quote',
      customer: q.customerName || '',
      status: q.status || '',
      on: q.on,
      amount: q.amount,
      gst: q.gst_amount,
      profit: q.markup_amount_ex_gst + q.labour_cost_ex_gst,
    }))
  }, [tab, won, pipeline, splitById])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ledger
    return ledger.filter(row => `${row.ref} ${row.customer}`.toLowerCase().includes(q))
  }, [ledger, search])

  const shownTotal = shown.reduce((t, r) => t + r.amount, 0)
  const shownGst = shown.reduce((t, r) => t + r.gst, 0)
  const shownProfit = shown.reduce((t, r) => t + (r.profit || 0), 0)
  const shownExGst = shownTotal - shownGst
  const shownMargin = marginPercent(shownProfit, shownExGst)
  const unknownProfit = shown.filter(r => r.profit === null).length

  const isOrders = tab === 'orders'

  return (
    <div className="p-4 md:p-5 max-w-[1400px]">

      {/* Page header. The period control sits with the title because it governs
          everything on the page except the owed figure, which says so itself. */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Financials</h1>
          <p className="text-[12px] text-[#8b8a81] mt-[2px]">Every job, and what it is worth.</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PERIODS.map(p => (
            <Pill key={p.id} on={periodId === p.id} onClick={() => setPeriodId(p.id)}>{p.label}</Pill>
          ))}
        </div>
      </div>

      {periodId === 'custom' && (
        <div className={`${CARD} p-3 mb-4 flex items-center gap-2 flex-wrap`}>
          <span className="text-[11px] text-[#8b8a81]">From</span>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="h-[28px] px-2 text-[11px] border border-[#dbd8cc] rounded-[6px] text-[#1a1a18]"
          />
          <span className="text-[11px] text-[#8b8a81]">to</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="h-[28px] px-2 text-[11px] border border-[#dbd8cc] rounded-[6px] text-[#1a1a18]"
          />
        </div>
      )}

      {loadFailed && (
        <div className="mb-4 border border-[#fca5a5] bg-[#fef5f5] rounded-[8px] px-4 py-3">
          <p className="text-[12px] font-semibold text-[#991b1b]">These figures could not be loaded.</p>
          <p className="text-[11px] text-[#991b1b] mt-[2px]">
            The totals below are not zero, they are unknown. Reload the page before making a decision on anything here.
          </p>
        </div>
      )}

      {/* Rail and ledger. On a phone the rail stacks above the table, which is
          the right order to read them in anyway: the summary, then the jobs. */}
      <div className="grid grid-cols-1 lg:grid-cols-[236px_1fr] gap-4 items-start">

        {/* ── The rail ── */}
        <div className="flex flex-col gap-3">

          <div className={`${CARD} overflow-hidden`}>
            <div className="px-3 py-2 border-b border-[#dbd8cc]">
              <h2 className="text-[13px] font-semibold text-[#1a1a18]">{periodLabel}</h2>
              <p className="text-[10px] text-[#8b8a81] mt-[1px]">{rangeLabel}</p>
            </div>
            <RailRow
              label="Confirmed orders"
              value={money(sumAmounts(won))}
              sub={`${won.length} order${won.length === 1 ? '' : 's'} · inc GST`}
              strong
              active={isOrders}
              onClick={() => setTab('orders')}
            />
            <RailRow
              label="Profit on those"
              value={money(profitWon.amount)}
              sub={profitWon.unknownCount
                ? `ex GST · ${profitWon.unknownCount} with no cost split, left out`
                : 'ex GST · markup plus labour'}
            />
            <div className="h-[5px] bg-[#faf9f5] border-y border-[#edf4eb]" />
            <RailRow
              label="Unaccepted quotes"
              value={money(sumAmounts(pipeline))}
              sub={`${pipeline.length} still out · inc GST`}
              strong
              active={!isOrders}
              onClick={() => setTab('quotes')}
            />
            <RailRow
              label="Profit if all land"
              value={money(profitPipeline.amount)}
              sub="ex GST · none of it won yet"
            />
          </div>

          {/* GST. Two numbers because they answer two different questions, and
              which one is wanted depends on how the BAS is reported. */}
          <div className={`${CARD} px-3 py-[10px]`}>
            <div className="text-[11px] text-[#8b8a81]">GST collected</div>
            <div className={`${NUM} text-[17px] font-medium text-[#1a1a18] mt-[2px]`}>{money2(gstCash.amount)}</div>
            <div className="text-[10px] text-[#8b8a81] mt-[2px] leading-[1.4]">
              Inside {money(sumAmounts(received))} banked · cash basis
              {gstCash.unknownCount > 0 && ` · ${gstCash.unknownCount} payment${gstCash.unknownCount === 1 ? '' : 's'} with no order behind them, left out`}
            </div>
            <div className="text-[10px] text-[#8b8a81] mt-[6px] pt-[6px] border-t border-[#edf4eb] leading-[1.4]">
              GST invoiced on confirmed orders: <span className={`${NUM} text-[#5a5a52]`}>{money2(gstWon)}</span> · accrual basis
            </div>
          </div>

          {/* Owed: one line, never a section, opening its detail on demand. */}
          <div className="border border-[#f0d060] rounded-[10px] overflow-hidden">
            <button
              type="button"
              onClick={() => setOwedOpen(o => !o)}
              aria-expanded={owedOpen}
              className="w-full text-left px-3 py-[10px] bg-[#fffef0] hover:bg-[#fdf8e0] transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#8a6d0b]">Owed to us now</span>
                <span className="text-[10px] font-medium text-[#8a6d0b]">{owedOpen ? 'Hide' : 'Show'}</span>
              </div>
              <div className={`${NUM} text-[17px] font-medium text-[#8a6d0b] mt-[2px]`}>{money2(owedTotal)}</div>
              <div className="text-[10px] text-[#8a6d0b] mt-[2px] leading-[1.4]">
                {outstanding.length} unpaid · as at today
                {oldestWait > 0 && ` · oldest ${oldestWait} day${oldestWait === 1 ? '' : 's'}`}
              </div>
            </button>

            {owedOpen && (
              <div className="border-t border-[#f0d060] bg-white">
                {outstanding.length === 0 ? (
                  <p className="px-3 py-3 text-[11px] italic text-[#8b8a81]">
                    Nothing is outstanding. Every payment raised has been paid.
                  </p>
                ) : (
                  <>
                    <ul className="flex flex-col">
                      {outstanding.map(p => (
                        <li key={p.id} className="px-3 py-[9px] border-b border-[#edf4eb] last:border-b-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <Link href={`/admin/orders/${p.orderId}`} className="text-[12px] font-medium text-[#2d5e28] hover:underline">
                              {p.orderNumber || 'Order'}
                            </Link>
                            <span className={`${NUM} text-[12px] text-[#1a1a18]`}>{money2(p.amount)}</span>
                          </div>
                          <div className="text-[10px] text-[#8b8a81] mt-[1px] leading-[1.4]">
                            {p.customerName || '·'} · {PAYMENT_TYPE_LABELS[p.payment_type] || titleCase(p.payment_type)}
                          </div>
                          <div className="text-[10px] mt-[1px]">
                            {p.ageDays === null ? (
                              <span className="text-[#8b8a81]">Not asked for yet</span>
                            ) : (
                              <span className={p.ageDays >= 30 ? 'font-medium text-[#991b1b]' : 'text-[#8b8a81]'}>
                                Waiting {p.ageDays === 0 ? 'since today' : `${p.ageDays} day${p.ageDays === 1 ? '' : 's'}`}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="px-3 py-[8px] text-[10px] text-[#8b8a81] border-t border-[#edf4eb] leading-[1.4]">
                      What is owed today, whoever it is owed by. The period above does not change this.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── The ledger ── */}
        <div className={`${CARD} overflow-hidden`}>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-[10px] border-b border-[#dbd8cc]">
            <div className="inline-flex rounded-[7px] border border-[#dbd8cc] overflow-hidden self-start">
              <button
                type="button"
                onClick={() => setTab('orders')}
                aria-pressed={isOrders}
                className={`px-3 py-[5px] text-[11.5px] font-medium transition-colors ${
                  isOrders ? 'bg-[#1c2b1e] text-white' : 'bg-white text-[#5a5a52] hover:bg-[#faf9f5]'
                }`}
              >
                Confirmed orders · {won.length}
              </button>
              <button
                type="button"
                onClick={() => setTab('quotes')}
                aria-pressed={!isOrders}
                className={`px-3 py-[5px] text-[11.5px] font-medium border-l border-[#dbd8cc] transition-colors ${
                  !isOrders ? 'bg-[#1c2b1e] text-white' : 'bg-white text-[#5a5a52] hover:bg-[#faf9f5]'
                }`}
              >
                Unaccepted quotes · {pipeline.length}
              </button>
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isOrders ? 'Search order or customer' : 'Search quote or customer'}
              className="h-[28px] px-2.5 text-[12px] border border-[#dbd8cc] rounded-[6px] w-full sm:w-[220px] text-[#1a1a18] placeholder:text-[#b5b3aa] sm:ml-auto"
            />
            <span className="hidden lg:block text-[10px] text-[#8b8a81] whitespace-nowrap">
              Totals inc GST, profit ex GST
            </span>
          </div>

          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] italic text-[#8b8a81]">
              {ledger.length === 0
                ? isOrders
                  ? `No orders were confirmed in ${periodLabel.toLowerCase()}.`
                  : `No quotes are still open from ${periodLabel.toLowerCase()}.`
                : 'Nothing matches that search.'}
            </p>
          ) : (
            <>
              {/* Desktop: the ledger proper. */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={TH}>{isOrders ? 'Confirmed' : 'Sent'}</th>
                      <th className={TH}>{isOrders ? 'Order' : 'Quote'}</th>
                      <th className={TH}>Customer</th>
                      <th className={TH}>Status</th>
                      <th className={`${TH} text-right`}>Total inc GST</th>
                      <th className={`${TH} text-right`}>GST</th>
                      <th className={`${TH} text-right`}>{isOrders ? 'Profit' : 'Profit if won'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(row => (
                      <tr key={row.id} className="hover:bg-[#faf9f5]">
                        <td className={`${TD} text-[#5a5a52]`}>{dateLabel(row.on)}</td>
                        <td className={TD}>
                          <Link href={row.href} className="font-medium text-[#2d5e28] hover:underline">{row.ref}</Link>
                        </td>
                        <td className={`${TD} text-[#5a5a52]`}>{row.customer || '·'}</td>
                        <td className={TD}><StatusChip status={row.status} /></td>
                        <td className={`${TD} text-right ${NUM}`}>{money2(row.amount)}</td>
                        <td className={`${TD} text-right ${NUM} text-[#5a5a52]`}>{money2(row.gst)}</td>
                        <td className={`${TD} text-right ${NUM}`}>
                          {row.profit === null
                            ? <span className="text-[11px] italic text-[#8b8a81]">Unknown</span>
                            : money2(row.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="px-3 py-2 text-[11px] font-semibold text-[#8b8a81]" colSpan={4}>
                        {shown.length}{shown.length !== ledger.length ? ` of ${ledger.length}` : ''}{' '}
                        {isOrders ? 'order' : 'quote'}{shown.length === 1 ? '' : 's'} · {periodLabel.toLowerCase()}
                      </td>
                      <td className={`px-3 py-2 text-right text-[13px] font-semibold ${NUM} text-[#1a1a18]`}>{money2(shownTotal)}</td>
                      <td className={`px-3 py-2 text-right text-[12px] font-semibold ${NUM} text-[#5a5a52]`}>{money2(shownGst)}</td>
                      <td className={`px-3 py-2 text-right text-[13px] font-semibold ${NUM} text-[#1a1a18]`}>
                        {money2(shownProfit)}
                        {shownMargin !== null && (
                          <span className="font-normal text-[10px] text-[#8b8a81]"> · {shownMargin.toFixed(0)}%</span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Phone: the same rows as cards, because seven columns of figures
                  on a 390px screen is a horizontal scroll nobody wins. */}
              <div className="md:hidden flex flex-col">
                {shown.map(row => (
                  <article key={row.id} className="px-3 py-3 border-b border-[#edf4eb] last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={row.href} className="text-[13px] font-semibold text-[#2d5e28] hover:underline">{row.ref}</Link>
                        <p className="text-[12px] text-[#5a5a52] truncate">{row.customer || '·'}</p>
                      </div>
                      <div className={`${NUM} text-[14px] font-medium text-[#1a1a18] whitespace-nowrap`}>{money2(row.amount)}</div>
                    </div>
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2 text-[11px]">
                      <div>
                        <dt className="text-[#8b8a81]">{isOrders ? 'Confirmed' : 'Sent'}</dt>
                        <dd className="text-[#1a1a18]">{dateLabel(row.on)}</dd>
                      </div>
                      <div>
                        <dt className="text-[#8b8a81]">GST</dt>
                        <dd className={`${NUM} text-[#1a1a18]`}>{money2(row.gst)}</dd>
                      </div>
                      <div>
                        <dt className="text-[#8b8a81]">{isOrders ? 'Profit' : 'If won'}</dt>
                        <dd className={`${NUM} text-[#1a1a18]`}>
                          {row.profit === null
                            ? <span className="text-[11px] italic text-[#8b8a81]">Unknown</span>
                            : money2(row.profit)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-2"><StatusChip status={row.status} /></div>
                  </article>
                ))}

                <div className="px-3 py-3 bg-[#faf9f5] border-t border-[#dbd8cc] flex flex-col gap-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold text-[#8b8a81]">
                      {shown.length}{shown.length !== ledger.length ? ` of ${ledger.length}` : ''}{' '}
                      {isOrders ? 'order' : 'quote'}{shown.length === 1 ? '' : 's'}
                    </span>
                    <span className={`${NUM} text-[14px] font-semibold text-[#1a1a18]`}>{money2(shownTotal)}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-[#8b8a81]">GST</span>
                    <span className={`${NUM} text-[11px] text-[#5a5a52]`}>{money2(shownGst)}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-[#8b8a81]">{isOrders ? 'Profit' : 'Profit if won'}</span>
                    <span className={`${NUM} text-[12px] font-semibold text-[#1a1a18]`}>
                      {money2(shownProfit)}
                      {shownMargin !== null && <span className="font-normal text-[10px] text-[#8b8a81]"> · {shownMargin.toFixed(0)}%</span>}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {isOrders && unknownProfit > 0 && (
            <p className="px-3 py-2.5 text-[11px] text-[#8b8a81] border-t border-[#dbd8cc] leading-[1.5]">
              {unknownProfit} order{unknownProfit === 1 ? ' has' : 's have'} no quote behind them, so the profit on them
              is unknown rather than nothing. The total leaves them out.
            </p>
          )}
        </div>
      </div>

      {/* How the figures are worked out. Last, and quiet, because it is read
          once and then trusted, not scanned daily. */}
      <details className={`${CARD} mt-4`}>
        <summary className="px-4 py-3 text-[12px] font-semibold text-[#1a1a18] cursor-pointer select-none">
          How these figures are worked out
        </summary>
        <ul className="px-4 pb-3 flex flex-col gap-2 text-[11.5px] text-[#5a5a52] leading-[1.5]">
          <li><b className="text-[#1a1a18]">Confirmed orders</b> are dated from acceptance, falling back to when the order was raised for older ones. Cancelled orders, and orders still waiting on their deposit, are left out.</li>
          <li><b className="text-[#1a1a18]">Unaccepted quotes</b> are quotes sent or viewed that have not become an order, dated from when they were sent.</li>
          <li><b className="text-[#1a1a18]">Profit</b> is markup plus labour, ex GST, from the quote. An order with no quote behind it counts as unknown, never as zero.</li>
          <li><b className="text-[#1a1a18]">The margin</b> beside the profit total is that profit as a percentage of the ex GST value of the same rows.</li>
          <li><b className="text-[#1a1a18]">GST collected</b> is the GST inside payments actually banked, each one apportioned by its own order&apos;s GST. The accrual figure beside it is the GST invoiced on confirmed orders, whether or not it has been paid.</li>
          <li><b className="text-[#1a1a18]">Owed to us</b> is every unpaid payment on an order that is not cancelled, aged from the day it was requested. It ignores the period, because it is what is owed today.</li>
          <li><b className="text-[#1a1a18]">The financial year</b> runs July to June.</li>
        </ul>
      </details>
    </div>
  )
}
