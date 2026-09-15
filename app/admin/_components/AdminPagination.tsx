'use client'

import * as React from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { LIST_PAGE_SIZE, REPORT_PAGE_SIZE as REPORT_ROWS } from '@/components/ui/table-styles'

// Ten rows on a list of records. It was eight, which paged a screen that had
// room for more. Defined with the rest of the table look in table-styles.
export const PAGE_SIZE = LIST_PAGE_SIZE

// Reports are read down rather than clicked through, so they get a longer
// page: fifteen rows is about a screen.
export const REPORT_PAGE_SIZE = REPORT_ROWS

export function useAdminPagination<T>(items: T[], resetKey: unknown = '', pageSize: number = PAGE_SIZE) {
  const [page, setPage] = React.useState(1)
  const totalItems = items.length
  const pageCount  = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage   = Math.min(Math.max(page, 1), pageCount)

  React.useEffect(() => { setPage(1) }, [String(resetKey)])
  React.useEffect(() => { if (page !== safePage) setPage(safePage) }, [page, safePage])

  const pageItems = React.useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  return { page: safePage, pageCount, pageItems, setPage, totalItems }
}

interface AdminPaginationProps {
  label?:       string
  /** Defaults to PAGE_SIZE, so every table that already used this keeps its size. */
  pageSize?:    number
  page:         number
  pageCount:    number
  totalItems:   number
  onPageChange: (page: number) => void
}

export function AdminPagination({
  label = 'records', pageSize = PAGE_SIZE, page, pageCount, totalItems, onPageChange,
}: AdminPaginationProps) {
  const isPaginated = totalItems > pageSize
  const start = totalItems ? (page - 1) * pageSize + 1 : 0
  const end   = totalItems ? Math.min(page * pageSize, totalItems) : 0

  return (
    <div className="flex items-center justify-between px-4 py-[10px] border-t border-[#edf4eb] text-[13px] text-[#5a5a52]">
      <span>
        {totalItems ? `Showing ${start} to ${end} of ${totalItems} ${label}` : `No ${label}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!isPaginated || page <= 1}
          className="h-[28px] w-[28px] flex items-center justify-center rounded-[4px] border border-[#dbd8cc] disabled:opacity-40 hover:bg-[#f5f8f4] transition-colors"
        >
          <IconChevronLeft size={13} />
        </button>
        <span className="px-2 text-[13px]">{page} / {pageCount}</span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!isPaginated || page >= pageCount}
          className="h-[28px] w-[28px] flex items-center justify-center rounded-[4px] border border-[#dbd8cc] disabled:opacity-40 hover:bg-[#f5f8f4] transition-colors"
        >
          <IconChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
