"use client";

// WHAT A SHOP PAGE SHOWS WHILE THE SHOP IS CLOSED IN SETTINGS.
//
// A person following an old link, or coming back to a cart they filled while
// it was open, is told plainly and given the way forward: the quote form, and
// for anything already in their cart, one button that carries it across to a
// quote list whole. Decided 28 September 2026: a closed page, not a 404.

import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicFooter from "@/components/public/PublicFooter";
import { readQuoteDraft, writeQuoteLines } from "@/lib/pcd-quote-draft";
import { cartPieceCount, shopLineToQuoteLine } from "@/lib/pcd-shop";
import { clearShopCart, useShopCart } from "@/lib/pcd-shop-cart";
import PublicSiteNav from "./PublicSiteNav";
import styles from "./contact/contact.module.css";

export default function ShopClosed() {
  const router = useRouter();
  const cart = useShopCart();
  const pieces = cart.ready ? cartPieceCount(cart.lines) : 0;

  function moveCart() {
    const moved = cart.lines.map((line) => shopLineToQuoteLine(line, { hingeName: line.hingeName || "" }));
    writeQuoteLines([...readQuoteDraft().lines, ...moved]);
    clearShopCart();
    router.push("/request-quote/list");
  }

  return (
    <>
      <PublicSiteNav active="shop" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={styles.pageHeaderInner}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; Shop
            </div>
            <h1>
              Our online shop is <em>closed right now</em>
            </h1>
            <p>
              You can still get everything we make. Build a list on the quote form and we will price it by hand and
              email it back, usually within 1 to 3 business days. Nothing is charged until you accept the quote.
            </p>
          </div>
        </section>
        <section className={styles.cartPageWrap}>
          <div className={styles.listEmpty}>
            {pieces ? (
              <>
                <h2>
                  You have {pieces} {pieces === 1 ? "item" : "items"} in your cart
                </h2>
                <p>Move them to a quote list and we will price them for you. Sizes, colours and hinge positions all go across.</p>
                <button type="button" className={styles.cartEmptyBtn} onClick={moveCart}>
                  Move them to my quote list
                </button>
              </>
            ) : (
              <>
                <h2>Get a quote instead</h2>
                <p>Doors, drawer fronts, panels and anything else we make, priced by hand.</p>
                <Link className={styles.cartEmptyBtn} href="/request-quote">
                  Start a quote request
                </Link>
              </>
            )}
          </div>
        </section>
        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}

/**
 * THE BAR STAFF SEE ON A CLOSED SHOP, so a preview is never mistaken for the
 * shop being open. Server rendered: nothing on it changes.
 */
export function ShopPreviewBar() {
  return (
    <div
      role="status"
      style={{
        background: "#fffdf0",
        borderBottom: "1px solid #e8d68f",
        color: "#8a6d0b",
        fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
        fontSize: 13,
        lineHeight: 1.5,
        padding: "10px 16px",
        textAlign: "center",
      }}
    >
      <strong>The shop is closed to the public.</strong> You can see it because you are signed in as staff. Open it in
      Settings, Shop and Site Messages.
    </div>
  );
}
