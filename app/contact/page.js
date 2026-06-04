import PublicSiteNav from "../PublicSiteNav";
import ContactFormClient from "./ContactFormClient";
import ContactInfoSide from "./ContactInfoSide";
import styles from "./contact.module.css";

export const metadata = {
  title: "Contact Us | Perth Cabinet Doors",
  description:
    "Get in touch with Perth Cabinet Doors for a free quote on custom cabinet doors, panels and drawer fronts.",
};

export default function ContactPage() {
  return (
    <>
      <PublicSiteNav active="contact" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={styles.pageHeaderInner}>
            <div className={styles.breadcrumb}><a href="/">Home</a> &rsaquo; Contact</div>
            <h1>Let's Talk.<br /><em>We're Here to Help.</em></h1>
            <p>Not sure where to start? Pick the option below that best describes where you are at and we will take it from there.</p>
          </div>
        </section>

        <section className={styles.chooserWrap}>
          <p className={styles.chooserLabel}>What would you like to do?</p>
          <div className={styles.chooser}>
            <a className={styles.chooserCard} href="/request-quote">
              <div className={styles.chooserIndicator}><span /></div>
              <div className={styles.chooserTag}>I know what I need</div>
              <div className={styles.chooserCardTitle}>Request a Quote</div>
              <div className={styles.chooserCardDesc}>I have my measurements, or at least a rough idea of what I am after. I would like a price.</div>
            </a>

            <div className={`${styles.chooserCard} ${styles.active}`}>
              <div className={styles.chooserIndicator}><span /></div>
              <div className={`${styles.chooserTag} ${styles.chooserTagGeneral}`}>Just browsing or exploring</div>
              <div className={styles.chooserCardTitle}>General Enquiry</div>
              <div className={styles.chooserCardDesc}>I am not ready to quote yet. I just have a question or want to find out more about what you offer.</div>
            </div>
          </div>
        </section>

        <section className={styles.contactWrap}>
          <ContactFormClient />
          <ContactInfoSide />
        </section>

        <footer className={styles.siteFooter}>
          <p>Copyright 2026 Perth Cabinet Doors. All rights reserved.</p>
          <p>Perth, Western Australia &nbsp;&middot;&nbsp; <a href="tel:0408906784">0408 906 784</a> &nbsp;&middot;&nbsp; <a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a></p>
        </footer>
      </main>
    </>
  );
}
