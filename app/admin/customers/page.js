import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import CustomersManager from "./CustomersManager";

export default async function AdminCustomersPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <CustomersManager />
    </AdminShell>
  );
}
