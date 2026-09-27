import ReportingShell from '../ReportingShell'
import { requireAdminSession } from '../../../../lib/admin-guard'
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin'
import { loadListItems } from '../../../../lib/pcd-list-load'
import IssuesClient from './IssuesClient'

// Order issues: every problem raised against a panel on an order. Loaded here
// the way Financials loads, and filtered by period in the browser, so switching
// period is instant and every figure is aged against one server date.

export default async function OrderIssuesReportPage() {
  await requireAdminSession()
  const supabase = createSupabaseAdminClient()

  const { data: issuesData, error: issuesError } = await supabase
    .from('pcd_order_issues')
    .select('id, order_id, kind, detail, stage_at_report, owner, blocks, extra_cost_ex_gst, raised_by, raised_at, resolved_at, resolution, created_at, panel_label')
    .order('raised_at', { ascending: false })

  const issues = issuesData || []
  const orderIds = [...new Set(issues.map(i => i.order_id).filter(Boolean))]
  const agentIds = [...new Set(issues.map(i => i.raised_by).filter(Boolean))]

  const [{ data: ordersData, error: ordersError }, { data: agentsData, error: agentsError }, kinds] = await Promise.all([
    orderIds.length
      ? supabase.from('pcd_orders').select('id, order_number, name, customer_name, status').in('id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    agentIds.length
      ? supabase.from('pcd_agents').select('id, name, login_email').in('id', agentIds)
      : Promise.resolve({ data: [], error: null }),
    loadListItems(supabase, 'issue_kinds'),
  ])

  // A query that fails comes back with no rows, which reads as "no issues".
  // Nobody doubts good news, so the page is told and says so.
  const loadFailed = Boolean(issuesError || ordersError || agentsError)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <ReportingShell>
      <IssuesClient
        loadFailed={loadFailed}
        issues={issues}
        orders={(ordersData || []).map(o => ({ id: o.id, order_number: o.order_number, name: o.name, customer_name: o.customer_name, status: o.status }))}
        agents={(agentsData || []).map(a => ({ id: a.id, name: a.name || a.login_email || '' }))}
        kinds={(kinds || []).map((k: { key: string; label: string }) => ({ key: k.key, label: k.label }))}
        today={today}
      />
    </ReportingShell>
  )
}
