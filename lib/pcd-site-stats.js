// WHAT THE WEBSITE DID, READ ONCE, FOR THE DASHBOARD.
//
// ── WHY THE MATHS IS HERE AND NOT ON THE PAGE ────────────────────────────────
//
// The dashboard once carried a financial summary built from its own queries.
// An ambiguous embed returned an error and no rows, the page read { data } and
// ignored { error }, and a failed query rendered as a confident $0 on an order
// total. Nobody doubts a total, so it was wrong for as long as the dashboard
// had existed. See test/financials-page.test.mjs.
//
// Two rules came out of that and both are kept here:
//
//   NOTHING IS ADDED UP ON THE PAGE. Every figure is worked out in this file
//   and handed over finished. The dashboard files contain no arithmetic at all.
//
//   A SOURCE THAT FAILS IS NAMED. A failed query returns no rows and no rows
//   reads as a quiet week. Every query below records what would not load, and
//   the panel says so in yellow rather than drawing a confident zero.
//
// ── TWO KINDS OF FIGURE, AND THEY ARE NOT THE SAME ───────────────────────────
//
//   activity  what the website PRODUCED. Design sessions, quote requests,
//             enquiries. Every one of these is a row that already existed
//             before any tracking was built, and they are always available.
//
//   traffic   who turned up. Needs pcd_site_daily to have something in it. When
//             it does not, the panel says the tracking has not collected
//             anything yet rather than drawing zeroes.
//
// ── TODAY IS COUNTED DIFFERENTLY ─────────────────────────────────────────────
//
// The roll up only folds days that are over, because a half day written into
// the row the dashboard reads would look like a real number and be wrong until
// midnight. So today is counted straight off the raw table, which is one small
// query, and every earlier day comes from the roll up.

import {
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  DEVICE_LABELS,
  DEVICE_ORDER,
  changePercent,
  daysBetween,
  medianOf,
  perthDay,
  perthDayBounds,
  shiftDay,
} from "./pcd-site-tracking";
import { foldDay } from "./pcd-site-rollup";

/** The periods the dashboard offers, and how many days each one is. */
export const PERIODS = {
  d7: { label: "Last 7 days", days: 7 },
  month: { label: "This month", days: null },
  d90: { label: "Last 90 days", days: 90 },
};

export const DEFAULT_PERIOD = "month";

/**
 * The first and last Perth day of a period.
 *
 * "This month" is the calendar month so far, which is what somebody means when
 * they ask how the month is going. The other two are rolling windows ending
 * today, today included.
 */
export function periodRange(period, today) {
  const key = PERIODS[period] ? period : DEFAULT_PERIOD;
  if (key === "month") return { key, from: `${today.slice(0, 7)}-01`, to: today };
  return { key, from: shiftDay(today, -(PERIODS[key].days - 1)), to: today };
}

/** The same length of time immediately before it, for the comparison. */
export function previousRange({ from, to }) {
  const length = daysBetween(from, to).length;
  return { from: shiftDay(from, -length), to: shiftDay(from, -1) };
}

const sumOf = (rows, pick) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);

/** Add up the counts in a pile of {key: count} objects. */
function mergeCounts(objects) {
  const out = new Map();
  objects.forEach((object) => {
    Object.entries(object || {}).forEach(([key, value]) => {
      out.set(key, (out.get(key) || 0) + (Number(value) || 0));
    });
  });
  return out;
}

/**
 * Order a merged count map by a known list, with anything unknown last.
 *
 * The share is worked out here rather than on the screen, so the panel prints
 * what it is given and never divides anything.
 */
function orderedCounts(counts, order, labels) {
  const known = order.filter((key) => counts.has(key)).map((key) => ({ key, count: counts.get(key) }));
  const rest = [...counts.entries()].filter(([key]) => !order.includes(key)).map(([key, count]) => ({ key, count }));
  const all = [...known, ...rest].filter((entry) => entry.count > 0);
  const total = all.reduce((sum, entry) => sum + entry.count, 0);
  return all.map((entry) => ({
    key: entry.key,
    label: labels[entry.key] || entry.key,
    count: entry.count,
    share: total ? Math.round((entry.count / total) * 100) : 0,
  }));
}

// ── traffic ─────────────────────────────────────────────────────────────────

/**
 * Today's figures, folded out of the raw table with the same code the nightly
 * job uses, so a part day is counted exactly the way the finished day will be.
 */
async function todayFromRaw(supabase, today, problems) {
  try {
    const { fromIso, toIso } = perthDayBounds(today);
    const { data, error } = await supabase
      .from("pcd_site_events")
      .select("session_id,visitor_hash,path,channel,device,is_bot,dwell_ms,created_at")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: true })
      .limit(20000);
    if (error) throw error;
    if (!data?.length) return null;
    return foldDay(today, data);
  } catch (error) {
    console.error(`[dashboard] today's visits could not be loaded: ${error?.message || error}`);
    problems.push("today's visits");
    return null;
  }
}

