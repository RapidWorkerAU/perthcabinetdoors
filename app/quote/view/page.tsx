import type { Metadata } from "next";
import QuoteViewClient from "../QuoteViewClient";
import "../../admin/quotes/quote-builder.css";

export const metadata: Metadata = {
  title: "Quote",
};

export default function QuoteViewPage() {
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
            <h1>Quote &amp; Proposal</h1>
            <p>
              Review the summary, confirm the breakdown, and approve or reject when ready.
            </p>
          </div>
        </div>
      </section>

      <main className="quote-public-main">
        <div className="quote-public-card">
          <QuoteViewClient />
        </div>
      </main>
    </div>
  );
}
