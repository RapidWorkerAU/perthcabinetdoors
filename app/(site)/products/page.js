import ProductsLibraryClient from "./ProductsLibraryClient";
import PublicSiteNav from "../PublicSiteNav";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { normalizeProducts, PRODUCTS } from "./product-data";

export const metadata = {
  title: "Products | Perth Cabinet Doors",
  description:
    "Browse our range of custom cabinet doors, drawer fronts and panels in Polytec finishes. Pre-drilled and ready to fit. Compatible with IKEA and Kaboodle cabinets.",
};

export const dynamic = "force-dynamic";

const PRODUCT_SELECT = `
  id,name,slug,category,eyebrow,card_title,page_title,price_from,is_active,sort_order,
  short_description,long_description,meta_description,cta_label,cta_url,currency,features,finishes,
  type,type_label,material,material_label,compatibility,compatibility_label,ikea_system,style,
  standard_size,hero_caption,detail_description,finish_brand,lead_time,made_to_measure,pre_drilled,
  gallery_images,pricing_rows,info_cards,related_product_ids,product_options
`;

async function loadProducts() {
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error || !rows?.length) {
    return PRODUCTS;
  }

  const { data: imageRows } = await supabase
    .from("product_images")
    .select("product_id,image_url,is_primary,sort_order")
    .in("product_id", rows.map((row) => row.id))
    .order("sort_order", { ascending: true });

  return normalizeProducts(rows, imageRows || []);
}

export default async function ProductsPage() {
  const products = await loadProducts();

  return (
    <>
      <PublicSiteNav active="products" variant="solid" />
      <ProductsLibraryClient products={products} />
    </>
  );
}
