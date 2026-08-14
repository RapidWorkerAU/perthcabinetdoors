"use client";

// The public, no-login room planner (Phase 4), a full-screen, app-like
// experience modelled on consumer planners (IKEA et al): a slim top bar, an
// always-visible catalogue rail to add cabinets, an immersive plan/3D stage that
// fills the screen, and a contextual panel for the selected cabinet. No prices,
// no cut-lists, design + colour, then save a link (Send-to-PCD is a later step).

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CabinetElevation from "../../../components/public/CabinetElevation";
import PcdLoader from "../../../components/public/PcdLoader";
import {
  buildPreset,
  countSelectedParts,
  frontPiecesForItem,
  isCustomerOwned,
  isPartSelected,
  itemsWithSelection,
  matchPreset,
  partsForItem,
  quotableItems,
  selectedPartKeys,
} from "../../../lib/pcd-design-parts";
import { requestLinesForItem } from "../../../lib/pcd-design-request-lines";
import DesignCanvas from "../../admin/design/_components/DesignCanvas";
import FrontElevationView from "../../admin/design/_components/FrontElevationView";
import { Mockup } from "../../admin/design/_components/AddItemModal";
import PublicColourModal from "./PublicColourModal";
import DesignTopBar, { barButton } from "../../../components/DesignTopBar";
import AddItemRail from "../../../components/AddItemRail";
import { resolveColourSrc, slotColourFields } from "../../../lib/pcd-colour-images";
import { CABINET_MOUNT_MM } from "../../../lib/pcd-kickboard-utils";
import { bayShelfCount, applianceBayHeightMm, bayIsPinned, bayPercentOfCabinet, withResolvedBayHeights } from "../../../lib/pcd-door-utils";
import { applianceKindDefaults } from "../../../lib/pcd-appliance-utils";
import { IKEA_RANGES, ikeaGroupsForRange, isIkeaPreset, kickboardAllowedFor, kickboardOnPatch, resolveIkeaPreset } from "../../../lib/pcd-ikea-presets";
import { defaultIkeaCarcassFinish, ikeaCarcassFinishesForRange, ikeaCarcassHex, ikeaCarcassSrc } from "../../../lib/pcd-ikea-carcass";
import {
  SHELF_RAIL_DEFAULTS,
  shelfRailConfig,
  shelfRailHeightMm,
  shelfTopMm,
  mountForShelfTopMm,
  spanLimitMm,
  detectSupports,
} from "../../../lib/pcd-shelf-rail-utils";
import usePublicDesign from "./usePublicDesign";
import PinchZoom from "../../admin/design/_components/PinchZoom";

const Design3DView = dynamic(() => import("../../admin/design/_components/Design3DView"), {
  ssr: false,
  loading: () => (
    <PcdLoader
      variant="panel"
      label="Loading the 3D view"
      steps={["Building your room", "Placing cabinets", "Adding colours", "Almost there"]}
    />
  ),
});

// THREE deliberate groups, and no "all". The rail used to open on an
// undifferentiated list of eleven things across four filters, which asks a
// first-time visitor to understand our catalogue before they can start. These
// are the three questions someone actually has: what can you make me, what have
// I already got, and what else is in the room.
const CATALOGUE = [
  { type: "base_cabinet", label: "Base cabinet", desc: "Floor unit with a benchtop", category: "custom" },
  { type: "wall_cabinet", label: "Wall cabinet", desc: "Upper or overhead unit", category: "custom" },
  { type: "tall_cabinet", label: "Tall unit", desc: "Full-height tower", category: "custom" },
  { type: "corner_base_cabinet", label: "Corner cabinet", desc: "Wraps a corner", category: "custom" },
  { type: "bookcase", label: "Bookcase", desc: "Open unit with a solid back", category: "custom" },
  { type: "shelf_rail", label: "Shelf & rail", desc: "Shelf spanning between two towers or walls", category: "custom" },
  { type: "floating_shelf", label: "Floating shelf", desc: "Wall-mounted open shelf", category: "custom" },
  { type: "panel", label: "Panel", desc: "Finished end or filler panel", category: "custom" },
  // Fridge only. An oven is added as a bay INSIDE a cabinet, not as a free
  // standing box, so it does not belong in this list.
  { type: "appliance", kind: "fridge", label: "Fridge space", desc: "Leave room for the fridge", category: "room" },
  { type: "window", label: "Window", desc: "Mark a window on the wall", category: "room" },
  { type: "door_opening", label: "Doorway", desc: "Mark a doorway", category: "room" },
];
const CATALOGUE_CATEGORIES = [
  { key: "custom", label: "Cabinetry we make" },
  // `always` because this category has no items until a range is chosen, and
  // hiding it would leave nowhere to choose the range from.
  { key: "ikea", label: "IKEA cabinets you own", always: true },
  { key: "room", label: "Room features" },
];
const DEFAULT_RAIL_CATEGORY = CATALOGUE_CATEGORIES[0].key;
// Placed to show what's already in the room, never manufactured or quoted , 
// so they take a size and nothing else: no colour, no style, no panels.
const ROOM_REFERENCE_TYPES = new Set(["appliance", "window", "door_opening"]);
const isRoomReference = (item) => ROOM_REFERENCE_TYPES.has(item?.item_type);
// A standalone panel stores its face WIDTH in depth_mm; width_mm is its on-edge
// thickness (see the "panel" case in the admin AddItemForm). The public form
// says "width" and writes depth_mm, so nobody has to know that.
const isPanel = (item) => item?.item_type === "panel";
const TYPE_LABELS = Object.fromEntries(CATALOGUE.map((c) => [c.type, c.label]));
const HAS_BENCHTOP = new Set(["base_cabinet", "corner_base_cabinet"]);
const FLOOR_TYPES = new Set(["base_cabinet", "tall_cabinet", "corner_base_cabinet", "bookcase"]);
const FILLER_PANEL_TYPES = new Set(["wall_cabinet", "tall_cabinet"]);
const isShelf = (item) => item?.item_type === "floating_shelf";
// A bookcase is always open-fronted, no door/drawer choice is ever offered for
// one, so its panel shows the shelf count on its own instead of a front picker.
const isBookcase = (item) => item?.item_type === "bookcase";
// A Shelf & Rail spans an opening rather than standing anywhere. The public
// version deliberately exposes only span, depth and shelf height: which face a
// cleat screws into and whether an end lands on a gable are trade calls, not
// homeowner ones, so they're detected from the plan and settled in the office.
const isShelfRail = (item) => item?.item_type === "shelf_rail";
const isCorner = (item) => item?.item_type === "corner_base_cabinet";
// Melamine "carcass white", the whole-item colour fallback, so a new cabinet
// reads white until a specific surface is coloured (carcass stays white even
// after the doors are changed, exactly as a real white-carcass unit).
const CARCASS_WHITE = "#efece3";

const frontStyle = (item) =>
  item?.front_type === "drawers" ? item?.drawer_style
    : item?.front_type === "mixed" ? (item?.door_style || item?.drawer_style)
    : item?.door_style;
// Cabinets that can use the multi-bay ("mixed") front in the public tool.
const CAN_BAYS = new Set(["tall_cabinet", "base_cabinet"]);

// Whether the cabinet has any finished side/back/top/underside panel switched on.
const hasFinishPanels = (item) => Boolean(item?.end_panel_left || item?.end_panel_right || item?.has_back_panel || item?.has_bottom_panel || item?.has_top_panel || item?.has_filler_panel);
// "Open" = no doors or drawers (front_type "none"), so the interior + shelves show.
const isOpenFront = (item) => (item?.front_type || "none") === "none" && !isShelf(item);

// Which colour-image slot a sidebar surface maps to (for the current swatch).
const slotForTarget = (item, target) => {
  if (target === "front") return item?.front_type === "drawers" ? "drawer" : "door";
  if (target === "shelf") return "shelf";
  if (target === "kickboard") return "kickboard";
  if (target === "benchtop") return "benchtop";
  if (target === "panels") return "endpanel";
  return "carcass";
};

// The colour surfaces available to edit for a given item, in tab order. Front
// hides when open; Shelves appears when an open cabinet has shelves; Panels when
// a finished side/back/underside panel is on.
function targetsFor(item) {
  if (!item) return [];
  // A fridge space, a window and a doorway are references to what's already in
  // the room, nothing is made, so there's nothing to choose a finish for.
  if (isRoomReference(item)) return [];
  if (isPanel(item)) return [{ key: "body", label: "Panel" }];
  if (isShelf(item)) return [{ key: "body", label: "Shelf" }];
  // One colour only. The cleats and front rail follow the shelf here, they're
  // hidden inside the robe, and picking them properly means picking from stock
  // that comes in 18mm, which the consumer picker doesn't filter on.
  if (isShelfRail(item)) return [{ key: "body", label: "Shelf" }];
  const open = isOpenFront(item);
  // Shelves are a colourable surface whenever there ARE any, either the whole
  // unit is open with shelves in it, or a bay of a mixed front is.
  const hasShelves = (open && Number(item.shelf_qty) > 0) || bayShelfCount(item) > 0;
  return [
    ...(open ? [] : [{ key: "front", label: item.front_type === "drawers" ? "Drawers" : item.front_type === "mixed" ? "Fronts" : "Doors" }]),
    ...(hasShelves ? [{ key: "shelf", label: "Shelves" }] : []),
    { key: "body", label: isBookcase(item) ? "Bookcase" : "Carcass" },
    ...(item.has_kickboard ? [{ key: "kickboard", label: "Kickboard" }] : []),
    ...(hasFinishPanels(item) ? [{ key: "panels", label: "Panels" }] : []),
    ...(HAS_BENCHTOP.has(item.item_type) ? [{ key: "benchtop", label: "Benchtop" }] : []),
  ];
}

// Even drawer heights for an n-drawer bank of a given cabinet height.
function equalDrawers(heightMm, n) {
  const total = Number(heightMm) || 720;
  const each = Math.round(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - each * (n - 1) : each));
}

function hingesForDoorOpening(opening, columns) {
  const cols = Math.max(1, Number(columns) || 1);
  if (opening === "left") return Array(cols).fill("R");
  if (opening === "centre") return Array.from({ length: Math.max(2, cols) }, (_, i) => (i === 0 ? "L" : "R"));
  return Array(cols).fill("L");
}

function doorOpeningValue(cfg = {}) {
  const cols = Math.max(1, Number(cfg.columns) || 1);
  const hinges = Array.isArray(cfg.hinges) ? cfg.hinges : [];
  if (cols >= 2 && hinges[0] === "L" && hinges[cols - 1] === "R") return "centre";
  if (hinges[0] === "R") return "left";
  return "right";
}

function doorConfigPatchForOpening(cfg = {}, opening) {
  const columns = opening === "centre" ? Math.max(2, Number(cfg.columns) || 2) : Math.max(1, Number(cfg.columns) || 1);
  return { ...cfg, columns, rows: 1, hinges: hingesForDoorOpening(opening, columns) };
}

// Every cabinet starts OPEN, with no fronts and no shelves, and the customer
// builds it up from the Style section. Defaulting to a door meant a plan filled
// up with doors nobody had asked for, and someone planning a run of drawers had
// to take a door off each cabinet before they could start. It also let a design
// arrive quoting doors that were never actually chosen.
//
// The door_config values below stay put: inert while the cabinet is open, and
// the arrangement Style falls back to the moment someone does pick doors.
function cabinetDraft(type, kind = null) {
  const base = { item_type: type, wall: "top", front_type: "none", shelf_qty: 0, qty: 1, colour_hex: CARCASS_WHITE };
  switch (type) {
    case "panel":
      // panel_thickness_mm is the canonical thickness; width_mm mirrors it for
      // the plan-view footprint, and depth_mm carries the finished face width.
      return { item_type: "panel", wall: "top", qty: 1, panel_thickness_mm: 18, width_mm: 18, height_mm: 720, depth_mm: 600 };
    case "appliance":
      return { item_type: "appliance", wall: "top", qty: 1, appliance_kind: kind || "fridge", ...applianceKindDefaults(kind || "fridge") };
    case "window":
      // Sits in the wall at sill height, shallow into the room.
      return { item_type: "window", wall: "top", qty: 1, width_mm: 900, height_mm: 1200, depth_mm: 100, mount_height_mm: 900 };
    case "door_opening":
      return { item_type: "door_opening", wall: "top", qty: 1, width_mm: 820, height_mm: 2040, depth_mm: 100, mount_height_mm: 0 };
    case "wall_cabinet":
      return { ...base, width_mm: 600, height_mm: 720, depth_mm: 320, mount_height_mm: 1400, door_config: { columns: 1, rows: 1 } };
    case "tall_cabinet":
      return { ...base, width_mm: 600, height_mm: 2100, depth_mm: 560, has_kickboard: true, door_config: { columns: 1, rows: 2 } };
    case "corner_base_cabinet":
      return { ...base, width_mm: 900, secondary_width_mm: 900, height_mm: 720, depth_mm: 560, has_kickboard: true, has_benchtop: true, corner_style: "l_shape" };
    case "bookcase":
      // Always open, solid back, 18mm board, the shelves carry their own
      // colour, so this is the one item where two finishes are the point.
      return {
        ...base,
        width_mm: 800, height_mm: 2000, depth_mm: 300,
        front_type: "none", shelf_qty: 4,
        carcass_thickness_mm: 18, shelf_thickness_mm: 18,
        back_panel_included: true, back_panel_thickness_mm: 16,
      };
    case "shelf_rail": {
      // Front rail always on in the public tool, it's what lets a robe shelf
      // span a real opening without sagging, and it isn't a taste decision.
      // Supports start as "wall" (the one value that never trips a blocking
      // error) and are re-detected from the plan as soon as it's sized.
      const cfg = {
        left_support: "wall", right_support: "wall",
        back_cleat: true, end_cleat_left: true, end_cleat_right: true,
        rail_height_mm: SHELF_RAIL_DEFAULTS.rail_height_mm,
        front_rail: { on: true, setback_mm: SHELF_RAIL_DEFAULTS.front_rail_setback_mm },
      };
      return {
        item_type: "shelf_rail", wall: "top", qty: 1, colour_hex: CARCASS_WHITE,
        width_mm: SHELF_RAIL_DEFAULTS.width_mm,
        depth_mm: SHELF_RAIL_DEFAULTS.depth_mm,
        carcass_thickness_mm: SHELF_RAIL_DEFAULTS.shelf_thickness_mm,
        height_mm: SHELF_RAIL_DEFAULTS.rail_height_mm + SHELF_RAIL_DEFAULTS.shelf_thickness_mm,
        mount_height_mm: CABINET_MOUNT_MM.shelf_rail,
        shelf_rail_config: cfg,
      };
    }
    case "floating_shelf":
      // Wall-mounted board, no doors/benchtop; finish stored in the base
      // material/finish/colour columns (see floatingShelfStyle).
      return { item_type: "floating_shelf", wall: "top", qty: 1, width_mm: 900, depth_mm: 250, height_mm: 40, mount_height_mm: 1500, carcass_thickness_mm: 18 };
    case "base_cabinet":
    default:
      return { ...base, width_mm: 600, height_mm: 720, depth_mm: 560, has_kickboard: true, has_benchtop: true, door_config: { columns: 1, rows: 1 } };
  }
}

