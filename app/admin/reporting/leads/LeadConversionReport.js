'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { AdminPageHeader } from '@/components/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { StatusPill } from '@/components/ui/StatusPill'
import AdminLoading from '@/components/admin/AdminLoading'
import { AdminPagination, useAdminPagination, REPORT_PAGE_SIZE } from '../../_components/AdminPagination'

// LEAD CONVERSION.
//
// Nobody marks a quote rejected. A customer who goes quiet just goes quiet, so
// the quote sits at 'sent' forever and every decided quote looks won: the rate
// computed honestly off the raw statuses was 100%.
//
// A quote out longer than our own terms are good for is therefore counted as
// lost. Thirty days, because that is what the quote itself says. On the real
// book that turns 100% into 64%, which is a number somebody can argue with.
//
// STILL LIVE SITS BESIDE THE RATE, NOT INSIDE IT. A quote sent last Tuesday is
// neither a win nor a loss, and folding it into either would move this week's
// rate for a reason that has not happened yet.

const money = value =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  )
function perthToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function monthsBack(day, months) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date.toISOString().slice(0, 10)
}

const SOURCE_LABELS = {
  request_quote: 'Website quote form',
  product_detail: 'Product page',
  design_tool: 'Design tool',
  unknown: 'Not recorded',
}

