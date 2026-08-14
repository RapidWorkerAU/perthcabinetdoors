"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QuoteListDrawer from "@/components/public/QuoteListDrawer";
import { useQuoteListCount } from "@/lib/pcd-quote-list";

function CartIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3.5 5h13l-1.2 7.5H5.2L3.5 5Z" />
      <path d="M3.5 5 3 2.75H1.4" />
      <circle cx="7" cy="16" r="1.1" />
      <circle cx="13.5" cy="16" r="1.1" />
    </svg>
  );
}

// The badge is hidden at zero, so a first-time visitor sees the nav exactly as
// it was. It appears the moment something is added, from any page.
function QuoteListButton({ className, onOpen }) {
  const count = useQuoteListCount();
  if (!count) return null;

  return (
    <button type="button" className={className} onClick={onOpen}>
      <CartIcon />
      My list
      <b>{count}</b>
    </button>
  );
}

// The same list, reachable without scrolling back up to the header. Only
// rendered once there is something on the list, and hidden while the drawer is
// open so it is not sitting on top of its own panel.
function QuoteListFab({ onOpen, hidden }) {
  const count = useQuoteListCount();
  if (!count || hidden) return null;

  return (
    <button
      type="button"
      className="public-site-list-fab"
      onClick={onOpen}
      aria-label={`Open your list, ${count} item${count === 1 ? "" : "s"}`}
    >
      <CartIcon size={22} />
      <b aria-hidden="true">{count}</b>
    </button>
  );
}

export default function PublicSiteNav({ active = "", variant = "solid" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
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
          <Link href="/start" className={isActive("start")} onClick={closeMenu}>
            Services
          </Link>
          <Link href="/finishes" className={isActive("finishes")} onClick={closeMenu}>
            Finishes
          </Link>
          <Link href="/contact" className={isActive("contact")} onClick={closeMenu}>
            Contact
          </Link>
        </div>
        {/* Quietest to loudest, left to right: a staff login, the customer's own
            list, then the one thing we want them to press. Login used to sit
            between the two buttons, which gave the least important item the
            most prominent slot. */}
        <div className="public-site-nav-actions">
          <Link href="/admin" className="public-site-nav-login">
            Login
          </Link>
          <QuoteListButton className="public-site-nav-list" onOpen={() => setListOpen(true)} />
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
            <Link href="/start" className={isActive("start")} onClick={closeMenu}>Services</Link>
            <Link href="/finishes" className={isActive("finishes")} onClick={closeMenu}>Finishes</Link>
            <Link href="/contact" className={isActive("contact")} onClick={closeMenu}>Contact</Link>
          </div>
          {/* Same order as the desktop bar: quietest first, primary last. */}
          <div className="public-site-mobile-menu-actions">
            <Link href="/admin" className="public-site-mobile-menu-login" onClick={closeMenu}>Login</Link>
            <QuoteListButton
              className="public-site-mobile-menu-list"
              onOpen={() => {
                closeMenu();
                setListOpen(true);
              }}
            />
            <Link href="/request-quote" className="public-site-mobile-menu-quote" onClick={closeMenu}>Get a Quote</Link>
          </div>
        </div>
      </div>

      <QuoteListFab onOpen={() => setListOpen(true)} hidden={listOpen || menuOpen} />
      <QuoteListDrawer open={listOpen} onClose={() => setListOpen(false)} />
    </nav>
  );
}
