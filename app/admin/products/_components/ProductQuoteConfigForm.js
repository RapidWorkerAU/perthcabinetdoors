"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import styles from "../../admin-content.module.css";

const GROUP_KEYS = ["finish", "colour", "profileType", "profile", "edgeMould"];

function rulesToText(rules = []) {
  return rules
    .map(
      (rule) =>
        `${rule.finish || ""} | ${rule.profileType || ""} | ${rule.basePrice ?? 0} | ${rule.areaRate ?? 0} | ${
          rule.markup ?? 1
        }`
    )
    .join("\n");
}

function parseRules(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [finish, profileType, basePrice, areaRate, markup] = line.split("|").map((part) => part.trim());
      return {
        finish: finish || "",
        profileType: profileType || "",
        basePrice: Number(basePrice || 0),
        areaRate: Number(areaRate || 0),
        markup: Number(markup || 1),
      };
    });
}

function buildInitialState(initialConfig, fallbackConfig) {
  const fallback = fallbackConfig || {};
  return {
    is_enabled: initialConfig?.is_enabled ?? true,
    quote_title: initialConfig?.quote_title || fallback.quoteTitle || "Online Quotation Request",
    quote_description:
      initialConfig?.quote_description ||
      fallback.quoteDescription ||
      "Create a detailed quote request for this product.",
    finish_set_id: initialConfig?.finish_set_id || "",
    colour_set_id: initialConfig?.colour_set_id || "",
    profile_type_set_id: initialConfig?.profile_type_set_id || "",
    profile_set_id: initialConfig?.profile_set_id || "",
    edge_set_id: initialConfig?.edge_set_id || "",
    groups_json: initialConfig?.groups_json || fallback.groups || {},
    dimensions_json: initialConfig?.dimensions_json || fallback.dimensions || {},
    pricing_json: {
      ...(initialConfig?.pricing_json || fallback.pricing || {}),
      rules: rulesToText(initialConfig?.pricing_json?.rules || fallback.pricing?.rules || []),
    },
  };
}

