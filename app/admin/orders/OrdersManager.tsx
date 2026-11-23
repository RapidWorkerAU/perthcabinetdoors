'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Popover from '@radix-ui/react-popover'
import { formatMoney, ORDER_FILTER_STATUSES } from '../../../lib/pcd-quote-utils'
import { AdminPagination, useAdminPagination } from '../_components/AdminPagination'
import { formatAdminLabel } from '../_utils/formatAdminLabel'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { AdminDataTable, type AdminDataTableColumn } from '@/components/ui/AdminDataTable'
import { tableStyles } from '@/components/ui/table-styles'
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
  // Where the job is up to underneath an issue. Only set on Rectify issues.
  alongside?:  Stage
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
  // Orange, between the red of a problem and the amber of waiting: something
  // was due and has not been marked as happening.
  if (tone === 'late')  return 'bg-[#fff4eb] text-[#9a3f07] border-[#f6b98a]'
  if (tone === 'wait')  return 'bg-[#fffdf0] text-[#8a6d0b] border-[#e8d68f]'
  if (tone === 'next')  return 'bg-[#eff6ff] text-[#1e40af] border-[#bfdbfe]'
  if (tone === 'done')  return 'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'
  return 'bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]'
}

const STAGE_PILL = 'inline-flex items-center whitespace-nowrap px-2 py-[3px] rounded-full text-[11px] font-semibold border'

interface PillFact {
  label: string
  tone:  string
  why:   string
}

// Every fact about where the job is up to, most important first: a problem,
// then what is happening to the job, then whether it is late. The first one is
// the pill in the column; the rest wait behind it.
function stagePills(stage: Stage): PillFact[] {
  const pills: PillFact[] = [{ label: stage.label, tone: stage.tone, why: stage.why }]
  if (stage.alongside) {
    pills.push({ label: stage.alongside.label, tone: stage.alongside.tone, why: stage.alongside.why })
  }
  if (stage.overdue) {
    const days = stage.overdueDays
    pills.push({ label: 'Overdue', tone: 'stop', why: `Past its due date by ${days} ${days === 1 ? 'day' : 'days'}.` })
  }
  return pills
}

