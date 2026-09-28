import "./frontend.css";
import SiteTracker from "./SiteTracker";
import SiteSettingsProvider from "@/components/public/SiteSettingsProvider";
import { SiteBanner } from "@/components/public/SiteMessages";
import { readPublicSiteSettings } from "@/lib/pcd-site-settings-store";

// Every public page hangs off this layout, so this is the one place the visit
// counter has to be mounted. It renders nothing and it is deliberately not in
// app/layout.js: that one also wraps the admin, and counting ourselves reading
// our own screens would be the largest number on the panel within a week.
//
// It is also where the website's settings are read (lib/pcd-site-settings.js):
// once a page, and handed to every component under it. So the banner, the
// notices, the lead time and whether the shop is open all come from the row
// as it stands now, and a change saved in Settings is on the site at the next
// page load.
export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }) {
  const settings = await readPublicSiteSettings();
  return (
    <SiteSettingsProvider settings={settings}>
      <SiteTracker />
      <SiteBanner />
      {/* THE PAGE STARTS UNDER THE BANNER. The home page's nav is laid over
          its hero, placed at the top of the nearest positioned box; without
          this it would be the top of the window, and the nav would sit on
          top of the banner. */}
      <div style={{ position: "relative" }}>{children}</div>
    </SiteSettingsProvider>
  );
}
