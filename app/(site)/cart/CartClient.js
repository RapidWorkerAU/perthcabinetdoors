"use client";

// THE CART, WHICH IS NOT THE QUOTE LIST.
//
// The quote list's layout in the shop's green: a card per line on the left, and
// on the right, where the list says "No price yet", a real total and a Checkout
// button. Each line can have its quantity changed or be removed here; anything
// more goes back to its product page, which is the only place that knows what
// a door may and may not be asked.
//
// The figures are the server's, asked again every time the cart opens, so a
// rate that changed since a line went in is shown before anything is paid.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuoteDraftCount } from "@/lib/pcd-quote-draft";
import { cartPieceCount, describeProblems, money, shopLineSpec, shopLineTitle } from "@/lib/pcd-shop";
import { rememberCartPrices, removeCartLine, setCartLineQty, useShopCart } from "@/lib/pcd-shop-cart";
import styles from "../contact/contact.module.css";

/** What the server needs of a cart line. */
export function linesForServer(lines = []) {
  return lines.map(({ price, colour, finish, colourSrc, material, supplierName, type, hingeQtyTouched, hingeName, ...rest }) => rest);
}

/**
 * The cart priced by the server. Re-asked whenever a line or the postcode
 * changes, a moment after the last change.
 */
export function useCartPrice(lines, postcode = "", refresh = 0) {
  const [state, setState] = useState({ price: null, loading: false, error: "" });
  // `refresh` asks again with nothing else changed, for when the server has
  // just said the prices moved.
  const key = JSON.stringify({ lines: linesForServer(lines), postcode, refresh });

  useEffect(() => {
    const body = JSON.parse(key);
    if (!body.lines.length) {
      setState({ price: null, loading: false, error: "" });
      return undefined;
    }
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/shop/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: body.lines, ...(body.postcode ? { postcode: body.postcode } : {}) }),
        });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok || !payload.ok) throw new Error(payload?.error || "We could not price your cart just now.");
        rememberCartPrices(payload.lines);
        setState({ price: payload, loading: false, error: "" });
      } catch (error) {
        if (!cancelled) setState({ price: null, loading: false, error: error.message || "We could not price your cart just now." });
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  return state;
}

export function CrossToList({ count }) {
  if (!count) return null;
  return (
    <div className={styles.crossList}>
      <strong>
        You also have {count} {count === 1 ? "item" : "items"} on a quote list.
      </strong>
      <p>
        Those are not in this total, because we have not priced them yet. Pay for this cart now and send the list
        separately, or the other way round.
      </p>
      <Link className={styles.crossListBtn} href="/request-quote/list">
        Go to my quote list
      </Link>
    </div>
  );
}

export default function CartClient() {
  const cart = useShopCart();
  if (!cart.ready) return <div className={styles.listWaiting} aria-hidden="true" />;
  return <Cart lines={cart.lines} />;
}

