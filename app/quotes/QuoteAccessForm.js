"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./quote-public.module.css";

export default function QuoteAccessForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    const normalized = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!normalized) {
      setMessage("Enter your access code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/quote-workflow/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "We could not validate that code.");
        return;
      }
      router.push(`/quotes/view?code=${normalized}`);
    } catch (error) {
      setMessage(error?.message || "We could not validate that code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.formStack} onSubmit={handleSubmit}>
      <label className={styles.label}>
        Access code
        <input
          className={styles.input}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="e.g. A1B2C3D4"
          autoComplete="one-time-code"
        />
      </label>
      {message ? <p className={styles.message}>{message}</p> : null}
      <button type="submit" className={styles.button} disabled={isSubmitting}>
        {isSubmitting ? "Checking..." : "View quote"}
      </button>
    </form>
  );
}
