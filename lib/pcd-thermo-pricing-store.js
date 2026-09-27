// READING AND SAVING THE THERMOLAMINATE RATE CARD.
//
// The rules live in pcd-thermo-pricing.js and are pure. This is the half that
// touches the database, kept apart so the quote editor can import the rules
// without a Supabase client.
//
// ── NO SILENT FALLBACK ───────────────────────────────────────────────────────
//
// A card that cannot be read does NOT quietly become the built-in rates. That
// was a real pricing bug here once: a price that looks right and came from the
// wrong place. So an unreadable card comes back as unavailable, and every
// thermolaminate line says it cannot be priced until it can.
//
// A row that exists but has never been saved is different. That is the starting
// state after the migration, and it prices from the rates measured from the
// portal, which is what the migration says it will do. `source` tells the
// Settings screen which of the two it is showing.

import { normalizeThermoRateCard } from "./pcd-thermo-pricing";

export const THERMO_PRICING_ID = "polytec";

/**
 * @returns {Promise<{ card: object|null, source: "saved"|"measured"|"unavailable", updatedAt: string|null, error: string }>}
 */
export async function getThermoRateCard(supabase) {
  const { data, error } = await supabase
    .from("pcd_thermo_pricing")
    .select("rate_card, updated_at")
    .eq("id", THERMO_PRICING_ID)
    .maybeSingle();

  if (error || !data) {
    const message = error?.message?.includes("pcd_thermo_pricing")
      ? "The thermolaminate rate card table is not there yet. Run supabase/202609271400_pcd_thermo_pricing.sql."
      : error?.message || "The thermolaminate rate card row is missing. Run supabase/202609271400_pcd_thermo_pricing.sql.";
    if (error) console.error("[thermo-pricing] could not read the rate card:", error.message);
    return { card: null, source: "unavailable", updatedAt: null, error: message };
  }

  const stored = data.rate_card && typeof data.rate_card === "object" ? data.rate_card : {};
  const saved = Object.keys(stored).length > 0;
  return {
    card: normalizeThermoRateCard(stored),
    source: saved ? "saved" : "measured",
    updatedAt: saved ? data.updated_at : null,
    error: "",
  };
}

/** Saves the whole card, cleaned, and returns what was stored. */
export async function saveThermoRateCard(supabase, input) {
  const card = normalizeThermoRateCard(input);
  const { data, error } = await supabase
    .from("pcd_thermo_pricing")
    .upsert({ id: THERMO_PRICING_ID, rate_card: card, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("rate_card, updated_at")
    .single();
  if (error) throw error;
  return { card: normalizeThermoRateCard(data.rate_card), source: "saved", updatedAt: data.updated_at, error: "" };
}
