// COUNTING VISITS TO THE PUBLIC SITE.
//
// ── WHAT THIS FILE IS PROTECTING ─────────────────────────────────────────────
//
// A visit counter that is slightly wrong is worse than none at all, because a
// number on a dashboard gets believed and then gets acted on. The four ways
// this goes wrong, and the four things pinned here:
//
//   BOTS COUNTED AS PEOPLE. A third or more of raw hits are crawlers. Counted
//   in, the site looks three times busier than it is and every rate built on
//   visits is nonsense.
//
//   OURSELVES COUNTED AS CUSTOMERS. The admin is the most visited part of this
//   domain by a distance, and a customer's own quote is reached by a private
//   link. Neither belongs in "most read pages".
//
//   VISITS ADDED UP FROM PAGES. One visit that reads four pages sits on four
//   page rows. Summing them says four visits. Visits are counted once, from
//   distinct sessions, and never derived.
//
//   AN AVERAGE STAY. One tab left open over lunch drags a mean into fiction and
//   moves a median by one row. Everything about time uses the median.
//
// ── AND ONE THING THAT IS NOT ABOUT ACCURACY ─────────────────────────────────
//
// No address, no browser string, no person is ever stored, and the daily hash
// cannot be joined from one day to the next. That is what keeps this out of
// cookie banner territory, so it is a test rather than a comment.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BOUNCE_MS,
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  MAX_DWELL_MS,
  changePercent,
  channelFrom,
  daysBetween,
  deviceFrom,
  isBot,
  medianOf,
  normalisePath,
  perthDay,
  perthDayBounds,
  shiftDay,
  shouldTrackPath,
} from "../lib/pcd-site-tracking.js";
import { saltForDay, visitorHash, clientIp } from "../lib/pcd-site-hash.js";
import { foldDay } from "../lib/pcd-site-rollup.js";
import { loadSiteStats, periodRange, previousRange } from "../lib/pcd-site-stats.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ── bots ────────────────────────────────────────────────────────────────────

test("the crawlers that actually turn up are not counted as people", () => {
  [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0)",
    "facebookexternalhit/1.1",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
    "Mozilla/5.0 (compatible; SemrushBot/7~bl)",
    "Mozilla/5.0 (compatible; ClaudeBot/1.0)",
    "GPTBot/1.0",
    "curl/8.4.0",
    "python-requests/2.31.0",
    "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0",
    "UptimeRobot/2.0",
  ].forEach((ua) => assert.equal(isBot(ua), true, `${ua} should be a bot`));
});

test("no user agent at all is never a person", () => {
  // Every real browser sends one. Nothing that omits it is somebody reading.
  assert.equal(isBot(""), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot(undefined), true);
});

test("a real browser is not thrown out as a bot", () => {
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  ].forEach((ua) => assert.equal(isBot(ua), false, `${ua} is a person`));
});

// ── which pages count ───────────────────────────────────────────────────────

test("our own screens are never counted as website traffic", () => {
  // The admin would be the largest number on the panel inside a week.
  ["/admin", "/admin/dashboard", "/admin/quotes/1042", "/api/track"].forEach((path) =>
    assert.equal(shouldTrackPath(path), false, `${path} must not be counted`)
  );
});

test("a customer's own paperwork is never counted as a popular page", () => {
  // These are one person's document behind a private link. Counting them would
  // put somebody's quote at the top of "most read pages", and how often they
  // open it is already on the quote.
  ["/quote/view", "/quotes/view", "/project/view", "/variations/view", "/payments/success"].forEach((path) =>
    assert.equal(shouldTrackPath(path), false, `${path} must not be counted`)
  );
});

test("the pages somebody could actually arrive at are counted", () => {
  ["/", "/finishes", "/design", "/start", "/products", "/products/shaker-door", "/request-quote", "/contact"].forEach(
    (path) => assert.equal(shouldTrackPath(path), true, `${path} should be counted`)
  );
});

