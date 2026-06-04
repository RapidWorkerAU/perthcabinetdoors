import type { Metadata } from "next";
import ProjectViewClient from "../ProjectViewClient";
import "../../admin/quotes/quote-builder.css";

export const metadata: Metadata = {
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
