"use client";

// THE POLYTEC DECORATIVE BOARD RATE CARD, in Settings.
//
// What the web shop prices every decorative board piece from: what Polytec
// charges to make it, worked out from the colour's board cost, plus our
// margin. When Polytec changes its prices, this is the only thing that
// changes. See lib/pcd-polytec-board-pricing.js for what each number does.
//
// "Try a size" prices any piece with the numbers on screen, saved or not, so a
// change can be checked against the portal before it reaches the shop.

import { useEffect, useMemo, useState } from "react";
import AdminLoading from "@/components/admin/AdminLoading";
import {
  DEFAULT_POLYTEC_BOARD_CARD,
  normalizePolytecBoardCard,
  pricePolytecBoardPiece,
} from "../../../lib/pcd-polytec-board-pricing";

const tw = {
  card: "overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white mb-4",
  head: "border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] flex items-center justify-between gap-3",
  row: "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 border-b border-[#f3f1ea] last:border-b-0",
  rowLabel: "block text-[13px] font-medium text-[#1a1a18]",
  rowHint: "mt-[2px] block text-[11px] leading-snug text-[#8b8a81]",
  num: "h-[32px] w-[88px] rounded-[6px] border border-[#dbd8cc] bg-white px-2 text-right font-mono text-[12px] text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  text: "h-[32px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-2 text-[12px] text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  btn: "h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50",
  primary: "h-[36px] rounded-[6px] border border-[#1c2b1e] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50",
  note: "m-0 border-t border-[#edf4eb] bg-[#fffdf0] px-4 py-[11px] text-[12px] leading-[1.5] text-[#8a6d0b]",
  pill: "inline-flex items-center rounded-full border border-[#a8c5a0] bg-[#edf4eb] px-[9px] py-[2px] text-[11px] text-[#2d5e28]",
};

const money = (v) => `$${(Number(v) || 0).toFixed(2)}`;
const deepCopy = (v) => JSON.parse(JSON.stringify(v));
const listText = (v) => (Array.isArray(v) ? v.join(", ") : v);

export default function PolytecBoardPricingCard() {
  const [card, setCard] = useState(null);
  const [source, setSource] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [trial, setTrial] = useState({ rate: "60.74", thickness: "16mm", finish: "Matt", height: "580", width: "340", portal: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/polytec-board-pricing", { cache: "no-store" });
        const payload = await res.json();
        if (cancelled) return;
        if (!payload.ok) throw new Error(payload.error || "Could not load the rate card.");
        setSource(payload.source);
        setUpdatedAt(payload.updatedAt);
        setLoadError(payload.error || "");
        // Unavailable still shows the measured figures so they can be read, but
        // says clearly that nothing is being priced from them.
        setCard(deepCopy(payload.card || normalizePolytecBoardCard(DEFAULT_POLYTEC_BOARD_CARD)));
      } catch (error) {
        if (!cancelled) setLoadError(error?.message || "Could not load the rate card.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const clean = useMemo(() => (card ? normalizePolytecBoardCard(card) : null), [card]);
  const trialResult = useMemo(() => {
    if (!clean) return null;
    return pricePolytecBoardPiece(
      { height_mm: Number(trial.height), width_mm: Number(trial.width), thickness: trial.thickness, finish: trial.finish },
      clean,
      Number(trial.rate)
    );
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

  function addFinishFactor() {
    set(["finish_factors"], [...(card.finish_factors || []), { thickness: "", finishes: "", factor: 1 }]);
  }

  function removeFinishFactor(index) {
    set(["finish_factors"], (card.finish_factors || []).filter((_, i) => i !== index));
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/polytec-board-pricing", {
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
      setMessage("Rate card saved. The shop prices from it straight away.");
    } catch (error) {
      setMessage(error?.message || "Could not save the rate card.");
    } finally {
      setBusy(false);
    }
  }

  function resetToMeasured() {
    setCard(deepCopy(normalizePolytecBoardCard(DEFAULT_POLYTEC_BOARD_CARD)));
    setMessage("The figures measured from the portal in October 2026 are back on screen. Save to use them.");
  }

  if (!card) {
    if (!loadError) return <AdminLoading steps={["Reading the rate card", "Almost there"]} label="Loading the decorative board rate card" />;
    return (
      <div className={tw.card}>
        <div className={tw.head}>Decorative Board Pricing</div>
        <p className="m-0 px-4 py-4 text-[13px] text-[#991b1b]">{loadError}</p>
      </div>
    );
  }

  const sourceText = source === "saved"
    ? `Saved${updatedAt ? ` ${new Date(updatedAt).toLocaleDateString("en-AU")}` : ""}`
    : source === "measured"
      ? "Using the figures measured from the portal (not saved yet)"
      : "Not available";
  const margin = Number(clean.margin_percent) || 0;

  return (
    <div>
      {loadError && <p className="mb-4 rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-[12px] text-[#991b1b]">{loadError} Until then every decorative board piece on the shop goes to the quote list.</p>}

      <div className={tw.card}>
        <div className={tw.head}>
          <span>Polytec Decorative Board Rate Card</span>
          <span className={tw.pill}>{sourceText}</span>
        </div>
        <div className={tw.row}>
          <div>
            <span className={tw.rowLabel}>Our margin</span>
            <span className={tw.rowHint}>Added to what Polytec charges for every decorative board piece sold on the shop. Hinges keep the Business Defaults markup.</span>
          </div>
          <div className="flex items-center gap-2"><input className={tw.num} value={card.margin_percent} onChange={(e) => set(["margin_percent"], e.target.value)} /><span className="text-[12px] text-[#8b8a81]">%</span></div>
        </div>
        <div className={tw.row}>
          <div>
            <span className={tw.rowLabel}>Safety margin on cost</span>
            <span className={tw.rowHint}>Added to the calculated Polytec price before our margin. The figures match the portal to within 0.05%, so this can stay at 0.</span>
          </div>
          <div className="flex items-center gap-2"><input className={tw.num} value={card.safety_percent} onChange={(e) => set(["safety_percent"], e.target.value)} /><span className="text-[12px] text-[#8b8a81]">%</span></div>
        </div>
        <div className={tw.row}>
          <div>
            <span className={tw.rowLabel}>Prices effective from</span>
            <span className={tw.rowHint}>When these figures were checked against the portal. Update it when you change them.</span>
          </div>
          <input type="date" className={`${tw.num} w-[150px] text-left`} value={card.effective_from} onChange={(e) => set(["effective_from"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div>
            <span className={tw.rowLabel}>How it works</span>
            <span className={tw.rowHint}>Polytec charges each colour&apos;s board price for the piece plus a set amount per piece, with sizes rounded up to the steps below. So the figures are in square metres of that colour&apos;s board, and one set covers every colour in the colour library. Pieces under {clean.facia_below_mm}mm and anything bigger than a sheet go to the quote list. The shop only sells colours ticked made to order in the Board Library. The rest show as quote only.</span>
          </div>
        </div>
      </div>

      <div className={tw.card}>
        <div className={tw.head}>Try a Size</div>
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="flex flex-col gap-1 text-[11px] text-[#5a5a52]">Board cost per m2
            <input className={tw.num} value={trial.rate} onChange={(e) => setTrial({ ...trial, rate: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5a5a52]">Thickness
            <input className={`${tw.num} w-[70px] text-left`} value={trial.thickness} onChange={(e) => setTrial({ ...trial, thickness: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5a5a52]">Finish
            <input className={`${tw.num} w-[120px] text-left`} value={trial.finish} onChange={(e) => setTrial({ ...trial, finish: e.target.value })} />
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
              <div><strong>Polytec charges {money(trialResult.unitCost)}</strong>, we sell at {money(trialResult.unitCost * (1 + margin / 100))} with {margin}% margin, ex GST, before hinge holes.</div>
              <div className="text-[#5a5a52]">Charged as {trialResult.chargedHeight} x {trialResult.chargedWidth}{trialResult.factor !== 1 ? `, finish x ${trialResult.factor}` : ""}.</div>
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

      <div className={tw.card}>
        <div className={tw.head}>What Polytec Charges</div>
        <div className={tw.row}>
          <div><span className={tw.rowLabel}>Per piece (m2 of board)</span><span className={tw.rowHint}>The set amount on every piece, whatever its size. This is why small pieces cost so much.</span></div>
          <input className={tw.num} value={card.per_piece_sqm} onChange={(e) => set(["per_piece_sqm"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div><span className={tw.rowLabel}>Edges (m2 of board per metre of height + width)</span><span className={tw.rowHint}>Covers the banding.</span></div>
          <input className={tw.num} value={card.edge_sqm_per_m} onChange={(e) => set(["edge_sqm_per_m"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div><span className={tw.rowLabel}>Area (times the piece&apos;s area)</span><span className={tw.rowHint}>A little over 1, the board Polytec allows for each square metre of piece.</span></div>
          <input className={tw.num} value={card.area_factor} onChange={(e) => set(["area_factor"], e.target.value)} />
        </div>
      </div>

      <div className={tw.card}>
        <div className={tw.head}>
          <span>Finishes Priced Differently</span>
          <button type="button" className={tw.btn} onClick={addFinishFactor}>Add finish</button>
        </div>
        {(card.finish_factors || []).map((row, i) => (
          <div key={i} className={tw.row}>
            <input className={`${tw.num} w-[70px] text-left`} value={row.thickness} placeholder="All" onChange={(e) => set(["finish_factors", i, "thickness"], e.target.value)} />
            <div className="min-w-[240px] flex-1">
              <input className={tw.text} value={listText(row.finishes)} placeholder="Gloss" onChange={(e) => set(["finish_factors", i, "finishes"], e.target.value)} />
              <span className={tw.rowHint}>Thickness, then finish names as they are in the colour library, separated by commas.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#8b8a81]">x</span>
              <input className={tw.num} value={row.factor} onChange={(e) => set(["finish_factors", i, "factor"], e.target.value)} />
              <button type="button" className={tw.btn} onClick={() => removeFinishFactor(i)}>Remove</button>
            </div>
          </div>
        ))}
        <p className={tw.note}>Every other finish follows its board price. Set on 21 October 2026 from portal prices at 400 x 400 and 600 x 1200, never under Polytec on either. A blank thickness means every thickness.</p>
      </div>

      <div className={tw.card}>
        <div className={tw.head}>Size Steps</div>
        <div className={tw.row}>
          <div className="min-w-[240px] flex-1">
            <span className={tw.rowLabel}>Height steps (mm)</span>
            <span className={tw.rowHint}>A piece is charged at the next height up. The last one is the tallest priced online.</span>
          </div>
          <input className={`${tw.text} max-w-[420px]`} value={listText(card.height_steps_mm)} onChange={(e) => set(["height_steps_mm"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div className="min-w-[240px] flex-1">
            <span className={tw.rowLabel}>Width steps (mm)</span>
            <span className={tw.rowHint}>The first is the narrowest a piece is charged at. The last is the widest priced online.</span>
          </div>
          <input className={`${tw.text} max-w-[420px]`} value={listText(card.width_steps_mm)} onChange={(e) => set(["width_steps_mm"], e.target.value)} />
        </div>
        <div className={tw.row}>
          <div><span className={tw.rowLabel}>Facia under (mm)</span><span className={tw.rowHint}>Narrower than this in either direction, Polytec makes it as a facia and charges far more, so it goes to the quote list.</span></div>
          <input className={tw.num} value={card.facia_below_mm} onChange={(e) => set(["facia_below_mm"], e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {message && <span className="text-[12px] text-[#5a5a52]">{message}</span>}
        <button type="button" className={tw.btn} onClick={resetToMeasured} disabled={busy}>Use measured figures</button>
        <button type="button" className={tw.primary} onClick={save} disabled={busy || source === "unavailable"}>{busy ? "Saving..." : "Save rate card"}</button>
      </div>
    </div>
  );
}