export default function ProductQuoteConfigForm({
  product,
  initialConfig,
  initialOptionSets,
  fallbackConfig,
}) {
  const router = useRouter();
  const [form, setForm] = useState(buildInitialState(initialConfig, fallbackConfig));
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const optionSetsByKind = (kind) => initialOptionSets.filter((item) => item.kind === kind);

  function updateGroup(key, field, value) {
    setForm((current) => ({
      ...current,
      groups_json: {
        ...current.groups_json,
        [key]: {
          ...(current.groups_json[key] || {}),
          [field]: value,
        },
      },
    }));
  }

  function updateDimension(group, field, value) {
    setForm((current) => ({
      ...current,
      dimensions_json: {
        ...current.dimensions_json,
        [group]: {
          ...(current.dimensions_json[group] || {}),
          [field]: Number(value || 0),
        },
      },
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");

    try {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        product_id: product.id,
        is_enabled: form.is_enabled,
        quote_title: form.quote_title,
        quote_description: form.quote_description,
        finish_set_id: form.finish_set_id || null,
        colour_set_id: form.colour_set_id || null,
        profile_type_set_id: form.profile_type_set_id || null,
        profile_set_id: form.profile_set_id || null,
        edge_set_id: form.edge_set_id || null,
        hinge_set_id: null,
        groups_json: form.groups_json,
        dimensions_json: form.dimensions_json,
        pricing_json: {
          ...form.pricing_json,
          baseFee: Number(form.pricing_json.baseFee || 0),
          drillingFeePerHole: Number(form.pricing_json.drillingFeePerHole || 0),
          rules: parseRules(form.pricing_json.rules || ""),
        },
      };

      const { error } = await supabase.from("product_quote_configs").upsert(payload, { onConflict: "product_id" });

      if (error) {
        setFeedback(error.message || "Could not save quote configuration.");
        return;
      }

      setFeedback("Quote configuration saved.");
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative p-4 md:p-6 max-w-[1400px]">
      <form onSubmit={handleSave}>
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <div>
            <p className="text-[12px] font-medium text-[#8b8a81] mb-[2px]">{product.card_title || product.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/products/${product.id}/edit`}
              className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors flex items-center"
            >
              Product details
            </Link>
            <button
              type="submit"
              className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className={styles.editorLayout}>
          <div className={styles.editorMainColumn}>
            <section className={styles.editorCard}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(event) => setForm((current) => ({ ...current, is_enabled: event.target.checked }))}
                />
                Quote enabled for this product
              </label>

              <label className={styles.fieldLabel} htmlFor="quoteTitle">
                Quote title
              </label>
              <input
                id="quoteTitle"
                className={styles.fieldInput}
                value={form.quote_title}
                onChange={(event) => setForm((current) => ({ ...current, quote_title: event.target.value }))}
              />

              <label className={styles.fieldLabel} htmlFor="quoteDescription">
                Quote description
              </label>
              <textarea
                id="quoteDescription"
                className={styles.textareaInput}
                rows={4}
                value={form.quote_description}
                onChange={(event) => setForm((current) => ({ ...current, quote_description: event.target.value }))}
              />
            </section>

            <section className={styles.editorCard}>
              <h2 className={styles.sectionTitle}>Available Option Sets</h2>
              <div className={styles.configGrid}>
                <div>
                  <label className={styles.fieldLabel}>Finish set</label>
                  <select
                    className={styles.fieldInput}
                    value={form.finish_set_id}
                    onChange={(event) => setForm((current) => ({ ...current, finish_set_id: event.target.value }))}
                  >
                    <option value="">Select finish set</option>
                    {optionSetsByKind("finish").map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.fieldLabel}>Colour map</label>
                  <select
                    className={styles.fieldInput}
                    value={form.colour_set_id}
                    onChange={(event) => setForm((current) => ({ ...current, colour_set_id: event.target.value }))}
                  >
                    <option value="">Select colour map</option>
                    {optionSetsByKind("colour_map").map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.fieldLabel}>Profile type set</label>
                  <select
                    className={styles.fieldInput}
                    value={form.profile_type_set_id}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, profile_type_set_id: event.target.value }))
                    }
                  >
                    <option value="">Select profile type set</option>
                    {optionSetsByKind("profile_type").map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.fieldLabel}>Profile map</label>
                  <select
                    className={styles.fieldInput}
                    value={form.profile_set_id}
                    onChange={(event) => setForm((current) => ({ ...current, profile_set_id: event.target.value }))}
                  >
                    <option value="">Select profile map</option>
                    {optionSetsByKind("profile_map").map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.fieldLabel}>Edge set</label>
                  <select
                    className={styles.fieldInput}
                    value={form.edge_set_id}
                    onChange={(event) => setForm((current) => ({ ...current, edge_set_id: event.target.value }))}
                  >
                    <option value="">Select edge set</option>
                    {optionSetsByKind("edge_mould").map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className={styles.editorCard}>
              <h2 className={styles.sectionTitle}>Pricing Rules</h2>
              <p className={styles.sectionText}>
                One rule per line: `Finish | Profile Type | Base Price | Area Rate | Markup`. Leave profile type blank
                for products where profiles do not apply.
              </p>
              <div className={styles.configGrid}>
                <div>
                  <label className={styles.fieldLabel}>Base fee</label>
                  <input
                    type="number"
                    step="0.01"
                    className={styles.fieldInput}
                    value={form.pricing_json.baseFee ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pricing_json: { ...current.pricing_json, baseFee: event.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel}>Drilling fee per hole</label>
                  <input
                    type="number"
                    step="0.01"
                    className={styles.fieldInput}
                    value={form.pricing_json.drillingFeePerHole ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pricing_json: { ...current.pricing_json, drillingFeePerHole: event.target.value },
                      }))
                    }
                  />
                </div>
              </div>
              <textarea
                className={styles.textareaInput}
                rows={12}
                value={form.pricing_json.rules || ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    pricing_json: { ...current.pricing_json, rules: event.target.value },
                  }))
                }
              />
            </section>
          </div>

          <aside className={styles.editorSideColumn}>
            <section className={styles.editorCard}>
              <h2 className={styles.sectionTitle}>Field Availability</h2>
              {GROUP_KEYS.map((key) => {
                const group = form.groups_json[key] || {};
                return (
                  <div key={key} className={styles.groupConfigCard}>
                    <strong>{group.label || key}</strong>
                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={group.enabled ?? true}
                        onChange={(event) => updateGroup(key, "enabled", event.target.checked)}
                      />
                      Enabled
                    </label>
                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={group.required ?? false}
                        onChange={(event) => updateGroup(key, "required", event.target.checked)}
                      />
                      Required
                    </label>
                  </div>
                );
              })}
            </section>

            <section className={styles.editorCard}>
              <h2 className={styles.sectionTitle}>Dimensions</h2>
              {["width", "height", "qty", "hingeHoles", "hingesQty"].map((key) => (
                <div key={key} className={styles.dimensionRow}>
                  <strong className={styles.dimensionLabel}>{key}</strong>
                  <input
                    type="number"
                    className={styles.fieldInput}
                    value={form.dimensions_json[key]?.min ?? ""}
                    onChange={(event) => updateDimension(key, "min", event.target.value)}
                    placeholder="Min"
                  />
                  <input
                    type="number"
                    className={styles.fieldInput}
                    value={form.dimensions_json[key]?.max ?? ""}
                    onChange={(event) => updateDimension(key, "max", event.target.value)}
                    placeholder="Max"
                  />
                </div>
              ))}
            </section>
          </aside>
        </div>

        {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
      </form>
    </div>
  );
}

