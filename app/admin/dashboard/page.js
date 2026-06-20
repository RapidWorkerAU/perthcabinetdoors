import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";

export default async function AdminDashboardPage() {
  await requireAdminSession();

  return <AdminShell />;
}
