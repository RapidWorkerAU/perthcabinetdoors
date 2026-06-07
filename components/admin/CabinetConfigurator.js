"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "../../app/admin/admin-shell.module.css";
import { COLOUR_MATERIALS, materialTypeForKey, optionsFromColourFamily } from "../../lib/pcd-colour-library";
import {
  calculateCabinetTotals,
  normalizeCabinetConfig,
} from "../../lib/pcd-cabinet-utils";
import CabinetSchematic from "./CabinetSchematic";

const DEFAULT_CONFIG = {
  label: "Base cabinet",
  height_mm: 720,
  width_mm: 900,
  depth_mm: 560,
  carcass_material: "",
  carcass_thickness_mm: 16,
  back_panel_included: true,
  back_panel_material: "",
  back_panel_thickness_mm: 16,
  shelf_qty: 0,
  shelf_material: "",
  shelf_finish: "",
  shelf_colour: "",
  shelf_thickness_mm: 16,
  shelf_heights_mm: [],
  cost_per_sqm_carcass: 0,
  cost_per_sqm_shelf: 0,
  labour_hours: 0,
  labour_cost: 0,
  notes: "",
};

const CONFIG_TABS = [
  { key: "dimensions", label: "Dimensions" },
  { key: "boards", label: "Boards and labour" },
  { key: "backShelves", label: "Back panel and shelves" },
  { key: "summary", label: "Calculated summary" },
  { key: "images", label: "Images" },
  { key: "notes", label: "Notes" },
];

function money(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function shelfCount(value) {
  return Math.max(0, Math.floor(numberValue(value)));
}

function defaultShelfHeight(index, count, cabinetHeight) {
  const height = Math.max(0, numberValue(cabinetHeight));
  if (!count || !height) return 0;
  return Math.round(((index + 1) * height) / (count + 1));
}

function normalizeShelfHeights(heights, count, cabinetHeight) {
  const source = Array.isArray(heights) ? heights : [];
  return Array.from({ length: count }, (_, index) => {
    const saved = numberValue(source[index]);
    return saved > 0 ? saved : defaultShelfHeight(index, count, cabinetHeight);
  });
}

function isShelfPiece(piece) {
  return String(piece?.label || "").toLowerCase().includes("shelf");
}

function cabinetDescription(config) {
  const shelfText = Number(config.shelf_qty) > 0
    ? `, ${config.shelf_qty} ${Number(config.shelf_qty) === 1 ? "shelf" : "shelves"}`
    : "";

  return `${config.width_mm}mm wide x ${config.height_mm}mm high x ${config.depth_mm}mm deep - ${config.carcass_material || "cabinet board"} ${config.carcass_thickness_mm}mm carcass${shelfText}`;
}

function fieldId(prefix, name) {
  return `${prefix}-${name}`.replace(/[^a-z0-9-_]/gi, "-");
}

function Field({ label, children, wide = false }) {
  return (
    <label className={`${styles.fieldLabel} ${wide ? styles.fieldWide : ""}`}>
      {label}
      {children}
    </label>
  );
}

function materialDisplay({ material, finish, colour }) {
  return [material, finish, colour].filter(Boolean).join(" - ");
}

function ToggleGroup({ value, options, onChange }) {
  return (
    <div className={styles.cabinetToggleGroup}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            className={selected ? styles.cabinetToggleActive : styles.cabinetToggle}
            onClick={() => onChange(option)}
            aria-pressed={selected}
          >
            <span aria-hidden="true">{selected ? "✓" : ""}</span>
            {option}mm
          </button>
        );
      })}
    </div>
  );
}

