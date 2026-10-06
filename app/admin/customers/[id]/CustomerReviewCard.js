"use client";

// WHETHER THIS CUSTOMER IS ASKED FOR A GOOGLE REVIEW.
//
// One tick, for trade customers and anybody it would be wrong to ask. If they
// pressed unsubscribe in a review email that shows here too, and cannot be
// undone from this screen: it was their choice, not ours.

import { useEffect, useState } from "react";

export default function CustomerReviewCard({ customerId }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/customers/${customerId}/review-requests`, { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        // No card on a database without the migration, rather than an error.
        if (payload.ok) setState(payload);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (!state) return null;

  async function toggle(never) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/review-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ never }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setError(payload.error || "Could not save.");
        return;
      }
      setState(payload);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-[#e2e0d8] bg-white">
      <div className="border-b border-[#eeece5] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#56534b]">
        Google reviews
      </div>
      <div className="flex flex-col gap-2 px-4 py-3 text-[12.5px] text-[#1a1a18]">
        <label className="flex items-center gap-2">
          <input
            id="review_requests_never"
            type="checkbox"
            className="h-[16px] w-[16px] accent-[#2d5e28]"
            checked={state.never}
            disabled={busy}
            onChange={(event) => toggle(event.target.checked)}
          />
          Never ask for reviews
        </label>
        <p className="text-[11.5px] text-[#9a978d]">
          {state.optedOutAt
            ? `They unsubscribed from review requests on ${new Date(state.optedOutAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}, so they are not asked either way.`
            : "When ticked, this customer's finished orders are not sent a review request. Other emails are not affected."}
        </p>
        {error ? <p className="text-[11.5px] text-[#9e2717]">{error}</p> : null}
      </div>
    </div>
  );
}
