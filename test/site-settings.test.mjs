// THE WEBSITE'S SETTINGS: THE SHOP SWITCH, THE LEAD TIME AND THE MESSAGES.
//
// Decided 28 September 2026:
//
//   Settings > Shop and Site Messages opens and closes the online shop. Closed
//     shows customers a closed page with the way to a quote, and lets signed-in
//     staff see the whole shop with a bar saying it is a preview.
//   A settings row that cannot be read reads as closed.
//   The lead time is a number of working days, and every sentence that
//     mentions it says it from that number, emails included.
//   Four messages: a scrolling banner on every page, and notices on the shop
//     pages, the checkout and the quote form. Empty shows nothing. Optional
//     start and end dates, whole days in Perth.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_SITE_SETTINGS,
  SITE_MESSAGE_KEYS,
  SITE_MESSAGE_MAX,
  activeMessage,
  leadTimeDays,
  leadTimeDaysForLines,
  leadTimeRangeWords,
  leadTimeWords,
  messageStatus,
  normalizeSiteSettings,
  perthToday,
} from "../lib/pcd-site-settings.js";
import { getSiteSettings } from "../lib/pcd-site-settings-store.js";
import { publicPages } from "../lib/pcd-seo.js";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

// ── The switch ──────────────────────────────────────────────────────────────

test("the shop starts closed, and only a plain true opens it", () => {
  assert.equal(normalizeSiteSettings(DEFAULT_SITE_SETTINGS).shop_open, false);
  assert.equal(normalizeSiteSettings({}).shop_open, false);
  assert.equal(normalizeSiteSettings({ shop_open: true }).shop_open, true);
  for (const truthy of ["true", 1, "yes", {}]) {
    assert.equal(normalizeSiteSettings({ shop_open: truthy }).shop_open, false, `${JSON.stringify(truthy)} does not open the shop`);
  }
});

test("a settings row that cannot be read closes the shop and shows nothing", async () => {
  const broken = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'relation "pcd_site_settings" does not exist' } }) }) }),
    }),
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await getSiteSettings(broken);
    assert.equal(result.available, false);
    assert.equal(result.settings.shop_open, false);
    assert.match(result.error, /202609281200_pcd_site_settings\.sql/);
    for (const key of SITE_MESSAGE_KEYS) assert.equal(activeMessage(result.settings, key), "");
  } finally {
    console.error = originalError;
  }
});

test("the public site reads the switch, never a flag in the code", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== "node_modules" && !name.startsWith(".")) walk(path);
      } else if (/\.(js|jsx|ts|tsx)$/.test(name) && readFileSync(path, "utf8").includes("SHOP_ENABLED")) {
        offenders.push(path);
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(new URL(dir, ROOT).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  assert.deepEqual(offenders.filter((path) => !path.endsWith("pcd-site-flags.js")), []);
});

test("staff see a closed shop, and everyone else sees the closed page", () => {
  const access = read("lib/pcd-shop-access.js");
  assert.ok(access.includes("const staff = open ? false : await isAdminRequest();"), "sign-in is only checked while closed");
  assert.ok(access.includes("allowed: open || staff"));
  const closed = read("app/(site)/ShopClosed.js");
  assert.ok(closed.includes("Move them to my quote list"), "a cart can be carried across");
  assert.ok(closed.includes("shopLineToQuoteLine(line"), "through the same handover the cart uses");
  assert.ok(closed.includes('href="/request-quote"'), "and the way to a quote");
});

test("the sitemap lists the shop only while it is open", () => {
  assert.ok(!publicPages().some((page) => page.path === "/products"));
  assert.ok(publicPages({ shopOpen: true }).some((page) => page.path === "/products"));
  assert.ok(read("app/sitemap.js").includes("publicPages({ shopOpen })"));
});

test("the nav, the basket and the cross links follow the switch", () => {
  for (const file of [
    "app/(site)/PublicSiteNav.js",
    "components/public/PublicItemsPanel.js",
    "components/public/PublicCrossLink.js",
    "components/public/PublicPaths.js",
    "app/(site)/cart/CrossToCart.js",
    "app/(site)/request-quote/RequestQuoteFormClient.js",
  ]) {
    assert.ok(read(file).includes("useShopOpen()"), file);
  }
});