function Cart({ lines }) {
  const listCount = useQuoteDraftCount();
  const { price, loading, error } = useCartPrice(lines);
  const pieces = cartPieceCount(lines);
  const byId = new Map((price?.lines || []).map((entry) => [entry.id, entry]));

  if (!lines.length) {
    return (
      <div className={styles.listEmpty}>
        <h2>Your cart is empty</h2>
        <p>Size a door, drawer front or panel and it will land here with its price.</p>
        <Link className={styles.cartEmptyBtn} href="/products">
          Shop doors and panels
        </Link>
        <div style={{ marginTop: 24, textAlign: "left" }}>
          <CrossToList count={listCount} />
        </div>
      </div>
    );
  }

  const ready = Boolean(price?.ready) && !loading;

  return (
    <div className={styles.listPage}>
      <div className={styles.cartNotice}>
        <strong>This is your cart.</strong>
        <p>Everything here is priced and can be paid for now. Nothing is charged until you pay at checkout.</p>
      </div>

      <div className={styles.listGrid}>
        <div className={styles.listLines}>
          {lines.map((line) => {
            const priced = byId.get(line.id) || null;
            const shown = priced?.ok ? priced : line.price || null;
            const qty = Math.max(1, Number(line.qty) || 1);
            return (
              <article className={styles.listLine} key={line.id}>
                <div className={styles.listLineTop}>
                  <div className={styles.listLineWhat}>
                    <div className={styles.listLineTitle}>
                      <strong>{shopLineTitle(line)}</strong>
                      <span className={styles.cartPill}>Priced</span>
                    </div>
                    {shopLineSpec(line, { hinge: line.hingeName ? { name: line.hingeName } : null }).map(([label, value]) => (
                      <p key={label}>
                        <span className={styles.cartSpecLabel}>{label}</span> {value}
                      </p>
                    ))}
                    {priced && !priced.ok ? (
                      <p className={styles.cartLineProblem}>
                        This needs changing before it can be paid for: {describeProblems(priced.problems)}.
                      </p>
                    ) : null}
                  </div>
                  {line.colourSrc ? <img alt="" className={styles.listLineSwatch} src={line.colourSrc} /> : null}
                </div>

                <div className={styles.listLineFoot}>
                  <div className={styles.listQty}>
                    <button
                      type="button"
                      aria-label={`One fewer ${shopLineTitle(line)}`}
                      disabled={qty <= 1}
                      onClick={() => setCartLineQty(line.id, qty - 1)}
                    >
                      &minus;
                    </button>
                    <span>{qty}</span>
                    <button type="button" aria-label={`One more ${shopLineTitle(line)}`} onClick={() => setCartLineQty(line.id, qty + 1)}>
                      +
                    </button>
                  </div>
                  <div className={styles.listLineActions}>
                    <Link className={styles.listEditLink} href={`/products/${line.product}?edit=${encodeURIComponent(line.id)}`}>
                      Change
                    </Link>
                    <button className={styles.listRemoveBtn} type="button" onClick={() => removeCartLine(line.id)}>
                      Remove
                    </button>
                  </div>
                  <div className={styles.cartLinePrice}>
                    {shown ? (
                      <>
                        <span>{money(shown.unitIncGst)} each</span>
                        <strong>{money(shown.unitIncGst * qty)}</strong>
                      </>
                    ) : (
                      <span>...</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          <Link className={styles.cartAddMore} href="/products">
            Add another door, drawer front or panel
          </Link>
          <CrossToList count={listCount} />
        </div>

        <aside className={styles.cartSide}>
          <div className={styles.cartSideHead}>
            <span className={styles.sectionLabel}>Order summary</span>
          </div>
          <div className={styles.cartSideBody}>
            <div className={styles.cartRow}>
              <span>
                {pieces} {pieces === 1 ? "piece" : "pieces"}, ex GST
              </span>
              <span>{price ? money(price.totals.goodsExGst) : "..."}</span>
            </div>
            <div className={styles.cartRow}>
              <span>Delivery, Perth metro</span>
              <span>{price ? money(price.totals.deliveryExGst) : "..."}</span>
            </div>
            <div className={styles.cartRow}>
              <span>GST</span>
              <span>{price ? money(price.totals.gstAmount) : "..."}</span>
            </div>
            <div className={styles.cartTotal}>
              <span>Total inc GST</span>
              <strong>{price ? money(price.totals.totalIncGst) : "..."}</strong>
            </div>
            {error ? <p className={styles.fieldError}>{error}</p> : null}
            {price && !price.ready ? (
              <p className={styles.fieldError}>One of your lines needs changing before you can check out.</p>
            ) : null}
            {ready ? (
              <Link className={styles.cartCheckoutBtn} href="/checkout">
                Checkout
              </Link>
            ) : (
              <span className={`${styles.cartCheckoutBtn} ${styles.cartCheckoutBtnOff}`} aria-disabled="true">
                {loading ? "Working out your total..." : "Checkout"}
              </span>
            )}
            <p className={styles.cartSideFoot}>Made in Perth &middot; about 10 working days &middot; delivered Perth metro</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
