import type { Metadata } from "next";
import ProjectAccessClient from "./ProjectAccessClient";
import "../admin/quotes/quote-builder.css";

export const metadata: Metadata = {
  title: "Access Project",
};

export default function ProjectAccessPage() {
  return (
    <div className="quote-public">
      <section className="quote-public-hero">
        <div className="quote-public-hero-inner">
          <img
            src="/images/logo-white.png"
            alt="HSES Industry Partners"
            className="quote-public-logo"
          />
          <div className="quote-public-hero-text">
            <h1>Project Schedule</h1>
            <p>Enter your access code to review your project schedule and progress.</p>
          </div>
        </div>
      </section>

      <main className="quote-public-main">
        <div className="quote-public-card quote-access">
          <ProjectAccessClient />
        </div>
      </main>
    </div>
  );
}
