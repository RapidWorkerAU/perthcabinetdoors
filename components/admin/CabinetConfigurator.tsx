"use client"

import React, { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { COLOUR_MATERIALS, materialTypeForKey, optionsFromColourFamily } from "../../lib/pcd-colour-library"
import { calculateCabinetTotals, normalizeCabinetConfig } from "../../lib/pcd-cabinet-utils"
import CabinetSchematic from "./CabinetSchematic"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CabinetConfig = Record<string, any>

interface ColourOption {
  id?: string | number
  label: string
  name?: string
  finish?: string
  src?: string
  supplier?: string
  meta?: string
  costPerSqmExGst?: number | string
}

interface CostPrompt {
  role: "carcass" | "shelf"
  material: string
  cost: string | number
  onChange: (v: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: CabinetConfig = {
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
}

const CONFIG_TABS = [
  { key: "dimensions", label: "Dimensions" },
  { key: "boards", label: "Boards and labour" },
  { key: "backShelves", label: "Back panel and shelves" },
  { key: "summary", label: "Calculated summary" },
  { key: "notes", label: "Notes" },
]

const tw = {
  fieldLabel:   "flex flex-col gap-[3px]",
  fieldSpan:    "text-[10px] font-medium text-[#5a5a52]",
  input:        "h-[30px] w-full border border-[#dbd8cc] rounded-[6px] px-[8px] text-[12px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61]",
  inputRo:      "h-[30px] w-full border border-[#dbd8cc] rounded-[6px] px-[8px] text-[12px] text-[#8b8a81] bg-[#f5f8f4] cursor-default",
  card:         "bg-white border border-[#dbd8cc] rounded-[8px] p-3 mb-3 last:mb-0",
  sectionTitle: "text-[10px] font-medium text-[#8b8a81] uppercase tracking-[0.06em] mb-2",
  grid2:        "grid grid-cols-2 gap-2",
  primaryBtn:   "h-[30px] px-3 bg-[#1c2b1e] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors",
  secondaryBtn: "h-[30px] px-3 bg-white border border-[#dbd8cc] text-[12px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
  smBtn:        "h-[26px] px-2 bg-white border border-[#dbd8cc] text-[11px] font-medium rounded-[5px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors flex-shrink-0",
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function money(value: unknown): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function numberValue(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function shelfCount(value: unknown): number {
  return Math.max(0, Math.floor(numberValue(value)))
}

function defaultShelfHeight(index: number, count: number, cabinetHeight: unknown): number {
  const height = Math.max(0, numberValue(cabinetHeight))
  if (!count || !height) return 0
  return Math.round(((index + 1) * height) / (count + 1))
}

function normalizeShelfHeights(heights: unknown, count: number, cabinetHeight: unknown): number[] {
  const source = Array.isArray(heights) ? heights : []
  return Array.from({ length: count }, (_, index) => {
    const saved = numberValue(source[index])
    return saved > 0 ? saved : defaultShelfHeight(index, count, cabinetHeight)
  })
}

function isShelfPiece(piece: CabinetConfig): boolean {
  return String(piece?.label || "").toLowerCase().includes("shelf")
}

function cabinetDescription(config: CabinetConfig): string {
  const shelfText =
    Number(config.shelf_qty) > 0
      ? `, ${config.shelf_qty} ${Number(config.shelf_qty) === 1 ? "shelf" : "shelves"}`
      : ""
  return `${config.width_mm}mm wide x ${config.height_mm}mm high x ${config.depth_mm}mm deep - ${config.carcass_material || "cabinet board"} ${config.carcass_thickness_mm}mm carcass${shelfText}`
}

function fieldId(prefix: string, name: string): string {
  return `${prefix}-${name}`.replace(/[^a-z0-9-_]/gi, "-")
}

function materialDisplay({ material, finish, colour }: { material?: unknown; finish?: unknown; colour?: unknown }): string {
  return [material, finish, colour].filter(Boolean).join(" - ")
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleGroup({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-[3px]">
      {options.map(option => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`h-[28px] px-3 rounded-[4px] text-[11px] font-medium transition-colors border ${
            value === option
              ? "bg-[#1c2b1e] border-[#1c2b1e] text-white"
              : "bg-white border-[#dbd8cc] text-[#5a5a52] hover:bg-[#f5f8f4]"
          }`}
        >
          {option}mm
        </button>
      ))}
    </div>
  )
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-[3px] ${wide ? "col-span-2" : ""}`}>
      <span className="text-[10px] font-medium text-[#5a5a52]">{label}</span>
      {children}
    </label>
  )
}

function MaterialCostPrompt({ prompt, onUseOnce, onSaveFuture, onCancel }: {
  prompt: CostPrompt | null
  onUseOnce: () => void
  onSaveFuture: () => void
  onCancel: () => void
}) {
  if (!prompt) return null
  return (
    <div className="mt-3 p-3 bg-[#f5f8f4] border border-[#dbd8cc] rounded-[6px] flex flex-col gap-2">
      <div className="flex flex-col gap-[2px]">
        <p className="text-[11px] font-semibold text-[#1a1a18]">No price found for {prompt.material}</p>
        <p className="text-[10px] text-[#8b8a81]">Enter a cost per sqm ex GST</p>
      </div>
      <input
        type="number"
        min="0"
        step="0.01"
        value={prompt.cost}
        onChange={e => prompt.onChange(e.target.value)}
        className="h-[30px] w-full border border-[#dbd8cc] rounded-[6px] px-2 text-[12px] font-mono text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61]"
      />
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={onCancel} className="h-[26px] px-2 bg-white border border-[#dbd8cc] text-[11px] rounded-[5px] text-[#5a5a52] hover:bg-[#f5f8f4]">Cancel</button>
        <button type="button" onClick={onUseOnce} className="h-[26px] px-2 bg-white border border-[#dbd8cc] text-[11px] rounded-[5px] text-[#1a1a18] hover:bg-[#f5f8f4]">Use for this quote only</button>
        <button type="button" onClick={onSaveFuture} className="h-[26px] px-2 bg-[#1c2b1e] border border-[#1c2b1e] text-white text-[11px] rounded-[5px] hover:bg-[#2d3f2f]">Save to colour library</button>
      </div>
    </div>
  )
}

function ColourLibraryCombobox({ disabled = false, placeholder, value, options, onChange }: {
  disabled?: boolean
  placeholder?: string
  value: string
  options: ColourOption[]
  onChange: (option: ColourOption) => void
}) {
  const [query, setQuery] = useState(value || "")
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null)

  const cleanedQuery = query.trim().toLowerCase()
  const queryTokens = cleanedQuery.split(/\s+/).filter(Boolean)
  const normaliseSearchText = (text: string) =>
    String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

  const visibleOptions = cleanedQuery
    ? options.filter(option => {
        const searchText = normaliseSearchText(
          [
            option.label,
            option.name,
            option.finish,
            option.supplier,
            option.meta,
            `${option.finish || ""} ${option.name || ""}`,
            `${option.name || ""} ${option.finish || ""}`,
          ]
            .filter(Boolean)
            .join(" ")
        )
        return queryTokens.every(token => searchText.includes(normaliseSearchText(token)))
      })
    : options

  useEffect(() => { setQuery(value || "") }, [value])

  useEffect(() => {
    if (!open || !inputEl) return

    function positionMenu() {
      const rect = inputEl!.getBoundingClientRect()
      const viewportPadding = 12
      const preferredWidth = Math.max(rect.width, 360)
      const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2)
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        window.innerWidth - width - viewportPadding
      )
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
      const spaceAbove = rect.top - viewportPadding
      const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow
      const availableHeight = openAbove ? spaceAbove : spaceBelow
      const maxHeight = Math.max(160, Math.min(360, availableHeight - 4))
      setMenuStyle({
        bottom: openAbove ? `${window.innerHeight - rect.top + 4}px` : "auto",
        left: `${left}px`,
        maxHeight: `${maxHeight}px`,
        top: openAbove ? "auto" : `${rect.bottom + 4}px`,
        width: `${width}px`,
      })
    }

    positionMenu()
    window.addEventListener("resize", positionMenu)
    window.addEventListener("scroll", positionMenu, true)
    return () => {
      window.removeEventListener("resize", positionMenu)
      window.removeEventListener("scroll", positionMenu, true)
    }
  }, [open, inputEl])

  function choose(option: ColourOption) {
    setQuery(option.label)
    onChange(option)
    setOpen(false)
  }

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={setInputEl}
        className={tw.input}
        disabled={disabled}
        placeholder={placeholder}
        type="text"
        value={query}
        onMouseDown={e => e.stopPropagation()}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => !disabled && setOpen(true)}
      />
      <button
        aria-label="Open shelf material options"
        className="absolute right-[6px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] flex items-center justify-center text-[#8b8a81] hover:text-[#1a1a18]"
        disabled={disabled}
        type="button"
        onMouseDown={e => {
          e.preventDefault()
          e.stopPropagation()
          if (!disabled) setOpen(current => !current)
        }}
      >
        ▾
      </button>
      {open && !disabled && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[60] bg-white border border-[#dbd8cc] rounded-[8px] shadow-lg overflow-y-auto"
              style={menuStyle}
              onMouseDown={e => e.stopPropagation()}
            >
              {visibleOptions.length ? (
                visibleOptions.map(option => (
                  <button
                    className="flex items-center gap-2 w-full px-3 py-[7px] text-[12px] text-[#1a1a18] hover:bg-[#f5f8f4] text-left"
                    key={`${option.id || option.label}-${option.src}`}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      choose(option)
                    }}
                  >
                    <span className="w-[24px] h-[24px] rounded-[3px] overflow-hidden bg-[#f5f8f4] border border-[#dbd8cc] flex-shrink-0">
                      {option.src ? <img alt="" src={option.src} /> : null}
                    </span>
                    <span>
                      <strong className="block text-[12px] font-medium text-[#1a1a18]">{option.name || option.label}</strong>
                      <small className="block text-[10px] text-[#8b8a81]">{option.finish || option.meta || ""}</small>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-[12px] text-[#8b8a81] text-center">No match</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CabinetConfiguratorProps {
  lineItemId?: string | null
  quoteId?: string | null
  quoteLine?: { material?: string; colour?: string; finish?: string } | null
  existingConfig?: CabinetConfig | null
  onSave?: (config: unknown) => void
  onCancel?: () => void
}

export default function CabinetConfigurator({
  lineItemId,
  quoteId,
  quoteLine = null,
  existingConfig = null,
  onSave,
  onCancel,
}: CabinetConfiguratorProps) {
  const quoteMaterial = quoteLine?.material || existingConfig?.carcass_material || ""
  const quoteColour   = quoteLine?.colour   || existingConfig?.colour            || ""
  const quoteFinish   = quoteLine?.finish   || existingConfig?.finish             || ""

  const initialConfig: CabinetConfig = {
    ...DEFAULT_CONFIG,
    ...(existingConfig || {}),
    carcass_material:       quoteMaterial,
    back_panel_material:    quoteMaterial,
    back_panel_thickness_mm: [16, 18].includes(Number(existingConfig?.back_panel_thickness_mm))
      ? Number(existingConfig?.back_panel_thickness_mm)
      : 16,
  }

  const [config, setConfig] = useState<CabinetConfig>(() => ({
    ...initialConfig,
    back_panel_material: initialConfig.carcass_material || "",
    shelf_material:      initialConfig.shelf_material   || initialConfig.carcass_material || "",
  }))

  const [sameShelfMaterial, setSameShelfMaterial] = useState(
    (!initialConfig.shelf_material || initialConfig.shelf_material === initialConfig.carcass_material) &&
    (!initialConfig.shelf_thickness_mm || Number(initialConfig.shelf_thickness_mm) === Number(initialConfig.carcass_thickness_mm))
  )
  const [costPrompt, setCostPrompt]       = useState<CostPrompt | null>(null)
  const [feedback, setFeedback]           = useState("")
  const [isSavingCost, setIsSavingCost]   = useState(false)
  const [activeTab, setActiveTab]         = useState("dimensions")
  const [mobileSectionOpen, setMobileSectionOpen] = useState<string | null>(null)
  const [shelfColourOptions, setShelfColourOptions] = useState<ColourOption[]>([])

  const normalizedConfig = useMemo(
    () =>
      normalizeCabinetConfig({
        ...config,
        carcass_material:   quoteMaterial,
        carcass_finish:     quoteFinish,
        carcass_colour:     quoteColour,
        back_panel_material: quoteMaterial,
        shelf_material:      sameShelfMaterial ? config.carcass_material    : config.shelf_material,
        shelf_finish:        sameShelfMaterial ? quoteFinish                : config.shelf_finish,
        shelf_colour:        sameShelfMaterial ? quoteColour                : config.shelf_colour,
        cost_per_sqm_shelf:  sameShelfMaterial ? config.cost_per_sqm_carcass : config.cost_per_sqm_shelf,
        shelf_thickness_mm:  sameShelfMaterial ? config.carcass_thickness_mm : config.shelf_thickness_mm,
        shelf_heights_mm:    normalizeShelfHeights(config.shelf_heights_mm, shelfCount(config.shelf_qty), config.height_mm),
      }),
    [config, quoteColour, quoteFinish, quoteMaterial, sameShelfMaterial]
  )

  const shelfMaterialLabel = materialDisplay({
    finish: normalizedConfig.shelf_finish,
    colour: normalizedConfig.shelf_colour,
  })

  const totals = useMemo(() => calculateCabinetTotals(normalizedConfig), [normalizedConfig])

  // Auto-clear feedback
  useEffect(() => {
    if (!feedback) return undefined
    const timeout = window.setTimeout(() => setFeedback(""), 3000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  // Load shelf colour options when shelf material / thickness changes
  useEffect(() => {
    let cancelled = false

    async function loadShelfOptions() {
      setShelfColourOptions([])
      if (sameShelfMaterial || !config.shelf_material || !config.shelf_thickness_mm) return
      try {
        const response = await fetch(
          `/api/colour-library?material=${encodeURIComponent(String(config.shelf_material))}&thickness=${encodeURIComponent(`${config.shelf_thickness_mm}mm`)}`,
          { cache: "no-store" }
        )
        const payload = await response.json()
        if (!cancelled) {
          setShelfColourOptions(
            payload?.colourFamily?.groups?.length ? optionsFromColourFamily(payload.colourFamily) : []
          )
        }
      } catch {
        if (!cancelled) setShelfColourOptions([])
      }
    }

    loadShelfOptions()
    return () => { cancelled = true }
  }, [sameShelfMaterial, config.shelf_material, config.shelf_thickness_mm])

  // ---------------------------------------------------------------------------
  // State updaters
  // ---------------------------------------------------------------------------

  function updateConfig(field: string, value: unknown) {
    setConfig(current => {
      const next = { ...current, [field]: value }
      if (field === "cost_per_sqm_carcass" && sameShelfMaterial) {
        next.cost_per_sqm_shelf = value
      }
      if (field === "carcass_thickness_mm" && sameShelfMaterial) {
        next.shelf_thickness_mm = value
      }
      if (field === "shelf_thickness_mm") {
        next.shelf_finish       = ""
        next.shelf_colour       = ""
        next.cost_per_sqm_shelf = 0
      }
      if (field === "height_mm" || field === "shelf_qty") {
        next.shelf_heights_mm = normalizeShelfHeights(
          current.shelf_heights_mm,
          shelfCount(field === "shelf_qty" ? value : next.shelf_qty),
          field === "height_mm" ? value : next.height_mm
        )
      }
      return next
    })
  }

  function updateShelfHeight(index: number, value: string) {
    setConfig(current => {
      const heights = normalizeShelfHeights(current.shelf_heights_mm, shelfCount(current.shelf_qty), current.height_mm)
      heights[index] = Number(value)
      return { ...current, shelf_heights_mm: heights }
    })
  }

  function updateShelfMaterialType(value: string) {
    setConfig(current => ({
      ...current,
      shelf_material:     value,
      shelf_finish:       "",
      shelf_colour:       "",
      cost_per_sqm_shelf: 0,
    }))
  }

  function selectShelfColour(option: ColourOption) {
    setConfig(current => ({
      ...current,
      shelf_finish:       option.finish || "",
      shelf_colour:       option.name || option.label || "",
      cost_per_sqm_shelf: Number(option.costPerSqmExGst || 0),
    }))
    if (Number(option.costPerSqmExGst || 0) > 0) {
      setFeedback(`${option.name || option.label} cost loaded.`)
    }
  }

  function updatePromptCost(value: string) {
    setCostPrompt(current => current ? { ...current, cost: value } : current)
  }

  function applyCost(role: string, value: unknown) {
    if (role === "shelf") {
      updateConfig("cost_per_sqm_shelf", value)
      return
    }
    updateConfig("cost_per_sqm_carcass", value)
  }

  function lookupUrl(role: string): string {
    const material  = role === "shelf" ? normalizedConfig.shelf_material        : normalizedConfig.carcass_material
    const thickness = role === "shelf" ? normalizedConfig.shelf_thickness_mm    : normalizedConfig.carcass_thickness_mm
    const colour    = role === "shelf" ? normalizedConfig.shelf_colour           : quoteColour
    const params    = new URLSearchParams()
    if (colour)    params.set("colour",    String(colour))
    if (thickness) params.set("thickness", `${thickness}mm`)
    const query = params.toString()
    return `/api/admin/board-costs/${encodeURIComponent(String(material))}${query ? `?${query}` : ""}`
  }

  async function lookupMaterialCost(role: string, { promptIfMissing = true } = {}) {
    const material = role === "shelf" ? normalizedConfig.shelf_material : normalizedConfig.carcass_material
    if (!material) {
      setFeedback("Select a material on the quote line before looking up the cost.")
      return
    }
    setFeedback("")
    try {
      const response = await fetch(lookupUrl(role), { cache: "no-store" })
      const payload  = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load material cost.")
      if (payload.found && payload.cost) {
        applyCost(role, payload.cost.cost_per_sqm_ex_gst)
        if (promptIfMissing) setFeedback(`${material} cost loaded.`)
        return
      }
      if (promptIfMissing) {
        setCostPrompt({ role: role as "carcass" | "shelf", material: String(material), cost: "", onChange: updatePromptCost })
      }
    } catch (error: unknown) {
      setFeedback((error as Error)?.message || "Could not load material cost.")
    }
  }

  // Auto-lookup carcass cost on mount / material change
  useEffect(() => {
    if (!normalizedConfig.carcass_material || Number(normalizedConfig.cost_per_sqm_carcass) > 0) return
    lookupMaterialCost("carcass", { promptIfMissing: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedConfig.carcass_material])

  function usePromptCostOnce() {
    const cost = numberValue(costPrompt?.cost)
    if (!costPrompt || cost < 0) return
    applyCost(costPrompt.role, cost)
    setCostPrompt(null)
    setFeedback(`${costPrompt.material} cost set for this quote only.`)
  }

  async function savePromptCostFuture() {
    const cost = numberValue(costPrompt?.cost)
    if (!costPrompt || cost < 0) return
    setIsSavingCost(true)
    setFeedback("")
    try {
      const response = await fetch(lookupUrl(costPrompt.role), {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cost_per_sqm_ex_gst: cost }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save material cost.")
      applyCost(costPrompt.role, payload.cost.cost_per_sqm_ex_gst)
      setFeedback(`${costPrompt.material} cost saved to the colour library.`)
      setCostPrompt(null)
    } catch (error: unknown) {
      setFeedback((error as Error)?.message || "Could not save material cost.")
    } finally {
      setIsSavingCost(false)
    }
  }

  function saveCabinet() {
    const label = String(config.label || "").trim() || "Base cabinet"
    const savedConfig: CabinetConfig = {
      ...normalizedConfig,
      id:                                existingConfig?.id || undefined,
      line_item_id:                      lineItemId || existingConfig?.line_item_id || null,
      quote_id:                          quoteId    || existingConfig?.quote_id     || null,
      label,
      notes:                             config.notes || "",
      calculated_cut_list:               totals.cut_list,
      calculated_material_cost_ex_gst:   totals.calculated_material_cost_ex_gst,
      labour_hours:                      totals.labour_hours,
      labour_cost:                       totals.labour_hours,
    }
    const unitPrice = totals.calculated_material_cost_ex_gst
    onSave?.({
      ...savedConfig,
      total_cabinet_cost_ex_gst: unitPrice,
      line_item_patch: {
        product_type:             "base_cabinet",
        product_name:             label,
        description:              cabinetDescription(savedConfig),
        product_unit_cost_ex_gst: unitPrice,
        unit_price_ex_gst:        unitPrice,
        line_total_ex_gst:        unitPrice,
        labour_hours:             totals.labour_hours,
      },
    })
  }

  const carcassCostId = fieldId(lineItemId || "cabinet", "carcass-cost")
  const shelfCostId   = fieldId(lineItemId || "cabinet", "shelf-cost")

  function renderTabContent(overrideTab?: string) {
    const tab = overrideTab ?? activeTab

    if (tab === "dimensions") {
      return (
        <div>
          <p className={tw.sectionTitle}>Cabinet dimensions</p>
          <div className={tw.card}>
            <div className={tw.grid2}>
              <Field label="Label" wide>
                <input className={tw.input} value={config.label} onChange={e => updateConfig("label", e.target.value)} />
              </Field>
              <Field label="Height mm">
                <input className={tw.input} type="number" min="1" value={config.height_mm} onChange={e => updateConfig("height_mm", e.target.value)} />
              </Field>
              <Field label="Width mm">
                <input className={tw.input} type="number" min="1" value={config.width_mm} onChange={e => updateConfig("width_mm", e.target.value)} />
              </Field>
              <Field label="Depth mm">
                <input className={tw.input} type="number" min="1" value={config.depth_mm} onChange={e => updateConfig("depth_mm", e.target.value)} />
              </Field>
            </div>
          </div>
        </div>
      )
    }

    if (tab === "boards") {
      return (
        <div>
          <p className={tw.sectionTitle}>Boards and labour</p>
          <div className={tw.card}>
            <div className={tw.grid2}>
              <Field label="Carcass material" wide>
                <div className="flex gap-2">
                  <input className={tw.inputRo} value={materialDisplay({ material: normalizedConfig.carcass_material, finish: quoteFinish, colour: quoteColour })} readOnly />
                  <button type="button" className={tw.smBtn} onClick={() => lookupMaterialCost("carcass")}>Lookup</button>
                </div>
              </Field>
              <Field label="Carcass thickness">
                <ToggleGroup value={numberValue(config.carcass_thickness_mm)} options={[16, 18]} onChange={v => updateConfig("carcass_thickness_mm", v)} />
              </Field>
              <Field label="Cost per sqm ex GST">
                <input id={carcassCostId} className={tw.input} type="number" min="0" step="0.01" value={config.cost_per_sqm_carcass} onChange={e => updateConfig("cost_per_sqm_carcass", e.target.value)} />
              </Field>
              <Field label="Labour hours">
                <input className={tw.input} type="number" min="0" step="0.01" value={config.labour_hours ?? config.labour_cost} onChange={e => updateConfig("labour_hours", e.target.value)} />
              </Field>
            </div>
            <MaterialCostPrompt
              prompt={costPrompt?.role === "carcass" ? costPrompt : null}
              onUseOnce={usePromptCostOnce}
              onSaveFuture={savePromptCostFuture}
              onCancel={() => setCostPrompt(null)}
            />
          </div>
        </div>
      )
    }

    if (tab === "backShelves") {
      return (
        <div>
          <p className={tw.sectionTitle}>Back panel and shelves</p>
          <div className={tw.card}>
            <label className="flex items-center gap-2 text-[12px] text-[#1a1a18] mb-3 cursor-pointer">
              <input type="checkbox" checked={Boolean(config.back_panel_included)} onChange={e => updateConfig("back_panel_included", e.target.checked)} className="accent-[#6b9e61]" />
              Include back panel
            </label>
            {config.back_panel_included && (
              <div className={`${tw.grid2} mb-3`}>
                <Field label="Back material" wide>
                  <input className={tw.inputRo} value={materialDisplay({ material: normalizedConfig.back_panel_material, finish: quoteFinish, colour: quoteColour })} readOnly />
                </Field>
                <Field label="Back thickness">
                  <ToggleGroup value={numberValue(config.back_panel_thickness_mm)} options={[16, 18]} onChange={v => updateConfig("back_panel_thickness_mm", v)} />
                </Field>
              </div>
            )}
            <div className={tw.grid2}>
              <Field label="Shelf qty">
                <input className={tw.input} type="number" min="0" value={config.shelf_qty} onChange={e => updateConfig("shelf_qty", e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-[#1a1a18] mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sameShelfMaterial}
                className="accent-[#6b9e61]"
                onChange={e => {
                  setSameShelfMaterial(e.target.checked)
                  if (e.target.checked) {
                    setConfig(current => ({
                      ...current,
                      shelf_material:     normalizedConfig.carcass_material,
                      shelf_finish:       quoteFinish,
                      shelf_colour:       quoteColour,
                      shelf_thickness_mm: current.carcass_thickness_mm,
                      cost_per_sqm_shelf: current.cost_per_sqm_carcass,
                    }))
                  }
                }}
              />
              Shelves same as carcass board and thickness
            </label>
            {Number(config.shelf_qty) > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {normalizeShelfHeights(config.shelf_heights_mm, shelfCount(config.shelf_qty), config.height_mm).map((height, index) => (
                  <Field key={`shelf-height-${index}`} label={`Shelf ${index + 1} height from bottom`}>
                    <input className={tw.input} type="number" min="0" max={numberValue(config.height_mm)} value={height} onChange={e => updateShelfHeight(index, e.target.value)} />
                  </Field>
                ))}
              </div>
            )}
            {Number(config.shelf_qty) > 0 && !sameShelfMaterial && (
              <div className="mt-3">
                <div className={tw.grid2}>
                  <Field label="Shelf material type">
                    <select className={tw.input} value={materialTypeForKey(String(config.shelf_material))} onChange={e => updateShelfMaterialType(e.target.value)}>
                      {COLOUR_MATERIALS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Shelf thickness">
                    <ToggleGroup value={numberValue(config.shelf_thickness_mm)} options={[16, 18]} onChange={v => updateConfig("shelf_thickness_mm", v)} />
                  </Field>
                  <Field label="Shelf finish and colour" wide>
                    <div className="flex gap-2">
                      <ColourLibraryCombobox
                        disabled={!config.shelf_material || !config.shelf_thickness_mm}
                        placeholder={config.shelf_material && config.shelf_thickness_mm ? "Select shelf finish and colour" : "Select type and thickness first"}
                        value={shelfMaterialLabel}
                        options={shelfColourOptions}
                        onChange={selectShelfColour}
                      />
                      <button type="button" className={tw.smBtn} onClick={() => lookupMaterialCost("shelf")}>Lookup</button>
                    </div>
                  </Field>
                  <Field label="Shelf cost per sqm">
                    <input id={shelfCostId} className={tw.input} type="number" min="0" step="0.01" value={config.cost_per_sqm_shelf} onChange={e => updateConfig("cost_per_sqm_shelf", e.target.value)} />
                  </Field>
                </div>
                <MaterialCostPrompt
                  prompt={costPrompt?.role === "shelf" ? costPrompt : null}
                  onUseOnce={usePromptCostOnce}
                  onSaveFuture={savePromptCostFuture}
                  onCancel={() => setCostPrompt(null)}
                />
              </div>
            )}
          </div>
        </div>
      )
    }

    if (tab === "summary") {
      return (
        <div>
          <p className={tw.sectionTitle}>Calculated summary</p>
          <div className="flex gap-4 mb-3 p-3 bg-white border border-[#dbd8cc] rounded-[8px]">
            {[
              ["Materials",    money(totals.calculated_material_cost_ex_gst)],
              ["Labour hours", String(totals.labour_hours)],
              ["Total ex GST", money(totals.total_cabinet_cost_ex_gst)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-medium text-[#8b8a81] uppercase tracking-[0.05em]">{label}</p>
                <p className="text-[13px] font-medium font-mono text-[#1a1a18]">{value}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-[8px] border border-[#dbd8cc]">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                  {["Piece", "Qty", "Size", "Material", "Area/unit", "Cost/unit", "Total area", "Total cost"].map(h => (
                    <th key={h} className="px-2 py-[6px] text-left text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {totals.cut_list.map((piece: CabinetConfig) => {
                  const rate      = isShelfPiece(piece) ? normalizedConfig.cost_per_sqm_shelf || normalizedConfig.cost_per_sqm_carcass : normalizedConfig.cost_per_sqm_carcass
                  const unitArea  = numberValue(piece.area_sqm)
                  const qty       = numberValue(piece.qty)
                  const unitCost  = unitArea * numberValue(rate)
                  const totalArea = unitArea * qty
                  const rowCost   = totalArea * numberValue(rate)
                  return (
                    <tr key={`${piece.label}-${piece.material}`} className="border-b border-[#edf4eb] last:border-b-0">
                      <td className="px-2 py-[6px] font-medium text-[#1a1a18]">{piece.label}</td>
                      <td className="px-2 py-[6px] text-[#1a1a18]">{piece.qty}</td>
                      <td className="px-2 py-[6px] font-mono text-[10px] whitespace-nowrap">{piece.width_mm} x {piece.height_mm}mm</td>
                      <td className="px-2 py-[6px] text-[#5a5a52]">{piece.material || "-"}</td>
                      <td className="px-2 py-[6px] font-mono text-[10px]">{unitArea.toFixed(4)} sqm</td>
                      <td className="px-2 py-[6px] font-mono text-[10px]">{money(unitCost)}</td>
                      <td className="px-2 py-[6px] font-mono text-[10px]">{totalArea.toFixed(4)} sqm</td>
                      <td className="px-2 py-[6px] font-mono text-[10px] font-medium">{money(rowCost)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    if (tab === "notes") {
      return (
        <div>
          <p className={tw.sectionTitle}>Notes</p>
          <div className={tw.card}>
            <textarea
              className="w-full border border-[#dbd8cc] rounded-[6px] px-3 py-2 text-[12px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] resize-y min-h-[80px] font-[inherit]"
              rows={4}
              value={config.notes}
              onChange={e => updateConfig("notes", e.target.value)}
            />
          </div>
        </div>
      )
    }

    return null
  }

  function renderMobileSchematic() {
    return (
      <div className="grid grid-cols-3 gap-2 min-w-0 overflow-hidden">
        {["front", "side", "top"].map(view => (
          <div key={view} className="min-w-0 overflow-hidden">
            <CabinetSchematic config={{ ...normalizedConfig, label: config.label }} view={view} />
          </div>
        ))}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">

      {/* Header — desktop only */}
      <div className="hidden md:flex items-center justify-between px-4 py-3 border-b border-[#edf4eb] bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-[32px] h-[32px] bg-[#1c2b1e] text-white text-[10px] font-bold rounded-[6px] flex items-center justify-center flex-shrink-0">
            PCD
          </div>
          <div>
            <p className="text-[10px] font-medium text-[#8b8a81] uppercase tracking-[0.06em]">Cabinet configurator</p>
            <h2 className="text-[15px] font-medium text-[#1a1a18] leading-tight">{config.label || "Base cabinet"}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right mr-1">
            <p className="text-[10px] text-[#8b8a81]">Total ex GST</p>
            <p className="text-[14px] font-medium font-mono text-[#1a1a18]">{money(totals.total_cabinet_cost_ex_gst)}</p>
          </div>
          <button type="button" className={tw.secondaryBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={tw.primaryBtn} onClick={saveCabinet} disabled={isSavingCost}>Save cabinet</button>
        </div>
      </div>

      {/* Header — mobile only */}
      <div className="flex md:hidden items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0 border-b border-[#eef0f4] bg-white">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Go back"
          className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-[#9ba7b8] hover:bg-[#eef0f4] hover:text-[#3d4d5f] transition-colors flex-shrink-0"
        >
          ←
        </button>
        <span className="flex-1 text-center text-[15px] font-semibold text-[#1a1a18]">
          Cabinet configurator
        </span>
        <div className="w-[28px]" aria-hidden="true" />
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="mx-4 mt-2 px-3 py-2 bg-[#edf4eb] border border-[#a8c5a0] rounded-[6px] text-[11px] text-[#2d5e28]">
          {feedback}
        </div>
      )}

      {/* Two-column body */}
      <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">

        {/* Left column: nav + cost summary */}
        <aside className="w-[20%] flex-shrink-0 border-r border-[#edf4eb] bg-white flex flex-col">
          <div className="p-2 flex flex-col gap-[1px] flex-1 overflow-y-auto">
            {CONFIG_TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`w-full text-left px-[10px] py-[7px] rounded-[6px] text-[12px] font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-[#edf4eb] text-[#1c2b1e]"
                    : "text-[#5a5a52] hover:bg-[#f5f8f4]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="border-t border-[#edf4eb] p-3 flex-shrink-0">
            <p className="text-[10px] font-medium text-[#8b8a81] uppercase tracking-[0.06em] mb-2">Cost summary</p>
            <div className="flex flex-col">
              {[
                ["Materials", money(totals.calculated_material_cost_ex_gst)],
                ["Labour",    `${totals.labour_hours}h`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-[5px] border-b border-[#edf4eb] text-[12px]">
                  <span className="text-[#5a5a52]">{label}</span>
                  <strong className="font-mono font-medium text-[#1a1a18]">{value}</strong>
                </div>
              ))}
              <div className="flex justify-between items-center pt-[6px]">
                <span className="text-[12px] font-medium text-[#1a1a18]">Total ex GST</span>
                <strong className="text-[13px] font-semibold font-mono text-[#1a1a18]">{money(totals.total_cabinet_cost_ex_gst)}</strong>
              </div>
            </div>
          </div>
        </aside>

        {/* Right column: controls on top, schematic below */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Controls — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-[#f5f8f4]">

          {/* Dimensions */}
          {activeTab === "dimensions" && (
            <div>
              <p className={tw.sectionTitle}>Cabinet dimensions</p>
              <div className={tw.card}>
                <div className={tw.grid2}>
                  <Field label="Label" wide>
                    <input className={tw.input} value={config.label} onChange={e => updateConfig("label", e.target.value)} />
                  </Field>
                  <Field label="Height mm">
                    <input className={tw.input} type="number" min="1" value={config.height_mm} onChange={e => updateConfig("height_mm", e.target.value)} />
                  </Field>
                  <Field label="Width mm">
                    <input className={tw.input} type="number" min="1" value={config.width_mm} onChange={e => updateConfig("width_mm", e.target.value)} />
                  </Field>
                  <Field label="Depth mm">
                    <input className={tw.input} type="number" min="1" value={config.depth_mm} onChange={e => updateConfig("depth_mm", e.target.value)} />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* Boards and labour */}
          {activeTab === "boards" && (
            <div>
              <p className={tw.sectionTitle}>Boards and labour</p>
              <div className={tw.card}>
                <div className={tw.grid2}>
                  <Field label="Carcass material" wide>
                    <div className="flex gap-2">
                      <input className={tw.inputRo} value={materialDisplay({ material: normalizedConfig.carcass_material, finish: quoteFinish, colour: quoteColour })} readOnly />
                      <button type="button" className={tw.smBtn} onClick={() => lookupMaterialCost("carcass")}>Lookup</button>
                    </div>
                  </Field>
                  <Field label="Carcass thickness">
                    <ToggleGroup value={numberValue(config.carcass_thickness_mm)} options={[16, 18]} onChange={v => updateConfig("carcass_thickness_mm", v)} />
                  </Field>
                  <Field label="Cost per sqm ex GST">
                    <input id={carcassCostId} className={tw.input} type="number" min="0" step="0.01" value={config.cost_per_sqm_carcass} onChange={e => updateConfig("cost_per_sqm_carcass", e.target.value)} />
                  </Field>
                  <Field label="Labour hours">
                    <input className={tw.input} type="number" min="0" step="0.01" value={config.labour_hours ?? config.labour_cost} onChange={e => updateConfig("labour_hours", e.target.value)} />
                  </Field>
                </div>
                <MaterialCostPrompt
                  prompt={costPrompt?.role === "carcass" ? costPrompt : null}
                  onUseOnce={usePromptCostOnce}
                  onSaveFuture={savePromptCostFuture}
                  onCancel={() => setCostPrompt(null)}
                />
              </div>
            </div>
          )}

          {/* Back panel and shelves */}
          {activeTab === "backShelves" && (
            <div>
              <p className={tw.sectionTitle}>Back panel and shelves</p>
              <div className={tw.card}>
                <label className="flex items-center gap-2 text-[12px] text-[#1a1a18] mb-3 cursor-pointer">
                  <input type="checkbox" checked={Boolean(config.back_panel_included)} onChange={e => updateConfig("back_panel_included", e.target.checked)} className="accent-[#6b9e61]" />
                  Include back panel
                </label>
                {config.back_panel_included && (
                  <div className={`${tw.grid2} mb-3`}>
                    <Field label="Back material" wide>
                      <input className={tw.inputRo} value={materialDisplay({ material: normalizedConfig.back_panel_material, finish: quoteFinish, colour: quoteColour })} readOnly />
                    </Field>
                    <Field label="Back thickness">
                      <ToggleGroup value={numberValue(config.back_panel_thickness_mm)} options={[16, 18]} onChange={v => updateConfig("back_panel_thickness_mm", v)} />
                    </Field>
                  </div>
                )}
                <div className={tw.grid2}>
                  <Field label="Shelf qty">
                    <input className={tw.input} type="number" min="0" value={config.shelf_qty} onChange={e => updateConfig("shelf_qty", e.target.value)} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-[#1a1a18] mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameShelfMaterial}
                    className="accent-[#6b9e61]"
                    onChange={e => {
                      setSameShelfMaterial(e.target.checked)
                      if (e.target.checked) {
                        setConfig(current => ({
                          ...current,
                          shelf_material:     normalizedConfig.carcass_material,
                          shelf_finish:       quoteFinish,
                          shelf_colour:       quoteColour,
                          shelf_thickness_mm: current.carcass_thickness_mm,
                          cost_per_sqm_shelf: current.cost_per_sqm_carcass,
                        }))
                      }
                    }}
                  />
                  Shelves same as carcass board and thickness
                </label>
                {Number(config.shelf_qty) > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {normalizeShelfHeights(config.shelf_heights_mm, shelfCount(config.shelf_qty), config.height_mm).map((height, index) => (
                      <Field key={`shelf-height-${index}`} label={`Shelf ${index + 1} height from bottom`}>
                        <input className={tw.input} type="number" min="0" max={numberValue(config.height_mm)} value={height} onChange={e => updateShelfHeight(index, e.target.value)} />
                      </Field>
                    ))}
                  </div>
                )}
                {Number(config.shelf_qty) > 0 && !sameShelfMaterial && (
                  <div className="mt-3">
                    <div className={tw.grid2}>
                      <Field label="Shelf material type">
                        <select className={tw.input} value={materialTypeForKey(String(config.shelf_material))} onChange={e => updateShelfMaterialType(e.target.value)}>
                          {COLOUR_MATERIALS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Shelf thickness">
                        <ToggleGroup value={numberValue(config.shelf_thickness_mm)} options={[16, 18]} onChange={v => updateConfig("shelf_thickness_mm", v)} />
                      </Field>
                      <Field label="Shelf finish and colour" wide>
                        <div className="flex gap-2">
                          <ColourLibraryCombobox
                            disabled={!config.shelf_material || !config.shelf_thickness_mm}
                            placeholder={config.shelf_material && config.shelf_thickness_mm ? "Select shelf finish and colour" : "Select type and thickness first"}
                            value={shelfMaterialLabel}
                            options={shelfColourOptions}
                            onChange={selectShelfColour}
                          />
                          <button type="button" className={tw.smBtn} onClick={() => lookupMaterialCost("shelf")}>Lookup</button>
                        </div>
                      </Field>
                      <Field label="Shelf cost per sqm">
                        <input id={shelfCostId} className={tw.input} type="number" min="0" step="0.01" value={config.cost_per_sqm_shelf} onChange={e => updateConfig("cost_per_sqm_shelf", e.target.value)} />
                      </Field>
                    </div>
                    <MaterialCostPrompt
                      prompt={costPrompt?.role === "shelf" ? costPrompt : null}
                      onUseOnce={usePromptCostOnce}
                      onSaveFuture={savePromptCostFuture}
                      onCancel={() => setCostPrompt(null)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Calculated summary */}
          {activeTab === "summary" && (
            <div>
              <p className={tw.sectionTitle}>Calculated summary</p>
              <div className="flex gap-4 mb-3 p-3 bg-white border border-[#dbd8cc] rounded-[8px]">
                {[
                  ["Materials",    money(totals.calculated_material_cost_ex_gst)],
                  ["Labour hours", String(totals.labour_hours)],
                  ["Total ex GST", money(totals.total_cabinet_cost_ex_gst)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-medium text-[#8b8a81] uppercase tracking-[0.05em]">{label}</p>
                    <p className="text-[13px] font-medium font-mono text-[#1a1a18]">{value}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-[8px] border border-[#dbd8cc]">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#f5f8f4] border-b border-[#dbd8cc]">
                      {["Piece", "Qty", "Size", "Material", "Area/unit", "Cost/unit", "Total area", "Total cost"].map(h => (
                        <th key={h} className="px-2 py-[6px] text-left text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {totals.cut_list.map((piece: CabinetConfig) => {
                      const rate      = isShelfPiece(piece) ? normalizedConfig.cost_per_sqm_shelf || normalizedConfig.cost_per_sqm_carcass : normalizedConfig.cost_per_sqm_carcass
                      const unitArea  = numberValue(piece.area_sqm)
                      const qty       = numberValue(piece.qty)
                      const unitCost  = unitArea * numberValue(rate)
                      const totalArea = unitArea * qty
                      const rowCost   = totalArea * numberValue(rate)
                      return (
                        <tr key={`${piece.label}-${piece.material}`} className="border-b border-[#edf4eb] last:border-b-0">
                          <td className="px-2 py-[6px] font-medium text-[#1a1a18]">{piece.label}</td>
                          <td className="px-2 py-[6px] text-[#1a1a18]">{piece.qty}</td>
                          <td className="px-2 py-[6px] font-mono text-[10px] whitespace-nowrap">{piece.width_mm} × {piece.height_mm}mm</td>
                          <td className="px-2 py-[6px] text-[#5a5a52]">{piece.material || "—"}</td>
                          <td className="px-2 py-[6px] font-mono text-[10px]">{unitArea.toFixed(4)} sqm</td>
                          <td className="px-2 py-[6px] font-mono text-[10px]">{money(unitCost)}</td>
                          <td className="px-2 py-[6px] font-mono text-[10px]">{totalArea.toFixed(4)} sqm</td>
                          <td className="px-2 py-[6px] font-mono text-[10px] font-medium">{money(rowCost)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes */}
          {activeTab === "notes" && (
            <div>
              <p className={tw.sectionTitle}>Notes</p>
              <div className={tw.card}>
                <textarea
                  className="w-full border border-[#dbd8cc] rounded-[6px] px-3 py-2 text-[12px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] resize-y min-h-[80px] font-[inherit]"
                  rows={4}
                  value={config.notes}
                  onChange={e => updateConfig("notes", e.target.value)}
                />
              </div>
            </div>
          )}

        </div>

        {/* Schematic strip — all 3 views, always visible */}
        <div className="border-t border-[#edf4eb] bg-white px-4 py-3 flex-shrink-0">
          <p className="text-[10px] font-medium text-[#8b8a81] uppercase tracking-[0.06em] mb-2">Live schematic</p>
          <CabinetSchematic config={{ ...normalizedConfig, label: config.label }} />
        </div>

        </div>{/* end right column */}

      </div>

      {/* Mobile body */}
      <div className="flex md:hidden flex-col flex-1 min-h-0 overflow-hidden">
        {mobileSectionOpen === null ? (
          <div className="flex flex-col flex-1 overflow-y-auto bg-[#f5f8f4]">
            <div className="bg-white mb-2">
              {CONFIG_TABS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMobileSectionOpen(tab.key)}
                  className="w-full flex items-center justify-between px-4 py-[14px] border-b border-[#edf4eb] last:border-b-0 hover:bg-[#f5f8f4] transition-colors"
                >
                  <span className="text-[14px] font-medium text-[#1a1a18]">{tab.label}</span>
                  <span className="text-[#c5cdd8] text-[16px]">&gt;</span>
                </button>
              ))}
            </div>

            <div className="px-4 pb-4 flex flex-col gap-3">
              <div className="bg-white border border-[#dbd8cc] rounded-[8px] p-3">
                <p className="text-[10px] font-medium text-[#8b8a81] uppercase tracking-[0.06em] mb-2">Live schematic</p>
                {renderMobileSchematic()}
                <div className="h-[0.5px] bg-[#edf4eb] my-2" />
                <p className="text-[10px] font-medium text-[#8b8a81] uppercase tracking-[0.06em] mb-2">Cost summary</p>
                {[
                  ["Materials", money(totals.calculated_material_cost_ex_gst)],
                  ["Labour", `${totals.labour_hours}h`],
                  ["Total ex GST", money(totals.total_cabinet_cost_ex_gst)],
                ].map(([label, value], i) => (
                  <div key={label} className={`flex justify-between items-center py-[5px] text-[12px] ${i < 2 ? "border-b border-[#edf4eb]" : "font-medium pt-[7px]"}`}>
                    <span className="text-[#5a5a52]">{label}</span>
                    <strong className="font-mono text-[#1a1a18]">{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3 bg-white border-b border-[#eef0f4] flex-shrink-0">
              <button
                type="button"
                onClick={() => setMobileSectionOpen(null)}
                className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-[#9ba7b8] hover:bg-[#eef0f4] hover:text-[#3d4d5f] transition-colors flex-shrink-0"
                aria-label="Back to sections"
              >
                ←
              </button>
              <span className="flex-1 text-center text-[15px] font-semibold text-[#1a1a18]">
                {CONFIG_TABS.find(t => t.key === mobileSectionOpen)?.label}
              </span>
              <div className="w-[28px]" aria-hidden="true" />
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-[#f5f8f4]">
              {renderTabContent(mobileSectionOpen)}

              <div className="bg-white border border-[#dbd8cc] rounded-[8px] p-3 mt-3">
                <p className="text-[10px] font-medium text-[#8b8a81] uppercase tracking-[0.06em] mb-2">Live schematic</p>
                {renderMobileSchematic()}
                <div className="h-[0.5px] bg-[#edf4eb] my-2" />
                <div className="flex justify-between items-center text-[12px] font-medium">
                  <span className="text-[#5a5a52]">Total ex GST</span>
                  <strong className="font-mono text-[#1a1a18]">{money(totals.total_cabinet_cost_ex_gst)}</strong>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] border-t border-[#eef0f4] bg-white flex-shrink-0">
              <button
                type="button"
                onClick={saveCabinet}
                disabled={isSavingCost}
                className="h-[44px] w-full bg-[#2d9692] rounded-[8px] text-[14px] font-medium text-white hover:bg-[#237775] disabled:opacity-50 transition-colors"
              >
                Save cabinet
              </button>
              <button
                type="button"
                onClick={() => setMobileSectionOpen(null)}
                className="h-[44px] w-full bg-[#eef0f4] border border-[#dde1e9] rounded-[8px] text-[14px] font-medium text-[#3d4d5f] hover:bg-[#dde1e9] transition-colors"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {mobileSectionOpen === null && (
          <div className="flex flex-col gap-2 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] border-t border-[#eef0f4] bg-white flex-shrink-0">
            <button
              type="button"
              onClick={saveCabinet}
              disabled={isSavingCost}
              className="h-[44px] w-full bg-[#2d9692] rounded-[8px] text-[14px] font-medium text-white hover:bg-[#237775] disabled:opacity-50 transition-colors"
            >
              Save cabinet
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="h-[44px] w-full bg-[#eef0f4] border border-[#dde1e9] rounded-[8px] text-[14px] font-medium text-[#3d4d5f] hover:bg-[#dde1e9] transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