test("one page is one page, however it was linked to", () => {
  // /finishes?tab=edges and /Finishes/ are the same page to everybody except a
  // GROUP BY, which would list them separately and halve both.
  assert.equal(normalisePath("/finishes?tab=edges&product=profiled-fronts"), "/finishes");
  assert.equal(normalisePath("/Finishes/"), "/finishes");
  assert.equal(normalisePath("/finishes#colours"), "/finishes");
  assert.equal(normalisePath(""), "/");
  assert.equal(normalisePath("/"), "/");
  // Somebody probing us, not a page.
  assert.ok(normalisePath("/" + "a".repeat(500)).length <= 301);
});

// ── device ──────────────────────────────────────────────────────────────────

test("the device comes from the browser, and the window only breaks a tie", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148 Safari/604.1";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0.0.0 Safari/537.36";

  assert.equal(deviceFrom(iphone, 390), "mobile");
  assert.equal(deviceFrom("Mozilla/5.0 (iPad; CPU OS 17_4)", 820), "tablet");
  assert.equal(deviceFrom("Mozilla/5.0 (Linux; Android 14; SM-S918B) Mobile Safari/537.36", 412), "mobile");
  assert.equal(deviceFrom("Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36", 800), "tablet");

  // THE ONE THAT MATTERS. A laptop with a narrow window is a laptop. Reading
  // the width first would file it as a phone, and "two thirds are on a phone"
  // is a sentence that changes how the next page gets built.
  assert.equal(deviceFrom(mac, 500), "desktop");

  // Only with nothing recognisable does the width get a say.
  assert.equal(deviceFrom("something new", 400), "mobile");
  assert.equal(deviceFrom("something new", 1400), "desktop");
  assert.equal(deviceFrom("", 0), "unknown");
});

// ── where they came from ────────────────────────────────────────────────────

test("a paid click is an ad, not organic search", () => {
  // THE ORDER THIS IS DECIDED IN. A paid click arrives FROM google.com, so if
  // the search test ran first every ad would be filed as organic and the ads
  // account could never be checked against anything.
  assert.equal(channelFrom({ referrer: "https://www.google.com/", gclid: "abc123" }), "ads");
  assert.equal(channelFrom({ referrer: "https://www.google.com/" }), "google");
  assert.equal(channelFrom({ referrer: "", utmMedium: "cpc" }), "ads");
});

test("the rest of the channels land where they should", () => {
  assert.equal(channelFrom({ referrer: "https://www.bing.com/search" }), "search");
  assert.equal(channelFrom({ referrer: "https://l.instagram.com/" }), "social");
  assert.equal(channelFrom({ referrer: "https://www.facebook.com/" }), "social");
  assert.equal(channelFrom({ referrer: "https://www.houzz.com.au/" }), "social");
  assert.equal(channelFrom({ referrer: "https://someblog.com.au/kitchens" }), "referral");
  assert.equal(channelFrom({ referrer: "" }), "direct");
  // A tagged link with no referrer: an email, a QR code, a printed campaign.
  assert.equal(channelFrom({ referrer: "", utmSource: "newsletter" }), "referral");
});

// ── the bug that put ChatGPT in the Facebook column ────────────────────────

test("a visit from ChatGPT is an AI answer, not Facebook", () => {
  // THE BUG THIS PINS, and it was live for as long as the tracking has been.
  // The social list was matched with includes() and one of the hosts in it was
  // "t.co", Twitter's link shortener. "chatgp[t.co]m" contains it. Every person
  // who found us through ChatGPT was filed as Facebook and Instagram, and the
  // Facebook figure on the dashboard was almost entirely them.
  assert.equal(channelFrom({ referrer: "https://chatgpt.com/" }), "ai");
  assert.equal(channelFrom({ referrer: "https://chat.openai.com/" }), "ai");
  assert.equal(channelFrom({ referrer: "https://www.perplexity.ai/" }), "ai");
  assert.equal(channelFrom({ referrer: "https://claude.ai/" }), "ai");
});

