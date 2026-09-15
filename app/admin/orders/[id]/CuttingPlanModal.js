"use client";

// THE CUTTING PLAN, SET UP AND PRINTED.
//
// Opened from the Made In House tab. Everything here is a setting the plan
// actually uses, and the board count underneath is worked out again as they
// change, so the effect of a thinner blade or a bigger board is visible before
// anything is printed. Generate saves the settings on the order and downloads
// the PDF built from exactly what is on screen.

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { tableStyles } from "@/components/ui/table-styles";

const field = "h-[34px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#6b9e61]";
const smallField = "h-[30px] w-[84px] rounded-[6px] border border-[#dbd8cc] bg-white px-2 text-[12px] text-[#1a1a18] focus:outline-none focus:border-[#6b9e61]";
const label = "flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]";
const hint = "text-[10.5px] font-normal leading-[1.4] text-[#8b8a81]";

const SIZE_SOURCE = {
  order: "Set on this order",
  library: "From the colour library",
  fallback: "Not in the library, assumed",
};
const GRAIN_SOURCE = {
  order: "Set on this order",
  library: "From the colour library",
  finish: "Guessed from the finish",
};

export default function CuttingPlanModal({ open, onClose, orderId, orderNumber }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [working, setWorking] = useState(false);
  const [busy, setBusy] = useState("");
  const [edited, setEdited] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setEdited(false);
    fetch(`/api/admin/orders/${orderId}/cutting-plan`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload.ok) throw new Error(payload.error || "Could not work out the cutting plan.");
        setSettings(payload.settings);
        setSummary(payload.summary);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.message || "Could not work out the cutting plan.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  async function sendSettings(save) {
    const response = await fetch(`/api/admin/orders/${orderId}/cutting-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings, save }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not work out the cutting plan.");
    return payload;
  }

  // Worked out again a moment after the last change, and only the newest answer
  // is kept, so typing 3.2 never flashes the board count for 3.
  useEffect(() => {
    if (!open || !edited || !settings) return undefined;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      setWorking(true);
      try {
        const payload = await sendSettings(false);
        if (request === latest.current) setSummary(payload.summary);
      } catch (error) {
        if (request === latest.current) toast({ title: error?.message || "Could not work out the cutting plan.", variant: "error" });
      } finally {
        if (request === latest.current) setWorking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // sendSettings reads the settings this effect already depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, edited, open]);

  const update = (patch) => {
    setSettings((current) => ({ ...current, ...patch }));
    setEdited(true);
  };

  const updateBoard = (key, patch) => {
    setSettings((current) => ({
      ...current,
      boards: { ...(current.boards || {}), [key]: { ...(current.boards?.[key] || {}), ...patch } },
    }));
    setEdited(true);
  };

  async function save() {
    setBusy("save");
    try {
      const payload = await sendSettings(true);
      setSummary(payload.summary);
      setEdited(false);
      toast(payload.saved
        ? { title: "Cutting settings saved on this order.", variant: "success" }
        : { title: payload.warning || "The settings could not be saved.", variant: "error" });
    } catch (error) {
      toast({ title: error?.message || "Could not save the settings.", variant: "error" });
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    setBusy("pdf");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/cutting-plan?format=pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, save: true }),
      });
      if (!response.ok) {
        let message = "Could not generate the cutting plan.";
        if ((response.headers.get("content-type") || "").includes("application/json")) {
          const payload = await response.json();
          message = payload.error || message;
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cutting-plan-${orderNumber || "order"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setEdited(false);
      if (response.headers.get("X-Settings-Saved") === "no") {
        toast({ title: "Downloaded. The settings were not saved: the database needs its cutting plan update run.", variant: "error" });
      } else {
        toast({ title: "Cutting plan downloaded.", variant: "success" });
      }
    } catch (error) {
      toast({ title: error?.message || "Could not generate the cutting plan.", variant: "error" });
    } finally {
      setBusy("");
    }
  }

  // A panel too big for its board: leave it off, swap it or split it, for the
  // plan only. Leaving it off removes the answer entirely.
  const setFix = (key, fix) => {
    setSettings((current) => {
      const fixes = { ...(current.panel_fixes || {}) };
      if (fix) fixes[key] = fix;
      else delete fixes[key];
      return { ...current, panel_fixes: fixes };
    });
    setEdited(true);
  };

  const totals = summary?.totals;
  const boards = summary?.boards || [];
  const oversize = summary?.oversize || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cutting plan"
      subtitle="Every Made In House panel laid onto boards for the panel saw, one page per board."
      size="xl"
      className="md:max-w-[980px]"
      footer={
        <>
          <Button variant="neutral" onClick={onClose} disabled={Boolean(busy)}>Close</Button>
          <Button variant="neutral" onClick={save} loading={busy === "save"} loadingText="Saving..." disabled={!settings || Boolean(busy)}>
            Save settings
          </Button>
          <Button variant="primary" onClick={generate} loading={busy === "pdf"} loadingText="Generating..." disabled={!totals?.boards || Boolean(busy)}>
            Generate PDF
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-[13px] text-[#8b8a81]">Working out the boards...</p>
      ) : loadError ? (
        <p className="rounded-[8px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">{loadError}</p>
      ) : settings && summary ? (
        <>
          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-semibold text-[#1a1a18]">How we cut</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className={label}>
                Blade width (mm)
                <input className={field} type="number" min="0" step="0.1" value={settings.kerf_mm ?? ""} onChange={(e) => update({ kerf_mm: e.target.value })} />
                <span className={hint}>What the saw takes out between two pieces.</span>
              </label>
              <label className={label}>
                Trim each edge (mm)
                <input className={field} type="number" min="0" step="0.5" value={settings.trim_mm ?? ""} onChange={(e) => update({ trim_mm: e.target.value })} />
                <span className={hint}>Taken off all four edges of a board before the first cut.</span>
              </label>
              <label className={label}>
                Edge tape (mm)
                <input className={field} type="number" min="0" step="0.1" value={settings.tape_mm ?? ""} onChange={(e) => update({ tape_mm: e.target.value })} />
                <span className={hint}>Taken off the cut size for each taped edge, unless the edge profile names its own thickness.</span>
              </label>
              <label className={label}>
                Smallest offcut worth keeping (mm)
                <span className="flex items-center gap-2">
                  <input className={field} type="number" min="0" step="10" aria-label="Offcut length" value={settings.min_offcut_length_mm ?? ""} onChange={(e) => update({ min_offcut_length_mm: e.target.value })} />
                  <span className="text-[12px] text-[#8b8a81]">by</span>
                  <input className={field} type="number" min="0" step="10" aria-label="Offcut width" value={settings.min_offcut_width_mm ?? ""} onChange={(e) => update({ min_offcut_width_mm: e.target.value })} />
                </span>
                <span className={hint}>Anything at least this long and this wide is outlined and sized on the sheet.</span>
              </label>
              <label className={label}>
                On a grained board, Standard means
                <select className={field} value={settings.standard_grain} onChange={(e) => update({ standard_grain: e.target.value })}>
                  <option value="height">The grain runs up every panel</option>
                  <option value="by_type">Drawer fronts run across</option>
                </select>
                <span className={hint}>A panel whose notes ask for something else is not changed by this.</span>
              </label>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-[#1a1a18]">Boards</h3>
              <span className="text-[12px] text-[#5a5a52]">
                {working ? "Working it out..." : `${totals.boards} ${totals.boards === 1 ? "board" : "boards"} for ${totals.panels} ${totals.panels === 1 ? "panel" : "panels"}`}
              </span>
            </div>
            <div className={tableStyles.card}>
              <div className={tableStyles.sideScroll}>
                <table className={tableStyles.tableWide}>
                  <thead>
                    <tr>
                      {["Board", "Size (long x wide, mm)", "Grain", "Panels", "Boards needed"].map((heading) => (
                        <th key={heading} className={tableStyles.th}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={tableStyles.body}>
                    {boards.map((board) => {
                      const override = settings.boards?.[board.key] || {};
                      return (
                        <tr key={board.key}>
                          <td className={tableStyles.td}>
                            <p className="text-[12px] font-semibold text-[#1a1a18]">{board.colour || "Unnamed board"}</p>
                            <p className="text-[11px] text-[#8b8a81]">
                              {[board.supplier, board.finish, board.thickness_mm ? `${board.thickness_mm}mm` : "", board.material].filter(Boolean).join(" · ")}
                            </p>
                          </td>
                          <td className={tableStyles.td}>
                            <div className="flex items-center gap-2">
                              <input
                                className={smallField}
                                type="number"
                                min="0"
                                aria-label={`${board.colour} board length`}
                                value={override.length_mm ?? board.length_mm}
                                onChange={(e) => updateBoard(board.key, { length_mm: e.target.value })}
                              />
                              <span className="text-[12px] text-[#8b8a81]">x</span>
                              <input
                                className={smallField}
                                type="number"
                                min="0"
                                aria-label={`${board.colour} board width`}
                                value={override.width_mm ?? board.width_mm}
                                onChange={(e) => updateBoard(board.key, { width_mm: e.target.value })}
                              />
                            </div>
                            <p className={`mt-1 ${board.size_source === "fallback" ? "text-[11px] text-[#8a6d0b]" : "text-[11px] text-[#8b8a81]"}`}>
                              {SIZE_SOURCE[board.size_source]}
                            </p>
                          </td>
                          <td className={tableStyles.td}>
                            <select
                              className={smallField + " w-[110px]"}
                              value={String(override.has_grain ?? board.has_grain)}
                              onChange={(e) => updateBoard(board.key, { has_grain: e.target.value === "true" })}
                            >
                              <option value="true">Grained</option>
                              <option value="false">No grain</option>
                            </select>
                            <p className={`mt-1 ${board.grain_source === "finish" ? "text-[11px] text-[#8a6d0b]" : "text-[11px] text-[#8b8a81]"}`}>
                              {GRAIN_SOURCE[board.grain_source]}
                            </p>
                          </td>
                          <td className={tableStyles.td}>{board.panels}</td>
                          <td className={tableStyles.td}>
                            <p className="text-[13px] font-semibold text-[#1a1a18]">{board.boards}</p>
                            <p className="text-[11px] text-[#8b8a81]">{board.used_pct}% of each board used</p>
                            {board.unplaced ? (
                              <p className="text-[11px] font-medium text-[#991b1b]">{board.unplaced} will not fit</p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {!boards.length && (
                      <tr><td colSpan={5} className={tableStyles.empty}>Nothing on this order is cut in house.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {oversize.length ? (
            <section className="flex flex-col gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-[#1a1a18]">Panels that will not fit</h3>
                <p className="mt-[2px] text-[12px] leading-[1.5] text-[#5a5a52]">
                  For the cutting plan only. Nothing here changes the order, and whatever you choose is written on the
                  last page of the PDF as a record for the workshop.
                </p>
              </div>
              <div className={tableStyles.card}>
                <div className={tableStyles.sideScroll}>
                  <table className={tableStyles.tableWide}>
                    <thead>
                      <tr>
                        {["Panel", "Why it will not fit", "For cutting"].map((heading) => (
                          <th key={heading} className={tableStyles.th}>{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className={tableStyles.body}>
                      {oversize.map((entry) => {
                        const chosen = settings.panel_fixes?.[entry.key] || null;
                        const action = chosen?.action || "leave";
                        const splitOption = entry.split_options.find((option) => option.direction === chosen?.direction) || entry.split_options[0];
                        const firstMm = Number(chosen?.first_mm) || 0;
                        const grainAcross = entry.grain_axis === "height"
                          ? "The grain will run across this panel instead of up it."
                          : "The grain will run up this panel instead of across it.";
                        return (
                          <tr key={entry.key}>
                            <td className={tableStyles.td + " align-top"}>
                              <p className="text-[12px] font-semibold text-[#1a1a18]">{entry.label} {entry.name}</p>
                              <p className="text-[11px] text-[#8b8a81]">
                                {[entry.source, `cut size ${entry.cut_height_mm} x ${entry.cut_width_mm}`, entry.copies > 1 ? `${entry.copies} of them` : ""].filter(Boolean).join(" · ")}
                              </p>
                            </td>
                            <td className={tableStyles.td + " align-top"}>
                              <p className="text-[12px] text-[#1a1a18]">Too big for a {entry.board} board</p>
                              {entry.grain_locked ? (
                                <p className="text-[11px] text-[#8b8a81]">The grain stops it lying the other way.</p>
                              ) : null}
                            </td>
                            <td className={tableStyles.td + " align-top"}>
                              <div className="flex min-w-[300px] flex-col gap-2 text-[12px] text-[#1a1a18]">
                                <label className="flex items-center gap-2">
                                  <input type="radio" className={tableStyles.checkbox} name={`fix-${entry.key}`} checked={action === "leave"} onChange={() => setFix(entry.key, null)} />
                                  Leave it off the plan
                                </label>

                                <label className={`flex items-center gap-2 ${entry.can_turn ? "" : "text-[#b5b3aa]"}`}>
                                  <input
                                    type="radio"
                                    className={tableStyles.checkbox}
                                    name={`fix-${entry.key}`}
                                    disabled={!entry.can_turn}
                                    checked={action === "turn"}
                                    onChange={() => setFix(entry.key, { action: "turn" })}
                                  />
                                  Swap height and width for cutting
                                  {!entry.can_turn ? <span className="text-[11px]">(still too big)</span> : null}
                                </label>
                                {action === "turn" && entry.grain_locked ? (
                                  <p className="ml-6 rounded-[6px] border border-[#e8d68f] bg-[#fffdf0] px-2 py-1 text-[11px] text-[#8a6d0b]">{grainAcross}</p>
                                ) : null}

                                <label className={`flex items-center gap-2 ${entry.split_options.length ? "" : "text-[#b5b3aa]"}`}>
                                  <input
                                    type="radio"
                                    className={tableStyles.checkbox}
                                    name={`fix-${entry.key}`}
                                    disabled={!entry.split_options.length}
                                    checked={action === "split"}
                                    onChange={() => setFix(entry.key, {
                                      action: "split",
                                      direction: entry.split_options[0].direction,
                                      first_mm: entry.split_options[0].suggested_first_mm,
                                    })}
                                  />
                                  Split into 2 pieces
                                  {!entry.split_options.length ? <span className="text-[11px]">(still too big in 2)</span> : null}
                                </label>
                                {action === "split" && splitOption ? (
                                  <div className="ml-6 flex flex-col gap-1">
                                    <select
                                      className={smallField + " w-full"}
                                      value={chosen.direction}
                                      onChange={(e) => {
                                        const option = entry.split_options.find((item) => item.direction === e.target.value);
                                        setFix(entry.key, { action: "split", direction: option.direction, first_mm: option.suggested_first_mm });
                                      }}
                                    >
                                      {entry.split_options.map((option) => (
                                        <option key={option.direction} value={option.direction}>
                                          {option.direction === "height" ? "Split the height, both pieces full width" : "Split the width, both pieces full height"}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="flex flex-wrap items-center gap-2">
                                      <input
                                        className={smallField}
                                        type="number"
                                        min="1"
                                        aria-label={`${entry.label} first piece`}
                                        value={chosen.first_mm ?? ""}
                                        onChange={(e) => setFix(entry.key, { ...chosen, first_mm: e.target.value })}
                                      />
                                      <span className="text-[11px] text-[#5a5a52]">
                                        and {Math.max(0, splitOption.total_mm - firstMm)} {chosen.direction === "height" ? "high" : "wide"}. The join is a raw cut, no tape.
                                      </span>
                                    </span>
                                  </div>
                                ) : null}

                                {chosen && !entry.works ? (
                                  <p className="ml-6 text-[11px] font-medium text-[#991b1b]">That still will not fit, so the panel stays off the plan.</p>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          <p className="text-[12px] leading-[1.5] text-[#5a5a52]">
            The sheet gives cut sizes. A taped panel is cut smaller than the size on the order list by the tape on each
            taped edge, so it finishes at the order size. The sheet says this on every page.
          </p>

          {summary.warnings?.length ? (
            <div className="rounded-[8px] border border-[#e8d68f] bg-[#fffdf0] px-4 py-3">
              <p className="text-[12px] font-semibold text-[#8a6d0b]">Check before cutting</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-[12px] leading-[1.45] text-[#6b5209]">
                {summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
