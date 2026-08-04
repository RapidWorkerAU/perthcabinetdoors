import AdminShell from "../../../../_components/AdminShell";
import { requireAdminSession } from "../../../../../../lib/admin-guard";
import VariationEditor from "./VariationEditor";

export default async function AdminOrderVariationPage({ params }) {
  await requireAdminSession();
  const resolvedParams = await Promise.resolve(params);

  return (
    <AdminShell>
      <VariationEditor orderId={resolvedParams.id} variationId={resolvedParams.variationId} />
    </AdminShell>
  );
}