test("Copilot and Gemini are AI answers too, not Facebook and not Google", () => {
  // Both are subdomains of something else, which is why the order matters: the
  // AI test has to run before the Google one and before social, or Gemini reads
  // as organic search and Copilot reads as Facebook.
  assert.equal(channelFrom({ referrer: "https://copilot.microsoft.com/" }), "ai");
  assert.equal(channelFrom({ referrer: "https://gemini.google.com/app" }), "ai");
  // And ordinary Google is still Google, on any of its country domains.
  assert.equal(channelFrom({ referrer: "https://www.google.com/" }), "google");
  assert.equal(channelFrom({ referrer: "https://www.google.com.au/search?q=x" }), "google");
  assert.equal(channelFrom({ referrer: "https://www.google.co.uk/" }), "google");
});

test("a host is matched as a host, never as a piece of the text", () => {
  // The whole class of bug, not just the one instance of it. Anything with
  // "t.co" inside it used to be Facebook.
  assert.equal(channelFrom({ referrer: "https://support.co.uk/help" }), "referral");
  assert.equal(channelFrom({ referrer: "https://notchatgpt.com/" }), "referral");
  assert.equal(channelFrom({ referrer: "https://mygoogle.com.hijack.example/" }), "referral");
  // And the real t.co still lands where it should.
  assert.equal(channelFrom({ referrer: "https://t.co/AbCdEf" }), "social");
  // A subdomain of something we do know is that thing.
  assert.equal(channelFrom({ referrer: "https://m.facebook.com/" }), "social");
});

test("a paid AI click is still an ad", () => {
  // The ads test runs first for the same reason it runs before search.
  assert.equal(channelFrom({ referrer: "https://chatgpt.com/", gclid: "abc123" }), "ads");
});

test("moving around our own site is not arriving from somewhere", () => {
  // Otherwise the second page of every visit would overwrite the channel with
  // "referral: ourselves" and Google search would read as nearly nothing.
  assert.equal(
    channelFrom({ referrer: "https://www.perthcabinetdoors.com.au/finishes", siteHost: "www.perthcabinetdoors.com.au" }),
    "direct"
  );
  assert.equal(
    channelFrom({ referrer: "https://perthcabinetdoors.com.au/", siteHost: "www.perthcabinetdoors.com.au" }),
    "direct"
  );
});

test("AI answers have a column of their own on the dashboard", () => {
  // Folded into "another search engine" it would be invisible, and it is not a
  // search engine: somebody arrives having already been told about us, and
  // there is no ranking to check or bid to place.
  assert.ok(CHANNEL_ORDER.includes("ai"));
  assert.match(CHANNEL_LABELS.ai, /AI/);
  // Second in the list, behind Google. It is already ahead of Bing.
  assert.equal(CHANNEL_ORDER.indexOf("ai"), 1);
});

// ── a page that does not exist is not a page view ──────────────────────────

test("the 404 page leaves the marker the counter looks for", () => {
  // THE OTHER HALF OF THE SKEW. The counter is mounted in the site layout, and
  // a layout wraps the not-found boundary exactly as it wraps a real page, so
  // every request for a URL we do not have was reported as something somebody
  // had read. A scraper sweeping eight dead product URLs put about a hundred
  // and ninety views into the dashboard that way.
  //
  // These two files are the fix and neither works without the other, so they
  // are pinned together here.
  const notFound = readFileSync(new URL("../app/(site)/not-found.js", import.meta.url), "utf8");
  const tracker = readFileSync(new URL("../app/(site)/SiteTracker.js", import.meta.url), "utf8");
  assert.match(notFound, /data-site-not-found/, "the 404 page has stopped marking itself");
  assert.match(tracker, /data-site-not-found/, "the counter has stopped looking for the marker");
  assert.match(tracker, /if \(isNotFoundPage\(\)\) return undefined;/, "the counter no longer skips a 404");
});

