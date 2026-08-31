import { cookies } from 'next/headers'
import AdminShell from '../_components/AdminShell'
import { requireAdminSession } from '../../../lib/admin-guard'
import { createSupabaseAdminClient } from '../../../lib/supabase/admin'
import { loadSiteStats } from '../../../lib/pcd-site-stats'
import DashboardClient from './DashboardClient'
import { DETAIL_COOKIE, readDetail } from './_components/detail'

export const dynamic = 'force-dynamic'

// THE DASHBOARD IS THE STAT STRIP AND THE WEBSITE.
//
// ── WHAT USED TO BE HERE, AND WHY IT IS NOT ──────────────────────────────────
//
// A ranked list of what needed doing, taken off the board. It was accurate and
// it was still the wrong thing to put here: it was the board a second time, one
// click from the board, and the stat strip above it already links to every
// screen it pointed at. Two places showing the same work is two places to keep
// in step, and the board is the one that can set a card aside.
//
// So the queue is gone, and with it lib/pcd-action-queue.js, which existed only
// to rank it. The board is the work list. This page is now about the one thing
// the board cannot answer: whether the website is bringing anything in.
//
// ── IT SHOWS MONEY, AND IT NEVER TOTALS ANY ──────────────────────────────────
//
// The financial figures were taken off this page for a reason worth repeating.
// An ambiguous embed returned an error and no rows, the code read { data } and
// ignored { error }, and a whole failed query rendered as a confident $0 on the
// order total. Nobody doubts a total, so it went unnoticed for as long as the
// dashboard had existed. See test/financials-page.test.mjs.
//
// Nothing on this page adds anything up. The counts below are counts of rows,
// and every website figure arrives finished from lib/pcd-site-stats.js, which
// also names any source that would not load so a failed query reads as a
// warning rather than as a quiet week.
//
// ── THE PERIOD IS THE CALENDAR MONTH ─────────────────────────────────────────
//
// Which is what somebody means when they ask how the month is going. Seven and
// ninety day windows are already built in lib/pcd-site-stats.js if a switcher
// is ever wanted; nothing here would have to change but the argument.

export default async function AdminDashboardPage() {
  await requireAdminSession()
  const supabase = createSupabaseAdminClient()

  // How much detail this person wants, read from their own cookie so the server
  // renders the right amount on the first paint. Browser storage could only be
  // read after hydration, which would show one layout and then rearrange it
  // while somebody was reading it. See _components/DetailToggle.tsx.
  const jar = await cookies()
  const detail = readDetail(jar.get(DETAIL_COOKIE)?.value)

  const [
    site,
    { count: newEnquiriesCount },
    { count: openQuotesCount },
    { count: activeOrdersCount },
    { count: onHoldOrdersCount },
    { count: pendingRequestsCount },
    { count: unpaidPaymentsCount },
  ] = await Promise.all([
    loadSiteStats(supabase, { period: 'month' }),
    supabase.from('pcd_enquiries').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    // awaiting_deposit counts as an open quote. It is neither won nor lost: the
    // customer has said yes and the deposit has not arrived. Leaving it out
    // would drop a quote off the dashboard at the exact moment somebody said
    // yes to it. See lib/pcd-deposit-gate.js.
    supabase.from('pcd_quotes').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent', 'viewed', 'awaiting_deposit']),
    supabase.from('pcd_orders').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('pcd_orders').select('*', { count: 'exact', head: true }).eq('status', 'on_hold'),
    supabase.from('pcd_quote_requests').select('*', { count: 'exact', head: true }).in('status', ['new', 'reviewing']),
    // A PAYMENT ON A JOB THAT WAS PUT AWAY IS NOT OWED BY ANYBODY.
    //
    // The tile used to count every unpaid row, so a cancelled or archived
    // order's payments went on being counted as money outstanding. The inner
    // join is what scopes it, and payments reference orders one way only, so
    // this embed is not the ambiguous kind. See test/financials-page.test.mjs.
    supabase.from('pcd_order_payments')
      .select('id, pcd_orders!inner(status)', { count: 'exact', head: true })
      .eq('is_paid', false)
      .in('pcd_orders.status', ['pending_deposit', 'active', 'on_hold', 'complete']),
  ])

  const stats = {
    newEnquiries:    newEnquiriesCount    ?? 0,
    quoteRequests:   pendingRequestsCount ?? 0,
    openQuotes:      openQuotesCount      ?? 0,
    activeOrders:    activeOrdersCount    ?? 0,
    pendingPayments: unpaidPaymentsCount  ?? 0,
    ordersOnHold:    onHoldOrdersCount    ?? 0,
  }

  const todayLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <AdminShell>
      <DashboardClient stats={stats} site={site} todayLabel={todayLabel} initialDetail={detail} />
    </AdminShell>
  )
}
