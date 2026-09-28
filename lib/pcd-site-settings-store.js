// READING AND SAVING THE WEBSITE'S SETTINGS.
//
// The rules live in pcd-site-settings.js and are pure. This is the half that
// touches the database.
//
// ── A ROW THAT CANNOT BE READ CLOSES THE SHOP ────────────────────────────────
//
// It comes back as the defaults, which have the shop closed and no messages,
// and says so in `error`. The public site keeps working, nobody can buy
// anything because a table went missing, and Settings shows why.

import { cache } from "react";
import { createSupabaseAdminClient } from "./supabase/admin";
import { DEFAULT_SITE_SETTINGS, normalizeSiteSettings } from "./pcd-site-settings";

export const SITE_SETTINGS_ID = "main";
const MIGRATION = "supabase/202609281200_pcd_site_settings.sql";

/**
 * @returns {Promise<{ settings: object, available: boolean, updatedAt: string|null, error: string }>}
 */
export async function getSiteSettings(supabase) {
  try {
    const { data, error } = await supabase
      .from("pcd_site_settings")
      .select("settings, updated_at")
      .eq("id", SITE_SETTINGS_ID)
      .maybeSingle();
    if (error || !data) {
      const message = error?.message?.includes("pcd_site_settings") || !error
        ? `The website settings table is not there yet. Run ${MIGRATION}.`
        : error.message;
      if (error) console.error("[site-settings] could not be read, so the shop reads as closed:", error.message);
      return { settings: normalizeSiteSettings(DEFAULT_SITE_SETTINGS), available: false, updatedAt: null, error: message };
    }
    return { settings: normalizeSiteSettings(data.settings), available: true, updatedAt: data.updated_at, error: "" };
  } catch (thrown) {
    console.error("[site-settings] could not be read, so the shop reads as closed:", thrown?.message || thrown);
    return {
      settings: normalizeSiteSettings(DEFAULT_SITE_SETTINGS),
      available: false,
      updatedAt: null,
      error: thrown?.message || "The website settings could not be read.",
    };
  }
}

/** Saves the whole row, cleaned, and returns what was stored. */
export async function saveSiteSettings(supabase, input) {
  const settings = normalizeSiteSettings(input);
  const { data, error } = await supabase
    .from("pcd_site_settings")
    .upsert({ id: SITE_SETTINGS_ID, settings, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("settings, updated_at")
    .single();
  if (error) {
    throw new Error(error.message?.includes("pcd_site_settings") ? `The website settings table is not there yet. Run ${MIGRATION}.` : error.message);
  }
  return { settings: normalizeSiteSettings(data.settings), available: true, updatedAt: data.updated_at, error: "" };
}

/**
 * The settings as the public site reads them: server side, no sign-in needed.
 * Read once a request, however many parts of the page ask: the layout, the
 * page, and the shop check all get the same answer.
 */
export const readPublicSiteSettings = cache(async () => {
  try {
    return (await getSiteSettings(createSupabaseAdminClient())).settings;
  } catch {
    return normalizeSiteSettings(DEFAULT_SITE_SETTINGS);
  }
});
