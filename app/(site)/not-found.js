import PublicNotFound, { notFoundMetadata } from "@/components/public/PublicNotFound";

// THE 404 FOR A notFound() RAISED INSIDE THE SITE GROUP.
//
// A product slug we do not sell, a shop page while the shop is switched off.
// A URL that matches no route at all is a different boundary: app/not-found.js.
// Both render the same page, which lives in components/public/PublicNotFound.
//
// ── WHY THE MARKER BELOW IS LOAD BEARING ─────────────────────────────────────
//
// The visit counter is mounted in app/(site)/layout.js, and a layout wraps the
// not-found boundary exactly as it wraps a real page. So every request for a
// URL in this group that does not exist was rendering the counter, which
// reported whatever path had been asked for as a page view somebody had read.
//
// One scraper found that. It swept eight old product URLs with ".json" on the
// end, every couple of hours for days, from a rotating pool of addresses in
// European data centres. Those still match /products/[slug], so they came all
// the way through this group, layout and all. Because it ran a real browser,
// nothing in the user agent gave it away, so it was counted as people: about a
// hundred and ninety views, more than the homepage, plus a one page visit each
// time that went straight into the bounce rate.
//
// SiteTracker looks for this marker before reporting anything, so a view of a
// page that does not exist is not counted. It is a plain attribute in the
// markup rather than a context or a prop, because the counter sits in the
// layout on the other side of the not-found boundary and there is nothing to
// pass a prop through. The whole document is committed before any effect runs,
// so it is always there to be found.
//
// Take it out and the dashboard starts counting 404s again.

export const metadata = notFoundMetadata;

export default function SiteNotFound() {
  return (
    <>
      <div data-site-not-found hidden />
      <PublicNotFound />
    </>
  );
}
