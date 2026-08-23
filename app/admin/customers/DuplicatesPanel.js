"use client";

// The same person, on more than one customer record.
//
// The mail sync makes a record from an address, so the same person writing from
// two addresses becomes two customers, and so does their partner answering on
// their behalf. Kristy Smith had a quote, an order and 17 messages under one
// address and 9 messages under another.
//
// MERGING MOVES NOTHING. One record is marked as belonging to the other and
// everything reads through that link. Separating them again is exact, because
// every quote, order and message is still sitting where it was written. That is
// why the wording here says "reads as a contact of" rather than "merged into".
//
// A record with nothing on it at all is a different thing. That is a typo in an
// address or a double created by accident, and merging one would keep a contact
// that never existed, so those are offered for deleting instead.
//
// ONE ROW PER PAIR, ONE FACT PER COLUMN. This started as a stack of cards, then
// became a table that still stacked the address over its history inside a cell.
// Both make a row taller than it needs to be and neither can be scanned down.
// A pair is two addresses, what is on each, and a decision: five columns.

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { AdminDataTable } from "@/components/ui/AdminDataTable";
import { AdminPagination, useAdminPagination } from "../_components/AdminPagination";
import { describeHistory, historyLine, isEmptyRecord } from "../../../lib/pcd-customer-links";

// Built with cn so a variant actually wins. Concatenating "bg-white ...
// bg-[#1c2b1e]" leaves both in the class list and lets the stylesheet order
// decide, which is how the Customer button came to be white text on white.
const ACTION = "h-[26px] rounded-[6px] border px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-50";
const quiet = cn(ACTION, "border-[#dbd8cc] bg-white text-[#1a1a18] hover:border-[#6b9e61]");
const strong = cn(ACTION, "border-[#1c2b1e] bg-[#1c2b1e] text-white hover:bg-[#2d3f2f] hover:border-[#2d3f2f]");
const danger = cn(ACTION, "border-[#fca5a5] bg-white text-[#991b1b] hover:bg-[#fef5f5]");

// Whichever record holds the most is the one to keep, which is nearly always
// right and saves a decision on every row.
const weigh = (record) => Object.values(record?.counts || {}).reduce((total, n) => total + Number(n || 0), 0);

