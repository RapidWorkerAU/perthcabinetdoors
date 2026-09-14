'use client'

/*
 * MONEY IN. WHAT ACTUALLY HIT THE ACCOUNT.
 *
 * ── WHY THIS IS A SEPARATE PANEL ────────────────────────────────────────────
 *
 * The rest of Financials reports on WORK: what was quoted, what was confirmed,
 * what is owed. Those are accrual figures and they are dated from the day a job
 * was won. This is a CASH figure, dated from the day money moved, and the two
 * will almost never agree in the same period. That is not a fault in either of
 * them, it is what the two ways of counting mean, so they are shown as two
 * views rather than mixed into one table where somebody would try to reconcile
 * columns that were never meant to reconcile.
 *
 * Nothing on the work view changed. This sits beside it.
 *
 * ── THE RULES THIS VIEW FOLLOWS ─────────────────────────────────────────────
 *
 * A row counts if it is marked paid. That is it. It counts on a cancelled or
 * archived order too, because money that cleared in March does not come off the
 * bank statement because the job was called off in April. If it went back, the
 * refund is its own row on the day it went back, and it nets off there.
 *
 * In, out and net are three numbers, never one. Eight thousand in with five
 * hundred back is not the same as seven and a half thousand in, and a person
 * ticking this off against a bank statement needs both sides.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  PAYMENT_TYPE_LABELS,
  bankedPayments,
  cashSummary,
  cashByMonth,
  cashByMethod,
  cashProfit,
  cashMargin,
  CASH_METHOD_STRIPE,
  CASH_METHOD_UNRECORDED,
  money,
} from '../../../lib/pcd-financials'
import { settlementMethodLabel } from '../../../lib/pcd-payment-settlement'

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
  created_at: string | null
  settlement_method: string | null
  settlement_reference: string | null
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  receipt_number: string | null
}

type OrderRate = { id: string; total_inc_gst: number; gst_amount: number }

interface Props {
  payments: Payment[]
  /** Every order the GST rate can be read off, archived ones included. */
  orderRates: Map<string, OrderRate>
  /** Order id to profit ex GST, from the quote behind it. Absent means unknown. */
  profitByOrderId: Map<string, number>
  range: { from: string; to: string }
  periodLabel: string
  rangeLabel: string
  /** Confirmed order value for the same period, for the one honest comparison. */
  confirmedTotal: number
}

const CARD = 'bg-white border border-[#dbd8cc] rounded-[10px]'
const TH = 'text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-[#8b8a81] px-3 py-2 border-b border-[#dbd8cc] whitespace-nowrap'
const TD = 'px-3 py-2 text-[12px] text-[#1a1a18] border-b border-black/5 whitespace-nowrap'
const NUM = 'font-mono tabular-nums'