const C = {
  bar: "#2a2b28", barText: "#f3f1ea", panel: "#ffffff", edge: "#e4dfd4", ink: "#2a2925",
  soft: "#7a766c", green: "#1f6f4a", stage: "#eceae3",
};
// backgroundColor, not the background shorthand: this object is spread into
// selects, and the shorthand resets background-image, which would wipe the
// .pcdSelect arrow layers.
const btn = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.edge}`, backgroundColor: "#fff", cursor: "pointer", font: "inherit", fontSize: 13.5, color: C.ink };
const btnPrimary = { ...btn, background: C.green, color: "#fff", borderColor: C.green, fontWeight: 600 };

export default function PublicDesignClient() {
  const d = usePublicDesign();
  const [view, setView] = useState("plan"); // plan | elevation | 3d
  const [elevWall, setElevWall] = useState("top");
  const [showColours, setShowColours] = useState(true);
  const [colourTarget, setColourTarget] = useState("front");
  const [colourModalOpen, setColourModalOpen] = useState(false);
  const [savePanel, setSavePanel] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false); // narrow: room sheet
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  // Windows, doorways and fridge spaces are there to plan around, not things we
  // make, so a design holding only those has nothing to send.
  const quotableCount = useMemo(() => quotableItems(d.items).length, [d.items]);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false);
  // The rail's category is held here rather than inside AddItemRail, because
  // choosing "IKEA" has to bring a range selector with it.
  const [railCategory, setRailCategory] = useState(DEFAULT_RAIL_CATEGORY);
  const [ikeaRange, setIkeaRange] = useState("");
  const [propColourOpen, setPropColourOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 860px)");
    const on = () => setNarrow(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Keep the colour target valid for the selected item (a shelf has only
  // "Shelf"; a non-benchtop cabinet has no "Benchtop").
  useEffect(() => {
    const item = d.selectedItem;
    if (!item) return;
    const keys = targetsFor(item).map((t) => t.key);
    if (!keys.includes(colourTarget)) setColourTarget(keys[0]);
  }, [d.selectedItem, colourTarget]);

  useEffect(() => {
    if (!narrow || !d.selectedItem) setMobileConfigOpen(false);
  }, [narrow, d.selectedItem]);

  async function addCabinet(type, kind = null) {
    // An IKEA tile carries its preset ref as the `kind`. What it adds is an
    // ordinary cabinet of that type with the normal starting config; only the
    // box, the name and the marker come from the preset.
    const preset = resolveIkeaPreset(kind);
    await d.addItem(preset
      ? {
          ...cabinetDraft(preset.item_type),
          // IKEA cabinets come with their own plinth, so ours is never on by
          // default. Metod can have one switched on; Pax and Besta cannot have
          // one at all. See kickboardAllowedFor.
          has_kickboard: false,
          width_mm: preset.width_mm,
          height_mm: preset.height_mm,
          depth_mm: preset.depth_mm,
          mount_height_mm: preset.mount_height_mm,
          label: preset.label,
          preset_ref: preset.ref,
          // Starts in the finish that range comes in first, which is White
          // everywhere, so the box reads as a real cabinet rather than an
          // unpainted one. Changed from the panel like any other colour.
          prop_carcass_finish: defaultIkeaCarcassFinish(preset.range),
          colour_hex: ikeaCarcassHex(defaultIkeaCarcassFinish(preset.range)) || CARCASS_WHITE,
        }
      : cabinetDraft(type, kind));
    setMobileAddOpen(false);
  }

  // IKEA sizes only enter the catalogue once a range is chosen. They sit in
  // their own category, so they never appear among the cabinets we build.
  const ikeaRows = (ikeaRange ? ikeaGroupsForRange(ikeaRange) : []).flatMap((group) =>
    group.presets.map((p) => ({
      type: p.item_type,
      kind: p.ref,
      label: `${p.width_mm} × ${p.height_mm}mm`,
      desc: `${group.label.replace(/s$/, "")} · ${p.depth_mm}mm deep`,
      category: "ikea",
    }))
  );

  const railProps = {
    theme: "light",
    title: "Add to your room",
    catalogue: [...CATALOGUE, ...ikeaRows],
    categories: CATALOGUE_CATEGORIES,
    category: railCategory,
    onCategoryChange: setRailCategory,
    // Always a deliberate group, never one long list. See CATALOGUE_CATEGORIES.
    showAllOption: false,
    emptyLabel:
      railCategory === "ikea" && !ikeaRange
        ? "Choose a range above and the standard sizes will appear here."
        : "Nothing in this category.",
    belowFilter: railCategory === "ikea" ? (
      <div style={{ marginTop: 10, padding: "9px 10px", borderRadius: 8, background: "#fdf6e7", border: "1px solid #e8d9b0" }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#7a5c1e" }}>
          Which range?
          <select
            className="pcdSelect"
            value={ikeaRange}
            onChange={(e) => setIkeaRange(e.target.value)}
            style={{ ...btn, width: "100%", marginTop: 5, padding: "7px 8px", paddingRight: 40, fontSize: 12.5, borderColor: "#e8d9b0", cursor: "pointer" }}
          >
            <option value="">Choose a range...</option>
            {IKEA_RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <p style={{ margin: "7px 0 0", fontSize: 10.5, lineHeight: 1.45, color: "#7a5c1e" }}>
          We don&apos;t supply IKEA cabinets, so these never go on a quote. Add them to plan the doors,
          fronts and panels for the ones you already have.
        </p>
      </div>
    ) : null,
    renderMockup: (type, kind) => <Mockup type={type} kind={kind} />,
    onPick: (type, kind) => addCabinet(type, kind),
  };

  function applyColour(sel) {
    const item = d.selectedItem;
    if (!item) return;
    const mfc = { material: sel.material, finish: sel.finish, colour: sel.colour };
    const mfcS = { ...mfc, supplier: sel.supplier }; // supplier kept in the jsonb so the chooser re-opens on the right brand
    if (colourTarget === "body") d.updateItem(item.id, mfc);
    else if (colourTarget === "shelf") d.updateItem(item.id, { shelf_material: sel.material, shelf_finish: sel.finish, shelf_colour: sel.colour });
    else if (colourTarget === "kickboard") d.updateItem(item.id, { kickboard_style: mfcS });
    else if (colourTarget === "panels") d.updateItem(item.id, { finish_panel_style: mfcS, back_panel_style: mfcS, bottom_panel_style: mfcS });
    else if (colourTarget === "benchtop") d.updateItem(item.id, { benchtop_colour_style: mfcS, benchtop_colour_hex: "" });
    else if (item.front_type === "drawers") d.updateItem(item.id, { drawer_style: { ...(item.drawer_style || {}), ...mfcS } });
    else if (item.front_type === "mixed") d.updateItem(item.id, { door_style: { ...(item.door_style || {}), ...mfcS }, drawer_style: { ...(item.drawer_style || {}), ...mfcS } });
    else d.updateItem(item.id, { front_type: "doors", door_style: { ...(item.door_style || {}), ...mfcS } });
    setColourModalOpen(false);
  }

  const colourValue = (() => {
    const item = d.selectedItem;
    if (!item) return null;
    if (colourTarget === "body") return { material: item.material, finish: item.finish, colour: item.colour };
    if (colourTarget === "shelf") return { material: item.shelf_material, finish: item.shelf_finish, colour: item.shelf_colour };
    if (colourTarget === "kickboard") return item.kickboard_style || null;
    if (colourTarget === "panels") return item.finish_panel_style || item.back_panel_style || item.bottom_panel_style || null;
    if (colourTarget === "benchtop") return item.benchtop_colour_style || null;
    return frontStyle(item) || null;
  })();

  // The carcass of a prop is the customer's own cabinet, so it opens the IKEA
  // swatches instead of our colour library. Every other surface on the same
  // cabinet is something we make, and opens the library as normal.
  const openColour = (target) => {
    setColourTarget(target);
    if (target === "body" && isIkeaPreset(d.selectedItem)) setPropColourOpen(true);
    else setColourModalOpen(true);
  };

  function applyPropCarcass(name) {
    const item = d.selectedItem;
    if (!item) return;
    d.updateItem(item.id, { prop_carcass_finish: name, colour_hex: ikeaCarcassHex(name) || CARCASS_WHITE });
    setPropColourOpen(false);
  }
  const surfaceLabel = (targetsFor(d.selectedItem).find((t) => t.key === colourTarget) || {}).label || "colour";

  const shell = { position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: C.stage, overflow: "hidden", zIndex: 1 };

  if (d.loading) {
    return (
      <div style={{ ...shell, alignItems: "center", justifyContent: "center" }}>
        <PcdLoader
          label="Starting your design"
          steps={["Starting your design", "Setting up your room", "Loading colours", "Almost there"]}
        />
      </div>
    );
  }
  if (d.error || !d.room) {
    return (
      <div style={{ ...shell, alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24 }}>
        <p style={{ color: "#b4442f" }}>{d.error || "Couldn't load your room."}</p>
        <button style={btn} onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const selectItem = (itemOrId) => {
    const id = typeof itemOrId === "object" ? itemOrId?.id : itemOrId;
    if (!id) return;
    if (narrow && d.selectedItemId === id) {
      setMobileConfigOpen(true);
      return;
    }
    setMobileConfigOpen(false);
    d.setSelectedItemId(id);
  };
  const deselectItem = () => {
    setMobileConfigOpen(false);
    d.setSelectedItemId(null);
  };
  const changeView = (nextView) => {
    if (nextView === "elevation" && view !== "elevation") {
      setElevWall(d.selectedItem?.wall || elevWall || "top");
    }
    setView(nextView);
  };
  const planCanvas = (
    <DesignCanvas
      room={d.room} items={d.items} selectedItemId={d.selectedItemId} overlappingItemIds={d.overlappingItemIds}
      onItemClick={selectItem} onDeselect={deselectItem}
      onItemDragEnd={d.handleItemDragEnd} onFrontView={(w) => { setElevWall(w); setView("elevation"); }} colourImages={d.colourImages} showColours={showColours}
      selectOnPointerUp={narrow}
    />
  );
  const stage = (
    <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0, background: "#fff", display: "flex" }}>
      {view === "plan" ? (
        narrow ? <PinchZoom oneFingerPan={false}>{planCanvas}</PinchZoom> : planCanvas
      ) : view === "elevation" ? (
        <FrontElevationView
          wall={elevWall} room={d.room} items={d.items}
          interactive chrome={false} zoomable={narrow}
          colourImages={d.colourImages} showColours={showColours}
          selectedId={d.selectedItemId}
          onItemSelect={selectItem}
          onItemChange={d.handleItemDragEnd}
          onClose={() => setView("plan")}
          selectOnPointerUp={narrow}
        />
      ) : (
        <Design3DView
          touch={narrow}
          room={d.room} items={d.items} colourImages={d.colourImages} showColours={showColours}
          onToggleColours={() => setShowColours((s) => !s)} selectedItemId={d.selectedItemId}
          onSelectItem={selectItem} onClose={() => setView("plan")} showClose={false}
        />
      )}
      {d.items.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <div style={{ background: "rgba(255,255,255,0.9)", border: `1px solid ${C.edge}`, borderRadius: 12, padding: "16px 20px", textAlign: "center", maxWidth: 340 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Start your design</div>
            <div style={{ fontSize: 13, color: C.soft, lineHeight: 1.5 }}>
              {narrow ? "Tap Add below to drop in your first cabinet, then drag it into place." : "Pick a cabinet from the left to drop it in, then drag it into place."}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={shell}>
      {narrow ? (
        <MobilePublicTopBar
          view={view}
          onView={changeView}
          showColours={showColours}
          onToggleColours={() => setShowColours((s) => !s)}
          moreOpen={mobileMoreOpen}
          setMoreOpen={setMobileMoreOpen}
          onRoom={() => { setMobileMoreOpen(false); setRoomOpen(true); }}
          onSave={() => { setMobileMoreOpen(false); setSavePanel((s) => !s); }}
          onStartOver={() => { setMobileMoreOpen(false); if (confirm("Start a new design? Your current one stays saved under its link.")) d.startOver(); }}
          onSubmit={() => { setMobileMoreOpen(false); setSubmitOpen(true); }}
          canSubmit={quotableCount > 0}
        />
      ) : (
        <DesignTopBar
          view={view} onView={changeView}
          elevWall={elevWall} onElevWall={setElevWall}
          showColours={showColours} onToggleColours={() => setShowColours((s) => !s)}
          left={<>
            <Link href="/" style={{ color: "#f3f1ea", textDecoration: "none", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>Perth Cabinet Doors</Link>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>·</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>Room planner</span>
          </>}
          right={<>
            <span style={{ position: "relative" }}>
              <button type="button" style={barButton} onClick={() => setSavePanel((s) => !s)}>Save / share</button>
            </span>
            <button type="button" style={barButton} onClick={() => { if (confirm("Start a new design? Your current one stays saved under its link.")) d.startOver(); }}>Start over</button>
            <button type="button" style={{ ...btnPrimary, fontWeight: 700 }} onClick={() => setSubmitOpen(true)} disabled={quotableCount === 0} title={quotableCount === 0 ? "Add a cabinet, panel or shelf first" : "Choose what to quote and send it to PCD"}>Send to PCD</button>
          </>}
        />
      )}

      {narrow && view === "elevation" && (
        <div style={{ flexShrink: 0, background: "#22231f", borderBottom: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", overflowX: "auto" }}>
          {[
            ["top", "Back"],
            ["left", "Left"],
            ["right", "Right"],
            ["bottom", "Front"],
          ].map(([wallKey, label]) => (
            <button key={wallKey} type="button" onClick={() => setElevWall(wallKey)} style={{ ...barButton, minHeight: 36, padding: "7px 10px", background: elevWall === wallKey ? "rgba(255,255,255,0.16)" : "transparent" }}>{label}</button>
          ))}
        </div>
      )}

      {/* One modal for both layouts. It used to be a popover anchored under
          the button on desktop and a floating card on mobile, which meant two
          positions to maintain and no room for the email form. */}
      {savePanel && (
        <SaveShareModal shareUrl={shareUrl} code={d.code} onClose={() => setSavePanel(false)} />
      )}

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* Catalogue rail (wide only), the shared AddItemRail (same one the
            admin tool uses), themed light. */}
        {!narrow && (
          <div style={{ width: 236, flexShrink: 0, background: C.panel, borderRight: `1px solid ${C.edge}`, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <AddItemRail {...railProps} />
            </div>
            <div style={{ borderTop: `1px solid ${C.edge}`, padding: 14, flexShrink: 0 }}>
              <button type="button" style={{ ...btn, width: "100%" }} onClick={() => setRoomOpen(true)}>Edit room size</button>
            </div>
          </div>
        )}

        {stage}

        {/* Contextual panel (wide only) */}
        {!narrow && (
          <div style={{ width: 320, flexShrink: 0, background: C.panel, borderLeft: `1px solid ${C.edge}`, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {d.selectedItem
              ? <ItemPanel item={d.selectedItem} items={d.items} room={d.room} onUpdate={d.updateItem} onDuplicate={() => d.duplicateItem(d.selectedItem.id)} onDelete={() => d.deleteItem(d.selectedItem.id)} onDeselect={deselectItem} colourImages={d.colourImages} onChangeColour={openColour} />
              : <EmptyPrompt />}
          </div>
        )}
      </div>

      {/* Narrow: add bar + sheets */}
      {narrow && (
        <>
          {d.selectedItem && !mobileConfigOpen && !mobileAddOpen && (
            <div style={{ flexShrink: 0, background: "#fff", borderTop: `1px solid ${C.edge}`, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ minWidth: 0, flex: 1, fontSize: 12, color: C.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Selected: <strong style={{ color: C.ink }}>{TYPE_LABELS[d.selectedItem.item_type] || "Cabinet"}</strong>. Tap again to configure.
              </span>
              <button type="button" onClick={() => setMobileConfigOpen(true)} style={{ ...btn, padding: "7px 10px", flexShrink: 0 }}>Configure</button>
            </div>
          )}
          <div style={{ flexShrink: 0, background: C.panel, borderTop: `1px solid ${C.edge}`, padding: "8px 10px max(8px, env(safe-area-inset-bottom))", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button type="button" onClick={() => setMobileAddOpen(true)} style={{ ...btnPrimary, minHeight: 44, width: "100%" }}>Add cabinet</button>
            <button type="button" onClick={() => setRoomOpen(true)} style={{ ...btn, minHeight: 44, width: "100%" }}>Room size</button>
          </div>
          {mobileAddOpen && (
            <BottomSheet title="Add to your room" onClose={() => setMobileAddOpen(false)}>
              {/* The sheet already draws the title and the close button, so the
                  rail must not draw its own or they appear twice. */}
              <div style={{ height: "min(68vh, 560px)", minHeight: 360 }}>
                <AddItemRail {...railProps} showHeader={false} />
              </div>
            </BottomSheet>
          )}
          {d.selectedItem && !mobileAddOpen && mobileConfigOpen && (
            <FullScreenConfigModal title={TYPE_LABELS[d.selectedItem.item_type] || "Cabinet"} onClose={() => setMobileConfigOpen(false)}>
              <ItemPanel item={d.selectedItem} items={d.items} room={d.room} onUpdate={d.updateItem} onDuplicate={() => d.duplicateItem(d.selectedItem.id)} onDelete={() => d.deleteItem(d.selectedItem.id)} onDeselect={deselectItem} colourImages={d.colourImages} onChangeColour={openColour} showHeader={false} />
            </FullScreenConfigModal>
          )}
        </>
      )}

      {d.saveError && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#fbece9", border: "1px solid #e6b8ad", color: "#a03f2c", borderRadius: 8, padding: "8px 14px", fontSize: 13, zIndex: 6, display: "flex", gap: 12 }}>
          <span>{d.saveError}</span>
          <button type="button" onClick={d.dismissSaveError} style={{ border: "none", background: "none", cursor: "pointer", color: "#a03f2c" }}>✕</button>
        </div>
      )}

      {colourModalOpen && d.selectedItem && (
        <PublicColourModal surfaceLabel={surfaceLabel} value={colourValue} onPick={applyColour} onClose={() => setColourModalOpen(false)} />
      )}

      {propColourOpen && d.selectedItem && (
        <PropCarcassModal
          range={resolveIkeaPreset(d.selectedItem.preset_ref)?.range || ""}
          rangeLabel={resolveIkeaPreset(d.selectedItem.preset_ref)?.range_label || "IKEA"}
          current={d.selectedItem.prop_carcass_finish || ""}
          onPick={applyPropCarcass}
          onClose={() => setPropColourOpen(false)}
        />
      )}

      {roomOpen && (
        <RoomModal room={d.room} onUpdateRoom={d.updateRoom} onClose={() => setRoomOpen(false)} />
      )}

      {submitOpen && (
        <SubmitModal items={d.items} room={d.room} colourImages={d.colourImages} onSubmit={d.submitToPcd} onClose={() => setSubmitOpen(false)} />
      )}
    </div>
  );
}

// Save & share. Two ways to keep the link: copy it, or have it emailed.
//
// The email route asks for a name and address, which is a real lead, so it goes
// on the customer list. Copying stays completely anonymous: someone who just
// wants the URL should never be made to hand over an email for it, and a form
// they are forced through is a form they abandon.
function SaveShareModal({ shareUrl, code, onClose }) {
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null); // { emailed: boolean }

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The tick is a confirmation, not a state, so it clears itself.
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // Clipboard is blocked outside a secure context, so fall back to
      // selecting the field and telling them to copy it themselves.
      const field = document.getElementById("pcdShareUrl");
      if (field) { field.focus(); field.select(); }
    }
  }

  async function emailMe() {
    if (!form.name.trim()) { setError("Please enter your name."); return; }
    if (!form.email.trim()) { setError("Please enter your email."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/public/design/${encodeURIComponent(code)}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, shareUrl }),
      });
      const data = await res.json();
      if (data?.ok) setSent({ emailed: Boolean(data.emailed) });
      else setError(data?.error || "Could not save your details. Please try again.");
    } catch {
      setError("Could not save your details. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = { ...btn, width: "100%", boxSizing: "border-box", cursor: "text" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save and share your design"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001,
          width: "min(460px, 94vw)", maxHeight: "90vh", overflowY: "auto", background: "#fff",
          borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: `1px solid ${C.edge}` }}>
          <strong style={{ fontSize: 15, color: C.ink }}>Save &amp; share your design</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.edge}`, background: "#fff", cursor: "pointer", color: C.soft }}>✕</button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>
              Your design saves as you go. This private link opens it again on any device, and you can send
              it to anyone you want an opinion from.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="pcdShareUrl"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
                style={{ ...field, flex: 1, minWidth: 0, color: C.soft }}
              />
              <button type="button" style={{ ...btnPrimary, whiteSpace: "nowrap" }} onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.edge}`, paddingTop: 16 }}>
            {sent ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                <strong style={{ fontSize: 13.5, color: C.ink }}>
                  {sent.emailed ? "Sent. Check your inbox." : "Saved."}
                </strong>
                <span style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>
                  {sent.emailed
                    ? "We have emailed you the link. We will not send you anything else unless you ask us to."
                    : "We have your details, so we can help if you get stuck. Copy the link above to keep it, and check your junk folder if the email does not arrive."}
                </span>
                <button type="button" style={btn} onClick={onClose}>Back to my design</button>
              </div>
            ) : (
              <>
                <strong style={{ display: "block", fontSize: 13.5, color: C.ink, marginBottom: 3 }}>
                  Or have the link emailed to you
                </strong>
                <p style={{ margin: "0 0 12px", fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>
                  Handy if you are on a shared computer, or you want it waiting for you later.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: C.soft }}>
                    Name
                    <input
                      style={field}
                      value={form.name}
                      placeholder="Sarah Jones"
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: C.soft }}>
                    Email
                    <input
                      type="email"
                      style={field}
                      value={form.email}
                      placeholder="sarah@email.com"
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </label>
                  {error ? <div style={{ fontSize: 12.5, color: "#a03f2c" }}>{error}</div> : null}
                  <button type="button" style={btnPrimary} disabled={busy} onClick={emailMe}>
                    {busy ? "Sending…" : "Email me the link"}
                  </button>
                  <span style={{ fontSize: 11, color: "#a29d92", lineHeight: 1.5 }}>
                    We keep your details so we can help if you get stuck. No marketing, and no obligation to
                    order anything.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function MobilePublicTopBar({
  view,
  onView,
  showColours,
  onToggleColours,
  moreOpen,
  setMoreOpen,
  onRoom,
  onSave,
  onStartOver,
  onSubmit,
  canSubmit,
}) {
  const mobileBarBtn = { ...barButton, minHeight: 38, padding: "7px 10px", fontSize: 12.5 };
  return (
    <div style={{ flexShrink: 0, background: C.bar, color: C.barText, padding: "max(8px, env(safe-area-inset-top)) 10px 8px", zIndex: 20, display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <Link href="/" style={{ color: C.barText, textDecoration: "none", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Perth Cabinet Doors</Link>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.62)" }}>Room planner</span>
      </div>
      <select
        aria-label="View"
        value={view}
        onChange={(e) => onView(e.target.value)}
        className="pcdSelect pcdSelect--dark"
        style={{ ...mobileBarBtn, width: 112, backgroundColor: "#3d3e3b", color: C.barText, paddingRight: 40 }}
      >
        <option value="plan">Plan</option>
        <option value="elevation">Elevation</option>
        <option value="3d">3D</option>
      </select>
      <button type="button" style={mobileBarBtn} onClick={onToggleColours} aria-pressed={showColours} title="Toggle colours">
        {showColours ? "Colours" : "Lines"}
      </button>
      <span style={{ position: "relative", flexShrink: 0 }}>
        <button type="button" style={mobileBarBtn} onClick={() => setMoreOpen((o) => !o)} aria-haspopup="menu" aria-expanded={moreOpen}>More</button>
        {moreOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 21 }} onClick={() => setMoreOpen(false)} />
            <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 22, width: 190, background: "#fff", color: C.ink, border: `1px solid ${C.edge}`, borderRadius: 10, boxShadow: "0 14px 34px rgba(0,0,0,0.24)", padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              <MobileMenuButton onClick={onRoom}>Room size</MobileMenuButton>
              <MobileMenuButton onClick={onSave}>Save / share</MobileMenuButton>
              <MobileMenuButton onClick={onStartOver}>Start over</MobileMenuButton>
              <MobileMenuButton onClick={onSubmit} disabled={!canSubmit}>Send to PCD</MobileMenuButton>
              {/* The brand link at the top of this bar goes home, but it
                  truncates on a narrow screen and reads as a logo rather than a
                  way out. The planner is full-bleed with no site nav, so it
                  needs one obvious exit. The design stays saved under its code. */}
              <Link
                href="/"
                role="menuitem"
                style={{ borderTop: `1px solid ${C.edge}`, marginTop: 4, paddingTop: 10, color: C.ink, textAlign: "left", borderRadius: 7, padding: "11px 10px", minHeight: 42, font: "inherit", fontSize: 13, textDecoration: "none" }}
              >
                Back to the website
              </Link>
            </div>
          </>
        )}
      </span>
    </div>
  );
}

function MobileMenuButton({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      style={{ border: "none", background: "transparent", color: disabled ? "#aaa" : C.ink, textAlign: "left", borderRadius: 7, padding: "11px 10px", minHeight: 42, font: "inherit", fontSize: 13, cursor: disabled ? "default" : "pointer" }}
    >
      {children}
    </button>
  );
}

// One part of one item, as a tick row on its card. Groups, never boards: a
// customer ticks "Doors", not each door.
function PartRow({ part, on, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
        border: `1px solid ${on ? C.green : C.edge}`, background: on ? "#f4faf6" : "#fff",
        borderRadius: 7, padding: "5px 8px", cursor: "pointer", font: "inherit", fontSize: 12, color: C.ink,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 15, height: 15, flex: "none", borderRadius: 4, display: "grid", placeItems: "center",
          border: `1.5px solid ${on ? C.green : "#c6c0b1"}`, background: on ? C.green : "#fff",
          color: "#fff", fontSize: 10, lineHeight: 1, fontWeight: 700,
        }}
      >
        {on ? "✓" : ""}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", fontWeight: 600 }}>{part.label}</b>
        {part.detail ? <span style={{ display: "block", fontSize: 10.5, color: C.soft }}>{part.detail}</span> : null}
      </span>
    </button>
  );
}

// One cabinet: drawn to scale, then its parts. The drawing is the point, a
// customer has no idea what "finished panel" means until they see it on their
// own cabinet.
function ItemCard({ item, selection, onTogglePart, onAll, onNone }) {
  const parts = partsForItem(item);
  const chosen = selectedPartKeys(selection, item).length;
  const { box, pieces, arrangement } = frontPiecesForItem(item);
  const owned = isCustomerOwned(item);

  return (
    <div style={{
      border: `1px solid ${C.edge}`, borderRadius: 11, background: "#fff", overflow: "hidden",
      display: "flex", flexDirection: "column", opacity: chosen ? 1 : 0.6,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 10px 7px" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: "block", fontSize: 12.5, lineHeight: 1.3, color: C.ink }}>
            {item.label || "Cabinet"}
          </strong>
          {/* box, not width_mm: a standalone panel keeps its finished face
              width in depth_mm, so reading width_mm showed its 18mm on-edge
              thickness as though that were the panel. */}
          <span style={{ display: "block", fontSize: 11, color: C.soft }}>
            {Math.round(box.width)} × {Math.round(box.height)}mm
          </span>
        </span>
        {owned ? (
          <span style={{
            fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", padding: "2px 5px",
            borderRadius: 4, background: "#f0ead6", color: "#7a6a3a", border: "1px solid #ded4b4", whiteSpace: "nowrap",
          }}>
            Your own
          </span>
        ) : null}
      </div>

      <div style={{
        height: 96, background: C.stage, display: "grid", placeItems: "center", padding: 8,
        borderTop: `1px solid ${C.edge}`, borderBottom: `1px solid ${C.edge}`,
      }}>
        <CabinetElevation
          cabinet={box}
          pieces={pieces}
          arrangement={arrangement}
          className="pcdDesignPartFigure"
        />
      </div>

      <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        {parts.map((part) => (
          <PartRow
            key={part.key}
            part={part}
            on={isPartSelected(selection, item.id, part.key)}
            onToggle={() => onTogglePart(item.id, part.key)}
          />
        ))}
      </div>

      <div style={{ padding: "0 10px 9px" }}>
        {chosen === parts.length ? (
          <button type="button" style={{ ...btn, width: "100%", padding: "5px 10px", fontSize: 12.5 }} onClick={() => onNone(item.id)}>
            Clear this cabinet
          </button>
        ) : (
          <button type="button" style={{ ...btn, width: "100%", padding: "5px 10px", fontSize: 12.5 }} onClick={() => onAll(item)}>
            Select all {parts.length}
          </button>
        )}
      </div>
    </div>
  );
}

// One of the two big shortcuts at the top of the picker. These are cards rather
// than small chips on purpose: a first-timer who never notices them ends up
// ticking every part one at a time.
function PresetCard({ active, title, blurb, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", textAlign: "left",
        border: `1px solid ${active ? C.green : C.edge}`, boxShadow: active ? `inset 0 0 0 1px ${C.green}` : "none",
        background: active ? "#f6faf7" : "#fff", borderRadius: 11, padding: "12px 14px", cursor: "pointer",
        font: "inherit", color: C.ink,
      }}
    >
      <span>
        <strong style={{ display: "block", fontSize: 13.5, marginBottom: 2 }}>{title}</strong>
        <span style={{ display: "block", fontSize: 12, color: C.soft, lineHeight: 1.45 }}>{blurb}</span>
      </span>
      <span style={{ fontSize: 11.5, color: C.soft, whiteSpace: "nowrap" }}>{count}</span>
    </button>
  );
}

// A line we cannot quote yet. A piece with no board and no colour on it is the
// customer not having chosen, and it reaches us as "not chosen yet" on the
// quote, which means an email back to them before anything can be priced. It is
// cheaper for everyone to ask on the page they are already on.
//
// A cabinet is exempt: it is priced from its cut list and carries its board
// spec on the pieces, not on the cabinet line.
function lineNeedsColour(line) {
  if (line.productType === "base_cabinet") return false;
  return !line.material || !line.colour;
}

// One row of the review table.
//
// THE BOLD LABEL IS THE QUOTE'S OWN PRODUCT TYPE, not our description of the
// piece. We quote four things: Door, Drawer front, Panel and a cabinet. A row
// headed "Kickboard" read as a product we sell, and it is not one; a kickboard
// is a Panel, which is how it is cut, priced and written on the quote. What the
// piece actually is now sits underneath, with the cabinet it came from, which
// is also what makes Remove safe to press since removing a row removes that
// whole part.
function ReviewRow({ line, index, onRemove }) {
  const size =
    line.width && line.height ? (
      <span className="pcdRqMono">{line.width} × {line.height} mm</span>
    ) : (
      <span className="pcdRqNA">priced from cut list</span>
    );

  const colourLabel = [line.finish, line.colour].filter(Boolean).join(" ");
  // Marked here as well as counted below, so the sentence blocking the send
  // points at something the customer can actually find.
  const needs = lineNeedsColour(line);

  return (
    <div className={`pcdRqRow${needs ? " pcdRqRowNeeds" : ""}`}>
      <div>
        <span className="pcdRqNum">{index + 1}</span>
        <span style={{ minWidth: 0 }}>
          <strong>{line.productType === "base_cabinet" ? "Cabinet" : line.productType}</strong>
          <span className="pcdRqFrom">
            {line.productName}
            {line.productName === line.itemLabel ? "" : ` · ${line.itemLabel}`}
            {line.owned ? " · your own cabinet" : ""}
          </span>
        </span>
      </div>
      <div>
        {line.material
          ? `${line.material}${line.thickness ? ` ${line.thickness}` : ""}`
          : <span className="pcdRqNA">not chosen yet</span>}
      </div>
      <div>{size}</div>
      <div>
        {colourLabel ? (
          <>
            {line.swatch ? (
              <span
                className="pcdRqSwatch"
                style={{ backgroundImage: `url(${line.swatch})`, backgroundSize: "cover", backgroundPosition: "center" }}
              />
            ) : null}
            <span>{colourLabel}</span>
          </>
        ) : (
          <span className="pcdRqNA">not chosen yet</span>
        )}
      </div>
      <div>{line.qty}</div>
      <div className="pcdRqActions">
        <button
          type="button"
          className="pcdRqDel"
          onClick={onRemove}
          title={`Remove ${line.partLabel} for ${line.itemLabel}`}
          aria-label={`Remove ${line.partLabel} for ${line.itemLabel}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// "Send my design to PCD", two steps.
