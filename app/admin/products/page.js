import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import ProductsTable from "./_components/ProductsTable";

export default async function AdminProductsPage() {
  await requireAdminSession();
  const supabase = await createSupabaseServerClient();

  const { data: products } = await supabase
    .from("products")
    .select("id,name,card_title,category,is_active,sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const productIds = (products || []).map((p) => p.id);
  let imageCounts = {};
  let primaryImageByProduct = {};

  if (productIds.length) {
    const { data: imageRows } = await supabase
      .from("product_images")
      .select("product_id,image_url,is_primary,sort_order")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });

    imageCounts = (imageRows || []).reduce((acc, row) => {
      acc[row.product_id] = (acc[row.product_id] || 0) + 1;
      return acc;
    }, {});

    primaryImageByProduct = (imageRows || []).reduce((acc, row) => {
      const existing = acc[row.product_id];
      if (!existing || row.is_primary) {
        acc[row.product_id] = row.image_url;
      }
      return acc;
    }, {});
  }

  const rows = (products || []).map((product) => ({
    ...product,
    image_count: imageCounts[product.id] || 0,
    primary_image_url: primaryImageByProduct[product.id] || null,
  }));

  return (
    <AdminShell>
      <ProductsTable initialProducts={rows} />
    </AdminShell>
  );
}
