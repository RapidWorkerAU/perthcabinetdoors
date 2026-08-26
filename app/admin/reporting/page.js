import { redirect } from "next/navigation";

// Reporting has no landing page of its own. Somebody clicking Reporting wants a
// report, and an index listing the one report that exists would be a page whose
// only job is to be clicked through. The first report in the sidebar IS the
// landing page.
export default function ReportingPage() {
  redirect("/admin/reporting/customer-updates");
}
