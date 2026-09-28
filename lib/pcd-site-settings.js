// THE WEBSITE'S OWN SETTINGS: WHETHER THE SHOP IS OPEN, THE LEAD TIME, AND THE
// MESSAGES WE PUT IN FRONT OF CUSTOMERS.
//
// Decided 28 September 2026. All three used to be written into the code, so
// opening the shop, running a sale or saying the workshop is busier than usual
// meant a deploy. They live in one row, edited in Settings > Shop and Site
// Messages, and are read by the public site on every page.
//
// Pure, and safe in the browser. The half that touches the database is
// lib/pcd-site-settings-store.js.
//
// ── THE SHOP SWITCH ──────────────────────────────────────────────────────────
//
// Off means closed to the public: the shop pages show a closed page with the
// way to a quote, the price and checkout endpoints refuse, and every link to the
// shop disappears. Signed-in staff still see the whole shop, with a bar saying
// it is closed, so it can be checked before it is opened. It starts off, and a
// settings row that cannot be read reads as off, so nothing is ever sold
// because a table went missing.
//
// ── THE LEAD TIME ────────────────────────────────────────────────────────────
//
// A number of working days, not a phrase, so every sentence that mentions it
// can say it its own way and still agree: "about ten working days" on the
// product page, "It goes on the bench in about ten working days" in the email.
//
// TWO OF THEM, decided 28 September 2026: decorative board, which we cut
// ourselves, and thermolaminate, which Polytec presses to order and can take
// longer. A thermolaminate piece is promised the second; an order with any
// thermolaminate in it is promised the longer of the two, because it ships
// whole; a page about the shop in general gives the range.
//
// ── THE MESSAGES ─────────────────────────────────────────────────────────────
//
// One per place on the site. Empty text shows nothing. Dates are optional and
// whole days in Perth: a message shows from the start of its first day to the
// end of its last, so a sale that ends on Sunday comes down on Sunday night.
// Plain text only, so nothing typed in Settings can break a page.

export const SITE_TIME_ZONE = "Australia/Perth";

/** The places a message can appear, in the order Settings lists them. */
export const SITE_MESSAGE_PLACEMENTS = [
  {
    key: "banner",
    label: "Scrolling banner",
    where: "Across the top of every page on the website, scrolling. For sales and announcements.",
  },
  {
    key: "shop",
    label: "Shop product and cart pages",
    where: "Beside the price on the shop's product pages and in the cart, before anyone reaches checkout.",
  },
  {
    key: "checkout",
    label: "Checkout",
    where: "On the checkout page, above the payment button. Current lead times, holiday closures.",
  },
  {
    key: "quote",
    label: "Get a quote",
    where: "On the quote request form. How long quotes are taking right now.",
  },
];

export const SITE_MESSAGE_KEYS = SITE_MESSAGE_PLACEMENTS.map((placement) => placement.key);

/** The longest message kept. Anything longer is cut, not refused. */
export const SITE_MESSAGE_MAX = 400;

export const DEFAULT_LEAD_TIME_DAYS = 10;
// The same as decorative board until somebody sets it, so adding the setting
// changes nothing a customer is told.
export const DEFAULT_THERMO_LEAD_TIME_DAYS = DEFAULT_LEAD_TIME_DAYS;

export const DEFAULT_SITE_SETTINGS = {
  shop_open: false,
  lead_time_days: DEFAULT_LEAD_TIME_DAYS,
  thermo_lead_time_days: DEFAULT_THERMO_LEAD_TIME_DAYS,
  messages: Object.fromEntries(SITE_MESSAGE_KEYS.map((key) => [key, { text: "", starts_on: "", ends_on: "" }])),
};

// ── Cleaning ─────────────────────────────────────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(value) {
  const text = String(value ?? "").trim();
  if (!ISO_DAY.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? "" : text;
}

/** One line of plain text, however it was typed. */
function messageText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SITE_MESSAGE_MAX);
}