//
// STEP 1 is the whole reason this exists. The planner used to send every item
// in the design, so someone who drew a whole room but only wanted four doors
// priced had no way to say so. They now pick what we quote, grouped per
// cabinet, with the two common answers as one-click shortcuts.
//
// STEP 2 is the contact form that used to be the entire modal.
// Which colour-image slot a part's swatch comes from, so the review table
// shows the same colour the customer picked for that surface rather than the
// cabinet's.
const SWATCH_SLOT = {
  doors: "door",
  drawers: "drawer",
  endpanels: "endpanel",
  filler: "filler",
  kickboard: "kickboard",
  carcass: "carcass",
  body: "carcass",
};

function ikeaRangeLabel(item) {
  const rangeId = String(item?.preset_ref || "").split(":")[1] || "";
  return IKEA_RANGES.find((r) => r.id === rangeId)?.label || "IKEA";
}

function SubmitModal({ items, room, colourImages, onSubmit, onClose }) {
  const quotable = useMemo(() => quotableItems(items), [items]);
  const colourSwatchFor = useMemo(
    () => (item, partKey) => resolveColourSrc(colourImages, item, SWATCH_SLOT[partKey] || "carcass"),
    [colourImages]
  );
  const [step, setStep] = useState("choose"); // choose | details | done
  const [selection, setSelection] = useState(() => buildPreset(quotable, "everything"));
  // Split first/last to match the website's quote request form. The API takes
  // one `name`, so they are joined on submit.
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", suburb: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chosenParts = countSelectedParts(selection, quotable);
  const chosenItems = itemsWithSelection(selection, quotable);
  const preset = matchPreset(quotable, selection);

  const everythingCount = quotable.reduce((n, it) => n + partsForItem(it).length, 0);
  const frontsCount = quotable.reduce(
    (n, it) => n + partsForItem(it).filter((p) => p.key !== "carcass").length, 0
  );
  const ownedCount = quotable.filter(isCustomerOwned).length;

  // The exact lines the API will build, worked out here so the customer signs
  // off on what actually lands in the quote rather than a summary of it. Same
  // function the submit route calls, so the two cannot disagree.
  const reviewLines = useMemo(() => {
    const out = [];
    quotable.forEach((item) => {
      const parts = partsForItem(item);
      const owned = isCustomerOwned(item);
      parts.forEach((part) => {
        if (!isPartSelected(selection, item.id, part.key)) return;
        requestLinesForItem(item, [part.key], { roomName: room?.name || "", roomHeightMm: Number(room?.height_mm) || 0 })
          .forEach((line) => {
            out.push({
              ...line,
              itemId: item.id,
              itemLabel: item.label || part.label,
              partKey: part.key,
              partLabel: part.label,
              owned,
              swatch: colourSwatchFor(item, part.key),
            });
          });
      });
    });
    return out;
  }, [quotable, selection, room, colourSwatchFor]);

  // Every piece needs a colour before this can be sent. Grouped by the cabinet
  // it belongs to, because that is where the customer goes to fix it.
  const missingColour = useMemo(() => {
    const byItem = new Map();
    reviewLines.filter(lineNeedsColour).forEach((line) => {
      if (!byItem.has(line.itemId)) byItem.set(line.itemId, { label: line.itemLabel, parts: new Set() });
      byItem.get(line.itemId).parts.add(line.partLabel);
    });
    return [...byItem.values()].map((entry) => ({ label: entry.label, parts: [...entry.parts] }));
  }, [reviewLines]);
  const canSend = reviewLines.length > 0 && missingColour.length === 0;

  // The website form asks for the cabinet brand. The design already answers it,
  // so it is shown rather than asked.
  const cabinetBrand = useMemo(() => {
    const ranges = new Set();
    quotable.forEach((item) => {
      if (isCustomerOwned(item)) ranges.add(ikeaRangeLabel(item));
      else ranges.add("Custom cabinetry");
    });
    return [...ranges].filter(Boolean).join(" + ") || "Custom cabinetry";
  }, [quotable]);

  function removePart(itemId, partKey) {
    // A row is a piece, but the PART is what they chose, so removing a row
    // removes the part. Both of a cabinet's door lines go together, which is
    // what the row subtitle sets up.
    setSelection((current) => {
      const next = { ...current, [itemId]: { ...(current[itemId] || {}) } };
      delete next[itemId][partKey];
      return next;
    });
  }

  function togglePart(itemId, key) {
    setSelection((current) => {
      const next = { ...current, [itemId]: { ...(current[itemId] || {}) } };
      if (next[itemId][key]) delete next[itemId][key];
      else next[itemId][key] = true;
      return next;
    });
  }
  function selectAllOn(item) {
    setSelection((current) => {
      const next = { ...current, [item.id]: { ...(current[item.id] || {}) } };
      partsForItem(item).forEach((part) => { next[item.id][part.key] = true; });
      return next;
    });
  }
  function clearItem(itemId) {
    setSelection((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  async function submit() {
    if (!reviewLines.length) { setError("There is nothing left to send. Add a line back first."); return; }
    if (missingColour.length) {
      setError("Choose a colour for every piece before sending. The rows that need one are marked above.");
      return;
    }
    if (!form.firstName.trim()) { setError("Please enter your first name."); return; }
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Please enter a phone number or an email so we can reach you.");
      return;
    }
    setBusy(true); setError("");
    // The selection rides along with the contact details. The route treats a
    // missing selection as "all of it", so this is the only thing that makes a
    // partial request partial. The API takes one `name`, so the two fields the
    // form shows are joined here.
    const name = [form.firstName, form.lastName].map((s) => s.trim()).filter(Boolean).join(" ");
    const res = await onSubmit({
      name,
      email: form.email,
      phone: form.phone,
      suburb: form.suburb,
      notes: form.notes,
      selection,
    });
    setBusy(false);
    if (res?.ok) setStep("done");
    else setError(res?.error || "Could not send. Please try again.");
  }

  // The review step is a full form, so it gets a much wider panel than the
  // picker or the confirmation.
  const wide = step === "choose";
  const title =
    step === "done" ? "Request sent" : step === "details" ? "Review and send" : "What should we quote?";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
      <div role="dialog" aria-modal="true" aria-label={title}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001,
          width: step === "details" ? "min(1120px, 97vw)" : wide ? "min(880px, 96vw)" : "min(440px, 94vw)",
          maxHeight: step === "details" ? "94vh" : "90vh",
          height: step === "details" ? "94vh" : "auto",
          display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14,
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        }}>

        <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: `1px solid ${C.edge}` }}>
          <strong style={{ fontSize: 15, color: C.ink }}>{title}</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.edge}`, background: "#fff", cursor: "pointer", color: C.soft }}>✕</button>
        </div>

        {step === "choose" && (
          <>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}>
              {quotable.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: C.soft, textAlign: "center", padding: "26px 10px", lineHeight: 1.55 }}>
                  There is nothing here we can quote yet. Fridge spaces, windows and doorways are there to
                  plan around, not things we make. Add a cabinet, a panel or a shelf and come back.
                </p>
              ) : (
                <>
                  <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                    <PresetCard
                      active={preset === "everything"}
                      title="The whole design"
                      blurb="Cabinets, doors, drawer fronts, panels and kickboards. We build the lot."
                      count={`${everythingCount} parts`}
                      onClick={() => setSelection(buildPreset(quotable, "everything"))}
                    />
                    <PresetCard
                      active={preset === "fronts"}
                      title="Fronts and panels only"
                      blurb="Doors, drawer fronts, panels and kickboards. You keep the cabinets you have."
                      count={`${frontsCount} parts`}
                      onClick={() => setSelection(buildPreset(quotable, "fronts"))}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 11, borderBottom: `1px solid ${C.edge}` }}>
                    <span style={{ fontSize: 12, color: C.soft, flex: 1 }}>
                      Or tap any part below to add or remove it.
                    </span>
                    <button type="button" style={{ ...btn, padding: "5px 10px", fontSize: 12.5 }} onClick={() => setSelection({})}>
                      Clear all
                    </button>
                  </div>

                  {ownedCount > 0 && (
                    <div style={{ border: "1px solid #d8cfae", background: "#fdfaf0", borderRadius: 11, padding: "11px 13px", marginBottom: 13 }}>
                      <strong style={{ display: "block", fontSize: 13, color: C.ink, marginBottom: 3 }}>
                        {ownedCount} cabinet{ownedCount === 1 ? "" : "s"} you already own
                      </strong>
                      <span style={{ fontSize: 12, color: "#7a6f4e", lineHeight: 1.45 }}>
                        Marked <em>Your own</em> below. We make the doors and panels that go on them, so the
                        cabinet itself is not listed as something to price.
                      </span>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))", gap: 11 }}>
                    {quotable.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        selection={selection}
                        onTogglePart={togglePart}
                        onAll={selectAllOn}
                        onNone={clearItem}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: `1px solid ${C.edge}`, background: "#fcfbf8" }}>
              <button type="button" style={btn} onClick={onClose}>Back to my design</button>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: chosenParts ? C.soft : "#a03f2c" }}>
                {chosenParts
                  ? `${chosenParts} part${chosenParts === 1 ? "" : "s"} from ${chosenItems.length} item${chosenItems.length === 1 ? "" : "s"}`
                  : "Nothing selected yet"}
              </span>
              <button type="button" style={btnPrimary} disabled={!chosenParts} onClick={() => { setError(""); setStep("details"); }}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === "details" && (
          <>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 0 }}>
              <div className="pcdRq">
                <div className="pcdRqFromDesign">
                  <p>
                    These <strong>{reviewLines.length} line{reviewLines.length === 1 ? "" : "s"}</strong> come
                    from the {chosenItems.length} item{chosenItems.length === 1 ? "" : "s"} you picked in your
                    design. Check them over, then add your details below.
                  </p>
                  <button type="button" style={{ ...btn, padding: "5px 10px", fontSize: 12.5 }} onClick={() => setStep("choose")}>
                    Change what we quote
                  </button>
                </div>

                <div className="pcdRqTop">
                  <div className="pcdRqCard">
                    <span className="pcdRqLabel">Your details</span>
                    <div className="pcdRqGrid">
                      <div className="pcdRqField">
                        <label htmlFor="pcdFirstName">First name</label>
                        <input
                          id="pcdFirstName"
                          value={form.firstName}
                          placeholder="Sarah"
                          className={error && !form.firstName.trim() ? "pcdRqInputError" : ""}
                          onChange={(e) => upd("firstName", e.target.value)}
                        />
                      </div>
                      <div className="pcdRqField">
                        <label htmlFor="pcdLastName">Last name</label>
                        <input id="pcdLastName" value={form.lastName} placeholder="Jones" onChange={(e) => upd("lastName", e.target.value)} />
                      </div>
                    </div>
                    <div className="pcdRqGrid">
                      <div className="pcdRqField">
                        <label htmlFor="pcdPhone">Phone</label>
                        <input id="pcdPhone" type="tel" value={form.phone} placeholder="0400 000 000" onChange={(e) => upd("phone", e.target.value)} />
                      </div>
                      <div className="pcdRqField">
                        <label htmlFor="pcdEmail">Email</label>
                        <input id="pcdEmail" type="email" value={form.email} placeholder="sarah@email.com" onChange={(e) => upd("email", e.target.value)} />
                      </div>
                    </div>
                    <div className="pcdRqGrid">
                      <div className="pcdRqField">
                        <label htmlFor="pcdSuburb">Delivery suburb</label>
                        <input id="pcdSuburb" value={form.suburb} placeholder="e.g. Subiaco" onChange={(e) => upd("suburb", e.target.value)} />
                      </div>
                      {/* The website form asks for this. Here the design already
                          answers it, so it is shown rather than asked. */}
                      <div className="pcdRqField">
                        <label htmlFor="pcdBrand">Cabinet brand</label>
                        <input id="pcdBrand" value={cabinetBrand} readOnly disabled />
                      </div>
                    </div>
                  </div>

                  <div className="pcdRqCard">
                    <span className="pcdRqLabel">Contact us directly</span>
                    <div className="pcdRqInfoRow">
                      <span>Phone</span>
                      <strong><a href="tel:0437750990">0437 750 990</a></strong>
                      <small>Best for urgent enquiries</small>
                    </div>
                    <div className="pcdRqInfoRow">
                      <span>Email</span>
                      <strong><a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a></strong>
                    </div>
                    <div className="pcdRqInfoRow">
                      <span>Response time</span>
                      <strong>Within 1-3 business days</strong>
                    </div>
                  </div>

                  <div className="pcdRqCardDark">
                    <span className="pcdRqLabel">What happens next</span>
                    {[
                      "We review your request within 1-3 business days.",
                      "We confirm all dimensions and specs before anything is made.",
                      "You receive a clear itemised quote with no hidden costs.",
                      "Once approved we confirm your lead time and keep you updated.",
                    ].map((text) => (
                      <div className="pcdRqPromise" key={text}>
                        <span className="pcdRqDot" />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <span className="pcdRqLabel">Products</span>
                <div className="pcdRqTableWrap">
                  <div className="pcdRqBar">
                    <span>Line items - {reviewLines.length} from your design</span>
                    <button type="button" className="pcdRqBarBtn" onClick={() => setStep("choose")}>
                      Change selection
                    </button>
                  </div>

                  {reviewLines.length ? (
                    <>
                      <div className="pcdRqHead">
                        <div>Item</div><div>Material</div><div>Size</div><div>Finish / colour</div><div>Qty</div><div>Actions</div>
                      </div>
                      {reviewLines.map((line, index) => (
                        <ReviewRow
                          key={`${line.itemId}-${line.partKey}-${index}`}
                          line={line}
                          index={index}
                          onRemove={() => removePart(line.itemId, line.partKey)}
                        />
                      ))}
                    </>
                  ) : (
                    <div className="pcdRqEmpty">
                      <strong>Nothing left to quote.</strong>
                      <span>
                        You have removed every line. Add something back with Change selection, or close this
                        and keep designing.
                      </span>
                    </div>
                  )}
                </div>

                <div className="pcdRqBottom">
                  <div className="pcdRqCard">
                    <span className="pcdRqLabel">Additional notes</span>
                    <div className="pcdRqField">
                      <label htmlFor="pcdNotes">Anything else we should know?</label>
                      <textarea
                        id="pcdNotes"
                        value={form.notes}
                        placeholder="e.g. timing requirements, access, or anything else that helps us give you an accurate quote"
                        onChange={(e) => upd("notes", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="pcdRqTip">
                    <span className="pcdRqLabel">Before you send</span>
                    <p>Sizes shown are what we would make, worked out from your design rather than the cabinet size.</p>
                    <p>A cabinet line shows no size because it is priced from its cut list, not as a flat sheet.</p>
                    {/* Said once, quietly, so nobody is surprised that the
                        kickboard they chose is written up as a Panel. */}
                    <p>Kickboards, end panels and fillers are quoted as <strong>Panels</strong>, which is how flat board is cut and priced.</p>
                    <p>Anything you remove here stays in your saved design, it just will not be quoted.</p>
                  </div>
                </div>

                {/* Named cabinet by cabinet, because "choose a colour" on its
                    own leaves them hunting through the design for which one. */}
                {missingColour.length ? (
                  <div className="pcdRqBlocked">
                    <strong>Choose a colour before you send</strong>
                    <ul>
                      {missingColour.map((entry) => (
                        <li key={entry.label}>{entry.label}: {entry.parts.join(", ")}</li>
                      ))}
                    </ul>
                    <p>Close this, click the cabinet in your design and pick a colour, then come back.</p>
                  </div>
                ) : null}

                {error ? <p className="pcdRqErr">{error}</p> : null}
                <button type="button" className="pcdRqSubmit" disabled={busy || !canSend} onClick={submit}>
                  {busy ? "Sending…" : "Send my request"}
                </button>
                <p className="pcdRqNote">
                  No obligation. We will confirm every dimension with you before anything is made.
                </p>
              </div>
            </div>

            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: `1px solid ${C.edge}`, background: "#fcfbf8" }}>
              <button type="button" style={btn} onClick={() => setStep("choose")}>Back</button>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: C.soft }}>
                {reviewLines.length} line{reviewLines.length === 1 ? "" : "s"} ready
              </span>
              <button type="button" style={btnPrimary} disabled={busy || !canSend} onClick={submit}>
                {busy ? "Sending…" : "Send my request"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
              <div style={{ fontSize: 32 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Thanks! We&apos;ve got your design.</div>
              <div style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>
                We&apos;ll price the {reviewLines.length} line{reviewLines.length === 1 ? "" : "s"} you sent and get back to you,
                usually within 1 to 3 business days. Your design stays saved under its link.
              </div>
            </div>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: `1px solid ${C.edge}`, background: "#fcfbf8" }}>
              <button type="button" style={btn} onClick={() => { setStep("choose"); setError(""); }}>Send something else</button>
              <span style={{ flex: 1 }} />
              <button type="button" style={btnPrimary} onClick={onClose}>Back to my design</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function BottomSheet({ children, onClose, title = "" }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 7 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.28)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "min(78vh, 680px)", display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff", borderRadius: "16px 16px 0 0", boxShadow: "0 -10px 30px rgba(0,0,0,0.2)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div style={{ flexShrink: 0, padding: "10px 14px 8px", borderBottom: `1px solid ${C.edge}` }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: C.edge, margin: "0 auto 10px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <strong style={{ minWidth: 0, fontSize: 14, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</strong>
            <button type="button" onClick={onClose} aria-label="Close" style={{ ...btn, width: 34, height: 34, padding: 0, flexShrink: 0 }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {children}
        </div>
      </div>
    </div>
  );
}

function FullScreenConfigModal({ children, onClose, title = "" }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ position: "absolute", inset: 0, zIndex: 40, background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <div style={{ position: "sticky", top: 0, zIndex: 2, flexShrink: 0, background: "#fff", borderBottom: `1px solid ${C.edge}`, padding: "max(12px, env(safe-area-inset-top)) 14px 10px", display: "flex", alignItems: "center", gap: 12 }}>
        <strong style={{ minWidth: 0, flex: 1, fontSize: 15, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</strong>
        <button type="button" onClick={onClose} aria-label="Close" style={{ ...btn, width: 38, height: 38, padding: 0, flexShrink: 0 }}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function ItemPanel({ item, items = [], room = null, onUpdate, onDuplicate, onDelete, onDeselect, colourImages, onChangeColour, showHeader = true }) {
  const shelf = isShelf(item);
  const bookcase = isBookcase(item);
  const shelfRail = isShelfRail(item);
  const roomRef = isRoomReference(item);
  const panel = isPanel(item);
  // A standard-size prop the customer already owns. It is an ordinary cabinet
  // in every respect except two: the box is fixed, and we never quote it.
  const preset = isIkeaPreset(item);
  // Anything that isn't cabinetry gets a size-only panel: no front style, no
  // finishing panels, no benchtop.
  const simple = roomRef || panel;
  const corner = isCorner(item);
  const floor = FLOOR_TYPES.has(item.item_type);
  const wall = item.item_type === "wall_cabinet";
  const targets = targetsFor(item);
  const set = (patch) => onUpdate(item.id, patch);
  const [open, setOpen] = useState("colour"); // one section open at a time, Colour first

  const [duplicating, setDuplicating] = useState(false);

  async function handleDuplicate() {
    if (duplicating || !onDuplicate) return;
    setDuplicating(true);
    try {
      await onDuplicate();
    } finally {
      setDuplicating(false);
    }
  }

  const isDrawers = item.front_type === "drawers";
  const isOpen = isOpenFront(item);
  const isBays = item.front_type === "mixed";
  const canBays = CAN_BAYS.has(item.item_type);
  const bays = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
  const doorBays = bays
    .map((bay, index) => ({ bay, index }))
    .filter(({ bay }) => bay.type === "doors");

  // ---- Multi-bay ("mixed" front) helpers ----
  // A bay is either a SHARE of the cabinet height (height_pct) or PINNED to
  // real millimetres (height_lock_mm), an oven bay is 600mm however tall the
  // cabinet is. withResolvedBayHeights turns whichever it is into the real
  // height_mm that the elevation, the cut list and the quote all read, so the
  // sizing rule lives in one place shared with the admin tool.
  // height_pct is printed to the customer as a PERCENTAGE, so the share bays
  // have to add up to 100. resolveBayHeightsMm divides each share by whatever
  // they happen to total, so it never complains: 50 and 99 quietly render as
  // 34% and 66%, and the panel then shows two numbers that are not the shares
  // the cabinet actually got. Normalising here, on every commit, is what keeps
  // the number on screen and the height on the drawing the same thing.
  const withNormalisedShares = (secs) => {
    const shareIdx = secs.map((_, i) => i).filter((i) => !bayIsPinned(secs[i]));
    if (!shareIdx.length) return secs;
    const pctOf = (s) => (Number(s?.height_pct) > 0 ? Number(s.height_pct) : 0);
    const total = shareIdx.reduce((sum, i) => sum + pctOf(secs[i]), 0);
    const next = secs.map((s) => ({ ...s }));
    shareIdx.forEach((i) => {
      const raw = total > 0 ? (pctOf(secs[i]) * 100) / total : 100 / shareIdx.length;
      next[i].height_pct = Math.max(0.1, Math.round(raw * 10) / 10);
    });
    // A tenth or two goes missing to rounding. It lands on the last share bay,
    // so the column always reads exactly 100.
    const last = shareIdx[shareIdx.length - 1];
    const drift = 100 - shareIdx.reduce((sum, i) => sum + next[i].height_pct, 0);
    if (drift !== 0) next[last].height_pct = Math.max(0.1, Math.round((next[last].height_pct + drift) * 10) / 10);
    return next;
  };

  const withEqualHeights = (secs, heightMm = item.height_mm) => {
    const share = secs.filter((s) => !bayIsPinned(s));
    const evenPct = Math.round(1000 / Math.max(1, share.length)) / 10;
    // A bay that has never been sized takes an even share of what's left,
    // rather than inheriting whatever millimetres it happened to have.
    const seeded = secs.map((s) => (bayIsPinned(s) || Number(s.height_pct) > 0 ? s : { ...s, height_pct: evenPct }));
    return withResolvedBayHeights(withNormalisedShares(seeded), heightMm);
  };
  // heights_mm are real OPENING heights everywhere else in the tool: the
  // elevation, the cut list and the quote importer all subtract a reveal from
  // them IN MILLIMETRES. The bay editor only knows "how many drawers", so the
  // count is converted to real heights here, at commit, against the section
  // height that withEqualHeights just worked out.
  //
  // Storing the count as [1, 1, 1] made every front (1mm − 3mm reveal) clamp to
  // zero: the drawers vanished from the elevation, and worse, they imported as
  // 0mm-high drawer fronts priced at nothing.
  const withDrawerHeights = (sec) => {
    if (sec.type !== "drawers") return sec;
    const n = Math.max(1, (sec.drawer?.heights_mm || []).length || 1);
    return { ...sec, drawer: { ...(sec.drawer || {}), heights_mm: equalDrawers(sec.height_mm, n) } };
  };
  const commitBays = (secs) => set({ front_type: "mixed", section_config: { sections: withEqualHeights(secs).map(withDrawerHeights) } });
  const bayForType = (type) =>
    type === "doors" ? { type: "doors", door: { columns: 1, rows: 1 } }
      : type === "drawers" ? { type: "drawers", drawer: { heights_mm: [1] } }
      // An oven is a real size, so its bay pins itself to that size instead of
      // taking an even share and ending up too tall to be useful.
      : type === "appliance" ? { type: "appliance", appliance: "oven", height_lock_mm: applianceBayHeightMm("oven") }
      : { type };
  const bayCount = (b) => (b.type === "doors" ? Math.max(1, b.door?.columns || 1) : b.type === "drawers" ? ((b.drawer?.heights_mm || []).length || 1) : 0);
  const addBay = () => commitBays([...bays, bayForType("doors")]);
  const removeBay = (i) => commitBays(bays.filter((_, x) => x !== i));
  const setBayType = (i, type) => commitBays(bays.map((b, x) => (x === i ? bayForType(type) : b)));
  const setBayCount = (i, n) => commitBays(bays.map((b, x) => {
    if (x !== i) return b;
    if (b.type === "doors") {
      const opening = doorOpeningValue(b.door || {});
      return { ...b, door: { ...(b.door || {}), columns: n, rows: 1, hinges: hingesForDoorOpening(opening, n) } };
    }
    if (b.type === "drawers") return { ...b, drawer: { ...(b.drawer || {}), heights_mm: Array.from({ length: n }, () => 1) } };
    return b;
  }));
  // Shelves live on the bay itself, not on the cabinet, so two open bays can
  // hold different numbers, spread evenly inside their own bay.
  const setBayShelves = (i, n) => commitBays(bays.map((b, x) => (x === i ? { ...b, shelf_qty: n } : b)));
  // Typing a share re-sizes this bay; the other share bays give up or take back
  // the difference. Pinned bays never move.
  // Typing 60 into one of two bays makes the other 40. The rest of the share
  // bays give up (or take back) the difference between them, in proportion to
  // what they had, so a 50/25/25 split typed to 60 becomes 60/20/20 rather than
  // one bay absorbing the whole change.
  const setBaySharePct = (i, pct) => {
    const target = Math.max(1, Math.min(99, Number(pct) || 0));
    const others = bays.map((b, x) => ({ b, x })).filter(({ b, x }) => x !== i && !bayIsPinned(b));
    // The only share bay there is. It gets everything that is not pinned, so
    // its percentage is 100 whatever was typed.
    if (!others.length) {
      commitBays(bays.map((b, x) => (x === i ? { ...b, height_pct: 100 } : b)));
      return;
    }
    const pctOf = (b) => (Number(b?.height_pct) > 0 ? Number(b.height_pct) : 0);
    const otherTotal = others.reduce((sum, { b }) => sum + pctOf(b), 0);
    const remaining = 100 - target;
    const shares = new Map();
    others.forEach(({ b, x }) => {
      const raw = otherTotal > 0 ? (remaining * pctOf(b)) / otherTotal : remaining / others.length;
      shares.set(x, Math.max(0.1, Math.round(raw * 10) / 10));
    });
    commitBays(bays.map((b, x) => {
      if (x === i) return { ...b, height_pct: target };
      return shares.has(x) ? { ...b, height_pct: shares.get(x) } : b;
    }));
  };
  const setBayFixedMm = (i, mm) => commitBays(bays.map((b, x) => (x === i ? { ...b, height_lock_mm: Math.max(1, mm) } : b)));
  // Pinning captures the height the bay has right now so the cabinet doesn't
  // jump the instant the lock is clicked, and unpinning hands it straight back
  // as a share, for the same reason.
  const setBayPinned = (i, pinned) => commitBays(bays.map((b, x) => {
    if (x !== i) return b;
    const mm = Math.max(1, Math.round(Number(b.height_mm) || 0));
    return pinned
      ? { ...b, height_lock_mm: mm }
      : { ...b, height_lock_mm: 0, height_pct: bayPercentOfCabinet(mm, item.height_mm) || Math.round(1000 / Math.max(1, bays.length)) / 10 };
  }));
  const setBayDoorOpening = (i, opening) => commitBays(bays.map((b, x) => (
    x === i && b.type === "doors"
      ? { ...b, door: doorConfigPatchForOpening(b.door || {}, opening) }
      : b
  )));

  // Changing the cabinet's height has to carry its front layout with it. The
  // bay section heights and the drawer opening heights are stored in real mm
  // and read as authoritative by the cut list and the importer, so leaving them
  // at the old height quietly quotes the wrong panel sizes, the elevation
  // wouldn't show it, since it scales the bays to whatever they sum to.
  const setCabinetHeight = (v) => {
    if (isBays && bays.length) {
      set({ height_mm: v, section_config: { sections: withEqualHeights(bays, v).map(withDrawerHeights) } });
      return;
    }
    if (isDrawers) {
      const n = (item.drawer_config?.heights_mm || []).length || 3;
      set({ height_mm: v, drawer_config: { ...(item.drawer_config || {}), heights_mm: equalDrawers(v, n) } });
      return;
    }
    set({ height_mm: v });
  };

  function setFront(type) {
    if (type === "drawers") set({ front_type: "drawers", drawer_config: { ...(item.drawer_config || {}), heights_mm: equalDrawers(item.height_mm, Math.max(2, (item.drawer_config?.heights_mm || []).length || 3)) } });
    else if (type === "open") set({ front_type: "none", shelf_qty: Number(item.shelf_qty) > 0 ? item.shelf_qty : 3 });
    else if (type === "bays") commitBays(bays.length ? bays : [bayForType("drawers"), bayForType("doors")]);
    else set({ front_type: "doors", door_config: item.door_config || { columns: 1, rows: 1 } });
  }

  const doorCount = Math.max(1, item.door_config?.columns || 1);
  const doorOpening = doorOpeningValue(item.door_config || {});
  const drawerCount = (Array.isArray(item.drawer_config?.heights_mm) && item.drawer_config.heights_mm.length) || 3;
  const shelfCount = Number(item.shelf_qty) || 0;
  const fingerOn = isDrawers ? !!item.drawer_config?.gap_enabled : !!item.door_config?.row_gap_enabled;
  const setDoorCount = (n) => {
    const cfg = item.door_config || {};
    set({ front_type: "doors", door_config: { ...cfg, columns: n, rows: 1, hinges: hingesForDoorOpening(doorOpening, n) } });
  };
  const setDoorOpening = (opening) => set({ front_type: "doors", door_config: doorConfigPatchForOpening(item.door_config || {}, opening) });
  const setDrawerCount = (n) => set({ front_type: "drawers", drawer_config: { ...(item.drawer_config || {}), heights_mm: equalDrawers(item.height_mm, n) } });
  const setShelfCount = (n) => set({ shelf_qty: n });
  const setFinger = (on) => (isDrawers
    ? set({ drawer_config: { ...(item.drawer_config || {}), gap_enabled: on } })
    : set({ door_config: { ...(item.door_config || {}), row_gap_enabled: on } }));
  const frontValue = isBays ? "bays" : isOpen ? "open" : isDrawers ? "drawers" : "doors";
  const bayShelves = bayShelfCount(item);
  const styleSummary = isBays
    ? `${bays.length} bay${bays.length === 1 ? "" : "s"}${bayShelves ? ` · ${bayShelves} shelf${bayShelves === 1 ? "" : "ves"}` : ""}`
    : `${isOpen ? `Open · ${shelfCount} shelf${shelfCount === 1 ? "" : "ves"}` : isDrawers ? `${drawerCount} drawers` : `${doorCount} door${doorCount > 1 ? "s" : ""}`}${!isOpen && fingerOn ? " · finger pull" : ""}`;

  // A Shelf & Rail's height is derived (cleat + board), so a size change has to
  // carry the new height_mm, every measuring consumer reads that column. The
  // supports are re-detected from the plan at the same time, which is the only
  // moment the public tool has enough context to know what it's spanning.
  function setShelfRailSize(patch) {
    const next = { ...item, ...patch };
    const found = detectSupports(next, items, room);
    set({
      ...patch,
      height_mm: shelfRailHeightMm(next),
      shelf_rail_config: { ...shelfRailConfig(next), left_support: found.left, right_support: found.right },
    });
  }
  // Guidance, not a trade warning, a customer can't act on "add a mid gable".
  const spanNote = shelfRail && Number(item.width_mm) > spanLimitMm(item)
    ? "That's a wide span for a shelf. We'll add a support when we work up your quote. No need to change anything."
    : null;

  const anyFinishPanel = item.end_panel_left || item.end_panel_right || item.has_back_panel || item.has_bottom_panel || item.has_top_panel || item.has_filler_panel;
  const panelCount = [item.has_kickboard, item.end_panel_left, item.end_panel_right, item.has_back_panel, item.has_bottom_panel, item.has_top_panel, item.has_filler_panel].filter(Boolean).length;
  const sizeSummary = shelfRail
    ? `${item.width_mm || "?"} span · ${item.depth_mm || "?"} deep · ${shelfTopMm(item)} high`
    : panel
    ? `${item.depth_mm || "?"}×${item.height_mm || "?"} mm`
    : `${shelf ? `${item.width_mm || "?"}×${item.depth_mm || "?"}` : `${item.width_mm || "?"}×${item.height_mm || "?"}×${item.depth_mm || "?"}`} mm`;

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {showHeader && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          {/* A prop carries its own name ("IKEA Metod 600 × 800"), which is more
              use than the generic type it happens to be built on. */}
          <strong style={{ fontSize: 14, color: C.ink }}>{item.label || TYPE_LABELS[item.item_type] || "Cabinet"}</strong>
          <button type="button" onClick={onDeselect} style={{ border: "none", background: "none", cursor: "pointer", color: C.soft, fontSize: 13 }}>Done</button>
        </div>
      )}

      {/* Said once, up front, so nobody configures a whole run of props and only
          finds out at the send screen. The send screen repeats it with counts. */}
      {preset && (
        <div style={{ padding: "9px 11px", borderRadius: 8, background: "#fdf6e7", border: "1px solid #e8d9b0", fontSize: 12, color: "#7a5c1e", lineHeight: 1.45 }}>
          <strong style={{ display: "block" }}>This is a cabinet you already own.</strong>
          We don&apos;t supply it, so it won&apos;t be quoted. The doors, fronts and panels you put on it will be.
        </div>
      )}

      {/* Colour & finish, each surface opens the brand→finish→colour chooser.
          Hidden entirely for a room reference, which has no surfaces. */}
      {targets.length > 0 && (
      <AccSection k="colour" label="Colour & finish" openKey={open} setOpen={setOpen}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {targets.map((t) => {
            const slot = slotForTarget(item, t.key);
            const nm = slotColourFields(item, slot).colour;
            // On a prop the carcass row is the customer's own cabinet, so it
            // reads from the IKEA finish rather than a library selection.
            const propBody = preset && t.key === "body";
            return (
              <ColourRow key={t.key}
                label={propBody ? "Your cabinet" : t.label}
                src={resolveColourSrc(colourImages, item, slot)}
                name={propBody
                  ? (item.prop_carcass_finish || "Tap Change to match yours")
                  : (nm || (t.key === "body" ? "White (standard)" : "Standard"))}
                hex={propBody
                  ? (ikeaCarcassHex(item.prop_carcass_finish) || item.colour_hex)
                  : (t.key === "body" ? item.colour_hex : null)}
                onChange={() => onChangeColour(t.key)} />
            );
          })}
        </div>
      </AccSection>
      )}

      {/* A room reference, a fridge space, a window, a doorway. Size and, where
          it applies, how high off the floor. Nothing is made, so nothing else
          is asked. */}
      {roomRef && (
        <AccSection k="size" label="Size" summary={sizeSummary} openKey={open} setOpen={setOpen}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <NumberField label="Width" value={item.width_mm} onCommit={(v) => set({ width_mm: v })} />
            <NumberField label="Height" value={item.height_mm} onCommit={(v) => set({ height_mm: v })} />
            <NumberField label="Depth" value={item.depth_mm} onCommit={(v) => set({ depth_mm: v })} />
          </div>
          {item.item_type === "window" && (
            <div style={{ marginTop: 8 }}>
              <NumberField label="Sill height off floor (mm)" value={item.mount_height_mm} onCommit={(v) => set({ mount_height_mm: v })} />
            </div>
          )}
          <p style={{ marginTop: 10, fontSize: 11.5, color: C.soft, lineHeight: 1.45 }}>
            Shown so we can see the room properly. It isn&apos;t part of the quote.
          </p>
        </AccSection>
      )}

      {/* A standalone panel. The face width lives in depth_mm, the form just
          calls it width, so nobody has to know that. */}
      {panel && (
        <AccSection k="size" label="Size" summary={sizeSummary} openKey={open} setOpen={setOpen}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <NumberField label="Width" value={item.depth_mm} onCommit={(v) => set({ depth_mm: v })} />
            <NumberField label="Height" value={item.height_mm} onCommit={(v) => set({ height_mm: v })} />
          </div>
          <div style={{ marginTop: 8 }}>
            <NumberField label="Height off floor (mm)" value={item.mount_height_mm} onCommit={(v) => set({ mount_height_mm: v })} />
          </div>
        </AccSection>
      )}

      {/* Shelf & Rail, span, depth and height, nothing else. The cleats, the
          front rail and what each end lands on are settled by us, not here. */}
      {shelfRail && (
        <AccSection k="size" label="Size & height" summary={sizeSummary} openKey={open} setOpen={setOpen}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <NumberField label="Span" value={item.width_mm} onCommit={(v) => setShelfRailSize({ width_mm: v })} />
            <NumberField label="Depth" value={item.depth_mm} onCommit={(v) => setShelfRailSize({ depth_mm: v })} />
          </div>
          <div style={{ marginTop: 8 }}>
            <NumberField label="Shelf height off floor (mm)" value={shelfTopMm(item)}
              onCommit={(v) => set({ mount_height_mm: mountForShelfTopMm(item, v) })} />
          </div>
          {spanNote && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "#fdf6e7", border: "1px solid #e8d9b0", fontSize: 12, color: "#7a5c1e", lineHeight: 1.45 }}>
              {spanNote}
            </div>
          )}
        </AccSection>
      )}

      {/* Shelves, a bookcase is always open, so it gets the shelf count on its
          own rather than the doors/drawers/open picker every cabinet shows. */}
      {bookcase && (
        <AccSection k="style" label="Shelves" summary={`${shelfCount} shelf${shelfCount === 1 ? "" : "ves"}`} openKey={open} setOpen={setOpen}>
          <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>How many shelves?</div>
          <Segmented
            value={String(shelfCount)}
            options={[2, 3, 4, 5, 6].map((n) => ({ v: String(n), label: String(n) }))}
            onChange={(v) => setShelfCount(Number(v))}
          />
        </AccSection>
      )}

      {/* Style */}
      {!shelf && !corner && !bookcase && !shelfRail && !simple && (
        <AccSection k="style" label="Style" summary={styleSummary} openKey={open} setOpen={setOpen}>
          <Segmented
            value={frontValue}
            options={[
              { v: "doors", label: "Doors" },
              { v: "drawers", label: "Drawers" },
              { v: "open", label: "Open" },
              ...(canBays ? [{ v: "bays", label: "Bays" }] : []),
            ]}
            onChange={setFront}
          />
          {isBays ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 8 }}>Bays, top to bottom</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bays.map((b, i) => {
                  const pinned = bayIsPinned(b);
                  const bayMm = Math.round(Number(b.height_mm) || 0);
                  return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: C.soft, width: 12, flexShrink: 0 }}>{i + 1}</span>
                      <select className="pcdSelect pcdSelect--compact" value={b.type || "doors"} onChange={(e) => setBayType(i, e.target.value)} style={{ ...btn, flex: 1, minWidth: 0, padding: "5px 6px", paddingRight: 26, fontSize: 12, cursor: "pointer" }}>
                        <option value="doors">Doors</option>
                        <option value="drawers">Drawers</option>
                        <option value="appliance">Oven</option>
                        <option value="open">Open</option>
                      </select>
                      {(b.type === "doors" || b.type === "drawers") && (
                        <select className="pcdSelect pcdSelect--compact" value={String(bayCount(b))} onChange={(e) => setBayCount(i, Number(e.target.value))} style={{ ...btn, width: 58, flexShrink: 0, padding: "5px 6px", paddingRight: 26, fontSize: 12, cursor: "pointer" }}>
                          {(b.type === "doors" ? [1, 2] : [1, 2, 3, 4]).map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      )}
                      {/* An open bay holds shelves instead of fronts. */}
                      {b.type === "open" && (
                        <select value={String(Number(b.shelf_qty) || 0)} onChange={(e) => setBayShelves(i, Number(e.target.value))}
                          title="Shelves in this bay"
                          className="pcdSelect pcdSelect--compact" style={{ ...btn, width: 86, flexShrink: 0, padding: "5px 6px", paddingRight: 26, fontSize: 12, cursor: "pointer" }}>
                          {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? "no shelf" : `${n} shelf${n === 1 ? "" : "s"}`}</option>)}
                        </select>
                      )}
                      <button type="button" onClick={() => removeBay(i)} disabled={bays.length <= 1}
                        title="Remove this bay"
                        style={{ border: "none", background: "none", cursor: bays.length <= 1 ? "default" : "pointer", color: bays.length <= 1 ? "#ccc" : "#a03f2c", fontSize: 14, padding: "0 2px", flexShrink: 0 }}>✕</button>
                    </div>
                    {/* How tall this bay is: a share of the cabinet, or locked
                        to real millimetres for something like an oven. */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", paddingLeft: 18 }}>
                      {pinned ? (
                        <BayNumber value={Math.round(Number(b.height_lock_mm) || 0)} min={1}
                          onCommit={(v) => setBayFixedMm(i, v)}
                          title="Fixed height in millimetres" />
                      ) : (
                        <BayNumber value={Number(b.height_pct) > 0 ? Number(b.height_pct) : bayPercentOfCabinet(bayMm, item.height_mm)}
                          min={1} max={99}
                          onCommit={(v) => setBaySharePct(i, v)}
                          title="Share of the cabinet height. The other bays take the rest." />
                      )}
                      <span style={{ fontSize: 11, color: C.soft, flexShrink: 0 }}>{pinned ? "mm" : "%"}</span>
                      <button type="button" onClick={() => setBayPinned(i, !pinned)}
                        title={pinned ? "Fixed height. Click to size by share instead" : "Share of the cabinet. Click to fix this height"}
                        style={{ ...btn, padding: "4px 8px", fontSize: 11, cursor: "pointer", flexShrink: 0, color: pinned ? C.ink : C.soft }}>
                        {pinned ? "🔒 Fixed" : "🔓 Share"}
                      </button>
                      <span style={{ fontSize: 11, color: C.soft, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pinned ? `${bayPercentOfCabinet(bayMm, item.height_mm)}% of cabinet` : `${bayMm}mm`}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>
              <button type="button" onClick={addBay} style={{ ...btn, marginTop: 8, width: "100%", fontSize: 12 }}>+ Add bay</button>
              <p style={{ fontSize: 11, color: C.soft, margin: "6px 0 0", lineHeight: 1.45 }}>
                {bays.some(bayIsPinned)
                  ? "Fixed bays keep their millimetres. The rest share whatever height is left, so changing the cabinet height only moves those."
                  : "Bays share the cabinet height. Set one to Fixed to hold it at an exact size, an oven bay for example."}
              </p>
              {doorBays.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.edge}`, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, color: C.soft }}>Door config</div>
                  {doorBays.map(({ bay, index }) => (
                    <label key={index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12, color: C.ink }}>
                      <span>Bay {index + 1} doors</span>
                      <select
                        value={doorOpeningValue(bay.door || {})}
                        onChange={(e) => setBayDoorOpening(index, e.target.value)}
                        className="pcdSelect pcdSelect--compact" style={{ ...btn, width: 128, padding: "6px 8px", paddingRight: 26, fontSize: 12, cursor: "pointer" }}
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="centre">Centre</option>
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : isOpen ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>How many shelves?</div>
              <Segmented value={String(shelfCount)} options={[{ v: "0", label: "0" }, { v: "1", label: "1" }, { v: "2", label: "2" }, { v: "3", label: "3" }, { v: "4", label: "4" }]} onChange={(v) => setShelfCount(Number(v))} />
            </div>
          ) : isDrawers ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>How many drawers?</div>
              <Segmented value={String(drawerCount)} options={[{ v: "2", label: "2" }, { v: "3", label: "3" }, { v: "4", label: "4" }]} onChange={(v) => setDrawerCount(Number(v))} />
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>How many doors?</div>
              <Segmented value={String(doorCount)} options={[{ v: "1", label: "1" }, { v: "2", label: "2" }]} onChange={(v) => setDoorCount(Number(v))} />
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.soft, marginTop: 10 }}>
                Doors open from
                <select className="pcdSelect" value={doorOpening} onChange={(e) => setDoorOpening(e.target.value)} style={{ ...btn, padding: "7px 8px", paddingRight: 40, fontSize: 13, color: C.ink, cursor: "pointer" }}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="centre">Centre</option>
                </select>
              </label>
            </div>
          )}
          {!isOpen && !isBays && (
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${C.edge}` }}>
              <Toggle label="Finger pull (handleless)" checked={fingerOn} onChange={setFinger} />
            </div>
          )}
        </AccSection>
      )}

      {/* Panels & finishing, a bookcase's sides and back are already finished
          board on show, so the only thing left to choose is the kickboard. */}
      {bookcase && (
        <AccSection k="panels" label="Base" summary={item.has_kickboard ? "Kickboard" : "On the floor"} openKey={open} setOpen={setOpen}>
          <KickboardToggle item={item} set={set} />
        </AccSection>
      )}

      {/* Panels & finishing */}
      {!shelf && !bookcase && !shelfRail && !simple && (
        <AccSection k="panels" label="Panels & finishing" summary={`${panelCount} on`} openKey={open} setOpen={setOpen}>
          {floor && <KickboardToggle item={item} set={set} />}
          {corner ? (
            <>
              <Toggle label="Wall 1 end panel" checked={item.end_panel_left} onChange={(v) => set({ end_panel_left: v })} />
              <Toggle label="Wall 2 end panel" checked={item.end_panel_right} onChange={(v) => set({ end_panel_right: v })} />
            </>
          ) : (
            <>
              <Toggle label="Left side panel" checked={item.end_panel_left} onChange={(v) => set({ end_panel_left: v })} />
              <Toggle label="Right side panel" checked={item.end_panel_right} onChange={(v) => set({ end_panel_right: v })} />
            </>
          )}
          {(item.item_type === "base_cabinet" || item.item_type === "tall_cabinet") && (
            <Toggle label="Finished back panel" checked={item.has_back_panel} onChange={(v) => set({ has_back_panel: v })} />
          )}
          {wall && <Toggle label="Top panel" checked={item.has_top_panel} onChange={(v) => set({ has_top_panel: v })} />}
          {wall && <Toggle label="Underside panel" checked={item.has_bottom_panel} onChange={(v) => set({ has_bottom_panel: v })} />}
          {FILLER_PANEL_TYPES.has(item.item_type) && <Toggle label="Top filler panel" checked={item.has_filler_panel} onChange={(v) => set({ has_filler_panel: v })} />}
          {anyFinishPanel && (floor || wall) && (
            <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.edge}` }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>Extend those panels:</div>
              {floor && <Toggle label="Down to the floor" checked={item.panel_to_floor} onChange={(v) => set({ panel_to_floor: v })} />}
              {(item.item_type === "tall_cabinet" || wall) && <Toggle label="Up to the ceiling" checked={item.panel_to_ceiling} onChange={(v) => set({ panel_to_ceiling: v })} />}
            </div>
          )}
          {item.item_type === "base_cabinet" && item.has_benchtop && (
            <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.edge}` }}>
              <div style={{ fontSize: 11, color: C.soft, marginBottom: 6 }}>Waterfall benchtop end (drops to the floor):</div>
              <Toggle label="Left end" checked={item.benchtop_waterfall_left} onChange={(v) => set({ benchtop_waterfall_left: v })} />
              <Toggle label="Right end" checked={item.benchtop_waterfall_right} onChange={(v) => set({ benchtop_waterfall_right: v })} />
            </div>
          )}
        </AccSection>
      )}

      {/* Size, a Shelf & Rail has its own Size & height section above, so it
          never reaches this one (its height is derived, not entered). */}
      {!shelfRail && !simple && (
      <AccSection k="size" label="Size" summary={sizeSummary} openKey={open} setOpen={setOpen}>
        {shelf ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <NumberField label="Length" value={item.width_mm} onCommit={(v) => set({ width_mm: v })} />
            <NumberField label="Depth" value={item.depth_mm} onCommit={(v) => set({ depth_mm: v })} />
            <NumberField label="Height" value={item.height_mm} onCommit={(v) => set({ height_mm: v })} />
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <NumberField label="Width" value={item.width_mm} onCommit={(v) => set({ width_mm: v })} readOnly={preset} />
              <NumberField label="Height" value={item.height_mm} onCommit={setCabinetHeight} readOnly={preset} />
              <NumberField label="Depth" value={item.depth_mm} onCommit={(v) => set({ depth_mm: v })} readOnly={preset} />
            </div>
            {corner && <div style={{ marginTop: 8 }}><NumberField label="Return width" value={item.secondary_width_mm} onCommit={(v) => set({ secondary_width_mm: v })} /></div>}
          </>
        )}
        {/* Height off the floor is placement, not a size we cut to, so it stays
            editable on a prop: where someone hung their own cabinet is up to
            them. */}
        {(shelf || wall) && <div style={{ marginTop: 8 }}><NumberField label="Height off floor (mm)" value={item.mount_height_mm} onCommit={(v) => set({ mount_height_mm: v })} /></div>}
        {preset && (
          <p style={{ marginTop: 10, fontSize: 11.5, color: "#7a5c1e", lineHeight: 1.45 }}>
            Fixed at the standard size, because this cabinet is already in your room. Everything else
            about it is yours to change.
          </p>
        )}
      </AccSection>
      )}

      </div>
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.edge}`, background: "#fff", padding: "12px 12px max(12px, env(safe-area-inset-bottom))", display: "flex", gap: 8 }}>
        <button type="button" onClick={handleDuplicate} disabled={duplicating} style={{ ...btn, flex: 1, fontWeight: 600 }}>
          {duplicating ? "Duplicating..." : "Duplicate"}
        </button>
        <button type="button" onClick={onDelete} style={{ ...btn, flex: 1, color: "#a03f2c", borderColor: "#e0c3bb" }}>{shelf || shelfRail ? "Remove shelf" : bookcase ? "Remove bookcase" : panel ? "Remove panel" : roomRef ? "Remove" : "Remove cabinet"}</button>
      </div>
    </div>
  );
}

