import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import { shopAccess } from "@/lib/pcd-shop-access";
import PublicSiteNav from "../PublicSiteNav";
import ShopClosed, { ShopPreviewBar } from "../ShopClosed";
import styles from "../contact/contact.module.css";
import CheckoutClient from "./CheckoutClient";

export const metadata = {
  // NOT FOR A SEARCH RESULT: the middle of paying for something.
  // See NEVER_INDEX in lib/pcd-seo.js. robots.txt asks a crawler not to
  // fetch this; that line is what stops it being listed anyway.
  ...PRIVATE_PAGE_METADATA,
  title: "Checkout | Perth Cabinet Doors",
};

export default async function CheckoutPage() {
  const access = await shopAccess();
  if (!access.allowed) return <ShopClosed />;
  return (
    <>
      {access.staff ? <ShopPreviewBar /> : null}
      <PublicSiteNav active="shop" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={styles.pageHeaderInner}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/products">Shop</Link> &rsaquo; <Link href="/cart">Cart</Link>{" "}
              &rsaquo; Checkout
            </div>
            <h1>Checkout</h1>
            <p>Nothing is charged until you press pay.</p>
          </div>
        </section>
        <section className={styles.cartPageWrap}>
          <CheckoutClient />
        </section>
        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
