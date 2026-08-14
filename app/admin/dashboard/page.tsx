import AdminShell from '../_components/AdminShell'
import { orderProfitExGst, quoteProfitExGst } from '../../../lib/pcd-quote-profit'
import { requireAdminSession } from '../../../lib/admin-guard'
import { createSupabaseAdminClient } from '../../../lib/supabase/admin'
import DashboardClient from './DashboardClient'

function daysAgo(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

function ageLabel(d: string): string {
  const n = daysAgo(d)
  return n === 0 ? 'Today' : n === 1 ? '1d ago' : `${n}d ago`
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

type PendingPaymentRow = {
  id: string
  order_id: string
  payment_type?: string | null
  amount?: number | string | null
  pcd_orders?: {
    order_number?: string | null
    customer_name?: string | null
    status?: string | null
  } | null
}

type DepositPaymentRow = {
  id: string
  amount?: number | string | null
  paid_at?: string | null
  created_at?: string | null
  pcd_orders?: {
    status?: string | null
  } | null
}

function monthKey(dateValue?: string | null): string | null {
  if (!dateValue) return null
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export default async function AdminDashboardPage() {
  await requireAdminSession()
  const supabase = createSupabaseAdminClient()

  const [
    { count: newEnquiriesCount },
    { count: openQuotesCount },
    { count: activeOrdersCount },
    { count: onHoldOrdersCount },
    { count: pendingRequestsCount },
    { data: enquiriesData },
    { data: quoteRequestsData },
    { data: sentQuotesData },
    { data: pendingPaymentsData },
    { data: financialOrdersData, error: financialOrdersError },
    { data: financialDepositsData },
    { data: financialSentQuotesData },
  ] = await Promise.all([
    supabase.from('pcd_enquiries').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('pcd_quotes').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent', 'viewed']),
    supabase.from('pcd_orders').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('pcd_orders').select('*', { count: 'exact', head: true }).eq('status', 'on_hold'),
    supabase.from('pcd_quote_requests').select('*', { count: 'exact', head: true }).in('status', ['new', 'reviewing']),
    supabase.from('pcd_enquiries').select('id, customer_name, customer_email, topic, message, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(3),
    supabase.from('pcd_quote_requests').select('id, customer_name, source, created_at').in('status', ['new', 'reviewing']).order('created_at', { ascending: false }).limit(3),
    supabase.from('pcd_quotes').select('id, quote_number, customer_name, status, updated_at, created_at').in('status', ['sent', 'viewed']).order('updated_at', { ascending: false }).limit(3),
    // Include the parent order's status so cancelled orders can be filtered
    // out below — a cancelled order is treated as archived.
    supabase.from('pcd_order_payments').select('id, order_id, payment_type, amount, pcd_orders(order_number, customer_name, status)').eq('is_paid', false),
    supabase.from('pcd_orders').select('id, quote_id, status, total_inc_gst, accepted_at, created_at').neq('status', 'cancelled'),
    supabase.from('pcd_order_payments').select('id, amount, payment_type, is_paid, paid_at, created_at, pcd_orders(status)').eq('payment_type', 'deposit').eq('is_paid', true),
    supabase.from('pcd_quotes').select('id, status, total_inc_gst, sent_at, updated_at, created_at, order_id, markup_amount_ex_gst, labour_cost_ex_gst').in('status', ['sent', 'viewed']).is('order_id', null),
  ])

  const enquiries     = enquiriesData     || []
  const quoteRequests = quoteRequestsData || []
  const sentQuotes    = sentQuotesData    || []
  // Exclude payments belonging to cancelled orders (treated as archived) so
  // they never count toward the pending-payments stat or the attention list.
  const pendingPays   = ((pendingPaymentsData || []) as PendingPaymentRow[]).filter(p => p.pcd_orders?.status !== 'cancelled')

  const attention = {
    enquiries: enquiries.map(e => ({
      id:       e.id,
      name:     e.customer_name || e.customer_email || 'Unknown',
      subtitle: String(e.topic || e.message || '').slice(0, 60),
      age:      ageLabel(e.created_at),
    })),
    quoteRequests: quoteRequests.map(q => ({
      id:       q.id,
      name:     q.customer_name || 'Unknown',
      subtitle: `${q.source ? titleCase(q.source) : 'Request Quote'} · Waiting ${daysAgo(q.created_at)}d`,
      age:      ageLabel(q.created_at),
    })),
    awaitingQuotes: sentQuotes.map(q => ({
      id:       q.id,
      name:     q.quote_number || q.id,
      subtitle: `${q.customer_name || 'Unknown'} · Sent ${daysAgo(q.updated_at || q.created_at)}d ago`,
      age:      ageLabel(q.updated_at || q.created_at),
    })),
    pendingPayments: pendingPays.map(p => ({
      id:       p.id,
      name:     p.pcd_orders?.order_number || p.order_id,
      subtitle: [p.pcd_orders?.customer_name, `${p.payment_type ? titleCase(p.payment_type) : 'Payment'} · $${Number(p.amount || 0).toFixed(2)}`].filter(Boolean).join(' · '),
    })),
  }

  const stats = {
    newEnquiries:    newEnquiriesCount    ?? 0,
    quoteRequests:   pendingRequestsCount ?? 0,
    openQuotes:      openQuotesCount      ?? 0,
    activeOrders:    activeOrdersCount    ?? 0,
    pendingPayments: pendingPays.length,
    ordersOnHold:    onHoldOrdersCount    ?? 0,
  }

  const financialOrderQuoteIds = new Set((financialOrdersData || []).map(order => order.quote_id).filter(Boolean))

  // The cost split lives on the quote, not the order: an order stores the
  // totals it was accepted at but not what they were made of.
  //
  // Fetched as its own query rather than embedded. pcd_orders.quote_id and
  // pcd_quotes.order_id are BOTH foreign keys between these two tables, so
  // "pcd_quotes(...)" embedded from pcd_orders is ambiguous, and PostgREST
  // answers an ambiguous embed with an error and no rows at all. That took the
  // order totals down with it.
  const orderQuoteIds = Array.from(financialOrderQuoteIds) as string[]
  const { data: orderQuotesData, error: orderQuotesError } = orderQuoteIds.length
    ? await supabase.from('pcd_quotes').select('id, markup_amount_ex_gst, labour_cost_ex_gst').in('id', orderQuoteIds)
    : { data: [], error: null }
  const quoteProfitById = new Map((orderQuotesData || []).map(quote => [quote.id, quote]))

  const financialOrders = (financialOrdersData || []).map(order => ({
    id: order.id,
    monthKey: monthKey(order.accepted_at || order.created_at),
    amount: Number(order.total_inc_gst || 0),
  })).filter(row => row.monthKey)

  // Profit is the markup plus the labour, ex GST, taken from the quote behind
  // the order. See lib/pcd-quote-profit.js for why those two and nothing else.
  const financialOrderProfit = (financialOrdersData || []).map(order => {
    const profit = orderProfitExGst({ pcd_quotes: quoteProfitById.get(order.quote_id) || null })
    return {
      id: order.id,
      monthKey: monthKey(order.accepted_at || order.created_at),
      amount: profit ?? 0,
      // An order raised without a quote, or whose quote has since been deleted,
      // has revenue but no split behind it. Counted here so the panel can say
      // so rather than reporting a profit of nothing on real money.
      unknown: profit === null,
    }
  }).filter(row => row.monthKey)

  const financialDeposits = ((financialDepositsData || []) as DepositPaymentRow[]).filter(payment => payment.pcd_orders?.status !== 'cancelled').map(payment => ({
    id: payment.id,
    monthKey: monthKey(payment.paid_at || payment.created_at),
    amount: Number(payment.amount || 0),
  })).filter(row => row.monthKey)

  const pipelineQuotes = (financialSentQuotesData || []).filter(quote => !financialOrderQuoteIds.has(quote.id))

  const financialSentQuotes = pipelineQuotes.map(quote => ({
    id: quote.id,
    monthKey: monthKey(quote.sent_at || quote.updated_at || quote.created_at),
    amount: Number(quote.total_inc_gst || 0),
  })).filter(row => row.monthKey)

  const financialPipelineProfit = pipelineQuotes.map(quote => ({
    id: quote.id,
    monthKey: monthKey(quote.sent_at || quote.updated_at || quote.created_at),
    amount: quoteProfitExGst(quote),
  })).filter(row => row.monthKey)

  const years = Array.from(new Set([
    new Date().getFullYear(),
    ...financialOrders.map(row => Number(row.monthKey!.slice(0, 4))),
    ...financialDeposits.map(row => Number(row.monthKey!.slice(0, 4))),
    ...financialSentQuotes.map(row => Number(row.monthKey!.slice(0, 4))),
  ])).filter(Boolean).sort((a, b) => b - a)

  // A query that fails comes back with no rows, which renders as a confident
  // $0. That is worse than an error: nobody doubts a total. Passed through so
  // the panel says the figures could not be loaded instead.
  const financialError = Boolean(financialOrdersError || orderQuotesError)

  const financial = {
    loadFailed: financialError,
    orders: financialOrders,
    deposits: financialDeposits,
    sentQuotes: financialSentQuotes,
    orderProfit: financialOrderProfit,
    pipelineProfit: financialPipelineProfit,
    years,
    currentMonth: String(new Date().getMonth() + 1).padStart(2, '0'),
    currentYear: new Date().getFullYear(),
  }

  const todayLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <AdminShell>
      <DashboardClient stats={stats} attention={attention} financial={financial} todayLabel={todayLabel} />
    </AdminShell>
  )
}
