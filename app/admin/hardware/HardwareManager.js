"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconEdit, IconPlus, IconSearch, IconTrash, IconUpload } from "@tabler/icons-react";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { AdminPagination, useAdminPagination } from "../_components/AdminPagination";
import { ActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

const HARDWARE_TYPES = [
  { value: "handle", label: "Handle" },
  { value: "hinge", label: "Hinge" },
  { value: "drawer_runner", label: "Drawer runner" },
];

const EMPTY_DRAFT = {
  id: null,
  type: "handle",
  brand: "",
  name: "",
  sku: "",
  description: "",
  image_url: "",
  original_image_url: "",
  image_path: "",
  unit_cost_ex_gst: "",
  width_mm: "",
  height_mm: "",
  depth_mm: "",
  length_mm: "",
  hole_spacing_mm: "",
  projection_mm: "",
  is_active: true,
};

const inputClass = "h-[36px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[13px] text-[#1a1a18] outline-none transition-colors focus:border-[#6b9e61]";
const mutedDisabledClass = "disabled:border-[#edf4eb] disabled:bg-[#f5f5f4] disabled:text-[#9a988f]";

function typeLabel(type) {
  return HARDWARE_TYPES.find((item) => item.value === type)?.label || "Hardware";
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function cleanFileName(name) {
  return String(name || "hardware")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function isFieldApplicable(type, field) {
  if (type === "handle") return ["width_mm", "height_mm", "depth_mm", "length_mm", "hole_spacing_mm", "projection_mm"].includes(field);
  if (type === "hinge") return ["width_mm", "height_mm", "depth_mm", "projection_mm"].includes(field);
  if (type === "drawer_runner") return ["length_mm", "height_mm", "depth_mm"].includes(field);
  return true;
}

function dimensionLabel(row) {
  const parts = [];
  if (row.length_mm) parts.push(`L ${row.length_mm}mm`);
  if (row.width_mm) parts.push(`W ${row.width_mm}mm`);
  if (row.height_mm) parts.push(`H ${row.height_mm}mm`);
  if (row.depth_mm) parts.push(`D ${row.depth_mm}mm`);
  if (row.hole_spacing_mm) parts.push(`CC ${row.hole_spacing_mm}mm`);
  if (row.projection_mm) parts.push(`Proj ${row.projection_mm}mm`);
  return parts.length ? parts.join(" · ") : "-";
}

function rowFromDraft(draft, image) {
  return {
    type: draft.type,
    brand: draft.brand.trim(),
    name: draft.name.trim(),
    sku: draft.sku.trim(),
    description: draft.description.trim(),
    image_url: image.imageUrl,
    image_path: image.imagePath || draft.image_path || null,
    unit_cost_ex_gst: Number(draft.unit_cost_ex_gst) || 0,
    width_mm: isFieldApplicable(draft.type, "width_mm") ? Number(draft.width_mm) || null : null,
    height_mm: isFieldApplicable(draft.type, "height_mm") ? Number(draft.height_mm) || null : null,
    depth_mm: isFieldApplicable(draft.type, "depth_mm") ? Number(draft.depth_mm) || null : null,
    length_mm: isFieldApplicable(draft.type, "length_mm") ? Number(draft.length_mm) || null : null,
    hole_spacing_mm: isFieldApplicable(draft.type, "hole_spacing_mm") ? Number(draft.hole_spacing_mm) || null : null,
    projection_mm: isFieldApplicable(draft.type, "projection_mm") ? Number(draft.projection_mm) || null : null,
    is_active: !!draft.is_active,
  };
}

export default function HardwareManager() {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hardware", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not load hardware.");
      setRows(data.hardware || []);
    } catch (error) {
      toast({ title: error?.message || "Could not load hardware.", variant: "error" });
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
        const t = String(a.type || "").localeCompare(String(b.type || ""));
        if (t) return t;
        const s = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (s) return s;
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .filter((row) => {
        const searchable = [row.type, typeLabel(row.type), row.brand, row.name, row.sku, row.description, dimensionLabel(row)];
        return (!typeFilter || row.type === typeFilter) && (!q || searchable.filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
      });
  }, [rows, searchQuery, typeFilter]);

  const filterKey = `${searchQuery}|${typeFilter}`;
  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(filteredRows, filterKey);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function openAddModal(type = "handle") {
    setDraft({ ...EMPTY_DRAFT, type });
    setSelectedFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsModalOpen(true);
  }

  function openEditModal(row) {
    setDraft({
      ...EMPTY_DRAFT,
      ...row,
      id: row.id,
      image_url: row.image_url || "",
      original_image_url: row.image_url || "",
      image_path: row.image_path || "",
      unit_cost_ex_gst: row.unit_cost_ex_gst ?? "",
      width_mm: row.width_mm ?? "",
      height_mm: row.height_mm ?? "",
      depth_mm: row.depth_mm ?? "",
      length_mm: row.length_mm ?? "",
      hole_spacing_mm: row.hole_spacing_mm ?? "",
      projection_mm: row.projection_mm ?? "",
      is_active: row.is_active !== false,
    });
    setSelectedFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsModalOpen(true);
  }

  function closeModal() {
    if (!isSaving) setIsModalOpen(false);
  }

  async function uploadImage(file) {
    const imageUrl = draft.image_url.trim();
    if (!file) {
      return {
        imageUrl,
        imagePath: imageUrl === draft.original_image_url ? draft.image_path || null : null,
      };
    }

    const supabase = createSupabaseBrowserClient();
    const path = `hardware/${Date.now()}-${cleanFileName(file.name)}`;
    const { error } = await supabase.storage.from("colour-tiles").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("colour-tiles").getPublicUrl(path);
    return { imageUrl: data.publicUrl, imagePath: path };
  }

  async function saveRow(event) {
    event.preventDefault();
    if (!draft.name.trim()) {
      toast({ title: "Enter a hardware name.", variant: "error" });
      return;
    }
    setIsSaving(true);
    try {
      const image = await uploadImage(fileInputRef.current?.files?.[0] || null);
      const payload = rowFromDraft(draft, image);
      const res = await fetch("/api/admin/hardware", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.id ? { id: draft.id, ...payload } : payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not save hardware.");
      setRows((current) => (draft.id ? current.map((row) => (row.id === data.hardware.id ? data.hardware : row)) : [data.hardware, ...current]));
      setIsModalOpen(false);
      setDraft(EMPTY_DRAFT);
      toast({ title: draft.id ? "Hardware updated." : "Hardware added." });
    } catch (error) {
      toast({ title: error?.message || "Could not save hardware.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRow() {
    if (!rowToDelete) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/hardware?id=${encodeURIComponent(rowToDelete.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not delete hardware.");
      setRows((current) => current.filter((row) => row.id !== rowToDelete.id));
      setRowToDelete(null);
      toast({ title: "Hardware deleted." });
    } catch (error) {
      toast({ title: error?.message || "Could not delete hardware.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  const modalFooter = (
    <>
      <Button type="button" variant="neutral" onClick={closeModal} disabled={isSaving}>
        Cancel
      </Button>
      <Button type="submit" form="hardware-form" loading={isSaving} loadingText="Saving...">
        {draft.id ? "Update hardware" : "Save hardware"}
      </Button>
    </>
  );

  return (
    <>
      <div className="p-4 md:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-[#1a1a18]">Hardware Library</h1>
            <p className="mt-[2px] text-[13px] text-[#5a5a52]">Manage handles, hinges and drawer runners for quote line items.</p>
          </div>
          <IconButton label="Add hardware" tooltip="Add hardware" variant="primary" size="md" className="md:hidden" onClick={() => openAddModal(typeFilter || "handle")}>
            <IconPlus size={18} />
          </IconButton>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8a81]" />
              <input
                type="search"
                placeholder="Search hardware"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-[34px] min-w-[240px] rounded-[6px] border border-[#dbd8cc] bg-white pl-9 pr-3 text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
              />
            </div>
            <Dropdown
              placeholder="All hardware"
              value={typeFilter}
              options={HARDWARE_TYPES}
              onChange={(value) => setTypeFilter(String(value || ""))}
              clearable
              searchable={false}
              containerClassName="w-[190px]"
              triggerClassName="!h-[34px] !text-[13px]"
            />
          </div>
          <button type="button" onClick={() => openAddModal(typeFilter || "handle")} className="hidden h-[34px] items-center gap-2 rounded-[6px] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] md:inline-flex">
            <IconPlus size={15} />
            Add hardware
          </button>
        </div>

        <div className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-[13px]">
              <thead>
                <tr className="border-b border-[#dbd8cc] bg-[#f5f8f4]">
                  {["Image", "Name", "Type", "Brand", "SKU", "Dimensions", "Unit cost", "Status", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => (
                  <tr key={row.id} className="cursor-pointer border-b border-[#edf4eb] transition-colors last:border-b-0 hover:bg-[#f5f8f4]" onClick={() => openEditModal(row)}>
                    <td className="px-4 py-[11px]">
                      <span className="inline-flex h-[36px] w-[36px] overflow-hidden rounded-[4px] border border-[#edf4eb] bg-[#f5f5f4]">
                        {row.image_url ? <img src={row.image_url} alt="" className="h-full w-full object-cover" /> : null}
                      </span>
                    </td>
                    <td className="px-4 py-[11px] font-medium text-[#1a1a18]">{row.name}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{typeLabel(row.type)}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{row.brand || "-"}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{row.sku || "-"}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{dimensionLabel(row)}</td>
                    <td className="px-4 py-[11px] text-[#1a1a18]">{money(row.unit_cost_ex_gst)}</td>
                    <td className="px-4 py-[11px]">
                      <span className={cn(
                        "inline-flex rounded-full border px-2 py-[3px] text-[11px] font-semibold",
                        row.is_active ? "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]" : "border-[#dbd8cc] bg-[#f5f5f4] text-[#5a5a52]"
                      )}>
                        {row.is_active ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td className="px-4 py-[11px]" onClick={(event) => event.stopPropagation()}>
                      <ActionMenu label={`Open actions for ${row.name}`} size="sm">
                        <ActionMenuItem icon={<IconEdit size={14} />} disabled={isSaving} onClick={() => openEditModal(row)}>
                          Edit
                        </ActionMenuItem>
                        <ActionMenuItem icon={<IconTrash size={14} />} variant="danger" disabled={isSaving} onClick={() => setRowToDelete(row)}>
                          Delete
                        </ActionMenuItem>
                      </ActionMenu>
                    </td>
                  </tr>
                ))}
                {!loading && !filteredRows.length ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[13px] text-[#8b8a81]">
                      {rows.length ? "No hardware matches your search." : "No hardware yet. Add your first handle, hinge or drawer runner."}
                    </td>
                  </tr>
                ) : null}
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[13px] text-[#8b8a81]">Loading hardware...</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <AdminPagination label="hardware items" page={page} pageCount={pageCount} totalItems={totalItems} onPageChange={setPage} />
        </div>
      </div>

      <Modal open={isModalOpen} onClose={closeModal} title={draft.id ? "Edit hardware" : "Add hardware"} subtitle="Set catalogue details, price and dimensions." size="lg" footer={modalFooter}>
        <form id="hardware-form" onSubmit={saveRow} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Dropdown
              label="Type"
              value={draft.type}
              options={HARDWARE_TYPES}
              onChange={(value) => updateDraft("type", String(value || "handle"))}
              clearable={false}
              searchable={false}
              contentZIndex={70}
            />
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
              Brand
              <input className={inputClass} value={draft.brand} onChange={(event) => updateDraft("brand", event.target.value)} placeholder="e.g. Blum, Hafele" />
            </label>
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
              Name
              <input className={inputClass} value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="e.g. Soft-close hinge" />
            </label>
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
              SKU
              <input className={inputClass} value={draft.sku} onChange={(event) => updateDraft("sku", event.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
              Unit cost ex GST
              <input className={inputClass} type="number" min="0" step="0.01" value={draft.unit_cost_ex_gst} onChange={(event) => updateDraft("unit_cost_ex_gst", event.target.value)} />
            </label>
            {[
              ["length_mm", "Length (mm)"],
              ["width_mm", "Width (mm)"],
              ["height_mm", "Height (mm)"],
              ["depth_mm", "Depth (mm)"],
              ["hole_spacing_mm", "Hole spacing / centres (mm)"],
              ["projection_mm", "Projection (mm)"],
            ].map(([field, label]) => (
              <label key={field} className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52]">
                {label}
                <input
                  className={`${inputClass} ${mutedDisabledClass}`}
                  type="number"
                  min="0"
                  step="1"
                  value={draft[field]}
                  disabled={!isFieldApplicable(draft.type, field)}
                  onChange={(event) => updateDraft(field, event.target.value)}
                />
              </label>
            ))}
            <div className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52] md:col-span-2">
              <span>Upload image</span>
              <div className="flex items-center gap-3">
                <button type="button" className="inline-flex h-[34px] items-center gap-2 rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] hover:bg-[#f5f8f4]" onClick={() => fileInputRef.current?.click()}>
                  <IconUpload size={14} />
                  Choose file
                </button>
                <span className="truncate text-[12px] text-[#8b8a81]">{selectedFileName || (draft.image_path ? "Current uploaded image retained" : "No file selected")}</span>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name || "")} />
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52] md:col-span-2">
              Or image URL
              <input className={inputClass} value={draft.image_url} onChange={(event) => updateDraft("image_url", event.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5a5a52] md:col-span-2">
              Description
              <textarea className="min-h-[84px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]" value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-normal text-[#1a1a18] md:col-span-2">
              <input type="checkbox" checked={draft.is_active} onChange={(event) => updateDraft("is_active", event.target.checked)} className="accent-[#6b9e61]" />
              Active
            </label>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!rowToDelete}
        onClose={() => !isSaving && setRowToDelete(null)}
        title={rowToDelete ? `Delete ${rowToDelete.name}?` : "Delete hardware?"}
        description="This removes the hardware catalogue row. Existing quotes that already copied the price will not be changed."
        confirmLabel="Delete"
        variant="danger"
        loading={isSaving}
        onConfirm={deleteRow}
      />
    </>
  );
}
