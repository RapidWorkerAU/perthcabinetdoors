'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney, ORDER_FILTER_STATUSES } from '../../../lib/pcd-quote-utils'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'
import { formatAdminLabel } from '../_utils/formatAdminLabel'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import AdminLoading from '@/components/admin/AdminLoading'
import { orderStage } from '../../../lib/pcd-order-stage'

// Archived is a tab you can go to, never a tab you land in. See the note on
// ORDER_FILTER_STATUSES: what a list may be filtered BY is not what a dropdown
// may set.
const FILTERS  = ['all', ...ORDER_FILTER_STATUSES]

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

interface LineItem {
  sort_order?:        number
  status?:            string | null
  production_stage?:  string | null
  fulfilment_method?: string | null
  panel_planning?:    unknown
}

interface Payment {
  payment_type?: string
  amount?:       number
  is_paid?:      boolean
}

interface Stage {
  key:         string
  label:       string
  tone:        string
  why:         string
  overdue:     boolean
  overdueDays: number
}

interface Order {
  id:                      string
  order_number?:           string
  customer_name?:          string
  name?:                   string
  status?:                 string
  total_inc_gst?:          number
  accepted_at?:            string | null
  created_at?:             string
  completed_at?:           string | null
  admin_viewed_at?:        string | null
  scheduled_start_date?:   string | null
  target_completion_date?: string | null
  pcd_order_line_items?:   LineItem[]
}

function sortedItems(order: Order) {
  return [...(order?.pcd_order_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
}

function getStatusPillClass(status: string) {
  // Amber, because it is neither running nor finished: it is waiting on money.
  if (status === 'pending_deposit')
    return 'bg-[#fffdf0] text-[#8a6d0b] border-[#e8d68f]'
  if (status === 'active' || status === 'complete')
    return 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
  if (status === 'cancelled' || status === 'on_hold')
    return 'bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]'
  return 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]'
}

// THE STAGE PILL, TONE BY TONE. Five tones, and each one means something you
// would act on differently, which is the only reason to have five:
//   stop   nobody can work on it, or it has gone wrong
//   wait   correct, and waiting on somebody who is not us
//   next   our move, and nothing happens until we make it
//   going  work is under way
//   done   finished as far as this job is concerned
// Deliberately not the same greens as the Status column beside it. Two pills on
// one row in the same colour read as one fact said twice.
function getStageTone(tone: string) {
  if (tone === 'stop')  return 'bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]'
  if (tone === 'wait')  return 'bg-[#fffdf0] text-[#8a6d0b] border-[#e8d68f]'
  if (tone === 'next')  return 'bg-[#eff6ff] text-[#1e40af] border-[#bfdbfe]'
  if (tone === 'done')  return 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
  return 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]'
}

// Overdue rides beside the stage rather than replacing it, because "overdue" on
// its own does not tell you what to do about it, and both facts are true at the
// same time.
function StagePill({ stage }: { stage: Stage }) {
  const days = stage.overdueDays
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        title={stage.why}
        className={cn(
          'inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border',
          getStageTone(stage.tone)
        )}
      >
        {stage.label}
      </span>
      {/* NOTHING IN THIS CELL THAT IS NOT A PILL. The counts used to sit here
          as loose grey text, which made the column read as two different kinds
          of thing in one strip. The wording of the pill carries the stage, and
          the exact number is in its tooltip where it does not compete with the
          scan down the column. */}
      {stage.overdue && (
        <span
          title={'Past its due date by ' + days + (days === 1 ? ' day.' : ' days.')}
          className="inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border bg-[#fef2f2] text-[#991b1b] border-[#fca5a5]"
        >
          Overdue
        </span>
      )}
    </span>
  )
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
  // The two facts the orders table cannot prove on its own: whether a problem
  // has been raised against a job, and whether a finished one has been paid
  // for. `loaded` says whether each read actually worked, so a broken query
  // shows a less specific stage rather than a confidently wrong one.
  const [openIssues,     setOpenIssues]     = useState<Record<string, number>>({})
  const [paymentsByOrder, setPaymentsByOrder] = useState<Record<string, Payment[]>>({})
  const [loaded,         setLoaded]         = useState({ issues: false, payments: false })

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
    if (statusFilter === 'all') return orders.filter(o => !['cancelled', 'archived'].includes(o.status || 'active'))
    return orders.filter(o => (o.status || 'active') === statusFilter)
  }, [orders, statusFilter])

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(visibleOrders, statusFilter)

  // WORKED OUT HERE, NOT STORED ANYWHERE. Every stage comes from fields the
  // order and its lines already carry, so nobody has to remember to move a job
  // along and no stage can go stale. See lib/pcd-order-stage.js, which the work
  // board's own rules agree with.
  //
  // Today is fixed per render rather than read inside the loop, so two rows in
  // the same table cannot land on different sides of midnight. Perth's date,
  // not London's, which is the same reason the board pins it.
  const stageOf = useMemo(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date())
    return (order: Order): Stage => orderStage(order, order.pcd_order_line_items || [], {
      openIssues: loaded.issues ? (openIssues[order.id] || 0) : 0,
      payments:   loaded.payments ? (paymentsByOrder[order.id] || []) : null,
      today,
    }) as Stage
  }, [openIssues, paymentsByOrder, loaded])

  async function loadOrders() {
    setIsLoading(true)
    try {
      const res     = await fetch('/api/admin/orders', { cache: 'no-store' })
      const payload = await res.json()
      setSetupRequired(!!payload.setupRequired)
      setOrders(payload.orders || [])
      setOpenIssues(payload.openIssues || {})
      setPaymentsByOrder(payload.paymentsByOrder || {})
      setLoaded(payload.loaded || { issues: false, payments: false })
      if (payload.error) toast({ title: payload.error, variant: 'error' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not load orders.', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadOrders() }, [])

  // First load owns the whole content area. A refresh with orders already on
  // screen leaves them there rather than blanking the page.
  if (isLoading && !orders.length) {
    return <AdminLoading steps={['Loading your orders', 'Almost there']} label="Loading orders" />
  }

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
        {/* Scrolls sideways rather than crushing the columns into the panel. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                {/* Where it's up to sits next to Status on purpose. Status is
                    what kind of record this is; the stage is what is actually
                    happening to it, and reading them together is how you tell
                    an active job being planned from an active job in the
                    workshop. */}
                {['Order', 'Customer', 'Job', 'Items', 'Status', "Where it's up to", 'Total', 'Accepted'].map(col => (
                  <th key={col} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!isLoading && !visibleOrders.length && (
                <tr><td colSpan={8} className="py-12 text-center text-[13px] text-[#8b8a81]">No orders match this filter.</td></tr>
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
                    <td className="px-4 py-[11px]"><StagePill stage={stageOf(order)} /></td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{formatMoney(order.total_inc_gst, 'AUD')}</td>
                    <td className="px-4 py-[11px] whitespace-nowrap">
                      {order.accepted_at
                        ? <span className="text-[#1a1a18]">{formatDate(order.accepted_at)}</span>
                        : <span className="text-[#8b8a81] italic">Not yet</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
                {/* Full width on a phone: the stage is the longest label in the
                    list and the one most worth reading, so it does not share a
                    row with a dollar figure. */}
                <div className="col-span-2">
                  <dt className="text-[#8b8a81]">Where it&apos;s up to</dt>
                  <dd className="mt-[2px]"><StagePill stage={stageOf(order)} /></dd>
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