// ONE PILL, AND A COUNT OF WHAT IS BEHIND IT.
//
// Two or three pills side by side made this the widest column on the page, and
// the column is scanned, not read. So it shows the one that matters most and a
// quiet "+1" beside it. Hovering the cell opens a card with every pill on the
// row and the sentence behind each, which is where the detail was always meant
// to be read. On a phone, tapping the count opens the same card.
//
// The card stays open while the pointer crosses the gap into it, so it can be
// read without a race. Clicks inside it stop at the card, because the whole row
// is a link to the order.
function StagePill({ stage }: { stage: Stage }) {
  const [main, ...more] = stagePills(stage)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const lastPointer = useRef('mouse')

  if (!more.length) {
    return <span title={main.why} className={cn(STAGE_PILL, getStageTone(main.tone))}>{main.label}</span>
  }

  const show = () => {
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hideSoon = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }
  const onHoverStart = (event: React.PointerEvent) => { if (event.pointerType === 'mouse') show() }
  const onHoverEnd = (event: React.PointerEvent) => { if (event.pointerType === 'mouse') hideSoon() }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap"
          onPointerEnter={onHoverStart}
          onPointerLeave={onHoverEnd}
        >
          <span className={cn(STAGE_PILL, getStageTone(main.tone))}>{main.label}</span>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={`${more.length} more: ${more.map(pill => pill.label).join(', ')}`}
              onPointerDown={event => { lastPointer.current = event.pointerType }}
              onClick={event => {
                event.stopPropagation()
                // Already open from hovering. A click there means "keep it",
                // not "close it".
                if (open && lastPointer.current === 'mouse') event.preventDefault()
              }}
              className="rounded-[4px] px-0.5 text-[11px] font-semibold text-[#8b8a81] transition-colors hover:text-[#1a1a18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9e61]"
            >
              +{more.length}
            </button>
          </Popover.Trigger>
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={event => event.preventDefault()}
          onPointerEnter={onHoverStart}
          onPointerLeave={onHoverEnd}
          onClick={event => event.stopPropagation()}
          className="z-50 w-[280px] rounded-[8px] border border-[#dbd8cc] bg-white p-3 shadow-[0_16px_40px_rgba(26,26,24,0.14)]"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8b8a81]">Where it&apos;s up to</p>
          <ul className="flex flex-col gap-2.5">
            {[main, ...more].map(pill => (
              <li key={pill.label}>
                <span className={cn(STAGE_PILL, getStageTone(pill.tone))}>{pill.label}</span>
                <p className="mt-1 text-[11.5px] leading-[1.45] text-[#5a5a52]">{pill.why}</p>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
  const [installBooked,  setInstallBooked]  = useState<Record<string, boolean>>({})
  const [loaded,         setLoaded]         = useState({ issues: false, payments: false, installs: false })

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
      installBooked: loaded.installs ? Boolean(installBooked[order.id]) : false,
      today,
    }) as Stage
  }, [openIssues, paymentsByOrder, installBooked, loaded])

  async function loadOrders() {
    setIsLoading(true)
    try {
      const res     = await fetch('/api/admin/orders', { cache: 'no-store' })
      const payload = await res.json()
      setSetupRequired(!!payload.setupRequired)
      setOrders(payload.orders || [])
      setOpenIssues(payload.openIssues || {})
      setPaymentsByOrder(payload.paymentsByOrder || {})
      setInstallBooked(payload.installBooked || {})
      setLoaded({ issues: false, payments: false, installs: false, ...(payload.loaded || {}) })
      if (payload.error) toast({ title: payload.error, variant: 'error' })
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Could not load orders.', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadOrders() }, [])

  // Where it's up to sits next to Status on purpose. Status is what kind of
  // record this is; the stage is what is actually happening to it, and reading
  // them together is how you tell an active job being planned from an active
  // job in the workshop.
  const columns: AdminDataTableColumn<Order>[] = [
    {
      id: 'order',
      header: 'Order',
      className: 'font-medium',
      cell: order => (
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
      ),
    },
    { id: 'customer', header: 'Customer', cell: order => order.customer_name || '-' },
    { id: 'job',      header: 'Job',      cell: order => order.name || '-' },
    { id: 'items',    header: 'Items',    cell: order => sortedItems(order).length },
    {
      id: 'status',
      header: 'Status',
      cell: order => {
        const status = order.status || 'active'
        return (
          <span className={cn(
            'inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border',
            getStatusPillClass(status)
          )}>
            {formatAdminLabel(status)}
          </span>
        )
      },
    },
    { id: 'stage', header: "Where it's up to", cell: order => <StagePill stage={stageOf(order)} /> },
    { id: 'total', header: 'Total', className: tableStyles.num, cell: order => formatMoney(order.total_inc_gst, 'AUD') },
    {
      id: 'accepted',
      header: 'Accepted',
      className: 'whitespace-nowrap',
      cell: order => order.accepted_at
        ? formatDate(order.accepted_at)
        : <span className="text-[#8b8a81] italic">Not yet</span>,
    },
  ]

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
      {/* The shared list table. Scrolls sideways rather than crushing the
          columns into the panel, and becomes a card each below md. */}
      <AdminDataTable<Order>
        wide
        rows={pageItems}
        columns={columns}
        getRowId={order => order.id}
        getRowLabel={order => `order ${order.order_number || order.id}`}
        onRowClick={order => router.push(`/admin/orders/${order.id}`)}
        emptyTitle="No orders match this filter."
        pagination={
          <AdminPagination
            label="orders"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        }
        mobileCard={order => {
          const items  = sortedItems(order)
          const status = order.status || 'active'
          return (
            <article className={tableStyles.mobileCard}>
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
        }}
      />
    </div>
  )
}
