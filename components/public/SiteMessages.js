"use client";

// THE MESSAGES SET IN SETTINGS > SHOP AND SITE MESSAGES, on the public site.
//
// Each one shows only while it has text and today, in Perth, is inside its
// dates. See lib/pcd-site-settings.js. Plain text only: whatever is typed is
// shown as words, never as markup.

import { useEffect, useRef, useState } from "react";
import { activeBannerMessages, activeMessage, activePopup, leadTimeDays, leadTimeDaysForLines, leadTimeWords } from "@/lib/pcd-site-settings";
import { useSiteSettings } from "./SiteSettingsProvider";
import styles from "./site-messages.module.css";

// How fast the banner moves, in pixels a second. The same reading speed
// however many messages there are and however wide the screen is.
const BANNER_PIXELS_PER_SECOND = 70;

/**
 * Across the top of every page, scrolling. Rendered by app/(site)/layout.js.
 *
 * Every message showing today runs one after another, a dot between each. The
 * set is repeated as often as it takes to cover the screen, then the whole run
 * is doubled and moved by exactly half, so the second half lands where the
 * first began and the words never stop or leave a blank stretch, on a phone or
 * a wide monitor.
 */
export function SiteBanner() {
  const texts = activeBannerMessages(useSiteSettings());
  const bannerRef = useRef(null);
  const setRef = useRef(null);
  const [fit, setFit] = useState({ copies: 1, seconds: 30 });
  const key = texts.join("|");

  useEffect(() => {
    const banner = bannerRef.current;
    const set = setRef.current;
    if (!banner || !set) return undefined;
    const measure = () => {
      const setWidth = set.getBoundingClientRect().width;
      if (!(setWidth > 0)) return;
      const copies = Math.max(1, Math.ceil(banner.getBoundingClientRect().width / setWidth));
      const seconds = Math.max(8, Math.round((setWidth * copies) / BANNER_PIXELS_PER_SECOND));
      setFit((current) => (current.copies === copies && current.seconds === seconds ? current : { copies, seconds }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(banner);
    return () => observer.disconnect();
  }, [key]);

  if (!texts.length) return null;
  const oneSet = (copy) =>
    texts.map((text, index) => (
      <span key={`${copy}-${index}`} className={styles.bannerItem}>
        {text}
      </span>
    ));
  const half = (side) =>
    Array.from({ length: fit.copies }, (_, copy) => (
      <span
        key={`${side}-${copy}`}
        ref={side === 0 && copy === 0 ? setRef : undefined}
        className={styles.bannerSet}
        aria-hidden={side === 0 && copy === 0 ? undefined : "true"}
      >
        {oneSet(`${side}-${copy}`)}
      </span>
    ));
  return (
    <div ref={bannerRef} className={styles.banner} role="region" aria-label="Announcement" style={{ "--banner-seconds": `${fit.seconds}s` }}>
      <div className={styles.bannerTrack}>
        {half(0)}
        {half(1)}
      </div>
    </div>
  );
}

/**
 * A notice in one place: "shop", "checkout" or "quote". Nothing at all while
 * that message is empty or out of its dates.
 */
export function SiteNotice({ placement, label = "Please note" }) {
  const text = activeMessage(useSiteSettings(), placement);
  if (!text) return null;
  return (
    <div className={styles.notice} role="note">
      <strong>{label}</strong>
      {text}
    </div>
  );
}

// Remembered for the visit only: a new visit shows it again, by choice.
const POPUP_SEEN_KEY = "pcd-site-popup-seen";

/**
 * The popup over the Contact and Request a Quote pages, while it has words and
 * today is inside its dates. Acknowledged once a visit: the browser tab
 * remembers it until it closes, and an edited popup shows again straight away.
 *
 * Opened after the page has drawn, never on the server, because whether it has
 * been seen lives only in the browser.
 */
export function SitePopup() {
  const popup = activePopup(useSiteSettings());
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const fingerprint = popup ? `${popup.heading}\n${popup.text}` : "";

  useEffect(() => {
    if (!fingerprint) return;
    let seen = "";
    try {
      seen = window.sessionStorage.getItem(POPUP_SEEN_KEY) || "";
    } catch {}
    if (seen !== fingerprint) setOpen(true);
  }, [fingerprint]);

  useEffect(() => {
    if (!open) return undefined;
    buttonRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!popup || !open) return null;

  function acknowledge() {
    try {
      window.sessionStorage.setItem(POPUP_SEEN_KEY, fingerprint);
    } catch {}
    setOpen(false);
  }

  const paragraphs = popup.text.split(/\n+/).filter(Boolean);
  return (
    <div className={styles.popupBackdrop}>
      <div
        className={styles.popup}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={popup.heading ? "site-popup-heading" : undefined}
        aria-describedby={paragraphs.length ? "site-popup-text" : undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape") acknowledge();
          // The one button is the only stop, so Tab stays inside the popup.
          if (event.key === "Tab") {
            event.preventDefault();
            buttonRef.current?.focus();
          }
        }}
      >
        {popup.heading ? <h2 id="site-popup-heading">{popup.heading}</h2> : null}
        {paragraphs.length ? (
          <div id="site-popup-text">
            {paragraphs.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        ) : null}
        <button ref={buttonRef} type="button" className={styles.popupButton} onClick={acknowledge}>
          Acknowledge
        </button>
      </div>
    </div>
  );
}

/**
 * "ten working days", from the lead times in Settings. Pass `thermo` for one
 * thermolaminate piece, or `lines` for a whole order, which is promised its
 * slowest piece.
 */
export function useLeadTimeWords({ thermo = false, lines = null } = {}) {
  const settings = useSiteSettings();
  return leadTimeWords(lines ? leadTimeDaysForLines(settings, lines) : leadTimeDays(settings, { thermo }));
}