test("the counter still counts a real page if anything about the check goes wrong", () => {
  // A counting script must never be the reason a page fails, and a lost view is
  // a smaller cost than a blank page.
  const tracker = readFileSync(new URL("../app/(site)/SiteTracker.js", import.meta.url), "utf8");
  const guard = tracker.slice(tracker.indexOf("function isNotFoundPage"), tracker.indexOf("export default"));
  assert.match(guard, /catch/, "an unexpected failure must not stop the page being counted");
  assert.match(guard, /return false;/);
});

test("the city is decoded on the way in", () => {
  // Vercel percent encodes it, so it was being stored as "Frankfurt%20am%20Main".
  const route = readFileSync(new URL("../app/api/track/route.js", import.meta.url), "utf8");
  assert.match(route, /decodeHeader\(headers\.get\("x-vercel-ip-city"\)\)/);
  assert.match(route, /decodeURIComponent/);
});

test("every channel that can be recorded has something to call it", () => {
  CHANNEL_ORDER.forEach((key) => assert.ok(CHANNEL_LABELS[key], `${key} has no label`));
});

// ── the visitor hash ────────────────────────────────────────────────────────

test("the same person on the same day is one visitor", () => {
  const args = { ip: "203.0.113.9", userAgent: "Chrome", day: "2026-08-31", secret: "s" };
  assert.equal(visitorHash(args), visitorHash(args));
});

test("the same person tomorrow cannot be joined to today", () => {
  // This is the whole privacy promise. If these matched, the app would be
  // following people across days and would need a consent notice.
  const today = visitorHash({ ip: "203.0.113.9", userAgent: "Chrome", day: "2026-08-31", secret: "s" });
  const tomorrow = visitorHash({ ip: "203.0.113.9", userAgent: "Chrome", day: "2026-09-01", secret: "s" });
  assert.notEqual(today, tomorrow);
  assert.notEqual(saltForDay("2026-08-31", "s"), saltForDay("2026-09-01", "s"));
});

test("two different people are two visitors", () => {
  const a = visitorHash({ ip: "203.0.113.9", userAgent: "Chrome", day: "2026-08-31", secret: "s" });
  const b = visitorHash({ ip: "203.0.113.10", userAgent: "Chrome", day: "2026-08-31", secret: "s" });
  assert.notEqual(a, b);
});

test("the address taken is the visitor's, not the proxy's", () => {
  // x-forwarded-for is a chain and the client is FIRST. Taking the last would
  // hash Vercel's own edge address and file the whole country as one person.
  const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 172.16.0.1" });
  assert.equal(clientIp(headers), "203.0.113.9");
  assert.equal(clientIp(new Headers({})), "");
});

test("nothing that identifies anybody is written to a column", () => {
  const MIGRATION = read("supabase/202608311400_pcd_site_traffic.sql");
  const ROUTE = read("app/api/track/route.js");

  // The table has no column for either of them, and the route hands neither to
  // the insert. Both are used to work out a device and a hash and then dropped.
  assert.ok(!/^\s*ip\b/m.test(MIGRATION), "the events table has an ip column");
  assert.ok(!/user_agent/.test(MIGRATION), "the events table has a user agent column");

  // The row handed to the insert is the thing to check. Both values are used
  // inside it, to work out a device and a hash, and neither is a field on it.
  const start = ROUTE.indexOf("const row = {");
  const row = ROUTE.slice(start, ROUTE.indexOf("\n    };", start));
  assert.ok(row.length > 100, "the row being inserted could not be found");

  // The columns being written, which is the row's own keys and not the
  // arguments to the calls inside it. The address IS used in there, to work out
  // a device and a hash; what matters is that it does not come out the far side
  // as a column.
  const columns = [...row.matchAll(/^ {6}(\w+):/gm)].map((match) => match[1]);
  assert.ok(columns.includes("visitor_hash"), "the row's own keys could not be read");
  assert.ok(!columns.includes("ip"), "the route is writing an address");
  assert.ok(!columns.includes("user_agent"), "the route is writing a browser string");
});

