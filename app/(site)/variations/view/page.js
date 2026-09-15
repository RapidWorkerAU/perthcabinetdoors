import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";
import { Suspense } from "react";
import VariationApprovalClient from "../VariationApprovalClient";
import PcdLoader from "@/components/public/PcdLoader";
import styles from "../../quotes/quote-public.module.css";
import {
  BUSINESS_ABN,
  BUSINESS_PHONE,
  LEGAL_ENTITY,
  SALES_EMAIL,
  TRADING_NAME,
} from "@/lib/pcd-business-identity";

export const metadata = {
  // NOT FOR A SEARCH RESULT: somebody's variation, reached with a code.
  // See NEVER_INDEX in lib/pcd-seo.js. robots.txt asks a crawler not to
  // fetch this; that line is what stops it being listed anyway.
  ...PRIVATE_PAGE_METADATA,
  title: "Order Variation | Perth Cabinet Doors",
};

export default function VariationViewPage() {
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
            <h1>Variation</h1>
            <p>Only the items listed are changing. The rest of your order stays exactly as you approved it.</p>
          </div>
        </div>
      </section>
      <main className={styles.quoteViewMain}>
        <Suspense
          fallback={
            <section className={styles.panel}>
              <div className={styles.panelHeader}>Order Variation</div>
              <div className={styles.panelBody}>
                <PcdLoader
                  variant="panel"
                  label="Loading your variation"
                  steps={["Finding your variation", "Loading the details", "Almost there"]}
                />
              </div>
            </section>
          }
        >
          <VariationApprovalClient />
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
