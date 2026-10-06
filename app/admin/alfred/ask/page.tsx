import AdminShell from '../../_components/AdminShell'
import { requireAdminSession } from '../../../../lib/admin-guard'
import AlfredClient from '../AlfredClient'

export const dynamic = 'force-dynamic'

export default async function AlfredViewPage() {
  await requireAdminSession()
  return (
    <AdminShell>
      <AlfredClient view="ask" />
    </AdminShell>
  )
}
