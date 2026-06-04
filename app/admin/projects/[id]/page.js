import AdminShell from "../../_components/AdminShell";
import { requireAdminSession } from "../../../../lib/admin-guard";
import ProjectDetail from "./ProjectDetail";

export default async function AdminProjectDetailPage({ params }) {
  await requireAdminSession();
  const resolvedParams = await Promise.resolve(params);

  return (
    <AdminShell>
      <ProjectDetail projectId={resolvedParams.id} />
    </AdminShell>
  );
}
