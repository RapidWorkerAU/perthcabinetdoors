import Link from "next/link";
import { retrieveCheckoutSession } from "../../../../lib/pcd-stripe";
import styles from "../../quotes/quote-public.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Payment Successful | Perth Cabinet Doors",
};

function formatMoney(cents, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(cents || 0) / 100);
}

export default async function PaymentSuccessPage({ searchParams }) {
  const params = await searchParams;
  const sessionId = params?.session_id || "";
  let session = null;
  let error = "";

  if (sessionId) {
    try {
      session = await retrieveCheckoutSession(sessionId);
    } catch (err) {
      error = err?.message || "We could not confirm the payment session.";
    }
  }

  return (
    <div className={`${styles.page} ${styles.quoteViewPage}`}>
      <section className={styles.quoteViewHero}>
        <div className={styles.quoteViewHeroInner}>
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" className={styles.quoteViewLogo} />
          <h1>Payment successful</h1>
          <p>Your payment has been received.</p>
        </div>
      </section>
      <main className={styles.quoteViewMain}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>Payment Confirmation</div>
          <div className={styles.panelBody}>
            {error ? (
              <p className={styles.message}>{error}</p>
            ) : (
              <div className={styles.formStack}>
                <p className={styles.noteText}>
                  Thank you. Your payment
                  {session?.amount_total ? ` of ${formatMoney(session.amount_total, session.currency || "AUD")}` : ""} was successful.
                </p>
                <p className={styles.noteText}>
                  The PCD team will be in contact within the next 2 business days with next steps.
                </p>
                <Link className={styles.button} href="/">
                  Return to homepage
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
