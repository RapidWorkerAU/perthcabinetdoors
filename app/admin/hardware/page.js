import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import HardwareManager from "./HardwareManager";

export default async function AdminHardwarePage() {
  await requireAdminSession();
  return (
    <AdminShell>
      <HardwareManager />
    </AdminShell>
  );
}