// ── The lead time ───────────────────────────────────────────────────────────

test("the lead time is a whole number of working days, written the site's way", () => {
  assert.equal(leadTimeWords(10), "ten working days");
  assert.equal(leadTimeWords(1), "one working day");
  assert.equal(leadTimeWords(15), "15 working days");
  assert.equal(normalizeSiteSettings({ lead_time_days: "12" }).lead_time_days, 12);
  assert.equal(normalizeSiteSettings({ lead_time_days: 0 }).lead_time_days, 10, "nonsense falls back to ten");
  assert.equal(normalizeSiteSettings({ lead_time_days: "soon" }).lead_time_days, 10);
});

test("thermolaminate has its own lead time, and an order is promised its slowest piece", () => {
  const settings = normalizeSiteSettings({ lead_time_days: 10, thermo_lead_time_days: 15 });
  assert.equal(leadTimeDays(settings), 10);
  assert.equal(leadTimeDays(settings, { thermo: true }), 15);
  assert.equal(leadTimeDaysForLines(settings, [{ material: "Decorative Board" }]), 10);
  assert.equal(leadTimeDaysForLines(settings, [{ material: "Decorative Board" }, { material: "Thermolaminate" }]), 15, "an order ships whole");
  assert.equal(leadTimeDaysForLines(settings, [{ material: "thermolaminate" }]), 15, "order lines spell it their own way");
  assert.equal(leadTimeDaysForLines(settings, []), 10);
  assert.equal(leadTimeRangeWords(settings), "10 to 15 working days", "a page about the shop in general gives the range");
  assert.equal(leadTimeRangeWords(normalizeSiteSettings({})), "ten working days", "until they differ, one figure");
  assert.equal(normalizeSiteSettings({}).thermo_lead_time_days, 10, "starts the same as decorative board, so nothing a customer reads changes");
});

test("each page asks for the lead time that fits it", () => {
  assert.ok(read("app/(site)/products/[slug]/ShopProductClient.js").includes("useLeadTimeWords({ thermo })"), "the board being set up");
  assert.ok(read("app/(site)/cart/CartClient.js").includes("useLeadTimeWords({ lines })"), "the whole cart");
  assert.ok(read("app/(site)/orders/confirmed/page.js").includes("leadTimeDaysForLines(siteSettings, result?.lines || [])"));
  assert.ok(read("lib/pcd-customer-confirmations.js").includes("leadTimeDaysForLines(await readPublicSiteSettings(), lines)"));
  for (const page of ["app/(site)/page.js", "app/(site)/products/page.js", "app/(site)/ikea-kaboodle/page.js"]) {
    assert.ok(read(page).includes("leadTimeRangeWords("), `${page} gives the range`);
  }
});

test("no page or email says ten working days on its own any more", () => {
  const files = [
    "app/(site)/page.js",
    "app/(site)/products/page.js",
    "app/(site)/products/[slug]/ShopProductClient.js",
    "app/(site)/cart/CartClient.js",
    "app/(site)/orders/confirmed/page.js",
    "app/(site)/ikea-kaboodle/page.js",
    "lib/pcd-customer-confirmations.js",
  ];
  for (const file of files) {
    assert.ok(!/\b(ten|10) working days\b/i.test(read(file)), `${file} reads the lead time from Settings`);
  }
  assert.ok(read("lib/pcd-customer-confirmations.js").includes("leadTimeWords(leadTimeDaysForLines("), "the order email too");
});

// ── The messages ────────────────────────────────────────────────────────────

test("a message is plain text on one line, and never longer than the limit", () => {
  const clean = normalizeSiteSettings({ messages: { banner: { text: "  Sale\n\non  <b>now</b>\u0007 " + "x".repeat(600) } } });
  assert.ok(clean.messages.banner.text.startsWith("Sale on <b>now</b>"), "kept as words: React shows it as text, never as markup");
  assert.equal(clean.messages.banner.text.length, SITE_MESSAGE_MAX);
  assert.ok(!/[\n\u0007]/.test(clean.messages.banner.text));
});

