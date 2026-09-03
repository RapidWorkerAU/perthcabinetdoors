// Server-side helpers for the PUBLIC (no-login) design planner sessions.
// A public session is a pcd_design_projects row with is_public=true and an
// unguessable access_code. Public route handlers use the service-role client
// and scope EVERY query by this code — RLS stays admin-only (mirrors the
// pcd_quotes.access_code model). Kept here so all public routes share one
// definition of "what a public visitor may do".

import { randomBytes } from "crypto";

// The consumer palette the public planner exposes. Anything outside this is
// rejected before it can reach buildItemRow — no obstructions, windows,
// appliances, loose panels, etc. in the public tool.
// Cabinetry and shelving the visitor designs, plus a standalone panel and the
// three room references that make a plan realistic — a fridge space, a window
// and a doorway. The room references are never quoted; they exist so the design
// that arrives reflects the actual room. Everything else (scribes, obstructions,
// corner pantries, blind corners, other appliances) stays admin-only.
export const PUBLIC_ITEM_TYPES = [
  "base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet",
  "floating_shelf", "bookcase", "shelf_rail",
  "panel", "appliance", "window", "door_opening",
];

// A single anonymous session can't grow without bound (abuse / runaway client).
export const MAX_ITEMS_PER_SESSION = 80;

// Sensible clamps for the one room a public session gets, so a visitor can't
// persist a degenerate or absurd room.
export const ROOM_LIMITS = { min: 1000, max: 12000, minHeight: 2000, maxHeight: 4000 };

// URL-safe, unguessable session code (~16 chars of base64url). Visitors mostly
// return via the saved link, but it's short enough to share.
export function generateSessionCode() {
  return randomBytes(12).toString("base64url");
}

// Cost / pricing / trade-catalogue fields a public visitor must never set — the
// public tool shows no prices and picks no hardware, so these are stripped from
// any incoming payload before it's built into a row (defence in depth; the
// client never sends them).
const FORBIDDEN_ITEM_FIELDS = [
  "cost_per_sqm_carcass", "cost_per_sqm_shelf", "unit_cost_per_sqm_ex_gst", "unit_cost_mode",
  "benchtop_material", "benchtop_cost_per_sqm",
  "handle_name", "handle_cost_ex_gst", "hinge_model", "hinge_cost_ex_gst",
];

// The style blobs are jsonb, so whatever arrives in one is stored verbatim.
// That made them a way around the list above: the design importer reads
// `style.cost_per_sqm`, so a hand-rolled POST could have set the rate its own
// design was later quoted at. The style keys a public visitor may set are
// therefore listed rather than filtered, and everything else is dropped.
//
// thickness_mm and colour_library_id are on the list deliberately. They are
// identifiers, not prices: they say WHICH board a colour tile stands for, which
// is what lets the server price the piece from the library later.
// profile_type, profile and edge_mould are on the list because the public tool
// now asks for them. They are catalogue NAMES, not prices, and the quote editor
// re-validates every one against the line's material and thickness on save, so
// an invented value is dropped there rather than trusted here.
const ALLOWED_STYLE_FIELDS = new Set([
  "material", "finish", "colour", "supplier", "thickness_mm", "colour_library_id",
  "profile_type", "profile", "edge_mould",
]);

// EVERY jsonb style column, not just the ones the tool happened to write when
// this list was made. A column missing from here is not cleaned at all, which
// is the opposite of the intent: the whole point is that a style blob cannot be
// used to smuggle a cost field past the list above.
const STYLE_FIELDS = [
  "door_style", "drawer_style", "finish_panel_style", "back_panel_style",
  "bottom_panel_style", "top_panel_style", "kickboard_style", "filler_panel_style",
  "end_left_style", "end_right_style", "benchtop_colour_style",
];

// Per-panel settings are jsonb too, so they get the same treatment: known
// panels only, and known fields within each, so nothing arbitrary is stored
// under a key some later reader might trust.
const ALLOWED_PANEL_KEYS = new Set([
  "end_left", "end_right", "back", "back_wall1", "back_wall2",
  "kickboard", "filler", "top", "underside", "side_filler_left", "side_filler_right",
]);
const ALLOWED_PANEL_FIELDS = new Set(["to_floor", "to_ceiling", "profile_type", "profile"]);

function cleanPanelOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [panel, settings] of Object.entries(value)) {
    if (!ALLOWED_PANEL_KEYS.has(panel)) continue;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) continue;
    const kept = {};
    for (const [key, v] of Object.entries(settings)) {
      if (!ALLOWED_PANEL_FIELDS.has(key)) continue;
      kept[key] = (key === "to_floor" || key === "to_ceiling") ? Boolean(v) : v;
    }
    if (Object.keys(kept).length) out[panel] = kept;
  }
  return out;
}

function cleanStyle(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) return style;
  const out = {};
  for (const [key, value] of Object.entries(style)) {
    if (ALLOWED_STYLE_FIELDS.has(key)) out[key] = value;
  }
  return out;
}

export function stripForbiddenItemFields(payload) {
  const clean = { ...(payload || {}) };
  for (const key of FORBIDDEN_ITEM_FIELDS) delete clean[key];
  for (const key of STYLE_FIELDS) {
    if (key in clean) clean[key] = cleanStyle(clean[key]);
  }
  if ("panel_options" in clean) clean.panel_options = cleanPanelOptions(clean.panel_options);
  return clean;
}

// Loads the public project for a session code (or null). Never matches an admin
// project: is_public must be true AND the code must match.
export async function resolvePublicProject(supabase, code) {
  if (!code) return null;
  const { data } = await supabase
    .from("pcd_design_projects")
    .select("*")
    .eq("access_code", code)
    .eq("is_public", true)
    .maybeSingle();
  return data || null;
}

// May the person holding this link change the design?
//
// Defined in lib/pcd-design-share-mode.js and re-exported here so the write
// routes can go on importing everything they need from one place. It cannot be
// declared in this file: the design screen is a client component and this file
// imports node's crypto, so reading one flag would pull crypto into the browser
// bundle. See the note in that file.
export {
  canEditPublicProject,
  EDITABLE,
  SHARE_MODES,
  VIEW_ONLY,
  VIEW_ONLY_REFUSAL,
} from "./pcd-design-share-mode";

export function clampRoom({ width_mm, depth_mm, height_mm }) {
  const clamp = (v, lo, hi, fb) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fb;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  };
  return {
    width_mm: clamp(width_mm, ROOM_LIMITS.min, ROOM_LIMITS.max, 4000),
    depth_mm: clamp(depth_mm, ROOM_LIMITS.min, ROOM_LIMITS.max, 3000),
    height_mm: clamp(height_mm, ROOM_LIMITS.minHeight, ROOM_LIMITS.maxHeight, 2400),
  };
}
