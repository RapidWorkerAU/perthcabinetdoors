import AdminShell from "../../_components/AdminShell";
import { requireAdminSession } from "../../../../lib/admin-guard";
import QuoteEditor from "./QuoteEditor";

export default async function AdminQuoteDetailPage({ params }) {
  await requireAdminSession();
  const resolvedParams = await Promise.resolve(params);

  return (
    <AdminShell>
      <QuoteEditor quoteId={resolvedParams.id} />
    </AdminShell>
  );
}
