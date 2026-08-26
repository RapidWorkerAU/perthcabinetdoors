import LibrariesShell from "../option-libraries/LibrariesShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import HardwareManager from "./HardwareManager";

export default async function AdminHardwarePage() {
  await requireAdminSession();
  return (
    <LibrariesShell>
      <HardwareManager />
    </LibrariesShell>
  );
}
