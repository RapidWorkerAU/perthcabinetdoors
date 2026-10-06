"use client";

import { useState } from "react";

// THE NOTE UNDER THE ORDER STATUS, ONCE AN ORDER IS COMPLETE.
//
// Says whether a Google review request is lined up, when it goes and to whom,
// or why it will not. The words come from the server, worked out by the same
// rules the daily job sends by (lib/pcd-review-requests.js), so this note and
// what actually happens cannot disagree.

const TONES = {
  waiting: "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]",
  due: "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]",
  sent: "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]",
  owing: "border-[#f0d060] bg-[#fff8df] text-[#5c4200]",
  no_email: "border-[#f0d060] bg-[#fff8df] text-[#5c4200]",
};
const QUIET = "border-[#dbd8cc] bg-[#f5f8f4] text-[#5a5a52]";

const btn =
  "inline-flex h-[26px] items-center justify-center px-3 text-[11px] font-medium rounded-[6px] border border-[#dbd8cc] bg-white text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors";

export default function ReviewRequestPanel({ orderId, status, request, onChanged, toast }) {
  const [busy, setBusy] = useState("");

  // Orders finished before the switch went on are never asked, and saying so on
  // every old job would be noise.
  if (!request || request.key === "not_complete" || request.key === "before_switch") return null;
  if (status !== "complete" && request.key !== "sent") return null;

  async function act(action) {
    setBusy(action);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/review-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        toast({ title: payload.error || "Could not update the review request.", variant: "error" });
        return;
      }
      toast({
        title:
          action === "send"
            ? "Review request sent."
            : action === "skip"
              ? "No review request for this order."
              : "Review request lined up again.",
        variant: "success",
      });
      await onChanged();
    } finally {
      setBusy("");
    }
  }

  const canSkip = ["waiting", "due", "owing", "no_email"].includes(request.key);
  const canSend = ["waiting", "due"].includes(request.key);
  const canUndo = request.key === "skipped" && request.skippedReason === "staff";

  return (
    <div className={`col-span-2 rounded-[6px] border px-3 py-2.5 text-[12px] leading-snug ${TONES[request.key] || QUIET}`}>
      <p>
        <span className="font-semibold">{request.label}</span>
        {request.key === "sent" && request.clickedAt ? " They clicked the review link." : ""}
      </p>
      {request.problem && request.key !== "off" ? (
        <p className="mt-1 text-[#991b1b]">{request.problem} Fix it in Settings, Business Defaults.</p>
      ) : null}
      {canSkip || canSend || canUndo ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {canSkip ? (
            <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => act("skip")}>
              {busy === "skip" ? "Saving..." : "Don't send for this order"}
            </button>
          ) : null}
          {canSend ? (
            <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => act("send")}>
              {busy === "send" ? "Sending..." : "Send now"}
            </button>
          ) : null}
          {canUndo ? (
            <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => act("unskip")}>
              {busy === "unskip" ? "Saving..." : "Line it up again"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
