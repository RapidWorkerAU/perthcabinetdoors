"use client";

// THE CROSSOVER, SAID AND NEVER MERGED.
//
// Somebody with a mixed job genuinely wants both baskets. So the quote list
// names the cart and links across, the same way the cart names the list, and
// neither ever adds the other into its own total. See the "Two Paths, One
// Website" plan.

import Link from "next/link";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import { cartPieceCount, money } from "@/lib/pcd-shop";
import { useShopCart } from "@/lib/pcd-shop-cart";
import styles from "../contact/contact.module.css";

export default function CrossToCart() {
  const cart = useShopCart();
  if (!SHOP_ENABLED || !cart.ready || !cart.lines.length) return null;
  const pieces = cartPieceCount(cart.lines);
  // The last figure the server gave each line. A first look, not a promise:
  // the cart asks again when it opens.
  const total = cart.lines.reduce((sum, line) => sum + (Number(line.price?.unitIncGst) || 0) * (Number(line.qty) || 1), 0);
  return (
    <div className={styles.crossCart}>
      <strong>
        You also have {pieces} {pieces === 1 ? "piece" : "pieces"}
        {total ? `, ${money(total)},` : ""} waiting in your cart.
      </strong>
      <p>That part is priced and can be paid for now. It is not part of this quote request.</p>
      <Link className={styles.crossCartBtn} href="/cart">
        Go to my cart
      </Link>
    </div>
  );
}