function ColourLibraryCombobox({ disabled = false, placeholder, value, options, onChange }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const [inputEl, setInputEl] = useState(null);
  const cleanedQuery = query.trim().toLowerCase();
  const queryTokens = cleanedQuery.split(/\s+/).filter(Boolean);
  const normaliseSearchText = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const visibleOptions = cleanedQuery
    ? options.filter((option) => {
        const searchText = normaliseSearchText([
          option.label,
          option.name,
          option.finish,
          option.supplier,
          option.meta,
          `${option.finish || ""} ${option.name || ""}`,
          `${option.name || ""} ${option.finish || ""}`,
        ].filter(Boolean).join(" "));
        return queryTokens.every((token) => searchText.includes(normaliseSearchText(token)));
      })
    : options;

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    if (!open || !inputEl) return;

    function positionMenu() {
      const rect = inputEl.getBoundingClientRect();
      const viewportPadding = 12;
      const preferredWidth = Math.max(rect.width, 360);
      const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        window.innerWidth - width - viewportPadding
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(160, Math.min(360, availableHeight - 4));
      setMenuStyle({
        left: `${left}px`,
        maxHeight: `${maxHeight}px`,
        top: `${openAbove ? rect.top - maxHeight - 4 : rect.bottom + 4}px`,
        width: `${width}px`,
      });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, inputEl]);

  function choose(option) {
    setQuery(option.label);
    onChange(option);
    setOpen(false);
  }

  return (
    <div className={styles.cabinetColourCombo}>
      <input
        ref={setInputEl}
        className={styles.fieldInput}
        disabled={disabled}
        placeholder={placeholder}
        type="text"
        value={query}
        onMouseDown={(event) => event.stopPropagation()}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => !disabled && setOpen(true)}
      />
      <button
        aria-label="Open shelf material options"
        className={styles.cabinetColourComboButton}
        disabled={disabled}
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) setOpen((current) => !current);
        }}
      />
      {open && !disabled && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`${styles.quoteColourMenu} ${styles.cabinetColourMenu}`}
              style={menuStyle}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {visibleOptions.length ? (
                visibleOptions.map((option) => (
                  <button
                    className={styles.quoteColourOption}
                    key={`${option.id || option.label}-${option.src}`}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      choose(option);
                    }}
                  >
                    <span className={styles.quoteOptionThumb}>
                      {option.src ? <img alt="" src={option.src} /> : null}
                    </span>
                    <span>
                      <strong>{option.name || option.label}</strong>
                      <small>{option.finish || option.meta || ""}</small>
                    </span>
                  </button>
                ))
              ) : (
                <div className={styles.quoteColourEmpty}>No match</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function MaterialCostPrompt({ prompt, onUseOnce, onSaveFuture, onCancel }) {
  if (!prompt) return null;

  return (
    <div className={styles.cabinetCostPrompt}>
      <div>
        <strong>No price per sqm found for {prompt.material}.</strong>
        <span>Please enter a cost per sqm ex GST.</span>
      </div>
      <input
        className={styles.fieldInput}
        type="number"
        min="0"
        step="0.01"
        value={prompt.cost}
        onChange={(event) => prompt.onChange(event.target.value)}
      />
      <div className={styles.cabinetPromptActions}>
        <button type="button" className={styles.cabinetPromptButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.cabinetPromptButton} onClick={onUseOnce}>
          Use for this quote only
        </button>
        <button type="button" className={styles.cabinetPromptPrimaryButton} onClick={onSaveFuture}>
          Save to colour library
        </button>
      </div>
    </div>
  );
}

export default function CabinetConfigurator({
  lineItemId,
  quoteId,
  quoteLine = null,
  existingConfig = null,
  onSave,
  onCancel,
}) {
  const quoteMaterial = quoteLine?.material || existingConfig?.carcass_material || "";
  const quoteColour = quoteLine?.colour || existingConfig?.colour || "";
  const quoteFinish = quoteLine?.finish || existingConfig?.finish || "";
  const initialConfig = {
    ...DEFAULT_CONFIG,
    ...(existingConfig || {}),
    carcass_material: quoteMaterial,
    back_panel_material: quoteMaterial,
    back_panel_thickness_mm: [16, 18].includes(Number(existingConfig?.back_panel_thickness_mm))
      ? Number(existingConfig.back_panel_thickness_mm)
      : 16,
  };
  const [config, setConfig] = useState(() => ({
    ...initialConfig,
    back_panel_material: initialConfig.carcass_material || "",
    shelf_material: initialConfig.shelf_material || initialConfig.carcass_material || "",
  }));
  const [sameShelfMaterial, setSameShelfMaterial] = useState(
    (!initialConfig.shelf_material || initialConfig.shelf_material === initialConfig.carcass_material)
      && (!initialConfig.shelf_thickness_mm || Number(initialConfig.shelf_thickness_mm) === Number(initialConfig.carcass_thickness_mm))
  );
  const [costPrompt, setCostPrompt] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [isSavingCost, setIsSavingCost] = useState(false);
  const [activeTab, setActiveTab] = useState("dimensions");
  const [shelfColourOptions, setShelfColourOptions] = useState([]);

  const normalizedConfig = useMemo(() => normalizeCabinetConfig({
    ...config,
    carcass_material: quoteMaterial,
    carcass_finish: quoteFinish,
    carcass_colour: quoteColour,
    back_panel_material: quoteMaterial,
    shelf_material: sameShelfMaterial ? config.carcass_material : config.shelf_material,
    shelf_finish: sameShelfMaterial ? quoteFinish : config.shelf_finish,
    shelf_colour: sameShelfMaterial ? quoteColour : config.shelf_colour,
    cost_per_sqm_shelf: sameShelfMaterial ? config.cost_per_sqm_carcass : config.cost_per_sqm_shelf,
    shelf_thickness_mm: sameShelfMaterial ? config.carcass_thickness_mm : config.shelf_thickness_mm,
    shelf_heights_mm: normalizeShelfHeights(config.shelf_heights_mm, shelfCount(config.shelf_qty), config.height_mm),
  }), [config, quoteColour, quoteFinish, quoteMaterial, sameShelfMaterial]);
  const shelfMaterialLabel = materialDisplay({
    finish: normalizedConfig.shelf_finish,
    colour: normalizedConfig.shelf_colour,
  });

  const totals = useMemo(() => calculateCabinetTotals(normalizedConfig), [normalizedConfig]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = window.setTimeout(() => setFeedback(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    let cancelled = false;

    async function loadShelfOptions() {
      setShelfColourOptions([]);
      if (sameShelfMaterial || !config.shelf_material || !config.shelf_thickness_mm) return;

      try {
        const response = await fetch(
          `/api/colour-library?material=${encodeURIComponent(config.shelf_material)}&thickness=${encodeURIComponent(`${config.shelf_thickness_mm}mm`)}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (!cancelled) {
          setShelfColourOptions(payload?.colourFamily?.groups?.length ? optionsFromColourFamily(payload.colourFamily) : []);
        }
      } catch {
        if (!cancelled) setShelfColourOptions([]);
      }
    }

    loadShelfOptions();
    return () => {
      cancelled = true;
    };
  }, [sameShelfMaterial, config.shelf_material, config.shelf_thickness_mm]);

  function updateConfig(field, value) {
    setConfig((current) => {
      const next = { ...current, [field]: value };
      if (field === "cost_per_sqm_carcass" && sameShelfMaterial) {
        next.cost_per_sqm_shelf = value;
      }
      if (field === "carcass_thickness_mm" && sameShelfMaterial) {
        next.shelf_thickness_mm = value;
      }
      if (field === "shelf_thickness_mm") {
        next.shelf_finish = "";
        next.shelf_colour = "";
        next.cost_per_sqm_shelf = 0;
      }
      if (field === "height_mm" || field === "shelf_qty") {
        next.shelf_heights_mm = normalizeShelfHeights(
          current.shelf_heights_mm,
          shelfCount(field === "shelf_qty" ? value : next.shelf_qty),
          field === "height_mm" ? value : next.height_mm
        );
      }
      return next;
    });
  }

  function updateShelfHeight(index, value) {
    setConfig((current) => {
      const heights = normalizeShelfHeights(current.shelf_heights_mm, shelfCount(current.shelf_qty), current.height_mm);
      heights[index] = value;
      return { ...current, shelf_heights_mm: heights };
    });
  }

  function updateShelfMaterialType(value) {
    setConfig((current) => ({
      ...current,
      shelf_material: value,
      shelf_finish: "",
      shelf_colour: "",
      cost_per_sqm_shelf: 0,
    }));
  }

  function selectShelfColour(option) {
    setConfig((current) => ({
      ...current,
      shelf_finish: option.finish || "",
      shelf_colour: option.name || option.label || "",
      cost_per_sqm_shelf: Number(option.costPerSqmExGst || 0),
    }));
    if (Number(option.costPerSqmExGst || 0) > 0) {
      setFeedback(`${option.name || option.label} cost loaded.`);
    }
  }

  function updatePromptCost(value) {
    setCostPrompt((current) => (current ? { ...current, cost: value } : current));
  }

  function applyCost(role, value) {
    if (role === "shelf") {
      updateConfig("cost_per_sqm_shelf", value);
      return;
    }
    updateConfig("cost_per_sqm_carcass", value);
  }

  function lookupUrl(role) {
    const material = role === "shelf" ? normalizedConfig.shelf_material : normalizedConfig.carcass_material;
    const thickness = role === "shelf" ? normalizedConfig.shelf_thickness_mm : normalizedConfig.carcass_thickness_mm;
    const colour = role === "shelf" ? normalizedConfig.shelf_colour : quoteColour;
    const params = new URLSearchParams();
    if (colour) params.set("colour", colour);
    if (thickness) params.set("thickness", `${thickness}mm`);
    const query = params.toString();
    return `/api/admin/board-costs/${encodeURIComponent(material)}${query ? `?${query}` : ""}`;
  }

  async function lookupMaterialCost(role, { promptIfMissing = true } = {}) {
    const material = role === "shelf" ? normalizedConfig.shelf_material : normalizedConfig.carcass_material;
    if (!material) {
      setFeedback("Select a material on the quote line before looking up the cost.");
      return;
    }

    setFeedback("");
    try {
      const response = await fetch(lookupUrl(role), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load material cost.");

      if (payload.found && payload.cost) {
        applyCost(role, payload.cost.cost_per_sqm_ex_gst);
        if (promptIfMissing) setFeedback(`${material} cost loaded.`);
        return;
      }

      if (promptIfMissing) {
        setCostPrompt({
          role,
          material,
          cost: "",
          onChange: updatePromptCost,
        });
      }
    } catch (error) {
      setFeedback(error?.message || "Could not load material cost.");
    }
  }

  useEffect(() => {
    if (!normalizedConfig.carcass_material || Number(normalizedConfig.cost_per_sqm_carcass) > 0) return;
    lookupMaterialCost("carcass", { promptIfMissing: false });
  }, [normalizedConfig.carcass_material]);

  function usePromptCostOnce() {
    const cost = numberValue(costPrompt?.cost);
    if (!costPrompt || cost < 0) return;
    applyCost(costPrompt.role, cost);
    setCostPrompt(null);
    setFeedback(`${costPrompt.material} cost set for this quote only.`);
  }

  async function savePromptCostFuture() {
    const cost = numberValue(costPrompt?.cost);
    if (!costPrompt || cost < 0) return;

    setIsSavingCost(true);
    setFeedback("");
    try {
      const response = await fetch(lookupUrl(costPrompt.role), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost_per_sqm_ex_gst: cost }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save material cost.");

      applyCost(costPrompt.role, payload.cost.cost_per_sqm_ex_gst);
      setFeedback(`${costPrompt.material} cost saved to the colour library.`);
      setCostPrompt(null);
    } catch (error) {
      setFeedback(error?.message || "Could not save material cost.");
    } finally {
      setIsSavingCost(false);
    }
  }

  function saveCabinet() {
    const label = config.label?.trim() || "Base cabinet";
    const savedConfig = {
      ...normalizedConfig,
      id: existingConfig?.id || undefined,
      line_item_id: lineItemId || existingConfig?.line_item_id || null,
      quote_id: quoteId || existingConfig?.quote_id || null,
      label,
      notes: config.notes || "",
      calculated_cut_list: totals.cut_list,
      calculated_material_cost_ex_gst: totals.calculated_material_cost_ex_gst,
      labour_hours: totals.labour_hours,
      labour_cost: totals.labour_hours,
    };
    const unitPrice = totals.calculated_material_cost_ex_gst;

    onSave?.({
      ...savedConfig,
      total_cabinet_cost_ex_gst: unitPrice,
      line_item_patch: {
        product_type: "base_cabinet",
        product_name: label,
        description: cabinetDescription(savedConfig),
        product_unit_cost_ex_gst: unitPrice,
        unit_price_ex_gst: unitPrice,
        line_total_ex_gst: unitPrice,
        labour_hours: totals.labour_hours,
      },
    });
  }

  const carcassCostId = fieldId(lineItemId || "cabinet", "carcass-cost");
  const shelfCostId = fieldId(lineItemId || "cabinet", "shelf-cost");

  return (
    <section className={styles.cabinetConfigurator}>
      <header className={styles.cabinetConfiguratorHeader}>
        <div className={styles.cabinetHeaderTitle}>
          <span className={`${styles.customerModalIcon} ${styles.cabinetModalIcon}`}>PCD</span>
          <div>
            <p className={styles.tableMeta}>Cabinet configurator</p>
            <h2 id="cabinet-configurator-title">{config.label || "Base cabinet"}</h2>
          </div>
        </div>
        <div className={styles.cabinetHeaderActions}>
          <div className={styles.cabinetHeaderTotals}>
            <span>Total ex GST</span>
            <strong>{money(totals.total_cabinet_cost_ex_gst)}</strong>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.primaryButton} onClick={saveCabinet} disabled={isSavingCost}>
            Save cabinet
          </button>
        </div>
      </header>

      {feedback ? <div className={`${styles.inlineNotice} ${styles.cabinetFeedbackNotice}`}>{feedback}</div> : null}

      <nav className={styles.cabinetConfiguratorTabs} aria-label="Cabinet configurator sections">
        {CONFIG_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? styles.cabinetConfiguratorTabActive : styles.cabinetConfiguratorTab}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className={styles.cabinetWorkbench}>
        <div className={styles.cabinetControlsColumn}>
          {activeTab === "dimensions" ? <section className={styles.cabinetConfiguratorSection}>
            <h4>Cabinet dimensions</h4>
            <div className={styles.cabinetCompactGrid}>
              <Field label="Label">
                <input className={styles.fieldInput} value={config.label} onChange={(event) => updateConfig("label", event.target.value)} />
              </Field>
              <Field label="Height mm">
                <input className={styles.fieldInput} type="number" min="1" value={config.height_mm} onChange={(event) => updateConfig("height_mm", event.target.value)} />
              </Field>
              <Field label="Width mm">
                <input className={styles.fieldInput} type="number" min="1" value={config.width_mm} onChange={(event) => updateConfig("width_mm", event.target.value)} />
              </Field>
              <Field label="Depth mm">
                <input className={styles.fieldInput} type="number" min="1" value={config.depth_mm} onChange={(event) => updateConfig("depth_mm", event.target.value)} />
              </Field>
            </div>
          </section> : null}

          {activeTab === "boards" ? <section className={styles.cabinetConfiguratorSection}>
            <h4>Boards and labour</h4>
            <div className={styles.cabinetCompactGrid}>
              <Field label="Carcass material">
                <div className={styles.cabinetLookupField}>
                  <input
                    className={styles.fieldInput}
                    value={materialDisplay({ material: normalizedConfig.carcass_material, finish: quoteFinish, colour: quoteColour })}
                    readOnly
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => lookupMaterialCost("carcass")}
                    title="Look up the saved board cost for this material"
                    aria-label="Look up saved carcass board cost"
                  >
                    Lookup
                  </button>
                </div>
              </Field>
              <Field label="Carcass thickness">
                <ToggleGroup value={numberValue(config.carcass_thickness_mm)} options={[16, 18]} onChange={(value) => updateConfig("carcass_thickness_mm", value)} />
              </Field>
              <Field label="Carcass $ / sqm">
                <input id={carcassCostId} className={styles.fieldInput} type="number" min="0" step="0.01" value={config.cost_per_sqm_carcass} onChange={(event) => updateConfig("cost_per_sqm_carcass", event.target.value)} />
              </Field>
              <Field label="Labour hours">
                <input className={styles.fieldInput} type="number" min="0" step="0.01" value={config.labour_hours ?? config.labour_cost} onChange={(event) => updateConfig("labour_hours", event.target.value)} />
              </Field>
            </div>
            <MaterialCostPrompt
              prompt={costPrompt?.role === "carcass" ? costPrompt : null}
              onUseOnce={usePromptCostOnce}
              onSaveFuture={savePromptCostFuture}
              onCancel={() => setCostPrompt(null)}
            />
          </section> : null}

          {activeTab === "backShelves" ? <section className={styles.cabinetConfiguratorSection}>
            <h4>Back panel and shelves</h4>
            <div className={styles.cabinetCompactGrid}>
              <label className={styles.cabinetCheck}>
                <input type="checkbox" checked={Boolean(config.back_panel_included)} onChange={(event) => updateConfig("back_panel_included", event.target.checked)} />
                Include back panel
              </label>
              {config.back_panel_included ? (
                <>
                  <Field label="Back material">
                    <input
                      className={styles.fieldInput}
                      value={materialDisplay({ material: normalizedConfig.back_panel_material, finish: quoteFinish, colour: quoteColour })}
                      readOnly
                    />
                  </Field>
                  <Field label="Back thickness">
                    <ToggleGroup value={numberValue(config.back_panel_thickness_mm)} options={[16, 18]} onChange={(value) => updateConfig("back_panel_thickness_mm", value)} />
                  </Field>
                </>
              ) : null}
              <Field label="Shelf qty">
                <input className={styles.fieldInput} type="number" min="0" value={config.shelf_qty} onChange={(event) => updateConfig("shelf_qty", event.target.value)} />
              </Field>
              <label className={styles.cabinetCheck}>
                <input
                  type="checkbox"
                  checked={sameShelfMaterial}
                  onChange={(event) => {
                    setSameShelfMaterial(event.target.checked);
                    if (event.target.checked) {
                      setConfig((current) => ({
                        ...current,
                        shelf_material: normalizedConfig.carcass_material,
                        shelf_finish: quoteFinish,
                        shelf_colour: quoteColour,
                        shelf_thickness_mm: current.carcass_thickness_mm,
                        cost_per_sqm_shelf: current.cost_per_sqm_carcass,
                      }));
                    }
                  }}
                />
                Shelves same as carcass board and thickness
              </label>
              {Number(config.shelf_qty) > 0 ? (
                <div className={styles.cabinetShelfHeightGrid}>
                  {normalizeShelfHeights(config.shelf_heights_mm, shelfCount(config.shelf_qty), config.height_mm).map((height, index) => (
                    <Field key={`shelf-height-${index}`} label={`Shelf ${index + 1} height from bottom`}>
                      <input
                        className={styles.fieldInput}
                        type="number"
                        min="0"
                        max={numberValue(config.height_mm)}
                        value={height}
                        onChange={(event) => updateShelfHeight(index, event.target.value)}
                      />
                    </Field>
                  ))}
                </div>
              ) : null}
              {Number(config.shelf_qty) > 0 && !sameShelfMaterial ? (
                <>
                  <Field label="Shelf material type">
                    <select className={styles.fieldInput} value={materialTypeForKey(config.shelf_material)} onChange={(event) => updateShelfMaterialType(event.target.value)}>
                      {COLOUR_MATERIALS.map((material) => (
                        <option key={material.value} value={material.value}>{material.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Shelf thickness">
                    <ToggleGroup value={numberValue(config.shelf_thickness_mm)} options={[16, 18]} onChange={(value) => updateConfig("shelf_thickness_mm", value)} />
                  </Field>
                  <Field label="Shelf finish and colour">
                    <div className={styles.cabinetLookupField}>
                      <ColourLibraryCombobox
                        disabled={!config.shelf_material || !config.shelf_thickness_mm}
                        placeholder={config.shelf_material && config.shelf_thickness_mm ? "Select shelf finish and colour" : "Select type and thickness first"}
                        value={shelfMaterialLabel}
                        options={shelfColourOptions}
                        onChange={selectShelfColour}
                      />
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => lookupMaterialCost("shelf")}
                        title="Look up the saved colour-library cost for this shelf material"
                        aria-label="Look up saved shelf board cost"
                      >
                        Lookup
                      </button>
                    </div>
                  </Field>
                  <Field label="Shelf $ / sqm">
                    <input id={shelfCostId} className={styles.fieldInput} type="number" min="0" step="0.01" value={config.cost_per_sqm_shelf} onChange={(event) => updateConfig("cost_per_sqm_shelf", event.target.value)} />
                  </Field>
                </>
              ) : null}
            </div>
            <MaterialCostPrompt
              prompt={costPrompt?.role === "shelf" ? costPrompt : null}
              onUseOnce={usePromptCostOnce}
              onSaveFuture={savePromptCostFuture}
              onCancel={() => setCostPrompt(null)}
            />
          </section> : null}

          {activeTab === "notes" ? <section className={styles.cabinetConfiguratorSection}>
            <h4>Notes</h4>
            <textarea className={styles.textareaInput} rows={3} value={config.notes} onChange={(event) => updateConfig("notes", event.target.value)} />
          </section> : null}

          {activeTab === "summary" ? <section className={styles.cabinetConfiguratorSection}>
            <div className={styles.cabinetSectionTitleRow}>
              <h4>Calculated summary</h4>
              <div className={styles.cabinetTotalsStrip}>
                <span><b>Materials</b> {money(totals.calculated_material_cost_ex_gst)}</span>
                <span><b>Labour hours</b> {totals.labour_hours}</span>
                <span><b>Total</b> {money(totals.total_cabinet_cost_ex_gst)}</span>
              </div>
            </div>
            <div className={styles.cabinetCutListWrap}>
              <table className={`${styles.productsTable} ${styles.cabinetCutListTable}`}>
                <thead>
                  <tr>
                    <th>Piece</th>
                    <th>Qty</th>
                    <th>Size</th>
                    <th>Material</th>
                    <th>Area / unit</th>
                    <th>Cost / unit</th>
                    <th>Total area</th>
                    <th>Total cost ex GST</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.cut_list.map((piece) => {
                    const rate = isShelfPiece(piece)
                      ? normalizedConfig.cost_per_sqm_shelf || normalizedConfig.cost_per_sqm_carcass
                      : normalizedConfig.cost_per_sqm_carcass;
                    const unitArea = numberValue(piece.area_sqm);
                    const qty = numberValue(piece.qty);
                    const unitCost = unitArea * numberValue(rate);
                    const totalArea = unitArea * qty;
                    const rowCost = totalArea * numberValue(rate);
                    return (
                      <tr key={`${piece.label}-${piece.material}`}>
                        <td>{piece.label}</td>
                        <td>{piece.qty}</td>
                        <td>{piece.width_mm} x {piece.height_mm}mm</td>
                        <td>{piece.material || "-"}</td>
                        <td>{unitArea.toFixed(4)} sqm</td>
                        <td>{money(unitCost)}</td>
                        <td>{totalArea.toFixed(4)} sqm</td>
                        <td>{money(rowCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section> : null}

          {activeTab === "images" ? <section className={`${styles.cabinetConfiguratorSection} ${styles.cabinetDrawingSection}`}>
            <h4>Schematic drawings</h4>
            <CabinetSchematic config={normalizedConfig} />
          </section> : null}
        </div>
      </div>
    </section>
  );
}