test("the visit table is not readable with the key that ships in the browser", () => {
  // The anon key is on every page of the public site. A table of who visited
  // what must not be readable with it, so RLS is on and no policy lets anybody
  // but the service role in.
  const MIGRATION = read("supabase/202608311400_pcd_site_traffic.sql");
  ["pcd_site_events", "pcd_site_daily", "pcd_site_page_daily"].forEach((table) => {
    assert.match(MIGRATION, new RegExp(`alter table public\\.${table} enable row level security`));
  });
  assert.ok(!/to anon/.test(MIGRATION), "a policy grants the anon key access");
  assert.ok(!/using \(true\)/.test(MIGRATION), "a policy lets somebody read the rows");
});

// ── folding a day ───────────────────────────────────────────────────────────

const at = (minutes) => new Date(Date.UTC(2026, 7, 30, 2, minutes)).toISOString();

function view(session, path, extra = {}) {
  return {
    session_id: session,
    visitor_hash: extra.visitor || `v-${session}`,
    path,
    channel: extra.channel || "google",
    device: extra.device || "mobile",
    is_bot: extra.bot || false,
    dwell_ms: extra.dwell ?? 20000,
    created_at: extra.at || at(0),
  };
}

test("one visit that reads four pages is one visit and four page views", () => {
  // THE MISTAKE THIS EXISTS FOR. Adding the per page figures up says four.
  const folded = foldDay("2026-08-30", [
    view("s1", "/"), view("s1", "/finishes"), view("s1", "/design"), view("s1", "/request-quote"),
  ]);
  assert.equal(folded.day.visits, 1);
  assert.equal(folded.day.page_views, 4);
  assert.equal(folded.pages.length, 4);
  folded.pages.forEach((page) => assert.equal(page.visits, 1));
});

test("bots are taken out of every figure and still counted separately", () => {
  const folded = foldDay("2026-08-30", [
    view("s1", "/"),
    view("bot1", "/", { bot: true }),
    view("bot1", "/finishes", { bot: true }),
  ]);
  assert.equal(folded.day.visits, 1, "a crawler is not a visit");
  assert.equal(folded.day.page_views, 1, "a crawler is not a page view");
  assert.equal(folded.day.bot_views, 2, "but we still know how many there were");
  assert.equal(folded.pages.length, 1);
});

test("the channel is where the visit started, not where every page came from", () => {
  // Counting every view would credit Google four times for one visit, and the
  // internal referrers in between would each look like a separate arrival.
  const folded = foldDay("2026-08-30", [
    view("s1", "/", { channel: "google", at: at(0) }),
    view("s1", "/finishes", { channel: "direct", at: at(1) }),
    view("s1", "/design", { channel: "direct", at: at(2) }),
  ]);
  assert.deepEqual(folded.day.channels, { google: 1 });
});

test("a visit that read one page and left is a bounce", () => {
  const folded = foldDay("2026-08-30", [
    view("quick", "/", { dwell: BOUNCE_MS - 1000 }),
    view("slow", "/", { dwell: BOUNCE_MS + 5000 }),
    view("deep", "/", { dwell: 2000, at: at(0) }),
    view("deep", "/finishes", { dwell: 2000, at: at(1) }),
  ]);
  // One page and gone. Two pages is not a bounce however fast it was.
  assert.equal(folded.day.bounced, 1);
});

test("a tab left open over lunch does not become a reading time", () => {
  const folded = foldDay("2026-08-30", [
    view("s1", "/", { dwell: 10000 }),
    view("s2", "/", { dwell: 20000 }),
    view("s3", "/", { dwell: 6 * 60 * 60 * 1000 }),
  ]);
  // The median is the point: an average of these three would be over two hours.
  assert.equal(folded.day.median_dwell_ms, 20000);
  assert.ok(folded.day.median_dwell_ms < MAX_DWELL_MS);
});

test("a day with nothing in it folds to zeroes rather than throwing", () => {
  const folded = foldDay("2026-08-30", []);
  assert.equal(folded.day.visits, 0);
  assert.equal(folded.day.page_views, 0);
  assert.equal(folded.day.median_dwell_ms, null);
  assert.deepEqual(folded.pages, []);
});

