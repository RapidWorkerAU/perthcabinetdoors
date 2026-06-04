"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { COLOUR_MATERIALS } from "../../../lib/pcd-colour-library";
import { colourGroupsForMaterial } from "../../products/product-data";
import styles from "../admin-shell.module.css";

const MATERIAL_KEYS = COLOUR_MATERIALS.map((material) => material.key);

function emptyTileDraft(finishes = []) {
  return {
    id: null,
    finish_id: finishes[0]?.id || "",
    new_finish_name: "",
    supplier: "Polytec",
    name: "",
    image_url: "",
    original_image_url: "",
    image_path: null,
    sort_order: 0,
    material_key: "",
    original_material_key: "",
    cost_per_sqm_ex_gst: "",
    is_active: true,
  };
}

function cleanFileName(name) {
  return String(name || "colour-tile")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function materialLabel(key) {
  return COLOUR_MATERIALS.find((material) => material.key === key)?.label || key || "-";
}

function imageSourceLabel(tile) {
  if (tile.image_path) return "Uploaded";
  if (String(tile.image_url || "").startsWith("/images/")) return "Website image";
  return "External URL";
}

export default function ColourLibraryManager({ initialFinishes, initialTiles, initialMaterialLinks }) {
  const fileInputRef = useRef(null);
  const [finishes, setFinishes] = useState(initialFinishes || []);
  const [tiles, setTiles] = useState(initialTiles || []);
  const [materialLinks, setMaterialLinks] = useState(initialMaterialLinks || []);
  const [tileDraft, setTileDraft] = useState(() => emptyTileDraft(initialFinishes || []));
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tileToDelete, setTileToDelete] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [openFilter, setOpenFilter] = useState(null);
  const [columnFilters, setColumnFilters] = useState({
    supplier: [],
    finish: [],
    material: [],
  });

  const finishMap = useMemo(
    () => Object.fromEntries(finishes.map((finish) => [finish.id, finish])),
    [finishes]
  );

  const tableRows = useMemo(
    () =>
      tiles
        .flatMap((tile) => {
          const links = materialLinks.filter((link) => link.colour_tile_id === tile.id);
          if (!links.length) {
            return [
              {
                ...tile,
                finish: finishMap[tile.finish_id],
                material_key: "",
                cost_per_sqm_ex_gst: null,
              },
            ];
          }

          return links.map((link) => ({
            ...tile,
            finish: finishMap[tile.finish_id],
            material_key: link.material_key,
            cost_per_sqm_ex_gst: link.cost_per_sqm_ex_gst ?? 0,
          }));
        })
        .sort((a, b) => {
          const finishSort = (a.finish?.sort_order || 0) - (b.finish?.sort_order || 0);
          if (finishSort) return finishSort;
          const finishNameSort = String(a.finish?.name || "").localeCompare(String(b.finish?.name || ""));
          if (finishNameSort) return finishNameSort;
          const nameSort = String(a.name).localeCompare(String(b.name));
          if (nameSort) return nameSort;
          return String(a.material_key || "").localeCompare(String(b.material_key || ""));
        }),
    [finishMap, materialLinks, tiles]
  );

  const filterOptions = useMemo(() => {
    const uniqueValues = (values) =>
      Array.from(new Set(values.filter(Boolean).map((value) => String(value)))).sort((a, b) =>
        a.localeCompare(b)
      );

    return {
      supplier: uniqueValues(tableRows.map((tile) => tile.supplier || "Polytec")),
      finish: uniqueValues(tableRows.map((tile) => tile.finish?.name || "-")),
      material: uniqueValues(tableRows.map((tile) => materialLabel(tile.material_key))),
    };
  }, [tableRows]);

  const activeFilterCount = Object.values(columnFilters).reduce((count, values) => count + values.length, 0);

  const filteredTableRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tableRows.filter((tile) =>
      (!query ||
        [
        tile.name,
        tile.supplier,
        tile.finish?.name,
        materialLabel(tile.material_key),
        imageSourceLabel(tile),
        tile.is_active ? "Active" : "Hidden",
      ]
        .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))) &&
      (!columnFilters.supplier.length || columnFilters.supplier.includes(tile.supplier || "Polytec")) &&
      (!columnFilters.finish.length || columnFilters.finish.includes(tile.finish?.name || "-")) &&
      (!columnFilters.material.length || columnFilters.material.includes(materialLabel(tile.material_key)))
    );
  }, [columnFilters, searchQuery, tableRows]);

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
    setColumnFilters({ supplier: [], finish: [], material: [] });
    setOpenFilter(null);
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

  function openAddModal() {
    setTileDraft(emptyTileDraft(finishes));
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSelectedFileName("");
    setFeedback("");
    setIsModalOpen(true);
  }

  function openEditModal(row) {
    setTileDraft({
      id: row.id,
      finish_id: row.finish_id || "",
      new_finish_name: "",
      supplier: row.supplier || "Polytec",
      name: row.name || "",
      image_url: row.image_url || "",
      original_image_url: row.image_url || "",
      image_path: row.image_path || null,
      sort_order: row.sort_order || 0,
      material_key: row.material_key || "",
      original_material_key: row.material_key || "",
      cost_per_sqm_ex_gst: row.cost_per_sqm_ex_gst ?? "",
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

  function updateTileDraft(field, value) {
    setTileDraft((current) => ({ ...current, [field]: value }));
  }

  async function refreshLibrary() {
    const supabase = createSupabaseBrowserClient();
    const [finishResult, tileResult, materialResult] = await Promise.all([
      supabase
        .from("pcd_colour_finishes")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("pcd_colour_tiles")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.from("pcd_colour_tile_materials").select("*"),
    ]);
    setFinishes(finishResult.data || []);
    setTiles(tileResult.data || []);
    setMaterialLinks(materialResult.data || []);
    return finishResult.data || [];
  }

  async function saveFinish(name, cache) {
    const cleanName = String(name || "").trim();
    if (!cleanName) return null;
    const cached = cache.get(cleanName);
    if (cached) return cached;

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("pcd_colour_finishes")
      .upsert({ name: cleanName, sort_order: finishes.length + cache.size + 1, is_active: true }, { onConflict: "name" })
      .select("*")
      .single();
    if (error) throw error;
    cache.set(cleanName, data);
    return data;
  }

  async function uploadTileImage(file) {
    if (!file) return { imageUrl: tileDraft.image_url.trim(), imagePath: null };

    const supabase = createSupabaseBrowserClient();
    const path = `tiles/${Date.now()}-${cleanFileName(file.name)}`;
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

  async function saveTile(event) {
    event.preventDefault();
    const name = tileDraft.name.trim();
    const newFinishName = tileDraft.new_finish_name.trim();

    if (!tileDraft.finish_id && !newFinishName) {
      setFeedback("Choose a finish or enter a new finish name.");
      return;
    }
    if (!name) {
      setFeedback("Enter a colour name.");
      return;
    }
    if (!tileDraft.material_key) {
      setFeedback("Choose a material type for this colour line.");
      return;
    }

    const file = fileInputRef.current?.files?.[0] || null;
    if (!file && !tileDraft.image_url.trim()) {
      setFeedback("Upload an image tile or enter an image URL.");
      return;
    }

    setIsSaving(true);
    setFeedback("");
    try {
      const finishCache = new Map(finishes.map((finish) => [finish.name, finish]));
      const finish = newFinishName ? await saveFinish(newFinishName, finishCache) : finishMap[tileDraft.finish_id];
      if (!finish?.id) throw new Error("Could not resolve the selected finish.");

      const supabase = createSupabaseBrowserClient();
      const { imageUrl, imagePath } = await uploadTileImage(file);
      const tilePayload = {
          finish_id: finish.id,
          supplier: tileDraft.supplier.trim() || "Polytec",
          name,
          image_url: imageUrl,
          image_path: imagePath || (imageUrl === tileDraft.original_image_url ? tileDraft.image_path : null),
          sort_order: Number(tileDraft.sort_order || 0),
          is_active: tileDraft.is_active,
        };
      const tileQuery = tileDraft.id
        ? supabase.from("pcd_colour_tiles").update(tilePayload).eq("id", tileDraft.id)
        : supabase.from("pcd_colour_tiles").upsert(tilePayload, { onConflict: "finish_id,name,image_url" });
      const { data: tile, error: tileError } = await tileQuery.select("*").single();
      if (tileError) throw tileError;

      if (tileDraft.id && tileDraft.original_material_key && tileDraft.original_material_key !== tileDraft.material_key) {
        const { error: deleteLinksError } = await supabase
          .from("pcd_colour_tile_materials")
          .delete()
          .eq("colour_tile_id", tileDraft.id)
          .eq("material_key", tileDraft.original_material_key);
        if (deleteLinksError) throw deleteLinksError;
      }

      const link = {
        colour_tile_id: tile.id,
        material_key: tileDraft.material_key,
        cost_per_sqm_ex_gst:
          tileDraft.cost_per_sqm_ex_gst === "" || tileDraft.cost_per_sqm_ex_gst == null
            ? 0
            : Number(tileDraft.cost_per_sqm_ex_gst),
      };
      const { error: linksError } = await supabase
        .from("pcd_colour_tile_materials")
        .upsert(link, { onConflict: "colour_tile_id,material_key" });
      if (linksError) throw linksError;

      const refreshedFinishes = await refreshLibrary();
      setTileDraft(emptyTileDraft(refreshedFinishes));
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFileName("");
      setIsModalOpen(false);
      setFeedback(tileDraft.id ? "Colour line updated." : "Colour line saved.");
    } catch (error) {
      setFeedback(error?.message || "Could not save colour tile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTile(row) {
    setIsSaving(true);
    setFeedback("");
    try {
      const supabase = createSupabaseBrowserClient();

      if (row.material_key) {
        const { error: linkDeleteError } = await supabase
          .from("pcd_colour_tile_materials")
          .delete()
          .eq("colour_tile_id", row.id)
          .eq("material_key", row.material_key);
        if (linkDeleteError) throw linkDeleteError;
      }

      const { data: remainingLinks, error: remainingLinksError } = await supabase
        .from("pcd_colour_tile_materials")
        .select("material_key")
        .eq("colour_tile_id", row.id);
      if (remainingLinksError) throw remainingLinksError;

      if (!remainingLinks?.length) {
        const { error: tileDeleteError } = await supabase.from("pcd_colour_tiles").delete().eq("id", row.id);
        if (tileDeleteError) throw tileDeleteError;
        if (row.image_path) {
          await supabase.storage.from("colour-tiles").remove([row.image_path]);
        }
      }

      await refreshLibrary();
      setTileToDelete(null);
      setFeedback("Colour line deleted.");
    } catch (error) {
      setFeedback(error?.message || "Could not delete colour line.");
    } finally {
      setIsSaving(false);
    }
  }

  async function ensureFinish(name, sortOrder, cache) {
    const cached = cache.get(name);
    if (cached) return cached;

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("pcd_colour_finishes")
      .upsert({ name, sort_order: sortOrder, is_active: true }, { onConflict: "name" })
      .select("*")
      .single();
    if (error) throw error;
    cache.set(name, data);
    return data;
  }

  async function importWebsiteColours() {
    setIsImporting(true);
    setFeedback("");
    try {
      const supabase = createSupabaseBrowserClient();
      const finishCache = new Map(finishes.map((finish) => [finish.name, finish]));
      const tileCache = new Map(tiles.map((tile) => [`${tile.finish_id}|${tile.name}|${tile.image_url}`, tile]));
      let imported = 0;

      for (const materialKey of MATERIAL_KEYS) {
        const family = colourGroupsForMaterial(materialKey);
        for (const [finishIndex, group] of family.groups.entries()) {
          const finish = await ensureFinish(group.label, finishIndex + 1, finishCache);
          for (const [colourIndex, colour] of group.colours.entries()) {
            const tileKey = `${finish.id}|${colour.name}|${colour.src}`;
            let tile = tileCache.get(tileKey);
            if (!tile) {
              const { data, error } = await supabase
                .from("pcd_colour_tiles")
                .upsert(
                  {
                    finish_id: finish.id,
                    supplier: "Polytec",
                    name: colour.name,
                    image_url: colour.src,
                    sort_order: colourIndex + 1,
                    is_active: true,
                  },
                  { onConflict: "finish_id,name,image_url" }
                )
                .select("*")
                .single();
              if (error) throw error;
              tile = data;
              tileCache.set(tileKey, tile);
              imported += 1;
            }
            if (tile?.id) {
              await supabase
                .from("pcd_colour_tile_materials")
                .upsert(
                  { colour_tile_id: tile.id, material_key: materialKey, cost_per_sqm_ex_gst: 0 },
                  { onConflict: "colour_tile_id,material_key" }
                );
            }
          }
        }
      }

      await refreshLibrary();
      setFeedback(imported ? `Imported ${imported} website colour tiles.` : "Website colours are already imported.");
    } catch (error) {
      setFeedback(error?.message || "Could not import website colour tiles.");
    } finally {
      setIsImporting(false);
    }
  }

  const modal = isModalOpen && typeof document !== "undefined"
    ? createPortal(
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="colour-tile-modal-title" onMouseDown={closeModal}>
          <form className={styles.colourLibraryModal} onSubmit={saveTile} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.customerModalHeader}>
              <span className={styles.customerModalIcon}>PCD</span>
              <div>
                <p className={styles.tableMeta}>Colour line</p>
                <h2 id="colour-tile-modal-title">{tileDraft.id ? "Edit colour line" : "Add new colour line"}</h2>
              </div>
            </div>
            <div className={styles.customerModalBody}>
              <div className={styles.colourLibraryModalGrid}>
                <label className={styles.fieldLabel}>
                  Existing finish
                  <select className={styles.fieldInput} value={tileDraft.finish_id} onChange={(event) => updateTileDraft("finish_id", event.target.value)}>
                    <option value="">Select finish</option>
                    {finishes.map((finish) => (
                      <option key={finish.id} value={finish.id}>{finish.name}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.fieldLabel}>
                  Or new finish
                  <input className={styles.fieldInput} placeholder="e.g. Woodmatt" value={tileDraft.new_finish_name} onChange={(event) => updateTileDraft("new_finish_name", event.target.value)} />
                </label>
                <label className={styles.fieldLabel}>
                  Colour name
                  <input className={styles.fieldInput} value={tileDraft.name} onChange={(event) => updateTileDraft("name", event.target.value)} />
                </label>
                <label className={styles.fieldLabel}>
                  Supplier
                  <input className={styles.fieldInput} placeholder="e.g. Polytec" value={tileDraft.supplier} onChange={(event) => updateTileDraft("supplier", event.target.value)} />
                </label>
                <label className={styles.fieldLabel}>
                  Sort order
                  <input className={styles.fieldInput} type="number" value={tileDraft.sort_order} onChange={(event) => updateTileDraft("sort_order", event.target.value)} />
                </label>
                <div className={`${styles.fieldLabel} ${styles.fieldWide}`}>
                  <span>Upload tile image</span>
                  <div className={styles.colourLibraryFileControl}>
                    <button type="button" className={styles.secondaryButton} onClick={() => fileInputRef.current?.click()}>
                      Choose file
                    </button>
                    <span className={styles.colourLibraryFileName}>
                      {selectedFileName || (tileDraft.image_path ? "Current uploaded image retained" : "No file selected")}
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
                  <input className={styles.fieldInput} value={tileDraft.image_url} onChange={(event) => updateTileDraft("image_url", event.target.value)} />
                </label>
                <label className={styles.fieldLabel}>
                  Material
                  <select className={styles.fieldInput} value={tileDraft.material_key} onChange={(event) => updateTileDraft("material_key", event.target.value)}>
                    <option value="">Select material</option>
                    {COLOUR_MATERIALS.map((material) => (
                      <option key={material.key} value={material.key}>{material.label}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.fieldLabel}>
                  Cost / sqm ex GST
                  <input
                    className={styles.fieldInput}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={tileDraft.cost_per_sqm_ex_gst}
                    onChange={(event) => updateTileDraft("cost_per_sqm_ex_gst", event.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label className={`${styles.checkboxRow} ${styles.fieldWide}`}>
                  <input type="checkbox" checked={tileDraft.is_active} onChange={(event) => updateTileDraft("is_active", event.target.checked)} />
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
                {isSaving ? "Saving..." : tileDraft.id ? "Update colour line" : "Save colour line"}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )
    : null;

  const deleteModal = tileToDelete && typeof document !== "undefined"
    ? createPortal(
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-colour-title" onMouseDown={() => !isSaving && setTileToDelete(null)}>
          <div className={styles.confirmModal} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.customerModalHeader}>
              <span className={styles.customerModalIcon}>PCD</span>
              <div>
                <p className={styles.tableMeta}>Delete colour line</p>
                <h2 id="delete-colour-title">Delete {tileToDelete.name} / {materialLabel(tileToDelete.material_key)}?</h2>
              </div>
            </div>
            <div className={styles.customerModalBody}>
              <p className={styles.sectionText}>
                This removes this colour/material combination from material-based dropdowns. If this is the last material for the colour, the colour tile is removed too.
              </p>
            </div>
            <div className={styles.customerModalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setTileToDelete(null)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className={styles.rowDeleteButton} onClick={() => deleteTile(tileToDelete)} disabled={isSaving}>
                {isSaving ? "Deleting..." : "Delete line"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <section className={`${styles.settingsCard} ${styles.colourLibraryCard}`}>
        <div className={`${styles.sectionHeaderRow} ${styles.colourLibraryActionBar}`}>
          <label className={styles.colourLibrarySearch}>
            <span>Search colour lines</span>
            <input
              className={styles.fieldInput}
              type="search"
              placeholder="Search by colour, finish, supplier or material"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          {activeFilterCount ? (
            <button type="button" className={styles.secondaryButton} onClick={clearAllFilters}>
              Clear filters ({activeFilterCount})
            </button>
          ) : null}
          <div className={styles.inlineButtonRow}>
            <button type="button" className={styles.secondaryButton} onClick={importWebsiteColours} disabled={isImporting}>
              {isImporting ? "Importing..." : "Import current website colours"}
            </button>
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
                <th>Tile</th>
                <th>Colour</th>
                <th>{renderColumnFilter("supplier", "Supplier")}</th>
                <th>{renderColumnFilter("finish", "Finish")}</th>
                <th>{renderColumnFilter("material", "Material")}</th>
                <th>Cost / sqm</th>
                <th>Source</th>
                <th>Sort</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTableRows.map((tile) => (
                <tr key={`${tile.id}-${tile.material_key || "unassigned"}`}>
                  <td>
                    <span className={styles.colourLibraryTableTile}>
                      <img src={tile.image_url} alt="" />
                    </span>
                  </td>
                  <td>{tile.name}</td>
                  <td>{tile.supplier || "Polytec"}</td>
                  <td>{tile.finish?.name || "-"}</td>
                  <td>{materialLabel(tile.material_key)}</td>
                  <td>
                    {tile.cost_per_sqm_ex_gst == null ? "-" : `$${Number(tile.cost_per_sqm_ex_gst || 0).toFixed(2)}`}
                  </td>
                  <td>{imageSourceLabel(tile)}</td>
                  <td>{tile.sort_order || 0}</td>
                  <td>{tile.is_active ? "Active" : "Hidden"}</td>
                  <td className={styles.rowActions}>
                    <button type="button" className={styles.rowEditButton} onClick={() => openEditModal(tile)} disabled={isSaving}>
                      Edit
                    </button>
                    <button type="button" className={styles.rowDeleteButton} onClick={() => setTileToDelete(tile)} disabled={isSaving}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredTableRows.length ? (
                <tr>
                  <td className={styles.emptyCell} colSpan="10">
                    {tableRows.length
                      ? "No colour lines match your search."
                      : "No colour lines yet. Import the current website colours or add a new colour line."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {modal}
      {deleteModal}
    </>
  );
}
