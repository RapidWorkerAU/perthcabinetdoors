"use client";

// CHECKOUT. WHO IT IS FOR, WHERE IT GOES, AND PAY.
//
// The quote form's send page takes a name and an email because there is no
// price. This takes a delivery address and a card, because there is. Same
// layout, so the flow feels like the site, and the one difference that matters
// said where the total is.
//
// Delivered, never collected: there is no pickup option, and an address is
// always asked for. Perth metro is a flat rate, decided by postcode; anywhere
// else is told to email for freight before ordering, and cannot pay here.
//
// Nothing is charged on this page. Pay writes the order's quote on the server,
// which prices the cart again and refuses to charge a figure other than the one
// on screen, then hands over to Stripe.

import Link from "next/link";
import { useEffect, useState } from "react";
import { SALES_EMAIL } from "@/lib/pcd-business-identity";
import { cartPieceCount, checkoutDetailProblems, isMetroPostcode, money, shopLineTitle } from "@/lib/pcd-shop";
import { rememberCheckout, useShopCart, writeCheckoutDetails } from "@/lib/pcd-shop-cart";
import { linesForServer, useCartPrice } from "../cart/CartClient";
import styles from "../contact/contact.module.css";

const FIELDS = {
  name: { label: "Name", type: "text", autoComplete: "name", placeholder: "Sarah Jones" },
  phone: { label: "Phone", type: "tel", autoComplete: "tel", placeholder: "0400 000 000" },
  email: { label: "Email", type: "email", autoComplete: "email", placeholder: "sarah@email.com" },
  street: { label: "Street address", type: "text", autoComplete: "address-line1", placeholder: "14 Rokeby Road" },
  suburb: { label: "Suburb", type: "text", autoComplete: "address-level2", placeholder: "Subiaco" },
  postcode: { label: "Postcode", type: "text", autoComplete: "postal-code", placeholder: "6008", inputMode: "numeric" },
};

export default function CheckoutClient() {
  const cart = useShopCart();
  if (!cart.ready) return <div className={styles.listWaiting} aria-hidden="true" />;
  return <Checkout cart={cart} />;
}

