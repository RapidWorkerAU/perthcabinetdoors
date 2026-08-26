'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { AdminPageHeader } from '@/components/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import AdminLoading from '@/components/admin/AdminLoading'
import { AdminPagination, useAdminPagination, REPORT_PAGE_SIZE } from '../../_components/AdminPagination'
import { shareOf } from '@/lib/pcd-report-materials'

// COLOURS AND MATERIALS.
//
// What we actually sell, counted in PIECES rather than in lines: a line for
// three doors is three doors. Counting lines would rank a colour ordered once
// in a batch of forty below one ordered singly four times, which is the
// opposite of a stocking answer.
//
// Cancelled orders are left out. Their pieces were never made, so they say
// nothing about what to hold.

function perthToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function monthsBack(day, months) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date.toISOString().slice(0, 10)
}
// The three views of the same pieces, in the order somebody asks about them:
// what colour, then what it is made of, then how it is finished.
const TABS = [
  { key: 'colours', label: 'Colours' },
  { key: 'materials', label: 'Materials' },
  { key: 'finishes', label: 'Finishes' },
]

const money = value =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  )

export default function MaterialsReport() {
  const today = useMemo(() => perthToday(), [])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('colours')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (from) query.set('from', from)
      if (to) query.set('to', to)
      const response = await fetch(`/api/admin/reporting/materials?${query}`)
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
    return <AdminLoading steps={['Reading your orders', 'Counting pieces']} label="Building the report" />
  }

  const totals = data?.totals
  const fulfilment = data?.fulfilment

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader
        title="Colours and materials"
        subtitle="What your orders are actually made of, counted in pieces"
      />

      <div className="mb-[14px] flex flex-wrap items-end gap-[10px] rounded-[8px] border border-[#dbd8cc] bg-white px-[14px] py-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">From</span>
          <input
            type="date" value={from} max={to || today}
            onChange={event => setFrom(event.target.value)}
            className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-[9px] text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">To</span>
          <input
            type="date" value={to} min={from}
            onChange={event => setTo(event.target.value)}
            className="h-[34px] rounded-[6px] border border-[#dbd8cc] bg-white px-[9px] text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
          />
        </label>
        <div className="ml-auto flex gap-[6px]">
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

      {totals && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Figure label="Pieces" value={totals.pieces.toLocaleString()} note={`across ${data.orders} orders`} />
            <Figure label="Value" value={money(totals.value)} note="ex GST, line items only" />
            <Figure label="Colours" value={totals.colours} note="distinct" />
            <Figure label="Materials" value={totals.materials} note="distinct" />
          </div>

          {/* MADE HERE OR BOUGHT IN. The undecided are shown on purpose: a
              planning report that hides them is the one that lets them sit. */}
          <Card title="Made here or bought in" subtitle="By pieces">
            <Split fulfilment={fulfilment} total={totals.pieces} />
          </Card>

          {/* ONE FULL WIDTH TABLE, SWITCHED. Side by side, each of these had
              half the page for a bar chart that wants the width, and finishes
              sat alone underneath looking like an afterthought. They answer the
              same question about the same pieces, so they are one table you
              change the view of. */}
          <Card title="What the pieces are made of" subtitle="Most used first">
            <div className="flex flex-wrap gap-[6px] border-b border-[#edf4eb] px-4 py-3">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setView(tab.key)}
                  className={`rounded-[6px] px-3 py-[6px] text-[12.5px] font-medium transition-colors ${
                    view === tab.key ? 'bg-[#edf4eb] text-[#1c2b1e]' : 'text-[#5a5a52] hover:bg-[#f5f8f4]'
                  }`}
                >
                  {tab.label} <span className="tabular-nums opacity-70">{data[tab.key]?.length ?? 0}</span>
                </button>
              ))}
            </div>
            <Ranked
              rows={data[view]}
              total={totals.pieces}
              view={view}
              label={TABS.find(tab => tab.key === view)?.label.toLowerCase() || 'rows'}
            />
          </Card>
        </>
      )}
    </div>
  )
}

function Figure({ label, value, note }) {
  return (
    <div className="rounded-[8px] border border-[#dbd8cc] bg-white px-4 py-3">
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

function Split({ fulfilment, total }) {
  const rows = [
    ['Made in house', fulfilment.in_house],
    ['Bought in ready made', fulfilment.supplier_ready_made],
    ['Not decided yet', fulfilment.undecided],
  ].filter(([, pieces]) => pieces > 0)

  if (!rows.length) return <p className="px-4 py-8 text-center text-[13px] text-[#8b8a81]">Nothing to split yet.</p>

  return (
    <div className="flex flex-col gap-[10px] px-4 py-4">
      {rows.map(([label, pieces]) => (
        <div key={label}>
          <div className="mb-[3px] flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-[#1a1a18]">{label}</span>
            <span className="tabular-nums text-[#5a5a52]">
              {pieces.toLocaleString()} <span className="text-[#8b8a81]">({shareOf(pieces, total)}%)</span>
            </span>
          </div>
          <Bar percent={shareOf(pieces, total)} muted={label === 'Not decided yet'} />
        </div>
      ))}
    </div>
  )
}

function Ranked({ rows, total, view, label }) {
  // Reset to page one when the tab changes: staying on page three of Colours
  // after switching to Materials shows a list nobody asked for.
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(rows || [], view, REPORT_PAGE_SIZE)

  if (!rows?.length) {
    return <p className="px-4 py-8 text-center text-[13px] text-[#8b8a81]">No {label} are recorded on these orders.</p>
  }

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-[13px]">
        <thead>
          <tr className="border-b border-[#edf4eb]">
            {['', 'Pieces', 'Orders', 'Value'].map((column, index) => (
              <th
                key={column || index}
                className={`px-4 py-[7px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] ${index ? 'text-right' : 'text-left'}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageItems.map(row => (
            <tr key={row.key} className="border-b border-[#edf4eb] last:border-b-0">
              <td className="px-4 py-[9px]">
                <div className="text-[#1a1a18]">{row.key}</div>
                <Bar percent={shareOf(row.pieces, total)} />
              </td>
              <td className="px-4 py-[9px] text-right font-semibold tabular-nums text-[#1a1a18]">{row.pieces}</td>
              <td className="px-4 py-[9px] text-right tabular-nums text-[#5a5a52]">{row.orders}</td>
              <td className="px-4 py-[9px] text-right tabular-nums text-[#5a5a52]">{money(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <AdminPagination
      label={label}
      pageSize={REPORT_PAGE_SIZE}
      page={page}
      pageCount={pageCount}
      totalItems={totalItems}
      onPageChange={setPage}
    />
    </>
  )
}

function Bar({ percent, muted = false }) {
  return (
    <div className="mt-[4px] h-[4px] w-full overflow-hidden rounded-full bg-[#edf4eb]">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(percent, 1)}%`, backgroundColor: muted ? '#dbd8cc' : '#6b9e61' }}
      />
    </div>
  )
}
