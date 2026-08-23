import AdminShell from '../_components/AdminShell'
import { requireAdminSession } from '../../../lib/admin-guard'
import { createSupabaseAdminClient } from '../../../lib/supabase/admin'
import FinancialsClient from './FinancialsClient'

type PaymentRow = {
  id: string
  order_id: string
  payment_type?: string | null
  amount?: number | string | null
  is_paid?: boolean | null
  paid_at?: string | null
  requested_at?: string | null
  request_status?: string | null
  created_at?: string | null
  pcd_orders?: {
    order_number?: string | null
    customer_name?: string | null
    status?: string | null
  } | null
}

export default async function AdminFinancialsPage() {
  await requireAdminSession()
  const supabase = createSupabaseAdminClient()

  const [
    { data: paymentsData, error: paymentsError },
    { data: ordersData, error: ordersError },
    { data: quotesData, error: quotesError },
  ] = await Promise.all([
    // The parent order comes along for the customer's name and its status, so a
    // cancelled order's payments can be dropped: a cancelled order is archived,
    // and its unpaid payments are not money anyone is still owed.
    supabase
      .from('pcd_order_payments')
      .select('id, order_id, payment_type, amount, is_paid, paid_at, requested_at, request_status, created_at, pcd_orders(order_number, customer_name, status)'),
    supabase
      .from('pcd_orders')
      .select('id, quote_id, order_number, customer_name, status, total_inc_gst, gst_amount, accepted_at, created_at'),
    supabase
      .from('pcd_quotes')
      .select('id, quote_number, customer_name, status, total_inc_gst, gst_amount, sent_at, updated_at, created_at, order_id, markup_amount_ex_gst, labour_cost_ex_gst')
      .in('status', ['sent', 'viewed']),
  ])

  const orderQuoteIds = Array.from(
    new Set((ordersData || []).map(order => order.quote_id).filter(Boolean))
  ) as string[]

  // The cost split lives on the quote, not the order: an order stores the
  // totals it was accepted at but not what they were made of.
  //
  // Fetched as its own query rather than embedded. pcd_orders.quote_id and
  // pcd_quotes.order_id are BOTH foreign keys between these two tables, so
  // "pcd_quotes(...)" embedded from pcd_orders is ambiguous, and PostgREST
  // answers an ambiguous embed with an error and no rows at all, which took
  // the order totals down with it the last time this was written that way.
  const { data: orderQuotesData, error: orderQuotesError } = orderQuoteIds.length
    ? await supabase.from('pcd_quotes').select('id, markup_amount_ex_gst, labour_cost_ex_gst').in('id', orderQuoteIds)
    : { data: [], error: null }

  const payments = ((paymentsData || []) as PaymentRow[]).map(payment => ({
    id: payment.id,
    orderId: payment.order_id,
    orderNumber: payment.pcd_orders?.order_number || null,
    customerName: payment.pcd_orders?.customer_name || null,
    order_status: payment.pcd_orders?.status || null,
    payment_type: payment.payment_type || 'other',
    amount: Number(payment.amount || 0),
    is_paid: Boolean(payment.is_paid),
    paid_at: payment.paid_at || null,
    requested_at: payment.requested_at || null,
    request_status: payment.request_status || 'not_requested',
    created_at: payment.created_at || null,
  }))

  const orders = (ordersData || []).map(order => ({
    id: order.id,
    quote_id: order.quote_id || null,
    orderNumber: order.order_number || null,
    customerName: order.customer_name || null,
    status: order.status || null,
    total_inc_gst: Number(order.total_inc_gst || 0),
    // Read off the row rather than worked back from a rate: the rate is stored
    // per quote and a quote raised at a different one would come out wrong.
    gst_amount: Number(order.gst_amount || 0),
    accepted_at: order.accepted_at || null,
    created_at: order.created_at || null,
  }))

  const quotes = (quotesData || []).map(quote => ({
    id: quote.id,
    quoteNumber: quote.quote_number || null,
    customerName: quote.customer_name || null,
    status: quote.status || null,
    total_inc_gst: Number(quote.total_inc_gst || 0),
    gst_amount: Number(quote.gst_amount || 0),
    sent_at: quote.sent_at || null,
    updated_at: quote.updated_at || null,
    created_at: quote.created_at || null,
    order_id: quote.order_id || null,
    markup_amount_ex_gst: Number(quote.markup_amount_ex_gst || 0),
    labour_cost_ex_gst: Number(quote.labour_cost_ex_gst || 0),
  }))

  const splits = (orderQuotesData || []).map(quote => ({
    id: quote.id,
    markup_amount_ex_gst: Number(quote.markup_amount_ex_gst || 0),
    labour_cost_ex_gst: Number(quote.labour_cost_ex_gst || 0),
  }))

  // A query that fails comes back with no rows, which renders as a confident
  // $0. That is worse than an error: nobody doubts a total. Passed through so
  // the page says the figures could not be loaded instead of showing zeroes.
  const loadFailed = Boolean(paymentsError || ordersError || quotesError || orderQuotesError)

  // Today is settled on the server so every figure on the page is aged against
  // one date, rather than each browser using its own clock.
  const today = new Date().toISOString().slice(0, 10)

  return (
    <AdminShell>
      <FinancialsClient
        loadFailed={loadFailed}
        payments={payments}
        orders={orders}
        quotes={quotes}
        splits={splits}
        orderQuoteIds={orderQuoteIds}
        today={today}
      />
    </AdminShell>
  )
}
