import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import QuoteRequestsManager from "./QuoteRequestsManager";

export default async function AdminQuoteRequestsPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <QuoteRequestsManager />
    </AdminShell>
  );
}

