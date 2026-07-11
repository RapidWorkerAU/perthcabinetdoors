'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '../../../lib/pcd-quote-utils'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'
import { formatAdminLabel } from '../_utils/formatAdminLabel'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

const STATUSES = ['active', 'on_hold', 'complete', 'cancelled']
const FILTERS  = ['all', ...STATUSES]

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

interface LineItem {
  sort_order?: number
}

interface Order {
  id:                    string
  order_number?:         string
  customer_name?:        string
  name?:                 string
  status?:               string
  total_inc_gst?:        number
  accepted_at?:          string | null
  created_at?:           string
  admin_viewed_at?:      string | null
  pcd_order_line_items?: LineItem[]
}

function sortedItems(order: Order) {
  return [...(order?.pcd_order_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
}

function getStatusPillClass(status: string) {
  if (status === 'active' || status === 'complete')
    return 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
  if (status === 'cancelled' || status === 'on_hold')
    return 'bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]'
  return 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]'
}

function isNewOrder(order: Order) {
  return Object.prototype.hasOwnProperty.call(order || {}, 'admin_viewed_at') && !order.admin_viewed_at
}

export default function OrdersManager() {
  const router = useRouter()
  const { toast } = useToast()
  const [orders,       setOrders]       = useState<Order[]>([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [statusFilter, setStatusFilter] = useState('active')

  const statusCounts = useMemo(() => {
    return orders.reduce<Record<string, number>>(
      (counts, order) => {
        const status = order.status || 'active'
        // Cancelled orders are archived — excluded from the "All" count so
        // they only surface under their own Cancelled tab.
        if (status !== 'cancelled') counts.all = (counts.all || 0) + 1
        counts[status] = (counts[status] || 0) + 1
        return counts
      },
      { all: 0 }
    )
  }, [orders])

  const visibleOrders = useMemo(() => {
    // "All" shows every non-cancelled order; cancelled ones are archived and
    // only appear when the Cancelled tab is explicitly selected.
    if (statusFilter === 'all') return orders.filter(o => (o.status || 'active') !== 'cancelled')
    return orders.filter(o => (o.status || 'active') === statusFilter)
  }, [orders, statusFilter])

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(visibleOrders, statusFilter)

  async function loadOrders() {
    setIsLoading(true)
    try {
      const res     = await fetch('/api/admin/orders', { cache: 'no-store' })
      const payload = await res.json()
      setSetupRequired(!!payload.setupRequired)
      setOrders(payload.orders || [])
      if (payload.error) toast({ title: payload.error, variant: 'error' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not load orders.', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadOrders() }, [])

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Orders</h1>
          <p className="text-[13px] text-[#5a5a52] mt-[2px]">Manage customer orders</p>
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

      {setupRequired && (
        <div className="mb-4 px-4 py-3 rounded-[6px] bg-[#fffbeb] border border-[#fcd34d] text-[13px] text-[#92400e]">
          Run <code className="font-mono text-[12px]">supabase/pcd_enquiries_quote_requests_orders_setup.sql</code> before orders can be listed.
        </div>
      )}
      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
              {['Order', 'Customer', 'Job', 'Items', 'Status', 'Total', 'Accepted'].map(col => (
                <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="py-12 text-center text-[13px] text-[#8b8a81]">Loading orders...</td></tr>
            )}
            {!isLoading && !visibleOrders.length && (
              <tr><td colSpan={7} className="py-12 text-center text-[13px] text-[#8b8a81]">No orders match this filter.</td></tr>
            )}
            {pageItems.map(order => {
              const items  = sortedItems(order)
              const status = order.status || 'active'
              return (
                <tr
                  key={order.id}
                  className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0 cursor-pointer"
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
                >
                  <td className="px-4 py-[11px] font-medium text-[#1a1a18]">
                    <span className="flex items-center gap-1.5">
                      {isNewOrder(order) && (
                        <span
                          className="inline-block w-[6px] h-[6px] rounded-full bg-[#6b9e61] flex-shrink-0"
                          title="New order"
                          aria-label="New order"
                        />
                      )}
                      {order.order_number}
                    </span>
                  </td>
                  <td className="px-4 py-[11px] text-[#1a1a18]">{order.customer_name || '-'}</td>
                  <td className="px-4 py-[11px] text-[#1a1a18]">{order.name || '-'}</td>
                  <td className="px-4 py-[11px] text-[#1a1a18]">{items.length}</td>
                  <td className="px-4 py-[11px]">
                    <span className={cn(
                      'inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border',
                      getStatusPillClass(status)
                    )}>
                      {formatAdminLabel(status)}
                    </span>
                  </td>
                  <td className="px-4 py-[11px] text-[#1a1a18]">{formatMoney(order.total_inc_gst, 'AUD')}</td>
                  <td className="px-4 py-[11px] text-[#1a1a18] whitespace-nowrap">{formatDate(order.accepted_at || order.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <AdminPagination
          label="orders"
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {isLoading && (
          <div className="py-12 text-center text-[13px] text-[#8b8a81]">Loading orders...</div>
        )}
        {!isLoading && !visibleOrders.length && (
          <div className="py-12 text-center text-[13px] text-[#8b8a81]">No orders match this filter.</div>
        )}
        {pageItems.map(order => {
          const items  = sortedItems(order)
          const status = order.status || 'active'
          return (
            <article key={order.id} className="bg-white border border-[#dbd8cc] rounded-[8px] p-4">
              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-[0.07em] text-[#8b8a81] font-semibold mb-1">Order</p>
                <p className="text-[15px] font-semibold text-[#1a1a18] flex items-center gap-1.5">
                  {isNewOrder(order) && (
                    <span
                      className="inline-block w-[6px] h-[6px] rounded-full bg-[#6b9e61] flex-shrink-0"
                      title="New order"
                      aria-label="New order"
                    />
                  )}
                  {order.order_number}
                </p>
                <p className="text-[13px] text-[#5a5a52]">{order.customer_name || 'No customer'}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] mb-3">
                <div><dt className="text-[#8b8a81]">Job</dt><dd className="text-[#1a1a18]">{order.name || '-'}</dd></div>
                <div><dt className="text-[#8b8a81]">Items</dt><dd className="text-[#1a1a18]">{items.length}</dd></div>
                <div>
                  <dt className="text-[#8b8a81]">Status</dt>
                  <dd>
                    <span className={cn(
                      'inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border',
                      getStatusPillClass(status)
                    )}>
                      {formatAdminLabel(status)}
                    </span>
                  </dd>
                </div>
                <div><dt className="text-[#8b8a81]">Total</dt><dd className="text-[#1a1a18]">{formatMoney(order.total_inc_gst, 'AUD')}</dd></div>
                <div><dt className="text-[#8b8a81]">Accepted</dt><dd className="text-[#1a1a18]">{formatDate(order.accepted_at || order.created_at)}</dd></div>
              </dl>
              <div className="pt-3 border-t border-[#edf4eb] flex justify-end">
                <button
                  type="button"
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
                  className="h-[34px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors"
                >
                  Open order
                </button>
              </div>
            </article>
          )
        })}
        {totalItems > 0 && (
          <AdminPagination
            label="orders"
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
