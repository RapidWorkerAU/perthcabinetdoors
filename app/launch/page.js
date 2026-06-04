"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import styles from "./launch.module.css";

const LAUNCH_EMAIL = "sales@perthcabinetdoors.com.au";
const LAUNCH_DATE = new Date("2026-06-08T12:00:00+08:00");
const TOPICS = [
  "General enquiry",
  "Cabinet doors",
  "Drawer fronts",
  "Panels",
  "IKEA compatible products",
  "Kaboodle compatible products",
  "Something else",
];

function getCountdown() {
  const remaining = Math.max(0, LAUNCH_DATE.getTime() - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export default function LaunchPage() {
  return (
    <Suspense fallback={null}>
      <LaunchGate />
    </Suspense>
  );
}

function LaunchGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isEnquiryOpen, setIsEnquiryOpen] = useState(false);
  const [enquiryStatus, setEnquiryStatus] = useState(null);
  const [isSubmittingEnquiry, setIsSubmittingEnquiry] = useState(false);

  const nextPath = useMemo(() => {
    const requestedPath = searchParams.get("next") || "/";
    return requestedPath.startsWith("/") ? requestedPath : "/";
  }, [searchParams]);

  useEffect(() => {
    setCountdown(getCountdown());
    const timer = window.setInterval(() => setCountdown(getCountdown()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("");

    if (!password) {
      setStatus("Enter the launch access password.");
      return;
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setStatus("Launch access is not configured. Supabase environment variables are missing.");
      return;
    }

    setIsBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: LAUNCH_EMAIL,
        password,
      });

      if (error) {
        setStatus(authErrorMessage(error));
        return;
      }

      const response = await fetch("/api/launch-access", { method: "POST" });
      if (!response.ok) {
        setStatus("Password accepted, but access could not be saved. Please try again.");
        return;
      }

      await supabase.auth.signOut();
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setStatus(error?.message || "Launch access failed. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function submitEnquiry(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setEnquiryStatus(null);
    setIsSubmittingEnquiry(true);

    const formData = new FormData(form);
    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();
    const customerName = [firstName, lastName].filter(Boolean).join(" ");
    const payload = {
      customerName,
      customerEmail: String(formData.get("email") || "").trim(),
      customerPhone: String(formData.get("phone") || "").trim(),
      postcode: String(formData.get("postcode") || "").trim(),
      topic: String(formData.get("topic") || "").trim(),
      message: String(formData.get("message") || "").trim(),
    };

    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not send enquiry.");
      form.reset();
      setEnquiryStatus({
        type: "success",
        message: "Thanks. Your enquiry has been received and we will respond within 1-3 business days.",
      });
    } catch (error) {
      setEnquiryStatus({ type: "error", message: error?.message || "Could not send enquiry." });
    } finally {
      setIsSubmittingEnquiry(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.brandRow}>
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" className={styles.logo} />
          <span className={styles.statusPill}>Private preview</span>
        </div>

        <div className={styles.content}>
          <p className={styles.eyebrow}>New website loading</p>
          <h1>
            Launching 8 June <em>at 12pm.</em>
          </h1>
          <p className={styles.copy}>
            We are putting the final pieces in place. Team access is available below.
          </p>

          <div className={styles.countdown} aria-label="Countdown to launch">
            <div>
              <strong>{countdown ? countdown.days : "--"}</strong>
              <span>Days</span>
            </div>
            <div>
              <strong>{countdown ? pad(countdown.hours) : "--"}</strong>
              <span>Hours</span>
            </div>
            <div>
              <strong>{countdown ? pad(countdown.minutes) : "--"}</strong>
              <span>Minutes</span>
            </div>
            <div>
              <strong>{countdown ? pad(countdown.seconds) : "--"}</strong>
              <span>Seconds</span>
            </div>
          </div>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <label className={styles.label} htmlFor="launch-password">
              Password
            </label>
            <div className={styles.passwordRow}>
              <input
                id="launch-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className={styles.input}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className={styles.toggleButton}
                onClick={() => setShowPassword((current) => !current)}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <button type="submit" className={styles.submitButton} disabled={isBusy}>
              {isBusy ? "Checking..." : "Enter website"}
            </button>
          </form>

          {status ? (
            <p className={styles.statusMessage} role="status" aria-live="polite">
              {status}
            </p>
          ) : null}

          <div className={styles.enquiryPrompt}>
            <span>Need to contact us before launch?</span>
            <button type="button" onClick={() => setIsEnquiryOpen(true)}>
              Send an enquiry
            </button>
          </div>
        </div>
      </section>

      {isEnquiryOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="launch-enquiry-title" onMouseDown={() => setIsEnquiryOpen(false)}>
          <section className={styles.enquiryModal} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Website enquiry</p>
                <h2 id="launch-enquiry-title">Send us a message</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setIsEnquiryOpen(false)} aria-label="Close enquiry form">
                Close
              </button>
            </div>

            <form className={styles.enquiryForm} onSubmit={submitEnquiry}>
              <div className={styles.formGrid}>
                <label>
                  First name
                  <input name="firstName" type="text" placeholder="e.g. Sarah" />
                </label>
                <label>
                  Last name
                  <input name="lastName" type="text" placeholder="e.g. Jones" />
                </label>
                <label>
                  Phone
                  <input name="phone" type="tel" placeholder="e.g. 0400 000 000" />
                </label>
                <label>
                  Email
                  <input name="email" type="email" placeholder="e.g. sarah@email.com" />
                </label>
                <label>
                  Postcode
                  <input name="postcode" type="text" inputMode="numeric" maxLength={4} placeholder="e.g. 6000" />
                </label>
                <label>
                  Topic
                  <select name="topic" defaultValue="General enquiry">
                    {TOPICS.map((topic) => (
                      <option key={topic}>{topic}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.fullField}>
                  Message
                  <textarea name="message" placeholder="Tell us what you need." required />
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryButton} onClick={() => setIsEnquiryOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.submitButton} disabled={isSubmittingEnquiry}>
                  {isSubmittingEnquiry ? "Sending..." : "Send enquiry"}
                </button>
              </div>

              {enquiryStatus ? (
                <p className={`${styles.statusMessage} ${enquiryStatus.type === "success" ? styles.statusSuccess : ""}`} role="status" aria-live="polite">
                  {enquiryStatus.message}
                </p>
              ) : null}
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function authErrorMessage(error) {
  const message = error?.message || "";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("invalid login credentials")) {
    return "The password is incorrect.";
  }

  if (lowerMessage.includes("email not confirmed")) {
    return "The launch access account has not confirmed its email address yet.";
  }

  if (lowerMessage.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return message || "Launch access failed. Please try again.";
}
