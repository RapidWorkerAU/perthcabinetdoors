import AdminShell from "../../_components/AdminShell";
import { requireAdminSession } from "../../../../lib/admin-guard";
import OrderDetail from "./OrderDetail";

export default async function AdminOrderDetailPage({ params }) {
  await requireAdminSession();
  const { id } = await params;

  return (
    <AdminShell>
      <OrderDetail orderId={id} />
    </AdminShell>
  );
}
