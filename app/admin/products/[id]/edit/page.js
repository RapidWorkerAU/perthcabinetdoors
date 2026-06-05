import { notFound } from "next/navigation";
import AdminShell from "../../../_components/AdminShell";
import { requireAdminSession } from "../../../../../lib/admin-guard";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { getDatabaseColourRows } from "../../../../../lib/pcd-colour-library";
import ProductEditorForm from "../../_components/ProductEditorForm";

export default async function EditProductPage({ params }) {
  await requireAdminSession();

  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams?.id;

  if (!id) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select(`
      id,name,slug,category,eyebrow,card_title,page_title,price_from,is_active,sort_order,
      short_description,long_description,meta_description,cta_label,cta_url,currency,features,finishes,
      type,type_label,material,material_label,compatibility,compatibility_label,ikea_system,style,
      standard_size,hero_caption,detail_description,finish_brand,lead_time,made_to_measure,pre_drilled,
      gallery_images,pricing_rows,info_cards,related_product_ids,product_options
    `)
    .eq("id", id)
    .single();

  if (productError || !product) {
    notFound();
  }

  const { data: images } = await supabase
    .from("product_images")
    .select("image_url,is_primary,sort_order")
    .eq("product_id", id)
    .order("sort_order", { ascending: true });

  let quoteConfig = null;
  let optionSets = [];
  let colourRows = [];

  try {
    const { data } = await supabase
      .from("product_quote_configs")
      .select("*")
      .eq("product_id", id)
      .maybeSingle();
    quoteConfig = data;
  } catch (error) {
    quoteConfig = null;
  }

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
        mode="edit"
        initialProduct={product}
        initialImages={images || []}
        initialQuoteConfig={quoteConfig}
        initialOptionSets={optionSets}
        initialColourRows={colourRows}
      />
    </AdminShell>
  );
}
