import AdminShell from '../_components/AdminShell'
import { requireAdminSession } from '../../../lib/admin-guard'
import { createSupabaseAdminClient } from '../../../lib/supabase/admin'
import { buildActionQueue } from '../../../lib/pcd-action-queue'
import { quoteValidDays } from '../../../lib/pcd-business-defaults'
import { ARCHIVED_EXPIRED } from '../../../lib/pcd-archive'
import DashboardClient from './DashboardClient'

// THE DASHBOARD READS NINE THINGS AND RANKS THEM INTO ONE LIST.
//
// The panel used to be four counts of four tables. It is now a single queue,
// and the whole of the deciding, including the wording of every row, happens in
// lib/pcd-action-queue.js. This file only fetches.
//
// ── IT SHOWS MONEY, AND IT NEVER TOTALS ANY ──────────────────────────────────
//
// The financial figures were taken off this page for a reason worth repeating.
// An ambiguous embed returned an error and no rows, the code read { data } and
// ignored { error }, and a whole failed query rendered as a confident $0 on the
// order total. Nobody doubts a total, so it went unnoticed for as long as the
// dashboard had existed. See test/financials-page.test.mjs.
//
// The queue shows what ONE quote is worth beside the row it came from, and adds
// nothing up. A source that fails is a missing row, and a missing row is
// visible in a way a wrong total is not.
//
// ── AND A FAILED QUERY SAYS SO ───────────────────────────────────────────────
//
// Reading { data } and dropping { error } is the other half of that same fault.
// Every error here is collected and handed to the panel, so a queue that is
// short because a table would not answer says it is short rather than quietly
// looking like a quiet morning.
//
// WHY THE QUERIES ARE BOUNDED. Each one is capped, because a dashboard must not
// get slower as the business gets bigger. The caps are far above what the queue
// can display, so the ranking still sees plenty more than it shows.

type PendingPaymentRow = {
  id: string
  order_id: string
  payment_type?: string | null
  amount?: number | string | null
  requested_at?: string | null
  pcd_orders?: {
    order_number?: string | null
    customer_name?: string | null
    status?: string | null
  } | null
}

