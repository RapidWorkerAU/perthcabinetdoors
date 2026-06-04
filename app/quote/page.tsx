import type { Metadata } from "next";
import QuoteAccessClient from "./QuoteAccessClient";
import "../admin/quotes/quote-builder.css";

export const metadata: Metadata = {
  title: "Quote Access",
};

export default function QuoteAccessPage() {
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
            <p>Enter your access code to review your proposal and delivery breakdown.</p>
          </div>
        </div>
      </section>

      <main className="quote-public-main">
        <div className="quote-public-card quote-access">
          <QuoteAccessClient />
        </div>
      </main>
    </div>
  );
}
