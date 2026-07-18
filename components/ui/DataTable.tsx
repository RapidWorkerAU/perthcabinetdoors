'use client'

import * as React from 'react'
import {
  IconSearch, IconDownload, IconPlus, IconChevronDown, IconDotsVertical,
  IconEye, IconEdit, IconTrash, IconFilter, IconArrowsSort,
  IconX, IconChevronLeft, IconChevronRight,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonText } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DataTableColumn<T> {
  key:       keyof T | string
  label:     string
  sortable?: boolean
  width?:    string
  render?:   (row: T, editMode: boolean) => React.ReactNode
}

export interface DataTableProps<T extends { id: string }> {
  columns:            DataTableColumn<T>[]
  data:               T[]
  loading?:           boolean
  emptyTitle?:        string
  emptyDescription?:  string
  emptyAction?:       React.ReactNode
  searchPlaceholder?: string
  onAdd?:             () => void
  addLabel?:          string
  selectable?:        boolean
  onRowAction?:       (action: 'view' | 'quickEdit' | 'fullEdit' | 'delete', row: T) => void
  rowMenuItems?:      (row: T) => Array<{ label: string; icon: React.ReactNode; action: string; variant?: 'danger' }>
  onRowClick?:        (row: T) => void
  totalCount?:        number
  page?:              number
  pageSize?:          number
  onPageChange?:      (page: number) => void
  sortKey?:           string
  sortDir?:           'asc' | 'desc'
  onSort?:            (key: string, dir: 'asc' | 'desc') => void
  editingRowId?:      string
  onEditSave?:        (id: string, changes: Partial<T>) => void
  onEditCancel?:      () => void
  filterFields?:      Array<{ label: string; key: string; options: string[] }>
  className?:         string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCellValue<T>(row: T, key: keyof T | string): string {
  const val = (row as Record<string, unknown>)[key as string]
  return val === null || val === undefined ? '—' : String(val)
}

function getPages(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, 4, 5, '...', total]
  if (current >= total - 2) {
    const s = Math.max(total - 4, 1)
    return [1, '...', s, s + 1, s + 2, s + 3, total]
  }
  return [1, '...', current - 1, current, current + 1, '...', total]
}

const SKELETON_WIDTHS = ['60%', '80%', '50%', '70%', '45%', '65%']

// ── Component ────────────────────────────────────────────────────────────────

/**
 * DataTable — generic sortable, selectable, searchable data table.
 * Renders as a desktop table (md+) and a mobile card list (below md).
 * Quick edit is desktop-only. Pass editingRowId to highlight the row for inline editing;
 * the render prop receives editMode=true for that row so the parent can return inputs.
 *
 * @prop columns       - Column definitions with optional render functions.
 * @prop data          - Row array. Each row must have an id: string field.
 * @prop loading       - Shows skeleton rows when true.
 * @prop selectable    - Enables row checkboxes and a bulk action bar.
 * @prop onRowAction   - Called with action + row when a menu item is clicked.
 * @prop editingRowId  - Row id currently in quick edit mode (parent-controlled).
 * @prop onEditSave    - Called on Save button or Enter key during quick edit.
 * @prop onEditCancel  - Called on Cancel button or Escape during quick edit.
 * @prop filterFields  - Fields available in the mobile filter sheet.
 * @prop onSort        - Called when a sortable column header is clicked.
 * @prop onPageChange  - Called when the user navigates to a different page.
 */
