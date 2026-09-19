"use client";

// APPROVING A VARIATION FOR THE CUSTOMER, WHEN THEY ALREADY SAID YES.
//
// Agreed on site, agreed on the phone, and the piece has to be cut now. This is
// how that gets recorded and put onto the order without waiting for somebody to
// open an email.
//
// ── IT SHOWS THE WORK BEFORE IT ASKS FOR THE ANSWER ──────────────────────────
//
// The sizes that are about to change are listed first, old and new, with the
// price beside them staying put. Not because anybody doubts it, but because
// "the price does not move" is a claim, and a claim about money should be
// something you can see rather than something you are told.
//
// ── AND IT REFUSES, OUT LOUD, WITH REASONS ───────────────────────────────────
//
// A variation that adds, removes, reprices or changes the spec cannot be
// approved here at all, and the modal says which line broke the rule rather
// than greying a button out. A disabled button with no explanation is how
// somebody ends up raising a second variation to work around the first.
//
// Three things are required before it will go: who agreed, how they said so,
// and why this is not going to the customer. Same three the quote's Accept for
// the customer asks, for the same reason: an approval with nobody's name on it
// is indistinguishable from a mis-click.

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ACCEPTANCE_CHANNELS } from "../../../lib/pcd-acceptance-channels";
import { OVERRIDE_RULE_SENTENCE } from "../../../lib/pcd-variation-override";

const tone = {
  label: "block text-[12px] font-semibold text-[#5a5a52] mb-1.5",
  input:
    "w-full h-[36px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[13px] text-[#1a1a18] " +
    "placeholder:text-[#a8a79e] focus:border-[#6b9e61] focus:outline-none",
  textarea:
    "w-full min-h-[70px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] text-[#1a1a18] " +
    "placeholder:text-[#a8a79e] focus:border-[#6b9e61] focus:outline-none",
  secondary:
    "rounded-[6px] border border-[#dbd8cc] bg-white px-3.5 py-2 text-[13px] font-medium text-[#5a5a52] " +
    "hover:bg-[#f6f5f0] disabled:opacity-50",
  primary:
    "rounded-[6px] border border-[#1c2b1e] bg-[#1c2b1e] px-3.5 py-2 text-[13px] font-semibold text-white " +
    "hover:bg-[#2d3f2f] disabled:opacity-50 disabled:cursor-not-allowed",
};

function money(value, currency = "AUD") {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "";
  return number.toLocaleString("en-AU", { style: "currency", currency });
}

/**
 * @param eligibility  { ok, reasons, changes } from overrideApprovalEligibility
 * @param onConfirm    async ({ approved_by, channel, reason }) => result.
 *                     Throwing keeps the modal open with the message shown.
 */
