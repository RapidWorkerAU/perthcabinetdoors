import { requireAdminSession } from "../../../lib/admin-guard";
import AdminShell from "../_components/AdminShell";
import ProjectsList from "./ProjectsList";

export const metadata = { title: "Design Tool — PCD Admin" };

export default async function DesignListPage() {
  await requireAdminSession();
  return (
    <AdminShell>
      <ProjectsList />
    </AdminShell>
  );
}
