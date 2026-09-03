"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

// READING A COMPLETED ORDER FORM ONTO THIS QUOTE.
//
// Three steps, and nothing is written until the third is passed. A quote that
// already has priced lines on it is the normal case rather than the exception,
// so a wrong file has to be something you back out of, not something you undo.
//
//   1  the file, and what it should do with the quote
//   2  the mapping, so a renamed or rearranged sheet can still be read
//   3  what will happen, then Import
//
// The reading is all server side (lib/pcd-order-form-import.js). This asks for
// the file, shows what came back, and sends it again to apply.

const STEPS = ["The file", "The mapping", "What will happen"];

/** Which sheet a column came off, so four "Colour" rows can be told apart. */
function tabLabel(preview, id) {
  return (preview?.tabs || []).find((tab) => tab.id === id)?.sheet || id || "";
}

/**
 * The tabs this file actually had something on.
 *
 * Most jobs use two of the four, so naming them is how somebody spots the one
 * that did not read: a carcass tab filled in on a file whose sheet was renamed
 * comes back missing, and a count of lines alone would not show it.
 */
function tabsRead(preview) {
  const used = (preview?.tabs || []).filter((tab) => tab.lines > 0).map((tab) => tab.sheet);
  if (!used.length) return "the sheet";
  if (used.length === 1) return used[0];
  return `${used.slice(0, -1).join(", ")} and ${used[used.length - 1]}`;
}

const btnPlain =
  "h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors";
const btnDark =
  "h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors";

