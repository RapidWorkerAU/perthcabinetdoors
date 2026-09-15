import { pageMetadata } from "@/lib/pcd-seo";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import PublicSiteNav from "../PublicSiteNav";
import ContactFormClient from "./ContactFormClient";
import ContactInfoSide from "./ContactInfoSide";
import styles from "./contact.module.css";

export const metadata = {
  title: "Contact Us | Perth Cabinet Doors",
  description:
    "Get in touch with Perth Cabinet Doors for a free quote on custom cabinet doors, panels and drawer fronts.",
  // Its one true address and its share card, from the title and
  // description above. This page is in the sitemap, so it has to carry a
  // canonical: a listed page with none is the site telling a crawler two
  // different things. See lib/pcd-seo.js.
  ...pageMetadata({
    path: "/contact",
    title: "Contact Us | Perth Cabinet Doors",
    description: "Get in touch with Perth Cabinet Doors for a free quote on custom cabinet doors, panels and drawer fronts.",
  }),
};

export default function ContactPage() {
  return (
    <>
      <PublicSiteNav active="contact" variant="solid" />
      <main className={styles.page}>
        <section className={styles.pageHeader}>
          <div className={styles.pageHeaderInner}>
            <div className={styles.breadcrumb}><Link href="/">Home</Link> &rsaquo; Contact</div>
            <h1>Let's Talk.<br /><em>We're Here to Help.</em></h1>
            <p>Not sure where to start? Pick the option below that best describes where you are at and we will take it from there.</p>
          </div>
        </section>

        {/* THE THREE WAYS IN, LEAST READY TO MOST READY, LEFT TO RIGHT.
            You are on the enquiry page, so the enquiry card comes first: the
            row starts where the reader is standing and moves rightwards as they
            get more certain about what they want. Somebody who knows less than
            the page assumes stops at the first card; somebody who knows more
            reads on and finds themselves further along.

            The shop is the last card rather than a link buried in the copy,
            because this is the page somebody lands on when they are deciding
            how to deal with us at all, and buying outright is one of the
            answers. It hides itself while the shop is closed, and the row falls
            back to the two it had.

            The descriptions say what happens rather than speaking as the
            customer ("I have my measurements..."), so each one is a statement
            about the business that is true read on its own. */}
        <section className={styles.chooserWrap}>
          <p className={styles.chooserLabel}>What would you like to do?</p>
          <div className={`${styles.chooser} ${SHOP_ENABLED ? styles.chooserThree : ""}`}>
            <div className={`${styles.chooserCard} ${styles.active}`}>
              <div className={styles.chooserIndicator}><span /></div>
              <div className={`${styles.chooserTag} ${styles.chooserTagGeneral}`}>I am not sure yet</div>
              <div className={styles.chooserCardTitle}>General Enquiry</div>
              <div className={styles.chooserCardDesc}>Send a photo and a question. Nothing needs measuring and there is no list to build. A person reads it and replies.</div>
            </div>

            <Link className={styles.chooserCard} href="/request-quote">
              <div className={styles.chooserIndicator}><span /></div>
              <div className={styles.chooserTag}>I know what I need</div>
              <div className={styles.chooserCardTitle}>Request a Quote</div>
              <div className={styles.chooserCardDesc}>Profiled and thermolaminated fronts, benchtops, new cabinets and installation are priced by hand. Build a list and we answer within 1 to 3 business days.</div>
            </Link>

            {SHOP_ENABLED ? (
              <Link className={styles.chooserCard} href="/products">
                <div className={styles.chooserIndicator}><span /></div>
                <div className={`${styles.chooserTag} ${styles.chooserTagShop}`}>I have my sizes</div>
                <div className={styles.chooserCardTitle}>Buy Flat Fronts Online</div>
                <div className={styles.chooserCardDesc}>Flat doors, drawer fronts and panels in Polytec decorative board are priced on the site. Enter the size, see the finished price, and pay by card.</div>
              </Link>
            ) : null}
          </div>
        </section>

        <section className={styles.contactWrap}>
          <ContactFormClient />
          <ContactInfoSide />
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
