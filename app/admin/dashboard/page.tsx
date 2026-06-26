import AdminShell from '../_components/AdminShell'
import { requireAdminSession } from '../../../lib/admin-guard'

export default async function AdminDashboardPage() {
  await requireAdminSession()
  return (
    <AdminShell>
      <div className="p-6">
        <h1 className="text-[20px] font-bold text-[#1a1a18] mb-1">Dashboard</h1>
        <p className="text-[14px] text-[#5a5a52]">Welcome to the PCD admin. Your business data will appear here.</p>
      </div>
    </AdminShell>
  )
}
