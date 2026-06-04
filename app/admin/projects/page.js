import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import ProjectsManager from "./ProjectsManager";

export default async function AdminProjectsPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <ProjectsManager />
    </AdminShell>
  );
}
