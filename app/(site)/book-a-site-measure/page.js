import { Suspense } from "react";
import Link from "next/link";
import styles from "./book-site-measure.module.css";
import BookSiteMeasureClient from "./BookSiteMeasureClient";
import { CANCELLATION_POLICY_PATH } from "@/lib/pcd-cancellation-policy";
import {
  BUSINESS_ABN_SPACED,
  BUSINESS_PHONE,
  LEGAL_ENTITY,
  SALES_EMAIL,
  TRADING_NAME,
} from "@/lib/pcd-business-identity";

export const metadata = {
  title: "Book a site measure | Perth Cabinet Doors",
  description:
    "Book a site measure at your place. We measure every door, drawer front and panel, so your quote is priced off real sizes.",
};

export default function BookSiteMeasurePage() {
  return (
    <div className={styles.page}>
      <header className={styles.band}>
        <div className={styles.bandInner}>
          <Link href="/">
            <img
              src="/images/light-pcd-logo-horizontal.png"
              alt="Perth Cabinet Doors"
              className={styles.bandLogo}
            />
          </Link>
          <span className={styles.bandPrice}>Site measure, deducted from your order</span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.lead}>
          <h1>Book a site measure</h1>
          <p>
            We come to you and measure every door, drawer front and panel, so your quote is priced off real sizes
            rather than a guess. The fee covers our time and travel, and it comes off any order you go on to place.
          </p>
        </div>

        <Suspense
          fallback={
            <div className={styles.card}>
              <div className={styles.cardHead}>Loading our diary</div>
              <p className={styles.empty}>One moment.</p>
            </div>
          }
        >
          <BookSiteMeasureClient />
        </Suspense>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>
            {TRADING_NAME} is a trading entity under {LEGAL_ENTITY}. ABN {BUSINESS_ABN_SPACED}.
          </span>
          <span>
            <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> &nbsp; {BUSINESS_PHONE}
          </span>
          <span>
            <Link href={CANCELLATION_POLICY_PATH}>Cancellation policy</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
