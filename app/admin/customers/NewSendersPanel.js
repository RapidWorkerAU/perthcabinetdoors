"use client";

// The New senders queue.
//
// An address nobody has decided about creates nothing. It waits here until
// somebody says Customer or Not a customer, and the answer is remembered
// forever. That keeps supplier statements out of the customer list without
// anybody having to write an ignore list in advance.
//
// WHY IT GROUPS BY DOMAIN. The first real sync produced 80 senders, and 46 of
// them were 35 business domains: polytec alone had five addresses. One decision
// per company turns that into a handful of clicks. Personal mail providers are
// kept apart and decided one address at a time, because a domain rule on
// gmail.com would answer for every customer you will ever have.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

// Where individuals have their email, as opposed to a company. A rule here must
// never be a domain rule.
const PERSONAL = new Set([
  "gmail.com", "hotmail.com", "hotmail.com.au", "outlook.com", "outlook.com.au",
  "yahoo.com", "yahoo.com.au", "bigpond.com", "bigpond.net.au", "live.com",
  "live.com.au", "icloud.com", "me.com", "iinet.net.au", "westnet.com.au",
  "iprimus.com.au", "optusnet.com.au", "tpg.com.au", "internode.on.net",
]);

const domainOf = (email) => String(email || "").split("@")[1]?.toLowerCase() || "";

export default function NewSendersPanel() {
  const { toast } = useToast();
  const [senders, setSenders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Shut by default. The queue is a job to do when there is time, not
  // something that should push the customers list down the page every visit.
  // The count in the strip is what makes it noticeable.
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/customer-desk/senders", { cache: "no-store" });
      const payload = await res.json();
      if (payload.ok) setSenders(payload.senders || []);
    } catch {
      // A queue that cannot load must not take the customers list with it.
    } finally {
      setLoaded(true);
    }
  }, []);

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
      setSenders(payload.senders || []);
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

  async function sync() {
    setSyncing(true);
    toast({ title: "Reading the mailbox. This can take a minute." });
    try {
      const res = await fetch("/api/admin/customer-desk/sync", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        toast({ title: payload.error || "Could not read the mailbox.", variant: "error" });
        return;
      }
      setSenders(payload.pendingSenders || []);
      toast({
        title: `${payload.added} new message${payload.added === 1 ? "" : "s"}, ${payload.awaiting} waiting on a decision.`,
        variant: "success",
      });
    } finally {
      setSyncing(false);
    }
  }

  if (!loaded) return null;

  const business = new Map();
  const personal = [];
  for (const sender of senders) {
    const domain = domainOf(sender.email);
    if (!domain || PERSONAL.has(domain)) {
      personal.push(sender);
      continue;
    }
    const group = business.get(domain) || { domain, senders: [], messages: 0 };
    group.senders.push(sender);
    group.messages += sender.message_count || 1;
    business.set(domain, group);
  }
  const groups = [...business.values()].sort((a, b) => b.messages - a.messages);

  return (
    <div className="mb-4 overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">New senders</span>
        {senders.length ? (
          <span className="rounded-full border border-[#dcbf55] bg-[#fff8df] px-2 py-[1px] text-[11px] font-semibold text-[#5c4200]">
            {senders.length} waiting
          </span>
        ) : (
          <span className="text-[12px] text-[#8b8a81]">All decided</span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="h-[27px] rounded-[7px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-semibold text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50"
        >
          {syncing ? "Reading..." : "Check mailbox"}
        </button>
        {senders.length ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="h-[27px] rounded-[7px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-semibold text-[#5a5a52] hover:bg-[#f5f8f4]"
          >
            {open ? "Hide" : `Show ${senders.length}`}
          </button>
        ) : null}
      </div>

      {open && senders.length ? (
        <div className="p-4">
          <p className="mb-3 text-[11.5px] leading-snug text-[#8b8a81]">
            These addresses have emailed and nobody has said whether they are customers. Nothing has been created for
            them, and their mail is sitting in Outlook untouched either way. Saying <strong>Customer</strong> files
            everything they have already sent.
          </p>

          {groups.length ? (
            <>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8b8a81]">
                Companies &mdash; one decision covers everyone there
              </div>
              <div className="mb-4 flex flex-col gap-2">
                {groups.map((group) => (
                  <div
                    key={group.domain}
                    className="flex flex-wrap items-center gap-3 rounded-[7px] border border-[#dbd8cc] px-3 py-[10px]"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#1a1a18]">{group.domain}</div>
                      <div className="text-[11.5px] text-[#8b8a81]">
                        {group.senders.length} address{group.senders.length === 1 ? "" : "es"} &middot; {group.messages}{" "}
                        message{group.messages === 1 ? "" : "s"} &middot;{" "}
                        {group.senders.slice(0, 2).map((s) => s.email.split("@")[0]).join(", ")}
                        {group.senders.length > 2 ? ", ..." : ""}
                      </div>
                    </div>
                    <span className="flex-1" />
                    <button
                      type="button"
                      disabled={busy === group.senders[0].email + "domain"}
                      onClick={() =>
                        decide({ email: group.senders[0].email, decision: "ignore", scope: "domain", label: group.domain })
                      }
                      className="h-[27px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[11.5px] font-semibold text-[#5a5a52] hover:bg-[#f5f8f4] disabled:opacity-50"
                    >
                      Not a customer
                    </button>
                    <button
                      type="button"
                      disabled={busy === group.senders[0].email + "domain"}
                      onClick={() =>
                        decide({ email: group.senders[0].email, decision: "customer", scope: "domain", label: group.domain })
                      }
                      className="h-[27px] rounded-[6px] bg-[#1c2b1e] px-3 text-[11.5px] font-semibold text-white hover:bg-[#26382a] disabled:opacity-50"
                    >
                      Customer
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {personal.length ? (
            <>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8b8a81]">
                Personal email &mdash; decided one at a time
              </div>
              <div className="flex flex-col gap-2">
                {personal.map((sender) => (
                  <div
                    key={sender.id}
                    className="flex flex-wrap items-center gap-3 rounded-[7px] border border-[#dbd8cc] px-3 py-[10px]"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#1a1a18]">
                        {sender.display_name || sender.email}
                      </div>
                      <div className="truncate text-[11.5px] text-[#8b8a81]">
                        {sender.display_name ? `${sender.email} · ` : ""}
                        {sender.message_count} message{sender.message_count === 1 ? "" : "s"}
                        {sender.last_subject ? ` · ${sender.last_subject}` : ""}
                      </div>
                    </div>
                    <span className="flex-1" />
                    <button
                      type="button"
                      disabled={busy === sender.email + "address"}
                      onClick={() =>
                        decide({ email: sender.email, decision: "ignore", scope: "address", label: sender.email })
                      }
                      className="h-[27px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[11.5px] font-semibold text-[#5a5a52] hover:bg-[#f5f8f4] disabled:opacity-50"
                    >
                      Not a customer
                    </button>
                    <button
                      type="button"
                      disabled={busy === sender.email + "address"}
                      onClick={() =>
                        decide({ email: sender.email, decision: "customer", scope: "address", label: sender.email })
                      }
                      className="h-[27px] rounded-[6px] bg-[#1c2b1e] px-3 text-[11.5px] font-semibold text-white hover:bg-[#26382a] disabled:opacity-50"
                    >
                      Customer
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
