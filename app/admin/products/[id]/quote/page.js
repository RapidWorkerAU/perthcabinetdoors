import { notFound } from "next/navigation";
import AdminShell from "../../../_components/AdminShell";
import { requireAdminSession } from "../../../../../lib/admin-guard";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { FALLBACK_CONFIG } from "../../../../../lib/quote-config";
import ProductQuoteConfigForm from "../../_components/ProductQuoteConfigForm";

export default async function ProductQuoteConfigPage({ params }) {
  await requireAdminSession();

  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams?.id;

  if (!id) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const { data: product } = await supabase
    .from("products")
    .select("id,name,slug,card_title")
    .eq("id", id)
    .maybeSingle();

  if (!product) {
    notFound();
  }

  let quoteConfig = null;
  let optionSets = [];

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
      .select("id,name,code,kind,is_active")
      .eq("is_active", true)
      .order("kind", { ascending: true })
      .order("name", { ascending: true });
    optionSets = data || [];
  } catch (error) {
    optionSets = [];
  }

  return (
    <AdminShell>
      <ProductQuoteConfigForm
        product={product}
        initialConfig={quoteConfig}
        initialOptionSets={optionSets}
        fallbackConfig={FALLBACK_CONFIG}
      />
    </AdminShell>
  );
}