function Checkout({ cart }) {
  const lines = cart.lines;
  const [details, setDetails] = useState(() => ({
    name: "",
    phone: "",
    email: "",
    street: "",
    suburb: "",
    postcode: "",
    ...cart.details,
  }));
  const [shown, setShown] = useState({});
  const [status, setStatus] = useState(null);
  const [paying, setPaying] = useState(false);
  const [returned, setReturned] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    setReturned(new URLSearchParams(window.location.search).get("returned") === "1");
  }, []);

  const postcode = /^\d{4}$/.test(String(details.postcode).trim()) ? String(details.postcode).trim() : "";
  const { price, loading, error } = useCartPrice(lines, postcode, refresh);
  const problems = checkoutDetailProblems(details);
  const outsideMetro = Boolean(postcode) && !isMetroPostcode(postcode);
  const pieces = cartPieceCount(lines);
  const byId = new Map((price?.lines || []).map((entry) => [entry.id, entry]));

  function set(field, value) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  async function pay(event) {
    event.preventDefault();
    setStatus(null);
    // Every box marked at once, rather than one complaint per press.
    setShown(Object.fromEntries(Object.keys(FIELDS).map((key) => [key, true])));
    if (Object.keys(problems).length) {
      setStatus({ message: "Some of your details need another look." });
      return;
    }
    if (!price?.ready) {
      setStatus({ message: "Your cart needs changing before it can be paid for." });
      return;
    }

    setPaying(true);
    // Kept before the request goes out, so a failed payment does not cost them
    // everything they typed.
    writeCheckoutDetails(details);
    try {
      const response = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: linesForServer(lines),
          details,
          expectedTotalIncGst: price.totals.totalIncGst,
          ...(cart.lastQuoteId ? { previousQuoteId: cart.lastQuoteId } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setStatus({ message: result.error || "We could not start your payment. Nothing has been charged." });
        setPaying(false);
        // The prices moved while they were typing: show the new total before
        // they press pay again.
        if (response.status === 409) setRefresh((count) => count + 1);
        return;
      }
      // The quote behind this page, so coming back and paying again closes it.
      rememberCheckout(result.quoteId);
      window.location.assign(result.checkoutUrl);
    } catch {
      setStatus({ message: "We could not start your payment. Nothing has been charged. Please try again." });
      setPaying(false);
    }
  }

  if (!lines.length) {
    return (
      <div className={styles.listEmpty}>
        <h2>There is nothing to pay for yet</h2>
        <p>Size a door, drawer front or panel and it will land in your cart with its price.</p>
        <Link className={styles.cartEmptyBtn} href="/products">
          Shop doors and panels
        </Link>
      </div>
    );
  }

  const field = (key, wide = false) => {
    const spec = FIELDS[key];
    const message = shown[key] || (key === "postcode" && outsideMetro) ? problems[key] : "";
    return (
      <div className={`${styles.field}${wide ? ` ${styles.checkoutWide}` : ""}`} key={key}>
        <label htmlFor={`checkout-${key}`}>{spec.label}</label>
        <input
          id={`checkout-${key}`}
          type={spec.type}
          autoComplete={spec.autoComplete}
          inputMode={spec.inputMode}
          placeholder={spec.placeholder}
          value={details[key]}
          className={message ? styles.fieldInputError : ""}
          onChange={(event) => set(key, event.target.value)}
          onBlur={() => setShown((current) => ({ ...current, [key]: true }))}
        />
        {message ? <span className={styles.fieldError}>{message}</span> : null}
      </div>
    );
  };

  return (
    <form className={styles.listPage} onSubmit={pay} noValidate>
      {returned ? (
        <div className={styles.cartNotice}>
          <strong>Your payment was not taken.</strong>
          <p>Nothing has been charged. Change anything you like and pay again when you are ready.</p>
        </div>
      ) : null}

      <div className={styles.listGrid}>
        <div className={styles.sendMain}>
          <div className={styles.sendCard}>
            <span className={styles.sectionLabel}>Who it is for</span>
            <div className={styles.quoteFieldGrid}>
              {field("name")}
              {field("phone")}
            </div>
            {field("email", true)}
            <p className={styles.sendNote}>Your receipt and the day it is ready both go to this email.</p>
          </div>

          {/* WHERE IT GOES. Not a choice, so not offered as one: a list with a
              single option in it asks somebody to pick between one thing. */}
          <div className={styles.sendCard}>
            <div className={styles.checkoutDeliveryHead}>
              <span className={styles.sectionLabel}>Where it goes</span>
              <strong>{price ? money(price.totals.deliveryExGst) : ""} ex GST</strong>
            </div>
            <p className={styles.sendNote} style={{ marginTop: 0, marginBottom: 14 }}>
              Delivery, Perth metro. One flat rate to any metro postcode, two to three days after it is made.
            </p>
            {field("street", true)}
            <div className={styles.quoteFieldGrid}>
              {field("suburb")}
              {field("postcode")}
            </div>
            <p className={styles.sendNote}>
              Outside the Perth metro area? Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> before you order and
              we will price the freight. We do not have a pickup option.
            </p>
          </div>

          <div className={styles.sendCard}>
            <span className={styles.sectionLabel}>What you are buying</span>
            {lines.map((line) => {
              const priced = byId.get(line.id);
              const qty = Math.max(1, Number(line.qty) || 1);
              return (
                <div className={styles.sendLine} key={line.id}>
                  <span>
                    {qty} x {shopLineTitle(line)}, {line.height} x {line.width} mm
                  </span>
                  <strong>{priced?.ok ? money(priced.totalIncGst) : "..."}</strong>
                </div>
              );
            })}
            <Link className={styles.sendBackLink} href="/cart">
              Change my cart
            </Link>
          </div>
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
            <button className={styles.cartPayBtn} type="submit" disabled={paying || loading || !price?.ready || outsideMetro}>
              {paying ? "Taking you to payment..." : price ? `Pay ${money(price.totals.totalIncGst)}` : "Pay"}
            </button>
            {status ? <p className={styles.fieldError}>{status.message}</p> : null}
            <p className={styles.cartSideFoot}>Card payment, handled by Stripe. We never see your card.</p>
          </div>
        </aside>
      </div>
    </form>
  );
}
