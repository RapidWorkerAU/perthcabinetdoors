import { DEFAULT_BUSINESS_DEFAULTS, normalizeBusinessDefaults } from "./pcd-quote-utils";

export const BUSINESS_DEFAULTS_SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

// Every field normalizeBusinessDefaults knows about has to be written here too,
// or saving the settings screen silently drops it. The drawer runner rates were
// missing from this list, which is half of why they could never be configured.
//
// The runner_unit_cost_* columns are deliberately NOT written any more. Runners
// are ordinary hardware now, picked from the hardware library and added to a
// quote as their own line, so there is no rate for this screen to hold. The
// columns are left in the database with their old values rather than dropped.
export function businessDefaultsToDbRow(defaults = {}) {
  const normalized = normalizeBusinessDefaults(defaults);
  return {
    id: BUSINESS_DEFAULTS_SINGLETON_ID,
    currency: normalized.currency,
    gst_rate: normalized.gst_rate,
    markup_percent: normalized.markup_percent,
    hinge_drilling_unit_cost_ex_gst: normalized.hinge_drilling_unit_cost_ex_gst,
    hinge_supply_unit_cost_ex_gst: 0,
    quote_terms: normalized.quote_terms,
    variation_terms: normalized.variation_terms,
    email_signature_html: normalized.email_signature_html,
    worker_hourly_rate: normalized.worker_hourly_rate,
    labour_hours_per_cabinet: normalized.labour_hours_per_cabinet,
    inhouse_processing_hours_per_piece: normalized.inhouse_processing_hours_per_piece,
    abs_edging_cost_per_lineal_metre_ex_gst: normalized.abs_edging_cost_per_lineal_metre_ex_gst,
    default_travel_cost_ex_gst: normalized.default_travel_cost_ex_gst,
    default_delivery_cost_ex_gst: normalized.default_delivery_cost_ex_gst,
    default_installation_cost_ex_gst: normalized.default_installation_cost_ex_gst,
    default_painting_cost_ex_gst: normalized.default_painting_cost_ex_gst,
    default_glass_cost_ex_gst: normalized.default_glass_cost_ex_gst,
    default_removal_cost_ex_gst: normalized.default_removal_cost_ex_gst,
  };
}

// Columns added after the settings screen shipped. A database that has not had
// the migration run yet must still be able to save the fields it does have,
// rather than the whole settings screen erroring.
const OPTIONAL_COLUMNS = [
  "variation_terms",
  "email_signature_html",
  "inhouse_processing_hours_per_piece",
  "abs_edging_cost_per_lineal_metre_ex_gst",
  "default_travel_cost_ex_gst",
  "default_delivery_cost_ex_gst",
  "default_installation_cost_ex_gst",
  "default_painting_cost_ex_gst",
  "default_glass_cost_ex_gst",
  "default_removal_cost_ex_gst",
];

function isMissingOptionalColumnError(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST204" && OPTIONAL_COLUMNS.some((column) => message.includes(column));
}

function withoutOptionalColumns(row) {
  const rest = { ...row };
  for (const column of OPTIONAL_COLUMNS) delete rest[column];
  return rest;
}

export function dbRowToBusinessDefaults(row) {
  return normalizeBusinessDefaults(row || DEFAULT_BUSINESS_DEFAULTS);
}

// Read fresh every time. This used to hold a 60-second module-level cache, but
// each serverless instance keeps its own copy, so saving a new markup or hourly
// rate took effect immediately on whichever instance handled the save and up to
// a minute later on the others — quotes priced in that window used the old
// numbers, which is exactly the "it doesn't reliably apply" symptom. It is a
// single-row lookup by primary key; the round trip is not worth the staleness.
//
// The bigger trap this guards against: pcd_business_defaults is behind an RLS
// policy of `auth.role() = 'authenticated'`, and a blocked read returns
// { data: null, error: null } — no error at all. The old code only checked
// `error`, so any call made with a client that was not carrying an admin
// session silently priced the job at the built-in constants (40% markup,
// $85/hr, 1.5h per cabinet) instead of the configured ones, with nothing
// logged. Pricing must never quietly fall back to a different number than the
// one on the settings screen, so a missing row is now retried with the
// service-role client and shouted about if it still comes back empty.
export async function getBusinessDefaults(supabase) {
  const { data, error } = await supabase
    .from("pcd_business_defaults")
    .select("*")
    .eq("id", BUSINESS_DEFAULTS_SINGLETON_ID)
    .maybeSingle();

  if (!error && data) return dbRowToBusinessDefaults(data);

  try {
    const { createSupabaseAdminClient } = await import("./supabase/admin");
    const { data: adminData } = await createSupabaseAdminClient()
      .from("pcd_business_defaults")
      .select("*")
      .eq("id", BUSINESS_DEFAULTS_SINGLETON_ID)
      .maybeSingle();
    if (adminData) return dbRowToBusinessDefaults(adminData);
  } catch {
    // Service role not configured in this environment — fall through and warn.
  }

  console.error(
    "[business-defaults] Could not read pcd_business_defaults; pricing is using built-in constants " +
      "(markup 40%, $85/hr) instead of your configured settings.",
    error?.message || "no row returned"
  );
  return DEFAULT_BUSINESS_DEFAULTS;
}

export async function upsertBusinessDefaults(supabase, defaults) {
  const row = businessDefaultsToDbRow(defaults);
  const save = (payload) =>
    supabase.from("pcd_business_defaults").upsert(payload, { onConflict: "id" }).select("*").single();

  let { data, error } = await save(row);
  if (error && isMissingOptionalColumnError(error)) {
    ({ data, error } = await save(withoutOptionalColumns(row)));
  }
  if (error) throw error;
  return dbRowToBusinessDefaults(data);
}
