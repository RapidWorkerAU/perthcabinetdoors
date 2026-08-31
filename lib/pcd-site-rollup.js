// FOLDING RAW PAGE VIEWS INTO DAYS.
//
// ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
//
// The dashboard shows up to ninety days. At a few hundred views a day that is
// tens of thousands of raw rows, which is not something a page load should be
// reading. So a nightly job turns each finished day into two small rows and the
// dashboard reads those.
//
// TODAY IS NOT ROLLED UP. A day is only folded once it is over, because a half
// day written into the same row the dashboard reads would show up as a real
// number and be wrong for the rest of the day. The dashboard counts today
// straight off the raw table instead, which is one small query. See
// lib/pcd-site-stats.js.
//
// ── IT RE-ROLLS THE LAST FEW DAYS ────────────────────────────────────────────
//
// Dwell time arrives when somebody LEAVES a page, which can be long after they
// arrived, and a beacon sent as a phone goes to sleep may land the next morning.
// So the job redoes the last few finished days every run rather than only the
// new one. Rolling a day twice produces the same row, so this costs nothing and
// stops the most recent stay times being permanently short.
//
// ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────────
//
// It never adds the per page figures up to get a day's visits. One visit that
// reads four pages sits on four page rows, so that sum is four. Visits are
// counted from distinct sessions, once, in the day's own row.

import {
  BOUNCE_MS,
  MAX_DWELL_MS,
  RAW_RETENTION_DAYS,
  daysBetween,
  medianOf,
  perthDay,
  perthDayBounds,
  shiftDay,
} from "./pcd-site-tracking";

// How many finished days get redone on every pass. Three covers a beacon that
// arrived late, a phone that woke up on the train, and one missed run.
export const REROLL_DAYS = 3;

// The furthest back a first run will go. Beyond this there is nothing to roll
// anyway, because raw rows are pruned at RAW_RETENTION_DAYS.
const MAX_BACKFILL_DAYS = RAW_RETENTION_DAYS;

/** Every page view for one Perth day, oldest first. */
async function rawForDay(supabase, day) {
  const { fromIso, toIso } = perthDayBounds(day);
  const { data, error } = await supabase
    .from("pcd_site_events")
    .select("session_id,visitor_hash,path,channel,device,is_bot,dwell_ms,created_at")
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * One day's rows turned into what gets stored.
 *
 * Exported on its own because this is the part with the judgement in it, and a
 * test should be able to hand it rows without a database.
 */
export function foldDay(day, rows) {
  const botViews = rows.filter((row) => row.is_bot).length;
  const real = rows.filter((row) => !row.is_bot);

  // A dwell longer than half an hour is a tab somebody walked away from, not
  // reading. Capped rather than dropped, so the page still counts as read.
  const dwellOf = (row) => {
    const ms = Number(row.dwell_ms);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return Math.min(ms, MAX_DWELL_MS);
  };

  const sessions = new Map();
  real.forEach((row) => {
    let session = sessions.get(row.session_id);
    if (!session) {
      // The first row of a session is where the person came FROM. Every later
      // row is them moving around inside the site, so the channel and the
      // device are taken here and never overwritten.
      session = { views: 0, channel: row.channel || "direct", device: row.device || "unknown", dwell: 0 };
      sessions.set(row.session_id, session);
    }
    session.views += 1;
    session.dwell += dwellOf(row) || 0;
  });

  const channels = {};
  const devices = {};
  let bounced = 0;
  sessions.forEach((session) => {
    channels[session.channel] = (channels[session.channel] || 0) + 1;
    devices[session.device] = (devices[session.device] || 0) + 1;
    // One page, and gone almost immediately. A visit with no dwell recorded at
    // all counts as a bounce only if it also read one page, because a beacon
    // that never arrived is not evidence somebody stayed.
    if (session.views === 1 && session.dwell < BOUNCE_MS) bounced += 1;
  });

  const perPath = new Map();
  real.forEach((row) => {
    let page = perPath.get(row.path);
    if (!page) {
      page = { pageViews: 0, sessions: new Set(), dwells: [] };
      perPath.set(row.path, page);
    }
    page.pageViews += 1;
    page.sessions.add(row.session_id);
    const ms = dwellOf(row);
    if (ms !== null) page.dwells.push(ms);
  });

  return {
    day: {
      day,
      visits: sessions.size,
      visitors: new Set(real.map((row) => row.visitor_hash)).size,
      page_views: real.length,
      median_dwell_ms: medianOf(real.map(dwellOf).filter((ms) => ms !== null)),
      bounced,
      bot_views: botViews,
      channels,
      devices,
      rolled_at: new Date().toISOString(),
    },
    pages: [...perPath.entries()].map(([path, page]) => ({
      day,
      path,
      page_views: page.pageViews,
      visits: page.sessions.size,
      median_dwell_ms: medianOf(page.dwells),
    })),
  };
}

/** The days this run should fold: everything unrolled, plus the last few again. */
export async function daysToRoll(supabase, today) {
  const yesterday = shiftDay(today, -1);

  const { data: latest, error: latestError } = await supabase
    .from("pcd_site_daily")
    .select("day")
    .order("day", { ascending: false })
    .limit(1);
  if (latestError) throw latestError;

  const floor = shiftDay(today, -MAX_BACKFILL_DAYS);

  let from;
  if (latest?.length) {
    // Back up a few days so late dwell beacons land in the right day.
    from = shiftDay(latest[0].day, -(REROLL_DAYS - 1));
  } else {
    // Nothing rolled yet. Start at the oldest raw row rather than at the floor,
    // so a first run on a quiet site does not fold ninety empty days.
    const { data: oldest, error: oldestError } = await supabase
      .from("pcd_site_events")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1);
    if (oldestError) throw oldestError;
    if (!oldest?.length) return [];
    from = perthDay(new Date(oldest[0].created_at).getTime());
  }

  if (from < floor) from = floor;
  if (from > yesterday) return [];
  return daysBetween(from, yesterday);
}

