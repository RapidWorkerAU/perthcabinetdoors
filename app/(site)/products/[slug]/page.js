import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import PublicFooter from "@/components/public/PublicFooter";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import { shopProduct } from "@/lib/pcd-shop";
import { loadShopCatalogue, publicShopCatalogue } from "@/lib/pcd-shop-pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import PublicSiteNav from "../../PublicSiteNav";
import styles from "../../contact/contact.module.css";
import ShopProductClient from "./ShopProductClient";

export const dynamic = "force-dynamic";

// The old catalogue's addresses, sent somewhere that still answers. The three
// decorative board products are the shop's own; everything else in the old
// catalogue is priced by hand, so it goes to the quote form.
const OLD_SLUGS = {
  "cabinet-door-decorative-board": "/products/flat-door",
  "drawer-front-decorative-board": "/products/drawer-front",
  "panel-decorative-board": "/products/flat-panel",
  "cabinet-door-thermolaminate": "/request-quote",
  "drawer-front-thermolaminate": "/request-quote",
  "panel-thermolaminate": "/request-quote",
  "compact-laminate-table-top": "/request-quote",
};

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const product = shopProduct(slug);
  if (!product) return { title: "Shop | Perth Cabinet Doors" };
  return {
    title: `${product.name}, made to measure | Perth Cabinet Doors`,
    // The cabinet names go in the description too, so a search result for
    // "Kaboodle replacement door" can show the sentence that answers it.
    description: [product.blurb, product.fits].filter(Boolean).join(" "),
  };
}

export default async function ShopProductPage({ params }) {
  if (!SHOP_ENABLED) notFound();
  const { slug } = await params;
  if (OLD_SLUGS[slug]) permanentRedirect(OLD_SLUGS[slug]);
  const product = shopProduct(slug);
  if (!product) notFound();

  // The catalogue as the browser may see it: colours, hinges and marked-up
  // prices, never a cost. Read on the server so the colour tiles are on the
  // page from the first paint.
  const catalogue = publicShopCatalogue(await loadShopCatalogue(createSupabaseAdminClient()));

  return (
    <>
      <PublicSiteNav active="shop" variant="solid" />
      {/* The page leaves room at the bottom for the price bar, which is fixed
          to the window rather than to this column. */}
      <main className={`${styles.page} ${styles.shopPageWithBar}`}>
        <section className={styles.pageHeader}>
          <div className={`${styles.pageHeaderInner} ${styles.quotePageHeaderInner}`}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/products">Shop</Link> &rsaquo; {product.name}
            </div>
            <h1>
              {product.name}, <em>made to measure</em>
            </h1>
            <p>{product.blurb}</p>
            {/* The cabinets it goes on, named. See `fits` in lib/pcd-shop.js. */}
            {product.fits ? <p className={styles.shopFits}>{product.fits}</p> : null}
          </div>
        </section>

        <section className={styles.quoteTablePageWrap}>
          <ShopProductClient product={product} catalogue={catalogue} />
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
