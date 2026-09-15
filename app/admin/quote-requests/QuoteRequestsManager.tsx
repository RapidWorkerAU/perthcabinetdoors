'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { IconArrowRight, IconEye, IconTrash } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { describeGaps, lineGaps } from '@/lib/pcd-quote-ready'
import { hingeCustomerLines } from '@/lib/pcd-hinges'
import { bandedEdgesText } from '@/lib/pcd-line-details'
import { ActionMenu, ActionMenuItem } from '@/components/ui/ActionMenu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'
import { formatAdminLabel } from '../_utils/formatAdminLabel'
import { useFocusedRow } from '../_utils/useFocusedRow'
import { useToast } from '@/components/ui/Toast'
import AdminLoading from '@/components/admin/AdminLoading'
import OrderFormActions from '../_components/OrderFormActions'
import { AdminDataTable, type AdminDataTableColumn } from '@/components/ui/AdminDataTable'
import { LIST_PAGE_SIZE, tableStyles } from '@/components/ui/table-styles'
import { sizeLabel } from '@/lib/pcd-size-label'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  id?:            string
  sort_order?:    number
  product_type?:  string
  panel_use?:     string
  banded_edges?:  string[]
  hole_type?:     string
  product_name?:  string
  material?:      string
  thickness?:     string
  width_mm?:      number
  height_mm?:     number
  finish?:        string
  colour?:        string
  qty?:           number
  edge_mould?:    string
  profile_type?:  string
  profile?:       string
  hinge_holes?:   boolean
  hinge_supply?:  boolean
  hinge_qty?:     number
  notes?:         string
  // The colour library row the customer picked, and its brand. Carried so the
  // conversion can price the line exactly instead of matching on a colour name.
  colour_library_id?: string | null
  supplier_name?:     string | null
}

