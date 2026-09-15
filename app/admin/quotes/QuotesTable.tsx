'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCopy, IconExternalLink, IconPlus, IconTrash } from '@tabler/icons-react'
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
import { AdminDataTable, type AdminDataTableColumn } from '@/components/ui/AdminDataTable'
import { tableStyles } from '@/components/ui/table-styles'
import { cn } from '@/lib/utils'

// awaiting_deposit is its own tab on purpose. It is the chase list: everyone who
// said yes and has not paid the deposit, which is the closest thing to a warm
// lead the system holds and used to be invisible.
const STATUSES = ['draft', 'sent', 'viewed', 'awaiting_deposit', 'approved', 'rejected']
// Archived is a tab you can go to, never a tab you land in. "All" means all the
// live ones: putting something away has to actually put it away, or the tab is
// only a label.
const FILTERS  = ['all', ...STATUSES, 'archived']

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
    if (statusFilter === 'all') return quotes.filter(q => (q.status || 'draft') !== 'archived')
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

  const columns: AdminDataTableColumn<Quote>[] = [
    { id: 'quote', header: 'Quote', className: 'font-medium', cell: quote => quote.quote_number },
    {
      id: 'access_code',
      header: 'Access code',
      cell: quote => (
        <code className="font-mono text-[11px] bg-[#f5f8f4] border border-[#dbd8cc] px-2 py-[2px] rounded-[4px]">
          {quote.access_code || '-'}
        </code>
      ),
    },
    { id: 'customer', header: 'Customer', cell: quote => quote.customer_name || '-' },
    { id: 'suburb',   header: 'Suburb',   cell: quote => quoteCustomerSuburb(quote) },
    {
      id: 'status',
      header: 'Status',
      cell: quote => {
        const status = quote.status || 'draft'
        return <StatusPill status={status}>{formatAdminLabel(status)}</StatusPill>
      },
    },
    { id: 'total', header: 'Total', className: tableStyles.num, cell: quote => formatMoney(quote.total_inc_gst, quote.currency || 'AUD') },
    { id: 'updated', header: 'Updated', className: 'whitespace-nowrap', cell: quote => formatDate(quote.updated_at || quote.created_at) },
    {
      // The id is what stops a click in the menu opening the quote as well.
      id: 'actions',
      header: 'Actions',
      cell: quote => (
        <div className="flex justify-end">
          <ActionMenu label={`Open actions for quote ${quote.quote_number || 'draft quote'}`}>
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
      ),
    },
  ]

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
      {/* The shared list table. `wide` lets the wrapper scroll instead of the
          browser wrapping every cell onto two or three lines. */}
      <AdminDataTable<Quote>
        wide
        rows={pageItems}
        columns={columns}
        getRowId={quote => quote.id}
        getRowLabel={quote => `quote ${quote.quote_number || quote.id}`}
        onRowClick={quote => router.push(`/admin/quotes/${quote.id}`)}
        selectedIds={selectedQuoteIds}
        onSelectedIdsChange={setSelectedQuoteIds}
        emptyTitle="No quotes match this filter."
        pagination={
          <AdminPagination
            label="quotes"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        }
        mobileCard={quote => {
          const status = quote.status || 'draft'
          return (
            <article
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/admin/quotes/${quote.id}`)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  router.push(`/admin/quotes/${quote.id}`)
                }
              }}
              className={cn(tableStyles.mobileCard, 'cursor-pointer hover:bg-[#f5f8f4] focus:outline-none focus:ring-2 focus:ring-[#6b9e61]')}
            >
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
              <div className="pt-3 border-t border-[#edf4eb] flex justify-end" onClick={e => e.stopPropagation()}>
                <ActionMenu label={`Open actions for quote ${quote.quote_number || 'draft quote'}`}>
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
        }}
      />

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