export default async function AdminDashboardPage() {
  await requireAdminSession()
  const supabase = createSupabaseAdminClient()

  // Fourteen days back is as far as a lapsed quote stays in the queue, so
  // reading further than that would only be work thrown away.
  const lapsedSince = new Date(Date.now() - 21 * 86400000).toISOString()

  const [
    validDays,
    newEnquiriesResult,
    openQuotesResult,
    activeOrdersResult,
    onHoldOrdersResult,
    pendingRequestsResult,
    enquiriesResult,
    quoteRequestsResult,
    liveQuotesResult,
    lapsedQuotesResult,
    openTicketsResult,
    pendingPaymentsResult,
    ordersResult,
  ] = await Promise.all([
    quoteValidDays(supabase),
    supabase.from('pcd_enquiries').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    // awaiting_deposit counts as an open quote. It is neither won nor lost: the
    // customer has said yes and the deposit has not arrived. Leaving it out
    // would drop a quote off the dashboard at the exact moment somebody said
    // yes to it. See lib/pcd-deposit-gate.js.
    supabase.from('pcd_quotes').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent', 'viewed', 'awaiting_deposit']),
    supabase.from('pcd_orders').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('pcd_orders').select('*', { count: 'exact', head: true }).eq('status', 'on_hold'),
    supabase.from('pcd_quote_requests').select('*', { count: 'exact', head: true }).in('status', ['new', 'reviewing']),

    supabase.from('pcd_enquiries')
      .select('id, customer_id, customer_name, customer_email, topic, created_at')
      .eq('status', 'new').order('created_at', { ascending: true }).limit(30),

    supabase.from('pcd_quote_requests')
      .select('id, customer_name, product_name, source, created_at')
      .in('status', ['new', 'reviewing']).order('created_at', { ascending: true }).limit(30),

    // Everything still with a customer: about to expire, and approved with the
    // deposit outstanding. Both are read from one query because they are the
    // same table and the queue tells them apart by status.
    supabase.from('pcd_quotes')
      .select('id, quote_number, customer_name, status, sent_at, viewed_at, updated_at, order_id, total_inc_gst, deposit_percent, awaiting_deposit_at')
      .in('status', ['sent', 'viewed', 'awaiting_deposit'])
      .order('sent_at', { ascending: true }).limit(200),

    // Quotes that closed themselves recently. Re-sending one of these the week
    // it ran out is the cheapest save in the business.
    supabase.from('pcd_quotes')
      .select('id, quote_number, customer_name, status, sent_at, viewed_at, archived_at, archived_reason, total_inc_gst')
      .eq('status', 'archived').eq('archived_reason', ARCHIVED_EXPIRED)
      .gte('archived_at', lapsedSince)
      .order('archived_at', { ascending: false }).limit(30),

    // open means the last message came in and nobody has answered. The desk
    // maintains that on every inbound and outbound message, so it is the whole
    // signal and there is no need to read the messages themselves.
    supabase.from('pcd_tickets')
      .select('id, customer_id, subject, status, last_message_at, pcd_customers(name)')
      .eq('status', 'open').order('last_message_at', { ascending: true }).limit(30),

    // Only money we have actually asked for. A future progress payment nobody
    // has requested yet is a plan, not a job, and putting those in the queue
    // would bury the real work under every order's payment schedule.
    supabase.from('pcd_order_payments')
      .select('id, order_id, payment_type, amount, requested_at, pcd_orders(order_number, customer_name, status)')
      .eq('is_paid', false).not('requested_at', 'is', null),

    supabase.from('pcd_orders')
      .select('id, order_number, customer_name, status, target_completion_date, production_stage, total_inc_gst, updated_at')
      .in('status', ['active', 'on_hold']).limit(200),
  ])

  // WHAT WOULD NOT ANSWER, named. A query that fails contributes no rows, and
  // without this the queue would simply be shorter than the truth with nothing
  // anywhere saying why.
  const problems: string[] = []
  function rowsOf<T>(label: string, result: { data: T[] | null; error: { message?: string } | null }): T[] {
    if (result.error) {
      console.error(`[dashboard] ${label} could not be read: ${result.error.message || 'unknown error'}`)
      problems.push(label)
      return []
    }
    return result.data || []
  }

  const enquiriesData     = rowsOf('enquiries', enquiriesResult)
  const quoteRequestsData = rowsOf('quote requests', quoteRequestsResult)
  const liveQuotesData    = rowsOf('open quotes', liveQuotesResult)
  const lapsedQuotesData  = rowsOf('expired quotes', lapsedQuotesResult)
  const openTicketsData   = rowsOf('customer conversations', openTicketsResult)
  const ordersData        = rowsOf('orders', ordersResult)
  const paymentsData      = rowsOf('payments', pendingPaymentsResult)

  // Payments against orders that have been put away are not owed by anybody.
  const pendingPays = (paymentsData as PendingPaymentRow[])
    .filter(p => !['cancelled', 'archived'].includes(String(p.pcd_orders?.status || '')))

  // The customer's name lives on their record rather than on the ticket, so it
  // is flattened here into the shape the queue reads.
  const openTickets = openTicketsData.map(ticket => ({
    ...ticket,
    customer_name:
      (ticket as { pcd_customers?: { name?: string | null } | null }).pcd_customers?.name || '',
  }))

  const queue = {
    ...buildActionQueue(
      {
        quotes:        [...liveQuotesData, ...lapsedQuotesData],
        quoteRequests: quoteRequestsData,
        enquiries:     enquiriesData,
        openTickets,
        payments:      pendingPays,
        orders:        ordersData,
      },
      { validDays },
    ),
    problems,
  }

  const stats = {
    newEnquiries:    newEnquiriesResult.count    ?? 0,
    quoteRequests:   pendingRequestsResult.count ?? 0,
    openQuotes:      openQuotesResult.count      ?? 0,
    activeOrders:    activeOrdersResult.count    ?? 0,
    pendingPayments: pendingPays.length,
    ordersOnHold:    onHoldOrdersResult.count    ?? 0,
  }

  const todayLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <AdminShell>
      <DashboardClient stats={stats} queue={queue} todayLabel={todayLabel} />
    </AdminShell>
  )
}
