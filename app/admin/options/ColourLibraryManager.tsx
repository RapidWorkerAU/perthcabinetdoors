'use client'

import { createPortal } from 'react-dom'
import { useMemo, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  COLOUR_MATERIALS,
  COLOUR_ORDER_TYPES,
  materialLabelForType,
  normaliseOrderTypes,
  orderTypesLabel,
  thicknessOptionsForMaterial,
} from '../../../lib/pcd-colour-library'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColourRow {
  id:                        string
  name:                      string
  image_url?:                string | null
  image_path?:               string | null
  supplier_name?:            string | null
  material_type?:            string | null
  thickness?:                string | null
  finish_type?:              string | null
  order_type?:               string | null
  order_types?:              string[] | null
  preferred_board_width_mm?: number | null
  preferred_board_height_mm?: number | null
  cost_per_board_ex_gst?:    number | null
  cost_per_sqm_ex_gst?:     number | null
  sort_order?:               number | null
  is_active?:                boolean | null
}

interface Draft {
  id:                        string | null
  name:                      string
  image_url:                 string
  original_image_url:        string
  image_path:                string
  supplier_name:             string
  material_type:             string
  thickness:                 string
  finish_type:               string
  order_type:                string
  order_types:               string[]
  preferred_board_width_mm:  number | string
  preferred_board_height_mm: number | string
  cost_per_board_ex_gst:     number | string
  cost_per_sqm_ex_gst:       number | string
  last_cost_field:           string | null
  sort_order:                number | string
  is_active:                 boolean
}