function AccSection({ k, label, summary, openKey, setOpen, children }) {
  const isOpen = openKey === k;
  return (
    <div style={{ border: `1px solid ${C.edge}`, borderRadius: 10, overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen(isOpen ? null : k)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", background: isOpen ? "#f7f5ef" : "#fff", border: "none", cursor: "pointer", font: "inherit" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{label}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>{isOpen ? "" : summary}</span>
        <span style={{ color: C.soft, fontSize: 12 }}>{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && <div style={{ padding: "8px 12px 14px" }}>{children}</div>}
    </div>
  );
}

// Carcass finishes for a cabinet the customer already owns. Nothing here is a
// product of ours, so it deliberately looks nothing like the colour library
// chooser: a short, flat list of what IKEA sells frames in, no brand or finish
// filters, and a line saying plainly why it is here.
function PropCarcassModal({ range, rangeLabel, current, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Only what this range is actually made in. Metod is white and nothing else,
  // so offering a choice there would invent one.
  const finishes = ikeaCarcassFinishesForRange(range);
  const only = finishes.length === 1;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
      <div role="dialog" aria-modal="true" aria-label="Which colour is your cabinet?"
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: "min(420px, 94vw)", maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: `1px solid ${C.edge}` }}>
          <strong style={{ fontSize: 15, color: C.ink }}>Which colour is your cabinet?</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.edge}`, background: "#fff", cursor: "pointer", color: C.soft }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>
            {only
              ? `${rangeLabel} frames only come in ${finishes[0].name}, so there is nothing to choose here. Shown so your plan looks like your room.`
              : `The frame you already own, so your plan looks like your room. These are ${rangeLabel} colours, not ours, and none of it is quoted.`}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 10 }}>
            {finishes.map((f) => {
              const on = String(current).toLowerCase() === f.name.toLowerCase();
              const src = ikeaCarcassSrc(f.name);
              return (
                <button key={f.name} type="button" onClick={() => onPick(f.name)}
                  style={{ padding: 0, border: `2px solid ${on ? C.green : C.edge}`, borderRadius: 10, background: "#fff", cursor: "pointer", overflow: "hidden", font: "inherit", textAlign: "left" }}>
                  {/* The flat colour sits behind the photo, so a swatch that has
                      not been uploaded yet still reads as the right colour. */}
                  <span style={{
                    display: "block", height: 62,
                    backgroundColor: f.hex,
                    ...(src ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" } : null),
                  }} />
                  <span style={{ display: "block", padding: "7px 9px", fontSize: 12, color: C.ink, fontWeight: on ? 700 : 400 }}>{f.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function ColourRow({ label, src, name, hex, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      {/* Flat colour behind the tile rather than instead of it, so a tile that
          fails to load falls back to the right colour instead of a blank. */}
      <span style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0, border: "1px solid rgba(0,0,0,0.12)",
        backgroundColor: hex || "#e9e6df",
        ...(src ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" } : null),
      }} />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{label}</span>
        <span style={{ fontSize: 11, color: C.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </span>
      <button type="button" onClick={onChange} style={{ ...btn, marginLeft: "auto", padding: "5px 10px", fontSize: 12 }}>Change</button>
    </div>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${C.edge}`, borderRadius: 8, overflow: "hidden" }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)}
            style={{ ...btn, border: "none", borderRadius: 0, background: on ? C.green : "#fff", color: on ? "#fff" : C.ink, fontWeight: on ? 600 : 400 }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// The kickboard toggle, which is not offered on every cabinet.
//
// An IKEA cabinet has its own plinth. Metod sits on legs and people do front it
// with a matching kickboard, so the toggle stays there and says where it stops.
// Pax and Besta get no toggle at all rather than a disabled one, because a
// control you cannot use is a question you should not have been asked.
//
// Switching it on for a Metod carries a board spec with it. A prop has no board
// of its own, so without that the kickboard reaches the quote with no colour
// and nothing on the page to fix it with.
function KickboardToggle({ item, set }) {
  if (!kickboardAllowedFor(item)) return null;
  return (
    <>
      <Toggle
        label="Kickboard"
        checked={item.has_kickboard}
        onChange={(v) => set(v ? kickboardOnPatch(item) : { has_kickboard: false })}
      />
      {isIkeaPreset(item) && item.has_kickboard ? (
        <p style={{ margin: "0 0 6px", fontSize: 11.5, color: C.soft, lineHeight: 1.45 }}>
          Your cabinet has its own plinth. This is a kickboard of ours fronting it, in carcass white 16mm
          unless you change the colour.
        </p>
      ) : null}
    </>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "5px 0", cursor: "pointer", fontSize: 13, color: C.ink }}>
      <span>{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.green, cursor: "pointer" }} />
    </label>
  );
}

