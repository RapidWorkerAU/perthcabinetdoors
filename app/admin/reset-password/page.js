"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import styles from "../admin-auth.module.css";

export default function AdminResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  useEffect(() => {
    async function initRecoverySession() {
      const supabase = createSupabaseBrowserClient();

      const hash = window.location.hash || "";
      const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");

      if (type === "recovery" && accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setStatus("Reset link is invalid or expired. Request a new reset email.");
          return;
        }

        setHasRecoverySession(true);
        window.history.replaceState({}, "", "/admin/reset-password");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setHasRecoverySession(true);
      } else {
        setStatus("Reset link is invalid or expired. Request a new reset email.");
      }
    }

    initRecoverySession();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("");

    if (!hasRecoverySession) {
      setStatus("Reset link is invalid or expired. Request a new reset email.");
      return;
    }

    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    setIsBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setStatus(error.message || "Unable to reset password.");
        return;
      }

      setStatus("Password updated. Redirecting to login...");
      setTimeout(() => {
        router.push("/admin");
        router.refresh();
      }, 900);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <img
          src="/images/horizontal-pcd-logo.png"
          alt="Perth Cabinet Doors"
          className={styles.logo}
        />
        <h1 className={styles.title}>Reset Admin Password</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label} htmlFor="password">
            New password
          </label>
          <div className={styles.passwordRow}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className={styles.input}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setShowPassword((previous) => !previous)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <label className={styles.label} htmlFor="confirmPassword">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            className={styles.input}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />

          <button
            type="submit"
            className={styles.submitButton}
            disabled={isBusy || !hasRecoverySession}
          >
            {isBusy ? "Saving..." : "Update password"}
          </button>
        </form>

        {status ? <p className={styles.status}>{status}</p> : null}
      </section>
    </main>
  );
}
