"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { FieldGrid, FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";

const GROUP_KEYS = ["finish", "colour", "profileType", "profile", "edgeMould"];

const selectClass = "h-10 w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[14px] text-[#1a1a18] outline-none transition-colors focus:border-[#6b9e61] disabled:cursor-not-allowed disabled:bg-[#f5f5f4] disabled:text-[#8b8a81]";

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

function CheckboxRow({ children, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#1a1a18]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[#6b9e61]" />
      {children}
    </label>
  );
}

export default function ProductQuoteConfigForm({
  product,
  initialConfig,
  initialOptionSets,
  fallbackConfig,
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState(buildInitialState(initialConfig, fallbackConfig));
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
        toast({ title: error.message || "Could not save quote configuration.", variant: "error" });
        return;
      }

      toast({ title: "Quote configuration saved.", variant: "success" });
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative max-w-[1400px] p-4 md:p-6">
      <form onSubmit={handleSave}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-[2px] text-[12px] font-medium text-[#8b8a81]">{product.card_title || product.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/products/${product.id}/edit`}
              className="inline-flex h-9 items-center rounded-[6px] border border-[#dbd8cc] bg-white px-4 text-[13px] font-medium text-[#1a1a18] transition-colors hover:bg-[#f5f8f4]"
            >
              Product details
            </Link>
            <Button type="submit" size="sm" loading={isSaving} loadingText="Saving...">
              Save
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-5">
            <FormSection>
              <div className="mb-4">
                <CheckboxRow
                  checked={form.is_enabled}
                  onChange={(value) => setForm((current) => ({ ...current, is_enabled: value }))}
                >
                  Quote enabled for this product
                </CheckboxRow>
              </div>

              <FieldGrid>
                <Input
                  label="Quote title"
                  value={form.quote_title}
                  onChange={(event) => setForm((current) => ({ ...current, quote_title: event.target.value }))}
                />
                <Textarea
                  label="Quote description"
                  rows={4}
                  value={form.quote_description}
                  onChange={(event) => setForm((current) => ({ ...current, quote_description: event.target.value }))}
                  containerClassName="md:col-span-2"
                />
              </FieldGrid>
            </FormSection>

            <FormSection title="Available Option Sets">
              <FieldGrid>
                <label className="text-[13px] font-medium text-[#1a1a18]">
                  <span className="mb-1 block">Finish set</span>
                  <select
                    className={selectClass}
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
                </label>
                <label className="text-[13px] font-medium text-[#1a1a18]">
                  <span className="mb-1 block">Colour map</span>
                  <select
                    className={selectClass}
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
                </label>
                <label className="text-[13px] font-medium text-[#1a1a18]">
                  <span className="mb-1 block">Profile type set</span>
                  <select
                    className={selectClass}
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
                </label>
                <label className="text-[13px] font-medium text-[#1a1a18]">
                  <span className="mb-1 block">Profile map</span>
                  <select
                    className={selectClass}
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
                </label>
                <label className="text-[13px] font-medium text-[#1a1a18]">
                  <span className="mb-1 block">Edge set</span>
                  <select
                    className={selectClass}
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
                </label>
              </FieldGrid>
            </FormSection>

            <FormSection
              title="Pricing Rules"
              description="One rule per line: Finish | Profile Type | Base Price | Area Rate | Markup. Leave profile type blank for products where profiles do not apply."
            >
              <FieldGrid>
                <Input
                  label="Base fee"
                  type="number"
                  step="0.01"
                  value={form.pricing_json.baseFee ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pricing_json: { ...current.pricing_json, baseFee: event.target.value },
                    }))
                  }
                />
                <Input
                  label="Drilling fee per hole"
                  type="number"
                  step="0.01"
                  value={form.pricing_json.drillingFeePerHole ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pricing_json: { ...current.pricing_json, drillingFeePerHole: event.target.value },
                    }))
                  }
                />
                <Textarea
                  label="Rules"
                  rows={12}
                  value={form.pricing_json.rules || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pricing_json: { ...current.pricing_json, rules: event.target.value },
                    }))
                  }
                  containerClassName="md:col-span-2"
                />
              </FieldGrid>
            </FormSection>
          </div>

          <aside className="flex flex-col gap-5">
            <FormSection title="Field Availability">
              <div className="flex flex-col gap-3">
                {GROUP_KEYS.map((key) => {
                  const group = form.groups_json[key] || {};
                  return (
                    <div key={key} className="rounded-[8px] border border-[#edf4eb] bg-[#f5f8f4] p-3">
                      <strong className="mb-2 block text-[13px] font-semibold text-[#1a1a18]">{group.label || key}</strong>
                      <div className="flex flex-col gap-2">
                        <CheckboxRow checked={group.enabled ?? true} onChange={(value) => updateGroup(key, "enabled", value)}>
                          Enabled
                        </CheckboxRow>
                        <CheckboxRow checked={group.required ?? false} onChange={(value) => updateGroup(key, "required", value)}>
                          Required
                        </CheckboxRow>
                      </div>
                    </div>
                  );
                })}
              </div>
            </FormSection>

            <FormSection title="Dimensions">
              <div className="flex flex-col gap-3">
                {["width", "height", "qty", "hingeHoles", "hingesQty"].map((key) => (
                  <div key={key} className="grid grid-cols-[90px_1fr_1fr] items-center gap-2">
                    <strong className="text-[12px] font-semibold text-[#5a5a52]">{key}</strong>
                    <input
                      type="number"
                      className={selectClass}
                      value={form.dimensions_json[key]?.min ?? ""}
                      onChange={(event) => updateDimension(key, "min", event.target.value)}
                      placeholder="Min"
                    />
                    <input
                      type="number"
                      className={selectClass}
                      value={form.dimensions_json[key]?.max ?? ""}
                      onChange={(event) => updateDimension(key, "max", event.target.value)}
                      placeholder="Max"
                    />
                  </div>
                ))}
              </div>
            </FormSection>
          </aside>
        </div>
      </form>
    </div>
  );
}
