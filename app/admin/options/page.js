import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getDatabaseColourRows } from "../../../lib/pcd-colour-library";
import ColourLibraryManager from "./ColourLibraryManager";

export default async function AdminOptionsPage() {
  await requireAdminSession();
  const supabase = await createSupabaseServerClient();

  let colourRows = [];
  let colourRowsError = "";
  try {
    colourRows = await getDatabaseColourRows(supabase, { throwOnError: true });
  } catch (error) {
    colourRows = [];
    colourRowsError = error?.message || "Could not load colour library rows.";
  }

  return (
    <AdminShell>
      <ColourLibraryManager initialRows={colourRows} initialError={colourRowsError} />
    </AdminShell>
  );
}