interface ColumnFilters {
  supplier:  string[]
  finish:    string[]
  material:  string[]
  thickness: string[]
  orderType: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const emptyDraft: Draft = {
  id:                        null,
  name:                      '',
  image_url:                 '',
  original_image_url:        '',
  image_path:                '',
  supplier_name:             'Polytec',
  material_type:             'decorative board',
  thickness:                 '18mm',
  finish_type:               '',
  order_type:                'supply board',
  order_types:               ['supply board'],
  preferred_board_width_mm:  '',
  preferred_board_height_mm: '',
  cost_per_board_ex_gst:     '',
  cost_per_sqm_ex_gst:       '',
  last_cost_field:           null,
  sort_order:                '',
  is_active:                 true,
}

function cleanFileName(name: string) {
  return String(name || 'colour-library')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
}

function imageSourceLabel(row: ColourRow) {
  if (row.image_path) return 'Uploaded'
  if (String(row.image_url || '').startsWith('/images/')) return 'Website image'
  if (row.image_url) return 'External URL'
  return '-'
}

function numericDraftValue(value: number | string | null | undefined) {
  if (value === '' || value == null) return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function boardAreaSqm(widthMm: number | string, heightMm: number | string) {
  const width  = numericDraftValue(widthMm)
  const height = numericDraftValue(heightMm)
  if (width <= 0 || height <= 0) return 0
  return (width * height) / 1000000
}

function calculateColourCosts(draft: Draft) {
  const area      = boardAreaSqm(draft.preferred_board_width_mm, draft.preferred_board_height_mm)
  const boardCost = numericDraftValue(draft.cost_per_board_ex_gst)
  const sqmCost   = numericDraftValue(draft.cost_per_sqm_ex_gst)
  const lastField = draft.last_cost_field

  if (area <= 0) return { cost_per_board_ex_gst: boardCost, cost_per_sqm_ex_gst: sqmCost }

  if (lastField === 'cost_per_sqm_ex_gst')
    return { cost_per_board_ex_gst: Number((sqmCost * area).toFixed(2)), cost_per_sqm_ex_gst: sqmCost }

  if (lastField === 'cost_per_board_ex_gst')
    return { cost_per_board_ex_gst: boardCost, cost_per_sqm_ex_gst: Number((boardCost / area).toFixed(2)) }

  if (sqmCost > 0 && boardCost <= 0)
    return { cost_per_board_ex_gst: Number((sqmCost * area).toFixed(2)), cost_per_sqm_ex_gst: sqmCost }

  if (boardCost > 0 && sqmCost <= 0)
    return { cost_per_board_ex_gst: boardCost, cost_per_sqm_ex_gst: Number((boardCost / area).toFixed(2)) }

  return { cost_per_board_ex_gst: boardCost, cost_per_sqm_ex_gst: sqmCost }
}

function boardSizeLabel(row: ColourRow) {
  const width  = Number(row.preferred_board_width_mm  || 0)
  const height = Number(row.preferred_board_height_mm || 0)
  if (!width && !height) return '-'
  return `${width || '-'} x ${height || '-'}mm`
}

function rowFromDraft(draft: Draft, image: { imageUrl: string; imagePath: string | null }, sortOrder: number) {
  const costs = calculateColourCosts(draft)
  return {
    name:                      draft.name.trim(),
    image_url:                 image.imageUrl,
    image_path:                image.imagePath || draft.image_path || null,
    supplier_name:             draft.supplier_name.trim() || 'Polytec',
    material_type:             draft.material_type,
    thickness:                 draft.thickness,
    finish_type:               draft.finish_type.trim(),
    order_type:                draft.order_types[0] || 'supply board',
    order_types:               draft.order_types.length ? draft.order_types : ['supply board'],
    preferred_board_width_mm:  numericDraftValue(draft.preferred_board_width_mm),
    preferred_board_height_mm: numericDraftValue(draft.preferred_board_height_mm),
    cost_per_board_ex_gst:     costs.cost_per_board_ex_gst,
    cost_per_sqm_ex_gst:       costs.cost_per_sqm_ex_gst,
    sort_order:                sortOrder,
    is_active:                 !!draft.is_active,
  }
}

// ── Shared class helpers ───────────────────────────────────────────────────────

const inputClass   = 'h-[36px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61]'
const primaryBtn   = 'h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors'
const secondaryBtn = 'h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors'

// ── Component ─────────────────────────────────────────────────────────────────

export default function ColourLibraryManager({
  initialRows  = [],
  initialError = '',
}: {
  initialRows?:  ColourRow[]
  initialError?: string
}) {
  const { toast } = useToast()
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const [rows,         setRows]         = useState<ColourRow[]>(initialRows)
  const [draft,        setDraft]        = useState<Draft>(emptyDraft)
  const [isSaving,     setIsSaving]     = useState(false)
  const [isModalOpen,  setIsModalOpen]  = useState(false)
  const [rowToDelete,  setRowToDelete]  = useState<ColourRow | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [searchQuery,  setSearchQuery]  = useState('')
  const [openFilter,   setOpenFilter]   = useState<string | null>(null)
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    supplier:  [],
    finish:    [],
    material:  [],
    thickness: [],
    orderType: [],
  })

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const m = String(a.material_type || '').localeCompare(String(b.material_type || ''))
        if (m) return m
        const t = String(a.thickness || '').localeCompare(String(b.thickness || ''))
        if (t) return t
        const f = String(a.finish_type || '').localeCompare(String(b.finish_type || ''))
        if (f) return f
        const s = Number(a.sort_order || 0) - Number(b.sort_order || 0)
        if (s) return s
        return String(a.name || '').localeCompare(String(b.name || ''))
      }),
    [rows]
  )

  const filterOptions = useMemo(() => {
    const uniq = (values: (string | null | undefined)[]) =>
      Array.from(new Set(values.filter(Boolean).map(v => String(v)))).sort((a, b) => a.localeCompare(b))
    return {
      supplier:  uniq(sortedRows.map(r => r.supplier_name || 'Polytec')),
      finish:    uniq(sortedRows.map(r => r.finish_type   || '-')),
      material:  uniq(sortedRows.map(r => r.material_type || '-')),
      thickness: uniq(sortedRows.map(r => r.thickness     || '-')),
      orderType: uniq(sortedRows.flatMap(r => normaliseOrderTypes(r))),
    }
  }, [sortedRows])

  const activeFilterCount = Object.values(columnFilters).reduce((n, v) => n + v.length, 0)

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return sortedRows.filter(row => {
      const searchable = [
        row.name, row.supplier_name, row.material_type, row.thickness, row.finish_type,
        boardSizeLabel(row), orderTypesLabel(row), imageSourceLabel(row),
        row.is_active ? 'Active' : 'Hidden',
      ]
      return (
        (!q || searchable.filter(Boolean).some(v => String(v).toLowerCase().includes(q))) &&
        (!columnFilters.supplier.length  || columnFilters.supplier.includes(row.supplier_name  || 'Polytec')) &&
        (!columnFilters.finish.length    || columnFilters.finish.includes(row.finish_type      || '-')) &&
        (!columnFilters.material.length  || columnFilters.material.includes(row.material_type  || '-')) &&
        (!columnFilters.thickness.length || columnFilters.thickness.includes(row.thickness     || '-')) &&
        (!columnFilters.orderType.length || normaliseOrderTypes(row).some(t => columnFilters.orderType.includes(t)))
      )
    })
  }, [columnFilters, searchQuery, sortedRows])

  const filterKey = useMemo(
    () => `${searchQuery}|${JSON.stringify(columnFilters)}`,
    [columnFilters, searchQuery]
  )

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(filteredRows, filterKey)

  // ── State helpers ────────────────────────────────────────────────────────────

  function updateDraft(field: keyof Draft, value: unknown) {
    setDraft(cur => ({
      ...cur,
      [field]: value,
      last_cost_field:
        field === 'cost_per_board_ex_gst' || field === 'cost_per_sqm_ex_gst'
          ? (field as string)
          : cur.last_cost_field,
    }))
  }

  function updateMaterialType(value: string) {
    const options = thicknessOptionsForMaterial(value)
    setDraft(cur => ({
      ...cur,
      material_type: value,
      thickness: options.includes(cur.thickness) ? cur.thickness : options[0] || '',
    }))
  }

  function toggleOrderType(value: string) {
    setDraft(cur => {
      const selected     = cur.order_types || []
      const nextSelected = selected.includes(value)
        ? selected.filter(i => i !== value)
        : [...selected, value]
      return {
        ...cur,
        order_types: nextSelected.length ? nextSelected : [value],
        order_type:  nextSelected[0] || value,
      }
    })
  }

  function openAddModal() {
    setDraft(emptyDraft)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setSelectedFileName('')
    setIsModalOpen(true)
  }

  function openEditModal(row: ColourRow) {
    setDraft({
      ...emptyDraft,
      ...row,
      id:                        row.id,
      image_url:                 row.image_url || '',
      image_path:                row.image_path || '',
      original_image_url:        row.image_url || '',
      preferred_board_width_mm:  row.preferred_board_width_mm  ?? '',
      preferred_board_height_mm: row.preferred_board_height_mm ?? '',
      cost_per_board_ex_gst:     row.cost_per_board_ex_gst     ?? '',
      cost_per_sqm_ex_gst:       row.cost_per_sqm_ex_gst       ?? '',
      last_cost_field:           null,
      order_types:               normaliseOrderTypes(row),
      is_active:                 row.is_active ?? true,
      supplier_name:             row.supplier_name || 'Polytec',
      material_type:             row.material_type || 'decorative board',
      thickness:                 row.thickness     || '18mm',
      finish_type:               row.finish_type   || '',
      order_type:                row.order_type    || 'supply board',
      sort_order:                row.sort_order    ?? '',
      name:                      row.name,
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
    setSelectedFileName('')
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSaving) return
    setIsModalOpen(false)
  }

  function toggleColumnFilter(column: keyof ColumnFilters, value: string) {
    setColumnFilters(cur => {
      const selected     = cur[column] || []
      const nextSelected = selected.includes(value)
        ? selected.filter(i => i !== value)
        : [...selected, value]
      return { ...cur, [column]: nextSelected }
    })
  }

  function clearColumnFilter(column: keyof ColumnFilters) {
    setColumnFilters(cur => ({ ...cur, [column]: [] }))
  }

  function clearAllFilters() {
    setColumnFilters({ supplier: [], finish: [], material: [], thickness: [], orderType: [] })
    setOpenFilter(null)
  }

  function toggleSelectedRow(id: string) {
    setSelectedRowIds(cur => cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id])
  }

  function toggleSelectedPage(checked: boolean) {
    const pageIds = pageItems.map(r => r.id)
    setSelectedRowIds(cur => {
      if (!checked) return cur.filter(id => !pageIds.includes(id))
      return Array.from(new Set([...cur, ...pageIds]))
    })
  }

  function sortOrderForDraft() {
    const current = Number(draft.sort_order)
    if (draft.id && Number.isFinite(current)) return current
    const matching  = rows.filter(r =>
      r.id !== draft.id &&
      String(r.material_type || '') === String(draft.material_type || '') &&
      String(r.thickness     || '') === String(draft.thickness     || '') &&
      String(r.finish_type   || '').trim().toLowerCase() === String(draft.finish_type || '').trim().toLowerCase()
    )
    const maxSort = matching.reduce((max, r) => {
      const v = Number(r.sort_order || 0)
      return Number.isFinite(v) && v > max ? v : max
    }, 0)
    return maxSort + 1
  }

  // ── Supabase actions ─────────────────────────────────────────────────────────

  async function uploadImage(file: File | null) {
    const imageUrl = draft.image_url.trim()
    if (!file) {
      return {
        imageUrl,
        imagePath: imageUrl === draft.original_image_url ? draft.image_path || null : null,
      }
    }
    const supabase = createSupabaseBrowserClient()
    const path     = `library/${Date.now()}-${cleanFileName(file.name)}`
    const { error } = await supabase.storage.from('colour-tiles').upload(path, file, {
      contentType: file.type || undefined,
      upsert:      false,
    })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('colour-tiles').getPublicUrl(path)
    return { imageUrl: publicUrl, imagePath: path }
  }

  async function saveRow(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.name.trim())        { toast({ title: 'Enter a colour name.',    variant: 'error' }); return }
    if (!draft.finish_type.trim()) { toast({ title: 'Enter a finish type.',    variant: 'error' }); return }
    if (!draft.material_type)      { toast({ title: 'Choose a material type.', variant: 'error' }); return }
    setIsSaving(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const image    = await uploadImage(fileInputRef.current?.files?.[0] || null)
      const payload  = rowFromDraft(draft, image, sortOrderForDraft())
      const query    = draft.id
        ? supabase.from('pcd_colour_library').update(payload).eq('id', draft.id)
        : supabase.from('pcd_colour_library').insert(payload)
      const { data, error } = await query.select('*').single()
      if (error) throw error
      setRows(cur =>
        draft.id
          ? cur.map(r => (r.id === data.id ? data : r))
          : [data, ...cur]
      )
      setDraft(emptyDraft)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSelectedFileName('')
      setIsModalOpen(false)
      toast({ title: draft.id ? 'Colour line updated.' : 'Colour line saved.', variant: 'success' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not save colour line.', variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteRow(row: ColourRow) {
    setIsSaving(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.from('pcd_colour_library').delete().eq('id', row.id)
      if (error) throw error
      setRows(cur => cur.filter(r => r.id !== row.id))
      setRowToDelete(null)
      toast({ title: 'Colour line deleted.', variant: 'success' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not delete colour line.', variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteSelectedRows() {
    if (!selectedRowIds.length) return
    setIsSaving(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.from('pcd_colour_library').delete().in('id', selectedRowIds)
      if (error) throw error
      setRows(cur => cur.filter(r => !selectedRowIds.includes(r.id)))
      setSelectedRowIds([])
      toast({ title: 'Selected colour lines deleted.', variant: 'success' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not delete selected colour lines.', variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  // ── Column filter renderer ────────────────────────────────────────────────────

  function renderColumnFilter(column: keyof ColumnFilters, label: string) {
    const options  = filterOptions[column] || []
    const selected = columnFilters[column] || []
    const isOpen   = openFilter === column

    return (
      <div className="relative flex items-center gap-1">
        <span>{label}</span>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setOpenFilter(isOpen ? null : column) }}
          aria-label={`Filter ${label}`}
          aria-expanded={isOpen}
          className={cn(
            'w-[18px] h-[18px] inline-flex items-center justify-center rounded text-[10px] border transition-colors flex-shrink-0',
            selected.length
              ? 'bg-[#1c2b1e] text-white border-[#1c2b1e]'
              : 'bg-white text-[#5a5a52] border-[#dbd8cc] hover:bg-[#f5f8f4]'
          )}
        >
          {selected.length ? (
            <span className="text-[9px] font-bold leading-none">{selected.length}</span>
          ) : (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
            </svg>
          )}
        </button>
        {isOpen && (
          <div
            className="absolute top-full left-0 z-50 mt-1 w-[200px] bg-white border border-[#dbd8cc] rounded-[6px] shadow-lg"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#edf4eb]">
              <span className="text-[11px] font-semibold text-[#5a5a52] uppercase tracking-[0.06em]">{label}</span>
              <button
                type="button"
                onClick={() => clearColumnFilter(column)}
                disabled={!selected.length}
                className="text-[11px] text-[#6b9e61] disabled:text-[#dbd8cc] hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="max-h-[200px] overflow-y-auto p-2 flex flex-col gap-0.5">
              {options.map(option => (
                <label
                  key={option}
                  className="flex items-center gap-2 px-2 py-[5px] rounded hover:bg-[#f5f8f4] cursor-pointer text-[12px] text-[#1a1a18]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggleColumnFilter(column, option)}
                    className="accent-[#6b9e61]"
                  />
                  <span className="truncate">{option}</span>
                </label>
              ))}
              {!options.length && <p className="text-[12px] text-[#8b8a81] px-2 py-1">No options</p>}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Add / edit modal (createPortal) ──────────────────────────────────────────

  const modal =
    isModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="colour-line-modal-title"
            onMouseDown={closeModal}
          >
            <form
              className="bg-white flex flex-col w-full h-[100dvh] rounded-none overflow-hidden md:h-auto md:max-h-[90vh] md:rounded-[12px] md:shadow-xl md:max-w-[640px]"
              onSubmit={saveRow}
              onMouseDown={e => e.stopPropagation()}
            >
              {/* Mobile header */}
              <div className="flex md:hidden items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0 border-b border-[#eef0f4]">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  aria-label="Go back"
                  className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-[#9ba7b8] hover:bg-[#eef0f4] hover:text-[#3d4d5f] transition-colors flex-shrink-0 disabled:opacity-50"
                >
                  ←
                </button>
                <h2 id="colour-line-modal-title" className="flex-1 text-center text-[15px] font-semibold text-[#1a1a18]">
                  {draft.id ? 'Edit colour line' : 'Add colour line'}
                </h2>
                <div className="w-[28px]" aria-hidden="true" />
              </div>

              {/* Desktop header */}
              <div className="hidden md:flex items-center gap-3 px-6 py-4 border-b border-[#edf4eb] flex-shrink-0">
                <div className="w-[36px] h-[36px] rounded-[8px] bg-[#1c2b1e] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  PCD
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.07em] text-[#8b8a81] font-semibold">Colour library</p>
                  <h2 className="text-[16px] font-bold text-[#1a1a18]">
                    {draft.id ? 'Edit colour line' : 'Add colour line'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className="h-[30px] px-3 text-[12px] text-[#5a5a52] border border-[#dbd8cc] rounded-[6px] hover:bg-[#f5f8f4] disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Colour name
                  <input className={inputClass} value={draft.name} onChange={e => updateDraft('name', e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Supplier
                  <input className={inputClass} value={draft.supplier_name} onChange={e => updateDraft('supplier_name', e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Material type
                  <select className={inputClass} value={draft.material_type} onChange={e => updateMaterialType(e.target.value)}>
                    {(COLOUR_MATERIALS as { key: string; value: string; label: string }[]).map(m => (
                      <option key={m.key} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Thickness
                  <select className={inputClass} value={draft.thickness} onChange={e => updateDraft('thickness', e.target.value)}>
                    {(thicknessOptionsForMaterial(draft.material_type) as string[]).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Finish type
                  <input
                    className={inputClass}
                    placeholder="e.g. Woodmatt"
                    value={draft.finish_type}
                    onChange={e => updateDraft('finish_type', e.target.value)}
                  />
                </label>
                <div className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  <span>Order type</span>
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    {(COLOUR_ORDER_TYPES as { value: string; label: string }[]).map(type => (
                      <label key={type.value} className="flex items-center gap-2 cursor-pointer text-[12px] text-[#1a1a18]">
                        <input
                          type="checkbox"
                          checked={(draft.order_types || []).includes(type.value)}
                          onChange={() => toggleOrderType(type.value)}
                          className="accent-[#6b9e61]"
                        />
                        {type.label}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Preferred board width (mm)
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="1"
                    value={draft.preferred_board_width_mm as string | number}
                    onChange={e => updateDraft('preferred_board_width_mm', e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Preferred board height (mm)
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="1"
                    value={draft.preferred_board_height_mm as string | number}
                    onChange={e => updateDraft('preferred_board_height_mm', e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Cost / board ex GST
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.cost_per_board_ex_gst as string | number}
                    onChange={e => updateDraft('cost_per_board_ex_gst', e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Cost / sqm ex GST
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.cost_per_sqm_ex_gst as string | number}
                    onChange={e => updateDraft('cost_per_sqm_ex_gst', e.target.value)}
                  />
                </label>
                <div className="md:col-span-2 flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  <span>Upload tile image</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="h-[34px] px-3 bg-white border border-[#dbd8cc] text-[12px] rounded-[6px] hover:bg-[#f5f8f4] flex-shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose file
                    </button>
                    <span className="text-[12px] text-[#8b8a81] truncate">
                      {selectedFileName || (draft.image_path ? 'Current uploaded image retained' : 'No file selected')}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => setSelectedFileName(e.target.files?.[0]?.name || '')}
                    />
                  </div>
                </div>
                <label className="md:col-span-2 flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                  Or image URL
                  <input
                    className={inputClass}
                    value={draft.image_url}
                    onChange={e => updateDraft('image_url', e.target.value)}
                  />
                </label>
                <label className="md:col-span-2 flex items-center gap-2 cursor-pointer text-[13px] text-[#1a1a18] font-normal">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={e => updateDraft('is_active', e.target.checked)}
                    className="accent-[#6b9e61]"
                  />
                  Active
                </label>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 border-t border-[#eef0f4] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] md:px-6 md:pt-4 md:pb-5">
                <div className="flex flex-col gap-2 w-full md:flex-row md:justify-end md:w-auto md:gap-3">
                  <button type="submit" className="h-[44px] md:h-[36px] w-full md:w-auto px-4 bg-[#2d9692] !text-white text-[13px] font-medium rounded-[8px] md:rounded-[6px] hover:bg-[#237775] disabled:opacity-50 transition-colors order-first md:order-last" disabled={isSaving}>
                    {isSaving ? 'Saving...' : draft.id ? 'Update colour line' : 'Save colour line'}
                  </button>
                  <button type="button" className="h-[44px] md:h-[36px] w-full md:w-auto px-4 bg-[#eef0f4] border border-[#dde1e9] text-[13px] font-medium rounded-[8px] md:rounded-[6px] text-[#3d4d5f] hover:bg-[#dde1e9] disabled:opacity-50 transition-colors" onClick={closeModal}>
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>,
          document.body
        )
      : null

  // ── Delete confirm modal ──────────────────────────────────────────────────────

  const deleteModal =
    rowToDelete && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-colour-title"
            onMouseDown={() => !isSaving && setRowToDelete(null)}
          >
            <div
              className="bg-white rounded-[12px] shadow-xl w-full max-w-[440px] overflow-hidden"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-6 py-4 border-b border-[#edf4eb]">
                <div className="w-[36px] h-[36px] rounded-[8px] bg-[#1c2b1e] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  PCD
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.07em] text-[#8b8a81] font-semibold">Delete colour line</p>
                  <h2 id="delete-colour-title" className="text-[16px] font-bold text-[#1a1a18]">
                    Delete {rowToDelete.name}?
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setRowToDelete(null)}
                  disabled={isSaving}
                  className="h-[30px] px-3 text-[12px] text-[#5a5a52] border border-[#dbd8cc] rounded-[6px] hover:bg-[#f5f8f4] disabled:opacity-50"
                >
                  Close
                </button>
              </div>
              <div className="px-6 py-5">
                <p className="text-[13px] text-[#5a5a52] leading-relaxed">
                  This removes the colour library database row only. Uploaded images are left in Supabase Storage so you can match them to new entries.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#edf4eb]">
                <button
                  type="button"
                  onClick={() => setRowToDelete(null)}
                  disabled={isSaving}
                  className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteRow(rowToDelete)}
                  disabled={isSaving}
                  className="h-[36px] px-4 bg-[#b42318] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#991b1b] disabled:opacity-50 transition-colors"
                >
                  {isSaving ? 'Deleting...' : 'Delete row'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[20px] font-bold text-[#1a1a18]">Colour Library</h1>
            <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage board colours, finishes and costs</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            {selectedRowIds.length > 0 ? (
              <button
                type="button"
                onClick={deleteSelectedRows}
                disabled={isSaving}
                className="text-[13px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
              >
                Delete {selectedRowIds.length} selected
              </button>
            ) : null}
            <input
              type="search"
              placeholder="Search by colour, finish, supplier, material or order type"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-[34px] border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#6b9e61] bg-white min-w-[260px] max-w-[400px]"
            />
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-[34px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4]"
              >
                Clear filters ({activeFilterCount})
              </button>
            )}
          </div>
          <button type="button" onClick={openAddModal} className={primaryBtn}>
            Add colour line
          </button>
        </div>

        {/* Table */}
        <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] whitespace-nowrap">
              <thead>
                <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                  <th className="w-[40px] px-4 py-[9px]">
                    <input
                      type="checkbox"
                      checked={pageItems.length > 0 && pageItems.every(r => selectedRowIds.includes(r.id))}
                      onChange={e => toggleSelectedPage(e.target.checked)}
                      aria-label="Select all visible colour lines"
                      className="accent-[#6b9e61]"
                    />
                  </th>
                  {['Tile', 'Colour'].map(col => (
                    <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                      {col}
                    </th>
                  ))}
                  <th className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                    {renderColumnFilter('supplier', 'Supplier')}
                  </th>
                  <th className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                    {renderColumnFilter('material', 'Material')}
                  </th>
                  <th className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                    {renderColumnFilter('thickness', 'Thickness')}
                  </th>
                  <th className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                    {renderColumnFilter('finish', 'Finish')}
                  </th>
                  <th className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                    {renderColumnFilter('orderType', 'Order type')}
                  </th>
                  {['Board size', 'Cost / board', 'Cost / sqm', 'Sort', 'Status', 'Actions'].map(col => (
                    <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map(row => (
                  <tr key={row.id} className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0">
                    <td className="px-4 py-[11px]">
                      <input
                        type="checkbox"
                        checked={selectedRowIds.includes(row.id)}
                        onChange={() => toggleSelectedRow(row.id)}
                        aria-label={`Select ${row.name}`}
                        className="accent-[#6b9e61]"
                      />
                    </td>
                    <td className="px-4 py-[11px]">
                      <span className="inline-flex w-[36px] h-[36px] rounded-[4px] overflow-hidden bg-[#f5f5f4] border border-[#edf4eb] flex-shrink-0">
                        {row.image_url ? (
                          <img src={row.image_url} alt="" className="w-full h-full object-cover" />
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-[11px] font-medium text-[#1a1a18]">{row.name}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{row.supplier_name || 'Polytec'}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{materialLabelForType(row.material_type)}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{row.thickness || '-'}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{row.finish_type || '-'}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{orderTypesLabel(row) || '-'}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{boardSizeLabel(row)}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">${Number(row.cost_per_board_ex_gst || 0).toFixed(2)}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">${Number(row.cost_per_sqm_ex_gst  || 0).toFixed(2)}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{row.sort_order || 0}</td>
                    <td className="px-4 py-[11px]">
                      <span className={cn(
                        'inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border',
                        row.is_active
                          ? 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
                          : 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]'
                      )}>
                        {row.is_active ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-4 py-[11px]">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          disabled={isSaving}
                          className="text-[12px] font-medium text-[#1c2b1e] hover:underline disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setRowToDelete(row)}
                          disabled={isSaving}
                          className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredRows.length && (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-[13px] text-[#8b8a81]">
                      {sortedRows.length
                        ? 'No colour lines match your search.'
                        : 'No colour lines yet. Add your first board colour entry.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <AdminPagination
            label="colour lines"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        </div>
      </div>

      {modal}
      {deleteModal}
    </>
  )
}
