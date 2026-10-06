'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { tableStyles as t } from '@/components/ui/table-styles'
import { AdminPagination, REPORT_PAGE_SIZE, useAdminPagination } from '../../_components/AdminPagination'

// The lines whose board is not in the colour library, with a link to each.
// Read only. Fixing one is opening it and picking the board again.

interface Row {
  kind: 'Quote' | 'Order'
  recordId: string
  ref: string
  customer: string
  lineNo: number
  board: string
  problem: string
  href: string
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Order', label: 'Orders' },
  { key: 'Quote', label: 'Quotes' },
] as const

export default function DataChecksClient({
  rows,
  loadFailed,
  checked,
}: {
  rows: Row[]
  loadFailed: boolean
  checked: { quotes: number; orders: number; lines: number }
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const shown = useMemo(() => (filter === 'all' ? rows : rows.filter(r => r.kind === filter)), [rows, filter])
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(shown, filter, REPORT_PAGE_SIZE)
  const count = (key: string) => (key === 'all' ? rows.length : rows.filter(r => r.kind === key).length)

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-bold text-[#1a1a18]">Data checks</h1>
        <p className="mt-[2px] text-[13px] text-[#5a5a52]">
          Lines on live quotes and orders whose board is not in the colour library. They were saved before the library
          check existed. Open one and pick the board again to fix it.
        </p>
      </div>

      {loadFailed ? (
        <div className="mb-4 rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">
          The lines or the colour library could not be read, so this list cannot be trusted. Reload the page.
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'inline-flex min-h-[32px] items-center gap-2 rounded-full border px-3 py-[6px] text-[12px] font-medium',
              filter === f.key
                ? 'border-[#1c2b1e] bg-[#1c2b1e] text-white'
                : 'border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4]'
            )}
          >
            {f.label}
            <span
              className={cn(
                'rounded-full px-[6px] py-[1px] text-[11px] font-semibold',
                filter === f.key ? 'bg-white/20 text-white' : 'bg-[#edf4eb] text-[#2d5e28]'
              )}
            >
              {count(f.key)}
            </span>
          </button>
        ))}
      </div>

      <div className={t.card}>
        <div className={t.toolbar}>
          <span className={t.meta}>
            Checked {checked.lines} line{checked.lines === 1 ? '' : 's'} on {checked.quotes} open quote{checked.quotes === 1 ? '' : 's'} and{' '}
            {checked.orders} live order{checked.orders === 1 ? '' : 's'}
          </span>
        </div>
        <div className={t.sideScroll}>
          <table className={t.table}>
            <thead>
              <tr>
                <th className={t.th}>Where</th>
                <th className={t.th}>Customer</th>
                <th className={t.th}>Line</th>
                <th className={t.th}>Board on the line</th>
                <th className={t.th}>What is wrong</th>
              </tr>
            </thead>
            <tbody className={t.body}>
              {pageItems.length ? (
                pageItems.map(row => (
                  <tr key={`${row.kind}-${row.recordId}-${row.lineNo}`} className="transition-colors hover:bg-[#f5f8f4]">
                    <td className={cn(t.td, 'whitespace-nowrap')}>
                      <Link href={row.href} className="font-semibold text-[#2d5e28] hover:underline">
                        {row.kind} {row.ref}
                      </Link>
                    </td>
                    <td className={t.td}>{row.customer}</td>
                    <td className={cn(t.td, t.num)}>{row.lineNo}</td>
                    <td className={t.td}>{row.board || <span className="text-[#8b8a81]">Blank</span>}</td>
                    <td className={cn(t.td, 'max-w-[460px] text-[12.5px] text-[#5a5a52]')}>{row.problem}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={t.empty}>
                    {loadFailed ? 'Nothing to show.' : 'Every board on a live quote or order is in the colour library.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <AdminPagination
          label="lines"
          pageSize={REPORT_PAGE_SIZE}
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
