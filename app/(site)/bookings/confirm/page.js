import { Suspense } from "react";
import BookingConfirmClient from "../BookingConfirmClient";
import PcdLoader from "@/components/public/PcdLoader";
import styles from "../../quotes/quote-public.module.css";

// The same shell the quote and variation pages use, deliberately. A customer
// who has approved a quote on this site should recognise where they are, and a
// second look for one more page is a second look to keep in step.

export const metadata = {
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
          <h1>Confirm your appointment</h1>
          <p>
            Check the details below, then tell us whether the time still works. It takes a few seconds and it
            tells our team whether to head out.
          </p>
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
    </div>
  );
}
