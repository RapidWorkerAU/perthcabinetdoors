"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

  return (
    <nav className={`public-site-nav public-site-nav-${variant}`} aria-label="Primary">
      <div className="public-site-nav-inner">
        <Link href="/" className="public-site-logo-link" aria-label="Perth Cabinet Doors home">
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" />
        </Link>
        <div className="public-site-nav-links" id="public-site-nav-links">
          <Link href="/" className={isActive("home")} onClick={closeMenu}>
            Home
          </Link>
          <Link href="/products" className={isActive("products")} onClick={closeMenu}>
            Products
          </Link>
          <Link href="/#how-it-works" onClick={closeMenu}>How It Works</Link>
          <Link href="/#materials" onClick={closeMenu}>Materials</Link>
          <Link href="/#bespoke" onClick={closeMenu}>Bespoke</Link>
          <Link href="/contact" className={isActive("contact")} onClick={closeMenu}>
            Contact
          </Link>
        </div>
        <div className="public-site-nav-actions">
          <Link href="/admin" className="public-site-nav-login">
            Login
          </Link>
          <Link href="/request-quote" className="public-site-nav-quote">
            Get a Quote
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
            <Link href="/" className={isActive("home")} onClick={closeMenu}>Home</Link>
            <Link href="/products" className={isActive("products")} onClick={closeMenu}>Products</Link>
            <Link href="/#how-it-works" onClick={closeMenu}>How It Works</Link>
            <Link href="/#materials" onClick={closeMenu}>Materials</Link>
            <Link href="/#bespoke" onClick={closeMenu}>Bespoke</Link>
            <Link href="/contact" className={isActive("contact")} onClick={closeMenu}>Contact</Link>
          </div>
          <div className="public-site-mobile-menu-actions">
            <Link href="/admin" className="public-site-mobile-menu-login" onClick={closeMenu}>Login</Link>
            <Link href="/request-quote" className="public-site-mobile-menu-quote" onClick={closeMenu}>Get a Quote</Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
