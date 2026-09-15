import { pageMetadata } from "@/lib/pcd-seo";
import Link from "next/link";
import PublicCrossLink from "@/components/public/PublicCrossLink";
import PublicFooter from "@/components/public/PublicFooter";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import { evenColumns } from "@/lib/pcd-grid-columns";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../contact/contact.module.css";
import RequestQuoteFormClient from "./RequestQuoteFormClient";

export const metadata = {
  title: "Request a Quote | Perth Cabinet Doors",
  description:
    "Request a free quote from Perth Cabinet Doors. Custom cabinet doors, drawer fronts and panels made to your measurements.",
  // Its one true address and its share card, from the title and
  // description above. This page is in the sitemap, so it has to carry a
  // canonical: a listed page with none is the site telling a crawler two
  // different things. See lib/pcd-seo.js.
  ...pageMetadata({
    path: "/request-quote",
    title: "Request a Quote | Perth Cabinet Doors",
    description: "Request a free quote from Perth Cabinet Doors. Custom cabinet doors, drawer fronts and panels made to your measurements.",
  }),
};

// THE WAYS OFF THIS PAGE, AT THE FOOT OF IT.
//
// These were two separate bordered strips stacked above the form, and they read
// as two obstacles to get past before the page started. Somebody who opened
// /request-quote came here to ask for a quote: the first thing they meet should
// be the form, not two panels suggesting they are in the wrong place.
//
// They are now one dark band after the form, which is where a reader who has
// finished, or who has scrolled far enough to realise this is not what they
// wanted, will actually look. Every other page on this site closes on that same
// green, so this one now ends the way the rest do rather than on a pale card
// floating in the middle of a pale page.
//
// STILL WRITTEN AS QUESTIONS AND ANSWERS, and not only for the reader. Every
// other thing on this page is a form control, so without these two pairs the
// page has no readable content at all for a search engine or an assistant. Two
// true question and answer pairs give it some, and they do that at the bottom
// just as well as at the top.
//
// The shop pair drops out entirely while the shop is closed, because /products
// is a 404 until it opens. Filtered here rather than left to the component so
// the container knows how many columns it is drawing.
const ELSEWHERE = [
  {
    question: "Do you need measurements to ask for a quote?",
    answer:
      "No. This form asks for sizes, colours and finishes, but if you do not have them yet, use the enquiry form instead: send a photo and a question and we will work the details out with you. It reaches the same team.",
    cta: "Ask a question instead",
    href: "/contact",
  },
  SHOP_ENABLED
    ? {
        shop: true,
        question: "Are plain flat doors priced on the site?",
        answer:
          "Yes. Flat, unprofiled doors, drawer fronts and panels in Polytec decorative board are priced in the shop as you enter the size, so there is nothing to wait for. Everything else is priced by hand here.",
        cta: "See prices in the shop",
        href: "/products",
      }
    : null,
].filter(Boolean);

export default function RequestQuotePage() {
  return (
    <>
      <PublicSiteNav active="contact" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={`${styles.pageHeaderInner} ${styles.quotePageHeaderInner}`}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/contact">Contact</Link> &rsaquo; Request a Quote
            </div>
            <h1>Request a <em>Free Quote</em></h1>
            <p>Perth Cabinet Doors prices every quote by hand. Build each item below, add it to your list, and send the list through when you are done. A price comes back by email within 1 to 3 business days. Nothing here is charged and nothing commits you.</p>
          </div>
        </section>

        <section className={styles.quoteTablePageWrap}>
          <RequestQuoteFormClient />
        </section>

        {ELSEWHERE.length ? (
          <section className={styles.quoteElsewhere}>
            <div className={styles.quoteElsewhereInner}>
              <h2>If this is not what you were after</h2>
              <div
                className={styles.quoteElsewhereGrid}
                style={{ "--cols": evenColumns(ELSEWHERE.length, 2) }}
              >
                {ELSEWHERE.map((item) => (
                  <PublicCrossLink key={item.href} bare onDark {...item} />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
