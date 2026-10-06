// ALFRED'S SETTINGS: THE SWITCH, EACH JOB, AND THE LIMITS.
//
// One row in pcd_alfred_settings, edited in Settings > Alfred. Every job reads
// these before it does anything, so off really means off: drafts already made
// stay where they are, and nothing new is prepared.
//
// THERE IS NO "SEND AUTOMATICALLY". Every customer email needs a person to
// approve it. That is not a setting that is switched off, it is a setting that
// does not exist, and adding one would be a deliberate change made one job at a
// time.

export const DEFAULT_ALFRED_SETTINGS = {
  // Off until somebody turns it on.
  enabled: false,
  jobs: {
    // Drafting replies when a customer writes in. The first job.
    replies: true,
    // Keeping active and on hold orders updated before the gap runs out.
    updates: true,
    // Turning a quote request nobody has quoted into a draft quote.
    quotes: true,
    // Drafting the reply to a new website enquiry.
    enquiries: true,
  },
  // How long a quote request waits for a person before Alfred drafts the quote.
  quote_wait_hours: 24,
  // The longest an active or on hold order goes without a real email to the
  // customer. Alfred prepares the update two days before.
  update_gap_days: 10,
  // The 6:30am email: drafts and questions waiting, and orders due an update.
  summary_enabled: true,
  summary_email: "sales@perthcabinetdoors.com.au",
  // Limits, so a fault can never run away with drafts or money.
  daily_draft_cap: 40,
  monthly_spend_cap_usd: 60,
  // A draft nobody has approved in this long is withdrawn and remade from
  // fresh facts if it is still needed, so last week's news is never sent.
  stale_after_days: 3,
  // Who can approve. The admin is one shared login, so the approve button asks
  // which of these is pressing it, once per browser.
  approvers: ["Jason", "Ashleigh"],
};

const whole = (value, fallback, min, max) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function normaliseAlfredSettings(stored = {}) {
  const s = stored && typeof stored === "object" ? stored : {};
  const jobs = s.jobs && typeof s.jobs === "object" ? s.jobs : {};
  const approvers = (Array.isArray(s.approvers) ? s.approvers : DEFAULT_ALFRED_SETTINGS.approvers)
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  return {
    enabled: s.enabled === true,
    jobs: {
      replies: jobs.replies !== false,
      updates: jobs.updates !== false,
      quotes: jobs.quotes !== false,
      enquiries: jobs.enquiries !== false,
    },
    quote_wait_hours: whole(s.quote_wait_hours, DEFAULT_ALFRED_SETTINGS.quote_wait_hours, 4, 168),
    update_gap_days: whole(s.update_gap_days, DEFAULT_ALFRED_SETTINGS.update_gap_days, 3, 60),
    summary_enabled: s.summary_enabled !== false,
    summary_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.summary_email || "").trim())
      ? String(s.summary_email).trim()
      : DEFAULT_ALFRED_SETTINGS.summary_email,
    daily_draft_cap: whole(s.daily_draft_cap, DEFAULT_ALFRED_SETTINGS.daily_draft_cap, 1, 200),
    monthly_spend_cap_usd: whole(s.monthly_spend_cap_usd, DEFAULT_ALFRED_SETTINGS.monthly_spend_cap_usd, 1, 1000),
    stale_after_days: whole(s.stale_after_days, DEFAULT_ALFRED_SETTINGS.stale_after_days, 1, 14),
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
