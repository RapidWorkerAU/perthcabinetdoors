import { requireAdminSession } from "../../../../lib/admin-guard";
import ReportingShell from "../ReportingShell";
import MaterialsReport from "./MaterialsReport";

export default async function MaterialsReportPage() {
  await requireAdminSession();
  return (
    <ReportingShell>
      <MaterialsReport />
    </ReportingShell>
  );
}
