// THE CANCELLATION POLICY, AS A PAGE.
//
// ── WHY THE NUMBERS ARE READ AND NOT TYPED ───────────────────────────────────
//
// The fee and the cutoff on this page come out of the booking settings, the
// same row the booking form reads. A policy page with a hand typed "48 hours"
// on it is a policy page that becomes a lie the first time somebody changes the
// setting, and it is the page a customer will quote back at us.
//
// ── WHY IT IS A PAGE AND NOT ONLY A MODAL ────────────────────────────────────
//
// The modal on the booking form keeps somebody in their form, which is right in
// the moment. But a modal cannot be linked to: the confirmation email has
// nowhere to point, the footer has nowhere to point, and a customer who wants to
// read it a week later would have to start a booking to get at it. Same words,
// two ways in. See app/(site)/book-a-site-measure/CancellationPolicyBody.js.

import Link from "next/link";
import styles from "../book-a-site-measure/book-site-measure.module.css";
import CancellationPolicyBody from "../book-a-site-measure/CancellationPolicyBody";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBookingSettings } from "@/lib/pcd-booking-store";
import { CANCELLATION_POLICY_UPDATED } from "@/lib/pcd-cancellation-policy";
import {
  BUSINESS_ABN_SPACED,
  BUSINESS_PHONE,
  LEGAL_ENTITY,
  SALES_EMAIL,
  TRADING_NAME,
} from "@/lib/pcd-business-identity";

export const metadata = {
  title: "Site measure cancellation policy | Perth Cabinet Doors",
  description:
    "What happens to your site measure booking fee if you need to cancel or move your booking.",
};

// Read fresh. A policy showing yesterday's fee is worse than one that takes an
// extra moment to load.
export const dynamic = "force-dynamic";

export default async function CancellationPolicyPage() {
  let settings = null;
  try {
    settings = await getBookingSettings(createSupabaseAdminClient());
  } catch {
    // The page still has to exist and still has to be right about the shape of
    // the rule. Falling back to the built-in figures is better than a broken
    // page on a link we have put in an email.
    settings = null;
  }

  const fee = settings?.fee_inc_gst ?? 100;
  const confirmHours = settings?.confirm_hours ?? 48;

  return (
    <div className={styles.page}>
      <header className={styles.band}>
        <div className={styles.bandInner}>
          <Link href="/">
            <img
              src="/images/light-pcd-logo-horizontal.png"
              alt="Perth Cabinet Doors"
              className={styles.bandLogo}
            />
          </Link>
          <span className={styles.bandPrice}>
            <Link href="/book-a-site-measure" style={{ color: "#d7e3d3" }}>Book a site measure</Link>
          </span>
        </div>
      </header>

      <main className={styles.main} style={{ maxWidth: 720 }}>
        <div className={styles.lead}>
          <h1>Site measure cancellation policy</h1>
          <p>Last updated {CANCELLATION_POLICY_UPDATED}</p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardBody}>
            <CancellationPolicyBody
              fee={fee}
              confirmHours={confirmHours}
              salesEmail={SALES_EMAIL}
              headingTag="h2"
            />
            <p className={styles.hint} style={{ borderTop: "1px solid #dbd8cc", paddingTop: 14, marginTop: 4 }}>
              {TRADING_NAME} is a trading entity under {LEGAL_ENTITY}. ABN {BUSINESS_ABN_SPACED}. Nothing in this
              policy limits any right you have under Australian Consumer Law.
            </p>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>
            <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> &nbsp; {BUSINESS_PHONE}
          </span>
          <span><Link href="/book-a-site-measure">Book a site measure</Link></span>
        </div>
      </footer>
    </div>
  );
}