export default function LeadConversionReport() {
  const today = useMemo(() => perthToday(), [])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showing, setShowing] = useState('lapsed')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (from) query.set('from', from)
      if (to) query.set('to', to)
      const response = await fetch(`/api/admin/reporting/lead-conversion?${query}`)
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not load the report.')
      setData(payload)
    } catch (thrown) {
      setError(thrown?.message || 'Could not load the report.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  if (loading && !data) {
    return <AdminLoading steps={['Reading your quotes', 'Working out what happened to them']} label="Building the report" />
  }

  const b = data?.buckets
  const decided = data?.decided
  const list = b?.[showing]?.quotes || []

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader
        title="Lead conversion"
        subtitle="What happens to a quote once it goes out"
      />

      <div className="mb-[14px] flex flex-wrap items-end gap-[10px] rounded-[8px] border border-[#dbd8cc] bg-white px-[14px] py-3">
        <label className="flex min-w-[140px] flex-1 flex-col gap-1 sm:flex-none">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">From</span>
          <input type="date" value={from} max={to || today} onChange={e => setFrom(e.target.value)}
            className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-[9px] text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]" />
        </label>
        <label className="flex min-w-[140px] flex-1 flex-col gap-1 sm:flex-none">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">To</span>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
            className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-[9px] text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]" />
        </label>
        <div className="flex w-full flex-wrap gap-[6px] sm:ml-auto sm:w-auto">
          <Button variant="secondary" size="sm" onClick={() => { setFrom(monthsBack(today, 3)); setTo(today) }}>Last 3 months</Button>
          <Button variant="secondary" size="sm" onClick={() => { setFrom(monthsBack(today, 12)); setTo(today) }}>Last 12 months</Button>
          <Button variant="secondary" size="sm" onClick={() => { setFrom(''); setTo('') }}>All time</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-[6px] border border-[#fcd34d] bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">
          {error}
        </div>
      )}

      {decided && (
        <>
          {/* THE RATE, and immediately under it what it was taken over. A rate
              with no denominator on screen is a number people quote at each
              other without knowing what it means. */}
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-[8px] border border-[#a8c5a0] bg-[#f5f8f4] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">Conversion</p>
              <p className="mt-[2px] text-[30px] font-bold leading-none text-[#2d5e28] tabular-nums">
                {decided.rateByCount === null ? '-' : `${decided.rateByCount}%`}
              </p>
              <p className="mt-[4px] text-[12px] text-[#5a5a52]">
                {b.converted.count} of {decided.count} decided quotes
              </p>
            </div>
            <Figure label="Won" value={money(b.converted.value)} note={`${b.converted.count} quotes`} />
            <Figure
              label="By value"
              value={decided.rateByValue === null ? '-' : `${decided.rateByValue}%`}
              note={`of ${money(decided.value)} decided`}
            />
          </div>

          {/* The standing "still live" banner was removed: the breakdown below
              already carries that row, marked as outside the rate, so the banner
              was the same figure twice with a paragraph attached. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card
                title="Where each quote ended up"
                subtitle={`Lapsed means sent over ${data.validDays} days ago and never answered`}
              >
                <div className="flex flex-col gap-[10px] px-4 py-4">
                  <Row label="Converted" bucket={b.converted} total={data} tone="#6b9e61" />
                  <Row label="Declined" bucket={b.lost} total={data} tone="#a32b21" />
                  <Row label="Lapsed" bucket={b.lapsed} total={data} tone="#c98a2e" />
                  <Row label="Still live" bucket={b.pending} total={data} tone="#8b8a81" ghost />
                  <Row label="Never sent" bucket={b.draft} total={data} tone="#dbd8cc" ghost />
                </div>
              </Card>
            </div>

            <Card title="How long a yes takes" subtitle="From sent to approved">
              {data.turnaround ? (
                <div className="flex flex-col gap-3 px-4 py-4">
                  <Figure label="Median" value={`${data.turnaround.median} days`} note={`over ${data.turnaround.counted} won quotes`} plain />
                  <Figure label="Fastest" value={`${data.turnaround.fastest} days`} plain />
                  <Figure label="Slowest" value={`${data.turnaround.slowest} days`} plain />
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-[13px] text-[#8b8a81]">No approved quote has both dates yet.</p>
              )}
            </Card>
          </div>

          {data.sources?.length > 0 && (
            <Card title="Where the requests came from" subtitle="All quote requests, not just the ones quoted">
              <div className="flex flex-col gap-[10px] px-4 py-4">
                {data.sources.map(source => (
                  <div key={source.source} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-[#1a1a18]">{SOURCE_LABELS[source.source] || source.source}</span>
                    <span className="tabular-nums text-[#5a5a52]">{source.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card
            title="The quotes themselves"
            subtitle="Oldest first, so the one to chase or write off is at the top"
          >
            <div className="flex flex-wrap gap-[6px] border-b border-[#edf4eb] px-4 py-3">
              {[['lapsed', 'Lapsed'], ['pending', 'Still live'], ['converted', 'Converted'], ['lost', 'Declined'], ['draft', 'Never sent']]
                .filter(([key]) => b[key].count > 0)
                .map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setShowing(key)}
                    className={`rounded-[6px] px-3 py-[6px] text-[12.5px] font-medium transition-colors ${
                      showing === key ? 'bg-[#edf4eb] text-[#1c2b1e]' : 'text-[#5a5a52] hover:bg-[#f5f8f4]'
                    }`}
                  >
                    {label} <span className="tabular-nums opacity-70">{b[key].count}</span>
                  </button>
                ))}
            </div>
            <QuoteList quotes={list} view={showing} />
          </Card>
        </>
      )}
    </div>
  )
}

function Figure({ label, value, note, plain = false }) {
  return (
    <div className={plain ? '' : 'rounded-[8px] border border-[#dbd8cc] bg-white px-4 py-3'}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">{label}</p>
      <p className="mt-[2px] text-[22px] font-bold leading-tight text-[#1a1a18] tabular-nums">{value}</p>
      {note && <p className="mt-[1px] text-[12px] text-[#8b8a81]">{note}</p>}
    </div>
  )
}

function Card({ title, subtitle, children }) {
  return (
    <div className="mb-4 overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-[#dbd8cc] bg-[#f5f8f4] px-4 py-[9px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">{title}</span>
        {subtitle && <span className="text-[12px] text-[#8b8a81]">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function Row({ label, bucket, total, tone, ghost = false }) {
  const all = Object.values(total.buckets).reduce((sum, entry) => sum + entry.count, 0)
  const percent = all ? Math.round((bucket.count / all) * 1000) / 10 : 0
  return (
    <div>
      <div className="mb-[3px] flex items-baseline justify-between gap-3 text-[13px]">
        <span className={ghost ? 'text-[#5a5a52]' : 'text-[#1a1a18]'}>
          {label}
          {ghost && <span className="ml-[6px] text-[11px] text-[#8b8a81]">not in the rate</span>}
        </span>
        <span className="tabular-nums text-[#5a5a52]">
          {bucket.count} <span className="text-[#8b8a81]">{money(bucket.value)}</span>
        </span>
      </div>
      <div className="h-[4px] w-full overflow-hidden rounded-full bg-[#edf4eb]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(percent, bucket.count ? 1 : 0)}%`, backgroundColor: tone }} />
      </div>
    </div>
  )
}

function QuoteList({ quotes, view }) {
  // Reset to page one when the tab changes: staying on page three of Lapsed
  // after switching to Converted shows a list nobody asked for.
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(quotes, view, REPORT_PAGE_SIZE)

  if (!quotes.length) return <p className="px-4 py-10 text-center text-[13px] text-[#8b8a81]">Nothing in here.</p>

  return (
    <>
    {/* Phone: a card each. Five columns at 620px means a sideways scroll on
        every phone, and the quote number is the thing you tap, so it should not
        be the thing you have to scroll to reach. */}
    <div className="flex flex-col gap-2 p-3 md:hidden">
      {pageItems.map(quote => (
        <Link
          key={quote.id}
          href={`/admin/quotes/${quote.id}`}
          className="block rounded-[6px] border border-[#edf4eb] p-3 hover:bg-[#f5f8f4]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[12px] text-[#1a1a18]">{quote.number}</div>
              <div className="mt-[1px] truncate text-[13px] text-[#1a1a18]">{quote.customer || '-'}</div>
            </div>
            <div className="whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-[#1a1a18]">
              {money(quote.total)}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#8b8a81]">
            <span>
              Sent{' '}
              {quote.sentAt
                ? new Date(quote.sentAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                : 'never'}
            </span>
            {quote.age !== null && <span className="tabular-nums">{quote.age} days ago</span>}
          </div>
        </Link>
      ))}
    </div>

    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[620px] text-[13px]">
        <thead>
          <tr className="border-b border-[#edf4eb]">
            {['Quote', 'Customer', 'Sent', 'Age', 'Value'].map((column, index) => (
              <th key={column} className={`px-4 py-[7px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] ${index > 2 ? 'text-right' : 'text-left'}`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageItems.map(quote => (
            <tr key={quote.id} className="border-b border-[#edf4eb] last:border-b-0 hover:bg-[#f5f8f4]">
              <td className="px-4 py-[9px]">
                <Link href={`/admin/quotes/${quote.id}`} className="font-mono text-[12px] text-[#1a1a18] hover:underline">
                  {quote.number}
                </Link>
              </td>
              <td className="px-4 py-[9px] text-[#1a1a18]">{quote.customer || '-'}</td>
              <td className="px-4 py-[9px] text-[#5a5a52] whitespace-nowrap">
                {quote.sentAt ? new Date(quote.sentAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'Never'}
              </td>
              <td className="px-4 py-[9px] text-right tabular-nums text-[#5a5a52]">
                {quote.age === null ? '-' : `${quote.age}d`}
              </td>
              <td className="px-4 py-[9px] text-right tabular-nums text-[#1a1a18]">{money(quote.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <AdminPagination
      label="quotes"
      pageSize={REPORT_PAGE_SIZE}
      page={page}
      pageCount={pageCount}
      totalItems={totalItems}
      onPageChange={setPage}
    />
    </>
  )
}
