import { pageMetadata } from "@/lib/pcd-seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicFooter from "@/components/public/PublicFooter";
import Image from "next/image";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import { SHOP_PRODUCTS } from "@/lib/pcd-shop";
import { loadShopCatalogue } from "@/lib/pcd-shop-pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../contact/contact.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shop Cabinet Doors Online | Perth Cabinet Doors",
  description:
    "Buy made to measure Polytec decorative board doors, drawer fronts and panels online. Priced as you size them, made in Perth and delivered across the Perth metro area.",
  // In the sitemap whenever the shop is open, so it carries a canonical. It
  // leaves the sitemap with the flag; the canonical is harmless either way.
  // See lib/pcd-seo.js.
  ...pageMetadata({
    path: "/products",
    title: "Shop Cabinet Doors Online | Perth Cabinet Doors",
    description:
      "Buy made to measure Polytec decorative board doors, drawer fronts and panels online. Priced as you size them, made in Perth and delivered across the Perth metro area.",
  }),
};

// THE SHOP. Everything on it can be bought today, and it says so. It also names
// what is NOT here, with a link straight across to the quote form, because
// somebody hunting for thermolaminate should find that sentence rather than an
// empty page. See the "Two Paths, One Website" plan.
export default async function ShopPage() {
  if (!SHOP_ENABLED) notFound();

  // THE COLOUR TILES THAT USED TO BE THE CARD ART HAVE GONE WITH IT. Each card
  // now shows its own photograph, named on the product, so there is nothing
  // here to pick a board for. What is still read from the catalogue is the
  // number of priced colours and the size limit, both of which are written into
  // the copy above the cards.
  let pricedCount = 0;
  let limit = { maxHeightMm: 2380, maxWidthMm: 1180 };
  try {
    const catalogue = await loadShopCatalogue(createSupabaseAdminClient());
    limit = catalogue.limit;
    pricedCount = new Set(catalogue.colours.filter((colour) => colour.priced).map((colour) => `${colour.finish}|${colour.colour}`)).size;
  } catch {
    pricedCount = 0;
  }

  return (
    <>
      <PublicSiteNav active="shop" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={`${styles.pageHeaderInner} ${styles.quotePageHeaderInner}`}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; Shop
            </div>
            <h1>
              Made to measure, <em>priced as you go</em>
            </h1>
            {/* NAMING THE CABINETS THEY ACTUALLY HAVE.
                The shop never used the words IKEA, Metod, Pax, Besta or
                Kaboodle anywhere, so somebody searching for a Kaboodle
                replacement door could not be sent to the one page on this site
                that would sell them one. */}
            <p>
              Polytec decorative board doors, drawer fronts and panels, cut to your sizes and edged in our Perth
              workshop. They fit IKEA Metod, Pax and Besta cabinets, Kaboodle cabinets from Bunnings, and any
              cabinet with a standard concealed hinge.
              {pricedCount ? ` ${pricedCount} colours with a live price.` : ""} You see the finished price,
              edging and all, before anything goes in the cart.
            </p>
          </div>
        </section>

        <section className={styles.shopWrap}>
          <div className={styles.shopCards}>
            {SHOP_PRODUCTS.map((product, index) => (
              <Link key={product.slug} className={styles.shopCard} href={`/products/${product.slug}`}>
                {/* A SQUARE FRAME FOR A SQUARE PICTURE.
                    These are 1024 x 1024 renders that carry their own
                    background to the edge, so the frame matches them rather
                    than cropping them: a short letterbox would cut the ground
                    off the picture as well as the piece. See the image note on
                    SHOP_PRODUCTS.

                    next/image rather than a plain img, which this project uses
                    everywhere else. The three PNGs come to 4.8MB between them
                    and this page is read on a phone; served through the
                    optimiser they arrive as WebP at the size the card actually
                    renders. */}
                <span className={styles.shopCardSwatch}>
                  <Image
                    src={product.image}
                    alt={product.imageAlt}
                    width={1024}
                    height={1024}
                    sizes="(max-width: 680px) 100vw, (max-width: 980px) 50vw, 340px"
                    priority={index === 0}
                  />
                </span>
                <span className={styles.shopCardBody}>
                  <strong>{product.name}</strong>
                  <span>{product.card}</span>
                  <span className={styles.shopCardMeta}>
                    Any size up to {limit.maxHeightMm} x {limit.maxWidthMm} mm
                  </span>
                  <span className={styles.shopCardGo}>Size and price it</span>
                </span>
              </Link>
            ))}
          </div>

          {/* NAMING WHAT IS NOT HERE is what stops the confusion. */}
          <div className={styles.shopElsewhere}>
            <strong>After thermolaminate, compact laminate, a benchtop or a whole kitchen?</strong>
            <p>
              They are not in the shop because we price them by hand. Put them on a quote list instead and we will come
              back to you within 1 to 3 business days.
            </p>
            <Link className={styles.shopElsewhereBtn} href="/request-quote">
              Start a quote request
            </Link>
          </div>

          <div className={styles.shopFacts}>
            <div>
              <strong>Made in Perth</strong>
              <span>Cut and edged in our own workshop, usually on its way within ten working days.</span>
            </div>
            <div>
              <strong>Delivered, Perth metro</strong>
              <span>One flat rate to any Perth metro postcode. Outside the metro area, email us for freight first.</span>
            </div>
            <div>
              <strong>Paid securely</strong>
              <span>Card payments are taken by Stripe. We never see your card.</span>
            </div>
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
