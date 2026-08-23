"use client";

// The New senders queue.
//
// An address nobody has decided about creates nothing. It waits here until
// somebody says Customer or Not a customer, and the answer is remembered
// forever. That keeps supplier statements out of the customer list without
// anybody having to write an ignore list in advance.
//
// WHY THE DOMAIN STILL MATTERS. The first real sync produced 80 senders, and 46
// of them were 35 business domains: polytec alone had five addresses. One
// decision covering a whole company turns that into a handful of clicks, so the
// domain is a column and the whole-company action sits on the row. Personal mail
// providers never get that offer, because a rule on gmail.com would answer for
// every customer you will ever have.
//
// It used to be a collapsed block of grouped cards sitting on top of the
// customer table. It is a list of decisions, so it is a table.

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { AdminDataTable } from "@/components/ui/AdminDataTable";

// Where individuals have their email, as opposed to a company. A rule here must
// never be a domain rule.
const PERSONAL = new Set([
  "gmail.com", "hotmail.com", "hotmail.com.au", "outlook.com", "outlook.com.au",
  "yahoo.com", "yahoo.com.au", "bigpond.com", "bigpond.net.au", "live.com",
  "live.com.au", "icloud.com", "me.com", "iinet.net.au", "westnet.com.au",
  "iprimus.com.au", "optusnet.com.au", "tpg.com.au", "internode.on.net",
]);

const domainOf = (email) => String(email || "").split("@")[1]?.toLowerCase() || "";

// Built with cn so a variant actually wins. Concatenating "bg-white ...
// bg-[#1c2b1e]" leaves BOTH in the class list and lets the stylesheet order
// decide which applies, so the Customer button rendered as white text on a
// white box: invisible, and one of two buttons on every row.
const ACTION = "h-[26px] rounded-[6px] border px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-50";
const quiet = cn(ACTION, "border-[#dbd8cc] bg-white text-[#1a1a18] hover:border-[#6b9e61]");
const strong = cn(ACTION, "border-[#1c2b1e] bg-[#1c2b1e] text-white hover:bg-[#2d3f2f] hover:border-[#2d3f2f]");

