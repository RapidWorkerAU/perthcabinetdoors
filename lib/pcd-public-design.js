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
const ALLOWED_STYLE_FIELDS = new Set([
  "material", "finish", "colour", "supplier", "thickness_mm", "colour_library_id",
]);

const STYLE_FIELDS = [
  "door_style", "drawer_style", "finish_panel_style", "back_panel_style",
  "bottom_panel_style", "kickboard_style", "benchtop_colour_style",
];

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
