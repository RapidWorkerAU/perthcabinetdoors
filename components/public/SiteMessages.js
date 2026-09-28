"use client";

// THE MESSAGES SET IN SETTINGS > SHOP AND SITE MESSAGES, on the public site.
//
// Each one shows only while it has text and today, in Perth, is inside its
// dates. See lib/pcd-site-settings.js. Plain text only: whatever is typed is
// shown as words, never as markup.

import { activeMessage, leadTimeDays, leadTimeDaysForLines, leadTimeWords } from "@/lib/pcd-site-settings";
import { useSiteSettings } from "./SiteSettingsProvider";
import styles from "./site-messages.module.css";

/** Across the top of every page, scrolling. Rendered by app/(site)/layout.js. */
export function SiteBanner() {
  const text = activeMessage(useSiteSettings(), "banner");
  if (!text) return null;
  // A long message scrolls for longer, so it moves at the same reading speed
  // as a short one rather than racing past.
  const seconds = Math.min(90, Math.max(18, Math.round(text.length / 4)));
  return (
    <div className={styles.banner} role="region" aria-label="Announcement" style={{ "--banner-seconds": `${seconds}s` }}>
      <div className={styles.bannerTrack}>
        <span className={styles.bannerItem}>{text}</span>
        <span className={styles.bannerItem} aria-hidden="true">
          {text}
        </span>
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
