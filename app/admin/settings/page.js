import AdminShell from "../_components/AdminShell";
import AccountSettingsForm from "../_components/AccountSettingsForm";
import { requireAdminSession } from "../../../lib/admin-guard";

export default async function AdminSettingsPage() {
  const { user } = await requireAdminSession();

  return (
    <AdminShell>
      <AccountSettingsForm currentEmail={user?.email || ""} />
    </AdminShell>
  );
}
