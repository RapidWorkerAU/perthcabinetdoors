"use client";

// Contacts that already read as somebody else.
//
// A reference list, not a queue: these are the ones that are already right. It
// lives on its own tab because it only grows. Every merge anybody ever makes
// stays here forever, so as a section under the duplicates table it would have
// been fine at five and unusable at fifty.
//
// Its own table, its own search, its own pages.

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { AdminDataTable } from "@/components/ui/AdminDataTable";
import { AdminPagination, useAdminPagination } from "../_components/AdminPagination";
import { historyLine } from "../../../lib/pcd-customer-links";

const action = cn(
  "h-[26px] rounded-[6px] border px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-50",
  "border-[#dbd8cc] bg-white text-[#1a1a18] hover:border-[#6b9e61]"
);

export default function LinkedContactsPanel({ onCount }) {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/customers/merge", { cache: "no-store" });
      const data = await res.json();
      const linked = data?.linked || [];
      setRows(linked);
      if (onCount) onCount(linked.length);
    } catch {
      setRows([]);
      if (onCount) onCount(0);
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => { load(); }, [load]);

  async function separate(customerId) {
    setBusy(customerId);
    try {
      const res = await fetch("/api/admin/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "separate", customerId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: data.error || "Could not separate them.", variant: "error" });
        return;
      }
      toast({ title: "Separated. It is its own record again, with everything it always had." });
      await load();
    } catch (error) {
      toast({ title: error?.message || "Could not separate them.", variant: "error" });
    } finally {
      setBusy("");
    }
  }

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(({ secondary, primary }) =>
        `${secondary.email || ""} ${secondary.name || ""} ${primary?.email || ""} ${primary?.name || ""}`
          .toLowerCase()
          .includes(needle)
      )
    : rows;

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(filtered, search);

  const columns = [
    {
      id: "contact",
      header: "Contact",
      className: "font-medium text-[#1a1a18]",
      cell: ({ secondary }) => secondary.email || secondary.name || "no email",
    },
    {
      id: "history",
      header: "On it",
      className: "text-[#5a5a52] whitespace-nowrap",
      cell: ({ secondary }) => historyLine(secondary.counts),
    },
    {
      id: "primary",
      header: "Reads as",
      className: "text-[#5a5a52]",
      cell: ({ primary }) => primary?.name || primary?.email || "another record",
    },
    {
      id: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      cell: ({ secondary, primary }) => (
        <button
          type="button"
          disabled={busy === secondary.id}
          className={action}
          onClick={() => setConfirming({ record: secondary, into: primary })}
        >
          Separate
        </button>
      ),
    },
  ];

  const mobileCard = ({ secondary, primary }) => (
    <article className="rounded-[8px] border border-[#dbd8cc] bg-white p-4">
      <p className="text-[13px] font-semibold text-[#1a1a18]">{secondary.email || secondary.name || "no email"}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        <div>
          <dt className="text-[#8b8a81]">Reads as</dt>
          <dd className="text-[#1a1a18]">{primary?.name || primary?.email || "another record"}</dd>
        </div>
        <div>
          <dt className="text-[#8b8a81]">On it</dt>
          <dd className="text-[#1a1a18]">{historyLine(secondary.counts)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex justify-end border-t border-[#edf4eb] pt-3">
        <button type="button" className={action} onClick={() => setConfirming({ record: secondary, into: primary })}>
          Separate
        </button>
      </div>
    </article>
  );

  return (
    <>
      <p className="mb-3 text-[12px] leading-[1.5] text-[#8b8a81]">
        These records already read as somebody else. Their quotes, orders and messages are still on their own record
        and show on the main contact&apos;s page. Separating one puts it back exactly as it was.
      </p>

      <AdminDataTable
        rows={pageItems}
        columns={columns}
        getRowId={({ secondary }) => secondary.id}
        getRowLabel={({ secondary }) => secondary.email || "contact"}
        loading={loading}
        emptyTitle="Nothing is linked"
        emptyDescription="No customer record has been made a contact of another."
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search either address"
        mobileCard={mobileCard}
        pagination={totalItems > 0 ? (
          <AdminPagination
            label="linked contacts"
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
        title="Separate this contact?"
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
                const id = confirming.record.id;
                setConfirming(null);
                separate(id);
              }}
              className="h-[34px] rounded-[7px] bg-[#1c2b1e] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Working…" : "Separate them"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-[#56534b]">
          <p>
            <b className="text-[#1a1a18]">{confirming?.record?.email || confirming?.record?.name}</b> becomes its own
            customer record again, with everything it always had on it.
          </p>
          <p>
            It stops showing on{" "}
            <b className="text-[#1a1a18]">{confirming?.into?.name || confirming?.into?.email}</b>&apos;s page, and
            shows as its own person on the board again.
          </p>
          <p className="rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 py-[10px] text-[12px]">
            Nothing is deleted and nothing moves.
            <b className="text-[#1a1a18]"> You can link them again at any time.</b>
          </p>
        </div>
      </Modal>
    </>
  );
}
