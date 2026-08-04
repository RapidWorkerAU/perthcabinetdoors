import { Suspense } from "react";
import VariationApprovalClient from "../VariationApprovalClient";
import styles from "../../quotes/quote-public.module.css";

export const metadata = {
  title: "Order Variation | Perth Cabinet Doors",
};

export default function VariationViewPage() {
  return (
    <main className="min-h-screen bg-[#f5f8f4] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <Suspense
          fallback={
            <section className={styles.panel}>
              <div className={styles.panelHeader}>Order Variation</div>
              <div className={styles.panelBody}>Loading variation...</div>
            </section>
          }
        >
          <VariationApprovalClient />
        </Suspense>
      </div>
    </main>
  );
}
