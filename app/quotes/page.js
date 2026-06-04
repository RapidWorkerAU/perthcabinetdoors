import QuoteAccessForm from "./QuoteAccessForm";
import styles from "./quote-public.module.css";

export const metadata = {
  title: "Quote Access | Perth Cabinet Doors",
};

export default function QuoteAccessPage() {
  return (
    <div className={`${styles.page} ${styles.accessPage}`}>
      <section className={styles.accessHero}>
        <div className={styles.accessHeroInner}>
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" className={styles.accessLogo} />
          <h1>Quote &amp; Proposal</h1>
          <p>Enter your access code to review your quote and project breakdown.</p>
        </div>
      </section>
      <main className={styles.accessMain}>
        <section className={styles.accessCard}>
          <div className={styles.accessCardBody}>
            <div className={styles.accessIntro}>
              <h2>Access your quote</h2>
              <p>Enter the access code provided by Perth Cabinet Doors to view your quote.</p>
            </div>
            <QuoteAccessForm />
          </div>
        </section>
      </main>
    </div>
  );
}
