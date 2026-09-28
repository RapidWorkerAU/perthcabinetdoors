import { canonical, publicPages } from "@/lib/pcd-seo";
import { readPublicSiteSettings } from "@/lib/pcd-site-settings-store";

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

// Built again at most once an hour, because whether the shop is in it follows
// the switch in Settings.
export const revalidate = 3600;

export default async function sitemap() {
  const lastModified = new Date();
  const { shop_open: shopOpen } = await readPublicSiteSettings();
  return publicPages({ shopOpen }).map((page) => ({
    url: canonical(page.path),
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
