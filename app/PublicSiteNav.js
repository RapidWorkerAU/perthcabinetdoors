"use client";

import { useState } from "react";

export default function PublicSiteNav({ active = "", variant = "solid" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (key) => (active === key ? " is-active" : "");
  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className={`public-site-nav public-site-nav-${variant}`} aria-label="Primary">
      <div className="public-site-nav-inner">
        <a href="/" className="public-site-logo-link" aria-label="Perth Cabinet Doors home">
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" />
        </a>
        <div className="public-site-nav-links" id="public-site-nav-links">
          <a href="/" className={isActive("home")} onClick={closeMenu}>
            Home
          </a>
          <a href="/products" className={isActive("products")} onClick={closeMenu}>
            Products
          </a>
          <a href="/#how-it-works" onClick={closeMenu}>How It Works</a>
          <a href="/#materials" onClick={closeMenu}>Materials</a>
          <a href="/#bespoke" onClick={closeMenu}>Bespoke</a>
          <a href="/contact" className={isActive("contact")} onClick={closeMenu}>
            Contact
          </a>
        </div>
        <div className="public-site-nav-actions">
          <a href="/admin" className="public-site-nav-login">
            Login
          </a>
          <a href="/request-quote" className="public-site-nav-quote">
            Get a Quote
          </a>
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
        <div className="public-site-mobile-menu-panel">
          <div className="public-site-mobile-menu-header">
            <a href="/" className="public-site-mobile-menu-logo" aria-label="Perth Cabinet Doors home" onClick={closeMenu}>
              <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" />
            </a>
            <button className="public-site-mobile-menu-close" type="button" aria-label="Close menu" onClick={closeMenu}>
              <span aria-hidden="true" />
            </button>
          </div>
          <div className="public-site-mobile-menu-links">
            <a href="/" className={isActive("home")} onClick={closeMenu}>Home</a>
            <a href="/products" className={isActive("products")} onClick={closeMenu}>Products</a>
            <a href="/#how-it-works" onClick={closeMenu}>How It Works</a>
            <a href="/#materials" onClick={closeMenu}>Materials</a>
            <a href="/#bespoke" onClick={closeMenu}>Bespoke</a>
            <a href="/contact" className={isActive("contact")} onClick={closeMenu}>Contact</a>
          </div>
          <div className="public-site-mobile-menu-actions">
            <a href="/admin" className="public-site-mobile-menu-login" onClick={closeMenu}>Login</a>
            <a href="/request-quote" className="public-site-mobile-menu-quote" onClick={closeMenu}>Get a Quote</a>
          </div>
        </div>
      </div>
    </nav>
  );
}
