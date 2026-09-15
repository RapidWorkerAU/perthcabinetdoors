import { NEVER_INDEX, SITE_URL, canonical } from "@/lib/pcd-seo";

// WHAT A CRAWLER MAY READ.
//
// Allow everything, then name the parts that are somebody's own document, the
// middle of a transaction, or not for customers at all. The reasons for each are
// with the list in lib/pcd-seo.js.
//
// DISALLOW IS NOT A LOCK. It asks well behaved crawlers not to fetch a page; it
// does nothing about anyone who ignores it, and a disallowed page can still be
// listed if something links to it. The real protection on a quote or a variation
// is the code in its address and the noindex on the page itself, both of which
// are already there. This is the outer layer of three, not the only one.

export const dynamic = "force-static";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: NEVER_INDEX.map((path) => `${path}/`),
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: canonical("/"),
  };
}
