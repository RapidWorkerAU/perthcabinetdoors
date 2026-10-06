import ReportingShell from '../ReportingShell'
import { requireAdminSession } from '../../../../lib/admin-guard'
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin'
import { createLineGate } from '../../../../lib/pcd-line-gate'
import { boardsNotInLibrary, LIVE_ORDER_STATUSES, LIVE_QUOTE_STATUSES } from '../../../../lib/pcd-data-checks'
import DataChecksClient from './DataChecksClient'

// Data checks: lines on live quotes and orders whose board is not in the
// colour library. Saved before the line gate existed, so they are listed to be
// fixed by hand rather than changed on their own. See lib/pcd-data-checks.js.

const LINE_COLUMNS = 'id, sort_order, product_type, material, supplier_name, thickness, finish, colour, unit_cost_source_id, profile, edge_mould'

export default async function DataChecksPage() {
  await requireAdminSession()
  const supabase = createSupabaseAdminClient()

  const [{ data: quotes, error: quotesError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from('pcd_quotes').select('id, quote_number, customer_name, status').in('status', LIVE_QUOTE_STATUSES),
    supabase.from('pcd_orders').select('id, order_number, customer_name, status').in('status', LIVE_ORDER_STATUSES),
  ])

  const quoteIds = (quotes || []).map(q => q.id)
  const orderIds = (orders || []).map(o => o.id)

  const [{ data: quoteLines, error: quoteLinesError }, { data: orderLines, error: orderLinesError }, gate] = await Promise.all([
    quoteIds.length
      ? supabase.from('pcd_quote_line_items').select(`quote_id, ${LINE_COLUMNS}`).in('quote_id', quoteIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase.from('pcd_order_line_items').select(`order_id, ${LINE_COLUMNS}`).in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    createLineGate(supabase),
  ])

  // A query that fails returns no rows, which would read as "all clear".
  // Nobody doubts good news, so the page is told and says so.
  const loadFailed = Boolean(quotesError || ordersError || quoteLinesError || orderLinesError || !gate.colourRows.length)

  const rows = loadFailed
    ? []
    : boardsNotInLibrary(gate, {
        quotes: quotes || [],
        quoteLines: (quoteLines || []) as Record<string, unknown>[],
        orders: orders || [],
        orderLines: (orderLines || []) as Record<string, unknown>[],
      })

  return (
    <ReportingShell>
      <DataChecksClient
        rows={rows}
        loadFailed={loadFailed}
        checked={{ quotes: quoteIds.length, orders: orderIds.length, lines: (quoteLines || []).length + (orderLines || []).length }}
      />
    </ReportingShell>
  )
}
