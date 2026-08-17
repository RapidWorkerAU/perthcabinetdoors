import { Suspense } from "react";
import QuoteApprovalClient from "../QuoteApprovalClient";
import PcdLoader from "@/components/public/PcdLoader";
import styles from "../quote-public.module.css";

export const metadata = {
  title: "Quote Review | Perth Cabinet Doors",
};

export default function QuoteViewPage() {
  return (
    <div className={`${styles.page} ${styles.quoteViewPage}`}>
      <section className={styles.quoteViewHero}>
        <div className={styles.quoteViewHeroInner}>
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" className={styles.quoteViewLogo} />
          <h1>Quote &amp; Proposal</h1>
          <p>Review the summary, confirm the breakdown, and approve or reject when ready.</p>
        </div>
      </section>
      <main className={styles.quoteViewMain}>
        <Suspense
          fallback={
            <section className={styles.panel}>
              <div className={styles.panelHeader}>Quote</div>
              <div className={styles.panelBody}>
                <PcdLoader
                  variant="panel"
                  label="Loading your quote"
                  steps={["Finding your quote", "Loading the details", "Almost there"]}
                />
              </div>
            </section>
          }
        >
          <QuoteApprovalClient />
        </Suspense>
      </main>
    </div>
  );
}
