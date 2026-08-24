"use client";

// The customer desk.
//
// Header across the top, every communication down the left, the selected one
// and the reply on the right. Chosen from three layouts because it answers the
// question the desk exists for: a customer who vanished for five months and
// came back, and where the conversation was left off.
//
// The list is NOT just email. Quotes sent, quotes approved, payments, website
// enquiries and quote requests all sit in it, in time order, because "what has
// happened with these people" is one question and it used to need four screens.

import PushDetailsModal from "../../_components/PushDetailsModal";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import TermsEditor from "../../_components/TermsEditor";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { customerFieldLabel } from "../../../../lib/pcd-customer-utils";
import { CLOSURE_REASONS, closureReasonLabel } from "../../../../lib/pcd-ticket-closure";
import { Modal } from "@/components/ui/Modal";

const KIND_MARK = { inbound: "↙", outbound: "↗", note: "★", system: "⚙" };
const KIND_WORD = { inbound: "From customer", outbound: "Sent by us", note: "Internal note", system: "System" };

// What the filter offers. Named the way a person would describe them rather
// than by the column value: nobody looks for "outbound".
const KIND_OPTIONS = [
  { value: "inbound", label: "From the customer" },
  { value: "outbound", label: "Sent by us" },
  { value: "note", label: "Internal notes" },
  { value: "system", label: "Quotes, orders and forms" },
];
const ALL_KINDS = KIND_OPTIONS.map((option) => option.value);

function initialsOf(name, email) {
  const source = String(name || "").trim() || String(email || "");
  const parts = source.split(/[\s@.]+/).filter(Boolean).slice(0, 2);
  return parts.map((word) => word[0]?.toUpperCase() || "").join("") || "?";
}

