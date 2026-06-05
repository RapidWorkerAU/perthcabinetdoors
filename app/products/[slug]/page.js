import { notFound } from "next/navigation";
import PublicSiteNav from "../../PublicSiteNav";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import {
  getProductBySlug,
  getRelatedProducts,
  getRelatedProductsFromList,
  normalizeProduct,
  normalizeProducts,
  PRODUCTS,
} from "../product-data";
import ProductDetailClient from "./ProductDetailClient";
import { getDatabaseColourFamilyForSelection, inferThicknessFromMaterial } from "../../../lib/pcd-colour-library";

export const dynamic = "force-dynamic";

const PRODUCT_SELECT = `
  id,name,slug,category,eyebrow,card_title,page_title,price_from,is_active,sort_order,
  short_description,long_description,meta_description,cta_label,cta_url,currency,features,finishes,
  type,type_label,material,material_label,compatibility,compatibility_label,ikea_system,style,
  standard_size,hero_caption,detail_description,finish_brand,lead_time,made_to_measure,pre_drilled,
  gallery_images,pricing_rows,info_cards,related_product_ids,product_options
`;

async function loadProductBySlug(slug) {
  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (!row) {
    return { product: getProductBySlug(slug), relatedProducts: null };
  }

  const [{ data: imageRows }, { data: allRows }] = await Promise.all([
    supabase
      .from("product_images")
      .select("product_id,image_url,is_primary,sort_order")
      .eq("product_id", row.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
  ]);

  const product = normalizeProduct(row, imageRows || []);
  const products = normalizeProducts(allRows || []);
  return {
    product,
    relatedProducts: getRelatedProductsFromList(product, products),
  };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { product } = await loadProductBySlug(slug);

  if (!product) {
    return {
      title: "Product | Perth Cabinet Doors",
      description: "Product details for Perth Cabinet Doors.",
    };
  }

  return {
    title: `${product.name} | Perth Cabinet Doors`,
    description: product.detailDesc,
  };
}

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;
  const { product, relatedProducts } = await loadProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const colourFamily = await getDatabaseColourFamilyForSelection(supabase, {
    material: product.material,
    thickness: inferThicknessFromMaterial(product.materialLabel || product.material),
  });

  return (
    <>
      <PublicSiteNav active="products" variant="solid" />
      <ProductDetailClient
        product={product}
        relatedProducts={relatedProducts || getRelatedProducts(product)}
        colourFamily={colourFamily}
      />
    </>
  );
}
