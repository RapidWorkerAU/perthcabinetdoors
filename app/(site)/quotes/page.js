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
          <img
            src="/images/light-pcd-logo-horizontal.png"
            alt="Perth Cabinet Doors"
            className={styles.accessLogo}
          />
          <div>
            <h1>Secure link</h1>
            <p>Enter the code from the email we sent you and we will bring up your quote.</p>
          </div>
        </div>
      </section>
      <main className={styles.accessMain}>
        <section className={styles.accessCard}>
          <div className={styles.panelHeader}>Enter your code</div>
          <div className={styles.accessCardBody}>
            <p className={styles.accessIntro}>
              Enter the access code we sent you. Codes are not case sensitive.
            </p>
            <QuoteAccessForm />
          </div>
        </section>
      </main>
    </div>
  );
}
