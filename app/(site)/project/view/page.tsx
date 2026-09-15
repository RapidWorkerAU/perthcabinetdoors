import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import type { Metadata } from "next";
import ProjectViewClient from "../ProjectViewClient";

// NOT FOR A SEARCH RESULT: this is the door to somebody own document, opened
// with a code. robots.txt already asks a crawler not to fetch it, and that is
// not enough on its own: a disallowed address can still be listed if anything
// links to it. Only noindex on the page itself stops that. See lib/pcd-seo.js.
export const metadata: Metadata = {
  ...PRIVATE_PAGE_METADATA,
  title: "Project Schedule",
};

export default function ProjectViewPage() {
  return (
    <div className="quote-public quote-public--project-view">
      <section className="quote-public-hero">
        <div className="quote-public-hero-inner">
          <img
            src="/images/logo-white.png"
            alt="HSES Industry Partners"
            className="quote-public-logo"
          />
          <div className="quote-public-hero-text">
            <h1>Project Schedule</h1>
            <p>Review progress, milestones, and schedule updates at any time.</p>
          </div>
        </div>
      </section>

      <main className="quote-public-main">
        <div className="quote-public-card">
          <ProjectViewClient />
        </div>
      </main>
    </div>
  );
}