async function dailyRows(supabase, from, to, problems) {
  try {
    const { data, error } = await supabase
      .from("pcd_site_daily")
      .select("day,visits,visitors,page_views,median_dwell_ms,bounced,bot_views,channels,devices")
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`[dashboard] the daily visit figures could not be loaded: ${error?.message || error}`);
    problems.push("the daily visit figures");
    return [];
  }
}

async function pageRows(supabase, from, to, problems) {
  try {
    const { data, error } = await supabase
      .from("pcd_site_page_daily")
      .select("path,page_views")
      .gte("day", from)
      .lte("day", to);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`[dashboard] the page figures could not be loaded: ${error?.message || error}`);
    problems.push("the page figures");
    return [];
  }
}

function trafficTotals(days) {
  return {
    visits: sumOf(days, (d) => d.visits),
    visitors: sumOf(days, (d) => d.visitors),
    pageViews: sumOf(days, (d) => d.page_views),
    bounced: sumOf(days, (d) => d.bounced),
    botViews: sumOf(days, (d) => d.bot_views),
    // The middle of the daily medians. Not the true median of every page view,
    // which would need the raw rows for ninety days; it is the typical day,
    // which is the question somebody is actually asking.
    medianDwellMs: medianOf(days.map((d) => Number(d.median_dwell_ms)).filter((ms) => Number.isFinite(ms) && ms > 0)),
  };
}

/**
 * Every day in the range, with the days that had no traffic filled in as zero.
 *
 * A chart with gaps where the quiet days were reads as a chart that is missing
 * data. A quiet Sunday is not missing, it is a quiet Sunday.
 */
function fillDays(range, rows) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return daysBetween(range.from, range.to).map((day) => {
    const row = byDay.get(day);
    return {
      day,
      visits: Number(row?.visits) || 0,
      visitors: Number(row?.visitors) || 0,
      page_views: Number(row?.page_views) || 0,
      bounced: Number(row?.bounced) || 0,
      bot_views: Number(row?.bot_views) || 0,
      median_dwell_ms: row?.median_dwell_ms ?? null,
      channels: row?.channels || {},
      devices: row?.devices || {},
    };
  });
}

// ── activity ────────────────────────────────────────────────────────────────

async function countByDay(supabase, table, select, filter, range, problems, what) {
  try {
    const { fromIso } = perthDayBounds(range.from);
    const { toIso } = perthDayBounds(range.to);
    let query = supabase.from(table).select(select).gte("created_at", fromIso).lt("created_at", toIso);
    if (filter) query = filter(query);
    const { data, error } = await query.limit(10000);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`[dashboard] ${what} could not be loaded: ${error?.message || error}`);
    problems.push(what);
    return [];
  }
}

/** Rows bucketed into Perth days, as a plain {day: count} map. */
function perDay(rows, keep) {
  const out = new Map();
  rows.forEach((row) => {
    if (keep && !keep(row)) return;
    const day = perthDay(new Date(row.created_at).getTime());
    out.set(day, (out.get(day) || 0) + 1);
  });
  return out;
}

async function loadActivity(supabase, range, problems) {
  const [designs, requests, enquiries] = await Promise.all([
    countByDay(supabase, "pcd_design_projects", "created_at,customer_id", (q) => q.eq("is_public", true), range, problems, "design tool sessions"),
    countByDay(supabase, "pcd_quote_requests", "created_at,source,design_project_id", null, range, problems, "quote requests"),
    countByDay(supabase, "pcd_enquiries", "created_at", null, range, problems, "enquiries"),
  ]);

  const started = perDay(designs);
  const saved = perDay(designs, (row) => Boolean(row.customer_id));
  const sent = perDay(requests, (row) => Boolean(row.design_project_id));
  const asked = perDay(requests);
  const enquired = perDay(enquiries);

  const days = daysBetween(range.from, range.to).map((day) => ({
    day,
    designStarted: started.get(day) || 0,
    designSaved: saved.get(day) || 0,
    designSent: sent.get(day) || 0,
    requests: asked.get(day) || 0,
    enquiries: enquired.get(day) || 0,
  }));

  // Where the requests came from, straight off the column that has recorded it
  // since the first quote request.
  const sources = new Map();
  requests.forEach((row) => {
    const key = row.source || "unknown";
    sources.set(key, (sources.get(key) || 0) + 1);
  });

  return {
    days,
    sources,
    totals: {
      designStarted: designs.length,
      designSaved: designs.filter((row) => row.customer_id).length,
      designSent: requests.filter((row) => row.design_project_id).length,
      requests: requests.length,
      enquiries: enquiries.length,
    },
  };
}

