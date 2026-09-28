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

// THE WEB SHOP used to be switched here, as SHOP_ENABLED. Since 28 September
// 2026 it is switched in Settings > Shop and Site Messages, so opening or
// closing it is not a deploy. See lib/pcd-site-settings.js for what closed
// means, and lib/pcd-shop-access.js for how a page or an endpoint asks.

// PUBLIC_PRICE_ESTIMATES_ENABLED used to live here. It switched the per-piece
// estimate on the IKEA & Kaboodle configurator, and it has gone with that
// configurator: /ikea-kaboodle is written content now, and the only live public
// pricing on the site is the shop, which prices from pcd-shop-pricing.js rather
// than from a flag.
//
// The maths it controlled is still in app/(site)/ikea-kaboodle/cabinet-data.js,
// unused, with the note explaining why profiled fronts must never be priced
// that way. A flag that switches nothing is worse than no flag, so it is not
// kept as a placeholder.
