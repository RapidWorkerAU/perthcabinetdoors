"use client";

// WHERE STRIPE SENDS THEM BACK TO.
//
// It says the same four facts the confirmation email says, in the same words,
// because somebody who has just paid reads this and then checks it against the
// email an hour later. Two versions of one booking is how a customer decides we
// are not organised.
//
// The route behind it completes the booking if the webhook has not arrived yet,
// so this page is never the one that tells somebody we have no record of them.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "../book-site-measure.module.css";
import { SALES_EMAIL } from "../../../../lib/pcd-business-identity";
import { CANCELLATION_POLICY_PATH } from "../../../../lib/pcd-cancellation-policy";

function money(amount) {
  return Number(amount || 0).toLocaleString("en-AU", {
    style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export default function BookedClient() {
  const params = useSearchParams();
  const sessionId = params.get("session_id") || "";
  const [state, setState] = useState({ loading: true, error: "", data: null });

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setState({ loading: false, error: "Missing booking reference.", data: null });
      return undefined;
    }
    (async () => {
      try {
        const response = await fetch(
          `/api/public/site-measure/booked?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          setState({ loading: false, error: payload.error || "We could not load that booking.", data: null });
          return;
        }
        setState({ loading: false, error: "", data: payload });
      } catch (error) {
        if (!cancelled) setState({ loading: false, error: error?.message || "We could not load that booking.", data: null });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  if (state.loading) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>Confirming your booking</div>
        <p className={styles.empty}>One moment.</p>
      </div>
    );
  }

  if (state.error || !state.data) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>We could not find that booking</div>
        <div className={styles.cardBody}>
          <p style={{ margin: 0 }}>{state.error}</p>
          <p className={styles.hint}>
            Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> and we will sort it out.
          </p>
        </div>
      </div>
    );
  }

  const { booking, confirmHours, booked } = state.data;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>{booked ? "Your site measure is booked" : "Your payment is on its way"}</div>
      <div className={styles.cardBody}>
        <div className={styles.done}>
          <span className={styles.doneMark} aria-hidden="true">&#10003;</span>

          {booked ? (
            <p style={{ margin: 0 }}>
              We have emailed a confirmation to <b>{booking.email}</b>.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              Your payment has not finished clearing. We will email <b>{booking.email}</b> the moment it does. Nothing
              else is needed from you.
            </p>
          )}

          <div className={styles.summary}>
            <div className={styles.summaryRow}><span>Date</span><b>{booking.dayWords}</b></div>
            <div className={styles.summaryRow}><span>Arriving between</span><b>{booking.windowWords}</b></div>
            <div className={styles.summaryRow}><span>Address</span><b>{booking.address}</b></div>
            <div className={styles.summaryRow}><span>Fee paid</span><b>{money(booking.fee)}</b></div>
          </div>

          <div className={styles.window}>
            <b>We will confirm the exact time with you in the {confirmHours} hours before.</b>
            <span>
              The {money(booking.fee)} fee covers our time and travel for the site measure. It comes off any order
              you place from the quote we send you afterwards.
            </span>
          </div>

          <p className={styles.hint}>
            To change the date or the time, email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.{" "}
            <Link href={CANCELLATION_POLICY_PATH}>Cancellation policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
