import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import EnquiriesManager from "./EnquiriesManager";

export default async function AdminEnquiriesPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <EnquiriesManager />
    </AdminShell>
  );
}

