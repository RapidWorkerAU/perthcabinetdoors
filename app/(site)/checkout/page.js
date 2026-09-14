import Link from "next/link";
import { notFound } from "next/navigation";
import PublicFooter from "@/components/public/PublicFooter";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../contact/contact.module.css";
import CheckoutClient from "./CheckoutClient";

export const metadata = {
  title: "Checkout | Perth Cabinet Doors",
};

export default function CheckoutPage() {
  if (!SHOP_ENABLED) notFound();
  return (
    <>
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
