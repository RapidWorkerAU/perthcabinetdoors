import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../contact/contact.module.css";
import RequestQuoteFormClient from "./RequestQuoteFormClient";

export const metadata = {
  title: "Request a Quote | Perth Cabinet Doors",
  description:
    "Request a free quote from Perth Cabinet Doors. Custom cabinet doors, drawer fronts and panels made to your measurements.",
};

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
            <p>Fill in your details, add each product to the table below, then submit. We will come back to you within 1-3 business days.</p>
          </div>
        </section>

        <section className={styles.quoteTablePageWrap}>
          <RequestQuoteFormClient />
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