function money2(value: number): string {
  return Number(value || 0).toLocaleString('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

function dateLabel(value: string | null): string {
  if (!value) return '·'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '·'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
}

function monthLabel(key: string): string {
  const d = new Date(key + '-01T00:00:00')
  if (Number.isNaN(d.getTime())) return key
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

// How the money arrived, in the words the rest of the admin uses for it. Stripe
// and unrecorded are not settlement methods, they are the two states a payment
// is in when nobody wrote one down, so they are named here rather than being
// pushed through the settlement list and coming back as "Some other way".
function methodLabel(key: string): string {
  if (key === CASH_METHOD_STRIPE) return 'Card, through Stripe'
  if (key === CASH_METHOD_UNRECORDED) return 'Not recorded'
  return settlementMethodLabel(key)
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'in' | 'out' | 'net' }) {
  const colour = tone === 'out' ? 'text-[#a32b21]' : tone === 'net' ? 'text-[#1a1a18]' : 'text-[#2d5e28]'
  return (
    <div className="px-3 py-[10px] border-b border-[#edf4eb] last:border-b-0">
      <div className="text-[11px] text-[#8b8a81]">{label}</div>
      <div className={`${NUM} ${tone === 'net' ? 'text-[19px]' : 'text-[15px]'} font-medium mt-[2px] ${colour}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#8b8a81] mt-[2px] leading-[1.4]">{sub}</div>}
    </div>
  )
}

export default function CashReceivedPanel({
  payments, orderRates, profitByOrderId, range, periodLabel, rangeLabel, confirmedTotal,
}: Props) {
  const [search, setSearch] = useState('')
  const [showRefundsOnly, setShowRefundsOnly] = useState(false)

  const banked = useMemo(() => bankedPayments(payments, range), [payments, range])
  const cash = useMemo(() => cashSummary(banked, orderRates), [banked, orderRates])
  const months = useMemo(() => cashByMonth(banked), [banked])
  const methods = useMemo(() => cashByMethod(banked, methodLabel), [banked])
  const profit = useMemo(() => cashProfit(banked, orderRates, profitByOrderId), [banked, orderRates, profitByOrderId])
  const margin = cashMargin(profit.amount, profit.knownCash)

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return banked.filter(row => {
      if (showRefundsOnly && !row.isRefund) return false
      if (!q) return true
      return `${row.orderNumber || ''} ${row.customerName || ''} ${row.settlement_reference || ''} ${row.receipt_number || ''}`
        .toLowerCase().includes(q)
    })
  }, [banked, search, showRefundsOnly])

  const shownNet = shown.reduce((t, r) => t + r.amount, 0)
  const putAway = banked.filter(r => r.order_status === 'cancelled' || r.order_status === 'archived')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[236px_1fr] gap-4 items-start">

      {/* ── The rail ── */}
      <div className="flex flex-col gap-3">

        <div className={`${CARD} overflow-hidden`}>
          <div className="px-3 py-2 border-b border-[#dbd8cc]">
            <h2 className="text-[13px] font-semibold text-[#1a1a18]">{periodLabel}</h2>
            <p className="text-[10px] text-[#8b8a81] mt-[1px]">{rangeLabel}</p>
          </div>
          <Figure
            label="Banked"
            value={money2(cash.inAmount)}
            sub={`${cash.inCount} payment${cash.inCount === 1 ? '' : 's'} · inc GST`}
          />
          <Figure
            label="Refunded back out"
            value={cash.outAmount > 0 ? `- ${money2(cash.outAmount)}` : money2(0)}
            sub={cash.outCount ? `${cash.outCount} refund${cash.outCount === 1 ? '' : 's'} sent` : 'None in this period'}
            tone="out"
          />
          <Figure
            label="Net into the account"
            value={money2(cash.net)}
            sub="What the bank statement should show"
            tone="net"
          />
          <Figure
            label="Profit inside it"
            value={money2(profit.amount)}
            sub={
              (margin === null ? 'ex GST · markup plus labour' : `ex GST · ${margin.toFixed(0)}% of the money it came in on`) +
              (profit.unknownCount
                ? ` · ${profit.unknownCount} payment${profit.unknownCount === 1 ? '' : 's'} with no cost split behind ${profit.unknownCount === 1 ? 'it' : 'them'}, left out`
                : '')
            }
          />
        </div>

        {/* GST on a cash basis, which is the figure a cash-reporting BAS wants. */}
        <div className={`${CARD} px-3 py-[10px]`}>
          <div className="text-[11px] text-[#8b8a81]">GST inside that</div>
          <div className={`${NUM} text-[17px] font-medium text-[#1a1a18] mt-[2px]`}>{money2(cash.gst)}</div>
          <div className="text-[10px] text-[#8b8a81] mt-[2px] leading-[1.4]">
            Cash basis · refunds carry their GST back out with them
            {cash.noOrderCount > 0 &&
              ` · ${cash.noOrderCount} payment${cash.noOrderCount === 1 ? '' : 's'} with no order behind ${cash.noOrderCount === 1 ? 'it' : 'them'}, counted as cash but left out of the GST`}
          </div>
          <div className="text-[10px] text-[#8b8a81] mt-[6px] pt-[6px] border-t border-[#edf4eb] leading-[1.4]">
            Net of GST: <span className={`${NUM} text-[#5a5a52]`}>{money2(cash.exGst)}</span>
          </div>
        </div>

        {/* Cash against accrual, stated rather than left to be noticed. */}
        <div className={`${CARD} px-3 py-[10px]`}>
          <div className="text-[11px] text-[#8b8a81]">Work confirmed in the same period</div>
          <div className={`${NUM} text-[15px] font-medium text-[#5a5a52] mt-[2px]`}>{money(confirmedTotal)}</div>
          <div className="text-[10px] text-[#8b8a81] mt-[4px] leading-[1.45]">
            These two are not meant to match. A deposit banked this month can belong to a job confirmed last month,
            and a job confirmed today may not be paid for until next quarter. The profit above is worked the same way as
            the GST: a payment is a slice of its order, so it carries that slice of the order&apos;s markup and labour.
          </div>
        </div>

        {/* How it arrived, which is the column somebody ticks off a statement. */}
        {methods.length > 0 && (
          <div className={`${CARD} overflow-hidden`}>
            <div className="px-3 py-2 border-b border-[#dbd8cc]">
              <h3 className="text-[11px] font-semibold text-[#1a1a18]">How it arrived</h3>
            </div>
            {methods.map(m => (
              <div key={m.key} className="px-3 py-[7px] border-b border-[#edf4eb] last:border-b-0 flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-[#5a5a52] min-w-0 truncate">{m.label}</span>
                <span className={`${NUM} text-[11.5px] text-[#1a1a18] whitespace-nowrap`}>{money2(m.net)}</span>
              </div>
            ))}
            {methods.some(m => m.key === CASH_METHOD_UNRECORDED) && (
              <p className="px-3 py-2 text-[10px] text-[#8a6d0b] bg-[#fffef0] border-t border-[#f0d060] leading-[1.45]">
                Some payments are marked paid with no method recorded. They still count as money in, but they cannot be
                matched to a line on a statement until somebody says how they arrived.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── The ledger ── */}
      <div className={`${CARD} overflow-hidden`}>

        {/* Month by month, so a quarter can be read off for a BAS without
            exporting anything. Only months with movement get a column. */}
        {months.length > 1 && (
          <div className="px-3 py-[10px] border-b border-[#dbd8cc] bg-[#faf9f5] overflow-x-auto">
            <div className="flex gap-2 min-w-0">
              {months.map(m => (
                <div key={m.month} className="flex-shrink-0 min-w-[104px] bg-white border border-[#dbd8cc] rounded-[7px] px-[10px] py-[7px]">
                  <div className="text-[10px] text-[#8b8a81] whitespace-nowrap">{monthLabel(m.month)}</div>
                  <div className={`${NUM} text-[13px] font-medium text-[#1a1a18] mt-[1px] whitespace-nowrap`}>{money2(m.net)}</div>
                  {m.outAmount > 0 && (
                    <div className={`${NUM} text-[10px] text-[#a32b21] whitespace-nowrap`}>- {money2(m.outAmount)} back</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-[10px] border-b border-[#dbd8cc]">
          <button
            type="button"
            onClick={() => setShowRefundsOnly(v => !v)}
            aria-pressed={showRefundsOnly}
            className={`min-h-[40px] px-3 text-[13px] md:min-h-0 md:py-[5px] md:text-[11.5px] font-medium rounded-[7px] border transition-colors self-start whitespace-nowrap ${
              showRefundsOnly ? 'bg-[#1c2b1e] text-white border-[#1c2b1e]' : 'bg-white text-[#5a5a52] border-[#dbd8cc] hover:bg-[#faf9f5]'
            }`}
          >
            {showRefundsOnly ? 'Showing refunds only' : `Refunds only · ${cash.outCount}`}
          </button>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search order, customer or reference"
            className="h-[40px] px-3 text-[16px] md:h-[28px] md:px-2.5 md:text-[12px] border border-[#dbd8cc] rounded-[6px] w-full sm:w-[240px] text-[#1a1a18] placeholder:text-[#b5b3aa] sm:ml-auto"
          />
          <span className="hidden lg:block text-[10px] text-[#8b8a81] whitespace-nowrap">
            Dated by the day the money moved
          </span>
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] italic text-[#8b8a81]">
            {banked.length === 0
              ? `No money was banked in ${periodLabel.toLowerCase()}.`
              : 'Nothing matches that search.'}
          </p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TH}>Paid</th>
                    <th className={TH}>Order</th>
                    <th className={TH}>Customer</th>
                    <th className={TH}>What for</th>
                    <th className={TH}>How</th>
                    <th className={TH}>Reference</th>
                    <th className={`${TH} text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(row => (
                    <tr key={row.id} className={row.isRefund ? 'bg-[#fef7f6] hover:bg-[#fdeeec]' : 'hover:bg-[#faf9f5]'}>
                      <td className={`${TD} text-[#5a5a52]`}>{dateLabel(row.on)}</td>
                      <td className={TD}>
                        {row.orderId
                          ? <Link href={`/admin/orders/${row.orderId}`} className="font-medium text-[#2d5e28] hover:underline">{row.orderNumber || 'Order'}</Link>
                          : <span className="text-[#8b8a81]">·</span>}
                      </td>
                      <td className={`${TD} text-[#5a5a52]`}>{row.customerName || '·'}</td>
                      <td className={TD}>
                        {PAYMENT_TYPE_LABELS[row.payment_type] || 'Other'}
                        {(row.order_status === 'cancelled' || row.order_status === 'archived') && (
                          <span className="ml-1.5 text-[10px] text-[#8a6d0b]">{row.order_status === 'archived' ? 'archived' : 'cancelled'}</span>
                        )}
                      </td>
                      <td className={`${TD} text-[#5a5a52]`}>{methodLabel(row.method)}</td>
                      <td className={`${TD} ${NUM} text-[11px] text-[#8b8a81]`}>
                        {row.settlement_reference || row.receipt_number || '·'}
                      </td>
                      <td className={`${TD} text-right ${NUM} ${row.isRefund ? 'text-[#a32b21]' : 'text-[#1a1a18]'}`}>
                        {money2(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="px-3 py-2 text-[11px] font-semibold text-[#8b8a81]" colSpan={6}>
                      {shown.length}{shown.length !== banked.length ? ` of ${banked.length}` : ''}{' '}
                      payment{shown.length === 1 ? '' : 's'} · {periodLabel.toLowerCase()}
                    </td>
                    <td className={`px-3 py-2 text-right text-[13px] font-semibold ${NUM} text-[#1a1a18]`}>{money2(shownNet)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Phone: the same rows as cards. Seven columns of figures on a
                390px screen is a horizontal scroll nobody wins. */}
            <div className="md:hidden flex flex-col">
              {shown.map(row => (
                <article key={row.id} className={`px-3 py-[14px] border-b border-[#edf4eb] last:border-b-0 ${row.isRefund ? 'bg-[#fef7f6]' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {row.orderId
                        ? <Link href={`/admin/orders/${row.orderId}`} className="block break-words text-[13px] font-semibold text-[#2d5e28] hover:underline">{row.orderNumber || 'Order'}</Link>
                        : <span className="text-[13px] font-semibold text-[#8b8a81]">No order</span>}
                      <p className="truncate text-[12px] text-[#5a5a52]">{row.customerName || '·'}</p>
                    </div>
                    <div className={`${NUM} text-[14px] font-medium whitespace-nowrap ${row.isRefund ? 'text-[#a32b21]' : 'text-[#1a1a18]'}`}>
                      {money2(row.amount)}
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2 text-[11px]">
                    <div>
                      <dt className="text-[#8b8a81]">Paid</dt>
                      <dd className="text-[#1a1a18]">{dateLabel(row.on)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#8b8a81]">What for</dt>
                      <dd className="text-[#1a1a18] truncate">{PAYMENT_TYPE_LABELS[row.payment_type] || 'Other'}</dd>
                    </div>
                    <div>
                      <dt className="text-[#8b8a81]">How</dt>
                      <dd className="text-[#1a1a18] truncate">{methodLabel(row.method)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
              <div className="px-3 py-3 bg-[#faf9f5] border-t border-[#dbd8cc] flex items-baseline justify-between">
                <span className="text-[11px] font-semibold text-[#8b8a81]">
                  {shown.length}{shown.length !== banked.length ? ` of ${banked.length}` : ''}{' '}
                  payment{shown.length === 1 ? '' : 's'}
                </span>
                <span className={`${NUM} text-[14px] font-semibold text-[#1a1a18]`}>{money2(shownNet)}</span>
              </div>
            </div>
          </>
        )}

        {putAway.length > 0 && (
          <p className="px-3 py-2.5 text-[11px] text-[#8b8a81] border-t border-[#dbd8cc] leading-[1.5]">
            {putAway.length} of these {putAway.length === 1 ? 'is' : 'are'} on an order that has since been cancelled or
            archived. They are still counted, because the money did reach the account. Anything that went back out is a
            refund row of its own on the day it was sent.
          </p>
        )}
      </div>
    </div>
  )
}
