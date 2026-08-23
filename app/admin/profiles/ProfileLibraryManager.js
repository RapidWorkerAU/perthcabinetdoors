"use client";

// THE PROFILE LIBRARY.
//
// The same job the colour library does for boards: the catalogue of door and
// edge profiles, managed here instead of in a code file that needs a deploy.
//
// Door and edge profiles share one screen because they are the same record with
// the same four facts. The tab picks which you are looking at.

import { useMemo, useState } from "react";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { AdminPagination, useAdminPagination } from "../_components/AdminPagination";
import { ActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import {
  PROFILE_KINDS,
  PROFILE_LIBRARY_SUPPLIERS,
  categoriesBySupplier,
  profileLibraryGaps,
  profileLibraryRowFromDraft,
} from "../../../lib/pcd-profile-library";

const ALL = "All";

const tw = {
  input:
    "h-[36px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] bg-white " +
    "focus:outline-none focus:border-[#6b9e61]",
  label: "flex flex-col gap-1 text-[12px] font-medium text-[#5a5a52]",
  primary:
    "h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] " +
    "disabled:opacity-50 transition-colors",
  secondary:
    "h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] " +
    "hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
  th: "px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]",
  td: "px-4 py-[11px] text-[#1a1a18]",
  pill: "inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border",
};

const emptyDraft = {
  id: null,
  kind: "door",
  supplier_name: "Polytec",
  category: "",
  name: "",
  image_url: "",
  available_18mm: true,
  available_21mm: true,
  is_active: true,
  sort_order: 0,
  notes: "",
};

export default function ProfileLibraryManager({ initialRows = [], initialError = "" }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(initialRows);
  const [kind, setKind] = useState("door");
  const [supplier, setSupplier] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rowToDelete, setRowToDelete] = useState(null);

  const suppliers = useMemo(() => {
    const found = [];
    rows.filter((row) => row.kind === kind).forEach((row) => {
      if (row.supplier_name && !found.includes(row.supplier_name)) found.push(row.supplier_name);
    });
    return found;
  }, [rows, kind]);

  // Narrowed to the chosen supplier, because a Polytec category on a Laminex
  // filter returns nothing and reads as an empty catalogue.
  const categories = useMemo(() => {
    const found = [];
    rows
      .filter((row) => row.kind === kind)
      .filter((row) => supplier === ALL || row.supplier_name === supplier)
      .forEach((row) => {
        if (row.category && !found.includes(row.category)) found.push(row.category);
      });
    return found;
  }, [rows, kind, supplier]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.kind !== kind) return false;
      if (supplier !== ALL && row.supplier_name !== supplier) return false;
      if (category !== ALL && row.category !== category) return false;
      if (q && !`${row.name} ${row.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, kind, supplier, category, query]);

  const { page, pageCount, pageItems, setPage, totalItems } = useAdminPagination(filtered);

  function openNew() {
    setDraft({ ...emptyDraft, kind, supplier_name: supplier === ALL ? "Polytec" : supplier });
    setIsOpen(true);
  }

  function openEdit(row) {
    setDraft({ ...emptyDraft, ...row, notes: row.notes || "", image_url: row.image_url || "" });
    setIsOpen(true);
  }

  async function save() {
    const payload = profileLibraryRowFromDraft(draft);
    const gaps = profileLibraryGaps(payload);
    if (gaps.length) {
      toast({ title: `This profile still needs ${gaps.join(", ")}.`, variant: "error" });
      return;
    }
    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (draft.id) {
        const { data, error } = await supabase
          .from("pcd_profile_library")
          .update(payload)
          .eq("id", draft.id)
          .select("*")
          .single();
        if (error) throw error;
        setRows((current) => current.map((row) => (row.id === data.id ? data : row)));
      } else {
        const { data, error } = await supabase.from("pcd_profile_library").insert(payload).select("*").single();
        if (error) throw error;
        setRows((current) => [...current, data]);
      }
      setIsOpen(false);
      toast({ title: draft.id ? "Profile updated." : "Profile added.", variant: "success" });
    } catch (error) {
      // The unique index is the likely one, and its message is not a sentence.
      const duplicate = String(error?.message || "").includes("pcd_profile_library_unique_idx");
      toast({
        title: duplicate
          ? `${payload.supplier_name} already has a ${payload.kind === "edge" ? "edge" : "door"} profile called "${payload.name}".`
          : error?.message || "Could not save this profile.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(row) {
    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("pcd_profile_library").delete().eq("id", row.id);
      if (error) throw error;
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      toast({ title: "Profile removed.", variant: "success" });
    } catch (error) {
      toast({ title: error?.message || "Could not remove this profile.", variant: "error" });
    } finally {
      setIsSaving(false);
      setRowToDelete(null);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1a18]">Profile Library</h1>
          <p className="mt-[2px] text-[13px] text-[#5a5a52]">
            Every door and edge profile we offer, and who makes it. Polytec and Laminex ranges cannot be mixed on one
            door, which is why the supplier is recorded against each one.
          </p>
        </div>
        <IconButton label="Add profile" tooltip="Add profile" variant="primary" size="md" className="md:hidden" onClick={openNew}>
          <IconPlus size={18} />
        </IconButton>
      </div>

      {initialError ? (
        <div className="mb-3 rounded-[6px] border border-[#e3b3aa] bg-[#fceeeb] px-3 py-2 text-[13px] text-[#9e2717]">
          {initialError}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8a81]" />
            <input
              type="search"
              placeholder="Search profiles"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-[34px] min-w-[240px] rounded-[6px] border border-[#dbd8cc] bg-white pl-9 pr-3 text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
            />
          </div>
          {/* Door or edge. Not clearable: a profile is one or the other, and
              "all" would put two things that are not comparable in one table. */}
          <Dropdown
            value={kind}
            options={PROFILE_KINDS.map((entry) => ({ value: entry.key, label: `${entry.label}s` }))}
            onChange={(value) => {
              setKind(String(value || "door"));
              setCategory(ALL);
            }}
            searchable={false}
            containerClassName="w-[150px]"
            triggerClassName="!h-[34px] !text-[13px]"
          />
          <Dropdown
            placeholder="All suppliers"
            value={supplier === ALL ? "" : supplier}
            options={suppliers.map((name) => ({ value: name, label: name }))}
            onChange={(value) => {
              setSupplier(String(value || "") || ALL);
              setCategory(ALL);
            }}
            clearable
            searchable={false}
            containerClassName="w-[170px]"
            triggerClassName="!h-[34px] !text-[13px]"
          />
          <Dropdown
            placeholder="All categories"
            value={category === ALL ? "" : category}
            options={categories.map((name) => ({ value: name, label: name }))}
            onChange={(value) => setCategory(String(value || "") || ALL)}
            clearable
            containerClassName="w-[230px]"
            triggerClassName="!h-[34px] !text-[13px]"
          />
        </div>
        <button
          type="button"
          onClick={openNew}
          className="hidden h-[34px] items-center gap-2 rounded-[6px] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] md:inline-flex"
        >
          <IconPlus size={15} />
          Add profile
        </button>
      </div>

      <div className="bg-white border border-[#dbd8cc] rounded-[8px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px] border-collapse">
            <thead>
              <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                {["Image", "Profile", "Supplier", "Category", "Thickness", "Status", "Actions"].map((col) => (
                  <th key={col} className={`${tw.th}${col === "Actions" ? " text-right" : ""}`}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[#edf4eb] hover:bg-[#f5f8f4] transition-colors last:border-b-0 cursor-pointer"
                  onClick={() => openEdit(row)}
                >
                  <td className={tw.td}>
                    <span className="inline-flex w-[44px] h-[44px] rounded-[4px] overflow-hidden bg-[#f5f5f4] border border-[#edf4eb]">
                      {row.image_url ? (
                        <img src={row.image_url} alt="" className="w-full h-full object-cover" />
                      ) : null}
                    </span>
                  </td>
                  <td className={`${tw.td} font-medium`}>{row.name}</td>
                  <td className={tw.td}>{row.supplier_name}</td>
                  <td className={tw.td}>{row.category}</td>
                  <td className={tw.td}>
                    {/* Both is the normal case and says nothing useful, so it is
                        the exceptions that are worth printing. */}
                    {row.available_18mm && row.available_21mm
                      ? "18mm & 21mm"
                      : row.available_21mm
                        ? "21mm only"
                        : "18mm only"}
                  </td>
                  <td className={tw.td}>
                    <span
                      className={`${tw.pill} ${
                        row.is_active
                          ? "bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]"
                          : "bg-[#f5f5f4] text-[#5a5a52] border-[#dbd8cc]"
                      }`}
                    >
                      {row.is_active ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className={tw.td} onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end">
                      <ActionMenu label={`Open actions for ${row.name}`}>
                        <ActionMenuItem variant="danger" disabled={isSaving} onClick={() => setRowToDelete(row)}>
                          Delete
                        </ActionMenuItem>
                      </ActionMenu>
                    </div>
                  </td>
                </tr>
              ))}
              {!pageItems.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[13px] text-[#8b8a81]">
                    {rows.length ? "No profiles match these filters." : "The profile library is empty."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <AdminPagination page={page} pageCount={pageCount} totalItems={totalItems} onPageChange={setPage} />
      </div>

      {isOpen ? (
        <Modal
          open
          onClose={() => setIsOpen(false)}
          title={draft.id ? "Edit profile" : "Add profile"}
          subtitle="Profile library"
          size="md"
          footer={
            <>
              <button type="button" className={tw.secondary} onClick={() => setIsOpen(false)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className={tw.primary} onClick={save} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className={tw.label}>
              Kind
              <select
                className={tw.input}
                value={draft.kind}
                onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}
              >
                {PROFILE_KINDS.map((entry) => (
                  <option key={entry.key} value={entry.key}>{entry.label}</option>
                ))}
              </select>
            </label>
            <label className={tw.label}>
              Supplier
              <select
                className={tw.input}
                value={draft.supplier_name}
                onChange={(event) => setDraft((current) => ({ ...current, supplier_name: event.target.value }))}
              >
                {PROFILE_LIBRARY_SUPPLIERS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className={tw.label}>
              Name
              <input
                className={tw.input}
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Settler 20"
              />
            </label>
            <label className={tw.label}>
              Category
              <input
                className={tw.input}
                value={draft.category}
                list="profile-categories"
                onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                placeholder="e.g. Soft"
              />
              <datalist id="profile-categories">
                {[...categoriesBySupplier(rows, draft.kind).values()].flat().map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className={`${tw.label} md:col-span-2`}>
              Image
              <input
                className={tw.input}
                value={draft.image_url}
                onChange={(event) => setDraft((current) => ({ ...current, image_url: event.target.value }))}
                placeholder="/images/profiles/soft/albury.jpg"
              />
              <span className="text-[11px] text-[#8b8a81]">
                Optional. Plenty of real profiles have never had a photo, and a missing one shows a placeholder rather
                than a broken image.
              </span>
            </label>
            {draft.image_url ? (
              <div className="md:col-span-2">
                <span className="inline-flex w-[120px] h-[150px] rounded-[6px] overflow-hidden bg-[#f5f5f4] border border-[#dbd8cc]">
                  <img src={draft.image_url} alt="" className="w-full h-full object-cover" />
                </span>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-[13px] text-[#1a1a18]">
              <input
                type="checkbox"
                checked={draft.available_18mm !== false}
                onChange={(event) => setDraft((current) => ({ ...current, available_18mm: event.target.checked }))}
              />
              Available in 18mm
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#1a1a18]">
              <input
                type="checkbox"
                checked={draft.available_21mm !== false}
                onChange={(event) => setDraft((current) => ({ ...current, available_21mm: event.target.checked }))}
              />
              Available in 21mm
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#1a1a18] md:col-span-2">
              <input
                type="checkbox"
                checked={draft.is_active !== false}
                onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Active. Hidden profiles stay on old quotes but are not offered on new ones.
            </label>
            <label className={`${tw.label} md:col-span-2`}>
              Notes
              <input
                className={tw.input}
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Anything worth knowing about this profile"
              />
            </label>
          </div>
        </Modal>
      ) : null}

      {rowToDelete ? (
        <ConfirmModal
          open
          onClose={() => setRowToDelete(null)}
          onConfirm={() => remove(rowToDelete)}
          title="Remove this profile?"
          confirmLabel="Remove"
          variant="danger"
          loading={isSaving}
        >
          <p className="text-[13px] text-[#1a1a18]">
            {rowToDelete.name} will be removed from the library. Quotes and orders that already name it keep it: they
            store the name, not a link to this row.
          </p>
          <p className="mt-2 text-[13px] text-[#5a5a52]">
            If you only want to stop offering it, set it to hidden instead.
          </p>
        </ConfirmModal>
      ) : null}
    </div>
  );
}