/**
 * Fold every finished day that needs it, then prune what has aged out.
 *
 * Returns a summary rather than throwing on a partial failure: one bad day must
 * not stop the other twenty nine, and the caller logs what did not work.
 */
export async function runSiteRollup(supabase, { now = Date.now(), retentionDays = RAW_RETENTION_DAYS } = {}) {
  const today = perthDay(now);
  const problems = [];
  let rolled = 0;
  let views = 0;

  let days = [];
  try {
    days = await daysToRoll(supabase, today);
  } catch (error) {
    problems.push(`could not work out which days to roll: ${error?.message || error}`);
  }

  for (const day of days) {
    try {
      const rows = await rawForDay(supabase, day);
      const folded = foldDay(day, rows);

      const { error: dayError } = await supabase
        .from("pcd_site_daily")
        .upsert(folded.day, { onConflict: "day" });
      if (dayError) throw dayError;

      // The day's pages are replaced rather than merged. A path that stopped
      // being visited must disappear from that day rather than keep whatever it
      // had on the previous pass.
      const { error: clearError } = await supabase.from("pcd_site_page_daily").delete().eq("day", day);
      if (clearError) throw clearError;

      if (folded.pages.length) {
        const { error: pageError } = await supabase
          .from("pcd_site_page_daily")
          .upsert(folded.pages, { onConflict: "day,path" });
        if (pageError) throw pageError;
      }

      rolled += 1;
      views += folded.day.page_views;
    } catch (error) {
      problems.push(`${day}: ${error?.message || error}`);
    }
  }

  // ── the prune ─────────────────────────────────────────────────────────────
  //
  // Only ever raw rows, and only ones already folded into a day that is kept
  // for good. Deliberately the last thing that happens, so a failure above
  // never deletes the rows that would have fixed it on the next run.
  let pruned = 0;
  try {
    const cutoff = perthDayBounds(shiftDay(today, -retentionDays)).fromIso;
    const { data, error } = await supabase
      .from("pcd_site_events")
      .delete()
      .lt("created_at", cutoff)
      .select("id");
    if (error) throw error;
    pruned = data?.length || 0;
  } catch (error) {
    problems.push(`prune: ${error?.message || error}`);
  }

  return { ok: problems.length === 0, today, rolled, views, pruned, problems };
}
