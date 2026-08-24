import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import CalendarManager from "./CalendarManager";

export default async function AdminCalendarPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <CalendarManager />
    </AdminShell>
  );
}
