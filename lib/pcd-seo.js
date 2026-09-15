// HOW THIS SITE IS FOUND, AND QUOTED.
//
// Everything a crawler and an assistant read about this site that is not the
// page itself: which pages exist, which must never be indexed, what each page's
// one true address is, and the machine readable version of the answers already
// written on them.
//
// ── WHY ONE FILE ─────────────────────────────────────────────────────────────
//
// The sitemap, robots.txt and every page's canonical have to agree. A page in
// the sitemap that robots disallows, or one whose canonical points somewhere the
// sitemap does not list, is worse than having neither: it tells a crawler two
// different things and it picks one. So the list of public pages is written
// once, here, and the sitemap, the robots rules and the canonicals are all
// derived from it.
//
// ── THE SHOP IS NOT ALWAYS THERE ─────────────────────────────────────────────
//
// SHOP_ENABLED is false in a production build, so /products and /cart are a 404
// on the live site. A sitemap listing them would be handing a crawler a list of
// pages that do not exist, which is the fastest way to be trusted less. They
// come in and out of the sitemap with the flag.

import { SHOP_ENABLED } from "./pcd-site-flags";
import { BUSINESS_ABN, BUSINESS_PHONE, LEGAL_ENTITY, SALES_EMAIL, TRADING_NAME } from "./pcd-business-identity";
import { METRO_POSTCODES } from "./pcd-shop";

/**
 * The one address this site is indexed under.
 *
 * Not siteUrl() from pcd-stripe.js: that one deliberately falls back to
 * localhost and to whatever origin a request arrived on, which is right for
 * sending somebody back from Stripe and very wrong here. A canonical tag or a
 * sitemap naming localhost is a canonical tag naming nothing.
 */
export const SITE_URL = String(process.env.NEXT_PUBLIC_SITE_URL || "https://perthcabinetdoors.com").replace(/\/+$/, "");

export function canonical(path = "/") {
  const clean = String(path || "/").trim();
  return clean === "/" ? `${SITE_URL}/` : `${SITE_URL}/${clean.replace(/^\/+|\/+$/g, "")}`;
}

/**
 * THE PAGES THAT ARE FOR THE PUBLIC, and what each one is worth.
 *
 * `priority` is a hint about relative importance within this site, not a
 * ranking. The three service pages sit above the rest because they are what
 * somebody is actually searching for: a replacement IKEA door, a kitchen
 * refresh, a bespoke fitout.
 *
 * `changeFrequency` is honest rather than optimistic. /finishes moves whenever
 * the colour library does; /bespoke is prose and changes when we rewrite it.
 */
const PAGES = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/ikea-kaboodle", priority: 0.9, changeFrequency: "monthly" },
  { path: "/kitchen-refresh", priority: 0.9, changeFrequency: "monthly" },
  { path: "/bespoke", priority: 0.9, changeFrequency: "monthly" },
  { path: "/finishes", priority: 0.8, changeFrequency: "weekly" },
  { path: "/start", priority: 0.7, changeFrequency: "monthly" },
  { path: "/design", priority: 0.7, changeFrequency: "monthly" },
  { path: "/request-quote", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.6, changeFrequency: "yearly" },
];

/** Only while the shop is open. See the note at the top of this file. */
const SHOP_PAGES = [{ path: "/products", priority: 0.8, changeFrequency: "weekly" }];

export function publicPages() {
  return SHOP_ENABLED ? [...PAGES, ...SHOP_PAGES] : PAGES;
}

/**
 * WHAT MUST NEVER BE INDEXED, and why each one.
 *
 * Three kinds, and every one of them would be a real problem in a search
 * result rather than merely untidy:
 *
 *   SOMEBODY ELSE'S DOCUMENT. A quote, a variation, an order confirmation and a
 *   booking are reached with a code in the address. Indexed, they put one
 *   customer's prices and address in a public result.
 *
 *   HALFWAY THROUGH SOMETHING. A cart, a checkout, the middle of the quote
 *   builder. Landing on one of those from a search means arriving at a page
 *   about a basket that is not yours and is empty.
 *
 *   NOT FOR CUSTOMERS AT ALL. The admin, the API and the launch gate.
 */
export const NEVER_INDEX = [
  "/admin",
  "/api",
  "/launch",
  "/cart",
  "/checkout",
  "/quotes",
  "/variations",
  "/orders",
  "/payments",
  "/bookings",
  "/project",
  "/quote",
  "/request-quote/list",
  "/request-quote/send",
  "/request-quote/sent",
];

/** The metadata block for a page that must not be indexed or followed. */
export const PRIVATE_PAGE_METADATA = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The shared half of a public page's metadata: its one true address, and what a
 * link to it looks like when somebody pastes it into a message.
 *
 * Open Graph matters more than it looks on a trade site. The most common way
 * this business is shared is one person sending another a link, and a link with
 * no card is a bare blue string next to three that have pictures.
 */
