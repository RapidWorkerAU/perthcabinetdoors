"use client";

// KEEPING THE CUSTOMER POSTED, on the order's Overview.
//
// When we last wrote to them, when the next update is due, and Alfred's draft
// or question if he has one waiting. Counted from the last real email: a quote,
// an invoice or an automatic email does not count. See lib/pcd-alfred-updates.js.

import Link from "next/link";
import { AlfredMark, ALFRED } from "@/components/admin/AlfredMark";

function day(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-AU", { timeZone: "Australia/Perth", day: "numeric", month: "long" });
}

export default function AlfredPostedPanel({ posted, customerName }) {
  if (!posted) return null;
  const first = String(customerName || "").trim().split(/\s+/)[0] || "the customer";
  const last = posted.lastContactAt ? `Last email to ${first} was ${day(posted.lastContactAt)}, ${posted.daysSince} day${posted.daysSince === 1 ? "" : "s"} ago.` : `Nobody has written to ${first} about this order yet.`;
  const next =
    posted.dueIn > 0
      ? `The next update is due within ${posted.dueIn} day${posted.dueIn === 1 ? "" : "s"} (the limit is ${posted.gap}).`
      : `The ${posted.gap} day limit has been reached.`;

  return (
    <div className="col-span-2 rounded-[6px] border px-3 py-2.5 text-[12px] leading-snug" style={{ borderColor: ALFRED.border, background: ALFRED.bg, color: "#2b2342" }}>
      <div className="mb-1 flex items-center gap-2 font-semibold" style={{ color: ALFRED.ink }}>
        <AlfredMark title="Alfred" />
        Keeping {first} posted
      </div>
      <p className="m-0">
        {last} {next}
        {posted.draftId ? " Alfred has drafted an update for you to check." : ""}
        {!posted.draftId && posted.question ? ` Alfred has a question first: ${posted.question.question}` : ""}
        {!posted.enabled ? " Alfred's order updates are switched off in Settings." : ""}
      </p>
      {posted.draftId || posted.question ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {posted.draftId ? (
            <Link
              href={`/admin/alfred/waiting?draft=${posted.draftId}`}
              className="inline-flex h-[26px] items-center whitespace-nowrap rounded-[6px] px-3 text-[11px] font-semibold text-white"
              style={{ background: ALFRED.strong }}
            >
              Open draft
            </Link>
          ) : null}
          {!posted.draftId && posted.question ? (
            <Link
              href="/admin/alfred/questions"
              className="inline-flex h-[26px] items-center whitespace-nowrap rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[11px] font-medium text-[#1a1a18]"
            >
              Answer the question
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