/**
 * A stored row made safe to use. Anything missing or nonsense falls back one
 * field at a time. The shop is open only when the row says true in so many
 * words: a value that is merely truthy is not enough to start selling.
 */
export function normalizeSiteSettings(stored = {}) {
  const s = stored && typeof stored === "object" ? stored : {};
  const workingDays = (value, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 120 ? n : fallback;
  };
  const messages = {};
  for (const key of SITE_MESSAGE_KEYS) {
    const src = s.messages?.[key] || {};
    let starts = day(src.starts_on);
    let ends = day(src.ends_on);
    // Dates typed the wrong way round are the same window, not an empty one.
    if (starts && ends && ends < starts) [starts, ends] = [ends, starts];
    messages[key] = { text: messageText(src.text), starts_on: starts, ends_on: ends };
  }
  return {
    shop_open: s.shop_open === true,
    lead_time_days: workingDays(s.lead_time_days, DEFAULT_LEAD_TIME_DAYS),
    thermo_lead_time_days: workingDays(s.thermo_lead_time_days, DEFAULT_THERMO_LEAD_TIME_DAYS),
    messages,
  };
}

// ── Is a message showing ─────────────────────────────────────────────────────

/** Today in Perth as YYYY-MM-DD, whatever time zone the server or browser is in. */
export function perthToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Where a message stands today: "off" with no text, "scheduled" before its
 * first day, "ended" after its last, otherwise "showing".
 */
export function messageStatus(message = {}, now = new Date()) {
  if (!messageText(message.text)) return "off";
  const today = perthToday(now);
  if (message.starts_on && today < message.starts_on) return "scheduled";
  if (message.ends_on && today > message.ends_on) return "ended";
  return "showing";
}

/** The text to show in one place today, or "". */
export function activeMessage(settings, key, now = new Date()) {
  const message = settings?.messages?.[key];
  return message && messageStatus(message, now) === "showing" ? messageText(message.text) : "";
}

// ── The lead time, in words ──────────────────────────────────────────────────

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/**
 * "ten working days", "one working day", "12 working days". Numbers up to ten
 * are written as words, the way the site's sentences have always said them.
 */
export function leadTimeWords(days = DEFAULT_LEAD_TIME_DAYS) {
  const n = Math.round(Number(days));
  const count = Number.isFinite(n) && n >= 1 ? n : DEFAULT_LEAD_TIME_DAYS;
  const number = count <= 10 ? SMALL[count] : String(count);
  return `${number} working ${count === 1 ? "day" : "days"}`;
}

const isThermo = (material) => String(material || "").toLowerCase().replace(/\s+/g, "") === "thermolaminate";

/** Working days for one piece: thermolaminate or decorative board. */
export function leadTimeDays(settings, { thermo = false } = {}) {
  const clean = normalizeSiteSettings(settings);
  return thermo ? clean.thermo_lead_time_days : clean.lead_time_days;
}

/**
 * Working days for a whole order: the longest of its pieces, because an order
 * goes out together. Lines are shop lines or order lines; either carries a
 * material. No lines means decorative board.
 */
export function leadTimeDaysForLines(settings, lines = []) {
  const clean = normalizeSiteSettings(settings);
  const hasThermo = (Array.isArray(lines) ? lines : []).some((line) => isThermo(line?.material));
  return hasThermo ? Math.max(clean.lead_time_days, clean.thermo_lead_time_days) : clean.lead_time_days;
}

/**
 * The lead time for the shop in general, where no one piece is in view:
 * "ten working days" while the two agree, "10 to 15 working days" once they
 * do not.
 */
export function leadTimeRangeWords(settings) {
  const clean = normalizeSiteSettings(settings);
  const low = Math.min(clean.lead_time_days, clean.thermo_lead_time_days);
  const high = Math.max(clean.lead_time_days, clean.thermo_lead_time_days);
  return low === high ? leadTimeWords(low) : `${low} to ${high} working days`;
}
