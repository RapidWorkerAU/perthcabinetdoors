'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'
import { formatAdminLabel } from '../_utils/formatAdminLabel'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  id?:            string
  sort_order?:    number
  product_type?:  string
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
  pcd_quote_request_line_items?:   LineItem[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ['new', 'reviewing', 'waiting_on_customer', 'converted_to_quote', 'closed']
const FILTERS  = ['all', ...STATUSES]

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function sizeText(line: LineItem) {
  if (!line.width_mm && !line.height_mm) return '-'
  return `${line.width_mm || '-'} × ${line.height_mm || '-'} mm`
}

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
  const lineItems = [...(request.pcd_quote_request_line_items || [])].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
  )

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={request.customer_name || 'Quote request'}
      footer={
        request.converted_quote_id ? (
          <Button variant="secondary" onClick={() => onOpenQuote(request.converted_quote_id!)}>Open quote</Button>
        ) : (
          <Button variant="secondary" onClick={() => onConvert(request.id)}>Convert to quote</Button>
        )
      }
    >
      <div className="flex flex-col gap-5">

        {/* Order details */}
        <section>
          <h3 className="text-[13px] font-semibold text-[#1a1a18] mb-3">Order details</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
            {([
              { label: 'Name',          value: cleanValue(request.customer_name)   },
              { label: 'Email',         value: cleanValue(request.customer_email)  },
              { label: 'Phone',         value: cleanValue(request.customer_phone)  },
              { label: 'Suburb',        value: cleanValue(request.delivery_suburb) },
              { label: 'Cabinet brand', value: cleanValue(request.cabinet_brand)   },
              { label: 'Source',        value: request.source ? formatAdminLabel(request.source) : '-' },
            ] as { label: string; value: string }[]).map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-[#8b8a81] mb-[2px]">{label}</dt>
                <dd className="text-[#1a1a18]">{value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-[#8b8a81] mb-[2px]">Status</dt>
              <dd>
                <select
                  value={request.status || 'new'}
                  onChange={e => onUpdateStatus(request.id, e.target.value)}
                  disabled={isStatusLocked(request)}
                  className="h-[30px] border border-[#dbd8cc] rounded-[4px] bg-white text-[12px] text-[#1a1a18] px-2 outline-none focus:border-[#6b9e61] cursor-pointer"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{formatAdminLabel(s)}</option>)}
                </select>
              </dd>
            </div>
          </dl>
        </section>

        {/* Notes */}
        <section>
          <h3 className="text-[13px] font-semibold text-[#1a1a18] mb-2">Request notes</h3>
          <p className="text-[13px] text-[#5a5a52] leading-relaxed">{request.notes || 'No notes supplied.'}</p>
        </section>

        {/* Line items */}
        <section>
          <h3 className="text-[13px] font-semibold text-[#1a1a18] mb-2">Line items</h3>
          <div className="overflow-x-auto rounded-[6px] border border-[#dbd8cc]">
            <table className="w-full text-[12px] min-w-[820px]">
              <thead>
                <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                  {['#', 'Type', 'Material', 'Thickness', 'W × H', 'Finish', 'Colour', 'Qty', 'Edge', 'Profile', 'Hinges'].map(col => (
                    <th key={col} className="px-2 py-[7px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr><td colSpan={11} className="px-3 py-6 text-center text-[13px] text-[#8b8a81]">No line items were submitted with this request.</td></tr>
                ) : lineItems.map((line, i) => (
                  <tr key={line.id || i} className="border-b border-[#edf4eb] last:border-b-0">
                    <td className="px-2 py-[7px] text-[#8b8a81]">{i + 1}</td>
                    <td className="px-2 py-[7px] text-[#1a1a18] whitespace-nowrap">{cleanValue(line.product_type || line.product_name)}</td>
                    <td className="px-2 py-[7px] text-[#1a1a18]">{cleanValue(line.material)}</td>
                    <td className="px-2 py-[7px] text-[#1a1a18]">{cleanValue(line.thickness)}</td>
                    <td className="px-2 py-[7px] text-[#1a1a18] whitespace-nowrap">{sizeText(line)}</td>
                    <td className="px-2 py-[7px] text-[#1a1a18]">{cleanValue(line.finish)}</td>
                    <td className="px-2 py-[7px] text-[#1a1a18]">{cleanValue(line.colour)}</td>
                    <td className="px-2 py-[7px] text-[#1a1a18]">{line.qty || 1}</td>
                    <td className="px-2 py-[7px] text-[#1a1a18]">{cleanValue(line.edge_mould)}</td>
                    <td className="px-2 py-[7px] text-[#1a1a18] whitespace-nowrap">{[line.profile_type, line.profile].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="px-2 py-[7px]">
                      <div className="flex flex-col gap-[2px] text-[11px]">
                        <span className={line.hinge_holes ? 'text-[#2d5e28]' : 'text-[#8b8a81]'}>{line.hinge_holes ? '✓' : '×'} Drill holes</span>
                        <span className={line.hinge_supply ? 'text-[#2d5e28]' : 'text-[#8b8a81]'}>{line.hinge_supply ? '✓' : '×'} Supply hinges</span>
                        {line.hinge_qty ? <span className="text-[#8b8a81]">Qty {line.hinge_qty}</span> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </Modal>
  )
}

// ── QuoteRequestsManager ──────────────────────────────────────────────────────

export default function QuoteRequestsManager() {
  const router = useRouter()

  const [quoteRequests,            setQuoteRequests]            = React.useState<QuoteRequest[]>([])
  const [previewRequest,           setPreviewRequest]           = React.useState<QuoteRequest | null>(null)
  const [isLoading,                setIsLoading]                = React.useState(true)
  const [isDeleting,               setIsDeleting]               = React.useState(false)
  const [feedback,                 setFeedback]                 = React.useState('')
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
      if (payload.error) setFeedback(payload.error)
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => { loadQuoteRequests() }, [])

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
      setFeedback(payload.error || 'Could not update quote request.')
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
      router.push(`/admin/quotes/${payload.quoteId}`)
    } else {
      setFeedback(payload.error || 'Could not convert quote request.')
    }
  }

  async function deleteQuoteRequests(ids: string[]) {
    if (!ids.length) return
    setIsDeleting(true)
    setFeedback('')
    try {
      for (const id of ids) {
        const res     = await fetch(`/api/admin/quote-requests/${id}`, { method: 'DELETE' })
        const payload = await res.json()
        if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not delete quote request.')
      }
      setQuoteRequests(current => current.filter(r => !ids.includes(r.id)))
      setSelectedQuoteRequestIds(current => current.filter(id => !ids.includes(id)))
      setPreviewRequest(current => (current && ids.includes(current.id) ? null : current))
      setFeedback(`${ids.length} quote request${ids.length === 1 ? '' : 's'} deleted.`)
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Could not delete selected quote requests.')
    } finally {
      setIsDeleting(false)
    }
  }

  function toggleSelectedQuoteRequest(id: string) {
    setSelectedQuoteRequestIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  function toggleSelectedQuoteRequestPage(checked: boolean) {
    const pageIds = pageItems.map(r => r.id)
    setSelectedQuoteRequestIds(current => {
      if (!checked) return current.filter(id => !pageIds.includes(id))
      return Array.from(new Set([...current, ...pageIds]))
    })
  }

  const allPageSelected = pageItems.length > 0 && pageItems.every(r => selectedQuoteRequestIds.includes(r.id))

  return (
    <div className="p-4 md:p-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Quote Requests</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage incoming quote requests</p>
        </div>
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

      {feedback && (
        <div className="mb-4 px-4 py-3 rounded-[6px] bg-[#edf4eb] border border-[#a8c5a0] text-[13px] text-[#2d5e28]">
          {feedback}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#edf4eb]">
          {selectedQuoteRequestIds.length > 0 ? (
            <button
              type="button"
              onClick={() => deleteQuoteRequests(selectedQuoteRequestIds)}
              disabled={isDeleting}
              className="text-[13px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
            >
              Delete {selectedQuoteRequestIds.length} selected
            </button>
          ) : (
            <span className="text-[13px] text-[#8b8a81]">{visibleQuoteRequests.length} {visibleQuoteRequests.length === 1 ? 'request' : 'requests'}</span>
          )}
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
              <th className="w-[40px] px-4 py-[9px]">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={e => toggleSelectedQuoteRequestPage(e.target.checked)}
                  aria-label="Select all visible quote requests"
                  className="accent-[#6b9e61]"
                />
              </th>
              {['Customer', 'Suburb', 'Source', 'Items', 'Status', 'Received', ''].map(col => (
                <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="py-12 text-center text-[13px] text-[#8b8a81]">Loading...</td></tr>
            )}
            {!isLoading && !visibleQuoteRequests.length && (
              <tr><td colSpan={8} className="py-12 text-center text-[13px] text-[#8b8a81]">No quote requests match this filter.</td></tr>
            )}
            {pageItems.map(request => (
              <tr key={request.id} className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0">
                <td className="px-4 py-[11px]">
                  <input
                    type="checkbox"
                    checked={selectedQuoteRequestIds.includes(request.id)}
                    onChange={() => toggleSelectedQuoteRequest(request.id)}
                    aria-label={`Select quote request from ${request.customer_name || 'customer'}`}
                    className="accent-[#6b9e61]"
                  />
                </td>
                <td className="px-4 py-[11px] text-[13px] font-medium text-[#1a1a18]">{request.customer_name || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{request.delivery_suburb || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{formatAdminLabel(request.source || '-')}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{request.pcd_quote_request_line_items?.length || 0}</td>
                <td className="px-4 py-[11px]">
                  <select
                    value={request.status || 'new'}
                    onChange={e => updateStatus(request.id, e.target.value)}
                    disabled={isStatusLocked(request)}
                    className="h-[30px] border border-[#dbd8cc] rounded-[4px] bg-white text-[12px] text-[#1a1a18] px-2 outline-none focus:border-[#6b9e61] cursor-pointer disabled:opacity-60"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{formatAdminLabel(s)}</option>)}
                  </select>
                </td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18] whitespace-nowrap">{formatDate(request.created_at)}</td>
                <td className="px-4 py-[11px] text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setPreviewRequest(request)}
                      className="text-[12px] font-medium text-[#6b9e61] hover:underline"
                    >
                      Preview
                    </button>
                    {request.converted_quote_id ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/quotes/${request.converted_quote_id}`)}
                        className="text-[12px] font-medium text-[#6b9e61] hover:underline"
                      >
                        Open quote
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => convertToQuote(request.id)}
                        className="text-[12px] font-medium text-[#6b9e61] hover:underline"
                      >
                        Convert
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteQuoteRequests([request.id])}
                      disabled={isDeleting}
                      className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <AdminPagination
          label="quote requests"
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {isLoading && (
          <div className="py-12 text-center text-[13px] text-[#8b8a81]">Loading...</div>
        )}
        {!isLoading && !visibleQuoteRequests.length && (
          <div className="py-12 text-center text-[13px] text-[#8b8a81]">No quote requests match this filter.</div>
        )}
        {pageItems.map(request => (
          <div key={request.id} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[14px] font-semibold text-[#1a1a18]">{request.customer_name || '—'}</p>
                <p className="text-[12px] text-[#5a5a52]">{request.delivery_suburb || '—'}</p>
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
            <div className="flex items-center justify-between pt-3 border-t border-[#edf4eb] mt-3 gap-2">
              <button
                type="button"
                onClick={() => setPreviewRequest(request)}
                className="text-[12px] font-medium text-[#6b9e61] hover:underline"
              >
                Preview
              </button>
              {request.converted_quote_id ? (
                <button
                  type="button"
                  onClick={() => router.push(`/admin/quotes/${request.converted_quote_id!}`)}
                  className="text-[12px] font-medium text-[#6b9e61] hover:underline"
                >
                  Open quote
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => convertToQuote(request.id)}
                  className="text-[12px] font-medium text-[#6b9e61] hover:underline"
                >
                  Convert
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteQuoteRequests([request.id])}
                disabled={isDeleting}
                className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {totalItems > 0 && (
          <AdminPagination
            label="quote requests"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        )}
      </div>

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
