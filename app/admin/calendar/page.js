import WorkShell from "../work-management/WorkShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import CalendarManager from "./CalendarManager";

export default async function AdminCalendarPage() {
  await requireAdminSession();

  return (
    <WorkShell>
      <CalendarManager />
    </WorkShell>
  );
}
