"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "../../quotes/quote-public.module.css";

// One button. See app/api/review-request/unsubscribe for why it is a button.

export default function UnsubscribeClient() {
  const code = useSearchParams().get("code") || "";
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  async function stop() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/review-request/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "That did not work. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setMessage("That did not work. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!code) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Review requests</div>
        <div className={styles.panelBody}>
          <p className={styles.message}>This link is missing its code. Please use the link in your email.</p>
        </div>
      </section>
    );
  }

  if (done) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Done</div>
        <div className={styles.panelBody}>
          <p className={styles.message}>We will not ask you for a review again.</p>
          <p className={styles.noteText}>
            Emails about your quotes, orders and invoices still come through as normal.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>Stop review requests</div>
      <div className={styles.panelBody}>
        <p className={styles.noteText}>
          Press the button and we will not email you asking for a Google review again. Emails about your quotes,
          orders and invoices are not affected.
        </p>
        {message ? <p className={styles.message}>{message}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={stop} disabled={saving}>
            {saving ? "Saving..." : "Stop review requests"}
          </button>
        </div>
      </div>
    </section>
  );
}
