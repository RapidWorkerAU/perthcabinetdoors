import Link from "next/link";
import { retrieveCheckoutSession } from "../../../../lib/pcd-stripe";
import { finaliseDepositAcceptance } from "../../../../lib/pcd-deposit-gate";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
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

      // THE SECOND OF THREE WAYS A DEPOSIT BECOMES AN ORDER.
      //
      // The Stripe webhook is the normal one and is usually already done by the
      // time this page renders. This exists for the times it is not: a slow
      // webhook, a dropped one, a retry still in flight. Doing it here means the
      // order exists before the customer has finished reading this page, rather
      // than whenever the next sweep runs.
      //
      // Safe to run when the webhook already won, because finalising claims the
      // quote conditionally and a second caller simply finds it done. Never
      // throws outwards: this page's job is to tell someone their payment
      // worked, and it must say so even if the bookkeeping behind it stumbles.
      if (session?.metadata?.flow === "quote_deposit_gate") {
        try {
          await finaliseDepositAcceptance(createSupabaseAdminClient(), session);
        } catch (finaliseError) {
          console.error(
            `[payments/success] could not finalise ${sessionId}: ${finaliseError?.message || finaliseError}. ` +
              "The twice daily sweep will pick it up."
          );
        }
      }
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
