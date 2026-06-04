"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { getAllowedAdminEmailClient } from "../../lib/admin-access";
import styles from "./admin-auth.module.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const allowedAdminEmail = getAllowedAdminEmailClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");

    if (authError === "session") {
      setStatus("Login succeeded in the browser, but the server could not verify the Supabase session. Restart the dev server and try again.");
    }

    if (authError === "missing") {
      setStatus("Your admin session has expired. Log in again.");
    }

    if (authError === "unauthorized") {
      setStatus("This account is not authorized for admin access.");
    }

    if (authError) {
      window.history.replaceState({}, "", "/admin");
    }
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setStatus("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setStatus("Enter your admin email and password.");
      return;
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setStatus("Admin login is not configured. Supabase environment variables are missing.");
      return;
    }

    if (normalizedEmail !== allowedAdminEmail) {
      setStatus("This account is not authorized for admin access.");
      return;
    }

    setIsBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setStatus(authErrorMessage(error));
        return;
      }

      const signedInEmail = data?.user?.email?.toLowerCase() || "";
      if (signedInEmail !== allowedAdminEmail) {
        await supabase.auth.signOut();
        setStatus("This account is not authorized for admin access.");
        return;
      }

      router.push("/admin/dashboard");
      router.refresh();
    } catch (error) {
      setStatus(error?.message || "Login failed. Please check the site configuration and try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleForgotPassword() {
    setStatus("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setStatus("Enter your email first, then click Forgot password.");
      return;
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setStatus("Password reset is not configured. Supabase environment variables are missing.");
      return;
    }

    if (normalizedEmail !== allowedAdminEmail) {
      setStatus("This account is not authorized for admin access.");
      return;
    }

    setIsBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      });

      if (error) {
        setStatus(authErrorMessage(error) || "Could not send reset email.");
        return;
      }

      setStatus("Password reset email sent. Check your inbox.");
    } catch (error) {
      setStatus(error?.message || "Could not send reset email. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.authShell}>
        <div className={styles.authPanel}>
          <a href="/" className={styles.homeLink}>Back to website</a>
          <img
            src="/images/horizontal-pcd-logo.png"
            alt="Perth Cabinet Doors"
            className={styles.logo}
          />
          <p className={styles.eyebrow}>Admin Portal</p>
          <h1 className={styles.title}>Secure access for the PCD team.</h1>
          <p className={styles.intro}>Sign in to manage products, quote requests, enquiries, quotes and orders.</p>

          <form onSubmit={handleLogin} className={styles.form} noValidate>
            <label className={styles.label} htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={styles.input}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <div className={styles.passwordRow}>
              <input
                key={showPassword ? "password-visible" : "password-hidden"}
                id="password"
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
                onClick={() => setShowPassword((previous) => !previous)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <div className={styles.formMeta}>
              <span>Accounts are created by administrators only.</span>
              <button
                type="button"
                onClick={handleForgotPassword}
                className={styles.linkButton}
                disabled={isBusy}
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" className={styles.submitButton} disabled={isBusy}>
              {isBusy ? "Please wait..." : "Log in"}
            </button>
          </form>

          {status ? (
            <p className={styles.status} role="status" aria-live="polite">
              {status}
            </p>
          ) : null}
        </div>

        <aside className={styles.visualPanel}>
          <span className={styles.visualMark} aria-hidden="true" />
        </aside>
      </section>
    </main>
  );
}

function authErrorMessage(error) {
  const message = error?.message || "";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  if (lowerMessage.includes("email not confirmed")) {
    return "This admin account has not confirmed its email address yet.";
  }

  if (lowerMessage.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return message || "Login failed. Please try again.";
}