function money(value) {
  return `$${(Number(value) || 0).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function dayLabel(iso) {
  if (!iso) return "Undated";
  const date = new Date(iso);
  const today = new Date();
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

function timeLabel(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

export default function CustomerDeskClient({ customerId, initial }) {
  const { toast } = useToast();
  const [desk, setDesk] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.entries[0]?.id || null);
  const [mode, setMode] = useState("reply");
  const [draft, setDraft] = useState("");
  // Starting something new rather than answering what is on screen. A message
  // about a different job should not be filed under whatever was last spoken
  // about, so this opens its own conversation with its own subject.
  const [composingNew, setComposingNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  // Everything, until somebody narrows it. An empty selection is treated as
  // "everything" as well: a filter that can hide the entire list with one
  // stray click, and then look like a customer with no history, is worse than
  // no filter.
  const [kinds, setKinds] = useState(ALL_KINDS);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...initial.customer });
  // Other records that read as this same person. Their quotes, orders and
  // messages are already inside everything on this page; this is only so it is
  // obvious which addresses reach them, and so a link can be undone from the
  // same place it shows up.
  const contacts = (initial.contacts || []).filter((c) => c.id !== initial.customer?.id);
  const [separating, setSeparating] = useState("");
  // The contact waiting on a yes or no. Nothing happens until it is confirmed.
  const [confirmSeparate, setConfirmSeparate] = useState(null);

  // Where a reply on the open conversation will actually go. A thread belongs to
  // the record the message came in on, so answering the partner goes back to the
  // partner rather than to the main contact. A new conversation has nobody to
  // reply to, so it goes to the main contact.
  const emailForTicket = (ticketId) => {
    const ticket = (initial.tickets || []).filter((t) => t.id === ticketId)[0];
    const owner = (initial.contacts || []).filter((c) => c.id === ticket?.customer_id)[0];
    return owner?.email || initial.customer?.email || "";
  };

  const { customer, entries, pendingChanges, quotes, orders, stats } = desk;
  const selected = entries.find((entry) => entry.id === selectedId) || entries[0] || null;

  // Giving a linked contact its own record back. Nothing was moved when they
  // were linked, so this is only deleting the link: every quote, order and
  // message is already sitting where it was written.
  async function separate(contactId) {
    setConfirmSeparate(null);
    setSeparating(contactId);
    try {
      const res = await fetch("/api/admin/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "separate", customerId: contactId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: data.error || "Could not separate them.", variant: "error" });
        return;
      }
      await refresh();
      toast({ title: "Separated. It is its own record again, with everything it always had." });
    } catch (error) {
      toast({ title: error?.message || "Could not separate them.", variant: "error" });
    } finally {
      setSeparating("");
    }
  }

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/customer-desk/${customerId}`, { cache: "no-store" });
    const payload = await res.json();
    if (payload.ok) {
      setDesk(payload);
      setForm({ ...payload.customer });
    }
  }, [customerId]);

  const visible = useMemo(() => {
    if (!kinds.length || kinds.length === ALL_KINDS.length) return entries;
    return entries.filter((entry) => kinds.includes(entry.kind));
  }, [entries, kinds]);

  // Grouped by day, which is what makes a long history readable: the gap
  // between February and August is visible rather than being one more row.
  // Grouped AFTER filtering, so a day header never sits above nothing.
  const grouped = useMemo(() => {
    const out = [];
    let currentDay = null;
    for (const entry of visible) {
      const day = dayLabel(entry.occurred_at);
      if (day !== currentDay) {
        out.push({ type: "day", label: day, key: `day:${day}` });
        currentDay = day;
      }
      out.push({ type: "entry", entry, key: entry.id });
    }
    return out;
  }, [visible]);

  // Closing a conversation draws a line at today. It is not a dismissal: the
  // mail sync reopens a ticket on any inbound message, so the same person
  // writing next month brings this straight back.
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState("spam");
  const [closeDetail, setCloseDetail] = useState("");

  async function closeConversation() {
    const ticketId = selected?.ticket_id;
    if (!ticketId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: closeReason, detail: closeDetail }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        toast({ title: payload.error || "Could not close it.", variant: "error" });
        return;
      }
      setClosing(false);
      setCloseDetail("");
      setCloseReason("spam");
      await refresh();
      toast({ title: "Closed. A new email from them brings it back." });
    } catch (error) {
      toast({ title: error?.message || "Could not close it.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = draft.replace(/<[^>]*>/g, "").trim();
    if (!text) {
      toast({ title: mode === "note" ? "Write the note first." : "Write a reply first.", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customer-desk/${customerId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: mode,
          body_html: draft,
          new_ticket: composingNew,
          ticket_id: composingNew ? null : selected?.ticket_id || null,
          subject: composingNew ? newSubject : selected?.subject || "",
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        toast({ title: payload.error || "Could not send.", variant: "error" });
        return;
      }
      setDraft("");
      setNewSubject("");
      setComposingNew(false);
      await refresh();
      toast({
        title: mode === "note" ? "Note saved. Not sent." : composingNew ? "Message sent." : "Reply sent.",
        variant: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  async function resolveChange(id, action) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customer-desk/${customerId}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        toast({ title: payload.error || "Could not save.", variant: "error" });
        return;
      }
      await refresh();
      toast({ title: action === "apply" ? "Record updated." : "Kept what we had.", variant: "success" });
    } finally {
      setBusy(false);
    }
  }

  // Saved, then asked. The record is the thing being edited, so it is written
  // first and unconditionally; whether the customer's JOBS should follow is a
  // separate question with a separate answer, and one that has to be asked
  // because a job is allowed to have its own address on purpose.
  const [pushOpen, setPushOpen] = useState(false);

  async function saveCustomer() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customer-desk/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        toast({ title: payload.error || "Could not save.", variant: "error" });
        return;
      }
      await refresh();
      setEditing(false);
      toast({ title: "Customer saved.", variant: "success" });
      // The modal works out for itself whether anything would actually change,
      // and closes with "nothing to push" when nothing would. Opening it
      // unconditionally keeps that decision in one place.
      setPushOpen(true);
    } finally {
      setBusy(false);
    }
  }

  const isNote = mode === "note";
  const details = [
    customer.email,
    customer.phone,
    [customer.site_suburb, customer.site_postcode].filter(Boolean).join(" "),
  ].filter(Boolean);

  return (
    <div className="flex min-h-full flex-col md:h-full md:min-h-0 md:overflow-hidden">
      {/* ── header, fixed in place ─────────────────────────────────────── */}
      <div className="flex-none border-b border-[#e2e0d8] bg-white px-4 py-4 md:px-6">
        <div className="mb-2 text-[12px] text-[#9a978d]">
          <Link href="/admin/customers" className="hover:text-[#1a1a18] hover:underline">Customers</Link>
          <span> / {customer.name || customer.email}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-[11px] bg-[#1c2b1e] text-[15px] font-bold text-white">
            {initialsOf(customer.name, customer.email)}
          </div>
          <div className="min-w-0">
            <div className="text-[18px] font-bold leading-tight tracking-[-0.02em] text-[#1a1a18]">
              {customer.name || customer.email || "Customer"}
            </div>
            {/* Everything that reaches this person, on one line. The other
                addresses sit with the first one because that is what they are:
                another way to reach the same customer, not a separate thing. */}
            <div className="mt-[1px] flex flex-wrap items-center gap-x-[7px] gap-y-[2px] text-[12.5px] text-[#56534b]">
              {details.map((detail, index) => (
                <span key={detail} className="inline-flex items-center gap-x-[7px]">
                  {index > 0 && <span className="text-[#c9c5b8]">·</span>}
                  {detail}
                </span>
              ))}

              {contacts.map((contact, index) => (
                <span key={contact.id} className="inline-flex items-center gap-x-[7px]">
                  {(details.length > 0 || index > 0) && <span className="text-[#c9c5b8]">·</span>}
                  <span className="text-[#8b8a81]">
                    also {contact.email || contact.name || "no email"}
                  </span>
                  {/* Quiet, and only sharpens on hover: undoing a link is rare
                      and reversible, so it should never look like the point of
                      the header. */}
                  <button
                    type="button"
                    disabled={separating === contact.id}
                    onClick={() => setConfirmSeparate(contact)}
                    title="Give this contact its own record back. Nothing was moved when they were linked, so nothing is lost."
                    className="text-[11px] text-[#b5b3aa] underline decoration-dotted underline-offset-2 transition-colors hover:text-[#1a1a18] disabled:opacity-50"
                  >
                    {separating === contact.id ? "separating" : "separate"}
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex gap-5">
            {[
              ["Open", stats.open],
              ["Messages", stats.messages],
              ["Ordered", money(stats.ordered)],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#9a978d]">{label}</div>
                <div className="font-mono text-[17px] font-bold tracking-[-0.02em] text-[#1a1a18]">{value}</div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setEditing((open) => !open)}
            className="h-[30px] rounded-[7px] border border-[#ddd9cf] bg-white px-3 text-[12.5px] font-semibold text-[#1a1a18] hover:bg-[#f7f6f1]"
          >
            {editing ? "Close" : "Edit customer"}
          </button>
        </div>

        {editing ? (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-[9px] border border-[#eeece5] bg-[#fbfbf9] p-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["name", "Name"],
              ["phone", "Phone"],
              ["company_name", "Company"],
              ["site_street", "Street"],
              ["site_suburb", "Suburb"],
              ["site_postcode", "Postcode"],
            ].map(([field, label]) => (
              <label key={field} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9a978d]">{label}</span>
                <input
                  value={form[field] || ""}
                  onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                  className="h-[32px] rounded-[6px] border border-[#ddd9cf] bg-white px-2.5 text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9a978d]">
                Email, the anchor
              </span>
              <input
                value={customer.email || ""}
                readOnly
                title="Every message and form match is filed against this address, so it cannot be changed here."
                className="h-[32px] rounded-[6px] border border-[#ddd9cf] bg-[#f4f3ee] px-2.5 text-[13px] text-[#56534b]"
              />
              {/* THE ONE FIELD THAT IS NOT A DETAIL. It is the identity every
                  message and form match is filed against, which is why it is
                  locked here while a quote and an order each let you change
                  where THEIR paperwork goes. Same word, different job, and the
                  two screens looked like they contradicted each other until
                  both of them said so. */}
              <span className="mt-[3px] text-[10.5px] leading-[1.45] text-[#9a978d]">
                Locked: every message and form match is filed against it. A quote or an order can still be sent to a
                different address without changing this.
              </span>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={saveCustomer}
                disabled={busy}
                className="h-[32px] rounded-[7px] bg-[#1c2b1e] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : null}

        {/* Details that arrived and disagree. Nothing was overwritten. */}
        {pendingChanges.length ? (
          <div className="mt-4 rounded-[9px] border border-[#e8daa8] bg-[#fdf8e7] px-4 py-3">
            <div className="text-[13px] font-bold text-[#6b5209]">
              {pendingChanges.length === 1 ? "1 change waiting" : `${pendingChanges.length} changes waiting`}
            </div>
            <div className="mt-[2px] text-[12px] leading-relaxed text-[#6b5209]">
              New details arrived that do not match the record. Blank fields fill themselves in; these already had a
              value, so nothing has changed.
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {pendingChanges.map((change) => (
                <div key={change.id} className="flex flex-wrap items-center gap-3 rounded-[7px] bg-white/70 px-3 py-2">
                  <span className="text-[12px] font-semibold text-[#8a7c52]">{customerFieldLabel(change.field)}</span>
                  <span className="text-[12.5px] text-[#9a978d] line-through">{change.current_value}</span>
                  <span className="text-[12.5px] text-[#6b5209]">&rarr;</span>
                  <span className="text-[12.5px] font-bold text-[#1a1a18]">{change.proposed_value}</span>
                  {change.source_label ? (
                    <span className="text-[11px] text-[#8a7c52]">from {change.source_label}</span>
                  ) : null}
                  <span className="flex-1" />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resolveChange(change.id, "apply")}
                    className="h-[26px] rounded-[6px] bg-[#b8860b] px-3 text-[11.5px] font-semibold text-white disabled:opacity-50"
                  >
                    Use the new one
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resolveChange(change.id, "dismiss")}
                    className="h-[26px] rounded-[6px] border border-[#ddd9cf] bg-white px-3 text-[11.5px] font-semibold text-[#56534b] disabled:opacity-50"
                  >
                    Keep what we have
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── body ───────────────────────────────────────────────────────── */}
      <div className="grid flex-1 grid-cols-1 items-stretch gap-0 md:min-h-0 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* comms list: its own scroll, so the page never grows with it */}
        <div className="flex max-h-[70vh] flex-col border-b border-[#e2e0d8] bg-white md:min-h-0 lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="border-b border-[#eeece5] px-4 py-3">
            <div className="text-[15px] font-bold tracking-[-0.015em] text-[#1a1a18]">Communications</div>
            <div className="text-[11.5px] text-[#9a978d]">
              {visible.length === entries.length
                ? `${entries.length} for ${customer.email || "this customer"}`
                : `${visible.length} of ${entries.length} shown`}
            </div>

            <div className="mt-2.5">
              {/* A count rather than pills: four pills wrap in a 340px rail and
                  shove the list down the page every time the filter changes. */}
              <Dropdown
                multiple
                selectAll
                display="count"
                clearable={false}
                options={KIND_OPTIONS}
                value={kinds}
                onChange={setKinds}
                placeholder="Everything"
                containerClassName="w-full"
              />
            </div>

            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setComposingNew(true); setMode("reply"); setDraft(""); setNewSubject(""); }}
                className="h-[27px] rounded-[6px] bg-[#1c2b1e] px-3 text-[11.5px] font-semibold text-white hover:bg-[#26382a]"
              >
                New message
              </button>
              <button
                type="button"
                onClick={() => { setComposingNew(true); setMode("note"); setDraft(""); setNewSubject(""); }}
                className="h-[27px] rounded-[6px] border border-[#e8daa8] bg-[#fdf8e7] px-3 text-[11.5px] font-semibold text-[#6b5209] hover:bg-[#f8f0d8]"
              >
                New note
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {grouped.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12.5px] text-[#9a978d]">
                {entries.length ? (
                  <>
                    Nothing matches this filter.
                    <br />
                    <button
                      type="button"
                      onClick={() => setKinds(ALL_KINDS)}
                      className="mt-2 text-[12.5px] font-semibold text-[#2d5e28] underline underline-offset-2"
                    >
                      Show everything
                    </button>
                  </>
                ) : (
                  "Nothing yet. Emails appear here once the mailbox syncs."
                )}
              </div>
            ) : (
              grouped.map((row) =>
                row.type === "day" ? (
                  <div
                    key={row.key}
                    className="sticky top-0 border-b border-[#eeece5] bg-[#fbfbf9] px-4 py-[6px] text-[10px] font-bold uppercase tracking-[0.09em] text-[#9a978d]"
                  >
                    {row.label}
                  </div>
                ) : (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => setSelectedId(row.entry.id)}
                    className={`flex w-full items-center gap-2.5 border-b border-l-[3px] border-[#eeece5] px-4 py-2.5 text-left ${
                      row.entry.id === selected?.id
                        ? "border-l-[#6b9e61] bg-[#edf4eb]"
                        : "border-l-transparent hover:bg-[#faf9f6]"
                    }`}
                  >
                    <span
                      className={`grid h-[20px] w-[20px] flex-shrink-0 place-items-center rounded-[6px] border text-[10px] font-bold ${
                        row.entry.kind === "note"
                          ? "border-[#e8daa8] bg-[#fdf8e7] text-[#6b5209]"
                          : row.entry.kind === "outbound"
                          ? "border-[#b6cfae] bg-[#edf4eb] text-[#2d5e28]"
                          : row.entry.kind === "system"
                          ? "border-[#d8dee6] bg-[#eef1f5] text-[#4a5666]"
                          : "border-[#e2cbe9] bg-[#f3e8f7] text-[#6d3d80]"
                      }`}
                    >
                      {KIND_MARK[row.entry.kind] || "•"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-[#1a1a18]">
                        {row.entry.subject || "(no subject)"}
                      </span>
                      <span className="block text-[11px] text-[#9a978d]">{KIND_WORD[row.entry.kind]}</span>
                    </span>
                    <span className="flex-shrink-0 font-mono text-[11px] text-[#9a978d]">
                      {timeLabel(row.entry.occurred_at)}
                    </span>
                  </button>
                )
              )
            )}
          </div>
        </div>

        {/* detail and reply: the only part that scrolls */}
        <div className="min-w-0 bg-[#f4f5f2] p-4 md:min-h-0 md:overflow-y-auto md:p-5">
          {composingNew ? (
            <div
              className={`overflow-hidden rounded-[11px] border ${
                isNote ? "border-[#e8daa8] bg-[#fdf8e7]" : "border-[#e2e0d8] bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-[#eeece5] px-5 py-3.5">
                <span className="text-[15px] font-bold tracking-[-0.015em] text-[#1a1a18]">
                  {isNote ? "New internal note" : "New message"}
                </span>
                <span className="flex-1" />
                <span className="text-[11.5px] text-[#9a978d]">
                  {isNote
                    ? "Saved here only. Never emailed."
                    : `Goes to ${(composingNew ? customer.email : emailForTicket(selected?.ticket_id)) || "the customer"}`}
                </span>
                <button
                  type="button"
                  onClick={() => { setComposingNew(false); setDraft(""); setNewSubject(""); setMode("reply"); }}
                  className="h-[26px] rounded-[6px] border border-[#ddd9cf] bg-white px-2.5 text-[11.5px] font-semibold text-[#56534b] hover:bg-[#f7f6f1]"
                >
                  Cancel
                </button>
              </div>

              <div className="px-5 pt-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9a978d]">
                    {isNote ? "What is this note about" : "Subject"}
                  </span>
                  <input
                    value={newSubject}
                    onChange={(event) => setNewSubject(event.target.value)}
                    placeholder={isNote ? "e.g. Check benchtop rate before quoting" : "e.g. Pantry doors, added to your job"}
                    className="h-[34px] rounded-[6px] border border-[#ddd9cf] bg-white px-3 text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
                  />
                </label>
              </div>

              <div className="px-5 pb-2 pt-3">
                <TermsEditor
                  value={draft}
                  onChange={setDraft}
                  placeholder={isNote ? "A note for you and the team. The customer never sees this." : "Write your message..."}
                  height={180}
                  ariaLabel={isNote ? "New internal note" : "New message"}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 border-t border-[#eeece5] bg-[#fbfbf9] px-5 py-3.5">
                <button
                  type="button"
                  onClick={send}
                  disabled={busy}
                  className={`h-[32px] rounded-[7px] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50 ${
                    isNote ? "bg-[#b8860b]" : "bg-[#1c2b1e]"
                  }`}
                >
                  {busy ? "Working..." : isNote ? "Save note" : "Send message"}
                </button>
                <span className="text-[11.5px] text-[#9a978d]">
                  This starts a new conversation rather than continuing an existing one.
                </span>
              </div>
            </div>
          ) : selected ? (
            <div
              className={`overflow-hidden rounded-[11px] border ${
                selected.kind === "note" ? "border-[#e8daa8] bg-[#fdf8e7]" : "border-[#e2e0d8] bg-white"
              }`}
            >
              <div className="px-5 pt-4">
                <div className="text-[17px] font-bold tracking-[-0.02em] text-[#1a1a18]">
                  {selected.subject || "(no subject)"}
                </div>
                <div className="flex flex-wrap gap-1.5 border-b border-[#eeece5] pb-3.5 pt-2">
                  <span className="rounded-full border border-[#e2e0d8] bg-[#f2f1ec] px-2.5 py-[2px] text-[10.5px] font-semibold text-[#56534b]">
                    {KIND_WORD[selected.kind]}
                  </span>
                  {selected.kind === "note" ? (
                    <span className="rounded-full border border-[#e8daa8] bg-[#fdf8e7] px-2.5 py-[2px] text-[10.5px] font-semibold text-[#6b5209]">
                      The customer never sees this
                    </span>
                  ) : null}
                  {selected.quote_id ? (
                    <Link
                      href={`/admin/quotes/${selected.quote_id}`}
                      className="rounded-full border border-[#c3dcf2] bg-[#eef4fa] px-2.5 py-[2px] text-[10.5px] font-semibold text-[#185fa5] hover:underline"
                    >
                      Open the quote
                    </Link>
                  ) : null}
                  {selected.order_id ? (
                    <Link
                      href={`/admin/orders/${selected.order_id}`}
                      className="rounded-full border border-[#c3dcf2] bg-[#eef4fa] px-2.5 py-[2px] text-[10.5px] font-semibold text-[#185fa5] hover:underline"
                    >
                      Open the order
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="flex gap-3 px-5 pt-4">
                <span className="grid h-[36px] w-[36px] flex-shrink-0 place-items-center rounded-full border border-[#e2e0d8] bg-[#f4f3ee] text-[12px] font-bold text-[#56534b]">
                  {initialsOf(selected.actor, selected.from_email)}
                </span>
                <span>
                  <span className="block text-[14px] font-bold text-[#1a1a18]">{selected.actor}</span>
                  <span className="text-[12px] text-[#9a978d]">
                    {dayLabel(selected.occurred_at)} at {timeLabel(selected.occurred_at)}
                    {selected.from_email ? `  ·  ${selected.from_email}` : ""}
                  </span>
                </span>
              </div>

              <div
                className="pcd-rich-text px-5 py-3.5 text-[14px] leading-relaxed text-[#35332e]"
                dangerouslySetInnerHTML={{ __html: selected.body_html || "<p>(no content)</p>" }}
              />

              {selected.attachments?.length ? (
                <div className="px-5 pb-5">
                  <div className="mb-2 text-[12.5px] text-[#56534b]">
                    {selected.attachments.length} attachment{selected.attachments.length === 1 ? "" : "s"}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {selected.attachments.map((file) => (
                      <a
                        key={file.id}
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2.5 rounded-[9px] border border-[#c3dcf2] bg-[#fbfdff] px-3 py-2 hover:bg-[#eef4fa]"
                      >
                        <span className="text-[13px] font-semibold text-[#1a1a18]">{file.file_name}</span>
                        <span className="font-mono text-[11px] text-[#9a978d]">
                          {Math.max(1, Math.round((Number(file.size_bytes) || 0) / 1024))} KB
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* composer */}
              <div className="border-t border-[#eeece5] bg-[#fbfbf9] px-5 py-4">
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  {[
                    ["reply", "Reply"],
                    ["note", "Internal note"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      className={`rounded-[7px] border px-3 py-[5px] text-[12.5px] font-semibold ${
                        mode === value
                          ? value === "note"
                            ? "border-[#b8860b] bg-[#b8860b] text-white"
                            : "border-[#1c2b1e] bg-[#1c2b1e] text-white"
                          : "border-[#ddd9cf] bg-white text-[#56534b] hover:bg-[#f7f6f1]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="flex-1" />
                  <span className="text-[11.5px] text-[#9a978d]">
                    {isNote
                    ? "Saved here only. Never emailed."
                    : `Goes to ${(composingNew ? customer.email : emailForTicket(selected?.ticket_id)) || "the customer"}`}
                  </span>
                </div>

                <TermsEditor
                  value={draft}
                  onChange={setDraft}
                  placeholder={isNote ? "A note for you and the team. The customer never sees this." : "Write your reply..."}
                  height={150}
                  ariaLabel={isNote ? "Internal note" : "Reply"}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={send}
                    disabled={busy}
                    className={`h-[32px] rounded-[7px] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50 ${
                      isNote ? "bg-[#b8860b]" : "bg-[#1c2b1e]"
                    }`}
                  >
                    {busy ? "Working..." : isNote ? "Save note" : "Send reply"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft("")}
                    className="h-[32px] rounded-[7px] border border-[#ddd9cf] bg-white px-3 text-[12.5px] font-semibold text-[#56534b]"
                  >
                    Clear
                  </button>
                  {selected?.ticket_id && (
                    <button
                      type="button"
                      onClick={() => setClosing(true)}
                      disabled={busy}
                      className="ml-auto h-[32px] rounded-[7px] border border-[#ddd9cf] bg-white px-3 text-[12.5px] font-semibold text-[#56534b] disabled:opacity-50"
                    >
                      No reply needed
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[11px] border border-[#e2e0d8] bg-white px-6 py-14 text-center text-[13px] text-[#9a978d]">
              Nothing to show yet.
            </div>
          )}

          {/* quotes and orders */}
          {(quotes.length || orders.length) ? (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                ["Quotes", quotes, (row) => ({ ref: row.quote_number, sub: row.title, href: `/admin/quotes/${row.id}`, amount: row.total_inc_gst, status: row.status })],
                ["Orders", orders, (row) => ({ ref: row.order_number, sub: row.name, href: `/admin/orders/${row.id}`, amount: row.total_inc_gst, status: row.status })],
              ].map(([title, rows, shape]) => (
                <div key={title} className="overflow-hidden rounded-[10px] border border-[#e2e0d8] bg-white">
                  <div className="border-b border-[#eeece5] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#56534b]">
                    {title}
                  </div>
                  {rows.length === 0 ? (
                    <div className="px-4 py-5 text-center text-[12px] text-[#9a978d]">None yet.</div>
                  ) : (
                    rows.map((row) => {
                      const item = shape(row);
                      return (
                        <Link
                          key={row.id}
                          href={item.href}
                          className="flex items-center gap-3 border-b border-[#eeece5] px-4 py-2.5 last:border-b-0 hover:bg-[#faf9f6]"
                        >
                          <span className="min-w-0">
                            <span className="block font-mono text-[12.5px] font-bold text-[#1a1a18]">{item.ref}</span>
                            <span className="block truncate text-[11.5px] text-[#9a978d]">{item.sub}</span>
                          </span>
                          <span className="flex-1" />
                          <span className="font-mono text-[12.5px] font-bold text-[#1a1a18]">{money(item.amount)}</span>
                          <span className="rounded-full border border-[#e2e0d8] bg-[#f2f1ec] px-2 py-[1px] text-[10.5px] font-semibold text-[#56534b]">
                            {item.status}
                          </span>
                        </Link>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    {/* Separating is reversible, but it changes what this page shows and the
        button sits inches from the customer's name. Two steps, the same as
        every other consequence in the admin. */}
    <Modal
      open={Boolean(confirmSeparate)}
      onClose={() => setConfirmSeparate(null)}
      title="Separate this contact?"
      subtitle={confirmSeparate?.email || confirmSeparate?.name || ""}
      footer={
        <>
          <button
            type="button"
            onClick={() => setConfirmSeparate(null)}
            disabled={Boolean(separating)}
            className="h-[34px] rounded-[7px] border border-[#ddd9cf] bg-white px-4 text-[12.5px] font-semibold text-[#56534b] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => separate(confirmSeparate.id)}
            disabled={Boolean(separating)}
            className="h-[34px] rounded-[7px] bg-[#1c2b1e] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {separating ? "Separating…" : "Separate them"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-[#56534b]">
        <p>
          <b className="text-[#1a1a18]">{confirmSeparate?.email || confirmSeparate?.name}</b> becomes its own
          customer record again, with everything it always had on it.
        </p>
        <p>
          This page stops showing that record&apos;s quotes, orders and messages, and they move to the customer
          page for that address instead. They will also show as their own person on the board again.
        </p>
        <p className="rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 py-[10px] text-[12px]">
          Nothing is deleted and nothing moves. Linking them never moved a row, so this only stops the two
          records being read together. <b className="text-[#1a1a18]">You can link them again at any time.</b>
        </p>
      </div>
    </Modal>

    <Modal
      open={closing}
      onClose={() => setClosing(false)}
      title="Close this conversation"
      subtitle={selected?.subject || ""}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={() => setClosing(false)}
            disabled={busy}
            className="h-[34px] rounded-[7px] border border-[#ddd9cf] bg-white px-4 text-[12.5px] font-semibold text-[#56534b] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={closeConversation}
            disabled={busy || (closeReason === "other" && closeDetail.trim().length < 4)}
            className="h-[34px] rounded-[7px] bg-[#1c2b1e] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            Close it
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-[#5a5a52]">Why <span className="text-[#991b1b]">*</span></span>
          <div className="flex flex-wrap gap-[6px]">
            {CLOSURE_REASONS.map(reason => (
              <button
                key={reason.key}
                type="button"
                onClick={() => setCloseReason(reason.key)}
                className={`rounded-[6px] border px-3 py-[6px] text-[12px] font-medium ${
                  closeReason === reason.key
                    ? "border-[#1c2b1e] bg-[#1c2b1e] text-white"
                    : "border-[#dbd8cc] bg-white text-[#5a5a52] hover:bg-[#f5f8f4]"
                }`}
              >
                {reason.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]">
          Anything to add{closeReason === "other" ? "" : " (optional)"}
          <textarea
            rows={2}
            value={closeDetail}
            onChange={event => setCloseDetail(event.target.value)}
            placeholder={closeReason === "other" ? "Say why, in a few words." : "Only if it needs saying."}
            className="w-full rounded-[6px] border border-[#dbd8cc] px-3 py-2 text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
          />
        </label>

        <p className="rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 py-[10px] text-[11.5px] leading-[1.5] text-[#5a5a52]">
          This writes a note on the conversation saying it was closed as{" "}
          <b className="text-[#1a1a18]">{closureReasonLabel(closeReason).toLowerCase()}</b>, and draws a line at today.
          <b className="text-[#1a1a18]"> If they email again it comes straight back onto the board.</b>
        </p>
      </div>
    </Modal>

    <PushDetailsModal
      open={pushOpen}
      onClose={() => setPushOpen(false)}
      customerId={customerId}
      customerName={customer?.name}
      onDone={(updated) => {
        if (updated) {
          toast({
            title: `${updated} ${updated === 1 ? "job" : "jobs"} updated with the new details.`,
            variant: "success",
          });
        }
        refresh();
      }}
    />
    </div>
  );
}
