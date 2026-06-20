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
            <div className={styles.breadcrumb}><a href="/">Home</a> &rsaquo; <a href="/contact">Contact</a> &rsaquo; Request a Quote</div>
            <h1>Request a <em>Free Quote</em></h1>
            <p>Fill in your details, add each product to the table below, then submit. We will come back to you within 1-3 business days.</p>
          </div>
        </section>

        <section className={styles.quoteTablePageWrap}>
          <RequestQuoteFormClient />
        </section>

        <footer className={styles.siteFooter}>
          <p>Copyright 2026 Perth Cabinet Doors. All rights reserved.</p>
          <p>Perth, Western Australia &nbsp;&middot;&nbsp; <a href="tel:0408906784">0408 906 784</a> &nbsp;&middot;&nbsp; <a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a></p>
        </footer>
      </main>
    </>
  );
}