export default function ApproveVariationOverrideModal({
  open,
  variationNumber = "",
  customerName = "",
  currency = "AUD",
  eligibility = null,
  onClose,
  onConfirm,
  onApproved,
}) {
  const [approvedBy, setApprovedBy] = useState("");
  const [channel, setChannel] = useState("phone");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A fresh open asks again. Carrying the last answer over would let one site
  // visit approve a second variation nobody discussed.
  useEffect(() => {
    if (!open) return;
    setApprovedBy(customerName || "");
    setChannel("phone");
    setReason("");
    setError("");
    setBusy(false);
  }, [open, customerName]);

  if (!open) return null;

  const allowed = Boolean(eligibility?.ok);
  const changes = eligibility?.changes || [];
  const reasons = eligibility?.reasons || [];
  const ready = allowed && approvedBy.trim().length > 0 && Boolean(channel) && reason.trim().length > 0;

  async function confirm() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onConfirm({
        approved_by: approvedBy.trim(),
        channel,
        reason: reason.trim(),
      });
      onApproved(result);
    } catch (thrown) {
      setError(thrown?.message || "Could not approve this variation. Nothing has been changed.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Approve for the customer"
      subtitle={variationNumber ? `${variationNumber} goes onto the order` : "This variation goes onto the order"}
      size="md"
      footer={
        <>
          <button type="button" className={tone.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={tone.primary} onClick={confirm} disabled={!ready || busy}>
            {busy ? "Approving..." : "Approve and apply"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {allowed ? (
          <>
            <div className="rounded-[6px] border border-[#a8c5a0] bg-[#edf4eb] px-3 py-2.5 text-[13px] leading-[1.55] text-[#2d5e28]">
              The changes go straight onto the order and the workshop works to them.{" "}
              <strong className="font-semibold">The order total does not change.</strong> Each line keeps the price
              it already has, so nothing new is owed and the deposit and balance stay as they are. A colour or a
              hinge position costs nothing anyway; a size is the one that can be a giveaway.
            </div>

            {/* WHAT IS ABOUT TO HAPPEN, LINE BY LINE AND CHANGE BY CHANGE.
                Every edit is named, so nobody confirms a colour swap thinking
                they approved a size. Height before width, as everywhere else.
                The held price sits in its own column so it is obvious that it
                is the same number on both sides. */}
            <div className="rounded-[6px] border border-[#dbd8cc] overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#ecebe4] bg-[#f6f5f0] px-3 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#5a5a52]">
                  What changes
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#5a5a52]">
                  Price held at
                </span>
              </div>
              {changes.map((change) => (
                <div
                  key={change.variation_line_id}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-[#f2f1ea] px-3 py-2 last:border-b-0"
                >
                  <span className="text-[13px] leading-[1.45] text-[#1a1a18]">
                    <strong className="font-semibold">{change.qty} x {change.title}</strong>
                    {(change.edits || []).map((edit) => (
                      <span className="mt-[2px] block" key={edit.what}>
                        <span className="text-[11px] uppercase tracking-[0.05em] text-[#8b8a81]">{edit.what}</span>{" "}
                        <span className="text-[#5a5a52]">{edit.from}</span>
                        <span className="text-[#8b8a81]"> becomes </span>
                        <span className="font-semibold text-[#2d5e28]">{edit.to}</span>
                      </span>
                    ))}
                  </span>
                  <span className="text-[13px] font-semibold text-[#1a1a18] whitespace-nowrap">
                    {money(change.held_line_total_ex_gst, currency)}
                  </span>
                </div>
              ))}
            </div>

            <div>
              <label className={tone.label} htmlFor="variation-approved-by">
                Who agreed to it? Required.
              </label>
              <input
                id="variation-approved-by"
                className={tone.input}
                value={approvedBy}
                onChange={(event) => setApprovedBy(event.target.value)}
                placeholder="The name of the person who agreed"
                disabled={busy}
              />
            </div>

            <div>
              <label className={tone.label} htmlFor="variation-approve-channel">
                How did they agree?
              </label>
              <select
                id="variation-approve-channel"
                className={tone.input}
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                disabled={busy}
              >
                {ACCEPTANCE_CHANNELS.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={tone.label} htmlFor="variation-approve-reason">
                Why is this not going to the customer? Required.
              </label>
              <textarea
                id="variation-approve-reason"
                className={tone.textarea}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Measured on site this morning, the opening is 5mm narrower than the plan. Agreed with Sam on the spot, cutting tomorrow."
                disabled={busy}
              />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-[6px] border border-[#e3b3aa] bg-[#fceeeb] px-3 py-2.5">
              <p className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9e2717]">
                This one has to go to the customer
              </p>
              <div className="flex flex-col gap-1.5">
                {reasons.map((line) => (
                  <p key={line} className="m-0 flex gap-2 text-[13px] leading-[1.5] text-[#1a1a18]">
                    <span className="mt-[7px] h-[5px] w-[5px] flex-shrink-0 rounded-full bg-[#9e2717]" />
                    <span>{line}</span>
                  </p>
                ))}
              </div>
            </div>
            <p className="m-0 text-[13px] leading-[1.55] text-[#5a5a52]">{OVERRIDE_RULE_SENTENCE}</p>
            <p className="m-0 text-[13px] leading-[1.55] text-[#5a5a52]">
              Send it the normal way and let them answer, or put the lines this can handle onto a variation of
              their own.
            </p>
          </>
        )}

        {error ? (
          <p className="m-0 rounded-[6px] border border-[#e3b3aa] bg-[#fceeeb] px-3 py-2 text-[13px] text-[#9e2717]">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
