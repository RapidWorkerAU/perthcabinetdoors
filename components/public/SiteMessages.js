"use client";

// THE MESSAGES SET IN SETTINGS > SHOP AND SITE MESSAGES, on the public site.
//
// Each one shows only while it has text and today, in Perth, is inside its
// dates. See lib/pcd-site-settings.js. Plain text only: whatever is typed is
// shown as words, never as markup.

import { useEffect, useRef, useState } from "react";
import { activeBannerMessages, activeMessage, leadTimeDays, leadTimeDaysForLines, leadTimeWords } from "@/lib/pcd-site-settings";
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

/**
 * "ten working days", from the lead times in Settings. Pass `thermo` for one
 * thermolaminate piece, or `lines` for a whole order, which is promised its
 * slowest piece.
 */
export function useLeadTimeWords({ thermo = false, lines = null } = {}) {
  const settings = useSiteSettings();
  return leadTimeWords(lines ? leadTimeDaysForLines(settings, lines) : leadTimeDays(settings, { thermo }));
}
