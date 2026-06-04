import { createSupabaseServerClient } from "./supabase/server";

function resolveImageSrc(imageUrl) {
  if (!imageUrl) return "";
  if (
    imageUrl.startsWith("/") ||
    imageUrl.startsWith("http://") ||
    imageUrl.startsWith("https://") ||
    imageUrl.startsWith("data:") ||
    imageUrl.startsWith("blob:")
  ) {
    return imageUrl;
  }
  return `/${imageUrl.replace(/^\.\//, "")}`;
}

function formatPrice(value, currency = "AUD") {
  if (value == null) return null;
  const amount = Number(value);
  if (Number.isNaN(amount)) return null;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export async function getCatalogProducts() {
  const supabase = await createSupabaseServerClient();

  const { data: products, error } = await supabase
    .from("products")
    .select("id,slug,name,card_title,category,price_from,currency,short_description,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error || !products?.length) {
    return [];
  }

  const productIds = products.map((p) => p.id);

  const { data: images } = await supabase
    .from("product_images")
    .select("product_id,image_url,is_primary,sort_order")
    .in("product_id", productIds)
    .order("sort_order", { ascending: true });

  const imageMap = new Map();
  for (const row of images || []) {
    const current = imageMap.get(row.product_id);
    if (!current || row.is_primary) {
      imageMap.set(row.product_id, row.image_url);
    }
  }

  return products.map((p) => ({
    ...p,
    title: p.card_title || p.name,
    priceLabel: formatPrice(p.price_from, p.currency || "AUD"),
    imageSrc: resolveImageSrc(imageMap.get(p.id) || ""),
  }));
}

export async function getProductBySlug(slug) {
  const supabase = await createSupabaseServerClient();

  const { data: product, error } = await supabase
    .from("products")
    .select(
      "id,slug,name,card_title,page_title,category,price_from,currency,short_description,long_description"
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !product) {
    return null;
  }

  const { data: images } = await supabase
    .from("product_images")
    .select("image_url,is_primary,sort_order")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const normalizedImages = (images || []).map((img) => ({
    ...img,
    imageSrc: resolveImageSrc(img.image_url),
  }));

  const primary = normalizedImages.find((img) => img.is_primary) || normalizedImages[0] || null;

  return {
    ...product,
    title: product.page_title || product.card_title || product.name,
    priceLabel: formatPrice(product.price_from, product.currency || "AUD"),
    images: normalizedImages,
    primaryImage: primary,
  };
}
