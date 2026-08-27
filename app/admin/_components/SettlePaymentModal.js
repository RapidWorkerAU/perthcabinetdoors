"use client";

// THE MONEY ARRIVED SOME OTHER WAY.
//
// A payment link goes out, it does not work for the customer, they transfer the
// money instead. Before this there was nothing to press: sending a request
// locked the payment, so the money sat in the bank while the system insisted it
// was still owing.
//
// It asks HOW the money arrived, and for a reference where there is one. That is
// not paperwork for its own sake: a payment marked paid with nothing behind it
// is the thing the locking was protecting against, and a bank reference is what
// lets somebody find it again three months later.

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { paymentTypeLabel } from "../../../lib/pcd-payment-notifications";
import { settlementWantsReference } from "../../../lib/pcd-payment-settlement";
import { useLists } from "../../../lib/use-lists";

const tone = {
  label: "block text-[12px] font-semibold text-[#5a5a52] mb-1.5",
  input:
    "w-full h-[36px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[13px] text-[#1a1a18] " +
    "placeholder:text-[#a8a79e] focus:border-[#6b9e61] focus:outline-none",
  textarea:
    "w-full min-h-[64px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] text-[#1a1a18] " +
    "placeholder:text-[#a8a79e] focus:border-[#6b9e61] focus:outline-none",
  secondary:
    "rounded-[6px] border border-[#dbd8cc] bg-white px-3.5 py-2 text-[13px] font-medium text-[#5a5a52] " +
    "hover:bg-[#f6f5f0] disabled:opacity-50",
  primary:
    "rounded-[6px] border border-[#1c2b1e] bg-[#1c2b1e] px-3.5 py-2 text-[13px] font-semibold text-white " +
    "hover:bg-[#2d3f2f] disabled:opacity-50 disabled:cursor-not-allowed",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function SettlePaymentModal({ payment, hadLink = false, onClose, onSubmit, onSettled }) {
  // Payment methods are editable in Settings, Lists. optionsFor keeps whatever
  // this payment already records in its own dropdown even after somebody
  // switches that method off. See lib/pcd-lists.js.
  const lists = useLists();
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!payment) return;
    setMethod("bank_transfer");
    setReference("");
    setPaidAt(today());
    setNote("");
    setError("");
    setBusy(false);
  }, [payment]);

  if (!payment) return null;

  // Offered, never demanded. Somebody closing off a job does not always have the
  // bank reference to hand, and refusing over it would leave money in the bank
  // showing as owing.
  // Read off the live list first, so a payment method somebody added and ticked
  // "asks for a reference" on actually asks for one. Falls back to the built-in
  // rule while the lists are still loading.
  const chosen = lists.itemsFor("settlement_methods").filter((entry) => entry.key === method)[0];
  const suggestsReference = chosen ? Boolean(chosen.extras?.wantsReference) : settlementWantsReference(method);
  const ready = Boolean(method);
  const amount = Number(payment.amount || 0);

  async function confirm() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onSubmit({
        method,
        reference: reference.trim(),
        paid_at: paidAt,
        note: note.trim(),
      });
      onSettled(result);
    } catch (thrown) {
      setError(thrown?.message || "Could not mark this payment as received. Nothing has been changed.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Mark payment as received"
      subtitle={`${paymentTypeLabel(payment.payment_type)} of ${amount.toFixed(2)}`}
      size="md"
      footer={
        <>
          <button type="button" className={tone.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={tone.primary} onClick={confirm} disabled={!ready || busy}>
            {busy ? "Recording..." : "Mark as received"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {hadLink ? (
          <div className="rounded-[6px] border border-[#e8d68f] bg-[#fffdf0] px-3 py-2.5 text-[13px] leading-[1.55] text-[#8a6d0b]">
            A payment link is out for this one. Recording it as received here <strong className="font-semibold">cancels
            that link at Stripe</strong>, so the customer cannot pay it as well. You will be told if that does not work.
          </div>
        ) : null}

        <div>
          <label className={tone.label} htmlFor="settle-method">
            How did the money arrive?
          </label>
          <select
            id="settle-method"
            className={tone.input}
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            disabled={busy}
          >
            {lists.optionsFor("settlement_methods", method).map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}{entry.retired ? " (no longer offered)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
            <label className={tone.label} htmlFor="settle-reference">
              Reference{suggestsReference ? ", so it can be found in the bank later" : ""}. Optional.
            </label>
            <input
              id="settle-reference"
              className={tone.input}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={suggestsReference ? "e.g. the bank reference on the transfer" : "Anything that identifies it"}
              disabled={busy}
            />
          </div>

        <div>
          <label className={tone.label} htmlFor="settle-date">
            When did it arrive?
          </label>
          <input
            id="settle-date"
            type="date"
            className={tone.input}
            value={paidAt}
            max={today()}
            onChange={(event) => setPaidAt(event.target.value)}
            disabled={busy}
          />
        </div>

        <div>
          <label className={tone.label} htmlFor="settle-note">
            Anything worth recording
          </label>
          <textarea
            id="settle-note"
            className={tone.textarea}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Link would not open on their phone, transferred instead"
            disabled={busy}
          />
        </div>

        {error ? (
          <p className="m-0 rounded-[6px] border border-[#e3b3aa] bg-[#fceeeb] px-3 py-2 text-[13px] text-[#9e2717]">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
