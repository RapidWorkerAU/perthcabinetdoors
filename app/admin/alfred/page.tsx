import AdminShell from '../_components/AdminShell'
import { requireAdminSession } from '../../../lib/admin-guard'
import AlfredClient from './AlfredClient'

export const dynamic = 'force-dynamic'

// Alfred is the chat and nothing else.
export default async function AlfredPage() {
  await requireAdminSession()
  return (
    <AdminShell>
      <AlfredClient />
    </AdminShell>
  )
}
