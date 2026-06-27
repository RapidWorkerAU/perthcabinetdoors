import AdminShell from '../_components/AdminShell'
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
  ] = await Promise.all([
    supabase.from('pcd_enquiries').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('pcd_quotes').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent', 'viewed']),
    supabase.from('pcd_orders').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('pcd_orders').select('*', { count: 'exact', head: true }).eq('status', 'on_hold'),
    supabase.from('pcd_quote_requests').select('*', { count: 'exact', head: true }).in('status', ['new', 'reviewing']),
    supabase.from('pcd_enquiries').select('id, customer_name, customer_email, topic, message, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(3),
    supabase.from('pcd_quote_requests').select('id, customer_name, source, created_at').in('status', ['new', 'reviewing']).order('created_at', { ascending: false }).limit(3),
    supabase.from('pcd_quotes').select('id, quote_number, customer_name, status, updated_at, created_at').in('status', ['sent', 'viewed']).order('updated_at', { ascending: false }).limit(3),
    supabase.from('pcd_order_payments').select('id, order_id, payment_type, amount, pcd_orders(order_number, customer_name)').eq('is_paid', false),
  ])

  const enquiries     = enquiriesData     || []
  const quoteRequests = quoteRequestsData || []
  const sentQuotes    = sentQuotesData    || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingPays   = (pendingPaymentsData || []) as any[]

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

  const todayLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <AdminShell>
      <DashboardClient stats={stats} attention={attention} todayLabel={todayLabel} />
    </AdminShell>
  )
}
