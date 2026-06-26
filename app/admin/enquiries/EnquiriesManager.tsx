'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'
import { formatAdminLabel } from '../_utils/formatAdminLabel'

const STATUSES = ['new', 'in_progress', 'responded', 'closed', 'not_required']
const FILTERS  = ['all', ...STATUSES]

interface Enquiry {
  id:              string
  status?:         string
  customer_name?:  string
  customer_email?: string
  customer_phone?: string
  postcode?:       string
  topic?:          string
  message?:        string
  created_at?:     string
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export default function EnquiriesManager() {
  const [enquiries,    setEnquiries]    = React.useState<Enquiry[]>([])
  const [isLoading,    setIsLoading]    = React.useState(true)
  const [isSaving,     setIsSaving]     = React.useState(false)
  const [feedback,     setFeedback]     = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('new')
  const [selectedIds,  setSelectedIds]  = React.useState<string[]>([])

  const statusCounts = React.useMemo(() => {
    return enquiries.reduce<Record<string, number>>(
      (counts, enquiry) => {
        const status = enquiry.status || 'new'
        counts.all = (counts.all || 0) + 1
        counts[status] = (counts[status] || 0) + 1
        return counts
      },
      { all: 0 }
    )
  }, [enquiries])

  const visibleEnquiries = React.useMemo(() => {
    if (statusFilter === 'all') return enquiries
    return enquiries.filter(e => (e.status || 'new') === statusFilter)
  }, [enquiries, statusFilter])

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(visibleEnquiries, statusFilter)

  async function loadEnquiries() {
    setIsLoading(true)
    try {
      const res     = await fetch('/api/admin/enquiries', { cache: 'no-store' })
      const payload = await res.json()
      setEnquiries(payload.enquiries || [])
      if (payload.error) setFeedback(payload.error)
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => { loadEnquiries() }, [])

  async function updateStatus(id: string, status: string) {
    const res     = await fetch(`/api/admin/enquiries/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    })
    const payload = await res.json()
    if (res.ok && payload.ok) {
      setEnquiries(current => current.map(item => item.id === id ? payload.enquiry : item))
    } else {
      setFeedback(payload.error || 'Could not update enquiry.')
    }
  }

  async function deleteEnquiries(ids: string[]) {
    if (!ids.length) return
    setIsSaving(true)
    setFeedback('')
    try {
      for (const id of ids) {
        const res     = await fetch(`/api/admin/enquiries/${id}`, { method: 'DELETE' })
        const payload = await res.json()
        if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not delete enquiry.')
      }
      setEnquiries(current => current.filter(item => !ids.includes(item.id)))
      setSelectedIds(current => current.filter(id => !ids.includes(id)))
      setFeedback(`${ids.length} enquir${ids.length === 1 ? 'y' : 'ies'} deleted.`)
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Could not delete selected enquiries.')
    } finally {
      setIsSaving(false)
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  function toggleSelectedPage(checked: boolean) {
    const pageIds = pageItems.map(e => e.id)
    setSelectedIds(current => {
      if (!checked) return current.filter(id => !pageIds.includes(id))
      return Array.from(new Set([...current, ...pageIds]))
    })
  }

  const allPageSelected = pageItems.length > 0 && pageItems.every(e => selectedIds.includes(e.id))

  return (
    <div className="p-4 md:p-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Enquiries</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage customer enquiries</p>
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
          {selectedIds.length > 0 ? (
            <button
              type="button"
              onClick={() => deleteEnquiries(selectedIds)}
              disabled={isSaving}
              className="text-[13px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
            >
              Delete {selectedIds.length} selected
            </button>
          ) : (
            <span className="text-[13px] text-[#8b8a81]">{visibleEnquiries.length} {visibleEnquiries.length === 1 ? 'enquiry' : 'enquiries'}</span>
          )}
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
              <th className="w-[40px] px-4 py-[9px]">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={e => toggleSelectedPage(e.target.checked)}
                  aria-label="Select all visible enquiries"
                  className="accent-[#6b9e61]"
                />
              </th>
              {['Customer', 'Contact', 'Postcode', 'Topic', 'Message', 'Status', 'Received', ''].map(col => (
                <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="py-12 text-center text-[13px] text-[#8b8a81]">Loading...</td></tr>
            )}
            {!isLoading && !visibleEnquiries.length && (
              <tr><td colSpan={9} className="py-12 text-center text-[13px] text-[#8b8a81]">No enquiries match this filter.</td></tr>
            )}
            {pageItems.map(enquiry => (
              <tr key={enquiry.id} className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0">
                <td className="px-4 py-[11px]">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(enquiry.id)}
                    onChange={() => toggleSelected(enquiry.id)}
                    aria-label={`Select enquiry from ${enquiry.customer_name || 'customer'}`}
                    className="accent-[#6b9e61]"
                  />
                </td>
                <td className="px-4 py-[11px] text-[13px] font-medium text-[#1a1a18]">{enquiry.customer_name || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{enquiry.customer_email || enquiry.customer_phone || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{enquiry.postcode || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18]">{enquiry.topic || '-'}</td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18] max-w-[200px] truncate">{enquiry.message || '-'}</td>
                <td className="px-4 py-[11px]">
                  <select
                    value={enquiry.status || 'new'}
                    onChange={e => updateStatus(enquiry.id, e.target.value)}
                    className="h-[30px] border border-[#dbd8cc] rounded-[4px] bg-white text-[12px] text-[#1a1a18] px-2 outline-none focus:border-[#6b9e61] cursor-pointer"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{formatAdminLabel(s)}</option>)}
                  </select>
                </td>
                <td className="px-4 py-[11px] text-[13px] text-[#1a1a18] whitespace-nowrap">{formatDate(enquiry.created_at)}</td>
                <td className="px-4 py-[11px] text-right">
                  <button
                    type="button"
                    onClick={() => deleteEnquiries([enquiry.id])}
                    disabled={isSaving}
                    className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <AdminPagination
          label="enquiries"
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
        {!isLoading && !visibleEnquiries.length && (
          <div className="py-12 text-center text-[13px] text-[#8b8a81]">No enquiries match this filter.</div>
        )}
        {pageItems.map(enquiry => (
          <div key={enquiry.id} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[14px] font-semibold text-[#1a1a18]">{enquiry.customer_name || '—'}</p>
                <p className="text-[12px] text-[#5a5a52]">{enquiry.customer_email || enquiry.customer_phone || '—'}</p>
              </div>
              <select
                value={enquiry.status || 'new'}
                onChange={e => updateStatus(enquiry.id, e.target.value)}
                className="h-[30px] border border-[#dbd8cc] rounded-[4px] bg-white text-[12px] text-[#1a1a18] px-2 outline-none focus:border-[#6b9e61] cursor-pointer"
              >
                {STATUSES.map(s => <option key={s} value={s}>{formatAdminLabel(s)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] mb-3">
              <div><span className="text-[#8b8a81]">Postcode</span><p className="text-[#1a1a18]">{enquiry.postcode || '—'}</p></div>
              <div><span className="text-[#8b8a81]">Topic</span><p className="text-[#1a1a18]">{enquiry.topic || '—'}</p></div>
              <div><span className="text-[#8b8a81]">Received</span><p className="text-[#1a1a18]">{formatDate(enquiry.created_at)}</p></div>
            </div>
            {enquiry.message && <p className="text-[12px] text-[#5a5a52] leading-relaxed border-t border-[#edf4eb] pt-3">{enquiry.message}</p>}
            <div className="flex justify-end pt-3 border-t border-[#edf4eb] mt-3">
              <button
                type="button"
                onClick={() => deleteEnquiries([enquiry.id])}
                disabled={isSaving}
                className="text-[12px] font-medium text-[#b42318] hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {/* Mobile pagination */}
        {totalItems > 0 && (
          <AdminPagination
            label="enquiries"
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