interface QuoteRequest {
  id:                              string
  status?:                         string
  customer_name?:                  string
  customer_email?:                 string
  customer_phone?:                 string
  delivery_suburb?:                string
  source?:                         string
  cabinet_brand?:                  string
  notes?:                          string
  created_at?:                     string
  converted_quote_id?:             string | null
  design_project_id?:              string | null
  pcd_quote_request_line_items?:   LineItem[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ['new', 'reviewing', 'waiting_on_customer', 'converted_to_quote', 'closed']
const FILTERS  = ['all', ...STATUSES]

// ── Helpers ───────────────────────────────────────────────────────────────────

function incompleteLines(request: QuoteRequest) {
  const lines = request?.pcd_quote_request_line_items || []
  return lines
    .map((line, index) => ({ index, gaps: lineGaps(line, { requireSize: false }) }))
    .filter(entry => entry.gaps.length > 0)
}

function isStatusLocked(request: QuoteRequest) {
  return (request?.status || 'new') === 'converted_to_quote'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function cleanValue(value?: string | number | null) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

// The spec table pages like any other list of lines.
const LINE_PAGE_SIZE = LIST_PAGE_SIZE

// ── Preview modal ─────────────────────────────────────────────────────────────

function QuoteRequestPreviewModal({
  request, onClose, onConvert, onOpenQuote, onUpdateStatus,
}: {
  request:        QuoteRequest
  onClose:        () => void
  onConvert:      (id: string) => void
  onOpenQuote:    (quoteId: string) => void
  onUpdateStatus: (id: string, status: string) => void
}) {
  const incomplete = incompleteLines(request)
  const lineItems = React.useMemo(() => [...(request.pcd_quote_request_line_items || [])].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
  ), [request.pcd_quote_request_line_items])
  // Back to page one when a different request is opened.
  const linePage = useAdminPagination(lineItems, request.id, LINE_PAGE_SIZE)

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={request.customer_name || 'Quote request'}
      size="xl"
      footer={
        request.converted_quote_id ? (
          <Button variant="secondary" onClick={() => onOpenQuote(request.converted_quote_id!)}>Open quote</Button>
        ) : (
          <Button variant="secondary" onClick={() => onConvert(request.id)}>Convert to quote</Button>
        )
      }
    >
      <div className="flex flex-col gap-4">

        {/* Top section — two column: customer left, status + notes right */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3">

          {/* Customer contact card */}
          <div className="bg-[#f5f8f4] border border-[#dbd8cc] rounded-[8px] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-3">Customer</p>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              {([
                { label: 'Name',          value: cleanValue(request.customer_name)   },
                { label: 'Email',         value: cleanValue(request.customer_email)  },
                { label: 'Phone',         value: cleanValue(request.customer_phone)  },
                { label: 'Suburb',        value: cleanValue(request.delivery_suburb) },
                { label: 'Cabinet brand', value: cleanValue(request.cabinet_brand)   },
                { label: 'Source',        value: request.source ? formatAdminLabel(request.source) : '-' },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#8b8a81] mb-[2px]">{label}</dt>
                  <dd className="text-[13px] text-[#1a1a18]">{value}</dd>
                </div>
              ))}
            </dl>
            {request.design_project_id && (
              <div className="mt-3 pt-3 border-t border-[#dbd8cc]">
                <a
                  href={`/admin/design/${request.design_project_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-[#2f7a4d] underline"
                >
                  Open customer&apos;s design ↗
                </a>
                <p className="text-[11px] text-[#8b8a81] mt-1">Built in the website planner — open it and use Stage Quote to price it.</p>
              </div>
            )}
          </div>

          {/* Right column — status + notes stacked */}
          <div className="flex flex-col gap-3">
            <div className="bg-[#f5f8f4] border border-[#dbd8cc] rounded-[8px] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-2">Status</p>
              <select
                value={request.status || 'new'}
                onChange={e => onUpdateStatus(request.id, e.target.value)}
                disabled={isStatusLocked(request)}
                className="w-full h-[32px] border border-[#dbd8cc] rounded-[6px] bg-white text-[13px] text-[#1a1a18] px-2 outline-none focus:border-[#6b9e61] cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                {STATUSES.map(s => <option key={s} value={s}>{formatAdminLabel(s)}</option>)}
              </select>
            </div>
            <div className="bg-[#f5f8f4] border border-[#dbd8cc] rounded-[8px] p-4 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-2">Request notes</p>
              <p className="text-[12px] text-[#5a5a52] leading-relaxed">
                {request.notes || <span className="italic text-[#8b8a81]">No notes supplied.</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Line items table */}
        <div>
          {incomplete.length > 0 && (
            <div className="mb-2 px-3 py-2 rounded-[6px] border border-[#e7d3b0] bg-[#fdf7ec] text-[12px] text-[#7a5a2a] leading-[1.5]">
              <strong className="font-semibold">
                {incomplete.length} line{incomplete.length === 1 ? '' : 's'} cannot be priced as submitted.
              </strong>{' '}
              Confirm {incomplete.length === 1 ? 'it' : 'them'} with the customer before quoting:{' '}
              {incomplete.map(entry => `line ${entry.index + 1} needs ${describeGaps(entry.gaps)}`).join('; ')}.
              The form now asks for all of this up front, so newer requests arrive complete.
            </div>
          )}
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-2">Line items</p>
          {/* The shared table look, paged ten lines at a time. A note is a second
              row under its line, so the pair shares one row line: the line's own
              cells drop theirs and the note's cells carry it. */}
          <div className={tableStyles.card}>
          <div className={tableStyles.sideScroll}>
            <table className={tableStyles.tableWide}>
              <thead>
                <tr>
                  {['#', 'Type', 'Material', 'Thickness', 'Size (H × W)', 'Finish', 'Colour', 'Qty', 'Edge', 'Profile', 'Hinges'].map(col => (
                    <th key={col} className={tableStyles.th}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={tableStyles.body}>
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className={tableStyles.empty}>
                      No line items were submitted with this request.
                    </td>
                  </tr>
                ) : linePage.pageItems.map((line, pageIndex) => {
                  const i = (linePage.page - 1) * LINE_PAGE_SIZE + pageIndex
                  const cell = cn(tableStyles.td, line.notes && 'border-b-0')
                  return (
                  <React.Fragment key={line.id || i}>
                  <tr>
                    <td className={cn(cell, 'text-[#8b8a81]')}>{i + 1}</td>
                    <td className={cn(cell, 'whitespace-nowrap font-medium')}>
                      {cleanValue(line.panel_use || line.product_type || line.product_name)}
                      {line.panel_use && (
                        <span className="ml-1.5 text-[10px] font-normal text-[#8b8a81]">panel</span>
                      )}
                    </td>
                    <td className={cell}>{cleanValue(line.material)}</td>
                    <td className={cell}>{cleanValue(line.thickness)}</td>
                    <td className={cn(cell, 'whitespace-nowrap')}>{sizeLabel(line.height_mm, line.width_mm)}</td>
                    <td className={cell}>{cleanValue(line.finish)}</td>
                    <td className={cell}>{cleanValue(line.colour)}</td>
                    <td className={cn(cell, tableStyles.num)}>{line.qty || 1}</td>
                    <td className={cell}>
                      {cleanValue(line.edge_mould)}
                      {/* WHICH EDGES ARE BANDED, in the same words the quote, the
                          order and the customer's copy use. Anything less than
                          all four is amber: it is the thing somebody has to
                          notice before they cut. */}
                      {bandedEdgesText(line.banded_edges) && (
                        <span className={`block text-[10px] ${Array.isArray(line.banded_edges) && line.banded_edges.length < 4 ? 'text-[#8a6d0b]' : 'text-[#8b8a81]'}`}>
                          {bandedEdgesText(line.banded_edges)}
                        </span>
                      )}
                    </td>
                    <td className={cn(cell, 'whitespace-nowrap')}>
                      {[line.profile_type, line.profile].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className={cell}>
                      {/* THE DRILLING, in the words the customer's quote uses:
                          how many, which side, which boring and where the cups
                          go. Only a door is drilled, so anything else says so.
                          This used to append "hinges" to a count that already
                          said it ("2 hinges hinges"), and put the boring under
                          the edge. Supply is gone: we drill, we do not supply. */}
                      {line.product_type === 'Door' ? (
                        <div className="flex flex-col gap-[2px] text-[11px]">
                          {hingeCustomerLines(line).map((detail, index) => (
                            <span key={detail} className={index === 0 && line.hinge_holes ? 'text-[#2d5e28] font-medium' : 'text-[#8b8a81]'}>
                              {detail}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#8b8a81]">-</span>
                      )}
                    </td>
                  </tr>
                  {/* The note becomes the line's description on the quote, and
                      for a design it is the brief someone configures from, so
                      it belongs here rather than only in the database. */}
                  {line.notes ? (
                    <tr>
                      <td className={cn(tableStyles.td, 'pt-0')} />
                      <td colSpan={10} className={cn(tableStyles.td, 'pt-0 text-[12px] leading-relaxed text-[#5a5a52]')}>
                        {line.notes}
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {lineItems.length > 0 && (
            <AdminPagination
              label="lines"
              page={linePage.page}
              pageCount={linePage.pageCount}
              totalItems={linePage.totalItems}
              onPageChange={linePage.setPage}
            />
          )}
          </div>
        </div>

      </div>
    </Modal>
  )
}

// ── QuoteRequestsManager ──────────────────────────────────────────────────────

export default function QuoteRequestsManager() {
  const router = useRouter()

  const [quoteRequests,            setQuoteRequests]            = React.useState<QuoteRequest[]>([])
  const [previewRequest,           setPreviewRequest]           = React.useState<QuoteRequest | null>(null)
  const { toast } = useToast()
  const [isLoading,                setIsLoading]                = React.useState(true)
  const [isDeleting,               setIsDeleting]               = React.useState(false)
  const [statusFilter,             setStatusFilter]             = React.useState('new')
  const [selectedQuoteRequestIds,  setSelectedQuoteRequestIds]  = React.useState<string[]>([])

  const statusCounts = React.useMemo(() => {
    return quoteRequests.reduce<Record<string, number>>(
      (counts, request) => {
        const status = request.status || 'new'
        counts.all = (counts.all || 0) + 1
        counts[status] = (counts[status] || 0) + 1
        return counts
      },
      { all: 0 }
    )
  }, [quoteRequests])

  const visibleQuoteRequests = React.useMemo(() => {
    if (statusFilter === 'all') return quoteRequests
    return quoteRequests.filter(r => (r.status || 'new') === statusFilter)
  }, [quoteRequests, statusFilter])

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(visibleQuoteRequests, statusFilter)

  async function loadQuoteRequests() {
    setIsLoading(true)
    try {
      const res     = await fetch('/api/admin/quote-requests', { cache: 'no-store' })
      const payload = await res.json()
      setQuoteRequests(payload.quoteRequests || [])
      if (payload.error) toast({ title: payload.error, variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => { loadQuoteRequests() }, [])

  // Arrived from the dashboard queue, which named one request. Open its preview,
  // where Convert to quote is, and drop the filter to All first so the row is
  // still there behind the modal when it closes.
  useFocusedRow(
    quoteRequests,
    React.useCallback((request: QuoteRequest) => {
      setStatusFilter('all')
      setPreviewRequest(request)
    }, []),
  )

  async function updateStatus(id: string, status: string) {
    const res     = await fetch(`/api/admin/quote-requests/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    })
    const payload = await res.json()
    if (res.ok && payload.ok) {
      setQuoteRequests(current => current.map(item => item.id === id ? payload.quoteRequest : item))
      setPreviewRequest(current => current?.id === id ? payload.quoteRequest : current)
    } else {
      toast({ title: payload.error || 'Could not update quote request.', variant: 'error' })
    }
  }

  async function convertToQuote(id: string) {
    const res     = await fetch('/api/admin/quote-requests', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'convert_to_quote', id }),
    })
    const payload = await res.json()
    if (res.ok && payload.ok) {
      // Lines are priced from the colour library during the conversion. Say so
      // when some could not be matched, so nothing sits at $0 unnoticed.
      //
      // Made-to-order lines are said separately and calmly. They have no rate to
      // match against and never will, so calling them a failure sent people
      // looking for a price that does not exist.
      if (payload.unpricedCount > 0) {
        toast({
          title: `${payload.unpricedCount} of ${payload.lineCount} lines could not be matched to a library colour. Check the cost on those lines.`,
          variant: 'error',
        })
      }
      if (payload.madeToOrderCount > 0) {
        toast({
          title: `${payload.madeToOrderCount} line${payload.madeToOrderCount === 1 ? ' is' : 's are'} made to order. Price ${payload.madeToOrderCount === 1 ? 'it' : 'them'} from the supplier's quote.`,
        })
      }
      router.push(`/admin/quotes/${payload.quoteId}`)
    } else {
      toast({ title: payload.error || 'Could not convert quote request.', variant: 'error' })
    }
  }

