import { Suspense } from "react";
import Link from "next/link";
import styles from "../book-site-measure.module.css";
import BookedClient from "./BookedClient";
import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import { CANCELLATION_POLICY_PATH } from "@/lib/pcd-cancellation-policy";
import {
  BUSINESS_ABN_SPACED,
  BUSINESS_PHONE,
  LEGAL_ENTITY,
  SALES_EMAIL,
  TRADING_NAME,
} from "@/lib/pcd-business-identity";

export const metadata = {
  // Somebody's booking, reached with a payment reference. Nothing for a search
  // result to list. See NEVER_INDEX in lib/pcd-seo.js.
  ...PRIVATE_PAGE_METADATA,
  title: "Booking confirmed | Perth Cabinet Doors",
};

export default function BookedPage() {
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
        </div>
      </header>

      <main className={styles.main}>
        <Suspense
          fallback={
            <div className={styles.card}>
              <div className={styles.cardHead}>Confirming your booking</div>
              <p className={styles.empty}>One moment.</p>
            </div>
          }
        >
          <BookedClient />
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
