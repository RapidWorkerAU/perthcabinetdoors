"use client";

// MONEY WE ARE HOLDING FOR THIS CUSTOMER.
//
// ── WHY IT IS ON THE CUSTOMER AND NOT ONLY ON A QUOTE ────────────────────────
//
// A credit with nowhere to go still shows here. Money we are holding must never
// be invisible: a customer who paid a site measure fee and never came back is
// still owed the value of it, and the only place that can be true is the record
// of the customer themselves.
//
// ── ONE ACTION NEEDS A REASON AND TWO DO NOT ─────────────────────────────────
//
// Release moves it between our own quotes; the customer holds the same amount
// before and after, so there is nothing to justify. Write off and refund TAKE
// money off somebody, so both ask why, and the answer is stored with who did it.
// Same line the variation override takes. See lib/pcd-customer-credits.js.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const tw = {
  card: "overflow-hidden rounded-[10px] border border-[#e2e0d8] bg-white",
  head: "border-b border-[#eeece5] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#56534b] flex items-center justify-between gap-3",
  row: "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#eeece5] px-4 py-2.5 last:border-b-0",
  ref: "block text-[12.5px] font-semibold text-[#1a1a18]",
  sub: "block text-[11.5px] text-[#9a978d]",
  amount: "font-mono text-[12.5px] font-bold text-[#1a1a18] whitespace-nowrap",
  btn: "h-[26px] rounded-[6px] border border-[#e2e0d8] bg-white px-2.5 text-[11px] font-medium text-[#1a1a18] hover:bg-[#faf9f6] disabled:opacity-50",
  danger: "h-[26px] rounded-[6px] border border-[#e3b3aa] bg-white px-2.5 text-[11px] font-medium text-[#9e2717] hover:bg-[#fceeeb] disabled:opacity-50",
};

const PILLS = {
  available: "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]",
  held: "border-[#fcd34d] bg-[#fffbeb] text-[#92400e]",
  spent: "border-[#e2e0d8] bg-[#f2f1ec] text-[#56534b]",
  written_off: "border-[#e3b3aa] bg-[#fceeeb] text-[#9e2717]",
  refunded: "border-[#e2e0d8] bg-[#f2f1ec] text-[#56534b]",
};

