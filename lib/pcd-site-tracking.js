// THE RULES A PAGE VIEW IS JUDGED BY.
//
// Every decision about a visit is made here rather than in the route or the
// browser, so the tracker, the write route and the roll up all agree about what
// counts as a bot, what counts as a page and where somebody came from.
//
// NOTHING IN THIS FILE TOUCHES NODE. It is imported by a client component, so a
// `node:crypto` import here would break the public site's bundle. The one thing
// that does need crypto, turning an address into a hash, lives on its own in
// lib/pcd-site-hash.js, which only the server imports.

// How long raw rows are kept. The roll ups are kept for good, so history
// survives; this only bounds the big table.
export const RAW_RETENTION_DAYS = 90;

// A visit that read one page and was gone again. Ten seconds is the usual line
// and it is a threshold, not a truth: somebody who found their answer in eight
// seconds is counted as a bounce.
export const BOUNCE_MS = 10000;

// A page nobody could plausibly be reading. Anything longer is almost certainly
// a tab left open, so it is capped rather than believed.
export const MAX_DWELL_MS = 30 * 60 * 1000;

// ── WHICH PAGES GET COUNTED ─────────────────────────────────────────────────
//
// Only the pages somebody could arrive at from the outside. Three groups are
// left out on purpose:
//
//   the admin        it is our own screen; counting ourselves would be the
//                    largest number on the panel within a week.
//   customer papers  /quotes/view, /project/view and the rest are one person's
//                    own document reached by a private link. Counting them
//                    would put a customer's paperwork at the top of "most read
//                    pages", and how often somebody reads their own quote is
//                    already on the quote.
//   machinery        api routes, the launch gate, payment returns.
const UNTRACKED_PREFIXES = [
  "/admin",
  "/api",
  "/launch",
  "/payments",
  // Both spellings, listed separately on purpose: the match below is exact or
  // followed by a slash, so "/quote" alone would let /quotes/view straight
  // through and put a customer's own paperwork in the popular pages.
  "/quote",
  "/quotes",
  "/project",
  "/variations",
  "/_next",
];

/** The path as it should be stored: no query, no trailing slash, no surprises. */
export function normalisePath(value) {
  let path = String(value || "").trim();
  if (!path) return "/";
  // A full URL is accepted so the caller does not have to remember which it has.
  const cut = path.indexOf("?");
  if (cut !== -1) path = path.slice(0, cut);
  const hash = path.indexOf("#");
  if (hash !== -1) path = path.slice(0, hash);
  if (!path.startsWith("/")) path = "/" + path;
  // Lower cased, because /Finishes and /finishes are one page to everybody
  // except a GROUP BY.
  path = path.toLowerCase();
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  // A path longer than this is somebody probing us, not a page.
  return path.slice(0, 300) || "/";
}

