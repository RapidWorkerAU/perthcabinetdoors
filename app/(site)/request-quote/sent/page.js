import { Suspense } from "react";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicSiteNav from "../../PublicSiteNav";
import styles from "../../contact/contact.module.css";
import QuoteSentClient from "./QuoteSentClient";

export const metadata = {
  title: "Quote Request Sent | Perth Cabinet Doors",
  description: "Your quote request is with us. We price it by hand and email you, usually within 1-3 business days.",
};

export default function QuoteSentPage() {
  return (
    <>
      <PublicSiteNav active="contact" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={`${styles.pageHeaderInner} ${styles.quotePageHeaderInner}`}>
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/request-quote">Request a Quote</Link> &rsaquo; Sent
            </div>
            <h1>Your request is <em>with us</em></h1>
            <p>Nothing has been charged. We price it by hand and email you, usually within 1-3 business days.</p>
          </div>
        </section>

        <section className={styles.quoteTablePageWrap}>
          {/* useSearchParams needs a boundary, and this is the whole of the
              page that depends on it: the rest is the same for everybody. */}
          <Suspense fallback={null}>
            <QuoteSentClient />
          </Suspense>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
