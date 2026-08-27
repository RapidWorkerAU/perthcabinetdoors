import AdminShell from '../_components/AdminShell'
import { requireAdminSession } from '../../../lib/admin-guard'
import { createSupabaseAdminClient } from '../../../lib/supabase/admin'
import { loadBoard } from '../../../lib/pcd-board-load'
import { rankBoardCards } from '../../../lib/pcd-action-queue'
import { missingWords } from '../../../lib/pcd-board'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

// THE DASHBOARD IS THE TOP OF THE BOARD, RANKED.
//
// ── WHY IT IS NOT ITS OWN LIST ───────────────────────────────────────────────
//
// It was, briefly, and it was wrong in the way that matters most: it built its
// own idea of what needed doing from its own queries, so it knew nothing about
// set aside. A card cleared off the board came straight back here, with no way
// to clear it, which makes both screens untrustworthy at once.
//
// There is now one definition of what needs doing, in lib/pcd-board.js, read by
// lib/pcd-board-load.ts. The board shows all of it grouped into columns. This
// shows the top eight, ranked. Set a card aside on the board and it leaves
// both; it comes back to both when the thing it is about moves on.
//
// ── IT SHOWS MONEY, AND IT NEVER TOTALS ANY ──────────────────────────────────
//
// The financial figures were taken off this page for a reason worth repeating.
// An ambiguous embed returned an error and no rows, the code read { data } and
// ignored { error }, and a whole failed query rendered as a confident $0 on the
// order total. Nobody doubts a total, so it went unnoticed for as long as the
// dashboard had existed. See test/financials-page.test.mjs.
//
// Each row shows what ONE card is worth, beside that card, and nothing is added
// up. A source that fails is named out loud by the board loader and said on the
// panel, because a short list that looks like a quiet morning is the same fault
// wearing a different hat.

export default async function AdminDashboardPage() {
  await requireAdminSession()
  const supabase = createSupabaseAdminClient()

  const [
    board,
    { count: newEnquiriesCount },
    { count: openQuotesCount },
    { count: activeOrdersCount },
    { count: onHoldOrdersCount },
    { count: pendingRequestsCount },
    { count: unpaidPaymentsCount },
  ] = await Promise.all([
    loadBoard(supabase),
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

  const queue = {
    ...rankBoardCards(board.cards),
    // What would not load, in the words of the work it affects rather than the
    // name of a table. A query that errors returns no rows, and no rows reads
    // as all clear. The board says it the same way, so the two agree.
    problems: board.failed,
    missing: missingWords(board.failed),
    // How many were deliberately cleared. Said on the panel so an unusually
    // short list is explained rather than mysterious.
    setAsideCount: board.setAsideCount,
  }

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
      <DashboardClient stats={stats} queue={queue} todayLabel={todayLabel} />
    </AdminShell>
  )
}
