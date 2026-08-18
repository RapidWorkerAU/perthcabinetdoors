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

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import TermsEditor from "../../_components/TermsEditor";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { customerFieldLabel } from "../../../../lib/pcd-customer-utils";

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

  const { customer, entries, pendingChanges, quotes, orders, stats } = desk;
  const selected = entries.find((entry) => entry.id === selectedId) || entries[0] || null;

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
    } finally {
      setBusy(false);
    }
  }

  const isNote = mode === "note";

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
            <div className="mt-[1px] text-[12.5px] text-[#56534b]">
              {[customer.email, customer.phone, [customer.site_suburb, customer.site_postcode].filter(Boolean).join(" ")]
                .filter(Boolean)
                .join("  ·  ")}
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
                  {isNote ? "Saved here only. Never emailed." : `Goes to ${customer.email || "the customer"}`}
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
                    {isNote ? "Saved here only. Never emailed." : `Goes to ${customer.email || "the customer"}`}
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
    </div>
  );
}
