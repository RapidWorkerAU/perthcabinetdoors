"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { COLOUR_MATERIALS, COLOUR_ORDER_TYPES, materialLabelForType, normaliseOrderTypes, orderTypesLabel, thicknessOptionsForMaterial } from "../../../lib/pcd-colour-library";
import { AdminActionDropdown, AdminBulkDeleteButton, AdminConfirmDeleteAction } from "../_components/AdminActionDropdown";
import styles from "../admin-content.module.css";
import { AdminTablePagination, useAdminTablePagination } from "../_components/AdminTablePagination";

const emptyDraft = {
  id: null,
  name: "",
  image_url: "",
  original_image_url: "",
  image_path: "",
  supplier_name: "Polytec",
  material_type: "decorative board",
  thickness: "18mm",
  finish_type: "",
  order_type: "supply board",
  order_types: ["supply board"],
  preferred_board_width_mm: "",
  preferred_board_height_mm: "",
  cost_per_board_ex_gst: "",
  cost_per_sqm_ex_gst: "",
  last_cost_field: null,
  sort_order: "",
  is_active: true,
};

function cleanFileName(name) {
  return String(name || "colour-library")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function imageSourceLabel(row) {
  if (row.image_path) return "Uploaded";
  if (String(row.image_url || "").startsWith("/images/")) return "Website image";
  if (row.image_url) return "External URL";
  return "-";
}

function statusClassForRow(row) {
  return row.is_active ? styles.statusPillActive : styles.statusPillDraft;
}

function numericDraftValue(value) {
  if (value === "" || value == null) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function boardAreaSqm(widthMm, heightMm) {
  const width = numericDraftValue(widthMm);
  const height = numericDraftValue(heightMm);
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / 1000000;
}

function calculateColourCosts(draft) {
  const area = boardAreaSqm(draft.preferred_board_width_mm, draft.preferred_board_height_mm);
  const boardCost = numericDraftValue(draft.cost_per_board_ex_gst);
  const sqmCost = numericDraftValue(draft.cost_per_sqm_ex_gst);
  const lastCostField = draft.last_cost_field;

  if (area <= 0) {
    return {
      cost_per_board_ex_gst: boardCost,
      cost_per_sqm_ex_gst: sqmCost,
    };
  }

  if (lastCostField === "cost_per_sqm_ex_gst") {
    return {
      cost_per_board_ex_gst: Number((sqmCost * area).toFixed(2)),
      cost_per_sqm_ex_gst: sqmCost,
    };
  }

  if (lastCostField === "cost_per_board_ex_gst") {
    return {
      cost_per_board_ex_gst: boardCost,
      cost_per_sqm_ex_gst: Number((boardCost / area).toFixed(2)),
    };
  }

  if (sqmCost > 0 && boardCost <= 0) {
    return {
      cost_per_board_ex_gst: Number((sqmCost * area).toFixed(2)),
      cost_per_sqm_ex_gst: sqmCost,
    };
  }

  if (boardCost > 0 && sqmCost <= 0) {
    return {
      cost_per_board_ex_gst: boardCost,
      cost_per_sqm_ex_gst: Number((boardCost / area).toFixed(2)),
    };
  }

  return {
    cost_per_board_ex_gst: boardCost,
    cost_per_sqm_ex_gst: sqmCost,
  };
}

function boardSizeLabel(row) {
  const width = Number(row.preferred_board_width_mm || 0);
  const height = Number(row.preferred_board_height_mm || 0);
  if (!width && !height) return "-";
  return `${width || "-"} x ${height || "-"}mm`;
}

function rowFromDraft(draft, image, sortOrder) {
  const calculatedCosts = calculateColourCosts(draft);
  return {
    name: draft.name.trim(),
    image_url: image.imageUrl,
    image_path: image.imagePath || draft.image_path || null,
    supplier_name: draft.supplier_name.trim() || "Polytec",
    material_type: draft.material_type,
    thickness: draft.thickness,
    finish_type: draft.finish_type.trim(),
    order_type: draft.order_types[0] || "supply board",
    order_types: draft.order_types.length ? draft.order_types : ["supply board"],
    preferred_board_width_mm: numericDraftValue(draft.preferred_board_width_mm),
    preferred_board_height_mm: numericDraftValue(draft.preferred_board_height_mm),
    cost_per_board_ex_gst: calculatedCosts.cost_per_board_ex_gst,
    cost_per_sqm_ex_gst: calculatedCosts.cost_per_sqm_ex_gst,
    sort_order: sortOrder,
    is_active: !!draft.is_active,
  };
}

export default function ColourLibraryManager({ initialRows = [], initialError = "" }) {
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState(initialRows);
  const [draft, setDraft] = useState(emptyDraft);
  const [feedback, setFeedback] = useState(initialError);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [openFilter, setOpenFilter] = useState(null);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [columnFilters, setColumnFilters] = useState({
    supplier: [],
    finish: [],
    material: [],
    thickness: [],
    orderType: [],
  });

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const materialSort = String(a.material_type || "").localeCompare(String(b.material_type || ""));
        if (materialSort) return materialSort;
        const thicknessSort = String(a.thickness || "").localeCompare(String(b.thickness || ""));
        if (thicknessSort) return thicknessSort;
        const finishSort = String(a.finish_type || "").localeCompare(String(b.finish_type || ""));
        if (finishSort) return finishSort;
        const orderSort = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (orderSort) return orderSort;
        return String(a.name || "").localeCompare(String(b.name || ""));
      }),
    [rows]
  );

  const filterOptions = useMemo(() => {
    const uniqueValues = (values) =>
      Array.from(new Set(values.filter(Boolean).map((value) => String(value)))).sort((a, b) =>
        a.localeCompare(b)
      );

    return {
      supplier: uniqueValues(sortedRows.map((row) => row.supplier_name || "Polytec")),
      finish: uniqueValues(sortedRows.map((row) => row.finish_type || "-")),
      material: uniqueValues(sortedRows.map((row) => row.material_type || "-")),
      thickness: uniqueValues(sortedRows.map((row) => row.thickness || "-")),
      orderType: uniqueValues(sortedRows.flatMap((row) => normaliseOrderTypes(row))),
    };
  }, [sortedRows]);

  const activeFilterCount = Object.values(columnFilters).reduce((count, values) => count + values.length, 0);
  const selectedRowCount = selectedRowIds.length;

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sortedRows.filter((row) => {
      const searchable = [
        row.name,
        row.supplier_name,
        row.material_type,
        row.thickness,
        row.finish_type,
        boardSizeLabel(row),
        orderTypesLabel(row),
        imageSourceLabel(row),
        row.is_active ? "Active" : "Hidden",
      ];

      return (
        (!query || searchable.filter(Boolean).some((value) => String(value).toLowerCase().includes(query))) &&
        (!columnFilters.supplier.length || columnFilters.supplier.includes(row.supplier_name || "Polytec")) &&
        (!columnFilters.finish.length || columnFilters.finish.includes(row.finish_type || "-")) &&
        (!columnFilters.material.length || columnFilters.material.includes(row.material_type || "-")) &&
        (!columnFilters.thickness.length || columnFilters.thickness.includes(row.thickness || "-")) &&
        (!columnFilters.orderType.length || normaliseOrderTypes(row).some((type) => columnFilters.orderType.includes(type)))
      );
    });
  }, [columnFilters, searchQuery, sortedRows]);
  const filterKey = useMemo(() => `${searchQuery}|${JSON.stringify(columnFilters)}`, [columnFilters, searchQuery]);
  const colourPagination = useAdminTablePagination(filteredRows, filterKey);

  function updateDraft(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: value,
      last_cost_field:
        field === "cost_per_board_ex_gst" || field === "cost_per_sqm_ex_gst"
          ? field
          : current.last_cost_field,
    }));
  }

  function updateMaterialType(value) {
    const options = thicknessOptionsForMaterial(value);
    setDraft((current) => ({
      ...current,
      material_type: value,
      thickness: options.includes(current.thickness) ? current.thickness : options[0] || "",
    }));
  }

  function toggleOrderType(value) {
    setDraft((current) => {
      const selected = current.order_types || [];
      const nextSelected = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value];
      return {
        ...current,
        order_types: nextSelected.length ? nextSelected : [value],
        order_type: nextSelected[0] || value,
      };
    });
  }

  function openAddModal() {
    setDraft(emptyDraft);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSelectedFileName("");
    setFeedback("");
    setIsModalOpen(true);
  }

  function openEditModal(row) {
    setDraft({
      ...emptyDraft,
      ...row,
      original_image_url: row.image_url || "",
      image_path: row.image_path || "",
      preferred_board_width_mm: row.preferred_board_width_mm ?? "",
      preferred_board_height_mm: row.preferred_board_height_mm ?? "",
      cost_per_board_ex_gst: row.cost_per_board_ex_gst ?? "",
      cost_per_sqm_ex_gst: row.cost_per_sqm_ex_gst ?? "",
      last_cost_field: null,
      order_types: normaliseOrderTypes(row),
      is_active: row.is_active ?? true,
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSelectedFileName("");
    setFeedback("");
    setIsModalOpen(true);
  }

  function closeModal() {
    if (isSaving) return;
    setIsModalOpen(false);
  }

  function toggleColumnFilter(column, value) {
    setColumnFilters((current) => {
      const selected = current[column] || [];
      const nextSelected = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value];
      return { ...current, [column]: nextSelected };
    });
  }

  function clearColumnFilter(column) {
    setColumnFilters((current) => ({ ...current, [column]: [] }));
  }

  function clearAllFilters() {
    setColumnFilters({ supplier: [], finish: [], material: [], thickness: [], orderType: [] });
    setOpenFilter(null);
  }

  function toggleSelectedRow(id) {
    setSelectedRowIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectedPage(checked) {
    const pageIds = colourPagination.pageItems.map((row) => row.id);
    setSelectedRowIds((current) => {
      if (!checked) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  function sortOrderForDraft() {
    const currentSortOrder = Number(draft.sort_order);
    if (draft.id && Number.isFinite(currentSortOrder)) return currentSortOrder;

    const matchingRows = rows.filter((row) =>
      row.id !== draft.id &&
      String(row.material_type || "") === String(draft.material_type || "") &&
      String(row.thickness || "") === String(draft.thickness || "") &&
      String(row.finish_type || "").trim().toLowerCase() === String(draft.finish_type || "").trim().toLowerCase()
    );
    const maxSortOrder = matchingRows.reduce((max, row) => {
      const value = Number(row.sort_order || 0);
      return Number.isFinite(value) && value > max ? value : max;
    }, 0);
    return maxSortOrder + 1;
  }

  function renderColumnFilter(column, label) {
    const options = filterOptions[column] || [];
    const selected = columnFilters[column] || [];
    const isOpen = openFilter === column;

    return (
      <div className={styles.columnFilterWrap}>
        <span>{label}</span>
        <button
          type="button"
          className={`${styles.columnFilterIconButton} ${selected.length ? styles.columnFilterIconButtonActive : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpenFilter(isOpen ? null : column);
          }}
          aria-label={`Filter ${label}`}
          aria-expanded={isOpen}
        >
          <span className={styles.columnFilterIcon} aria-hidden="true" />
          {selected.length ? <span className={styles.columnFilterCount}>{selected.length}</span> : null}
        </button>
        {isOpen ? (
          <div className={styles.columnFilterMenu}>
            <div className={styles.columnFilterMenuHeader}>
              <span>{label}</span>
              <button type="button" onClick={() => clearColumnFilter(column)} disabled={!selected.length}>
                Clear
              </button>
            </div>
            <div className={styles.columnFilterOptions}>
              {options.map((option) => (
                <label key={option} className={styles.columnFilterOption}>
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggleColumnFilter(column, option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
              {!options.length ? <p className={styles.columnFilterEmpty}>No options</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  async function refreshLibrary() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("pcd_colour_library")
      .select("*")
      .order("material_type", { ascending: true })
      .order("finish_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    setRows(data || []);
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
    const path = `library/${Date.now()}-${cleanFileName(file.name)}`;
    const { error } = await supabase.storage.from("colour-tiles").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("colour-tiles").getPublicUrl(path);

    return { imageUrl: publicUrl, imagePath: path };
  }

  async function saveRow(event) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setFeedback("Enter a colour name.");
      return;
    }
    if (!draft.finish_type.trim()) {
      setFeedback("Enter a finish type.");
      return;
    }
    if (!draft.material_type) {
      setFeedback("Choose a material type.");
      return;
    }
    setIsSaving(true);
    setFeedback("");
    try {
      const supabase = createSupabaseBrowserClient();
      const image = await uploadImage(fileInputRef.current?.files?.[0] || null);
      const payload = rowFromDraft(draft, image, sortOrderForDraft());
      const query = draft.id
        ? supabase.from("pcd_colour_library").update(payload).eq("id", draft.id)
        : supabase.from("pcd_colour_library").insert(payload);
      const { data, error } = await query.select("*").single();
      if (error) throw error;

      setRows((current) => {
        if (draft.id) {
          return current.map((row) => (row.id === data.id ? data : row));
        }
        return [data, ...current];
      });
      setDraft(emptyDraft);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFileName("");
      setIsModalOpen(false);
      setFeedback(draft.id ? "Colour line updated." : "Colour line saved.");
    } catch (error) {
      setFeedback(error?.message || "Could not save colour line.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRow(row) {
    setIsSaving(true);
    setFeedback("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("pcd_colour_library").delete().eq("id", row.id);
      if (error) throw error;

      setRows((current) => current.filter((item) => item.id !== row.id));
      setRowToDelete(null);
      setFeedback("Colour line deleted. Image storage was left untouched.");
    } catch (error) {
      setFeedback(error?.message || "Could not delete colour line.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedRows() {
    if (!selectedRowIds.length) return;
    setIsSaving(true);
    setFeedback("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("pcd_colour_library").delete().in("id", selectedRowIds);
      if (error) throw error;

      setRows((current) => current.filter((item) => !selectedRowIds.includes(item.id)));
      setSelectedRowIds([]);
      setFeedback("Selected colour lines deleted. Image storage was left untouched.");
    } catch (error) {
      setFeedback(error?.message || "Could not delete selected colour lines.");
    } finally {
      setIsSaving(false);
    }
  }

  const modal =
    isModalOpen && typeof document !== "undefined"
      ? createPortal(
          <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="colour-line-modal-title" onMouseDown={closeModal}>
            <form className={styles.colourLibraryModal} onSubmit={saveRow} onMouseDown={(event) => event.stopPropagation()}>
              <div className={styles.customerModalHeader}>
                <span className={styles.customerModalIcon}>PCD</span>
                <div>
                  <p className={styles.tableMeta}>Colour library</p>
                  <h2 id="colour-line-modal-title">{draft.id ? "Edit colour line" : "Add colour line"}</h2>
                </div>
                <button type="button" className={styles.modalCloseButton} onClick={closeModal} disabled={isSaving}>
                  Close
                </button>
              </div>
              <div className={styles.customerModalBody}>
                <div className={styles.colourLibraryModalGrid}>
                  <label className={styles.fieldLabel}>
                    Colour name
                    <input className={styles.fieldInput} value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
                  </label>
                  <label className={styles.fieldLabel}>
                    Supplier
                    <input className={styles.fieldInput} value={draft.supplier_name} onChange={(event) => updateDraft("supplier_name", event.target.value)} />
                  </label>
                  <label className={styles.fieldLabel}>
                    Material type
                    <select className={styles.fieldInput} value={draft.material_type} onChange={(event) => updateMaterialType(event.target.value)}>
                      {COLOUR_MATERIALS.map((material) => (
                        <option key={material.key} value={material.value}>{material.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.fieldLabel}>
                    Thickness
                    <select className={styles.fieldInput} value={draft.thickness} onChange={(event) => updateDraft("thickness", event.target.value)}>
                      {thicknessOptionsForMaterial(draft.material_type).map((thickness) => (
                        <option key={thickness} value={thickness}>{thickness}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.fieldLabel}>
                    Finish type
                    <input className={styles.fieldInput} placeholder="e.g. Woodmatt" value={draft.finish_type} onChange={(event) => updateDraft("finish_type", event.target.value)} />
                  </label>
                  <div className={styles.fieldLabel}>
                    <span>Order type</span>
                    <div className={styles.colourLibraryCheckboxGroup}>
                      {COLOUR_ORDER_TYPES.map((type) => (
                        <label key={type.value} className={styles.checkboxRow}>
                          <input
                            type="checkbox"
                            checked={(draft.order_types || []).includes(type.value)}
                            onChange={() => toggleOrderType(type.value)}
                          />
                          {type.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className={styles.fieldLabel}>
                    Preferred board width (mm)
                    <input className={styles.fieldInput} type="number" min="0" step="1" value={draft.preferred_board_width_mm} onChange={(event) => updateDraft("preferred_board_width_mm", event.target.value)} />
                  </label>
                  <label className={styles.fieldLabel}>
                    Preferred board height (mm)
                    <input className={styles.fieldInput} type="number" min="0" step="1" value={draft.preferred_board_height_mm} onChange={(event) => updateDraft("preferred_board_height_mm", event.target.value)} />
                  </label>
                  <label className={styles.fieldLabel}>
                    Cost / board ex GST
                    <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.cost_per_board_ex_gst} onChange={(event) => updateDraft("cost_per_board_ex_gst", event.target.value)} />
                  </label>
                  <label className={styles.fieldLabel}>
                    Cost / sqm ex GST
                    <input className={styles.fieldInput} type="number" min="0" step="0.01" value={draft.cost_per_sqm_ex_gst} onChange={(event) => updateDraft("cost_per_sqm_ex_gst", event.target.value)} />
                  </label>
                  <div className={`${styles.fieldLabel} ${styles.fieldWide}`}>
                    <span>Upload tile image</span>
                    <div className={styles.colourLibraryFileControl}>
                      <button type="button" className={styles.secondaryButton} onClick={() => fileInputRef.current?.click()}>
                        Choose file
                      </button>
                      <span className={styles.colourLibraryFileName}>
                        {selectedFileName || (draft.image_path ? "Current uploaded image retained" : "No file selected")}
                      </span>
                      <input
                        ref={fileInputRef}
                        className={styles.colourLibraryFileInput}
                        type="file"
                        accept="image/*"
                        onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name || "")}
                      />
                    </div>
                  </div>
                  <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
                    Or image URL
                    <input className={styles.fieldInput} value={draft.image_url} onChange={(event) => updateDraft("image_url", event.target.value)} />
                  </label>
                  <label className={`${styles.checkboxRow} ${styles.fieldWide}`}>
                    <input type="checkbox" checked={draft.is_active} onChange={(event) => updateDraft("is_active", event.target.checked)} />
                    Active
                  </label>
                </div>
                {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
              </div>
              <div className={styles.customerModalFooter}>
                <button type="button" className={styles.secondaryButton} onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryButton} disabled={isSaving}>
                  {isSaving ? "Saving..." : draft.id ? "Update colour line" : "Save colour line"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )
      : null;

  const deleteModal =
    rowToDelete && typeof document !== "undefined"
      ? createPortal(
          <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-colour-title" onMouseDown={() => !isSaving && setRowToDelete(null)}>
            <div className={styles.confirmModal} onMouseDown={(event) => event.stopPropagation()}>
              <div className={styles.customerModalHeader}>
                <span className={styles.customerModalIcon}>PCD</span>
                <div>
                  <p className={styles.tableMeta}>Delete colour line</p>
                  <h2 id="delete-colour-title">Delete {rowToDelete.name}?</h2>
                </div>
                <button type="button" className={styles.modalCloseButton} onClick={() => setRowToDelete(null)} disabled={isSaving}>
                  Close
                </button>
              </div>
              <div className={styles.customerModalBody}>
                <p className={styles.sectionText}>
                  This removes the colour library database row only. Uploaded images are left in Supabase Storage so you can match them to new entries.
                </p>
              </div>
              <div className={styles.customerModalFooter}>
                <button type="button" className={styles.secondaryButton} onClick={() => setRowToDelete(null)} disabled={isSaving}>
                  Cancel
                </button>
                <button type="button" className={styles.rowDeleteButton} onClick={() => deleteRow(rowToDelete)} disabled={isSaving}>
                  {isSaving ? "Deleting..." : "Delete row"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <section className={styles.productsSection}>
        <div className={`${styles.sectionHeaderRow} ${styles.tableToolbar} ${styles.colourLibraryActionBar}`}>
          <div className={styles.tableToolbarFilters}>
            <AdminBulkDeleteButton count={selectedRowCount} disabled={isSaving} onConfirm={deleteSelectedRows} />
            <input
              className={styles.customerSearchInput}
              type="search"
              placeholder="Search by colour, finish, supplier, material or order type"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {activeFilterCount ? (
              <button type="button" className={styles.secondaryButton} onClick={clearAllFilters}>
                Clear filters ({activeFilterCount})
              </button>
            ) : null}
          </div>
          <div className={styles.tableToolbarActions}>
            <button type="button" className={styles.primaryButton} onClick={openAddModal}>
              Add colour line
            </button>
          </div>
        </div>

        {feedback && !isModalOpen ? <p className={styles.feedback}>{feedback}</p> : null}

        <div className={styles.colourLibraryTableWrap}>
          <table className={`${styles.productsTable} ${styles.colourLibraryTable}`}>
            <thead>
              <tr>
                <th className={styles.rowSelectCol}>
                  <input
                    type="checkbox"
                    checked={colourPagination.pageItems.length > 0 && colourPagination.pageItems.every((row) => selectedRowIds.includes(row.id))}
                    onChange={(event) => toggleSelectedPage(event.target.checked)}
                    aria-label="Select all visible colour lines"
                  />
                </th>
                <th>Tile</th>
                <th>Colour</th>
                <th>{renderColumnFilter("supplier", "Supplier")}</th>
                <th>{renderColumnFilter("material", "Material")}</th>
                <th>{renderColumnFilter("thickness", "Thickness")}</th>
                <th>{renderColumnFilter("finish", "Finish")}</th>
                <th>{renderColumnFilter("orderType", "Order type")}</th>
                <th>Board size</th>
                <th>Cost / board</th>
                <th>Cost / sqm</th>
                <th>Sort</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {colourPagination.pageItems.map((row) => (
                <tr key={row.id}>
                  <td className={styles.rowSelectCol}>
                    <input
                      type="checkbox"
                      checked={selectedRowIds.includes(row.id)}
                      onChange={() => toggleSelectedRow(row.id)}
                      aria-label={`Select ${row.name}`}
                    />
                  </td>
                  <td>
                    <span className={styles.colourLibraryTableTile}>
                      {row.image_url ? <img src={row.image_url} alt="" /> : null}
                    </span>
                  </td>
                  <td>{row.name}</td>
                  <td>{row.supplier_name || "Polytec"}</td>
                  <td>{materialLabelForType(row.material_type)}</td>
                  <td>{row.thickness || "-"}</td>
                  <td>{row.finish_type || "-"}</td>
                  <td>{orderTypesLabel(row) || "-"}</td>
                  <td>{boardSizeLabel(row)}</td>
                  <td>${Number(row.cost_per_board_ex_gst || 0).toFixed(2)}</td>
                  <td>${Number(row.cost_per_sqm_ex_gst || 0).toFixed(2)}</td>
                  <td>{row.sort_order || 0}</td>
                  <td>
                    <span className={`${styles.statusPill} ${statusClassForRow(row)}`}>
                      {row.is_active ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className={styles.actionsCol}>
                    <AdminActionDropdown
                      disabled={isSaving}
                      label={`Open actions for ${row.name}`}
                    >
                      <button type="button" className={styles.tableActionMenuItem} onClick={() => openEditModal(row)}>
                        Edit
                      </button>
                      <AdminConfirmDeleteAction onConfirm={() => deleteRow(row)} />
                    </AdminActionDropdown>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td className={styles.emptyCell} colSpan="14">
                    {sortedRows.length ? "No colour lines match your search." : "No colour lines yet. Add your first board colour entry."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <AdminTablePagination
          label="colour lines"
          page={colourPagination.page}
          pageCount={colourPagination.pageCount}
          totalItems={colourPagination.totalItems}
          onPageChange={colourPagination.setPage}
        />
      </section>
      {modal}
      {deleteModal}
    </>
  );
}

