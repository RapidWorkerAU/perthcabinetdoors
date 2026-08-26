import { requireAdminSession } from "../../../../lib/admin-guard";
import ReportingShell from "../ReportingShell";
import CustomerUpdatesReport from "./CustomerUpdatesReport";

export default async function CustomerUpdatesPage() {
  await requireAdminSession();

  return (
    <ReportingShell>
      <CustomerUpdatesReport />
    </ReportingShell>
  );
}
