import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicFooter from "@/components/public/PublicFooter";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../contact/contact.module.css";
import CartClient from "./CartClient";

export const metadata = {
  // NOT FOR A SEARCH RESULT: a basket, and never anybody else's.
  // See NEVER_INDEX in lib/pcd-seo.js. robots.txt asks a crawler not to
  // fetch this; that line is what stops it being listed anyway.
  ...PRIVATE_PAGE_METADATA,
  title: "Your Cart | Perth Cabinet Doors",
};

export default function CartPage() {
  if (!SHOP_ENABLED) notFound();
  return (
    <>
      <PublicSiteNav active="shop" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={styles.pageHeaderInner}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/products">Shop</Link> &rsaquo; Cart
            </div>
            <h1>
              Your <em>cart</em>
            </h1>
            <p>Priced to the cent and ready to pay for. Change a size or a quantity before you check out.</p>
          </div>
        </section>
        <section className={styles.cartPageWrap}>
          <CartClient />
        </section>
        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
