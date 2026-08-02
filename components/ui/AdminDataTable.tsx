'use client'

import * as React from 'react'
import { IconSearch } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonText } from '@/components/ui/Skeleton'

export interface AdminDataTableColumn<T> {
  id: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  className?: string
  headerClassName?: string
  widthClassName?: string
}

export interface AdminDataTableProps<T> {
  rows: T[]
  columns: AdminDataTableColumn<T>[]
  getRowId: (row: T) => string
  getRowLabel?: (row: T) => string
  onRowClick?: (row: T) => void
  loading?: boolean
  emptyTitle: string
  emptyDescription?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  primaryAction?: React.ReactNode
  selectedIds?: string[]
  onSelectedIdsChange?: (ids: string[]) => void
  bulkActions?: React.ReactNode
  mobileCard: (row: T) => React.ReactNode
  pagination?: React.ReactNode
  className?: string
}

const SKELETON_WIDTHS = ['70%', '50%', '80%', '60%', '45%', '64%']

export function AdminDataTable<T>({
  rows,
  columns,
  getRowId,
  getRowLabel,
  onRowClick,
  loading = false,
  emptyTitle,
  emptyDescription,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  primaryAction,
  selectedIds = [],
  onSelectedIdsChange,
  bulkActions,
  mobileCard,
  pagination,
  className,
}: AdminDataTableProps<T>) {
  const selectable = Boolean(onSelectedIdsChange)
  const rowIds = React.useMemo(() => rows.map(getRowId), [rows, getRowId])
  const allPageSelected = rowIds.length > 0 && rowIds.every(id => selectedIds.includes(id))
  const somePageSelected = rowIds.some(id => selectedIds.includes(id)) && !allPageSelected
  const isEmpty = !loading && rows.length === 0

  function toggleRow(id: string) {
    if (!onSelectedIdsChange) return
    onSelectedIdsChange(
      selectedIds.includes(id)
        ? selectedIds.filter(selectedId => selectedId !== id)
        : [...selectedIds, id]
    )
  }

  function togglePage(checked: boolean) {
    if (!onSelectedIdsChange) return
    if (!checked) {
      onSelectedIdsChange(selectedIds.filter(id => !rowIds.includes(id)))
      return
    }
    onSelectedIdsChange(Array.from(new Set([...selectedIds, ...rowIds])))
  }

  const colSpan = columns.length + (selectable ? 1 : 0)

  return (
    <div className={cn('w-full', className)}>
      <div className="hidden overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white md:block">
        {(onSearchChange || primaryAction || bulkActions) && (
          <div className="flex items-center justify-between gap-3 border-b border-[#edf4eb] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {bulkActions ?? (
                onSearchChange && (
                  <div className="relative">
                    <IconSearch size={14} className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[#8b8a81]" />
                    <input
                      type="search"
                      value={searchValue ?? ''}
                      onChange={event => onSearchChange(event.target.value)}
                      placeholder={searchPlaceholder}
                      className="h-[36px] w-[220px] rounded-[6px] border border-[#dbd8cc] pl-[32px] pr-3 text-[13px] text-[#1a1a18] outline-none transition-colors placeholder:text-[#8b8a81] focus:border-[#6b9e61]"
                    />
                  </div>
                )
              )}
            </div>
            {primaryAction && <div className="flex flex-shrink-0 items-center gap-2">{primaryAction}</div>}
          </div>
        )}

        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#dbd8cc] bg-[#f5f8f4]">
              {selectable && (
                <th className="w-[40px] px-4 py-[9px] text-left">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={el => { if (el) el.indeterminate = somePageSelected }}
                    onChange={event => togglePage(event.target.checked)}
                    aria-label="Select all visible rows"
                    className="accent-[#6b9e61]"
                  />
                </th>
              )}
              {columns.map(column => (
                <th
                  key={column.id}
                  className={cn(
                    'px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]',
                    column.widthClassName,
                    column.headerClassName
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 5 }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-b border-[#edf4eb] last:border-b-0">
                {selectable && (
                  <td className="px-4 py-[11px]">
                    <SkeletonText width="16px" />
                  </td>
                )}
                {columns.map((column, columnIndex) => (
                  <td key={column.id} className="px-4 py-[11px]">
                    <SkeletonText width={SKELETON_WIDTHS[(rowIndex + columnIndex) % SKELETON_WIDTHS.length]} />
                  </td>
                ))}
              </tr>
            ))}

            {isEmpty && (
              <tr>
                <td colSpan={colSpan}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            )}

            {!loading && rows.map(row => {
              const rowId = getRowId(row)
              const rowLabel = getRowLabel?.(row) ?? rowId
              return (
                <tr
                  key={rowId}
                  className={cn(
                    'border-b border-[#edf4eb] transition-colors last:border-b-0 hover:bg-[#f5f8f4]',
                    onRowClick && 'cursor-pointer'
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <td className="px-4 py-[11px]" onClick={event => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(rowId)}
                        onChange={() => toggleRow(rowId)}
                        aria-label={`Select ${rowLabel}`}
                        className="accent-[#6b9e61]"
                      />
                    </td>
                  )}
                  {columns.map(column => (
                    <td
                      key={column.id}
                      className={cn('px-4 py-[11px] text-[#1a1a18]', column.className)}
                      onClick={column.id === 'actions' ? event => event.stopPropagation() : undefined}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>

        {pagination}
      </div>

      <div className="md:hidden">
        {(onSearchChange || primaryAction) && (
          <div className="mb-3 flex items-center gap-3">
            {onSearchChange && (
              <div className="relative min-w-0 flex-1">
                <IconSearch size={14} className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[#8b8a81]" />
                <input
                  type="search"
                  value={searchValue ?? ''}
                  onChange={event => onSearchChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-[40px] w-full rounded-[6px] border border-[#dbd8cc] pl-[32px] pr-3 text-[14px] text-[#1a1a18] outline-none transition-colors placeholder:text-[#8b8a81] focus:border-[#6b9e61]"
                />
              </div>
            )}
            {primaryAction}
          </div>
        )}

        {bulkActions && <div className="mb-3">{bulkActions}</div>}

        <div className="flex flex-col gap-3">
          {loading && Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[8px] border border-[#dbd8cc] bg-white p-4">
              <SkeletonText width="40%" className="mb-3" />
              <SkeletonText className="mb-2" />
              <SkeletonText width="70%" />
            </div>
          ))}

          {isEmpty && <EmptyState title={emptyTitle} description={emptyDescription} />}

          {!loading && rows.map(row => (
            <React.Fragment key={getRowId(row)}>
              {mobileCard(row)}
            </React.Fragment>
          ))}

          {!isEmpty && pagination}
        </div>
      </div>
    </div>
  )
}
