import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import BusinessDefaultsManager from "./BusinessDefaultsManager";

export default async function AdminBusinessDefaultsPage() {
  await requireAdminSession();
  return (
    <AdminShell>
      <BusinessDefaultsManager />
    </AdminShell>
  );
}
