import { Suspense } from "react";
import VariationApprovalClient from "../VariationApprovalClient";
import PcdLoader from "@/components/public/PcdLoader";
import styles from "../../quotes/quote-public.module.css";

export const metadata = {
  title: "Order Variation | Perth Cabinet Doors",
};

export default function VariationViewPage() {
  return (
    <div className={`${styles.page} ${styles.quoteViewPage}`}>
      <section className={styles.quoteViewHero}>
        <div className={styles.quoteViewHeroInner}>
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" className={styles.quoteViewLogo} />
          <h1>Order Variation</h1>
          <p>Review the changes, confirm the revised scope, and approve or reject when ready.</p>
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
    </div>
  );
}
