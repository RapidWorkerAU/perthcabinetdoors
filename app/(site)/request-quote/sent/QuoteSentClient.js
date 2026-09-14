"use client";

// SENT, AND IT IS A QUOTE REQUEST.
//
// The one thing this page has to do is not look like an order confirmation.
// Somebody who has just been through a three page flow with a list and a Send
// button has every reason to think they have bought something, so it says
// plainly that nothing has been charged and that nothing is made until they
// accept the quote.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "../../contact/contact.module.css";
import CrossToCart from "../../cart/CrossToCart";

const WHAT_NEXT = [
  "It is in our quote requests, waiting to be priced.",
  "You will have a quote by email, usually within 1-3 business days.",
  "The quote is good for 30 days.",
  "Accept it and we start. Nothing before that.",
];

export default function QuoteSentClient() {
  // Only set where some part of the request could not be read cleanly. It is
  // the one thing on this page about THEIR request rather than every request,
  // so it goes above everything else.
  const notice = useSearchParams().get("notice");

  return (
    <div className={styles.sentPage}>
      <div className={styles.sentCard}>
        <div className={styles.sentHead}>
          <span className={styles.sectionLabel}>Sent</span>
          <strong>Thank you. We have your request.</strong>
          <p>Nothing has been charged.</p>
        </div>

        <div className={styles.sentBody}>
          {notice ? <p className={styles.sentNotice}>{notice}</p> : null}

          <ol className={styles.listSteps}>
            {WHAT_NEXT.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>

          <div className={styles.sentActions}>
            <Link className={styles.listSendBtn} href="/request-quote">
              Start another request
            </Link>
            <p className={styles.listSideFoot}>
              Anything urgent, call <a href="tel:0437750990">0437 750 990</a> or email{" "}
              <a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a>.
            </p>
          </div>
        </div>
      </div>
      {/* A request sent does not finish the job if half of it is still sitting
          in a cart, priced and unpaid. */}
      <div style={{ marginTop: 20 }}>
        <CrossToCart />
      </div>
    </div>
  );
}