test("every place has a message, and an unknown one is dropped", () => {
  const clean = normalizeSiteSettings({ messages: { banner: { text: "Hi" }, somewhere: { text: "No" } } });
  assert.deepEqual(Object.keys(clean.messages).sort(), [...SITE_MESSAGE_KEYS].sort());
  assert.deepEqual(SITE_MESSAGE_KEYS, ["banner", "shop", "checkout", "quote"]);
});

test("dates are whole days in Perth, inclusive at both ends", () => {
  const message = { text: "Closed for Christmas", starts_on: "2026-12-20", ends_on: "2026-12-31" };
  // 19 December, 11pm in Perth: not yet.
  assert.equal(messageStatus(message, new Date("2026-12-19T15:00:00Z")), "scheduled");
  // 20 December, 12:30am in Perth (still the 19th in London): showing.
  assert.equal(messageStatus(message, new Date("2026-12-19T16:30:00Z")), "showing");
  assert.equal(perthToday(new Date("2026-12-19T16:30:00Z")), "2026-12-20");
  // 31 December, 11pm in Perth: still showing.
  assert.equal(messageStatus(message, new Date("2026-12-31T15:00:00Z")), "showing");
  // 1 January, 12:30am in Perth: gone.
  assert.equal(messageStatus(message, new Date("2026-12-31T16:30:00Z")), "ended");
  assert.equal(messageStatus({ ...message, text: "" }), "off", "no text is off whatever the dates");
});

test("no dates means it shows while it has text; dates the wrong way round still work", () => {
  const settings = normalizeSiteSettings({ messages: { quote: { text: "Quotes are taking 3 days" } } });
  assert.equal(activeMessage(settings, "quote"), "Quotes are taking 3 days");
  const swapped = normalizeSiteSettings({ messages: { shop: { text: "Sale", starts_on: "2026-10-31", ends_on: "2026-10-01" } } });
  assert.deepEqual([swapped.messages.shop.starts_on, swapped.messages.shop.ends_on], ["2026-10-01", "2026-10-31"]);
  assert.equal(normalizeSiteSettings({ messages: { shop: { text: "x", starts_on: "2026-02-30" } } }).messages.shop.starts_on, "", "not a real day");
});

test("each message is in its place on the site", () => {
  assert.ok(read("app/(site)/layout.js").includes("<SiteBanner />"), "the banner on every page");
  assert.ok(read("app/(site)/products/[slug]/ShopProductClient.js").includes('<SiteNotice placement="shop" />'));
  assert.ok(read("app/(site)/cart/CartClient.js").includes('<SiteNotice placement="shop" />'));
  assert.ok(read("app/(site)/checkout/CheckoutClient.js").includes('<SiteNotice placement="checkout" />'));
  assert.ok(read("app/(site)/request-quote/page.js").includes('<SiteNotice placement="quote" />'));
});

test("the banner holds still for anyone who has asked for less movement", () => {
  const css = read("components/public/site-messages.module.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
});

// ── Settings and the database ───────────────────────────────────────────────

test("Settings has the section, and it edits every message", () => {
  const form = read("app/admin/_components/AccountSettingsForm.tsx");
  assert.ok(form.includes("activeTab === 'site'     ? <SiteSettingsCard />"));
  const card = read("app/admin/_components/SiteSettingsCard.js");
  assert.ok(card.includes("SITE_MESSAGE_PLACEMENTS.map"), "one editor per place, from the one list");
  assert.ok(card.includes('fetch("/api/admin/site-settings"'));
  assert.ok(read("app/api/admin/site-settings/route.js").includes("requireAdminApiContext()"), "staff only");
});

test("the table is one row, staff only, in one runnable block", () => {
  const path = "supabase/202609281200_pcd_site_settings.sql";
  assert.ok(existsSync(new URL(path, ROOT)));
  const sql = read(path);
  assert.match(sql, /^do \$\$/m);
  assert.match(sql, /check \(id = 'main'\)/);
  assert.match(sql, /enable row level security/);
  assert.ok(!/^\s*select\b/im.test(sql), "no check query appended");
});
