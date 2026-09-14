"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PublicItemsPanel from "@/components/public/PublicItemsPanel";
import { useQuoteDraftCount } from "@/lib/pcd-quote-draft";
import { useCartCount } from "@/lib/pcd-shop-cart";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import { BUSINESS_PHONE, BUSINESS_PHONE_TEL } from "@/lib/pcd-business-identity";

// THE PUBLIC HEADER.
//
// ── WHAT IT CARRIES, AND WHERE ───────────────────────────────────────────────
//
// Two rows, because the bar was carrying four different kinds of thing at once
// and reading as four unrelated clusters: a staff door, a basket with no
// prices, a basket with prices, and the one button we want pressed.
//
//   the strip   what it is like to deal with us, and how to reach a human:
//               the trust line, the phone number, and the staff login.
//   the bar     who we are, what we sell, what you have with us, and the one
//               thing to press.
//
// ── THE NAV IS CENTRED ON THE SCREEN, NOT ON WHAT IS LEFT OVER ───────────────
//
// The row is a three column grid with EQUAL outer columns, 1fr auto 1fr, which
// is what puts the links in the middle of the window. It used to be auto 1fr
// auto, so the links were centred in the gap between the logo and the buttons
// and drifted left or right as either of those changed width. Adding or
// removing one action moved the whole nav. Do not change those outer columns
// back to auto.
//
// ── THE GREEN BUTTON IS CONTACT US, NOT GET A QUOTE ──────────────────────────
//
// The bar is the only thing on this site that appears on every page, so it
// carries the broad catch-all and the pages carry the specific ask. Every
// service page already asks for a quote in its own words, with room to say why,
// and the home hero leads with Get a Free Quote about a hundred pixels under
// this bar. Two green Get a Quote buttons in one screen was the duplication
// this removes.
//
// AND CONTACT IS NOT IN THE NAV. The button is the contact link, so a Contact
// item in the list beside it is the same destination twice, a few centimetres
// apart. What is left in the nav is four items that are all a kind of thing we
// make or sell, and nothing in it competes with the button.
//
// The phone menu is the exception, and it is not one: there is no bar button
// behind a hamburger, so the menu carries Contact Us as a button of its own,
// down with the other actions.

const NAV_LINKS = [
  { href: "/", label: "Home", key: "home" },
  { href: "/start", label: "Services", key: "start" },
  { href: "/products", label: "Shop", key: "shop", shopOnly: true },
  { href: "/finishes", label: "Finishes", key: "finishes" },
];

export default function PublicSiteNav({ active = "", variant = "solid" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuPanelRef = useRef(null);
  const isActive = (key) => (active === key ? " is-active" : "");
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = menuPanelRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusable?.[0];
    const lastElement = focusable?.[focusable.length - 1];
    firstElement?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeMenu();
        return;
      }

      if (event.key !== "Tab" || !firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const links = NAV_LINKS.filter((link) => !link.shopOnly || SHOP_ENABLED);

  return (
    <nav className={`public-site-nav public-site-nav-${variant}`} aria-label="Primary">
      {/* THE UTILITY STRIP. Everything about reaching us or being us, so the
          bar below is only about what we make and what you have with us. On a
          phone it keeps the phone number and drops the rest; the login is in
          the menu, which is where a staff member on a phone would look. */}
      <div className="public-site-utility">
        <div className="public-site-utility-inner">
          <p>Made in Perth &nbsp;&middot;&nbsp; Flat-rate metro delivery &nbsp;&middot;&nbsp; No minimum order</p>
          <div className="public-site-utility-links">
            <a href={BUSINESS_PHONE_TEL}>{BUSINESS_PHONE}</a>
            <a className="public-site-utility-login" href="/admin">
              Staff login
            </a>
          </div>
        </div>
      </div>

      <div className="public-site-nav-inner">
        <Link href="/" className="public-site-logo-link" aria-label="Perth Cabinet Doors home">
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" />
        </Link>

        <div className="public-site-nav-links" id="public-site-nav-links">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={isActive(link.key)} onClick={closeMenu}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="public-site-nav-actions">
          <PublicItemsPanel />
          <Link href="/contact" className="public-site-nav-quote">
            Contact Us
          </Link>
        </div>

        <button
          className="public-site-nav-menu-button"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="public-site-nav-mobile-menu"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span aria-hidden="true" />
        </button>
      </div>

      <div
        className={`public-site-mobile-menu ${menuOpen ? "is-open" : ""}`}
        id="public-site-nav-mobile-menu"
        aria-hidden={!menuOpen}
      >
        <div className="public-site-mobile-menu-panel" ref={menuPanelRef}>
          <div className="public-site-mobile-menu-header">
            <Link href="/" className="public-site-mobile-menu-logo" aria-label="Perth Cabinet Doors home" onClick={closeMenu}>
              <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" />
            </Link>
            <button className="public-site-mobile-menu-close" type="button" aria-label="Close menu" onClick={closeMenu}>
              <span aria-hidden="true" />
            </button>
          </div>

          <div className="public-site-mobile-menu-links">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={isActive(link.key)} onClick={closeMenu}>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Behind a hamburger there is no basket and no strip, so the menu
              carries what both of them would have: what you have with us, the
              one button, and the staff door last. */}
          <div className="public-site-mobile-menu-actions">
            <MobileItemsLinks onNavigate={closeMenu} />
            <Link href="/contact" className="public-site-mobile-menu-quote" onClick={closeMenu}>
              Contact Us
            </Link>
            <Link href="/admin" className="public-site-mobile-menu-login" onClick={closeMenu}>
              Staff login
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

// The two baskets as plain links in the menu, rather than a panel inside a
// panel. Each only appears once it has something in it, so a first-time
// visitor's menu is the nav and one button.
function MobileItemsLinks({ onNavigate }) {
  const quoteCount = useQuoteDraftCount();
  const cartCount = useCartCount();

  return (
    <>
      {quoteCount ? (
        <Link href="/request-quote/list" className="public-site-mobile-menu-list" onClick={onNavigate}>
          To be quoted <b>{quoteCount}</b>
        </Link>
      ) : null}
      {SHOP_ENABLED && cartCount ? (
        <Link href="/cart" className="public-site-mobile-menu-cart" onClick={onNavigate}>
          Cart <b>{cartCount}</b>
        </Link>
      ) : null}
    </>
  );
}