/** Is this a page worth counting? */
export function shouldTrackPath(value) {
  const path = normalisePath(value);
  return !UNTRACKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

// ── BOTS ────────────────────────────────────────────────────────────────────
//
// Not a complete list and it never will be. It catches the crawlers that
// actually turn up in a small Australian trade site's logs, and it is the
// reason the panel says "bots filtered out" rather than pretending they were
// never there. A bot that slips through inflates the visit count; nothing here
// hides a real person, which is the failure that would matter.
const BOT_MARKERS = [
  "bot", "crawl", "spider", "slurp", "scrape",
  "facebookexternalhit", "ia_archiver", "bingpreview", "yandex", "baidu",
  "duckduckgo-favicons", "applebot", "petalbot", "semrush", "ahrefs", "mj12",
  "dotbot", "dataforseo", "serpstat", "screaming frog",
  "gptbot", "ccbot", "claudebot", "anthropic-ai", "perplexity", "bytespider",
  "google-inspectiontool", "chrome-lighthouse", "headlesschrome", "phantomjs",
  "curl/", "wget/", "python-requests", "python-urllib", "go-http-client",
  "node-fetch", "axios/", "okhttp", "postman", "insomnia",
  "uptimerobot", "pingdom", "statuscake", "betteruptime", "newrelic",
];

/** True when this user agent is a machine rather than a person. */
export function isBot(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  // No user agent at all is never a browser.
  if (!ua) return true;
  return BOT_MARKERS.some((marker) => ua.includes(marker));
}

// ── DEVICE ──────────────────────────────────────────────────────────────────

/**
 * Phone, tablet or desktop.
 *
 * The user agent decides, and the viewport width only breaks a tie. Reading it
 * the other way round would file a laptop with a narrow window as a phone, and
 * "two thirds of people are on a phone" is a sentence that changes how the next
 * page gets built, so it had better be about the device.
 */
export function deviceFrom(userAgent, viewportWidth) {
  const ua = String(userAgent || "").toLowerCase();
  const width = Number(viewportWidth);

  if (ua.includes("ipad") || (ua.includes("android") && !ua.includes("mobile")) || ua.includes("tablet")) {
    return "tablet";
  }
  if (ua.includes("iphone") || ua.includes("ipod") || ua.includes("mobile") || ua.includes("windows phone")) {
    return "mobile";
  }
  if (ua.includes("macintosh") || ua.includes("windows") || ua.includes("linux") || ua.includes("cros")) {
    return "desktop";
  }
  // Nothing recognisable. Now, and only now, the width is worth asking.
  if (Number.isFinite(width) && width > 0) {
    if (width < 640) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  }
  return "unknown";
}

// ── WHERE THEY CAME FROM ────────────────────────────────────────────────────

// MATCHED ON THE HOST, NOT ON A PIECE OF THE TEXT.
//
// These used to be fragments tested with includes(), and one of them was
// "t.co", Twitter's link shortener. "chatgpt.com" contains it. So did
// "microsoft.com", which took Copilot with it, and so does any .co.uk domain
// with a t before the dot. Every visit that came from ChatGPT was filed as
// Facebook and Instagram, and the Facebook figure on the dashboard was mostly
// people arriving from an AI answer.
//
// So a host now has to BE the domain or be a subdomain of it. "chatgpt.com"
// matches chatgpt.com; "notchatgpt.com" does not.
const AI_DOMAINS = [
  "chatgpt.com",
  "openai.com",
  "perplexity.ai",
  "claude.ai",
  "copilot.microsoft.com",
  "gemini.google.com",
  "bard.google.com",
  "aistudio.google.com",
  "meta.ai",
  "grok.com",
  "x.ai",
  "deepseek.com",
  "mistral.ai",
  "you.com",
  "poe.com",
  "phind.com",
];
const SOCIAL_DOMAINS = [
  "facebook.com", "fb.com", "fb.me", "instagram.com", "l.instagram.com",
  "t.co", "twitter.com", "x.com", "pinterest.com", "pinterest.com.au",
  "linkedin.com", "lnkd.in", "tiktok.com", "youtube.com", "youtu.be",
  "reddit.com", "houzz.com", "houzz.com.au",
];
const GOOGLE_DOMAINS = ["googleusercontent.com", "googlesyndication.com"];
const OTHER_SEARCH_DOMAINS = [
  "bing.com", "duckduckgo.com", "yahoo.com", "yahoo.com.au",
  "ecosia.org", "brave.com", "startpage.com", "search.marcia.com",
];

// Google alone cannot be a list. It answers on a hundred country domains, and
// somebody searching from google.co.uk or google.com.au is on Google. One or
// two short pieces after the name, which is what every one of them looks like.
const GOOGLE_HOST = /(^|\.)google(\.[a-z]{2,3}){1,2}$/;

const PAID_MEDIUMS = ["cpc", "ppc", "paid", "paidsearch", "paid_search", "display", "cpm"];

/** Is this host that domain, or a subdomain of it? Never a coincidence. */
function hostIs(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

const hostIsOneOf = (host, domains) => domains.some((domain) => hostIs(host, domain));

/** The host out of a referrer, or "" when there is not one. */
function hostOf(referrer) {
  const value = String(referrer || "").trim();
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * One of: ads, ai, google, search, social, referral, direct.
 *
 * Order matters and it is deliberate.
 *
 * A paid click arrives FROM Google, so if the search test ran first every ad
 * would be filed as organic search and the ads account could never be checked
 * against anything.
 *
 * And AI runs before both Google and social, because Gemini is a google.com
 * subdomain and Copilot is a microsoft.com one. Tested the other way round,
 * every AI answer would be filed as something it is not, which is exactly the
 * mistake this list used to make.
 */
export function channelFrom({ referrer, gclid, utmMedium, utmSource, siteHost } = {}) {
  const medium = String(utmMedium || "").toLowerCase();
  const source = String(utmSource || "").toLowerCase();
  if (gclid || PAID_MEDIUMS.includes(medium)) return "ads";

  const host = hostOf(referrer);

  // Somebody moving around our own site is not arriving from anywhere. The
  // channel that matters is the one on their first view, and this stops the
  // second page of a visit overwriting it with "referral: ourselves".
  const own = String(siteHost || "").toLowerCase().replace(/^www\./, "");
  if (host && own && host.replace(/^www\./, "") === own) return "direct";

  if (!host) {
    // No referrer, but a tagged link: an email, a QR code, a printed campaign.
    if (source || medium) return "referral";
    return "direct";
  }

  if (hostIsOneOf(host, AI_DOMAINS)) return "ai";
  if (GOOGLE_HOST.test(host) || hostIsOneOf(host, GOOGLE_DOMAINS)) return "google";
  if (hostIsOneOf(host, OTHER_SEARCH_DOMAINS)) return "search";
  if (hostIsOneOf(host, SOCIAL_DOMAINS)) return "social";
  return "referral";
}

/** What each channel is called on the screen. */
export const CHANNEL_LABELS = {
  google: "Google search",
  // Its own line rather than folded into search, because it is a different
  // thing to be found by: somebody arrives having already been told about us,
  // and there is no ranking to check or bid to place.
  ai: "ChatGPT and other AI",
  ads: "Google Ads",
  search: "Another search engine",
  social: "Facebook and Instagram",
  referral: "A link on another site",
  direct: "Typed in or saved",
};

/** The order they are listed in, biggest source of work first. */
export const CHANNEL_ORDER = ["google", "ai", "ads", "social", "search", "referral", "direct"];

export const DEVICE_LABELS = {
  mobile: "Phone",
  desktop: "Desktop",
  tablet: "Tablet",
  unknown: "Not known",
};

export const DEVICE_ORDER = ["mobile", "desktop", "tablet", "unknown"];

// ── SMALL SHARED MATHS ──────────────────────────────────────────────────────

/**
 * The middle value. Used everywhere an average would be reached for, because
 * one tab left open over lunch moves an average and does not move this.
 */
export function medianOf(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * The change from one period to the one before it, as a whole percent.
 *
 * Null when there is nothing to compare against, so the screen can say nothing
 * rather than print an arrow. Coming from zero is not "up infinity percent" and
 * it is not "up 0 percent" either; it is a first period, and the honest answer
 * is to leave the arrow off.
 */
export function changePercent(now, before) {
  const from = Number(before);
  const to = Number(now);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return Math.round(((to - from) / from) * 100);
}

// ── PERTH ───────────────────────────────────────────────────────────────────
//
// Everything on this panel is counted by Perth days, because that is the day
// somebody here means when they say "yesterday". Perth is UTC+8 all year with
// no daylight saving, so this is a fixed offset and not a timezone library.
export const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The Perth calendar day an instant falls in, as YYYY-MM-DD. */
export function perthDay(instant = Date.now()) {
  const ms = instant instanceof Date ? instant.getTime() : Number(instant);
  return new Date(ms + PERTH_OFFSET_MS).toISOString().slice(0, 10);
}

/** A day string moved by whole days, still in Perth. */
export function shiftDay(day, days) {
  const base = new Date(`${day}T00:00:00Z`).getTime();
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, inclusive, oldest first. */
export function daysBetween(from, to) {
  const out = [];
  let day = from;
  // Guarded rather than while(true): a reversed pair would otherwise spin.
  for (let i = 0; i < 400 && day <= to; i++) {
    out.push(day);
    day = shiftDay(day, 1);
  }
  return out;
}

/** The UTC instants a Perth day starts and ends at, for a range query. */
export function perthDayBounds(day) {
  const start = new Date(`${day}T00:00:00Z`).getTime() - PERTH_OFFSET_MS;
  return { fromIso: new Date(start).toISOString(), toIso: new Date(start + 86400000).toISOString() };
}
