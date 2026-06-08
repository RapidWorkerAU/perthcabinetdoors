import { DEFAULT_BUSINESS_DEFAULTS, normalizeBusinessDefaults } from "./pcd-quote-utils";

export const BUSINESS_DEFAULTS_SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

export function businessDefaultsToDbRow(defaults = {}) {
  const normalized = normalizeBusinessDefaults(defaults);
  return {
    id: BUSINESS_DEFAULTS_SINGLETON_ID,
    markup_percent: normalized.markup_percent,
    hinge_drilling_unit_cost_ex_gst: normalized.hinge_drilling_unit_cost_ex_gst,
    hinge_supply_unit_cost_ex_gst: normalized.hinge_supply_unit_cost_ex_gst,
    worker_hourly_rate: normalized.worker_hourly_rate,
  };
}

export function dbRowToBusinessDefaults(row) {
  return normalizeBusinessDefaults(row || DEFAULT_BUSINESS_DEFAULTS);
}

export async function getBusinessDefaults(supabase) {
  const { data, error } = await supabase
    .from("pcd_business_defaults")
    .select("*")
    .eq("id", BUSINESS_DEFAULTS_SINGLETON_ID)
    .maybeSingle();

  if (error) return DEFAULT_BUSINESS_DEFAULTS;
  return dbRowToBusinessDefaults(data);
}

export async function upsertBusinessDefaults(supabase, defaults) {
  const row = businessDefaultsToDbRow(defaults);
  const { data, error } = await supabase
    .from("pcd_business_defaults")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return dbRowToBusinessDefaults(data);
}
