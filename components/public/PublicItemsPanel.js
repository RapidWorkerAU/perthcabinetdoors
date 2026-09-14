"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { draftItemCount, useQuoteDraft } from "@/lib/pcd-quote-draft";
import { lineSpecLine, lineTitle } from "@/lib/pcd-quote-line-text";
import { cartPieceCount, money, shopLineTitle } from "@/lib/pcd-shop";
import { useShopCart } from "@/lib/pcd-shop-cart";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import styles from "./public-items-panel.module.css";

// ONE BASKET IN THE BAR, TWO INSIDE IT.
//
// ── WHY THIS REPLACED TWO BUTTONS ────────────────────────────────────────────
//
// The bar used to carry My list and Cart side by side: two outline pills of
// nearly the same size, each with a coloured badge, sitting next to a staff
// login and the one button we actually want pressed. Four things, four kinds of
// thing, and the eye had to read them to tell them apart. This is one control
// with one number, and the distinction moves inside the panel where there is
// room to say it in words rather than rely on somebody noticing a colour.
//
// ── THE TWO STILL NEVER ADD INTO ONE ANOTHER ─────────────────────────────────
//
// Which is the rule this design has to be careful about. The button's number is
// how many things you have with us, and that is all it claims. It is never a
// total, there is never a price on it, and the two tabs behind it keep their
// own lines, their own wording and their own way out. The quote tab has no
// prices anywhere and says so; the cart tab has prices and a way to pay.
//
// The badge colour is the one rule a merged basket needs that two separate ones
// do not: green while there is something payable in it, amber while everything
// in it is waiting on a price. Those are the site's two colours for those two
// states, so it is the existing language, not a new one.
//
// ── THE CART FIGURES ARE THE LAST ONES THE SERVER GAVE ───────────────────────
//
// Each cart line carries the price it was quoted at when it went in, kept by
// lib/pcd-shop-cart.js. This shows that, the same way the cart page's first
// paint does, and it never asks the server itself: a basket peek is not worth a
// pricing request on every page. The cart re-prices when it opens and the
// checkout charges only what the server says, so the line under the total says
// plainly that this is the last figure rather than a promise.

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 5h10M7 10h10M7 15h10" />
      <circle cx="3.5" cy="5" r="0.9" />
      <circle cx="3.5" cy="10" r="0.9" />
      <circle cx="3.5" cy="15" r="0.9" />
    </svg>
  );
}

const MAX_SHOWN = 4;

function qtyOf(line) {
  return Math.max(1, Number(line?.qty) || 1);
}

/** What the cart was last told each line costs, and whether all of them answered. */
function cartTotal(lines) {
  let total = 0;
  let complete = true;
  lines.forEach((line) => {
    const priced = line?.price;
    if (priced?.ok && Number.isFinite(Number(priced.totalIncGst))) total += Number(priced.totalIncGst);
    else complete = false;
  });
  return { total, complete };
}

export default function PublicItemsPanel({ className = "" }) {
  const draft = useQuoteDraft();
  const cart = useShopCart();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("");
  const wrapRef = useRef(null);

  const quoteLines = draft.ready ? draft.lines : [];
  const cartLines = SHOP_ENABLED && cart.ready ? cart.lines : [];
  const quoteCount = draftItemCount(quoteLines);
  const cartCount = cartPieceCount(cartLines);
  const total = quoteCount + cartCount;

  // WHICH TAB OPENS. The cart when there is one, because that is the basket
  // with money waiting in it. Otherwise the list. Only decided when the panel
  // opens, so a tab somebody has chosen is not swapped under them.
  const showing = tab || (cartCount ? "cart" : "quote");

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  // Nothing with us yet means no basket in the bar. A first-time visitor sees
  // the header without it, and the way into the shop is the Shop link in the
  // nav, which is a better door for somebody who has not started than a basket
  // reading zero.
  if (!total) return null;

  const money0 = cartTotal(cartLines);

  return (
    <div className={`${styles.wrap}${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        <ListIcon />
        Your items
        <b className={`${styles.count} ${cartCount ? styles.countCart : styles.countQuote}`}>{total}</b>
      </button>

      {open ? (
        <div className={styles.panel}>
          {SHOP_ENABLED ? (
            <div className={styles.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                className={`${styles.tab} ${styles.tabQuote}`}
                aria-selected={showing === "quote"}
                onClick={() => setTab("quote")}
              >
                To be quoted ({quoteCount})
              </button>
              <button
                type="button"
                role="tab"
                className={`${styles.tab} ${styles.tabCart}`}
                aria-selected={showing === "cart"}
                onClick={() => setTab("cart")}
              >
                Cart ({cartCount})
              </button>
            </div>
          ) : null}

          {showing === "quote" ? (
            quoteCount ? (
              <>
                <div className={styles.head}>
                  <strong>To be quoted</strong>
                  <span className={`${styles.tag} ${styles.tagQuote}`}>No prices</span>
                </div>
                <div className={styles.lines}>
                  {quoteLines.slice(0, MAX_SHOWN).map((line) => (
                    <div className={styles.line} key={line.id}>
                      <span>
                        <b>
                          {qtyOf(line) > 1 ? `${qtyOf(line)} x ` : ""}
                          {lineTitle(line)}
                        </b>
                        <span>{lineSpecLine(line)}</span>
                      </span>
                      <span className={styles.unpriced}>Quote</span>
                    </div>
                  ))}
                  {quoteLines.length > MAX_SHOWN ? (
                    <p className={styles.more}>and {quoteLines.length - MAX_SHOWN} more</p>
                  ) : null}
                </div>
                <div className={styles.foot}>
                  <p className={styles.msg}>
                    Nothing here has a price and nothing is charged. We work these out by hand and email you,
                    usually the same day.
                  </p>
                  <Link className={`${styles.go} ${styles.goQuote}`} href="/request-quote/list" onClick={() => setOpen(false)}>
                    Review and send
                  </Link>
                </div>
              </>
            ) : (
              <div className={styles.empty}>
                Nothing on your list yet.
                <br />
                Anything we price by hand lands here.
              </div>
            )
          ) : cartCount ? (
            <>
              <div className={styles.head}>
                <strong>Cart</strong>
                <span className={`${styles.tag} ${styles.tagCart}`}>Priced</span>
              </div>
              <div className={styles.lines}>
                {cartLines.slice(0, MAX_SHOWN).map((line) => (
                  <div className={styles.line} key={line.id}>
                    <span>
                      <b>
                        {qtyOf(line) > 1 ? `${qtyOf(line)} x ` : ""}
                        {shopLineTitle(line)}
                      </b>
                      <span>
                        {line.height} x {line.width} mm
                      </span>
                    </span>
                    <span className={styles.amount}>
                      {line.price?.ok ? money(line.price.totalIncGst) : "..."}
                    </span>
                  </div>
                ))}
                {cartLines.length > MAX_SHOWN ? (
                  <p className={styles.more}>and {cartLines.length - MAX_SHOWN} more</p>
                ) : null}
              </div>
              <div className={styles.foot}>
                {money0.complete ? (
                  <div className={styles.total}>
                    <span>Subtotal inc GST</span>
                    <strong>{money(money0.total)}</strong>
                  </div>
                ) : null}
                <p className={styles.msgQuiet}>
                  {money0.complete
                    ? "The last figure we were given. The cart works it out again when you open it, and delivery is added there."
                    : "Open the cart to price these."}
                </p>
                <Link className={`${styles.go} ${styles.goCart}`} href="/cart" onClick={() => setOpen(false)}>
                  View cart
                </Link>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              Your cart is empty.
              <br />
              Flat fronts you size in the shop land here.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