export function pageMetadata({ path, title, description, image = "/images/kitchen.jpg" }) {
  const url = canonical(path);
  return {
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: TRADING_NAME,
      locale: "en_AU",
      url,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

// ── WHAT THE PAGE MEANS, IN A FORM A MACHINE READS ──────────────────────────
//
// The FAQ blocks on the service pages are already written as a question and a
// self contained answer, because that is how somebody types a question and how
// an assistant quotes one. FAQPage markup is the same content said again in the
// form a search engine will lift into a result directly.
//
// AN ANSWER THAT IS NOT PLAIN TEXT IS LEFT OUT. A couple of FAQ answers are
// JSX, because they carry a link. There is no honest way to put a React element
// into JSON-LD, and guessing at its text would put words in the schema that are
// not the words on the page, which is exactly what structured data must never
// do. Those questions stay on the page and out of the markup.

export function faqPageSchema(faqs = []) {
  const entries = (faqs || [])
    .filter(([question, answer]) => typeof question === "string" && typeof answer === "string")
    .map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    }));
  if (!entries.length) return null;
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: entries };
}

/**
 * Who we are, where we work, and what we do.
 *
 * ── A SERVICE AREA BUSINESS, WHICH IS A REAL THING AND NOT A FUDGE ──────────
 *
 * There is no shop to visit and nobody comes to the workshop: everything is
 * delivered or installed. See the delivery note in lib/pcd-shop.js. That makes
 * this a service area business, and both Google and schema.org have an answer
 * for one, so none of this is working around a missing address.
 *
 * The answer is: say the locality, the region and the country, say which area
 * is served, and omit streetAddress. A business with no storefront that
 * publishes a street address is worse off than one that does not, because the
 * address is then a pin on a map where no customer can be served and where
 * somebody will eventually turn up.
 *
 * WHAT IS DELIBERATELY ABSENT, STILL: streetAddress, and any geo coordinate.
 * Neither is published anywhere a customer can see, and inventing either is how
 * a business ends up on a map at a location it cannot correct.
 *
 * WHAT WAS ABSENT AND IS NOT ANY MORE: the opening hours. They were left out
 * while they were not published anywhere; they are on the Google Business
 * Profile, so they are real, checkable, and worth saying in both places. The
 * one rule is that these two must agree: if the hours change on Google they
 * change here, or the site and the profile contradict each other.
 */
export function localBusinessSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: TRADING_NAME,
    legalName: LEGAL_ENTITY,
    url: canonical("/"),
    telephone: BUSINESS_PHONE,
    email: SALES_EMAIL,
    image: `${SITE_URL}/images/kitchen.jpg`,
    priceRange: "$$",
    // The ABN, as a named identifier rather than a loose string. It is the one
    // piece of proof that this is a real registered business, and it is already
    // printed on every tax invoice.
    identifier: {
      "@type": "PropertyValue",
      name: "ABN",
      propertyID: "https://abr.business.gov.au",
      value: BUSINESS_ABN,
    },
    // Locality, region, country. No street: see the note above.
    address: { "@type": "PostalAddress", addressLocality: "Perth", addressRegion: "WA", addressCountry: "AU" },
    areaServed: SERVICE_AREA,
    openingHoursSpecification: OPENING_HOURS,
    knowsAbout: [
      "Replacement cabinet doors",
      "IKEA Metod, Pax and Besta replacement fronts",
      "Kaboodle replacement fronts",
      "Kitchen refacing",
      "Bespoke cabinetry",
      "Polytec, Laminex and Formica decorative board",
    ],
  };
}

// WHERE WE WORK, TAKEN FROM THE CODE THAT DECIDES IT.
//
// Not a list of suburbs read off a map. METRO_POSTCODES in lib/pcd-shop.js is
// what the checkout actually uses to decide whether an address gets the flat
// rate, so it is the honest answer to "where do you deliver", and saying
// anything else here would advertise an area the checkout then refuses.
const SERVICE_AREA = [
  { "@type": "City", name: "Perth", addressRegion: "WA", addressCountry: "AU" },
  {
    "@type": "AdministrativeArea",
    name: `Perth metropolitan area, postcodes ${METRO_POSTCODES.from} to ${METRO_POSTCODES.to}`,
  },
];

// Monday to Friday, nine to five, as published on the Google Business Profile.
// Saturday and Sunday are closed and are simply not listed, which is how
// schema.org says a closed day is expressed.
const OPENING_HOURS = [
  {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "09:00",
    closes: "17:00",
  },
];

/**
 * A service page, said as a Service.
 *
 * provider points back at the business rather than repeating it, so there is
 * one description of who we are on the site and the service pages refer to it.
 */
export function serviceSchema({ path, name, description }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url: canonical(path),
    areaServed: { "@type": "City", name: "Perth" },
    provider: { "@type": "HomeAndConstructionBusiness", name: TRADING_NAME, url: canonical("/") },
  };
}
