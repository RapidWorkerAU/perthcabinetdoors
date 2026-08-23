"use client";

// ACCEPTING A QUOTE ON THE CUSTOMER'S BEHALF.
//
// The customer said yes on the phone and will never open the link. The work has
// to start, so somebody here records their answer.
//
// It asks two things before it will proceed: WHO accepted and HOW they said so.
// Neither is bureaucracy. An acceptance recorded with nobody's name against it
// is indistinguishable from somebody clicking the wrong button, and the whole
// point of an acceptance is being able to say later what the customer agreed to
// and who heard them agree.
//
// This replaces choosing "Approved" on the Status dropdown, which wrote the word
// and raised no order at all.

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ACCEPTANCE_CHANNELS } from "../../../lib/pcd-acceptance-channels";

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

export default function AcceptForCustomerModal({
  open,
  quoteNumber = "",
  customerName = "",
  onClose,
  onSubmit,
  onAccepted,
}) {
  const [acceptedBy, setAcceptedBy] = useState("");
  const [channel, setChannel] = useState("phone");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A fresh open asks again. Carrying the last answer over would let one phone
  // call accept a second quote.
  useEffect(() => {
    if (!open) return;
    setAcceptedBy(customerName || "");
    setChannel("phone");
    setNote("");
    setError("");
    setBusy(false);
  }, [open, customerName]);

  if (!open) return null;

  const ready = acceptedBy.trim().length > 0 && Boolean(channel);

  async function confirm() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onSubmit({ accepted_by: acceptedBy.trim(), channel, note: note.trim() });
      onAccepted(result);
    } catch (thrown) {
      setError(thrown?.message || "Could not accept this quote. Nothing has been changed.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Accept for the customer"
      subtitle={quoteNumber ? `${quoteNumber} becomes an order` : "This quote becomes an order"}
      size="md"
      footer={
        <>
          <button type="button" className={tone.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={tone.primary} onClick={confirm} disabled={!ready || busy}>
            {busy ? "Raising the order..." : "Accept and raise the order"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="rounded-[6px] border border-[#a8c5a0] bg-[#edf4eb] px-3 py-2.5 text-[13px] leading-[1.55] text-[#2d5e28]">
          This does everything the customer&apos;s own acceptance does: it raises the order, copies the lines and the
          cabinet panels onto it, and locks this quote as the record of what was agreed. From then on, changes go
          through a variation.
        </div>

        <div>
          <label className={tone.label} htmlFor="accepted-by">
            Who accepted it? Required.
          </label>
          <input
            id="accepted-by"
            className={tone.input}
            value={acceptedBy}
            onChange={(event) => setAcceptedBy(event.target.value)}
            placeholder="The name of the person who said yes"
            disabled={busy}
          />
        </div>

        <div>
          <label className={tone.label} htmlFor="accept-channel">
            How did they accept?
          </label>
          <select
            id="accept-channel"
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
          <label className={tone.label} htmlFor="accept-note">
            Anything worth recording
          </label>
          <textarea
            id="accept-note"
            className={tone.textarea}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Rang at 9:40, confirmed the Greige fronts and asked us to start this week"
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
