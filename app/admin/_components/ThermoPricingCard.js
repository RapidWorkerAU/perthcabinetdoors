"use client";

// THE THERMOLAMINATE RATE CARD, in Settings.
//
// Everything the quote editor prices a Polytec thermolaminate piece from: the
// size steps, the rates for each profile category, and the charges for each
// finish tier. When Polytec changes its prices, this is the only thing that
// changes. See lib/pcd-thermo-pricing.js for what each number does.
//
// "Try a size" prices any piece with the numbers on screen, saved or not, so a
// change can be checked against the portal before it reaches a quote.

import { useEffect, useMemo, useState } from "react";
import AdminLoading from "@/components/admin/AdminLoading";
import {
  DEFAULT_THERMO_RATE_CARD,
  THERMO_CATEGORIES,
  normalizeThermoRateCard,
  priceThermoLine,
} from "../../../lib/pcd-thermo-pricing";

const tw = {
  card: "overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white mb-4",
  head: "border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] flex items-center justify-between gap-3",
  row: "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 border-b border-[#f3f1ea] last:border-b-0",
  rowLabel: "block text-[13px] font-medium text-[#1a1a18]",
  rowHint: "mt-[2px] block text-[11px] leading-snug text-[#8b8a81]",
  num: "h-[32px] w-[88px] rounded-[6px] border border-[#dbd8cc] bg-white px-2 text-right font-mono text-[12px] text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  text: "h-[32px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-2 text-[12px] text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  select: "h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-2 text-[12px] text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  th: "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] border-b border-[#edf4eb] bg-[#fbfbf8]",
  td: "px-3 py-2 align-top text-[12px] text-[#1a1a18] border-b border-[#f3f1ea]",
  btn: "h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50",
  primary: "h-[36px] rounded-[6px] border border-[#1c2b1e] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50",
  note: "m-0 border-t border-[#edf4eb] bg-[#fffdf0] px-4 py-[11px] text-[12px] leading-[1.5] text-[#8a6d0b]",
  pill: "inline-flex items-center rounded-full border border-[#a8c5a0] bg-[#edf4eb] px-[9px] py-[2px] text-[11px] text-[#2d5e28]",
};

const money = (v) => `$${(Number(v) || 0).toFixed(2)}`;
const deepCopy = (v) => JSON.parse(JSON.stringify(v));

export default function ThermoPricingCard() {
  const [card, setCard] = useState(null);
  const [source, setSource] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [trial, setTrial] = useState({ category: "Minimal", finish: "Smooth", height: "720", width: "450", portal: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/thermo-pricing", { cache: "no-store" });
        const payload = await res.json();
        if (cancelled) return;
        if (!payload.ok) throw new Error(payload.error || "Could not load the rate card.");
        setSource(payload.source);
        setUpdatedAt(payload.updatedAt);
        setLoadError(payload.error || "");
        // Unavailable still shows the measured rates so they can be read, but
        // says clearly that nothing is being priced from them.
        setCard(deepCopy(payload.card || normalizeThermoRateCard(DEFAULT_THERMO_RATE_CARD)));
      } catch (error) {
        if (!cancelled) setLoadError(error?.message || "Could not load the rate card.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const clean = useMemo(() => (card ? normalizeThermoRateCard(card) : null), [card]);
  const allFinishes = useMemo(() => (clean ? clean.finish_tiers.flatMap((t) => t.finishes) : []), [clean]);
  const trialResult = useMemo(() => {
    if (!clean) return null;
    return priceThermoLine({
      product_type: "Door", material: "Thermolaminate", supplier_name: clean.supplier, thickness: `${clean.thickness_mm}mm`,
      profile_type: trial.category, finish: trial.finish, height_mm: Number(trial.height), width_mm: Number(trial.width),
    }, clean);
  }, [clean, trial]);

  function set(path, value) {
    setCard((current) => {
      const next = deepCopy(current);
      let target = next;
      for (let i = 0; i < path.length - 1; i += 1) {
        if (target[path[i]] === null || typeof target[path[i]] !== "object") target[path[i]] = {};
        target = target[path[i]];
      }
      target[path[path.length - 1]] = value;
      return next;
    });
    setMessage("");
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/thermo-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || "Could not save the rate card.");
      setCard(deepCopy(payload.card));
      setSource(payload.source);
      setUpdatedAt(payload.updatedAt);
      setLoadError("");
      setMessage("Rate card saved. New thermolaminate lines price from it straight away; press Reprice on an existing quote to bring it up to date.");
    } catch (error) {
      setMessage(error?.message || "Could not save the rate card.");
    } finally {
      setBusy(false);
    }
  }

  function resetToMeasured() {
    setCard(deepCopy(normalizeThermoRateCard(DEFAULT_THERMO_RATE_CARD)));
    setMessage("The rates measured from the portal on 27 September 2026 are back on screen. Save to use them.");
  }

  if (!card) {
    if (!loadError) return <AdminLoading steps={["Reading the rate card", "Almost there"]} label="Loading the thermolaminate rate card" />;
    return (
      <div className={tw.card}>
        <div className={tw.head}>Thermolaminate Pricing</div>
        <p className="m-0 px-4 py-4 text-[13px] text-[#991b1b]">{loadError}</p>
      </div>
    );
  }

  const sourceText = source === "saved"
    ? `Saved${updatedAt ? ` ${new Date(updatedAt).toLocaleDateString("en-AU")}` : ""}`
    : source === "measured"
      ? "Using the rates measured from the portal (not saved yet)"
      : "Not available";

  return (
    <div>
      {loadError && <p className="mb-4 rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-[12px] text-[#991b1b]">{loadError} Until then no thermolaminate line is priced automatically.</p>}

      {/* General */}
      <div className={tw.card}>
        <div className={tw.head}>
          <span>Polytec Thermolaminate Rate Card</span>
          <span className={tw.pill}>{sourceText}</span>
        </div>
        <div className={tw.row}>
          <div>
            <span className={tw.rowLabel}>Our margin</span>
            <span className={tw.rowHint}>Written into the markup of every thermolaminate line when it is priced. You can still change it on a line.</span>
          </div>
          <div className="flex items-center gap-2"><input className={tw.num} value={card.margin_percent} onChange={(e) => set(["margin_percent"], e.target.value)} /><span className="text-[12px] text-[#8b8a81]">%</span></div>
        </div>
        <div className={tw.row}>
          <div>
            <span className={tw.rowLabel}>Safety margin on cost</span>
            <span className={tw.rowHint}>Added to the calculated Polytec cost before our margin. The rates match the portal to within 0.1% on average, so this can stay at 0.</span>
          </div>
          <div className="flex items-center gap-2"><input className={tw.num} value={card.safety_percent} onChange={(e) => set(["safety_percent"], e.target.value)} /><span className="text-[12px] text-[#8b8a81]">%</span></div>
        </div>
        <div className={tw.row}>
          <div>
            <span className={tw.rowLabel}>Prices effective from</span>
            <span className={tw.rowHint}>When these rates were checked against the portal. Update it when you change them.</span>
          </div>
          <input type="date" className={`${tw.num} w-[150px] text-left`} value={card.effective_from} onChange={(e) => set(["effective_from"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div>
            <span className={tw.rowLabel}>What is priced</span>
            <span className={tw.rowHint}>Polytec, {clean.thickness_mm}mm, the four profile categories below. 21mm, Fluted, other suppliers, facias under {clean.facia_below_mm}mm and anything over the largest step are priced by hand, and the line says so.</span>
          </div>
        </div>
      </div>

      {/* Try a size */}
      <div className={tw.card}>
        <div className={tw.head}>Try a Size</div>
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="flex flex-col gap-1 text-[11px] text-[#5a5a52]">Category
            <select className={tw.select} value={trial.category} onChange={(e) => setTrial({ ...trial, category: e.target.value })}>
              {THERMO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5a5a52]">Finish
            <select className={tw.select} value={trial.finish} onChange={(e) => setTrial({ ...trial, finish: e.target.value })}>
              {allFinishes.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5a5a52]">Height mm
            <input className={tw.num} value={trial.height} onChange={(e) => setTrial({ ...trial, height: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5a5a52]">Width mm
            <input className={tw.num} value={trial.width} onChange={(e) => setTrial({ ...trial, width: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5a5a52]">Portal price (optional)
            <input className={tw.num} value={trial.portal} placeholder="0.00" onChange={(e) => setTrial({ ...trial, portal: e.target.value })} />
          </label>
        </div>
        <div className="border-t border-[#edf4eb] px-4 py-3 text-[12px] text-[#1a1a18]">
          {trialResult?.ok ? (
            <div className="flex flex-col gap-1">
              <div><strong>Polytec cost {money(trialResult.unitCost)}</strong>, sell {money(trialResult.unitCost * (1 + (Number(clean.margin_percent) || 0) / 100))} at {clean.margin_percent}% margin, ex GST.</div>
              <div className="text-[#5a5a52]">
                Charged as {trialResult.chargedHeight} x {trialResult.chargedWidth} ({trialResult.tierLabel}).
                Per piece {money(trialResult.parts.per_piece)}, edges {money(trialResult.parts.edge)}, area {money(trialResult.parts.area)}
                {trialResult.parts.tall_steps ? `, tall ${money(trialResult.parts.tall)} (${trialResult.parts.tall_steps} steps above ${clean.tall_above_mm})` : ""}
                {trialResult.surcharge ? `, full width surcharge x ${clean.full_width.factor}` : ""}.
              </div>
              {Number(trial.portal) > 0 && (
                <div className={Math.abs(trialResult.unitCost - Number(trial.portal)) / Number(trial.portal) > 0.01 ? "text-[#991b1b]" : "text-[#2d5e28]"}>
                  Portal {money(trial.portal)}: the rate card is {money(Math.abs(trialResult.unitCost - Number(trial.portal)))} {trialResult.unitCost >= Number(trial.portal) ? "over" : "under"} ({(((trialResult.unitCost - Number(trial.portal)) / Number(trial.portal)) * 100).toFixed(2)}%).
                </div>
              )}
            </div>
          ) : (
            <span className="text-[#8a6d0b]">{trialResult?.reason || "Enter a size."}</span>
          )}
        </div>
      </div>

      {/* Category rates */}
      <div className={tw.card}>
        <div className={tw.head}>Category Rates</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr>
              <th className={tw.th}>Category</th>
              <th className={tw.th}>Edge, per metre of height + width</th>
              <th className={tw.th}>Area, per m2</th>
              <th className={tw.th}>Each height step above {clean.tall_above_mm}</th>
            </tr></thead>
            <tbody>
              {THERMO_CATEGORIES.map((cat) => (
                <tr key={cat}>
                  <td className={tw.td}>{cat}</td>
                  {["edge_per_m", "area_per_sqm", "tall_step"].map((field) => (
                    <td key={field} className={tw.td}><input className={tw.num} value={card.categories?.[cat]?.[field] ?? ""} onChange={(e) => set(["categories", cat, field], e.target.value)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={tw.note}>These are the Smooth rates. Each finish tier below scales them by its rate factor and has its own charge per piece.</p>
      </div>

      {/* Finish tiers */}
      <div className={tw.card}>
        <div className={tw.head}>Finish Tiers</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr>
              <th className={tw.th}>Tier and its finishes</th>
              {THERMO_CATEGORIES.map((cat) => <th key={cat} className={tw.th}>{cat}: per piece / rate factor</th>)}
            </tr></thead>
            <tbody>
              {card.finish_tiers.map((tier, i) => (
                <tr key={tier.key}>
                  <td className={`${tw.td} min-w-[200px]`}>
                    <input className={`${tw.text} mb-1 font-medium`} value={tier.label} onChange={(e) => set(["finish_tiers", i, "label"], e.target.value)} />
                    <input className={tw.text} value={Array.isArray(tier.finishes) ? tier.finishes.join(", ") : tier.finishes} onChange={(e) => set(["finish_tiers", i, "finishes"], e.target.value)} />
                    <span className={tw.rowHint}>Finish names as they are in the colour library, separated by commas.</span>
                  </td>
                  {THERMO_CATEGORIES.map((cat) => {
                    const cell = card.tier_rates?.[tier.key]?.[cat];
                    return (
                      <td key={cat} className={tw.td}>
                        {cell ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1"><span className="text-[11px] text-[#8b8a81]">$</span><input className={tw.num} value={cell.per_piece} onChange={(e) => set(["tier_rates", tier.key, cat, "per_piece"], e.target.value)} /></div>
                            <div className="flex items-center gap-1"><span className="text-[11px] text-[#8b8a81]">x</span><input className={tw.num} value={cell.rate_factor} onChange={(e) => set(["tier_rates", tier.key, cat, "rate_factor"], e.target.value)} /></div>
                            <button type="button" className="text-left text-[11px] text-[#8b8a81] hover:underline" onClick={() => set(["tier_rates", tier.key, cat], null)}>Not made in this finish</button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-[#8b8a81]">Not made</span>
                            <button type="button" className="text-left text-[11px] text-[#2d5e28] hover:underline" onClick={() => set(["tier_rates", tier.key, cat], { per_piece: 0, rate_factor: 1 })}>It is made: add rates</button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sizes and surcharges */}
      <div className={tw.card}>
        <div className={tw.head}>Size Steps and Surcharges</div>
        <div className={tw.row}>
          <div className="min-w-[240px] flex-1">
            <span className={tw.rowLabel}>Height steps (mm)</span>
            <span className={tw.rowHint}>A piece is charged at the next height up. The last one is the tallest priced automatically.</span>
          </div>
          <input className={`${tw.text} max-w-[420px]`} value={Array.isArray(card.height_steps_mm) ? card.height_steps_mm.join(", ") : card.height_steps_mm} onChange={(e) => set(["height_steps_mm"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div className="min-w-[240px] flex-1">
            <span className={tw.rowLabel}>Width steps (mm)</span>
            <span className={tw.rowHint}>The first is the narrowest a piece is charged at. The last is the widest priced automatically.</span>
          </div>
          <input className={`${tw.text} max-w-[420px]`} value={Array.isArray(card.width_steps_mm) ? card.width_steps_mm.join(", ") : card.width_steps_mm} onChange={(e) => set(["width_steps_mm"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div><span className={tw.rowLabel}>Tall charge starts above (mm)</span><span className={tw.rowHint}>Each height step above this adds the category&apos;s tall charge.</span></div>
          <input className={tw.num} value={card.tall_above_mm} onChange={(e) => set(["tall_above_mm"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div><span className={tw.rowLabel}>Facia under (mm)</span><span className={tw.rowHint}>Narrower than this in either direction, Polytec makes it as a facia, which is priced by hand.</span></div>
          <input className={tw.num} value={card.facia_below_mm} onChange={(e) => set(["facia_below_mm"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div><span className={tw.rowLabel}>Full width surcharge</span><span className={tw.rowHint}>A piece charged at this width, from this height up, costs this many times the formula.</span></div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#5a5a52]">
            width <input className={tw.num} value={card.full_width?.width_mm ?? ""} onChange={(e) => set(["full_width", "width_mm"], e.target.value)} />
            from height <input className={tw.num} value={card.full_width?.from_height_mm ?? ""} onChange={(e) => set(["full_width", "from_height_mm"], e.target.value)} />
            x <input className={tw.num} value={card.full_width?.factor ?? ""} onChange={(e) => set(["full_width", "factor"], e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {message && <span className="text-[12px] text-[#5a5a52]">{message}</span>}
        <button type="button" className={tw.btn} onClick={resetToMeasured} disabled={busy}>Back to the measured rates</button>
        <button type="button" className={tw.primary} onClick={save} disabled={busy || source === "unavailable"}>{busy ? "Saving..." : "Save rate card"}</button>
      </div>
    </div>
  );
}