  async function deleteQuoteRequests(ids: string[]) {
    if (!ids.length) return
    setIsDeleting(true)
    try {
      for (const id of ids) {
        const res     = await fetch(`/api/admin/quote-requests/${id}`, { method: 'DELETE' })
        const payload = await res.json()
        if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not delete quote request.')
      }
      setQuoteRequests(current => current.filter(r => !ids.includes(r.id)))
      setSelectedQuoteRequestIds(current => current.filter(id => !ids.includes(id)))
      setPreviewRequest(current => (current && ids.includes(current.id) ? null : current))
      toast({ title: `${ids.length} quote request${ids.length === 1 ? '' : 's'} deleted.`, variant: 'success' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not delete selected quote requests.', variant: 'error' })
    } finally {
      setIsDeleting(false)
    }
  }

  const columns: AdminDataTableColumn<QuoteRequest>[] = [
    { id: 'customer', header: 'Customer', className: 'font-medium', cell: request => request.customer_name || '-' },
    { id: 'suburb',   header: 'Suburb',   cell: request => request.delivery_suburb || '-' },
    { id: 'source',   header: 'Source',   cell: request => formatAdminLabel(request.source || '-') },
    {
      id: 'items',
      header: 'Items',
      cell: request => (
        <>
          {request.pcd_quote_request_line_items?.length || 0}
          {incompleteLines(request).length > 0 && (
            <span
              title="Some lines cannot be priced as submitted. Open the request to see what is missing."
              className="ml-2 inline-flex items-center px-2 py-[1px] rounded-full text-[10px] font-semibold bg-[#fdf7ec] text-[#7a5a2a] border border-[#e7d3b0] align-middle"
            >
              {incompleteLines(request).length} to confirm
            </span>
          )}
        </>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: request => (
        // Changing the status is not opening the request.
        <div onClick={e => e.stopPropagation()}>
          <select
            value={request.status || 'new'}
            onChange={e => updateStatus(request.id, e.target.value)}
            disabled={isStatusLocked(request)}
            className="h-[30px] border border-[#dbd8cc] rounded-[4px] bg-white text-[12px] text-[#1a1a18] px-2 outline-none focus:border-[#6b9e61] cursor-pointer disabled:opacity-60"
          >
            {STATUSES.map(s => <option key={s} value={s}>{formatAdminLabel(s)}</option>)}
          </select>
        </div>
      ),
    },
    { id: 'received', header: 'Received', className: 'whitespace-nowrap', cell: request => formatDate(request.created_at) },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: request => (
        <div className="flex justify-end">
          <ActionMenu label={`Open actions for quote request from ${request.customer_name || 'customer'}`}>
            <ActionMenuItem icon={<IconEye size={14} />} onClick={() => setPreviewRequest(request)}>
              Preview
            </ActionMenuItem>
            {request.converted_quote_id ? (
              <ActionMenuItem icon={<IconArrowRight size={14} />} onClick={() => router.push(`/admin/quotes/${request.converted_quote_id}`)}>
                Open quote
              </ActionMenuItem>
            ) : (
              <ActionMenuItem icon={<IconArrowRight size={14} />} onClick={() => convertToQuote(request.id)}>
                Convert
              </ActionMenuItem>
            )}
            <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isDeleting} onClick={() => deleteQuoteRequests([request.id])}>
              Delete
            </ActionMenuItem>
          </ActionMenu>
        </div>
      ),
    },
  ]

  // First load owns the whole content area. A refresh with requests already on
  // screen leaves them there rather than blanking the page.
  if (isLoading && !quoteRequests.length) {
    return <AdminLoading steps={['Loading quote requests', 'Almost there']} label="Loading quote requests" />
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Quote Requests</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage incoming quote requests</p>
        </div>
        <OrderFormActions />
      </div>

      {/* Status filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(status => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={cn(
              'flex items-center gap-2 px-3 py-[6px] rounded-full text-[12px] font-medium border transition-colors',
              statusFilter === status
                ? 'bg-[#1c2b1e] text-white border-[#1c2b1e]'
                : 'bg-white text-[#5a5a52] border-[#dbd8cc] hover:bg-[#f5f8f4]'
            )}
          >
            {status === 'all' ? 'All' : formatAdminLabel(status)}
            <span className={cn(
              'text-[11px] font-semibold px-[5px] py-[1px] rounded-full',
              statusFilter === status ? 'bg-white/20 text-white' : 'bg-[#edf4eb] text-[#2d5e28]'
            )}>
              {statusCounts[status] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* The shared list table, the same as Enquiries: it scrolls sideways
          rather than crushing its columns, which this one used to do. */}
      <AdminDataTable<QuoteRequest>
        wide
        rows={pageItems}
        columns={columns}
        getRowId={request => request.id}
        getRowLabel={request => `quote request from ${request.customer_name || 'customer'}`}
        onRowClick={request => setPreviewRequest(request)}
        selectedIds={selectedQuoteRequestIds}
        onSelectedIdsChange={setSelectedQuoteRequestIds}
        bulkActions={selectedQuoteRequestIds.length > 0 ? (
          <button
            type="button"
            onClick={() => deleteQuoteRequests(selectedQuoteRequestIds)}
            disabled={isDeleting}
            className="text-[13px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
          >
            Delete {selectedQuoteRequestIds.length} selected
          </button>
        ) : (
          <span className={tableStyles.meta}>{visibleQuoteRequests.length} {visibleQuoteRequests.length === 1 ? 'request' : 'requests'}</span>
        )}
        emptyTitle="No quote requests match this filter."
        pagination={
          <AdminPagination
            label="quote requests"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        }
        mobileCard={request => (
          <div className={tableStyles.mobileCard}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[14px] font-semibold text-[#1a1a18]">{request.customer_name || '-'}</p>
                <p className="text-[12px] text-[#5a5a52]">{request.delivery_suburb || '-'}</p>
              </div>
              <select
                value={request.status || 'new'}
                onChange={e => updateStatus(request.id, e.target.value)}
                disabled={isStatusLocked(request)}
                className="h-[30px] border border-[#dbd8cc] rounded-[4px] bg-white text-[12px] text-[#1a1a18] px-2 outline-none focus:border-[#6b9e61] cursor-pointer"
              >
                {STATUSES.map(s => <option key={s} value={s}>{formatAdminLabel(s)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] mb-3">
              <div><span className="text-[#8b8a81]">Source</span><p className="text-[#1a1a18]">{formatAdminLabel(request.source || '-')}</p></div>
              <div><span className="text-[#8b8a81]">Items</span><p className="text-[#1a1a18]">{request.pcd_quote_request_line_items?.length || 0}</p></div>
              <div><span className="text-[#8b8a81]">Received</span><p className="text-[#1a1a18]">{formatDate(request.created_at)}</p></div>
            </div>
            <div className="flex items-center justify-end pt-3 border-t border-[#edf4eb] mt-3">
              <ActionMenu label={`Open actions for quote request from ${request.customer_name || 'customer'}`}>
                <ActionMenuItem icon={<IconEye size={14} />} onClick={() => setPreviewRequest(request)}>
                  Preview
                </ActionMenuItem>
              {request.converted_quote_id ? (
                <ActionMenuItem icon={<IconArrowRight size={14} />} onClick={() => router.push(`/admin/quotes/${request.converted_quote_id!}`)}>
                  Open quote
                </ActionMenuItem>
              ) : (
                <ActionMenuItem icon={<IconArrowRight size={14} />} onClick={() => convertToQuote(request.id)}>
                  Convert
                </ActionMenuItem>
              )}
                <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isDeleting} onClick={() => deleteQuoteRequests([request.id])}>
                  Delete
                </ActionMenuItem>
              </ActionMenu>
            </div>
          </div>
        )}
      />

      {/* Preview modal */}
      {previewRequest && (
        <QuoteRequestPreviewModal
          request={previewRequest}
          onClose={() => setPreviewRequest(null)}
          onConvert={convertToQuote}
          onOpenQuote={id => router.push(`/admin/quotes/${id}`)}
          onUpdateStatus={updateStatus}
        />
      )}
    </div>
  )
}
