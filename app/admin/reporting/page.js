import { redirect } from "next/navigation";

// Reporting has no landing page of its own. Somebody clicking Reporting wants a
// report, and an index listing them would be a page whose only job is to be
// clicked through. The first report in the sidebar IS the landing page, and
// that is Financials because it is the one looked at daily.
export default function ReportingPage() {
  redirect("/admin/financials");
}
