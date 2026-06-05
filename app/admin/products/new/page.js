import AdminShell from "../../_components/AdminShell";
import { requireAdminSession } from "../../../../lib/admin-guard";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDatabaseColourRows } from "../../../../lib/pcd-colour-library";
import ProductEditorForm from "../_components/ProductEditorForm";

export default async function NewProductPage() {
  await requireAdminSession();
  const supabase = await createSupabaseServerClient();

  let colourRows = [];
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
    colourRows = await getDatabaseColourRows(supabase, { activeOnly: true });
  } catch (error) {
    colourRows = [];
  }

  return (
    <AdminShell>
      <ProductEditorForm
        mode="new"
        initialProduct={null}
        initialImages={[]}
        initialOptionSets={optionSets}
        initialColourRows={colourRows}
      />
    </AdminShell>
  );
}