test("two people at the same address are two visits and one visitor is one", () => {
  const folded = foldDay("2026-08-30", [
    view("s1", "/", { visitor: "hash-a" }),
    view("s2", "/", { visitor: "hash-a" }),
    view("s3", "/", { visitor: "hash-b" }),
  ]);
  assert.equal(folded.day.visits, 3, "three tabs is three visits");
  assert.equal(folded.day.visitors, 2, "but only two people");
});

// ── days and periods ────────────────────────────────────────────────────────

test("a day is a Perth day, because that is the day somebody here means", () => {
  // Perth is UTC+8 all year with no daylight saving. 4pm UTC is midnight here,
  // so anything after it belongs to tomorrow.
  assert.equal(perthDay(Date.UTC(2026, 7, 30, 15, 59)), "2026-08-30");
  assert.equal(perthDay(Date.UTC(2026, 7, 30, 16, 0)), "2026-08-31");
});

test("a Perth day starts and ends where the query expects", () => {
  const { fromIso, toIso } = perthDayBounds("2026-08-31");
  assert.equal(fromIso, "2026-08-30T16:00:00.000Z");
  assert.equal(toIso, "2026-08-31T16:00:00.000Z");
});

test("this month is the month so far, and the comparison is the same length", () => {
  const range = periodRange("month", "2026-08-31");
  assert.deepEqual(range, { key: "month", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(daysBetween(range.from, range.to).length, 31);

  const before = previousRange(range);
  assert.deepEqual(before, { from: "2026-07-01", to: "2026-07-31" });
  assert.equal(daysBetween(before.from, before.to).length, 31);
});

test("seven days means today and the six before it", () => {
  const range = periodRange("d7", "2026-08-31");
  assert.deepEqual(range, { key: "d7", from: "2026-08-25", to: "2026-08-31" });
  assert.deepEqual(previousRange(range), { from: "2026-08-18", to: "2026-08-24" });
});

test("a period nobody asked for falls back rather than breaking the page", () => {
  assert.equal(periodRange("nonsense", "2026-08-31").key, "month");
});

test("shifting a day crosses a month end", () => {
  assert.equal(shiftDay("2026-08-31", 1), "2026-09-01");
  assert.equal(shiftDay("2026-09-01", -1), "2026-08-31");
});

// ── the small shared maths ──────────────────────────────────────────────────

test("the median is the middle, and an empty list has none", () => {
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([4, 1, 2, 3]), 3);   // rounded midpoint of 2 and 3
  assert.equal(medianOf([]), null);
  assert.equal(medianOf([null, undefined, NaN]), null);
});

test("a change from nothing is not a percentage", () => {
  // Going from 0 to 12 is not "up infinity percent" and it is not "up 0" either.
  // It is a first period, and the honest answer is to print no arrow at all.
  assert.equal(changePercent(12, 0), null);
  assert.equal(changePercent(12, 10), 20);
  assert.equal(changePercent(8, 10), -20);
  assert.equal(changePercent(10, 10), 0);
});

// ── the site itself ─────────────────────────────────────────────────────────

test("the counter is mounted on the public site and nowhere near the admin", () => {
  const SITE_LAYOUT = read("app/(site)/layout.js");
  const ROOT_LAYOUT = read("app/layout.js");
  assert.match(SITE_LAYOUT, /<SiteTracker \/>/, "the public layout is not counting anything");
  assert.ok(!/SiteTracker/.test(ROOT_LAYOUT), "the root layout would count us reading our own admin");
});

test("the beacon gets through the launch gate", () => {
  // It is called by sendBeacon as a page is torn down, so a redirect to /launch
  // would be followed silently and write nothing. The gated period would then
  // look like a week nobody visited.
  assert.match(read("middleware.js"), /pathname === "\/api\/track"/);
});

test("nothing the visitor sees can break because of the counter", () => {
  const ROUTE = read("app/api/track/route.js");
  const TRACKER = read("app/(site)/SiteTracker.js");

  // Every path out of the route is a 204. A bad body, a missing salt and a
  // database that is down all end the same way.
  assert.ok(!/status:\s*(4|5)\d\d/.test(ROUTE), "the route can answer with an error");
  assert.match(ROUTE, /const done = \(\) => new Response\(null, \{ status: 204 \}\)/);

  // Storage throws outright in a private window with site data blocked, so
  // every read and write of it is wrapped.
  assert.ok(!/[^{]\bsessionStorage\.(get|set)Item/.test(TRACKER.replace(/try \{[\s\S]*?\} catch/g, "")),
    "sessionStorage is used outside a try block");
});

test("the roll up leaves today alone", () => {
  // A half day written into the row the dashboard reads would look like a real
  // number and be wrong until midnight. Today is counted off the raw table.
  const ROLLUP = read("lib/pcd-site-rollup.js");
  assert.match(ROLLUP, /const yesterday = shiftDay\(today, -1\)/);
  assert.match(ROLLUP, /if \(from > yesterday\) return \[\]/);

  const STATS = read("lib/pcd-site-stats.js");
  assert.match(STATS, /todayFromRaw/, "the dashboard has no way to count today");
  assert.match(STATS, /daily\.filter\(\(row\) => row\.day !== today\)/, "today would be counted twice");
});

test("the prune is the last thing that happens", () => {
  // A failure while folding must never delete the rows that would have fixed it
  // on the next run.
  const ROLLUP = read("lib/pcd-site-rollup.js");
  assert.ok(
    ROLLUP.indexOf("const cutoff") > ROLLUP.indexOf("for (const day of days)"),
    "the prune runs before the fold"
  );
});

// ── the loader, end to end ──────────────────────────────────────────────────
//
// Against a stubbed client rather than a database, because what goes wrong here
// is shape: a column renamed, a merge that double counts, today counted twice
// because it is in the roll up AND in the raw table. None of that needs Postgres
// to catch and all of it would show as an empty or wrong panel.

/** A client that answers every query with the rows for that table. */
function stubClient(tables) {
  return {
    from(table) {
      const rows = tables[table] || [];
      const query = {
        select: () => query, gte: () => query, lt: () => query, lte: () => query,
        eq: () => query, order: () => query, limit: () => query,
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return query;
    },
  };
}

const NOW = Date.UTC(2026, 7, 31, 3, 0);            // 11am Perth on 31 August
const stamp = (day, hour = 3) => new Date(Date.UTC(2026, 7, day, hour)).toISOString();

const FIXTURE = {
  pcd_site_daily: [
    { day: "2026-08-29", visits: 120, visitors: 100, page_views: 300, median_dwell_ms: 90000, bounced: 40, bot_views: 60, channels: { google: 70, ads: 30, direct: 20 }, devices: { mobile: 80, desktop: 40 } },
    { day: "2026-08-30", visits: 80,  visitors: 70,  page_views: 190, median_dwell_ms: 105000, bounced: 30, bot_views: 55, channels: { google: 50, social: 30 }, devices: { mobile: 55, desktop: 25 } },
  ],
  pcd_site_page_daily: [
    { path: "/finishes", page_views: 140 },
    { path: "/", page_views: 120 },
    { path: "/finishes", page_views: 90 },
    { path: "/design", page_views: 60 },
  ],
  // Today, still being counted off the raw table.
  pcd_site_events: [
    { session_id: "a", visitor_hash: "h1", path: "/", channel: "google", device: "mobile", is_bot: false, dwell_ms: 30000, created_at: stamp(31) },
    { session_id: "a", visitor_hash: "h1", path: "/finishes", channel: "direct", device: "mobile", is_bot: false, dwell_ms: 45000, created_at: stamp(31, 4) },
    { session_id: "b", visitor_hash: "h2", path: "/", channel: "ads", device: "desktop", is_bot: false, dwell_ms: 4000, created_at: stamp(31) },
    { session_id: "z", visitor_hash: "hz", path: "/", channel: "direct", device: "unknown", is_bot: true, dwell_ms: 100, created_at: stamp(31) },
  ],
  pcd_design_projects: [
    { created_at: stamp(30), customer_id: null },
    { created_at: stamp(31), customer_id: "c1" },
    { created_at: stamp(31), customer_id: null },
  ],
  pcd_quote_requests: [
    { created_at: stamp(31), source: "design_tool", design_project_id: "d1" },
    { created_at: stamp(30), source: "request_quote", design_project_id: null },
  ],
  pcd_enquiries: [{ created_at: stamp(29) }],
};

test("the panel gets every day of the month, quiet ones included", async () => {
  // A chart with gaps where the quiet days were reads as missing data. A quiet
  // Sunday is not missing, it is a quiet Sunday.
  const site = await loadSiteStats(stubClient(FIXTURE), { period: "month", now: NOW });
  assert.equal(site.traffic.days.length, 31);
  assert.equal(site.traffic.days[0].day, "2026-08-01");
  assert.equal(site.traffic.days.at(-1).day, "2026-08-31");
  assert.equal(site.traffic.days[0].visits, 0, "a day with no rows is a zero, not a hole");
});

test("today is counted off the raw table, and only once", async () => {
  const site = await loadSiteStats(stubClient(FIXTURE), { period: "month", now: NOW });
  const today = site.traffic.days.at(-1);
  assert.equal(today.day, "2026-08-31");
  // Two real sessions, three real page views. The crawler is in the fixture and
  // is in neither figure.
  assert.equal(today.visits, 2);
  assert.equal(today.pageViews, 3);
  // 120 + 80 from the roll up, 2 from today. If today were taken from both the
  // roll up and the raw table this would be higher.
  assert.equal(site.traffic.totals.visits, 202);
});

test("page views merge across the period, and visits are never derived from them", async () => {
  const site = await loadSiteStats(stubClient(FIXTURE), { period: "month", now: NOW });
  assert.deepEqual(site.traffic.pages[0], { path: "/finishes", pageViews: 231 }, "140 + 90 from the roll up, 1 from today");
  // Nothing on the pages list carries a visit count, precisely so nobody can
  // add them up and get a number that means nothing.
  assert.ok(!("visits" in site.traffic.pages[0]));
});

test("channels and devices come back ordered, labelled and with a share", async () => {
  const site = await loadSiteStats(stubClient(FIXTURE), { period: "month", now: NOW });
  assert.deepEqual(site.traffic.channels[0], { key: "google", label: "Google search", count: 121, share: 60 });
  assert.deepEqual(site.traffic.devices[0], { key: "mobile", label: "Phone", count: 136, share: 67 });
  // The screen prints these. It must never have to work a percentage out itself.
  site.traffic.devices.forEach((device) => assert.equal(typeof device.share, "number"));
});

test("what the site produced is exact, and needs none of the tracking", async () => {
  const site = await loadSiteStats(stubClient(FIXTURE), { period: "month", now: NOW });
  assert.deepEqual(site.activity.totals, {
    designStarted: 3, designSaved: 1, designSent: 1, requests: 2, enquiries: 1,
  });
  assert.equal(site.activity.days.length, 31);
});

test("every step of the funnel is counted on its own", async () => {
  // Never worked back from the step above with a rate, which is how a funnel
  // ends up showing more people saving a design than opening the tool.
  const site = await loadSiteStats(stubClient(FIXTURE), { period: "month", now: NOW });
  assert.deepEqual(site.funnel.map((step) => step.count), [202, 3, 1, 1]);
});

test("with nothing collected the panel says so instead of drawing zeroes", async () => {
  const site = await loadSiteStats(
    stubClient({ ...FIXTURE, pcd_site_daily: [], pcd_site_page_daily: [], pcd_site_events: [] }),
    { period: "month", now: NOW }
  );
  assert.equal(site.collecting, false, "a panel of noughts reads as a website nobody visits");
  // The design tool figures are still exact, because they never needed tracking.
  assert.equal(site.activity.totals.designStarted, 3);
  // And the funnel drops the step it cannot answer rather than showing it as 0.
  assert.equal(site.funnel[0].key, "design");
});
