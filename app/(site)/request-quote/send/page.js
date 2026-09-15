import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicSiteNav from "../../PublicSiteNav";
import styles from "../../contact/contact.module.css";
import QuoteSendClient from "./QuoteSendClient";

export const metadata = {
  // NOT FOR A SEARCH RESULT: the middle of sending a request.
  // See NEVER_INDEX in lib/pcd-seo.js. robots.txt asks a crawler not to
  // fetch this; that line is what stops it being listed anyway.
  ...PRIVATE_PAGE_METADATA,
  title: "Review and Send | Perth Cabinet Doors",
  description:
    "Check your list, tell us how to reach you, and send it. There is no payment on this page: we price your request by hand and email you a quote.",
};

export default function QuoteSendPage() {
  return (
    <>
      <PublicSiteNav active="contact" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={`${styles.pageHeaderInner} ${styles.quotePageHeaderInner}`}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/request-quote">Request a Quote</Link> &rsaquo;{" "}
              <Link href="/request-quote/list">My list</Link> &rsaquo; Send
            </div>
            <h1>Review and <em>send</em></h1>
            <p>Who we are quoting, and where the quote should go. There is no payment on this page and no total, because there is no price yet. We will come back to you within 1-3 business days.</p>
          </div>
        </section>

        <section className={styles.quoteTablePageWrap}>
          <QuoteSendClient />
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
