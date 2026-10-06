// THE PRIVACY POLICY, AS A PAGE.
//
// The words live in lib/pcd-privacy-policy.js. The layout is the cancellation
// policy page's, so the two policies a customer might be sent look like one
// family.

import Link from "next/link";
import { pageMetadata } from "@/lib/pcd-seo";
import styles from "../book-a-site-measure/book-site-measure.module.css";
import { privacyPolicySections, PRIVACY_POLICY_UPDATED } from "@/lib/pcd-privacy-policy";
import { BUSINESS_ABN_SPACED, BUSINESS_PHONE, LEGAL_ENTITY, SALES_EMAIL, TRADING_NAME } from "@/lib/pcd-business-identity";

const TITLE = "Privacy policy | Perth Cabinet Doors";
const DESCRIPTION = "What personal information Perth Cabinet Doors collects, why, and who else sees it.";

// In the sitemap, so it carries its own canonical. See lib/pcd-seo.js.
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...pageMetadata({ path: "/privacy", title: TITLE, description: DESCRIPTION }),
};

const headingStyle = {
  margin: "22px 0 8px",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#1a1a18",
};
const textStyle = { margin: "0 0 12px", fontSize: 15, lineHeight: 1.6, color: "#3a3a34" };

export default function PrivacyPage() {
  const sections = privacyPolicySections({ salesEmail: SALES_EMAIL, tradingName: TRADING_NAME, legalEntity: LEGAL_ENTITY });

  return (
    <div className={styles.page}>
      <header className={styles.band}>
        <div className={styles.bandInner}>
          <Link href="/">
            <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" className={styles.bandLogo} />
          </Link>
          <span className={styles.bandPrice}>
            <Link href="/contact" style={{ color: "#d7e3d3" }}>Contact us</Link>
          </span>
        </div>
      </header>

      <main className={styles.main} style={{ maxWidth: 720 }}>
        <div className={styles.lead}>
          <h1>Privacy policy</h1>
          <p>Last updated {PRIVACY_POLICY_UPDATED}</p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardBody}>
            {sections.map((section) => (
              <section key={section.key}>
                <h2 style={headingStyle}>{section.heading}</h2>
                {(section.paragraphs || []).map((text) => (
                  <p key={text} style={textStyle}>{text}</p>
                ))}
                {section.bullets ? (
                  <ul style={{ ...textStyle, paddingLeft: 19 }}>
                    {section.bullets.map((line) => (
                      <li key={line} style={{ marginBottom: 6 }}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
            <p className={styles.hint} style={{ borderTop: "1px solid #dbd8cc", paddingTop: 14, marginTop: 4 }}>
              {TRADING_NAME} is a trading entity under {LEGAL_ENTITY}. ABN {BUSINESS_ABN_SPACED}.
            </p>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>
            <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> &nbsp; {BUSINESS_PHONE}
          </span>
          <span><Link href="/">Home</Link></span>
        </div>
      </footer>
    </div>
  );
}
