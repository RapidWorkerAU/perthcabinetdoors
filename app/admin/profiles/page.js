import LibrariesShell from "../option-libraries/LibrariesShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getProfileLibraryRows } from "../../../lib/pcd-profile-library";
import ProfileLibraryManager from "./ProfileLibraryManager";

export default async function AdminProfileLibraryPage() {
  await requireAdminSession();
  const supabase = await createSupabaseServerClient();

  // Thrown rather than swallowed. A manager looking at an empty table cannot
  // tell "no profiles" from "could not read the profiles", and the difference
  // decides whether they go and add some.
  let rows = [];
  let error = "";
  try {
    rows = await getProfileLibraryRows(supabase, { throwOnError: true });
  } catch (thrown) {
    rows = [];
    error =
      thrown?.message?.includes("pcd_profile_library")
        ? "The profile library table is not there yet. Run supabase/202608231000_pcd_profile_library.sql."
        : thrown?.message || "Could not load the profile library.";
  }

  // AN EMPTY TABLE AND A BLOCKED READ LOOK IDENTICAL, and that cost real time:
  // the seed had written all 150 rows and row level security was returning an
  // empty list with an HTTP 200, so the screen said "No profiles match these
  // filters" and there was nothing to suggest otherwise.
  //
  // Nothing can tell the two apart from here, so rather than pick one, say both
  // and name the file that fixes the likelier of them.
  if (!error && !rows.length) {
    error =
      "No profiles are readable. Either the library is genuinely empty, or row level security is blocking the " +
      "read, which returns an empty list rather than an error. If you have run the seed, run " +
      "supabase/202608231200_pcd_profile_library_rls.sql.";
  }

  return (
    <LibrariesShell>
      <ProfileLibraryManager initialRows={rows} initialError={error} />
    </LibrariesShell>
  );
}
