import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import { Suspense } from "react";
import BookingConfirmClient from "../BookingConfirmClient";
import PcdLoader from "@/components/public/PcdLoader";
import styles from "../../quotes/quote-public.module.css";
import {
  BUSINESS_ABN,
  BUSINESS_PHONE,
  LEGAL_ENTITY,
  SALES_EMAIL,
  TRADING_NAME,
} from "@/lib/pcd-business-identity";

// The same shell the quote and variation pages use, deliberately. A customer
// who has approved a quote on this site should recognise where they are, and a
// second look for one more page is a second look to keep in step.

export const metadata = {
  // NOT FOR A SEARCH RESULT: one customer's booking, reached with a code.
  // See NEVER_INDEX in lib/pcd-seo.js. robots.txt asks a crawler not to
  // fetch this; that line is what stops it being listed anyway.
  ...PRIVATE_PAGE_METADATA,
  title: "Confirm Your Appointment | Perth Cabinet Doors",
};

export default function BookingConfirmPage() {
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
            <h1>Appointment</h1>
            <p>Tell us whether the time still suits. It takes a few seconds and it tells our team whether to head out.</p>
          </div>
        </div>
      </section>
      <main className={styles.quoteViewMain}>
        <Suspense
          fallback={
            <section className={styles.panel}>
              <div className={styles.panelHeader}>Your Appointment</div>
              <div className={styles.panelBody}>
                <PcdLoader
                  variant="panel"
                  label="Loading your appointment"
                  steps={["Finding your booking", "Loading the details", "Almost there"]}
                />
              </div>
            </section>
          }
        >
          <BookingConfirmClient />
        </Suspense>
      </main>
      {/* The same block the tax invoice closes with, so the page a customer
          answers on and the invoice they file afterwards say the same thing
          about who we are. lib/pcd-business-identity.js is the one source. */}
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
