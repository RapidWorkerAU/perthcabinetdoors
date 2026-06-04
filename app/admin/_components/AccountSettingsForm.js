"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { getAllowedAdminEmailClient } from "../../../lib/admin-access";
import styles from "../admin-shell.module.css";

export default function AccountSettingsForm({ currentEmail }) {
  const [email, setEmail] = useState(currentEmail || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const allowedAdminEmail = useMemo(() => getAllowedAdminEmailClient(), []);
  const accountLabel = email?.split("@")[0] || "Admin account";
  const accountInitials = accountLabel
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AD";

  async function handleEmailUpdate(event) {
    event.preventDefault();
    setEmailStatus("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setEmailStatus("Enter an email address.");
      return;
    }

    if (normalizedEmail !== allowedAdminEmail) {
      setEmailStatus(
        `Allowed admin email is ${allowedAdminEmail}. Update NEXT_PUBLIC_ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_EMAIL if you want to change it.`
      );
      return;
    }

    setEmailBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser(
        { email: normalizedEmail },
        { emailRedirectTo: `${window.location.origin}/admin/settings` }
      );

      if (error) {
        setEmailStatus(error.message || "Could not update email.");
        return;
      }

      setEmailStatus("Confirmation email sent. Please confirm the email change from your inbox.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    setPasswordStatus("");

    if (newPassword.length < 8) {
      setPasswordStatus("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus("Passwords do not match.");
      return;
    }

    setPasswordBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setPasswordStatus(error.message || "Could not update password.");
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("Password updated successfully.");
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className={styles.settingsWorkspace}>
      <aside className={styles.settingsSubnav} aria-label="Settings sections">
        <p className={styles.settingsSubnavEyebrow}>Settings</p>
        <h2>Account</h2>
        <button type="button" className={`${styles.settingsSubnavItem} ${styles.settingsSubnavItemActive}`}>
          <span className={styles.settingsSubnavIcon} aria-hidden="true">
            {accountInitials}
          </span>
          <span>
            <strong>My Profile</strong>
            <small>Name, email and password</small>
          </span>
        </button>
      </aside>

      <section className={styles.settingsDetail}>
        <header className={styles.settingsDetailHeader}>
          <h2>My Profile</h2>
          <p>Name, email and password</p>
        </header>

        <div className={styles.settingsDetailBody}>
          <section className={styles.profileSummaryCard}>
            <div className={styles.profileAvatar} aria-hidden="true">
              {accountInitials}
            </div>
            <div>
              <h3>Admin Account</h3>
              <p>{currentEmail || allowedAdminEmail}</p>
            </div>
          </section>

          <section className={styles.profileInfoCard}>
            <div className={styles.profileCardHeader}>
              <div>
                <h3>Personal Information</h3>
                <p>Core account details used for sign-in and admin access.</p>
              </div>
            </div>

            <div className={styles.profileInfoGrid}>
              <div>
                <span>Full name</span>
                <strong>Admin Account</strong>
              </div>
              <div>
                <span>Username</span>
                <strong>{accountLabel}</strong>
              </div>
              <div>
                <span>Email address</span>
                <strong>{currentEmail || allowedAdminEmail}</strong>
              </div>
              <div>
                <span>Password</span>
                <strong>••••••••</strong>
              </div>
            </div>

            <div className={styles.profileFormsGrid}>
              <form onSubmit={handleEmailUpdate} className={styles.profileSettingsForm}>
                <h4>Email</h4>
                <p>
                  Allowed admin email: <strong>{allowedAdminEmail}</strong>
                </p>
                <label className={styles.fieldLabel} htmlFor="adminEmail">
                  Account email
                </label>
                <input
                  id="adminEmail"
                  type="email"
                  className={styles.fieldInput}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
                <button type="submit" className={styles.primaryButton} disabled={emailBusy}>
                  {emailBusy ? "Sending confirmation..." : "Update email"}
                </button>
                {emailStatus ? <p className={styles.feedback}>{emailStatus}</p> : null}
              </form>

              <form onSubmit={handlePasswordUpdate} className={styles.profileSettingsForm}>
                <h4>Password</h4>
                <p>Update the login password for this admin account.</p>
                <label className={styles.fieldLabel} htmlFor="newPassword">
                  New password
                </label>
                <div className={styles.passwordInline}>
                  <input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    className={styles.fieldInput}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setShowPassword((previous) => !previous)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <label className={styles.fieldLabel} htmlFor="confirmPassword">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  className={styles.fieldInput}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button type="submit" className={styles.primaryButton} disabled={passwordBusy}>
                  {passwordBusy ? "Updating..." : "Update password"}
                </button>
                {passwordStatus ? <p className={styles.feedback}>{passwordStatus}</p> : null}
              </form>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
