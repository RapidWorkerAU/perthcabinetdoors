import { requireAdminSession } from "../../../lib/admin-guard";
import { redirect } from "next/navigation";

export default async function AdminBusinessDefaultsPage() {
  await requireAdminSession();
  redirect("/admin/settings");
}
