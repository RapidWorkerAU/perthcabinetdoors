"use client";

import { useEffect, useState } from "react";

// Edits the business-defaults singleton (/api/admin/business-defaults) — the
// pricing/labour/hardware-fee assumptions every quote inherits. Previously these
// could only be changed in the DB; this is the UI for them (audit p2-6).

const wrap = { maxWidth: 720, margin: "0 auto", padding: "8px 4px 60px" };
const card = { background: "#fff", border: "1px solid #e6e2d8", borderRadius: 10, padding: "18px 20px", marginBottom: 18 };
const groupTitle = { fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8780", margin: "2px 0 12px" };
const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid #f0ede5" };
const labelWrap = { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 };
const labelText = { fontSize: 13, color: "#1c1c1a" };
const hintText = { fontSize: 11, color: "#8a8780", lineHeight: 1.35 };
const inputBox = { display: "flex", alignItems: "center", border: "1px solid #d8d3c8", borderRadius: 7, overflow: "hidden", background: "#fff", flexShrink: 0 };
const affix = { padding: "0 9px", fontSize: 12, color: "#8a8780", background: "#f7f5ef", alignSelf: "stretch", display: "flex", alignItems: "center" };
const numInput = { width: 90, padding: "7px 9px", border: "none", outline: "none", font: "inherit", fontVariantNumeric: "tabular-nums", textAlign: "right", background: "#fff" };
const btnPrimary = { padding: "9px 18px", borderRadius: 8, border: "1px solid #2f5d8f", background: "#2f5d8f", color: "#fff", cursor: "pointer", font: "inherit", fontSize: 14, fontWeight: 600 };

// Only the fields the business-defaults row actually stores.
const FIELDS = [
  { group: "Labour", key: "labour_hours_per_cabinet", label: "Labour hours per cabinet", suffix: "h", step: "0.25", hint: "Added to the quote's labour for every base-cabinet line × its qty." },
  { group: "Labour", key: "worker_hourly_rate", label: "Worker hourly rate", prefix: "$", step: "1", hint: "Ex GST. Multiplies the total labour hours." },
  { group: "Pricing", key: "markup_percent", label: "Default markup", suffix: "%", step: "1", hint: "Applied to product cost on each line." },
  { group: "Pricing", key: "gst_rate", label: "GST rate", step: "0.01", hint: "As a decimal — 0.1 = 10%." },
  { group: "Hardware fees", key: "hinge_drilling_unit_cost_ex_gst", label: "Hinge drilling", prefix: "$", step: "0.5", hint: "Per hinge, ex GST." },
  { group: "Hardware fees", key: "hinge_supply_unit_cost_ex_gst", label: "Hinge supply", prefix: "$", step: "0.5", hint: "Per hinge, ex GST." },
];
const GROUPS = ["Labour", "Pricing", "Hardware fees"];

export default function BusinessDefaultsManager() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true); setError("");
      try {
        const res = await fetch("/api/admin/business-defaults", { cache: "no-store" });
        const data = await res.json();
        if (data.ok) setForm(data.defaults);
        else setError(data.error || "Could not load business defaults.");
      } catch {
        setError("Could not load business defaults.");
      } finally { setLoading(false); }
    })();
  }, []);

  function set(key, value) {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/admin/business-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: form }),
      });
      const data = await res.json();
      if (data.ok) { setForm(data.defaults); setSaved(true); }
      else setError(data.error || "Could not save.");
    } catch {
      setError("Could not save business defaults.");
    } finally { setSaving(false); }
  }

  if (loading) return <div style={wrap}><p style={{ color: "#8a8780" }}>Loading…</p></div>;
  if (!form) return <div style={wrap}><p style={{ color: "#b44230" }}>{error || "No defaults."}</p></div>;

  return (
    <div style={wrap}>
      <p style={{ fontSize: 13, color: "#6b6a63", margin: "0 0 16px", lineHeight: 1.5 }}>
        The pricing, labour and hardware-fee assumptions every new quote starts from. Existing quotes keep whatever was
        saved on them; changing these only affects quotes calculated after the change.
      </p>

      {GROUPS.map((g) => (
        <div key={g} style={card}>
          <div style={groupTitle}>{g}</div>
          {FIELDS.filter((f) => f.group === g).map((f) => (
            <div key={f.key} style={{ ...row, ...(f === FIELDS.filter((x) => x.group === g).at(-1) ? { borderBottom: "none", paddingBottom: 0 } : {}) }}>
              <div style={labelWrap}>
                <span style={labelText}>{f.label}</span>
                {f.hint && <span style={hintText}>{f.hint}</span>}
              </div>
              <div style={inputBox}>
                {f.prefix && <span style={affix}>{f.prefix}</span>}
                <input
                  style={numInput}
                  type="number"
                  min="0"
                  step={f.step}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))}
                />
                {f.suffix && <span style={affix}>{f.suffix}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button type="button" style={btnPrimary} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save defaults"}
        </button>
        {saved && <span style={{ fontSize: 13, color: "#2f7a4d" }}>Saved.</span>}
        {error && <span style={{ fontSize: 13, color: "#b44230" }}>{error}</span>}
      </div>
    </div>
  );
}
