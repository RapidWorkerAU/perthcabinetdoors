"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { getAllowedAdminEmailClient } from "../../../lib/admin-access";
import { DEFAULT_LAUNCH_SETTINGS } from "../../../lib/launch-settings";
import { DEFAULT_BUSINESS_DEFAULTS } from "../../../lib/pcd-quote-utils";
import styles from "../admin-content.module.css";
import launchStyles from "./launch-preview.module.css";

const DEFAULTS_FIELDS = [
  {
    key: "currency",
    label: "Default quote currency",
    help: "Used for quote totals and customer-facing pricing across the backend.",
    type: "text",
    transform: "uppercase",
  },
  {
    key: "gst_rate",
    label: "Default GST rate",
    help: "Used for quote GST calculations unless a quote already has its own stored rate.",
    type: "number",
    step: "0.01",
    min: "0",
  },
  {
    key: "markup_percent",
    label: "Default line markup %",
    help: "Used for new quote item lines. Admin can still edit the markup on each line.",
    suffix: "%",
  },
  {
    key: "hinge_drilling_unit_cost_ex_gst",
    label: "Hinge drilling cost ex GST",
    help: "Cost per hinge hole set used when hinge drilling is required.",
    prefix: "$",
  },
  {
    key: "hinge_supply_unit_cost_ex_gst",
    label: "Hinge supply cost ex GST",
    help: "Cost per supplied hinge used when hinge supply is required.",
    prefix: "$",
  },
  {
    key: "worker_hourly_rate",
    label: "Labour hourly rate ex GST",
    help: "Used as the default worker hourly rate on quotes.",
    prefix: "$",
  },
];

const LAUNCH_TEXT_FIELDS = [
  ["statusPill", "Status pill"],
  ["eyebrow", "Eyebrow"],
  ["headline", "Headline"],
  ["headlineAccent", "Headline accent"],
  ["copy", "Intro copy", "textarea"],
  ["passwordLabel", "Password label"],
  ["showPasswordText", "Show password button"],
  ["hidePasswordText", "Hide password button"],
  ["submitButtonText", "Submit button"],
  ["busyButtonText", "Busy button"],
  ["emptyPasswordMessage", "Empty password message"],
  ["configMissingMessage", "Missing config message", "textarea"],
  ["acceptedButUnsavedMessage", "Accepted but unsaved message", "textarea"],
  ["enquiryPromptText", "Enquiry prompt"],
  ["enquiryButtonText", "Enquiry button"],
  ["enquiryEyebrow", "Enquiry modal eyebrow"],
  ["enquiryTitle", "Enquiry modal title"],
  ["closeButtonText", "Close button"],
  ["cancelButtonText", "Cancel button"],
  ["sendButtonText", "Send button"],
  ["sendingButtonText", "Sending button"],
  ["enquirySuccessMessage", "Enquiry success message", "textarea"],
];

function getPreviewCountdown(liveAt) {
  const target = liveAt ? new Date(liveAt) : new Date(DEFAULT_LAUNCH_SETTINGS.liveAt);
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));

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

