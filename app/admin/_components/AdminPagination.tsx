'use client'

import * as React from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export const PAGE_SIZE = 8

export function useAdminPagination<T>(items: T[], resetKey: unknown = '') {
  const [page, setPage] = React.useState(1)
  const totalItems = items.length
  const pageCount  = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage   = Math.min(Math.max(page, 1), pageCount)

  React.useEffect(() => { setPage(1) }, [String(resetKey)])
  React.useEffect(() => { if (page !== safePage) setPage(safePage) }, [page, safePage])

  const pageItems = React.useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return items.slice(start, start + PAGE_SIZE)
  }, [items, safePage])

  return { page: safePage, pageCount, pageItems, setPage, totalItems }
}

interface AdminPaginationProps {
  label?:       string
  page:         number
  pageCount:    number
  totalItems:   number
  onPageChange: (page: number) => void
}

export function AdminPagination({ label = 'records', page, pageCount, totalItems, onPageChange }: AdminPaginationProps) {
  const isPaginated = totalItems > PAGE_SIZE
  const start = totalItems ? (page - 1) * PAGE_SIZE + 1 : 0
  const end   = totalItems ? Math.min(page * PAGE_SIZE, totalItems) : 0

  return (
    <div className="flex items-center justify-between px-4 py-[10px] border-t border-[#edf4eb] text-[13px] text-[#5a5a52]">
      <span>
        {totalItems ? `Showing ${start}–${end} of ${totalItems} ${label}` : `No ${label}`}
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
