import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import OrdersManager from "./OrdersManager";

export default async function AdminOrdersPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <OrdersManager />
    </AdminShell>
  );
}