export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription,
  emptyAction,
  searchPlaceholder = 'Search...',
  onAdd,
  addLabel = 'Add',
  selectable = false,
  onRowAction,
  rowMenuItems,
  onRowClick,
  totalCount,
  page = 1,
  pageSize = 20,
  onPageChange,
  sortKey,
  sortDir = 'asc',
  onSort,
  editingRowId,
  onEditSave,
  onEditCancel,
  filterFields = [],
  className,
}: DataTableProps<T>) {

  // ── Local state ────────────────────────────────────────────────────────────
  const [searchQuery,     setSearchQuery]     = React.useState('')
  const [selectedIds,     setSelectedIds]     = React.useState<string[]>([])
  const [openMenuId,      setOpenMenuId]      = React.useState<string | null>(null)
  const [mobileMenuRow,   setMobileMenuRow]   = React.useState<T | null>(null)
  const [filterSheetOpen, setFilterSheetOpen] = React.useState(false)
  const [sortSheetOpen,   setSortSheetOpen]   = React.useState(false)
  const [activeFilters,   setActiveFilters]   = React.useState<Record<string, string[]>>({})
  const [mobileSortKey,   setMobileSortKey]   = React.useState(sortKey ?? '')

  // ── Grid template ──────────────────────────────────────────────────────────
  const gridCols = [
    ...(selectable ? ['40px'] : []),
    ...columns.map(c => c.width ?? '1fr'),
    '44px',
  ].join(' ')

  // ── Selection ──────────────────────────────────────────────────────────────
  const allSelected  = data.length > 0 && data.every(r => selectedIds.includes(r.id))
  const someSelected = data.some(r => selectedIds.includes(r.id)) && !allSelected

  function toggleAll() {
    setSelectedIds(allSelected ? [] : data.map(r => r.id))
  }
  function toggleRow(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // ── Quick-edit keyboard ────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!editingRowId) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onEditCancel?.()
      if (e.key === 'Enter')  onEditSave?.(editingRowId!, {} as Partial<T>)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [editingRowId, onEditCancel, onEditSave])

  // ── Row-menu click-outside ─────────────────────────────────────────────────
  React.useEffect(() => {
    if (!openMenuId) return
    function handler(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-row-menu]')) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenuId])

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages  = totalCount ? Math.ceil(totalCount / pageSize) : 1
  const pageNumbers = getPages(page, totalPages)
  const start       = (page - 1) * pageSize + 1
  const end         = Math.min(page * pageSize, totalCount ?? data.length)

  // ── Cell renderer ──────────────────────────────────────────────────────────
  function renderCell(col: DataTableColumn<T>, row: T, editMode: boolean): React.ReactNode {
    return col.render ? col.render(row, editMode) : getCellValue(row, col.key)
  }

  const isEmpty = !loading && data.length === 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={className}>

      {/* ══════════════════════════ DESKTOP ══════════════════════════════════ */}
      <div className="hidden md:block w-full border border-[#dde1e9] rounded-[8px] overflow-hidden bg-white">

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#eef0f4]">
          <div className="relative">
            <IconSearch size={14} className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[#9ba7b8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              disabled={loading}
              className={cn(
                'h-[36px] border border-[#dde1e9] rounded-[6px] pl-[32px] pr-3 text-[14px]',
                'outline-none focus:border-[#2d9692] w-[240px] transition-colors',
                'disabled:bg-[#f7f8fa] disabled:text-[#9ba7b8]',
              )}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="neutral" size="sm" iconLeft={<IconDownload size={14} />}>Export</Button>
            {onAdd && (
              <Button variant="primary" size="sm" iconLeft={<IconPlus size={14} />} onClick={onAdd}>
                {addLabel}
              </Button>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between bg-[#1a2533] text-white px-4 py-[9px] text-[13px]">
            <span>{selectedIds.length} record{selectedIds.length !== 1 ? 's' : ''} selected</span>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-1 text-white/80 hover:text-white transition-colors">
                <IconDownload size={14} /> Export selected
              </button>
              <button className="flex items-center gap-1 text-[#f87171] hover:text-[#ef4444] transition-colors">
                <IconTrash size={14} /> Delete selected
              </button>
              <button onClick={() => setSelectedIds([])} className="ml-2 text-white/60 hover:text-white" aria-label="Clear selection">
                <IconX size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Column headers */}
        <div className="grid border-b border-[#dde1e9] bg-[#f7f8fa] px-4" style={{ gridTemplateColumns: gridCols }}>
          {selectable && (
            <div className="py-[9px] pr-3 flex items-center">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = someSelected }}
                onChange={toggleAll}
                className="w-4 h-4 rounded-[3px] accent-[#2d9692] cursor-pointer"
              />
            </div>
          )}
          {columns.map(col => (
            <div
              key={String(col.key)}
              className={cn(
                'py-[9px] pr-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6e7e92]',
                'flex items-center gap-1',
                col.sortable && 'cursor-pointer select-none hover:text-[#3d4d5f]',
                sortKey === String(col.key) && 'text-[#2d9692]',
              )}
              onClick={() => {
                if (!col.sortable) return
                const nextDir = sortKey === String(col.key) && sortDir === 'desc' ? 'asc' : 'desc'
                onSort?.(String(col.key), nextDir)
              }}
            >
              {col.label}
              {col.sortable && sortKey === String(col.key) && (
                <IconChevronDown size={12} className={cn('transition-transform', sortDir === 'asc' && 'rotate-180')} />
              )}
            </div>
          ))}
          <div /> {/* actions header */}
        </div>

        {/* Body */}
        <div>
          {/* Skeleton rows */}
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid border-b border-[#eef0f4] last:border-b-0 px-4 items-center" style={{ gridTemplateColumns: gridCols }}>
              {selectable && <div className="py-[11px] pr-3"><SkeletonText width="16px" /></div>}
              {columns.map((col, j) => (
                <div key={String(col.key)} className="py-[11px] pr-3">
                  <SkeletonText width={SKELETON_WIDTHS[(i + j) % SKELETON_WIDTHS.length]} />
                </div>
              ))}
              <div />
            </div>
          ))}

          {/* Empty state */}
          {isEmpty && (
            <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
          )}

          {/* Data rows */}
          {!loading && data.map(row => {
            const isEditing  = editingRowId === row.id
            const isSelected = selectedIds.includes(row.id)
            return (
              <React.Fragment key={row.id}>
                <div
                  className={cn(
                    'group grid border-b border-[#eef0f4] last:border-b-0 px-4',
                    'hover:bg-[#f7f8fa] transition-colors items-center',
                    isSelected && !isEditing && 'bg-[#f0f8f7]',
                    isEditing  && 'bg-white',
                    onRowClick && !isEditing && 'cursor-pointer',
                  )}
                  style={{
                    gridTemplateColumns: gridCols,
                    ...(isEditing ? { boxShadow: 'inset 3px 0 0 #2d9692' } : {}),
                  }}
                  onClick={onRowClick && !isEditing ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <div className="py-[11px] pr-3 flex items-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        className="w-4 h-4 rounded-[3px] accent-[#2d9692] cursor-pointer"
                      />
                    </div>
                  )}
                  {columns.map(col => (
                    <div key={String(col.key)} className="py-[11px] pr-3 text-[13px] text-[#1a2533] flex items-center min-w-0">
                      {renderCell(col, row, isEditing)}
                    </div>
                  ))}
                  {/* Actions column */}
                  <div className="py-[11px] flex items-center justify-end" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Button variant="primary" size="sm" onClick={() => onEditSave?.(row.id, {} as Partial<T>)}>Save</Button>
                        <Button variant="neutral" size="sm" onClick={onEditCancel}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="relative" data-row-menu>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
                          className={cn(
                            'w-[28px] h-[28px] rounded-[5px] flex items-center justify-center',
                            'text-[#9ba7b8] hover:bg-[#eef0f4] hover:text-[#3d4d5f] transition-colors',
                            'opacity-0 group-hover:opacity-100',
                            openMenuId === row.id && 'opacity-100 bg-[#eef0f4]',
                          )}
                          data-row-menu
                          aria-label="Row actions"
                        >
                          <IconDotsVertical size={14} />
                        </button>
                        {openMenuId === row.id && (
                          <div
                            data-row-menu
                            className="absolute right-0 top-full mt-1 z-[60] bg-white border border-[#dde1e9] rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.1)] py-1 w-[160px]"
                          >
                            {rowMenuItems ? (
                              /* Caller-supplied menu items — each maps to onRowAction(action). */
                              rowMenuItems(row).map(item => (
                                <button
                                  key={item.action}
                                  className={cn(
                                    'flex w-full items-center gap-2 px-3 py-[8px] text-[13px] cursor-pointer',
                                    item.variant === 'danger' ? 'text-[#ef4444] hover:bg-[#fee2e2]' : 'text-[#1a2533] hover:bg-[#f7f8fa]',
                                  )}
                                  onClick={() => { setOpenMenuId(null); onRowAction?.(item.action as 'view' | 'quickEdit' | 'fullEdit' | 'delete', row) }}
                                >
                                  {item.icon} {item.label}
                                </button>
                              ))
                            ) : (
                              <>
                                {[
                                  { label: 'View record', icon: <IconEye size={14} />,  action: 'view'      as const },
                                  { label: 'Quick edit',  icon: <IconEdit size={14} />, action: 'quickEdit' as const },
                                  { label: 'Full edit',   icon: <IconEdit size={14} />, action: 'fullEdit'  as const },
                                ].map(item => (
                                  <button
                                    key={item.action}
                                    className="flex w-full items-center gap-2 px-3 py-[8px] text-[13px] text-[#1a2533] cursor-pointer hover:bg-[#f7f8fa]"
                                    onClick={() => { setOpenMenuId(null); onRowAction?.(item.action, row) }}
                                  >
                                    {item.icon} {item.label}
                                  </button>
                                ))}
                                <div className="my-1 border-t border-[#eef0f4]" />
                                <button
                                  className="flex w-full items-center gap-2 px-3 py-[8px] text-[13px] text-[#ef4444] cursor-pointer hover:bg-[#fee2e2]"
                                  onClick={() => { setOpenMenuId(null); onRowAction?.('delete', row) }}
                                >
                                  <IconTrash size={14} /> Delete record
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Quick-edit info bar */}
                {isEditing && (
                  <div className="flex items-center justify-between bg-[#f0f8f7] border-t border-[#b5dfdd] px-4 py-[7px] text-[12px] text-[#1c5f5d]">
                    <span>Quick editing — description and attachments require full edit</span>
                    <span className="opacity-70">Esc to cancel · Enter to save</span>
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* Desktop pagination */}
        {totalCount !== undefined && onPageChange && (
          <div className="flex items-center justify-between px-4 py-[10px] border-t border-[#eef0f4] text-[13px] text-[#6e7e92]">
            <span>Showing {start}–{end} of {totalCount} records</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="h-[28px] w-[28px] flex items-center justify-center rounded-[4px] border border-[#dde1e9] disabled:opacity-40 hover:bg-[#f7f8fa] transition-colors"
              >
                <IconChevronLeft size={13} />
              </button>
              {pageNumbers.map((p, i) =>
                p === '...' ? (
                  <span key={`e${i}`} className="px-1 text-[#9ba7b8]">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => onPageChange(p as number)}
                    className={cn(
                      'h-[28px] min-w-[28px] px-2 rounded-[4px] border text-[13px] transition-colors',
                      p === page ? 'bg-[#2d9692] text-white border-[#2d9692]' : 'border-[#dde1e9] hover:bg-[#f7f8fa]',
                    )}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="h-[28px] w-[28px] flex items-center justify-center rounded-[4px] border border-[#dde1e9] disabled:opacity-40 hover:bg-[#f7f8fa] transition-colors"
              >
                <IconChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════ MOBILE ══════════════════════════════════ */}
      <div className="block md:hidden">

        {/* Mobile toolbar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <IconSearch size={14} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-[#9ba7b8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              disabled={loading}
              className="w-full h-[40px] border border-[#dde1e9] rounded-[6px] pl-[36px] pr-3 text-[14px] outline-none focus:border-[#2d9692]"
            />
          </div>
          {filterFields.length > 0 && (
            <button
              onClick={() => setFilterSheetOpen(true)}
              className="relative h-[40px] w-[40px] rounded-[6px] border border-[#dde1e9] bg-white flex items-center justify-center text-[#6e7e92]"
              aria-label="Filter"
            >
              <IconFilter size={16} />
              {Object.values(activeFilters).flat().length > 0 && (
                <span className="absolute -top-1 -right-1 w-[16px] h-[16px] rounded-full bg-[#2d9692] text-white text-[10px] flex items-center justify-center">
                  {Object.values(activeFilters).flat().length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setSortSheetOpen(true)}
            className="h-[40px] w-[40px] rounded-[6px] border border-[#dde1e9] bg-white flex items-center justify-center text-[#6e7e92]"
            aria-label="Sort"
          >
            <IconArrowsSort size={16} />
          </button>
          {onAdd && (
            <button
              onClick={onAdd}
              className="h-[40px] w-[40px] rounded-[6px] bg-[#2d9692] flex items-center justify-center text-white"
              aria-label={addLabel}
            >
              <IconPlus size={16} />
            </button>
          )}
        </div>

        {/* Mobile skeleton */}
        {loading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#dde1e9] rounded-[8px] mb-2 p-[14px]">
            <div className="flex items-center justify-between mb-2">
              <SkeletonText width="80px" /><SkeletonText width="20px" />
            </div>
            <SkeletonText className="mb-2" />
            <SkeletonText width="60%" className="mb-2" />
            <SkeletonText width="40%" />
          </div>
        ))}

        {/* Mobile empty state */}
        {isEmpty && (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        )}

        {/* Cards */}
        {!loading && data.map(row => (
          <div
            key={row.id}
            className={cn('bg-white border border-[#dde1e9] rounded-[8px] mb-2 overflow-hidden', onRowClick && 'cursor-pointer')}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            <div className="p-[14px]">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[#2d9692]">{row.id}</span>
                <button
                  onClick={e => { e.stopPropagation(); setMobileMenuRow(row) }}
                  className="w-[28px] h-[28px] rounded-[5px] flex items-center justify-center text-[#9ba7b8] hover:bg-[#eef0f4]"
                  aria-label="Row actions"
                >
                  <IconDotsVertical size={15} />
                </button>
              </div>
              {columns[0] && (
                <div className="text-[14px] font-medium text-[#1a2533] leading-snug mt-1 mb-2">
                  {renderCell(columns[0], row, false)}
                </div>
              )}
              {columns.slice(1).map(col => (
                <div key={String(col.key)} className="flex items-center gap-2 mb-[6px]">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9ba7b8] flex-shrink-0" style={{ width: 56 }}>
                    {col.label}
                  </span>
                  <span className="text-[12px] text-[#3d4d5f] flex items-center">
                    {renderCell(col, row, false)}
                  </span>
                </div>
              ))}
              <div className="flex gap-2 border-t border-[#eef0f4] pt-[10px] mt-[10px]" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => onRowAction?.('view', row)}
                  className="flex-1 h-[36px] rounded-[6px] border border-[#dde1e9] bg-white text-[12px] font-medium text-[#3d4d5f] flex items-center justify-center gap-1"
                >
                  <IconEye size={14} /> View
                </button>
                <button
                  onClick={() => onRowAction?.('fullEdit', row)}
                  className="flex-1 h-[36px] rounded-[6px] bg-[#2d9692] text-white text-[12px] font-medium flex items-center justify-center gap-1"
                >
                  <IconEdit size={14} /> Edit
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Mobile pagination */}
        {totalCount !== undefined && onPageChange && (
          <div className="flex items-center justify-between py-3 text-[13px] text-[#6e7e92]">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="h-[32px] px-3 rounded-[4px] border border-[#dde1e9] disabled:opacity-40 flex items-center gap-1"
            >
              <IconChevronLeft size={13} /> Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-[32px] px-3 rounded-[4px] border border-[#dde1e9] disabled:opacity-40 flex items-center gap-1"
            >
              Next <IconChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════ MOBILE SHEETS ═══════════════════════════════ */}

      {/* Mobile ⋯ menu sheet */}
      <Modal open={mobileMenuRow !== null} onClose={() => setMobileMenuRow(null)} title="" hideCloseButton contentFit>
        {mobileMenuRow && (
          <div className="pb-2">
            <div className="flex md:hidden mx-auto w-[36px] h-[4px] bg-[#dde1e9] rounded-full mb-3" aria-hidden="true" />
            <p className="text-[12px] font-medium text-[#2d9692] mb-[2px]">{mobileMenuRow.id}</p>
            <p className="text-[14px] font-medium text-[#1a2533] mb-4">
              {columns[0] ? renderCell(columns[0], mobileMenuRow, false) : ''}
            </p>
            {([
              { label: 'View record', icon: <IconEye size={16} />,  action: 'view'     as const },
              { label: 'Full edit',   icon: <IconEdit size={16} />, action: 'fullEdit' as const },
            ] as const).map(item => (
              <button
                key={item.action}
                className="flex w-full items-center gap-3 py-[11px] text-[14px] text-[#1a2533] border-b border-[#eef0f4]"
                onClick={() => { setMobileMenuRow(null); onRowAction?.(item.action, mobileMenuRow) }}
              >
                <span className="text-[#6e7e92]">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <button
              className="flex w-full items-center gap-3 py-[11px] text-[14px] text-[#ef4444]"
              onClick={() => { setMobileMenuRow(null); onRowAction?.('delete', mobileMenuRow) }}
            >
              <IconTrash size={16} /> Delete record
            </button>
          </div>
        )}
      </Modal>

      {/* Mobile sort sheet */}
      <Modal
        open={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        title="Sort by"
        contentFit
        footer={<Button variant="primary" onClick={() => setSortSheetOpen(false)}>Done</Button>}
      >
        <div>
          {columns.filter(c => c.sortable).map(col => (
            <button
              key={String(col.key)}
              className={cn(
                'flex w-full items-center justify-between py-[11px] border-b border-[#eef0f4] text-[14px]',
                mobileSortKey === String(col.key) ? 'text-[#2d9692] font-medium' : 'text-[#1a2533]',
              )}
              onClick={() => {
                setMobileSortKey(String(col.key))
                onSort?.(String(col.key), 'asc')
                setSortSheetOpen(false)
              }}
            >
              {col.label}
              {mobileSortKey === String(col.key) && (
                <span className="w-4 h-4 rounded-full border-[1.5px] border-[#2d9692] flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-[#2d9692]" />
                </span>
              )}
            </button>
          ))}
        </div>
      </Modal>

      {/* Mobile filter sheet */}
      {filterFields.length > 0 && (
        <Modal
          open={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          title="Filter"
          footer={
            <>
              <Button variant="neutral" onClick={() => setFilterSheetOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setFilterSheetOpen(false)}>
                Apply{Object.values(activeFilters).flat().length > 0
                  ? ` (${Object.values(activeFilters).flat().length})`
                  : ''}
              </Button>
            </>
          }
        >
          {filterFields.map(field => (
            <div key={field.key} className="mb-4">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[#9ba7b8] mb-2">{field.label}</p>
              <div className="flex flex-wrap gap-2">
                {field.options.map(opt => {
                  const active = (activeFilters[field.key] ?? []).includes(opt)
                  return (
                    <button
                      key={opt}
                      onClick={() => setActiveFilters(prev => {
                        const cur = prev[field.key] ?? []
                        return { ...prev, [field.key]: active ? cur.filter(v => v !== opt) : [...cur, opt] }
                      })}
                      className={cn(
                        'px-3 py-[6px] rounded-full border text-[13px] transition-colors',
                        active ? 'bg-[#f0f8f7] border-[#2d9692] text-[#1c5f5d]' : 'bg-white border-[#dde1e9] text-[#3d4d5f]',
                      )}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </Modal>
      )}

    </div>
  )
}
