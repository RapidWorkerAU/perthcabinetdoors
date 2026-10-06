import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import { Suspense } from "react";
import UnsubscribeClient from "./UnsubscribeClient";
import styles from "../../quotes/quote-public.module.css";
import {
  BUSINESS_ABN,
  BUSINESS_PHONE,
  LEGAL_ENTITY,
  SALES_EMAIL,
  TRADING_NAME,
} from "@/lib/pcd-business-identity";

// WHERE "STOP REVIEW REQUESTS" IN THE THANK YOU EMAIL LANDS.
//
// A page with a button rather than a link that unsubscribes on arrival, because
// mail scanners open every link in an email. The same shell as the booking and
// quote pages, so a customer recognises where they are.

export const metadata = {
  ...PRIVATE_PAGE_METADATA,
  title: "Stop Review Requests | Perth Cabinet Doors",
};

export default function ReviewUnsubscribePage() {
  return (
    <div className={`${styles.page} ${styles.quoteViewPage}`}>
      <section className={styles.quoteViewHero}>
        <div className={styles.quoteViewHeroInner}>
          <img
            src="/images/light-pcd-logo-horizontal.png"
            alt="Perth Cabinet Doors"
            className={styles.quoteViewLogo}
          />
          <div>
            <h1>Review requests</h1>
            <p>Stop us asking you for a Google review. Nothing else changes.</p>
          </div>
        </div>
      </section>
      <main className={styles.quoteViewMain}>
        <Suspense fallback={null}>
          <UnsubscribeClient />
        </Suspense>
      </main>
      <footer className={styles.docFooter}>
        <div className={styles.docFooterInner}>
          <span>
            {TRADING_NAME} is a trading entity under {LEGAL_ENTITY}. ABN {BUSINESS_ABN}.
          </span>
          <span>
            Questions about this page? Email {SALES_EMAIL} or call {BUSINESS_PHONE}.
          </span>
        </div>
      </footer>
    </div>
  );
}