export default function ImportOrderFormModal({ quoteId, onClose, onImported }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("add");
  const [withCustomer, setWithCustomer] = useState(true);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  async function send({ apply }) {
    const body = new FormData();
    body.append("file", file);
    body.append("mode", mode);
    body.append("withCustomer", withCustomer ? "true" : "false");
    body.append("mapping", JSON.stringify(mapping));

    const response = await fetch(
      `/api/admin/quotes/${quoteId}/import-order-form${apply ? "?apply=1" : ""}`,
      { method: "POST", body }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "That order form could not be read.");
    return payload;
  }

  async function readFile(chosen) {
    setFile(chosen);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", chosen);
      body.append("mode", mode);
      body.append("withCustomer", withCustomer ? "true" : "false");
      body.append("mapping", "{}");
      const response = await fetch(`/api/admin/quotes/${quoteId}/import-order-form`, { method: "POST", body });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "That order form could not be read.");
      setPreview(payload);
    } catch (error) {
      setFile(null);
      toast({ title: error.message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  // Re-reads with whatever has been repointed by hand, so step 3 counts what
  // will actually be written rather than what matched on the first pass.
  async function refresh() {
    setBusy(true);
    try {
      setPreview(await send({ apply: false }));
      setStep(3);
    } catch (error) {
      toast({ title: error.message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const result = await send({ apply: true });
      toast({
        title: result.replaced
          ? `The spreadsheet replaced the quote: ${result.added} lines.`
          : `${result.added} lines added from the spreadsheet.`,
        variant: "success",
      });
      onImported?.();
      onClose();
    } catch (error) {
      toast({ title: error.message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const lines = preview?.lines || [];

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload an order form"
      subtitle={
        step === 1 ? "Read a completed PCD order form into this quote"
          : step === 2 ? "Check what is going where"
            : "Nothing is written until you press import"
      }
      size="xl"
      footer={
        <>
          {step > 1 ? (
            <button type="button" className={btnPlain} onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </button>
          ) : null}
          <button type="button" className={btnPlain} onClick={onClose} disabled={busy}>Cancel</button>
          {step < 3 ? (
            <button
              type="button"
              className={btnDark}
              disabled={busy || !preview}
              onClick={() => (step === 1 ? setStep(2) : refresh())}
            >
              Next
            </button>
          ) : (
            <button type="button" className={btnDark} disabled={busy || !lines.length} onClick={apply}>
              {busy ? "Importing..." : `Import ${lines.length} ${lines.length === 1 ? "line" : "lines"}`}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Where you are, so Back means something. */}
        <div className="flex border-b border-[#ece8dd] -mx-4 -mt-4 mb-1">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className={`flex-1 px-3 py-2 text-[11.5px] font-semibold text-center border-b-2 ${
                step === index + 1
                  ? "text-[#1a1a18] border-[#6b9e61] bg-white"
                  : step > index + 1
                    ? "text-[#2d5e28] border-transparent"
                    : "text-[#a8a69c] border-transparent"
              }`}
            >
              {index + 1}. {label}
            </div>
          ))}
        </div>

        {/* ── 1. the file ──────────────────────────────────────────────── */}
        {step === 1 ? (
          <>
            <label
              className={`block rounded-[9px] border-2 border-dashed px-5 py-8 text-center cursor-pointer transition-colors ${
                preview ? "border-[#a8c5a0] bg-[#f5f8f4]" : "border-[#dbd8cc] bg-[#faf9f6] hover:bg-[#f5f8f4]"
              }`}
            >
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                disabled={busy}
                onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0])}
              />
              <span className="block text-[26px] leading-none mb-2">{preview ? "✅" : "\u{1F4E5}"}</span>
              {busy ? (
                <span className="block text-[13px] text-[#5a5a52]">Reading it...</span>
              ) : preview ? (
                <>
                  <span className="block font-mono text-[12.5px] font-medium text-[#1a1a18]">{file?.name}</span>
                  <span className="block text-[13px] text-[#5a5a52] mt-1">
                    {lines.length} {lines.length === 1 ? "line" : "lines"} read from {tabsRead(preview)}
                    {preview.unmatched?.length ? `, ${preview.unmatched.length} columns not matched` : ", every column matched"}
                  </span>
                </>
              ) : (
                <span className="block text-[13px] text-[#5a5a52]">
                  Choose the completed spreadsheet, or drop it here
                </span>
              )}
            </label>

            {preview ? (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#8b8a81] m-0">
                  What should it do with this quote?
                </p>
                {[
                  {
                    value: "add",
                    title: "Add these lines to what is already here",
                    body: `The ${preview.existingLines} ${preview.existingLines === 1 ? "line" : "lines"} already on this quote stay exactly as they are, and the ${lines.length} from the spreadsheet are added underneath. Nothing already priced is touched.`,
                  },
                  {
                    value: "replace",
                    title: "Make the spreadsheet the whole quote",
                    body: `The ${preview.existingLines} ${preview.existingLines === 1 ? "line" : "lines"} already here are removed and replaced by the ${lines.length} from the spreadsheet. Your costs and markup on this quote stay as they are.`,
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex gap-3 items-start px-3.5 py-3 rounded-[8px] border cursor-pointer transition-colors ${
                      mode === option.value ? "border-[#6b9e61] bg-[#f5f8f4]" : "border-[#dbd8cc] bg-white hover:bg-[#f5f8f4]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      className="mt-[3px] w-4 h-4 accent-[#2d5e28]"
                      checked={mode === option.value}
                      onChange={() => setMode(option.value)}
                    />
                    <span>
                      <strong className="block text-[13.5px] font-semibold">{option.title}</strong>
                      <small className="block text-[12px] text-[#5a5a52] mt-[3px] leading-[1.5]">{option.body}</small>
                    </span>
                  </label>
                ))}

                <label
                  className={`flex gap-3 items-start px-3.5 py-3 rounded-[8px] border cursor-pointer transition-colors ${
                    withCustomer ? "border-[#6b9e61] bg-[#f5f8f4]" : "border-[#dbd8cc] bg-white hover:bg-[#f5f8f4]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-[3px] w-4 h-4 accent-[#2d5e28]"
                    checked={withCustomer}
                    onChange={(event) => setWithCustomer(event.target.checked)}
                  />
                  <span>
                    <strong className="block text-[13.5px] font-semibold">Also fill in the customer and job details</strong>
                    <small className="block text-[12px] text-[#5a5a52] mt-[3px] leading-[1.5]">
                      From the Start here tab. Anything that disagrees with what is on this quote is listed for you
                      before it is written.
                    </small>
                  </span>
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {/* ── 2. the mapping ───────────────────────────────────────────── */}
        {step === 2 && preview ? (
          <>
            <p className="text-[12.5px] text-[#5a5a52] m-0 leading-[1.6]">
              Every column is matched by its heading. These are here for a sheet that has been renamed or
              rearranged, and for anything we have nowhere to put.
            </p>
            <div className="border border-[#dbd8cc] rounded-[8px] overflow-hidden">
              <div className="grid grid-cols-[1fr_1.2fr] gap-3 px-3 py-2 bg-[#f5f8f4] border-b border-[#dbd8cc] text-[10px] font-bold uppercase tracking-[0.05em] text-[#8b8a81]">
                <div>Quote line field</div>
                <div>Read from</div>
              </div>
              {preview.matched.map((entry) => (
                <div
                  key={entry.key}
                  className={`grid grid-cols-[1fr_1.2fr] gap-3 items-center px-3 py-2 border-b border-[#f0ede4] last:border-b-0 ${
                    entry.found ? "bg-white" : "bg-[#fffdf5]"
                  }`}
                >
                  <div>
                    <div className="text-[12.5px] font-medium text-[#1a1a18]">{entry.label}</div>
                    <div className="text-[10.5px] text-[#8b8a81] mt-[1px]">{tabLabel(preview, entry.tab)}</div>
                  </div>
                  <select
                    className="h-[32px] w-full px-2 border border-[#dbd8cc] rounded-[6px] bg-white text-[12px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
                    value={mapping[entry.key] !== undefined ? mapping[entry.key] : entry.from}
                    onChange={(event) => setMapping((current) => ({ ...current, [entry.key]: event.target.value }))}
                  >
                    <option value="">— not in this sheet —</option>
                    {(preview.availableHeadings || []).map((head) => (
                      <option key={head} value={head}>{head}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {/* ── 3. what will happen ──────────────────────────────────────── */}
        {step === 3 && preview ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { n: lines.length, l: "lines to add", good: true },
                {
                  n: mode === "replace" ? preview.existingLines : preview.existingLines,
                  l: mode === "replace" ? "lines removed first" : "lines kept",
                },
                { n: preview.cabinets || 0, l: "of them cabinets", good: true },
                { n: preview.warnings.length + preview.conflicts.length, l: "need a look", warn: true },
              ].map((stat) => (
                <div
                  key={stat.l}
                  className={`border rounded-[8px] px-3 py-2.5 ${
                    stat.warn && stat.n > 0 ? "border-[#f0d060] bg-[#fffbe8]" : "border-[#dbd8cc] bg-[#faf9f6]"
                  }`}
                >
                  <div className={`text-[22px] font-extrabold leading-tight tabular-nums ${
                    stat.warn && stat.n > 0 ? "text-[#8a6d0b]" : stat.good ? "text-[#2d5e28]" : "text-[#1a1a18]"
                  }`}>
                    {stat.n}
                  </div>
                  <div className="text-[11.5px] text-[#5a5a52] mt-[2px]">{stat.l}</div>
                </div>
              ))}
            </div>

            {preview.warnings.length || preview.conflicts.length ? (
              <div className="border border-[#f0d060] bg-[#fffbe8] rounded-[8px] px-4 py-3">
                <h6 className="m-0 mb-2 text-[12px] font-bold uppercase tracking-[0.05em] text-[#8a6d0b]">
                  Before you import
                </h6>
                <ul className="m-0 pl-4">
                  {[...preview.conflicts, ...preview.warnings].map((warning) => (
                    <li key={warning} className="text-[12.5px] text-[#6a5608] mb-1 leading-[1.5] last:mb-0">
                      {warning}
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-2 text-[12px] text-[#8a6d0b]">
                  None of these stops the import. A line we cannot price comes in named and flagged, which is still
                  less work than typing it again.
                </p>
              </div>
            ) : null}

            {preview.homeless?.length ? (
              <p className="text-[12.5px] text-[#5a5a52] m-0 leading-[1.6]">
                <strong className="text-[#1a1a18]">Nowhere to put:</strong> {preview.homeless.join(", ")}. These go
                into the quote notes rather than being dropped.
              </p>
            ) : null}

            <div className="border border-[#dbd8cc] rounded-[8px] overflow-auto">
              <table className="w-full border-collapse text-[11.5px]" style={{ minWidth: "620px" }}>
                <thead>
                  <tr>
                    {["#", "Item", "Cabinet", "Specification", "H × W", "Qty", "Hinges"].map((head) => (
                      <th
                        key={head}
                        className="text-left px-2.5 py-2 bg-[#f5f8f4] border-b border-[#dbd8cc] text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#8b8a81] whitespace-nowrap"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index}>
                      <td className="px-2.5 py-2 border-b border-[#f0ede4] font-mono text-right">{index + 1}</td>
                      <td className="px-2.5 py-2 border-b border-[#f0ede4]">{line.product_type || "—"}</td>
                      <td className="px-2.5 py-2 border-b border-[#f0ede4]">{line.cabinet_brand || "—"}</td>
                      <td className="px-2.5 py-2 border-b border-[#f0ede4] text-[#3a3a34]">
                        {[line.supplier_name, line.material, line.thickness, line.colour].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-2.5 py-2 border-b border-[#f0ede4] font-mono whitespace-nowrap">
                        {line.height_mm || "—"} × {line.width_mm || "—"}
                      </td>
                      <td className="px-2.5 py-2 border-b border-[#f0ede4] font-mono text-right">{line.qty}</td>
                      <td className="px-2.5 py-2 border-b border-[#f0ede4] whitespace-nowrap">
                        {line.hinge_holes
                          ? [line.hinge_qty, line.hinge_side].filter(Boolean).join(" · ") || "Drill"
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