function LaunchOverlayPreview({ launchCountdown, launchSettings }) {
  return (
    <main className={`${launchStyles.page} ${styles.launchPreviewPage}`}>
      <section className={launchStyles.panel}>
        <div className={launchStyles.brandRow}>
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" className={launchStyles.logo} />
          <span className={launchStyles.statusPill}>{launchSettings.statusPill}</span>
        </div>
        <div className={launchStyles.content}>
          <p className={launchStyles.eyebrow}>{launchSettings.eyebrow}</p>
          <h1>
            {launchSettings.headline} <em>{launchSettings.headlineAccent}</em>
          </h1>
          <p className={launchStyles.copy}>{launchSettings.copy}</p>
          <div className={launchStyles.countdown} aria-label="Preview countdown">
            <div>
              <strong>{launchCountdown.days}</strong>
              <span>Days</span>
            </div>
            <div>
              <strong>{pad(launchCountdown.hours)}</strong>
              <span>Hours</span>
            </div>
            <div>
              <strong>{pad(launchCountdown.minutes)}</strong>
              <span>Minutes</span>
            </div>
            <div>
              <strong>{pad(launchCountdown.seconds)}</strong>
              <span>Seconds</span>
            </div>
          </div>
          <div className={launchStyles.form}>
            <span className={launchStyles.label}>{launchSettings.passwordLabel}</span>
            <div className={launchStyles.passwordRow}>
              <input className={launchStyles.input} type="password" value="preview" readOnly />
              <button type="button" className={launchStyles.toggleButton}>
                {launchSettings.showPasswordText}
              </button>
            </div>
            <button type="button" className={launchStyles.submitButton}>
              {launchSettings.submitButtonText}
            </button>
          </div>
          <div className={launchStyles.enquiryPrompt}>
            <span>{launchSettings.enquiryPromptText}</span>
            <button type="button">{launchSettings.enquiryButtonText}</button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function AccountSettingsForm({ currentEmail }) {
  const [activeTab, setActiveTab] = useState("profile");
  const [email, setEmail] = useState(currentEmail || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [launchSettings, setLaunchSettings] = useState(DEFAULT_LAUNCH_SETTINGS);
  const [launchCountdown, setLaunchCountdown] = useState(getPreviewCountdown(DEFAULT_LAUNCH_SETTINGS.liveAt));
  const [emailStatus, setEmailStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [launchStatus, setLaunchStatus] = useState("");
  const [showLaunchPreview, setShowLaunchPreview] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [defaults, setDefaults] = useState(DEFAULT_BUSINESS_DEFAULTS);
  const [defaultsFeedback, setDefaultsFeedback] = useState("");
  const [defaultsBusy, setDefaultsBusy] = useState(false);

  const allowedAdminEmail = useMemo(() => getAllowedAdminEmailClient(), []);
  const accountLabel = email?.split("@")[0] || "Admin account";
  const accountInitials = accountLabel
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AD";

  useEffect(() => {
    fetch("/api/admin/launch-settings")
      .then((response) => response.json())
      .then((result) => {
        if (result?.settings) {
          setLaunchSettings({ ...DEFAULT_LAUNCH_SETTINGS, ...result.settings });
        } else if (result?.error) {
          setLaunchStatus(result.error);
        }
      })
      .catch((error) => setLaunchStatus(error?.message || "Could not load launch settings."));
  }, []);

  useEffect(() => {
    setLaunchCountdown(getPreviewCountdown(launchSettings.liveAt));
    const timer = window.setInterval(() => {
      setLaunchCountdown(getPreviewCountdown(launchSettings.liveAt));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [launchSettings.liveAt]);

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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/business-defaults", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (!cancelled && payload.ok) {
          setDefaults({ ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function updateDefault(field, value) {
    setDefaults((current) => ({ ...current, [field]: value }));
  }

  async function handleDefaultsSave(event) {
    event.preventDefault();
    setDefaultsFeedback("");
    setDefaultsBusy(true);
    try {
      const response = await fetch("/api/admin/business-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setDefaultsFeedback(payload.error || "Could not save business defaults.");
        return;
      }
      setDefaults({ ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults });
      setDefaultsFeedback("Business defaults saved.");
    } catch (error) {
      setDefaultsFeedback(error?.message || "Could not save business defaults.");
    } finally {
      setDefaultsBusy(false);
    }
  }

  function updateLaunchField(field, value) {
    setLaunchSettings((current) => ({ ...current, [field]: value }));
  }

  async function handleLaunchSettingsSave(event) {
    event.preventDefault();
    setLaunchStatus("");
    setLaunchBusy(true);

    try {
      const response = await fetch("/api/admin/launch-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: launchSettings }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Could not save launch settings.");
      }

      setLaunchSettings({ ...DEFAULT_LAUNCH_SETTINGS, ...result.settings });
      setLaunchStatus("Launch overlay settings saved.");
    } catch (error) {
      setLaunchStatus(error?.message || "Could not save launch settings.");
    } finally {
      setLaunchBusy(false);
    }
  }

  const launchPreviewModal =
    showLaunchPreview && typeof document !== "undefined"
      ? createPortal(
          <div className={styles.launchPreviewOverlay} role="dialog" aria-modal="true" aria-label="Website overlay preview">
            <button type="button" className={styles.launchPreviewCloseButton} onClick={() => setShowLaunchPreview(false)}>
              Close
            </button>
            <div className={styles.launchPreviewDialog}>
              <LaunchOverlayPreview launchCountdown={launchCountdown} launchSettings={launchSettings} />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
    <div className={styles.settingsWorkspace}>
      <aside className={styles.settingsSubnav} aria-label="Settings sections">
        <p className={styles.settingsSubnavEyebrow}>Settings</p>
        <h2>Account</h2>
        <button
          type="button"
          className={`${styles.settingsSubnavItem} ${activeTab === "profile" ? styles.settingsSubnavItemActive : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          <span className={styles.settingsSubnavIcon} aria-hidden="true">
            {accountInitials}
          </span>
          <span>
            <strong>My Profile</strong>
            <small>Name, email and password</small>
          </span>
        </button>
        <button
          type="button"
          className={`${styles.settingsSubnavItem} ${activeTab === "launch" ? styles.settingsSubnavItemActive : ""}`}
          onClick={() => setActiveTab("launch")}
        >
          <span className={styles.settingsSubnavIcon} aria-hidden="true">
            WO
          </span>
          <span>
            <strong>Website Overlay</strong>
            <small>Password gate, copy and countdown</small>
          </span>
        </button>
        <button
          type="button"
          className={`${styles.settingsSubnavItem} ${activeTab === "defaults" ? styles.settingsSubnavItemActive : ""}`}
          onClick={() => setActiveTab("defaults")}
        >
          <span className={styles.settingsSubnavIcon} aria-hidden="true">
            BD
          </span>
          <span>
            <strong>Business Defaults</strong>
            <small>GST, markup, labour and hardware costs</small>
          </span>
        </button>
      </aside>

      <section className={styles.settingsDetail}>
        <header className={styles.settingsDetailHeader}>
          <h2>
            {activeTab === "profile" ? "My Profile" : activeTab === "launch" ? "Website Overlay" : "Business Defaults"}
          </h2>
          <p>
            {activeTab === "profile"
              ? "Name, email and password"
              : activeTab === "launch"
              ? "Password gate, copy and countdown"
              : "Global calculation defaults for quotes, labour, markup, and hardware costs."}
          </p>
        </header>

        <div className={styles.settingsDetailBody}>
          {activeTab === "profile" ? (
            <>
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
                    <strong>Hidden</strong>
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
                    <p>Update the login password for this admin account. The website overlay uses this same password.</p>
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
            </>
          ) : activeTab === "launch" ? (
            <section className={styles.profileInfoCard}>
              <form className={styles.launchSettingsForm} onSubmit={handleLaunchSettingsSave}>
                <div className={styles.profileCardHeader}>
                  <div>
                    <h3>Password Protected Website Overlay</h3>
                    <p>Toggle the main website gate, edit overlay text, and preview the countdown state.</p>
                  </div>
                  <div className={styles.launchHeaderActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setShowLaunchPreview(true)}>
                      Show preview
                    </button>
                    <label className={styles.launchToggle}>
                      <input
                        type="checkbox"
                        checked={launchSettings.isActive}
                        onChange={(event) => updateLaunchField("isActive", event.target.checked)}
                      />
                      <span>{launchSettings.isActive ? "Active" : "Inactive"}</span>
                    </label>
                    <button type="submit" className={styles.primaryButton} disabled={launchBusy}>
                      {launchBusy ? "Saving..." : "Save overlay settings"}
                    </button>
                  </div>
                </div>

                {launchStatus ? <p className={styles.feedback}>{launchStatus}</p> : null}

                <div className={styles.launchSettingsGrid}>
                  <div className={styles.launchSettingsFields}>
                    <label className={styles.fieldLabel} htmlFor="launchLiveAt">
                      Live date and time
                    </label>
                    <input
                      id="launchLiveAt"
                      type="datetime-local"
                      className={styles.fieldInput}
                      value={launchSettings.liveAt}
                      onChange={(event) => updateLaunchField("liveAt", event.target.value)}
                    />

                    <div className={styles.launchTextGrid}>
                      {LAUNCH_TEXT_FIELDS.map(([field, label, type]) => (
                        <label key={field} className={styles.fieldLabel} htmlFor={`launch-${field}`}>
                          {label}
                          {type === "textarea" ? (
                            <textarea
                              id={`launch-${field}`}
                              className={styles.textareaInput}
                              value={launchSettings[field] || ""}
                              onChange={(event) => updateLaunchField(field, event.target.value)}
                            />
                          ) : (
                            <input
                              id={`launch-${field}`}
                              type="text"
                              className={styles.fieldInput}
                              value={launchSettings[field] || ""}
                              onChange={(event) => updateLaunchField(field, event.target.value)}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </form>
            </section>
          ) : (
            <section className={styles.profileInfoCard}>
              <form className={styles.defaultsForm} onSubmit={handleDefaultsSave}>
                <div className={styles.profileCardHeader}>
                  <div>
                    <h3>Quote Calculation Defaults</h3>
                    <p>These values are applied to new quote lines and cost fields. Existing quotes and per-line edits stay editable.</p>
                  </div>
                </div>
                <div className={styles.defaultsGrid}>
                  {DEFAULTS_FIELDS.map((field) => (
                    <label className={`${styles.fieldLabel} ${styles.defaultsField}`} key={field.key}>
                      {field.label}
                      <span className={styles.helperText}>{field.help}</span>
                      <div className={styles.inlineInputWithSuffix}>
                        {field.prefix ? <span>{field.prefix}</span> : null}
                        <input
                          className={styles.fieldInput}
                          type={field.type || "number"}
                          min={field.min ?? (field.type === "number" ? "0" : undefined)}
                          step={field.step ?? (field.type === "number" ? "0.01" : undefined)}
                          value={defaults[field.key] ?? ""}
                          onChange={(event) =>
                            updateDefault(field.key, field.transform === "uppercase" ? event.target.value.toUpperCase() : event.target.value)
                          }
                        />
                        {field.suffix ? <span>{field.suffix}</span> : null}
                      </div>
                    </label>
                  ))}
                </div>
                {defaultsFeedback ? <p className={styles.feedback}>{defaultsFeedback}</p> : null}
                <div className={styles.formActions}>
                  <button type="submit" className={styles.primaryButton} disabled={defaultsBusy}>
                    {defaultsBusy ? "Saving..." : "Save defaults"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </section>
    </div>
    {launchPreviewModal}
    </>
  );
}

