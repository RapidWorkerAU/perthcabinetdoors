import AdminShell from "../../_components/AdminShell";
import { requireAdminSession } from "../../../../lib/admin-guard";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import ProductEditorForm from "../_components/ProductEditorForm";

export default async function NewProductPage() {
  await requireAdminSession();
  const supabase = await createSupabaseServerClient();

  let colourFinishes = [];
  let colourTiles = [];
  let colourMaterialLinks = [];
  let optionSets = [];

  try {
    const { data } = await supabase
      .from("quote_option_sets")
      .select("id,name,code,kind,is_active,config_json")
      .eq("is_active", true)
      .order("kind", { ascending: true })
      .order("name", { ascending: true });
    optionSets = data || [];
  } catch (error) {
    optionSets = [];
  }

  try {
    const [finishResult, tileResult, materialResult] = await Promise.all([
      supabase
        .from("pcd_colour_finishes")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("pcd_colour_tiles")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.from("pcd_colour_tile_materials").select("*"),
    ]);
    colourFinishes = finishResult.data || [];
    colourTiles = tileResult.data || [];
    colourMaterialLinks = materialResult.data || [];
  } catch (error) {
    colourFinishes = [];
    colourTiles = [];
    colourMaterialLinks = [];
  }

  return (
    <AdminShell>
      <ProductEditorForm
        mode="new"
        initialProduct={null}
        initialImages={[]}
        initialOptionSets={optionSets}
        initialColourFinishes={colourFinishes}
        initialColourTiles={colourTiles}
        initialColourMaterialLinks={colourMaterialLinks}
      />
    </AdminShell>
  );
}
