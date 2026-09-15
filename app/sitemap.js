import { canonical, publicPages } from "@/lib/pcd-seo";

// THE LIST OF PAGES WORTH CRAWLING, BUILT FROM THE ONE LIST OF THEM.
//
// Derived from publicPages() rather than written out again here, so it cannot
// drift from the canonical tags or the robots rules. See lib/pcd-seo.js for why
// that matters, and for why the shop pages come and go.
//
// lastModified is the build date rather than a per page date. A per page date
// would need a real record of when each one's content last changed, and a made
// up one is worse than none: a crawler that is told every page changed today,
// every day, learns to disregard the field.

export const dynamic = "force-static";

export default function sitemap() {
  const lastModified = new Date();
  return publicPages().map((page) => ({
    url: canonical(page.path),
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
