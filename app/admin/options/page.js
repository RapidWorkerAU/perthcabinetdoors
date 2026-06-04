import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import ColourLibraryManager from "./ColourLibraryManager";

export default async function AdminOptionsPage() {
  await requireAdminSession();
  const supabase = await createSupabaseServerClient();

  let finishes = [];
  let tiles = [];
  let materialLinks = [];
  try {
    const [finishResult, tileResult, materialResult] = await Promise.all([
      supabase
        .from("pcd_colour_finishes")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("pcd_colour_tiles")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.from("pcd_colour_tile_materials").select("*"),
    ]);
    finishes = finishResult.data || [];
    tiles = tileResult.data || [];
    materialLinks = materialResult.data || [];
  } catch (error) {
    finishes = [];
    tiles = [];
    materialLinks = [];
  }

  return (
    <AdminShell>
      <ColourLibraryManager
        initialFinishes={finishes}
        initialTiles={tiles}
        initialMaterialLinks={materialLinks}
      />
    </AdminShell>
  );
}
