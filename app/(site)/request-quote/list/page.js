import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicSiteNav from "../../PublicSiteNav";
import styles from "../../contact/contact.module.css";
import QuoteListClient from "./QuoteListClient";

export const metadata = {
  // NOT FOR A SEARCH RESULT: a list part way through being written.
  // See NEVER_INDEX in lib/pcd-seo.js. robots.txt asks a crawler not to
  // fetch this; that line is what stops it being listed anyway.
  ...PRIVATE_PAGE_METADATA,
  title: "My Quote List | Perth Cabinet Doors",
  description:
    "Everything you have asked us to price, in one place. Nothing here is charged: we work these out by hand and email you a quote.",
};

export default function QuoteListPage() {
  return (
    <>
      <PublicSiteNav active="contact" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={`${styles.pageHeaderInner} ${styles.quotePageHeaderInner}`}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/request-quote">Request a Quote</Link> &rsaquo; My list
            </div>
            <h1>My <em>list</em></h1>
            <p>Everything you have asked us to price. Nothing here has a price on it yet and nothing is charged: we work these out by hand and email you a quote, usually the same day.</p>
          </div>
        </section>

        <section className={styles.quoteTablePageWrap}>
          <QuoteListClient />
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
