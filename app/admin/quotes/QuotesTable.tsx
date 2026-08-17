'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCopy, IconExternalLink, IconFileText, IconPlus, IconTrash } from '@tabler/icons-react'
import { formatMoney } from '../../../lib/pcd-quote-utils'
import { formatAdminLabel } from '../_utils/formatAdminLabel'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'
import { ActionMenu, ActionMenuItem } from '@/components/ui/ActionMenu'
import { AdminPageHeader } from '@/components/ui/AdminPageHeader'
import { BulkActionBar } from '@/components/ui/BulkActionBar'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/Modal'
import { StatusFilterBar, type StatusFilterOption } from '@/components/ui/StatusFilterBar'
import { StatusPill } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toast'
import AdminLoading from '@/components/admin/AdminLoading'

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
  const { toast } = useToast()
  const [quotes,            setQuotes]            = useState<Quote[]>([])
  const [isLoading,         setIsLoading]         = useState(true)
  const [isCreating,        setIsCreating]        = useState(false)
  const [duplicatingQuoteId, setDuplicatingQuoteId] = useState('')
  const [isDeleting,        setIsDeleting]        = useState(false)
  const [setupRequired,     setSetupRequired]     = useState(false)
  const [statusFilter,      setStatusFilter]      = useState('draft')
  const [selectedQuoteIds,  setSelectedQuoteIds]  = useState<string[]>([])
  const [confirmDeleteIds,  setConfirmDeleteIds]  = useState<string[]>([])

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

  const statusFilterOptions = useMemo<StatusFilterOption[]>(() => (
    FILTERS.map(status => ({
      value: status,
      label: status === 'all' ? 'All' : formatAdminLabel(status),
      count: statusCounts[status] || 0,
    }))
  ), [statusCounts])

  const loadQuotes = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/quotes', { cache: 'no-store' })
      const payload  = await response.json()
      setSetupRequired(!!payload.setupRequired)
      setQuotes(payload.quotes || [])
      if (payload.error) toast({ title: payload.error, variant: 'error' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not load quotes.', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => { loadQuotes() }, [loadQuotes])

  async function createQuote() {
    setIsCreating(true)
    try {
      const response = await fetch('/api/admin/quotes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        // Currency, GST rate and terms are deliberately NOT sent. The server
        // fills each from Business Defaults when the field is absent, and it
        // uses "whatever the caller sent wins" precedence, so sending values
        // from here overrode the configured settings on every new quote.
        body: JSON.stringify({
          title: 'Cabinetry Quote',
          lines: [],
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok || !payload.quote?.id) {
        toast({ title: payload.error || 'Could not create quote.', variant: 'error' })
        return
      }
      router.push(`/admin/quotes/${payload.quote.id}`)
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not create quote.', variant: 'error' })
    } finally {
      setIsCreating(false)
    }
  }

  async function duplicateQuote(quoteId: string) {
    setDuplicatingQuoteId(quoteId)
    try {
      const response = await fetch(`/api/admin/quotes/${quoteId}/duplicate`, { method: 'POST' })
      const payload  = await response.json()
      if (!response.ok || !payload.ok || !payload.quote?.id) {
        toast({ title: payload.error || 'Could not duplicate quote.', variant: 'error' })
        return
      }
      router.push(`/admin/quotes/${payload.quote.id}`)
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not duplicate quote.', variant: 'error' })
    } finally {
      setDuplicatingQuoteId('')
    }
  }

  async function deleteQuotes(ids: string[]) {
    if (!ids.length) return
    setIsDeleting(true)
    try {
      for (const id of ids) {
        const response = await fetch(`/api/admin/quotes/${id}`, { method: 'DELETE' })
        const payload  = await response.json()
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not delete quote.')
      }
      setQuotes(current => current.filter(q => !ids.includes(q.id)))
      setSelectedQuoteIds(current => current.filter(id => !ids.includes(id)))
      toast({ title: `${ids.length} quote${ids.length === 1 ? '' : 's'} deleted.`, variant: 'success' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not delete selected quotes.', variant: 'error' })
    } finally {
      setIsDeleting(false)
      setConfirmDeleteIds([])
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

  // First load owns the whole content area. A refresh with quotes already on
  // screen leaves them there rather than blanking the page.
  if (isLoading && !quotes.length) {
    return <AdminLoading steps={['Loading your quotes', 'Almost there']} label="Loading quotes" />
  }

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="Quotes" subtitle="Manage your quote pipeline" />

      {/* Status filter bar */}
      <StatusFilterBar options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} className="mb-4" />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {selectedQuoteIds.length > 0 ? (
            <BulkActionBar
              selectedCount={selectedQuoteIds.length}
              noun="quote"
              variant="inline"
              onClear={() => setSelectedQuoteIds([])}
              onDelete={() => setConfirmDeleteIds(selectedQuoteIds)}
              deleting={isDeleting}
            />
          ) : (
            <span className="text-[13px] text-[#8b8a81]">
              {visibleQuotes.length} {visibleQuotes.length === 1 ? 'quote' : 'quotes'}
            </span>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<IconPlus size={14} />}
          onClick={createQuote}
          loading={isCreating}
          loadingText="Creating..."
          aria-label="New quote"
          className="max-sm:w-10 max-sm:px-0"
        >
          <span className="max-sm:hidden">New quote</span>
        </Button>
      </div>

      {setupRequired && (
        <div className="mb-4 px-4 py-3 rounded-[6px] bg-[#fffbeb] border border-[#fcd34d] text-[13px] text-[#92400e]">
          Install <code className="font-mono text-[12px]">supabase/quote_project_workflow_setup.sql</code> before saving quotes.
        </div>
      )}
      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <div className="overflow-x-auto">
          {/* min-w keeps the columns readable: the wrapper scrolls instead of
              the browser wrapping every cell onto two or three lines. */}
          <table className="w-full min-w-[1000px] text-[13px]">
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
                      <StatusPill status={status}>{formatAdminLabel(status)}</StatusPill>
                    </td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{formatMoney(quote.total_inc_gst, quote.currency || 'AUD')}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18] whitespace-nowrap">{formatDate(quote.updated_at || quote.created_at)}</td>
                    <td className="px-4 py-[11px]" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <ActionMenu label={`Open actions for quote ${quote.quote_number || 'draft quote'}`}>
                          <ActionMenuItem icon={<IconFileText size={14} />} onClick={() => router.push(`/admin/quotes/${quote.id}`)}>
                          Open
                          </ActionMenuItem>
                        {quote.access_code && (
                          <ActionMenuItem
                            icon={<IconExternalLink size={14} />}
                            onClick={() => window.open(`/quotes/view?code=${encodeURIComponent(quote.access_code!)}`, '_blank', 'noopener,noreferrer')}
                          >
                            View
                          </ActionMenuItem>
                        )}
                          <ActionMenuItem icon={<IconCopy size={14} />} onClick={() => duplicateQuote(quote.id)} disabled={duplicatingQuoteId === quote.id}>
                          {duplicatingQuoteId === quote.id ? 'Duplicating...' : 'Duplicate'}
                          </ActionMenuItem>
                          <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isDeleting} onClick={() => setConfirmDeleteIds([quote.id])}>
                          Delete
                          </ActionMenuItem>
                        </ActionMenu>
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
                    <StatusPill status={status}>{formatAdminLabel(status)}</StatusPill>
                  </dd>
                </div>
                <div><dt className="text-[#8b8a81]">Total</dt><dd className="text-[#1a1a18]">{formatMoney(quote.total_inc_gst, quote.currency || 'AUD')}</dd></div>
                <div><dt className="text-[#8b8a81]">Updated</dt><dd className="text-[#1a1a18]">{formatDate(quote.updated_at || quote.created_at)}</dd></div>
              </dl>
              <div className="pt-3 border-t border-[#edf4eb] flex justify-end">
                <ActionMenu label={`Open actions for quote ${quote.quote_number || 'draft quote'}`}>
                  <ActionMenuItem icon={<IconFileText size={14} />} onClick={() => router.push(`/admin/quotes/${quote.id}`)}>
                    Open
                  </ActionMenuItem>
                  {quote.access_code && (
                    <ActionMenuItem
                      icon={<IconExternalLink size={14} />}
                      onClick={() => window.open(`/quotes/view?code=${encodeURIComponent(quote.access_code!)}`, '_blank', 'noopener,noreferrer')}
                    >
                      View
                    </ActionMenuItem>
                  )}
                  <ActionMenuItem icon={<IconCopy size={14} />} onClick={() => duplicateQuote(quote.id)} disabled={duplicatingQuoteId === quote.id}>
                    {duplicatingQuoteId === quote.id ? 'Duplicating...' : 'Duplicate'}
                  </ActionMenuItem>
                  <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isDeleting} onClick={() => setConfirmDeleteIds([quote.id])}>
                    Delete
                  </ActionMenuItem>
                </ActionMenu>
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

      <ConfirmModal
        open={confirmDeleteIds.length > 0}
        onClose={() => setConfirmDeleteIds([])}
        title={confirmDeleteIds.length === 1 ? 'Delete quote?' : 'Delete quotes?'}
        description={
          confirmDeleteIds.length === 1
            ? 'This quote will be permanently removed.'
            : `${confirmDeleteIds.length} quotes will be permanently removed.`
        }
        variant="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deleteQuotes(confirmDeleteIds)}
        loading={isDeleting}
      />
    </div>
  )
}