export default function DuplicatesPanel({ onCount }) {
  const { toast } = useToast();
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [search, setSearch] = useState("");
  // Which way round a pair goes. Only set when somebody has swapped it, so the
  // sensible default stays the default.
  const [flipped, setFlipped] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/customers/merge", { cache: "no-store" });
      const data = await res.json();

      // A group of three is two decisions, not one, so it becomes two rows
      // against whichever record is the strongest.
      const rows = [];
      for (const group of data?.duplicates || []) {
        const ordered = [...group.records].sort((a, b) => weigh(b) - weigh(a));
        const [keep, ...rest] = ordered;
        for (const other of rest) rows.push({ id: `${keep.id}:${other.id}`, name: group.name, keep, other });
      }
      setPairs(rows);
      if (onCount) onCount(rows.length);
    } catch {
      setPairs([]);
      if (onCount) onCount(0);
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => { load(); }, [load]);

  async function send(body, done) {
    setBusy(body.customerId);
    try {
      const res = await fetch("/api/admin/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: data.error || "Could not do that.", variant: "error" });
        return;
      }
      toast({ title: done });
      await load();
    } catch (error) {
      toast({ title: error?.message || "Could not do that.", variant: "error" });
    } finally {
      setBusy("");
    }
  }

  // The pair as it currently reads, after any swap.
  const sides = (pair) =>
    flipped[pair.id] ? { keep: pair.other, other: pair.keep } : { keep: pair.keep, other: pair.other };

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? pairs.filter((pair) =>
        `${pair.name} ${pair.keep.email || ""} ${pair.other.email || ""}`.toLowerCase().includes(needle)
      )
    : pairs;

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(filtered, search);

  const columns = [
    {
      id: "name",
      header: "Name",
      className: "capitalize font-medium text-[#1a1a18] whitespace-nowrap",
      cell: (pair) => pair.name,
    },
    {
      id: "keep",
      header: "Main contact",
      className: "text-[#1a1a18]",
      cell: (pair) => sides(pair).keep?.email || sides(pair).keep?.name || "no email",
    },
    {
      id: "keepHistory",
      header: "On it",
      className: "text-[#8b8a81] whitespace-nowrap",
      cell: (pair) => historyLine(sides(pair).keep?.counts),
    },
    {
      id: "other",
      header: "Becomes a contact",
      className: "text-[#5a5a52]",
      cell: (pair) => sides(pair).other?.email || sides(pair).other?.name || "no email",
    },
    {
      id: "otherHistory",
      header: "On it",
      className: "text-[#8b8a81] whitespace-nowrap",
      cell: (pair) => historyLine(sides(pair).other?.counts),
    },
    {
      id: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      cell: (pair) => {
        const { keep, other } = sides(pair);
        return (
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              className={quiet}
              title="Swap which one is the main contact"
              onClick={() => setFlipped((current) => ({ ...current, [pair.id]: !current[pair.id] }))}
            >
              Swap
            </button>
            {isEmptyRecord(other.counts) && (
              <button
                type="button"
                disabled={busy === other.id}
                className={danger}
                title="Nothing has ever been on this record"
                onClick={() => setConfirming({ kind: "delete", record: other })}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              disabled={busy === other.id}
              className={strong}
              onClick={() => setConfirming({ kind: "merge", record: other, into: keep })}
            >
              Link
            </button>
          </span>
        );
      },
    },
  ];

  const mobileCard = (pair) => {
    const { keep, other } = sides(pair);
    return (
      <article className="rounded-[8px] border border-[#dbd8cc] bg-white p-4">
        <p className="text-[13px] font-semibold capitalize text-[#1a1a18]">{pair.name}</p>
        <dl className="mt-2 flex flex-col gap-2 text-[12px]">
          <div>
            <dt className="text-[#8b8a81]">Main contact</dt>
            <dd className="text-[#1a1a18]">{keep?.email || keep?.name || "no email"}</dd>
            <dd className="text-[11px] text-[#8b8a81]">{historyLine(keep?.counts)}</dd>
          </div>
          <div>
            <dt className="text-[#8b8a81]">Becomes a contact</dt>
            <dd className="text-[#1a1a18]">{other?.email || other?.name || "no email"}</dd>
            <dd className="text-[11px] text-[#8b8a81]">{historyLine(other?.counts)}</dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap justify-end gap-1.5 border-t border-[#edf4eb] pt-3">
          <button type="button" className={quiet} onClick={() => setFlipped((c) => ({ ...c, [pair.id]: !c[pair.id] }))}>
            Swap
          </button>
          {isEmptyRecord(other.counts) && (
            <button type="button" className={danger} onClick={() => setConfirming({ kind: "delete", record: other })}>
              Delete
            </button>
          )}
          <button
            type="button"
            className={strong}
            onClick={() => setConfirming({ kind: "merge", record: other, into: keep })}
          >
            Link
          </button>
        </div>
      </article>
    );
  };

  return (
    <>
      <p className="mb-3 text-[12px] leading-[1.5] text-[#8b8a81]">
        Matched on the name only, so check before you act: two people can share one. Linking moves nothing, and
        separating them again puts everything straight back.
      </p>

      <AdminDataTable
        rows={pageItems}
        columns={columns}
        getRowId={(pair) => pair.id}
        getRowLabel={(pair) => pair.name}
        loading={loading}
        emptyTitle="No duplicates to look at"
        emptyDescription="Every customer record has a name of its own."
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search a name or address"
        mobileCard={mobileCard}
        pagination={totalItems > 0 ? (
          <AdminPagination
            label="possible duplicates"
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        ) : undefined}
      />

      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title={confirming?.kind === "delete" ? "Delete this record?" : "Link these records?"}
        subtitle={confirming?.record?.email || confirming?.record?.name || ""}
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={Boolean(busy)}
              className="h-[34px] rounded-[7px] border border-[#ddd9cf] bg-white px-4 text-[12.5px] font-semibold text-[#56534b] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                const { kind, record, into } = confirming;
                setConfirming(null);
                if (kind === "merge") {
                  send({ action: "merge", customerId: record.id, intoId: into?.id }, "Linked. Separating them puts it straight back.");
                } else {
                  send({ action: "delete", customerId: record.id }, "Deleted. It had nothing on it.");
                }
              }}
              className={cn(
                "h-[34px] rounded-[7px] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50",
                confirming?.kind === "delete" ? "bg-[#991b1b]" : "bg-[#1c2b1e]"
              )}
            >
              {busy ? "Working…" : confirming?.kind === "delete" ? "Delete it" : "Link them"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-[#56534b]">
          {confirming?.kind === "merge" && (
            <>
              <p>
                <b className="text-[#1a1a18]">{confirming.record?.email || confirming.record?.name}</b> will read as
                a contact of <b className="text-[#1a1a18]">{confirming.into?.name || confirming.into?.email}</b>.
                They become one customer on the board, on the customer page and in every list.
              </p>
              <p>
                It holds {describeHistory(confirming.record?.counts)}. All of it stays exactly where it is and shows
                on the main contact&apos;s page from now on.
              </p>
              <p className="rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 py-[10px] text-[12px]">
                Nothing moves and nothing is deleted.
                <b className="text-[#1a1a18]"> Separating them again puts it straight back.</b>
              </p>
            </>
          )}

          {confirming?.kind === "delete" && (
            <>
              <p>
                The record for <b className="text-[#1a1a18]">{confirming.record?.email || "this contact"}</b> is
                removed for good.
              </p>
              <p>
                It has <b className="text-[#1a1a18]">{describeHistory(confirming.record?.counts)}</b>, which is why
                deleting is offered at all: there is nothing on it to lose. It is checked again on the way through,
                so if anything has landed on it since this page loaded, the delete is refused.
              </p>
              <p className="rounded-[6px] border border-[#fca5a5] bg-[#fef5f5] px-3 py-[10px] text-[12px] text-[#991b1b]">
                <b>This one cannot be undone.</b> If you are not sure, link it as a contact instead.
              </p>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
