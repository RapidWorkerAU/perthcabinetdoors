"use client";

// WHAT THIS CUSTOMER HAS PAID US.
//
// ── THE QUESTION IT ANSWERS ──────────────────────────────────────────────────
//
// "Has this customer paid us anything?" used to be answerable only by opening
// each of their orders in turn, and it still gave the wrong answer: a site
// measure fee is taken on the website months before there is an order, so it
// had no order to be found under and appeared nowhere on this page at all.
//
// ── PAID IS NOT OWED, AND NOT HELD ───────────────────────────────────────────
//
// Only money that actually reached us. A payment we have asked for and not
// received belongs on the order that is chasing it. A CREDIT is the opposite
// direction, money we are holding for them, and has its own card above this
// one: the two are next to each other on purpose, because "they paid us $100"
// and "we owe them $100 of work" are both true at once and mean different
// things.

import Link from "next/link";

const tw = {
  card: "overflow-hidden rounded-[10px] border border-[#e2e0d8] bg-white",
  head: "border-b border-[#eeece5] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#56534b] flex items-center justify-between gap-3",
  row: "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#eeece5] px-4 py-2.5 last:border-b-0",
  ref: "block text-[12.5px] font-semibold text-[#1a1a18]",
  sub: "block text-[11.5px] text-[#9a978d]",
  amount: "font-mono text-[12.5px] font-bold text-[#1a1a18] whitespace-nowrap",
};

const KIND_WORDS = {
  deposit: "Deposit",
  progress: "Progress",
  final: "Final",
  other: "Payment",
  site_measure: "Site measure",
  payment: "Payment",
};

function money(amount) {
  return Number(amount || 0).toLocaleString("en-AU", {
    style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function dayWords(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, day] = text.split("-").map(Number);
  // UTC off the parts, so a payment taken on the 24th never reads as the 23rd.
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-AU", {
    timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
  });
}

export default function CustomerPaymentsCard({ payments = [] }) {
  // No card at all rather than an empty one. A customer who has never paid us
  // has nothing to say about payments, and a row of "None yet" on every record
  // is noise on the ones that matter.
  if (!payments.length) return null;

  const total = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <div className={tw.card}>
      <div className={tw.head}>
        <span>Payments received</span>
        <span className="text-[11px] font-normal normal-case tracking-normal text-[#9a978d]">
          {money(total)} in total
        </span>
      </div>

      {payments.map((row) => {
        const body = (
          <>
            <span className="min-w-0 flex-1 basis-full sm:basis-auto">
              <span className={tw.ref}>{row.label}</span>
              <span className={tw.sub}>
                {[dayWords(row.paidOn), row.reference, row.against].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="hidden flex-1 sm:block" />
            <span className="rounded-full border border-[#e2e0d8] bg-[#f2f1ec] px-2 py-[1px] text-[10.5px] font-semibold text-[#56534b]">
              {KIND_WORDS[row.kind] || "Payment"}
            </span>
            <span className={tw.amount}>{money(row.amount)}</span>
          </>
        );

        return row.href ? (
          <Link key={row.id} href={row.href} className={`${tw.row} hover:bg-[#faf9f6]`}>
            {body}
          </Link>
        ) : (
          <div key={row.id} className={tw.row}>{body}</div>
        );
      })}
    </div>
  );
}
