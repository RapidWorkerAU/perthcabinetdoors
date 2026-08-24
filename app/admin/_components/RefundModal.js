"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { paymentTypeLabel } from "../../../lib/pcd-payment-notifications";
import {
  REFUND_METHODS,
  canRefundToCard,
  refundProblem,
  refundWantsReference,
  refundableAmount,
} from "../../../lib/pcd-refunds";

// Raising a refund.
//
// TWO STEPS ON PURPOSE. This only adds the line. Nothing has moved and nobody
// has been told until it is processed, which is a second, deliberate act with
// the customer's email in front of you. Refunds are nearly always partial and
// almost always a correction to something, so the moment to check the number is
// before the card is touched, not after.
//
// WHICH PAYMENT IT COMES OUT OF is the first question, because it decides
// whether Stripe can send it at all: only money that came through the payment
// link has anything for Stripe to give back.

function money(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Math.abs(Number(value || 0)));
}

export default function RefundModal({ open, onClose, onSubmit, payments = [], currency = "AUD", saving = false }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  // Every payment with money still left in it. A payment already refunded in
  // full is not offered, rather than offered and then refused.
  const refundable = useMemo(
    () => (payments || []).filter((payment) => refundableAmount(payment, payments) > 0),
    [payments]
  );

  useEffect(() => {
    if (!open) return;
    const first = refundable[0] || null;
    setForm({
      refund_of_payment_id: first?.id || "",
      // The whole of the payment, in the field, editable and clearable. Nearly
      // every refund is partial, so this is a starting point rather than an
      // answer, but a number you can edit down beats an empty box you have to
      // go and look up.
      amount: first ? String(refundableAmount(first, payments).toFixed(2)) : "",
      refund_method: first && canRefundToCard(first) ? "stripe" : "bank_transfer",
      settlement_reference: "",
      refund_reason: "",
    });
    setError("");
  }, [open, refundable, payments]);

  if (!open || !form) return null;

  const against = refundable.find((payment) => payment.id === form.refund_of_payment_id) || null;
  const available = against ? refundableAmount(against, payments) : 0;
  const cardPossible = against ? canRefundToCard(against) : false;

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  function choosePayment(id) {
    const payment = refundable.find((row) => row.id === id) || null;
    set({
      refund_of_payment_id: id,
      amount: payment ? String(refundableAmount(payment, payments).toFixed(2)) : "",
      // A method that is no longer possible must not stay selected. Somebody
      // switching from a card payment to a bank one would otherwise be sending
      // a card refund against a payment that never touched a card.
      refund_method: payment && canRefundToCard(payment) ? "stripe" : "bank_transfer",
    });
  }

  function submit() {
    const problem = refundProblem(form, { payment: against, allPayments: payments });
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    onSubmit(form);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Raise a refund"
      subtitle="Nothing is sent and nobody is told until you process it"
      size="lg"
      footer={
        <>
          <button
            type="button"
            className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Adding…" : "Add refund line"}
          </button>
        </>
      }
    >
      {refundable.length === 0 ? (
        <p className="text-[13px] leading-[1.6] text-[#5a5a52]">
          Nothing on this order has been received yet, so there is nothing to give back. A payment has to be marked as
          received before it can be refunded. If a payment line is simply wrong, delete it instead.
        </p>
      ) : (
        <div className="flex flex-col gap-4">

          <label className="flex flex-col gap-[5px]">
            <span className="text-[13px] font-medium text-[#1a1a18]">Which payment is this giving back</span>
            <select
              className="h-[40px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[16px] md:text-[14px] text-[#1a1a18]"
              value={form.refund_of_payment_id}
              onChange={(event) => choosePayment(event.target.value)}
              disabled={saving}
            >
              {refundable.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {/* The LABEL, not the column. payment_type stores "deposit"
                      and "progress", which are keys, and printing a key at
                      somebody is how a dropdown ends up in lower case. */}
                  {`${paymentTypeLabel(payment.payment_type)} · ${money(payment.amount, currency)} · ${money(refundableAmount(payment, payments), currency)} left`}
                </option>
              ))}
            </select>
            <span className="text-[12px] text-[#5a5a52]">
              {cardPossible
                ? "Taken through the payment link, so Stripe can send it back to the card."
                : "Not taken through the payment link, so this one has to be sent back by hand and recorded here."}
            </span>
          </label>

          <label className="flex flex-col gap-[5px]">
            <span className="text-[13px] font-medium text-[#1a1a18]">How much is going back</span>
            <input
              className="h-[40px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 font-mono text-[16px] md:text-[14px] text-[#1a1a18]"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => set({ amount: event.target.value })}
              disabled={saving}
            />
            <span className="text-[12px] text-[#5a5a52]">
              {money(available, currency)} of this payment has not been refunded yet.
            </span>
          </label>

          <label className="flex flex-col gap-[5px]">
            <span className="text-[13px] font-medium text-[#1a1a18]">How is it going back</span>
            <select
              className="h-[40px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[16px] md:text-[14px] text-[#1a1a18]"
              value={form.refund_method}
              onChange={(event) => set({ refund_method: event.target.value })}
              disabled={saving}
            >
              {REFUND_METHODS.filter((method) => method.value !== "stripe" || cardPossible).map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </label>

          {refundWantsReference(form.refund_method) && (
            <label className="flex flex-col gap-[5px]">
              <span className="text-[13px] font-medium text-[#1a1a18]">Reference</span>
              <input
                className="h-[40px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[16px] md:text-[14px] text-[#1a1a18]"
                value={form.settlement_reference}
                onChange={(event) => set({ settlement_reference: event.target.value })}
                placeholder="The bank reference or receipt number"
                disabled={saving}
              />
              <span className="text-[12px] text-[#5a5a52]">So the money can be found again later.</span>
            </label>
          )}

          <label className="flex flex-col gap-[5px]">
            <span className="text-[13px] font-medium text-[#1a1a18]">Why the money is going back</span>
            <textarea
              className="rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[16px] md:text-[14px] leading-[1.5] text-[#1a1a18]"
              rows={3}
              value={form.refund_reason}
              onChange={(event) => set({ refund_reason: event.target.value })}
              placeholder="Two doors were priced at the wrong size"
              disabled={saving}
            />
            <span className="text-[12px] text-[#5a5a52]">
              The customer is told this, so write it for them. You can edit the whole email before it sends.
            </span>
          </label>

          {error && (
            <p className="rounded-[6px] border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-[12.5px] leading-[1.5] text-[#991b1b]">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
