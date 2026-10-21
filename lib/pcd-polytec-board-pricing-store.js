// READING AND SAVING THE POLYTEC DECORATIVE BOARD RATE CARD.
//
// The rules live in pcd-polytec-board-pricing.js and are pure. This is the
// half that touches the database.
//
// Same rule as the thermolaminate card: a card that cannot be read is
// unavailable, never quietly the built-in figures, and every shop piece in
// decorative board is then priced by hand. A row that exists but has never
// been saved prices from the figures measured from the portal.

import { normalizePolytecBoardCard } from "./pcd-polytec-board-pricing";

export const POLYTEC_BOARD_PRICING_ID = "polytec";
const SQL_FILE = "supabase/202610101400_pcd_polytec_board_pricing.sql";

/**
 * @returns {Promise<{ card: object|null, source: "saved"|"measured"|"unavailable", updatedAt: string|null, error: string }>}
 */
export async function getPolytecBoardCard(supabase) {
  const { data, error } = await supabase
    .from("pcd_polytec_board_pricing")
    .select("rate_card, updated_at")
    .eq("id", POLYTEC_BOARD_PRICING_ID)
    .maybeSingle();

  if (error || !data) {
    const message = error?.message?.includes("pcd_polytec_board_pricing")
      ? `The decorative board rate card table is not there yet. Run ${SQL_FILE}.`
      : error?.message || `The decorative board rate card row is missing. Run ${SQL_FILE}.`;
    if (error) console.error("[polytec-board-pricing] could not read the rate card:", error.message);
    return { card: null, source: "unavailable", updatedAt: null, error: message };
  }

  const stored = data.rate_card && typeof data.rate_card === "object" ? data.rate_card : {};
  const saved = Object.keys(stored).length > 0;
  return {
    card: normalizePolytecBoardCard(stored),
    source: saved ? "saved" : "measured",
    updatedAt: saved ? data.updated_at : null,
    error: "",
  };
}

/** Saves the whole card, cleaned, and returns what was stored. */
export async function savePolytecBoardCard(supabase, input) {
  const card = normalizePolytecBoardCard(input);
  const { data, error } = await supabase
    .from("pcd_polytec_board_pricing")
    .upsert({ id: POLYTEC_BOARD_PRICING_ID, rate_card: card, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("rate_card, updated_at")
    .single();
  if (error) throw error;
  return { card: normalizePolytecBoardCard(data.rate_card), source: "saved", updatedAt: data.updated_at, error: "" };
}

export const POLYTEC_BOARD_SQL_FILE = SQL_FILE;
