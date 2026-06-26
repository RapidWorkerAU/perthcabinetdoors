'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '../../../lib/pcd-quote-utils'
import { formatAdminLabel } from '../_utils/formatAdminLabel'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'
import { cn } from '@/lib/utils'

const STATUSES = ['draft', 'sent', 'viewed', 'approved', 'rejected']
const FILTERS  = ['all', ...STATUSES]

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function getStatusClass(status?: string | null) {
  if (status === 'approved') return 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
  if (status === 'rejected') return 'bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]'
  return 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]'
}

function suburbFromAddress(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return '-'
  const parts = text.split(',').map(p => p.trim()).filter(Boolean)
  return parts[parts.length - 1] || text
}

interface Quote {
  id:             string
  quote_number?:  string | null
  access_code?:   string | null
  status?:        string | null
  customer_name?: string | null
  site_address?:  string | null
  total_inc_gst?: number | null
  currency?:      string | null
  updated_at?:    string | null
  created_at?:    string | null
  pcd_customers?: { site_address?: string | null } | null
}

function quoteCustomerSuburb(quote: Quote) {
  return suburbFromAddress(quote?.pcd_customers?.site_address || quote?.site_address)
}

export default function QuotesTable() {
  const router = useRouter()
  const [quotes,            setQuotes]            = useState<Quote[]>([])
  const [isLoading,         setIsLoading]         = useState(true)
  const [isCreating,        setIsCreating]        = useState(false)
  const [duplicatingQuoteId, setDuplicatingQuoteId] = useState('')
  const [isDeleting,        setIsDeleting]        = useState(false)
  const [feedback,          setFeedback]          = useState('')
  const [setupRequired,     setSetupRequired]     = useState(false)
  const [statusFilter,      setStatusFilter]      = useState('draft')
  const [selectedQuoteIds,  setSelectedQuoteIds]  = useState<string[]>([])

  const statusCounts = useMemo(() => {
    return quotes.reduce<Record<string, number>>(
      (counts, quote) => {
        const status = quote.status || 'draft'
        counts.all = (counts.all || 0) + 1
        counts[status] = (counts[status] || 0) + 1
        return counts
      },
      { all: 0 }
    )
  }, [quotes])

  const visibleQuotes = useMemo(() => {
    if (statusFilter === 'all') return quotes
    return quotes.filter(q => (q.status || 'draft') === statusFilter)
  }, [quotes, statusFilter])

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(visibleQuotes, statusFilter)

  async function loadQuotes() {
    setIsLoading(true)
    setFeedback('')
    try {
      const response = await fetch('/api/admin/quotes', { cache: 'no-store' })
      const payload  = await response.json()
      setSetupRequired(!!payload.setupRequired)
      setQuotes(payload.quotes || [])
      if (payload.error) setFeedback(payload.error)
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Could not load quotes.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadQuotes() }, [])

  async function createQuote() {
    setIsCreating(true)
    setFeedback('')
    try {
      const response = await fetch('/api/admin/quotes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:    'Cabinetry Quote',
          currency: 'AUD',
          gst_rate: 0.1,
          terms:    'Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.',
          lines:    [],
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok || !payload.quote?.id) {
        setFeedback(payload.error || 'Could not create quote.')
        return
      }
      router.push(`/admin/quotes/${payload.quote.id}`)
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Could not create quote.')
    } finally {
      setIsCreating(false)
    }
  }

  async function duplicateQuote(quoteId: string) {
    setDuplicatingQuoteId(quoteId)
    setFeedback('')
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/duplicate`, { method: 'POST' })
      const payload  = await response.json()
      if (!response.ok || !payload.ok || !payload.quote?.id) {
        setFeedback(payload.error || 'Could not duplicate quote.')
        return
      }
      router.push(`/admin/quotes/${payload.quote.id}`)
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Could not duplicate quote.')
    } finally {
      setDuplicatingQuoteId('')
    }
  }

  async function deleteQuotes(ids: string[]) {
    if (!ids.length) return
    setIsDeleting(true)
    setFeedback('')
    try {
      for (const id of ids) {
        const response = await fetch(`/api/admin/quotes/${id}`, { method: 'DELETE' })
        const payload  = await response.json()
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not delete quote.')
      }
      setQuotes(current => current.filter(q => !ids.includes(q.id)))
      setSelectedQuoteIds(current => current.filter(id => !ids.includes(id)))
      setFeedback(`${ids.length} quote${ids.length === 1 ? '' : 's'} deleted.`)
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Could not delete selected quotes.')
    } finally {
      setIsDeleting(false)
    }
  }

  function toggleSelectedQuote(id: string) {
    setSelectedQuoteIds(current => current.includes(id) ? current.filter(i => i !== id) : [...current, id])
  }

  function toggleSelectedPage(checked: boolean) {
    const pageIds = pageItems.map(q => q.id)
    setSelectedQuoteIds(current => {
      if (!checked) return current.filter(id => !pageIds.includes(id))
      return Array.from(new Set([...current, ...pageIds]))
    })
  }

  const allPageSelected = pageItems.length > 0 && pageItems.every(q => selectedQuoteIds.includes(q.id))

  return (
    <div className="p-4 md:p-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Quotes</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage your quote pipeline</p>
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

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {selectedQuoteIds.length > 0 ? (
            <button
              type="button"
              onClick={() => deleteQuotes(selectedQuoteIds)}
              disabled={isDeleting}
              className="text-[13px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
            >
              Delete {selectedQuoteIds.length} selected
            </button>
          ) : (
            <span className="text-[13px] text-[#8b8a81]">
              {visibleQuotes.length} {visibleQuotes.length === 1 ? 'quote' : 'quotes'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={createQuote}
          disabled={isCreating}
          className="h-[34px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors"
        >
          {isCreating ? 'Creating...' : 'New quote'}
        </button>
      </div>

      {setupRequired && (
        <div className="mb-4 px-4 py-3 rounded-[6px] bg-[#fffbeb] border border-[#fcd34d] text-[13px] text-[#92400e]">
          Install <code className="font-mono text-[12px]">supabase/quote_project_workflow_setup.sql</code> before saving quotes.
        </div>
      )}
      {feedback && (
        <div className="mb-4 px-4 py-3 rounded-[6px] bg-[#fef2f2] border border-[#fca5a5] text-[13px] text-[#991b1b]">
          {feedback}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                <th className="w-[40px] px-4 py-[9px]">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={e => toggleSelectedPage(e.target.checked)}
                    aria-label="Select all visible quotes"
                    className="accent-[#6b9e61]"
                  />
                </th>
                {['Quote', 'Access code', 'Customer', 'Suburb', 'Status', 'Total', 'Updated', 'Actions'].map(col => (
                  <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="py-12 text-center text-[13px] text-[#8b8a81]">Loading quotes...</td></tr>
              )}
              {!isLoading && !visibleQuotes.length && (
                <tr><td colSpan={9} className="py-12 text-center text-[13px] text-[#8b8a81]">No quotes match this filter.</td></tr>
              )}
              {pageItems.map(quote => {
                const status = quote.status || 'draft'
                return (
                  <tr
                    key={quote.id}
                    className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0 cursor-pointer"
                    onClick={() => router.push(`/admin/quotes/${quote.id}`)}
                  >
                    <td className="px-4 py-[11px]" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedQuoteIds.includes(quote.id)}
                        onChange={() => toggleSelectedQuote(quote.id)}
                        aria-label={`Select quote ${quote.quote_number || quote.id}`}
                        className="accent-[#6b9e61]"
                      />
                    </td>
                    <td className="px-4 py-[11px] font-medium text-[#1a1a18]">{quote.quote_number}</td>
                    <td className="px-4 py-[11px]">
                      <code className="font-mono text-[11px] bg-[#f5f8f4] border border-[#dbd8cc] px-2 py-[2px] rounded-[4px]">
                        {quote.access_code || '-'}
                      </code>
                    </td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{quote.customer_name || '-'}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{quoteCustomerSuburb(quote)}</td>
                    <td className="px-4 py-[11px]">
                      <span className={cn(
                        'inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border',
                        getStatusClass(status)
                      )}>
                        {status.replace(/^./, char => char.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{formatMoney(quote.total_inc_gst, quote.currency || 'AUD')}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18] whitespace-nowrap">{formatDate(quote.updated_at || quote.created_at)}</td>
                    <td className="px-4 py-[11px]" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/quotes/${quote.id}`)}
                          className="text-[12px] font-medium text-[#1c2b1e] hover:underline"
                        >
                          Open
                        </button>
                        {quote.access_code && (
                          <a
                            href={`/quotes/view?code=${encodeURIComponent(quote.access_code)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[12px] font-medium text-[#1c2b1e] hover:underline"
                          >
                            View
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => duplicateQuote(quote.id)}
                          disabled={duplicatingQuoteId === quote.id}
                          className="text-[12px] font-medium text-[#1c2b1e] hover:underline disabled:opacity-50"
                        >
                          {duplicatingQuoteId === quote.id ? 'Duplicating...' : 'Duplicate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteQuotes([quote.id])}
                          disabled={isDeleting}
                          className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <AdminPagination
          label="quotes"
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {isLoading && (
          <div className="py-12 text-center text-[13px] text-[#8b8a81]">Loading quotes...</div>
        )}
        {!isLoading && !visibleQuotes.length && (
          <div className="py-12 text-center text-[13px] text-[#8b8a81]">No quotes match this filter.</div>
        )}
        {pageItems.map(quote => {
          const status = quote.status || 'draft'
          return (
            <article key={quote.id} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-[0.07em] text-[#8b8a81] font-semibold mb-1">Quote</p>
                <p className="text-[15px] font-semibold text-[#1a1a18]">{quote.quote_number || 'Draft quote'}</p>
                <p className="text-[13px] text-[#5a5a52]">{quote.customer_name || 'No customer'}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] mb-3">
                <div>
                  <dt className="text-[#8b8a81]">Access code</dt>
                  <dd>
                    <code className="font-mono text-[11px] bg-[#f5f8f4] border border-[#dbd8cc] px-2 py-[2px] rounded-[4px]">
                      {quote.access_code || '-'}
                    </code>
                  </dd>
                </div>
                <div><dt className="text-[#8b8a81]">Suburb</dt><dd className="text-[#1a1a18]">{quoteCustomerSuburb(quote)}</dd></div>
                <div>
                  <dt className="text-[#8b8a81]">Status</dt>
                  <dd>
                    <span className={cn(
                      'inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border',
                      getStatusClass(status)
                    )}>
                      {status.replace(/^./, char => char.toUpperCase())}
                    </span>
                  </dd>
                </div>
                <div><dt className="text-[#8b8a81]">Total</dt><dd className="text-[#1a1a18]">{formatMoney(quote.total_inc_gst, quote.currency || 'AUD')}</dd></div>
                <div><dt className="text-[#8b8a81]">Updated</dt><dd className="text-[#1a1a18]">{formatDate(quote.updated_at || quote.created_at)}</dd></div>
              </dl>
              <div className="pt-3 border-t border-[#edf4eb] flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/admin/quotes/${quote.id}`)}
                  className="h-[34px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors"
                >
                  Open
                </button>
                {quote.access_code && (
                  <a
                    href={`/quotes/view?code=${encodeURIComponent(quote.access_code)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-[34px] px-4 border border-[#dbd8cc] text-[#1a1a18] text-[13px] font-medium rounded-[6px] hover:bg-[#f5f8f4] transition-colors flex items-center"
                  >
                    View
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => duplicateQuote(quote.id)}
                  disabled={duplicatingQuoteId === quote.id}
                  className="h-[34px] px-4 border border-[#dbd8cc] text-[#1a1a18] text-[13px] font-medium rounded-[6px] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors"
                >
                  {duplicatingQuoteId === quote.id ? 'Duplicating...' : 'Duplicate'}
                </button>
              </div>
            </article>
          )
        })}
        {totalItems > 0 && (
          <AdminPagination
            label="quotes"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  )
}
