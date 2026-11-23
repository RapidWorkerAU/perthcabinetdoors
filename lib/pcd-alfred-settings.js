// ALFRED'S SETTINGS: THE SWITCH, THE MONTHLY LIMIT AND WHO APPROVES.
//
// One row in pcd_alfred_settings, edited in Settings > Alfred. The chat reads
// these before it answers, so off really means off.
//
// Alfred is the chat and nothing else: he answers questions and proposes
// changes a person approves. He drafts no emails and runs no jobs on a clock.

export const DEFAULT_ALFRED_SETTINGS = {
  // Off until somebody turns it on.
  enabled: false,
  // So a fault can never run away with money.
  monthly_spend_cap_usd: 60,
  // Who can approve a change. The admin is one shared login, so the approve
  // button asks which of these is pressing it, once per browser.
  approvers: ["Jason", "Ashleigh"],
};

const whole = (value, fallback, min, max) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function normaliseAlfredSettings(stored = {}) {
  const s = stored && typeof stored === "object" ? stored : {};
  const approvers = (Array.isArray(s.approvers) ? s.approvers : DEFAULT_ALFRED_SETTINGS.approvers)
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  return {
    enabled: s.enabled === true,
    monthly_spend_cap_usd: whole(s.monthly_spend_cap_usd, DEFAULT_ALFRED_SETTINGS.monthly_spend_cap_usd, 1, 1000),
    approvers: approvers.length ? approvers : DEFAULT_ALFRED_SETTINGS.approvers,
  };
}

/** The settings, or the defaults (switched off) when they cannot be read. */
export async function getAlfredSettings(supabase) {
  const { data, error } = await supabase.from("pcd_alfred_settings").select("settings, updated_at").eq("id", "main").maybeSingle();
  if (error || !data) {
    return {
      settings: normaliseAlfredSettings({}),
      available: false,
      error: error?.message || "Alfred's settings are not set up yet. Run supabase/202610061000_pcd_alfred.sql.",
    };
  }
  return { settings: normaliseAlfredSettings(data.settings), available: true, error: "" };
}

export async function saveAlfredSettings(supabase, input) {
  const settings = normaliseAlfredSettings(input);
  const { data, error } = await supabase
    .from("pcd_alfred_settings")
    .upsert({ id: "main", settings, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("settings")
    .single();
  if (error) throw error;
  return normaliseAlfredSettings(data.settings);
}

function perthMonthStart(now = new Date()) {
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit" }).format(now);
  return new Date(`${month}-01T00:00:00+08:00`);
}

/** What the chat has cost this month, against the limit. Every question is a row in pcd_alfred_runs. */
export async function alfredUsage(supabase, now = new Date()) {
  const { data: runs } = await supabase.from("pcd_alfred_runs").select("cost_usd").gte("started_at", perthMonthStart(now).toISOString());
  const spentThisMonth = (runs || []).reduce((sum, run) => sum + Number(run.cost_usd || 0), 0);
  return { spentThisMonth: Number(spentThisMonth.toFixed(2)) };
}
