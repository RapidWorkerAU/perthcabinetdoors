import { Suspense } from "react";
import Link from "next/link";
import styles from "../book-site-measure.module.css";
import PayLinkClient from "./PayLinkClient";
import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import { CANCELLATION_POLICY_PATH } from "@/lib/pcd-cancellation-policy";
import {
  BUSINESS_ABN_SPACED,
  BUSINESS_PHONE,
  LEGAL_ENTITY,
  SALES_EMAIL,
  TRADING_NAME,
} from "@/lib/pcd-business-identity";

// The page a payment link from the calendar opens. The same shell as the
// booking page, because it is the same booking finished a different way.

export const metadata = {
  // One customer's booking, reached with a code. See NEVER_INDEX in lib/pcd-seo.js.
  ...PRIVATE_PAGE_METADATA,
  title: "Confirm your site measure | Perth Cabinet Doors",
};

export default function PayLinkPage() {
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
          <h1>Confirm your site measure</h1>
          <p>
            Your time is held but not confirmed. It is confirmed once the site measure fee is paid, and the fee comes
            off any order you go on to place.
          </p>
        </div>

        <Suspense
          fallback={
            <div className={styles.card}>
              <div className={styles.cardHead}>Loading your booking</div>
              <p className={styles.empty}>One moment.</p>
            </div>
          }
        >
          <PayLinkClient />
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
