// Public pages that exist in the codebase but are switched off on the live site.
//
// Turning one back on is a one-word change here — nothing else needs touching.
// The pages, their data loaders and their styles all stay exactly as they are.

// The product catalogue at /products and /products/[slug]. Off because the
// range is now covered by /finishes (colours, profiles and edges) and the
// IKEA & Kaboodle configurator, and the catalogue duplicated both without
// being maintained. Its per-product enquiry form was removed separately.
//
// While this is false, both routes return a 404 and every link to them is
// hidden from the nav and the homepage. Set to true to bring them back.
export const PRODUCTS_ENABLED = false;

// Live price estimates on the IKEA & Kaboodle configurator (/ikea-kaboodle).
//
// OFF while we confirm we are happy with the numbers. Nothing is removed: the
// whole pricing path is intact — the colour library rates, the markup, the GST,
// the per-piece minimum and the running total. This only decides whether the
// server sends a rate to the browser at all.
//
// While this is false, every colour goes out with a rate of 0, which is the
// same signal the configurator already uses for "we have not priced this yet".
// Every line lands on the list as "Quote", the estimate total hides itself, and
// the copy falls back to "we price your list by hand". No customer-facing price
// is calculated anywhere, and none of our cost data leaves the server.
//
// Set to true to turn estimates back on. Nothing else needs touching.
export const PUBLIC_PRICE_ESTIMATES_ENABLED = false;