export default function NewSendersPanel({ onCount }) {
  const { toast } = useToast();
  const [senders, setSenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/customer-desk/senders", { cache: "no-store" });
      const payload = await res.json();
      const rows = payload.ok ? payload.senders || [] : [];
      setSenders(rows);
      if (onCount) onCount(rows.length);
    } catch {
      setSenders([]);
      if (onCount) onCount(0);
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => { load(); }, [load]);

  async function decide({ email, decision, scope, label }) {
    setBusy(email + scope);
    try {
      const res = await fetch("/api/admin/customer-desk/senders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, decision, scope }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        toast({ title: payload.error || "Could not save that.", variant: "error" });
        return;
      }
      const rows = payload.senders || [];
      setSenders(rows);
      if (onCount) onCount(rows.length);
      toast({
        title:
          decision === "customer"
            ? `${label} added. ${payload.added} message${payload.added === 1 ? "" : "s"} filed.`
            : `${label} will never create a ticket again.`,
        variant: "success",
      });
    } finally {
      setBusy("");
    }
  }

  // catchUpDays reaches back past the cursor, for mail an older version of the
  // sync skipped. A normal run resumes from where the last one finished.
  async function sync(catchUpDays = 0) {
    setSyncing(true);
    toast({ title: catchUpDays ? "Re-reading the mailbox. This can take a few minutes." : "Reading the mailbox. This can take a minute." });
    try {
      const res = await fetch("/api/admin/customer-desk/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(catchUpDays ? { catchUpDays } : {}),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        toast({ title: payload.error || "Could not read the mailbox.", variant: "error" });
        return;
      }
      const rows = payload.pendingSenders || [];
      setSenders(rows);
      if (onCount) onCount(rows.length);
      // If it stopped at its ceiling the mailbox is still ahead of us, and
      // saying "done" at that point is the exact failure this replaced.
      toast({
        title: payload.capped
          ? `${payload.added} message${payload.added === 1 ? "" : "s"} filed, and there is more still to read. Run it again.`
          : `${payload.added} new message${payload.added === 1 ? "" : "s"}, ${payload.awaiting} waiting on a decision.`,
        variant: payload.capped ? "error" : "success",
      });
    } finally {
      setSyncing(false);
    }
  }

  // How many other addresses share this one's domain, so the whole-company
  // action can say what it will cover.
  const shareDomain = (email) => {
    const domain = domainOf(email);
    if (!domain || PERSONAL.has(domain)) return 0;
    return senders.filter((s) => domainOf(s.email) === domain).length;
  };

  const needle = search.trim().toLowerCase();
  const rows = needle
    ? senders.filter((s) => `${s.email} ${s.display_name || ""}`.toLowerCase().includes(needle))
    : senders;

  const buttons = (sender) => {
    const domain = domainOf(sender.email);
    const company = shareDomain(sender.email);
    const busyAddress = busy === sender.email + "address";
    const busyDomain = busy === sender.email + "domain";
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          disabled={busyAddress}
          className={quiet}
          onClick={() => decide({ email: sender.email, decision: "ignore", scope: "address", label: sender.email })}
        >
          Not a customer
        </button>
        <button
          type="button"
          disabled={busyAddress}
          className={strong}
          onClick={() => decide({ email: sender.email, decision: "customer", scope: "address", label: sender.email })}
        >
          Customer
        </button>
        {/* One decision for a whole company, where it IS a company. */}
        {company > 1 && (
          <button
            type="button"
            disabled={busyDomain}
            className={quiet}
            title={`Applies to all ${company} addresses at ${domain}`}
            onClick={() => decide({ email: sender.email, decision: "ignore", scope: "domain", label: domain })}
          >
            Ignore all {company} at {domain}
          </button>
        )}
      </span>
    );
  };

  const columns = [
    {
      id: "sender",
      header: "Sender",
      cell: (sender) => (
        <span className="flex flex-col leading-[1.35]">
          <span className="font-medium text-[#1a1a18]">{sender.display_name || sender.email}</span>
          {sender.display_name && <span className="text-[11px] text-[#8b8a81]">{sender.email}</span>}
        </span>
      ),
    },
    {
      id: "domain",
      header: "Domain",
      cell: (sender) => {
        const domain = domainOf(sender.email);
        const company = shareDomain(sender.email);
        return (
          <span className="text-[12px] text-[#5a5a52]">
            {domain || "-"}
            {company > 1 && <span className="ml-1.5 text-[11px] text-[#8b8a81]">{company} addresses</span>}
          </span>
        );
      },
    },
    {
      id: "messages",
      header: "Waiting",
      className: "whitespace-nowrap",
      cell: (sender) => `${sender.message_count || 1} message${(sender.message_count || 1) === 1 ? "" : "s"}`,
    },
    {
      id: "actions",
      header: "",
      className: "text-right",
      cell: buttons,
    },
  ];

  const mobileCard = (sender) => (
    <article className="rounded-[8px] border border-[#dbd8cc] bg-white p-4">
      <p className="text-[13px] font-semibold text-[#1a1a18]">{sender.display_name || sender.email}</p>
      {sender.display_name && <p className="text-[12px] text-[#5a5a52]">{sender.email}</p>}
      <p className="mt-1 text-[11.5px] text-[#8b8a81]">
        {domainOf(sender.email) || "no domain"} · {sender.message_count || 1} message
        {(sender.message_count || 1) === 1 ? "" : "s"} waiting
      </p>
      <div className="mt-3 border-t border-[#edf4eb] pt-3">{buttons(sender)}</div>
    </article>
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="max-w-[70ch] text-[12px] leading-[1.5] text-[#8b8a81]">
          These addresses have emailed and nobody has said whether they are customers. Nothing has been created for
          them either way. Saying <b className="text-[#1a1a18]">Customer</b> files everything they have already sent.
        </p>
        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => sync()} disabled={syncing} className={quiet}>
            {syncing ? "Reading…" : "Check mailbox"}
          </button>
          {/* For mail an older version of the sync skipped. It reaches back past
              the cursor and re-reads, which is safe: a message already on file
              is refused by the database rather than duplicated. */}
          <button
            type="button"
            onClick={() => sync(90)}
            disabled={syncing}
            title="Re-read the last 90 days, for anything an earlier sync missed"
            className={quiet}
          >
            Re-read 90 days
          </button>
        </span>
      </div>

      <AdminDataTable
        rows={rows}
        columns={columns}
        getRowId={(sender) => sender.email}
        getRowLabel={(sender) => sender.email}
        loading={loading}
        emptyTitle="Nothing waiting on a decision"
        emptyDescription="Every address that has written in has been decided about."
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search sender or domain"
        mobileCard={mobileCard}
      />
    </>
  );
}
