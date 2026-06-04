import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import QuotesTable from "./QuotesTable";

export default async function AdminQuotesPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <QuotesTable />
    </AdminShell>
  );
}
