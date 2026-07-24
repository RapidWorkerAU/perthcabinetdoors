import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import BenchtopMaterialsManager from "./BenchtopMaterialsManager";

export default async function AdminBenchtopMaterialsPage() {
  await requireAdminSession();
  return (
    <AdminShell>
      <BenchtopMaterialsManager />
    </AdminShell>
  );
}