export const SOURCE_LABELS = {
  request_quote: "The website quote form",
  design_tool: "The design tool",
  product_detail: "A product page",
  unknown: "Not recorded",
};

/**
 * Everything the website panel needs, for one period.
 *
 * `problems` is the list of sources that would not load, in the words of the
 * work they affect rather than the name of a table, which is how the board says
 * it too.
 */
export async function loadSiteStats(supabase, { period = DEFAULT_PERIOD, now = Date.now() } = {}) {
  const today = perthDay(now);
  const range = periodRange(period, today);
  const before = previousRange(range);
  const problems = [];

  const [daily, previousDaily, pages, live, activity, previousActivity] = await Promise.all([
    dailyRows(supabase, range.from, range.to, problems),
    dailyRows(supabase, before.from, before.to, problems),
    pageRows(supabase, range.from, range.to, problems),
    todayFromRaw(supabase, today, problems),
    loadActivity(supabase, range, problems),
    loadActivity(supabase, before, []),
  ]);

  // Today comes off the raw table, so it replaces whatever the roll up has for
  // today if a run happened to fold it.
  const merged = daily.filter((row) => row.day !== today);
  if (live) merged.push(live.day);

  const days = fillDays(range, merged);
  const totals = trafficTotals(days);
  const previousTotals = trafficTotals(fillDays(before, previousDaily));

  // Has the tracking ever recorded anything? A brand new install has to say so,
  // because a panel of zeroes reads as a website nobody visits.
  const collecting = totals.pageViews > 0 || previousTotals.pageViews > 0;

  const pageTotals = new Map();
  pages.forEach((row) => {
    pageTotals.set(row.path, (pageTotals.get(row.path) || 0) + (Number(row.page_views) || 0));
  });
  if (live) {
    live.pages.forEach((row) => {
      pageTotals.set(row.path, (pageTotals.get(row.path) || 0) + row.page_views);
    });
  }

  const funnel = [
    ...(collecting ? [{ key: "visits", label: "Visited the site", count: totals.visits }] : []),
    // NOT "opened the design tool". A row is only created once somebody has
    // named their design, so this counts people who started one rather than
    // everybody who ever loaded the page. Page views of /design are the other
    // number, and the two together are the drop off at the front door.
    { key: "design", label: "Named and started a design", count: activity.totals.designStarted },
    { key: "saved", label: "Saved their design", count: activity.totals.designSaved },
    { key: "sent", label: "Sent it to us", count: activity.totals.designSent },
  ];

  return {
    period: range.key,
    periodLabel: PERIODS[range.key].label,
    from: range.from,
    to: range.to,
    today,
    collecting,
    problems: [...new Set(problems)],

    traffic: {
      days: days.map((row) => ({
        day: row.day,
        visits: row.visits,
        pageViews: row.page_views,
        medianDwellMs: row.median_dwell_ms,
      })),
      totals,
      change: {
        visits: changePercent(totals.visits, previousTotals.visits),
        pageViews: changePercent(totals.pageViews, previousTotals.pageViews),
        medianDwellMs: changePercent(totals.medianDwellMs, previousTotals.medianDwellMs),
      },
      // A rate rather than a count, because "412 bounced" means nothing without
      // the number it is out of.
      bounceRate: totals.visits ? Math.round((totals.bounced / totals.visits) * 100) : null,
      pagesPerVisit: totals.visits ? Math.round((totals.pageViews / totals.visits) * 10) / 10 : null,
      pages: [...pageTotals.entries()]
        .map(([path, pageViews]) => ({ path, pageViews }))
        .sort((a, b) => b.pageViews - a.pageViews || a.path.localeCompare(b.path)),
      channels: orderedCounts(mergeCounts(days.map((row) => row.channels)), CHANNEL_ORDER, CHANNEL_LABELS),
      devices: orderedCounts(mergeCounts(days.map((row) => row.devices)), DEVICE_ORDER, DEVICE_LABELS),
    },

    activity: {
      days: activity.days,
      totals: activity.totals,
      change: {
        designStarted: changePercent(activity.totals.designStarted, previousActivity.totals.designStarted),
        designSaved: changePercent(activity.totals.designSaved, previousActivity.totals.designSaved),
        designSent: changePercent(activity.totals.designSent, previousActivity.totals.designSent),
        requests: changePercent(activity.totals.requests, previousActivity.totals.requests),
        enquiries: changePercent(activity.totals.enquiries, previousActivity.totals.enquiries),
      },
      sources: [...activity.sources.entries()]
        .map(([key, count]) => ({ key, label: SOURCE_LABELS[key] || key, count }))
        .sort((a, b) => b.count - a.count),
    },

    funnel,
  };
}
