"use client";

import { useEffect, useMemo, useState } from "react";
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { AdminPagination, useAdminPagination } from "../_components/AdminPagination";
import { ActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";
import { AdminDataTable } from "@/components/ui/AdminDataTable";
import { tableStyles as t } from "@/components/ui/table-styles";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import AdminLoading from "@/components/admin/AdminLoading";
import { cn } from "@/lib/utils";

const EMPTY_DRAFT = {
  id: null,
  name: "",
  cost_per_sqm_ex_gst: "",
  is_active: true,
};

const inputClass = "h-[36px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[13px] text-[#1a1a18] outline-none transition-colors focus:border-[#6b9e61]";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function rowFromDraft(draft) {
  return {
    name: draft.name.trim(),
    cost_per_sqm_ex_gst: Number(draft.cost_per_sqm_ex_gst) || 0,
    is_active: !!draft.is_active,
  };
}

export default function BenchtopMaterialsManager() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/benchtop-materials", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not load benchtop materials.");
      setRows(data.materials || []);
    } catch (error) {
      toast({ title: error?.message || "Could not load benchtop materials.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...rows]
      .sort((a, b) => {
        const sort = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (sort) return sort;
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .filter((row) => !q || [row.name, money(row.cost_per_sqm_ex_gst), row.is_active ? "Active" : "Hidden"].some((value) => String(value).toLowerCase().includes(q)));
  }, [rows, searchQuery]);

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(filteredRows, searchQuery);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function openAddModal() {
    setDraft(EMPTY_DRAFT);
    setIsModalOpen(true);
  }

  function openEditModal(row) {
    setDraft({
      ...EMPTY_DRAFT,
      ...row,
      id: row.id,
      cost_per_sqm_ex_gst: row.cost_per_sqm_ex_gst ?? "",
      is_active: row.is_active !== false,
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    if (!isSaving) setIsModalOpen(false);
  }

  async function saveRow(event) {
    event.preventDefault();
    if (!draft.name.trim()) {
      toast({ title: "Enter a material name.", variant: "error" });
      return;
    }
    setIsSaving(true);
    try {
      const payload = rowFromDraft(draft);
      const res = await fetch("/api/admin/benchtop-materials", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.id ? { id: draft.id, ...payload } : payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not save benchtop material.");
      setRows((current) => (draft.id ? current.map((row) => (row.id === data.material.id ? data.material : row)) : [data.material, ...current]));
      setDraft(EMPTY_DRAFT);
      setIsModalOpen(false);
      toast({ title: draft.id ? "Benchtop material updated." : "Benchtop material added." });
    } catch (error) {
      toast({ title: error?.message || "Could not save benchtop material.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRow() {
    if (!rowToDelete) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/benchtop-materials?id=${encodeURIComponent(rowToDelete.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not delete benchtop material.");
      setRows((current) => current.filter((row) => row.id !== rowToDelete.id));
      setRowToDelete(null);
      toast({ title: "Benchtop material deleted." });
    } catch (error) {
      toast({ title: error?.message || "Could not delete benchtop material.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  const modalFooter = (
    <>
      <Button type="button" variant="neutral" onClick={closeModal} disabled={isSaving}>
        Cancel
      </Button>
      <Button type="submit" form="benchtop-material-form" loading={isSaving} loadingText="Saving...">
        {draft.id ? "Update material" : "Save material"}
      </Button>
    </>
  );

  function statusPill(row) {
    return (
      <span className={cn(
        "inline-flex rounded-full border px-2 py-[3px] text-[11px] font-semibold",
        row.is_active ? "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]" : "border-[#dbd8cc] bg-[#f5f5f4] text-[#5a5a52]"
      )}>
        {row.is_active ? "Active" : "Hidden"}
      </span>
    );
  }

  // One menu for the table and the phone card, so they cannot offer different things.
  function actionMenu(row) {
    return (
      <ActionMenu label={`Open actions for ${row.name}`} size="sm">
        <ActionMenuItem icon={<IconEdit size={14} />} disabled={isSaving} onClick={() => openEditModal(row)}>
          Edit
        </ActionMenuItem>
        <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isSaving} onClick={() => setRowToDelete(row)}>
          Delete
        </ActionMenuItem>
      </ActionMenu>
    );
  }

  const columns = [
    { id: "name", header: "Material", className: "font-medium", cell: (row) => row.name },
    { id: "cost", header: "$/sqm ex GST", className: t.num, cell: (row) => money(row.cost_per_sqm_ex_gst) },
    { id: "status", header: "Status", cell: statusPill },
    { id: "actions", header: "Actions", cell: actionMenu },
  ];

  function renderMobileCard(row) {
    return (
      <article className={t.mobileCard}>
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={() => openEditModal(row)} className="min-w-0 text-left text-[14px] font-semibold text-[#1a1a18]">
            {row.name}
          </button>
          {statusPill(row)}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#edf4eb] pt-3 text-[12px]">
          <span>
            <span className="text-[#8b8a81]">$/sqm ex GST </span>
            <span className={cn(t.num, "text-[#1a1a18]")}>{money(row.cost_per_sqm_ex_gst)}</span>
          </span>
          {actionMenu(row)}
        </div>
      </article>
    );
  }

  // First load owns the whole content area. A refresh with materials already on
  // screen leaves them there rather than blanking the page.
  if (loading && !rows.length) {
    return <AdminLoading steps={["Loading benchtop materials", "Almost there"]} label="Loading benchtop materials" />;
  }

  return (
    <>
      <div className="p-4 md:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-[#1a1a18]">Benchtop Materials</h1>
            <p className="mt-[2px] text-[13px] text-[#5a5a52]">Manage the ex-GST sqm rates used by the design tool and quote imports.</p>
          </div>
          <IconButton label="Add benchtop material" tooltip="Add benchtop material" variant="primary" size="md" className="md:hidden" onClick={openAddModal}>
            <IconPlus size={18} />
          </IconButton>
        </div>

        {/* Search, add, a row that opens the editor and one menu: exactly what
            the shared table does, so it draws the table and the phone cards. */}
        <AdminDataTable
          wide
          rows={pageItems}
          columns={columns}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.name}
          onRowClick={openEditModal}
          emptyTitle={rows.length ? "No benchtop materials match your search." : "No benchtop materials yet."}
          emptyDescription={rows.length ? undefined : "Add your first material."}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search benchtop materials"
          primaryAction={
            // The phone already has the add button beside the page title.
            <button type="button" onClick={openAddModal} className="hidden h-[34px] items-center gap-2 rounded-[6px] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] md:inline-flex">
              <IconPlus size={15} />
              Add material
            </button>
          }
          mobileCard={renderMobileCard}
          pagination={<AdminPagination label="benchtop materials" page={page} pageCount={pageCount} totalItems={totalItems} onPageChange={setPage} />}
        />
      </div>

      <Modal open={isModalOpen} onClose={closeModal} title={draft.id ? "Edit benchtop material" : "Add benchtop material"} subtitle="Set material name, sqm rate and status." size="md" footer={modalFooter}>
        <form id="benchtop-material-form" onSubmit={saveRow} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
            Material name
            <input className={inputClass} value={draft.name} placeholder="e.g. Engineered Stone 20mm" onChange={(event) => updateDraft("name", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
            $/sqm ex GST
            <input className={inputClass} type="number" min="0" step="0.01" value={draft.cost_per_sqm_ex_gst} onChange={(event) => updateDraft("cost_per_sqm_ex_gst", event.target.value)} />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-normal text-[#1a1a18]">
            <input type="checkbox" checked={draft.is_active} onChange={(event) => updateDraft("is_active", event.target.checked)} className="accent-[#6b9e61]" />
            Active
          </label>
        </form>
      </Modal>

      <ConfirmModal
        open={!!rowToDelete}
        onClose={() => !isSaving && setRowToDelete(null)}
        title={rowToDelete ? `Delete ${rowToDelete.name}?` : "Delete benchtop material?"}
        description="This removes the benchtop material from the catalogue. Existing quotes that already copied the rate will not be changed."
        confirmLabel="Delete"
        variant="danger"
        loading={isSaving}
        onConfirm={deleteRow}
      />
    </>
  );
}
