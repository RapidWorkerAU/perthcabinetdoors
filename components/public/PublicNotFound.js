import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicPaths from "@/components/public/PublicPaths";
import PublicSiteNav from "../../app/(site)/PublicSiteNav";
import styles from "../../app/(site)/journey.module.css";

// THE PAGE FOR A URL THAT IS NOT ONE OF OURS.
//
// ── IT IS RENDERED FROM TWO PLACES, AND THEY ARE NOT THE SAME 404 ────────────
//
// app/(site)/not-found.js catches notFound() thrown inside the site group: a
// product slug we do not sell, a shop page while the shop is switched off.
// app/not-found.js catches a URL that matches no route at all, which is most
// wrong turns and every dead link from outside. Next uses a different boundary
// for each, and with only the first one written the second was still showing
// Next's own bare "404: This page could not be found."
//
// So the page itself lives here and both boundaries render it. Two copies of a
// page nobody plans to look at is exactly the kind of thing that drifts.
//
// ── A DEAD LINK IS WHEN THE THREE WAYS IN ARE MOST USEFUL ────────────────────
//
// This used to offer the home page and the finishes library, which is a dead
// end for somebody who arrived from a broken link to a product they wanted to
// buy. The block every service page closes on puts them back on whichever path
// they were actually after.

export default function PublicNotFound() {
  return (
    <>
      <PublicSiteNav variant="solid" />
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.wrap}>
            <div className={styles.pageHeaderCrumb}>Page not found</div>
            <h1>That page is not here any more</h1>
            <p>
              The link may be old, or we may have moved what was on it. Everything Perth Cabinet Doors makes
              is still on the site, under one of the ways in below.
            </p>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.wrap}>
            <PublicPaths
              heading="Where did you want to go?"
              paths={["shop", "quote", "ask"]}
              note={
                <>
                  Or start from the <Link href="/">home page</Link>, browse the{" "}
                  <Link href="/finishes">finishes</Link>, or email{" "}
                  <a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a>.
                </>
              }
            />
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}

// Not indexed. A 404 already tells a crawler this, and saying it twice costs
// nothing next to the chance of one of these turning up in a search result.
// Exported so both boundaries set the same metadata rather than one of them
// quietly forgetting to.
export const notFoundMetadata = {
  title: "Page not found | Perth Cabinet Doors",
  robots: { index: false, follow: false },
};