// Shown in the right panel when nothing is selected.
function EmptyPrompt() {
  return (
    <div style={{ height: "100%", minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8, padding: 20 }}>
      <div style={{ fontSize: 30, opacity: 0.7 }}>👆</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Nothing selected yet</div>
      <div style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>Click a cabinet in the plan or 3D to change its size, doors/drawers, colours and finish. Its options will appear here.</div>
    </div>
  );
}

// A small centred modal for editing the room's overall size.
function RoomModal({ room, onUpdateRoom, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
      <div role="dialog" aria-modal="true" aria-label="Room size"
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: "min(380px, 92vw)", background: "#fff", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: `1px solid ${C.edge}` }}>
          <strong style={{ fontSize: 15, color: C.ink }}>Room size</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.edge}`, background: "#fff", cursor: "pointer", color: C.soft }}>✕</button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12.5, color: C.soft, margin: 0, lineHeight: 1.5 }}>Set your room&apos;s overall size in millimetres. You can change this any time.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <NumberField label="Width" value={room?.width_mm} onCommit={(v) => onUpdateRoom({ ...room, width_mm: v })} />
            <NumberField label="Depth" value={room?.depth_mm} onCommit={(v) => onUpdateRoom({ ...room, depth_mm: v })} />
            <NumberField label="Height" value={room?.height_mm} onCommit={(v) => onUpdateRoom({ ...room, height_mm: v })} />
          </div>
          <button type="button" style={{ ...btnPrimary, marginTop: 4 }} onClick={onClose}>Done</button>
        </div>
      </div>
    </>
  );
}

// A number in the bay editor that you can highlight and retype.
//
// Committing on every keystroke is what made this unusable: typing "60" applied
// 6 first, which re-sized every bay, re-rendered the row and moved the caret out
// from under you, so the second keystroke landed somewhere else. Selecting the
// text and typing over it was worse again, because the first character replaced
// the value with a single digit.
//
// So the field keeps its own draft while it has focus and only tells the cabinet
// anything on blur or Enter. Focus selects the contents, so highlight-and-type
// works the way it looks like it should. Escape puts it back.
function BayNumber({ value, onCommit, min = 1, max, title }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    if (!Number.isFinite(n) || draft === "") return;
    const clamped = Math.max(min, max ? Math.min(max, n) : n);
    if (clamped !== Number(value)) onCommit(clamped);
  };
  return (
    <input type="number" min={min} max={max} step="0.1" title={title}
      value={editing ? draft : String(value ?? "")}
      onFocus={(e) => { setDraft(String(value ?? "")); setEditing(true); e.currentTarget.select(); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setEditing(false); e.currentTarget.blur(); }
      }}
      style={{ ...btn, width: 72, flexShrink: 0, padding: "4px 6px", fontSize: 12, textAlign: "right" }} />
  );
}

function NumberField({ label, value, onCommit, readOnly = false }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setDraft(value ?? "");
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: C.soft }}>
      {label}
      {/* readOnly rather than disabled: the number still has to be readable, so
          someone can check it against the cabinet in front of them. */}
      <input type="number" value={draft} readOnly={readOnly}
        onChange={(e) => { if (!readOnly) setDraft(e.target.value); }}
        onBlur={() => { if (!readOnly) commit(); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{
          ...btn, padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box",
          color: readOnly ? C.soft : C.ink,
          background: readOnly ? "#f7f5ef" : "#fff",
          cursor: readOnly ? "not-allowed" : "text",
        }} />
    </label>
  );
}
