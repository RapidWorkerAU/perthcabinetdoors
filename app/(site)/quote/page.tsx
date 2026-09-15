import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import type { Metadata } from "next";
import QuoteAccessClient from "./QuoteAccessClient";

// NOT FOR A SEARCH RESULT: this is the door to somebody own document, opened
// with a code. robots.txt already asks a crawler not to fetch it, and that is
// not enough on its own: a disallowed address can still be listed if anything
// links to it. Only noindex on the page itself stops that. See lib/pcd-seo.js.
export const metadata: Metadata = {
  ...PRIVATE_PAGE_METADATA,
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
