"use client";

// THE WAY PAST A SEALED DOCUMENT, AND THE ONLY WAY.
//
// A quote or variation sitting with a customer cannot be edited, because the
// link they hold has to keep meaning what it meant when it was sent. But a
// customer who never received the email can neither approve nor reject, and the
// work still has to move. So this exists.
//
// It is deliberately not a confirm dialog. Every consequence is spelled out
// before the button is reachable, and a reason is required rather than optional:
// the whole value of an override is the record it leaves, and an override with
// no reason recorded is the silent edit the seal was built to stop.
//
// One component for both kinds, so a quote and a variation cannot drift into
// describing the same action two different ways. The words come from
// lib/pcd-document-lock.js.

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { overrideWarning } from "../../../lib/pcd-document-lock";

const tone = {
  panel: "rounded-[6px] border border-[#e3b3aa] bg-[#fceeeb] px-3 py-2.5",
  heading: "text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9e2717]",
  item: "flex gap-2 text-[13px] leading-[1.5] text-[#1a1a18]",
  bullet: "mt-[7px] h-[5px] w-[5px] flex-shrink-0 rounded-full bg-[#9e2717]",
  label: "block text-[12px] font-semibold text-[#5a5a52] mb-1.5",
  textarea:
    "w-full min-h-[84px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] text-[#1a1a18] " +
    "placeholder:text-[#a8a79e] focus:border-[#6b9e61] focus:outline-none",
  secondary:
    "rounded-[6px] border border-[#dbd8cc] bg-white px-3.5 py-2 text-[13px] font-medium text-[#5a5a52] " +
    "hover:bg-[#f6f5f0] disabled:opacity-50",
  danger:
    "rounded-[6px] border border-[#9e2717] bg-[#9e2717] px-3.5 py-2 text-[13px] font-semibold text-white " +
    "hover:bg-[#87200f] disabled:opacity-50 disabled:cursor-not-allowed",
};

/**
 * @param kind            "quote" or "variation"
 * @param documentNumber  e.g. PCD-Q-2026-0ED040, shown so nobody overrides the wrong one
 * @param sentAt          when it went to the customer, so the age of it is visible
 * @param onConfirm       async (reason) => void. Throwing keeps the modal open with the message.
 */
export default function OverrideModal({ open, kind = "quote", documentNumber = "", sentAt = null, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A fresh open asks the question again. Carrying the last reason over would
  // let somebody override a second document with the first one's justification.
  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const warning = overrideWarning(kind, { documentNumber, sentAt });
  const ready = reason.trim().length > 0;

  async function confirm() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(reason.trim());
    } catch (thrown) {
      setError(thrown?.message || "Could not override. Nothing has been changed.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={warning.title}
      subtitle={`Edit a ${kind} that is with the customer`}
      size="md"
      footer={
        <>
          <button type="button" className={tone.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {/* Disabled until a reason is typed. The record is the point. */}
          <button type="button" className={tone.danger} onClick={confirm} disabled={!ready || busy}>
            {busy ? "Overriding..." : warning.confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <p className="m-0 text-[13px] leading-[1.55] text-[#1a1a18]">{warning.lede}</p>

        <div className={tone.panel}>
          <p className={`${tone.heading} m-0 mb-2`}>What this will do</p>
          <div className="flex flex-col gap-1.5">
            {warning.consequences.map((line) => (
              <p key={line} className={`${tone.item} m-0`}>
                <span className={tone.bullet} />
                <span>{line}</span>
              </p>
            ))}
          </div>
        </div>

        <div>
          <label className={tone.label} htmlFor="override-reason">
            Why are you overriding? Required.
          </label>
          <textarea
            id="override-reason"
            className={tone.textarea}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={warning.reasonPlaceholder}
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
