"use client";

// THE WEBSITE'S SETTINGS, handed to every public page by app/(site)/layout.js.
//
// Read once on the server for each page and passed down here, so a component
// deep in the nav or the quote form can ask whether the shop is open without
// a request of its own. See lib/pcd-site-settings.js.

import { createContext, useContext } from "react";
import { DEFAULT_SITE_SETTINGS, normalizeSiteSettings } from "@/lib/pcd-site-settings";

const SiteSettingsContext = createContext(normalizeSiteSettings(DEFAULT_SITE_SETTINGS));

export default function SiteSettingsProvider({ settings, children }) {
  return <SiteSettingsContext.Provider value={settings}>{children}</SiteSettingsContext.Provider>;
}

/** The whole settings object: shop_open, the two lead times and messages. */
export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}

/** Is the shop open to the public? Closed while the settings cannot be read. */
export function useShopOpen() {
  return useContext(SiteSettingsContext).shop_open === true;
}
