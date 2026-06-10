import { DEFAULT_BUSINESS_DEFAULTS, normalizeBusinessDefaults } from "./pcd-quote-utils";

export const BUSINESS_DEFAULTS_SINGLETON_ID = "00000000-0000-0000-0000-000000000001";
const BUSINESS_DEFAULTS_CACHE_TTL_MS = 60 * 1000;
let businessDefaultsCache = null;

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
  if (businessDefaultsCache && businessDefaultsCache.expiresAt > Date.now()) {
    return businessDefaultsCache.defaults;
  }

  const { data, error } = await supabase
    .from("pcd_business_defaults")
    .select("*")
    .eq("id", BUSINESS_DEFAULTS_SINGLETON_ID)
    .maybeSingle();

  const defaults = error ? DEFAULT_BUSINESS_DEFAULTS : dbRowToBusinessDefaults(data);
  businessDefaultsCache = {
    defaults,
    expiresAt: Date.now() + BUSINESS_DEFAULTS_CACHE_TTL_MS,
  };
  return defaults;
}

export async function upsertBusinessDefaults(supabase, defaults) {
  const row = businessDefaultsToDbRow(defaults);
  const { data, error } = await supabase
    .from("pcd_business_defaults")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  const savedDefaults = dbRowToBusinessDefaults(data);
  businessDefaultsCache = {
    defaults: savedDefaults,
    expiresAt: Date.now() + BUSINESS_DEFAULTS_CACHE_TTL_MS,
  };
  return savedDefaults;
}
