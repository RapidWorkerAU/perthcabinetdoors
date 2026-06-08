"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BUSINESS_DEFAULTS } from "../../../lib/pcd-quote-utils";
import styles from "../admin-shell.module.css";

const fields = [
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

export default function BusinessDefaultsManager() {
  const [defaults, setDefaults] = useState(DEFAULT_BUSINESS_DEFAULTS);
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadDefaults() {
      try {
        const response = await fetch("/api/admin/business-defaults", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && response.ok && payload.ok) {
          setDefaults({ ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults });
        }
      } catch (error) {
        if (!cancelled) setFeedback(error?.message || "Could not load business defaults.");
      }
    }
    loadDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateDefault(field, value) {
    setDefaults((current) => ({ ...current, [field]: value }));
  }

  async function saveDefaults(event) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/business-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not save business defaults.");
        return;
      }
      setDefaults({ ...DEFAULT_BUSINESS_DEFAULTS, ...payload.defaults });
      setFeedback("Business defaults saved.");
    } catch (error) {
      setFeedback(error?.message || "Could not save business defaults.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={styles.defaultsPanel}>
      <div className={styles.settingsDetailHeader}>
        <p className={styles.tableMeta}>Business defaults</p>
        <h2>Quote calculation defaults</h2>
        <p>
          These values are applied to new quote lines and quote cost fields. Existing quotes and per-line edits stay editable.
        </p>
      </div>

      <form className={`${styles.settingsDetailBody} ${styles.profileSettingsForm}`} onSubmit={saveDefaults}>
        <div className={styles.quoteBuilderGrid}>
          {fields.map((field) => (
            <label className={styles.fieldLabel} key={field.key}>
              {field.label}
              <span className={styles.helperText}>{field.help}</span>
              <div className={styles.inlineInputWithSuffix}>
                {field.prefix ? <span>{field.prefix}</span> : null}
                <input
                  className={styles.fieldInput}
                  type="number"
                  min="0"
                  step="0.01"
                  value={defaults[field.key] ?? ""}
                  onChange={(event) => updateDefault(field.key, event.target.value)}
                />
                {field.suffix ? <span>{field.suffix}</span> : null}
              </div>
            </label>
          ))}
        </div>

        {feedback ? <p className={styles.feedback}>{feedback}</p> : null}

        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save defaults"}
          </button>
        </div>
      </form>
    </section>
  );
}