function money(amount, currency = "AUD") {
  return Number(amount || 0).toLocaleString("en-AU", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function stateWords(credit) {
  if (credit.state === "held") {
    return `Held by ${credit.pcd_quotes?.quote_number || "a quote"}`;
  }
  if (credit.state === "spent") {
    return `Spent on ${credit.pcd_orders?.order_number || "an order"}`;
  }
  if (credit.state === "written_off") return credit.closed_reason || "Written off";
  if (credit.state === "refunded") return credit.closed_reason || "Refunded";
  return "Ready to use";
}

export default function CustomerCreditsCard({ customerId, onChanged }) {
  const [credits, setCredits] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!customerId) return;
    try {
      const response = await fetch(`/api/admin/customers/${customerId}/credits`, { cache: "no-store" });
      const payload = await response.json();
      setCredits(response.ok && payload.ok ? payload.credits || [] : []);
    } catch {
      setCredits([]);
    } finally {
      setLoaded(true);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function act(creditId, action, why) {
    setBusyId(creditId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/customers/${customerId}/credits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credit_id: creditId, action, reason: why }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not change that credit.");
      setMessage(payload.message || "");
      setClosing(null);
      setReason("");
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(error?.message || "Could not change that credit.");
    } finally {
      setBusyId("");
    }
  }

  // Nothing at all, and nothing has ever been held. No empty card: a customer
  // who has never had a credit has nothing to say about credits.
  if (loaded && !credits.length) return null;

  const usable = credits.filter((c) => c.state === "available" || c.state === "held");
  const total = usable.reduce((sum, c) => sum + Number(c.amount || 0), 0);

  return (
    <div className={tw.card}>
      <div className={tw.head}>
        <span>Credits</span>
        <span className="text-[11px] font-normal normal-case tracking-normal text-[#9a978d]">
          {total > 0 ? `${money(total)} available or held` : "Nothing outstanding"}
        </span>
      </div>

      {!loaded ? (
        <div className="px-4 py-5 text-center text-[12px] text-[#9a978d]">Loading.</div>
      ) : (
        credits.map((credit) => (
          <div key={credit.id}>
            <div className={tw.row}>
              <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                <span className={tw.ref}>
                  {credit.reason === "site_measure" ? "Site measure fee" : "Credit"}
                  {credit.paid_on ? ` paid ${credit.paid_on}` : ""}
                </span>
                <span className={tw.sub}>
                  {credit.state === "held" && credit.held_quote_id ? (
                    <Link href={`/admin/quotes/${credit.held_quote_id}`} className="underline">
                      {stateWords(credit)}
                    </Link>
                  ) : credit.state === "spent" && credit.spent_order_id ? (
                    <Link href={`/admin/orders/${credit.spent_order_id}`} className="underline">
                      {stateWords(credit)}
                    </Link>
                  ) : (
                    stateWords(credit)
                  )}
                </span>
              </span>
              <span className="hidden flex-1 sm:block" />
              <span className={tw.amount}>{money(credit.amount, credit.currency)}</span>
              <span
                className={`rounded-full border px-2 py-[1px] text-[10.5px] font-semibold ${PILLS[credit.state] || PILLS.spent}`}
              >
                {credit.state.replace("_", " ")}
              </span>

              {credit.state === "held" ? (
                <button
                  type="button" className={tw.btn} disabled={busyId === credit.id}
                  onClick={() => act(credit.id, "release")}
                >
                  Release
                </button>
              ) : null}
              {credit.state === "available" || credit.state === "held" ? (
                <button
                  type="button" className={tw.danger} disabled={busyId === credit.id}
                  onClick={() => { setClosing({ id: credit.id, action: "write_off" }); setReason(""); }}
                >
                  Write off
                </button>
              ) : null}
            </div>

            {/* THE REASON, ASKED IN PLACE. Taking money off a customer is
                recorded with who did it and why, the same as a variation
                override. There is no way past it: closeCredit refuses without
                one, so this box is the only route. */}
            {closing?.id === credit.id ? (
              <div className="border-b border-[#eeece5] bg-[#fceeeb] px-4 py-3">
                <label className="block text-[11px] font-semibold text-[#9e2717]" htmlFor={`why-${credit.id}`}>
                  Why? Required. It is recorded against this customer.
                </label>
                <textarea
                  id={`why-${credit.id}`}
                  className="mt-1.5 w-full min-h-[54px] rounded-[6px] border border-[#e3b3aa] bg-white px-3 py-2 text-[13px] text-[#1a1a18] outline-none focus:border-[#9e2717]"
                  value={reason}
                  placeholder="e.g. Refunded by bank transfer on 2 October, Ian asked for it back."
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button" className={tw.danger}
                    disabled={!reason.trim() || busyId === credit.id}
                    onClick={() => act(credit.id, "write_off", reason.trim())}
                  >
                    Write it off
                  </button>
                  <button
                    type="button" className={tw.btn}
                    disabled={!reason.trim() || busyId === credit.id}
                    onClick={() => act(credit.id, "refund", reason.trim())}
                  >
                    Record as refunded
                  </button>
                  <button type="button" className={tw.btn} onClick={() => { setClosing(null); setReason(""); }}>
                    Cancel
                  </button>
                  <span className="text-[11px] text-[#9e2717]">
                    Recording a refund does not send one. Process it in Stripe.
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ))
      )}

      {message ? <p className="m-0 border-t border-[#eeece5] px-4 py-2.5 text-[12px] text-[#56534b]">{message}</p> : null}
    </div>
  );
}
