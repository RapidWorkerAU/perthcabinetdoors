import Link from "next/link";
import PublicSiteNav from "./PublicSiteNav";

// THE PAGE FOR A URL THAT IS NOT ONE OF OURS.
//
// ── WHY IT EXISTS AT ALL ─────────────────────────────────────────────────────
//
// There was no not-found page, so Next drew its own bare one. That was ugly and
// it was also skewing the dashboard, which is the part that mattered.
//
// The visit counter is mounted in app/(site)/layout.js, and a layout wraps the
// not-found boundary exactly as it wraps a real page. So every request for a
// URL that does not exist was rendering the counter, which reported whatever
// path had been asked for as a page view somebody had read.
//
// One scraper found that. It swept eight old product URLs with ".json" on the
// end, every couple of hours for days, from a rotating pool of addresses in
// European data centres. Because it ran a real browser, nothing in the user
// agent gave it away, so it was counted as people: about a hundred and ninety
// views, more than the homepage, plus a one page visit each time that went
// straight into the bounce rate.
//
// ── HOW IT STOPS IT ──────────────────────────────────────────────────────────
//
// The marker below. SiteTracker looks for it before reporting anything, so a
// view of a page that does not exist is not counted. It is a plain attribute in
// the markup rather than a context or a prop, because the counter sits in the
// layout on the other side of the not-found boundary and there is nothing to
// pass a prop through. The whole document is committed before any effect runs,
// so it is always there to be found.
//
// Which is worth saying plainly: THIS IS LOAD BEARING. Take the marker out and
// the dashboard starts counting 404s again.

export const metadata = {
  title: "Page not found | Perth Cabinet Doors",
  // Not indexed. A 404 already tells a crawler this, and saying it twice costs
  // nothing next to the chance of one of these turning up in a search result.
  robots: { index: false, follow: false },
};

export default function SiteNotFound() {
  return (
    <>
      <div data-site-not-found hidden />
      <PublicSiteNav variant="solid" />
      <main
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "96px 24px",
          background: "#faf9f6",
        }}
      >
        <div style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#5a5a52",
            }}
          >
            Page not found
          </p>
          <h1
            style={{
              margin: "0.75rem 0 0",
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              lineHeight: 1.15,
              color: "#1c2b1e",
            }}
          >
            That page is not here any more
          </h1>
          <p style={{ margin: "1rem 0 0", fontSize: "1.0625rem", lineHeight: 1.6, color: "#3a3a34" }}>
            The link may be old, or we may have moved what was on it. Everything we make is still here.
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: "1.75rem",
            }}
          >
            <Link
              href="/"
              style={{
                padding: "0.75rem 1.25rem",
                borderRadius: "6px",
                background: "#2d5e28",
                color: "#ffffff",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.9375rem",
              }}
            >
              Back to the home page
            </Link>
            <Link
              href="/finishes"
              style={{
                padding: "0.75rem 1.25rem",
                borderRadius: "6px",
                border: "1px solid #dbd8cc",
                color: "#1c2b1e",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.9375rem",
                background: "#ffffff",
              }}
            >
              See the finishes
            </Link>
          </div>
          <p style={{ margin: "1.75rem 0 0", fontSize: "0.875rem", color: "#5a5a52" }}>
            Looking for something in particular? Email{" "}
            <a href="mailto:sales@perthcabinetdoors.com.au" style={{ color: "#2d5e28" }}>
              sales@perthcabinetdoors.com.au
            </a>
            .
          </p>
        </div>
      </main>
    </>
  );
}
