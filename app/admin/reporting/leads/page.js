import { requireAdminSession } from "../../../../lib/admin-guard";
import ReportingShell from "../ReportingShell";
import LeadConversionReport from "./LeadConversionReport";

export default async function LeadConversionPage() {
  await requireAdminSession();
  return (
    <ReportingShell>
      <LeadConversionReport />
    </ReportingShell>
  );
}
