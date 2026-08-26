import LibrariesShell from "../option-libraries/LibrariesShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import BenchtopMaterialsManager from "./BenchtopMaterialsManager";

export default async function AdminBenchtopMaterialsPage() {
  await requireAdminSession();
  return (
    <LibrariesShell>
      <BenchtopMaterialsManager />
    </LibrariesShell>
  );
}
