// HOW THE SITE IS FOUND, AND WHAT MUST NEVER BE FOUND.
//
// The sitemap, robots.txt and every page's canonical have to agree. A page
// listed in the sitemap with no canonical, or one the sitemap offers and robots
// disallows, tells a crawler two different things and it picks one. That
// disagreement is not visible by reading any single file, which is what these
// are for: the first pass of this work put four pages in the sitemap with no
// canonical tag at all, and only a check across both caught it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { NEVER_INDEX, SITE_URL, canonical, faqPageSchema, localBusinessSchema, publicPages, serviceSchema } from "../lib/pcd-seo.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the canonical base is a real address, never localhost", () => {
  assert.match(SITE_URL, /^https:\/\//, "a canonical naming http or localhost names nothing");
  assert.ok(!SITE_URL.endsWith("/"), "no trailing slash, or every canonical doubles it");
});

// THE CHECK THAT CAUGHT THE REAL FAULT.
test("every page in the sitemap sets its own canonical", () => {
  const files = {
    "/": "app/(site)/page.js",
    "/ikea-kaboodle": "app/(site)/ikea-kaboodle/page.js",
    "/kitchen-refresh": "app/(site)/kitchen-refresh/page.js",
    "/bespoke": "app/(site)/bespoke/page.js",
    "/finishes": "app/(site)/finishes/page.js",
    "/start": "app/(site)/start/page.js",
    "/design": "app/(site)/design/page.js",
    "/contact": "app/(site)/contact/page.js",
    "/request-quote": "app/(site)/request-quote/page.js",
    "/products": "app/(site)/products/page.js",
  };

  for (const page of publicPages()) {
    const file = files[page.path];
    assert.ok(file, `${page.path} is in the sitemap but this test does not know its file`);
    const source = read(file);
    assert.match(
      source,
      /pageMetadata\(\{/,
      `${page.path} is offered to crawlers with no canonical of its own`
    );
    assert.ok(source.includes(`path: "${page.path}"`), `${page.path} must name itself in its canonical`);
  }
});

test("nothing in the sitemap is also disallowed", () => {
  for (const page of publicPages()) {
    for (const blocked of NEVER_INDEX) {
      assert.ok(
        page.path !== blocked && !page.path.startsWith(`${blocked}/`),
        `${page.path} is both offered and disallowed`
      );
    }
  }
});

// Somebody's own document must be kept out three ways, because disallow alone
// only asks a crawler not to fetch: the address can still be listed.
test("every private page carries noindex on the page itself", () => {
  const pages = [
    "app/(site)/cart/page.js",
    "app/(site)/checkout/page.js",
    "app/(site)/quotes/page.js",
    "app/(site)/quotes/view/page.js",
    "app/(site)/variations/view/page.js",
    "app/(site)/orders/confirmed/page.js",
    "app/(site)/payments/success/page.js",
    "app/(site)/bookings/confirm/page.js",
    "app/(site)/request-quote/list/page.js",
    "app/(site)/request-quote/send/page.js",
    "app/(site)/request-quote/sent/page.js",
  ];
  for (const page of pages) {
    assert.match(read(page), /PRIVATE_PAGE_METADATA/, `${page} could be listed in a search result`);
  }
});

test("the admin and the api are disallowed", () => {
  for (const path of ["/admin", "/api"]) {
    assert.ok(NEVER_INDEX.includes(path), `${path} must be disallowed`);
  }
});

// ── the schema has to say what the page says ────────────────────────────────

test("an answer that is not plain text is left out rather than guessed at", () => {
  const schema = faqPageSchema([
    ["A real question?", "A real answer."],
    ["One with a link?", { type: "jsx" }],
  ]);
  assert.equal(schema.mainEntity.length, 1, "only the text answer is described");
  assert.equal(schema.mainEntity[0].acceptedAnswer.text, "A real answer.");
});

test("no questions means no FAQ markup at all", () => {
  assert.equal(faqPageSchema([]), null, "empty markup is worse than none");
  assert.equal(faqPageSchema([["Q", { jsx: true }]]), null);
});

// A SERVICE AREA BUSINESS. There is no shop to visit and nobody comes to the
// workshop, so the schema says where we WORK and never where we are.
test("the business block names an area, never a street", () => {
  const schema = localBusinessSchema();
  assert.equal(schema.address.addressLocality, "Perth");
  assert.equal(schema.address.addressRegion, "WA");

  // The two that would put a pin on a map at a place no customer can be served.
  // Inventing either is how a business ends up with a location it cannot
  // correct and somebody turning up at it.
  assert.equal("streetAddress" in schema.address, false, "no street address, ever");
  assert.equal("geo" in schema, false, "and no coordinate, which is the same claim in numbers");

  assert.ok(Array.isArray(schema.areaServed) && schema.areaServed.length, "it has to say where it does work");
  assert.match(schema.url, /^https:\/\//);
});

// THE SERVICE AREA IS THE ONE THE CHECKOUT ENFORCES.
//
// Advertising an area the checkout then refuses is worse than advertising a
// smaller one. METRO_POSTCODES is what actually decides whether an address gets
// the flat rate, so the schema is built from it rather than from a list of
// suburbs somebody typed.
test("the area served is the area the checkout actually serves", async () => {
  const { METRO_POSTCODES } = await import("../lib/pcd-shop.js");
  const named = localBusinessSchema().areaServed.map((a) => a.name).join(" ");
  assert.ok(named.includes(String(METRO_POSTCODES.from)), "the real postcode range, not a guess");
  assert.ok(named.includes(String(METRO_POSTCODES.to)));
  assert.ok(named.includes("Perth"));
});

// The hours were left out while they were published nowhere. They are on the
// Google Business Profile, so they are real and checkable, and the two have to
// agree: hours changed in one place and not the other is a business whose own
// site contradicts its listing.
test("the opening hours match the Business Profile, and closed days are simply absent", () => {
  const hours = localBusinessSchema().openingHoursSpecification;
  assert.ok(Array.isArray(hours) && hours.length, "hours are published now");
  const week = hours.flatMap((h) => h.dayOfWeek);
  assert.deepEqual(week, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  assert.equal(week.includes("Saturday"), false, "a closed day is left out, not listed as closed");
  assert.equal(hours[0].opens, "09:00");
  assert.equal(hours[0].closes, "17:00");
});

test("the ABN is carried as a named identifier", () => {
  const id = localBusinessSchema().identifier;
  assert.equal(id.name, "ABN");
  assert.match(id.value, /^\d{11}$/, "an ABN is eleven digits");
});

test("a service points back at the one description of the business", () => {
  const schema = serviceSchema({ path: "/bespoke", name: "Bespoke cabinetry", description: "..." });
  assert.equal(schema.url, canonical("/bespoke"));
  assert.equal(schema.provider.url, canonical("/"));
});

test("the JSON-LD cannot close its own script tag", () => {
  const component = read("components/public/JsonLd.js");
  assert.match(component, /replace\(\/<\/g, "\\\\u003c"\)/, "a < in any value would end the script early");
});
