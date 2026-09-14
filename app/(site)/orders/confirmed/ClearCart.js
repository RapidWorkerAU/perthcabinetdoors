"use client";

import { useEffect } from "react";
import { clearShopCart } from "@/lib/pcd-shop-cart";

/** Paid, so the cart is emptied. The lines are an order now, not a cart. */
export default function ClearCart() {
  useEffect(() => {
    clearShopCart();
  }, []);
  return null;
}
