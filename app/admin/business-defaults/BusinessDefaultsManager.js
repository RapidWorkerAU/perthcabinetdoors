"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import AdminLoading from "@/components/admin/AdminLoading";

const FIELDS = [
  { group: "Labour", key: "labour_hours_per_cabinet", label: "Labour hours per cabinet", suffix: "h", step: "0.25", hint: "Added to quote labour for every base-cabinet line x qty." },
  { group: "Labour", key: "worker_hourly_rate", label: "Worker hourly rate", prefix: "$", step: "1", hint: "Ex GST. Multiplies total labour hours." },
  { group: "Pricing", key: "markup_percent", label: "Default markup", suffix: "%", step: "1", hint: "Applied to product cost on each line." },
  { group: "Pricing", key: "gst_rate", label: "GST rate", step: "0.01", hint: "As a decimal. 0.1 = 10%." },
  { group: "Hardware fees", key: "hinge_drilling_unit_cost_ex_gst", label: "Hinge drilling", prefix: "$", step: "0.5", hint: "Per hinge hole, ex GST. Supplied hinges are added as separate hardware line items." },
];

const GROUPS = ["Labour", "Pricing", "Hardware fees"];
const inputClass = "h-[36px] w-[110px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-right font-mono text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]";
const textareaClass = "min-h-[132px] w-full resize-y rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#1a1a18] outline-none focus:border-[#6b9e61]";

export default function BusinessDefaultsManager() {
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/business-defaults", { cache: "no-store" });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Could not load business defaults.");
        setForm(data.defaults);
      } catch (error) {
        toast({ title: error?.message || "Could not load business defaults.", variant: "error" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  function updateField(key, value) {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/business-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: form }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not save business defaults.");
      setForm(data.defaults);
      setSaved(true);
      toast({ title: "Business defaults saved." });
    } catch (error) {
      toast({ title: error?.message || "Could not save business defaults.", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AdminLoading steps={["Loading your defaults", "Almost there"]} label="Loading business defaults" />;
  }

  if (!form) {
    return <div className="p-4 text-[13px] text-[#b42318] md:p-6">No business defaults found.</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-bold text-[#1a1a18]">Business Defaults</h1>
        <p className="mt-[2px] max-w-[760px] text-[13px] leading-relaxed text-[#5a5a52]">
          Set the pricing, labour and quote text defaults used when quotes are created or recalculated.
        </p>
      </div>

      <div className="grid max-w-[980px] grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => (
            <div key={group} className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
              <div className="border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                {group}
              </div>
              <div className="divide-y divide-[#edf4eb]">
                {FIELDS.filter((field) => field.group === group).map((field) => (
                  <label key={field.key} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[#1a1a18]">{field.label}</span>
                      <span className="mt-[2px] block text-[11px] leading-snug text-[#8b8a81]">{field.hint}</span>
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1">
                      {field.prefix ? <span className="text-[12px] text-[#8b8a81]">{field.prefix}</span> : null}
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step={field.step}
                        value={form[field.key] ?? ""}
                        onChange={(event) => updateField(field.key, event.target.value === "" ? "" : Number(event.target.value))}
                      />
                      {field.suffix ? <span className="text-[12px] text-[#8b8a81]">{field.suffix}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
          <div className="border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">Quote terms</p>
          </div>
          <div className="p-4">
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
              Default terms text
              <textarea
                className={textareaClass}
                value={form.quote_terms || ""}
                onChange={(event) => updateField("quote_terms", event.target.value)}
                placeholder="Default terms shown on new quotes."
              />
            </label>
            <p className="mt-2 text-[11px] leading-snug text-[#8b8a81]">
              This auto-populates the quote editor terms field when a quote has no quote-specific terms yet.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button type="button" onClick={save} loading={saving} loadingText="Saving...">
          Save defaults
        </Button>
        {saved ? <span className="text-[13px] text-[#2d5e28]">Saved.</span> : null}
      </div>
    </div>
  );
}
