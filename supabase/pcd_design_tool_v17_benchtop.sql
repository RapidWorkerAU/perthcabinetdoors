-- Benchtops.
--
-- DRAWN, NEVER QUOTED. PCD doesn't supply benchtops — the customer or a stone
-- mason does. But a kitchen drawing without one is missing the single most
-- visible surface in the room, and whoever fabricates it needs to work from
-- something. So the benchtop exists here purely as documentation: it appears
-- on the plan and the elevation, carries its cutouts and waterfall ends, and
-- produces no quote line, no cut-list piece and no cost. It has no material
-- and no rate for exactly that reason — inventing one would imply we sell it.
--
-- Derived from the cabinets rather than placed. A benchtop over a run of base
-- cabinets is structurally identical to a kickboard run — same wall, same
-- adjacency, same "the run's first cabinet owns it" ownership — so it reuses
-- that machinery instead of adding a second, parallel one. Tick it on the
-- cabinets; continuous spans merge into one top; move a cabinet and the top
-- follows.

alter table public.pcd_design_items
  ADD COLUMN IF NOT EXISTS has_benchtop boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS benchtop_span text DEFAULT 'continuous',
  ADD COLUMN IF NOT EXISTS benchtop_thickness_mm integer DEFAULT 40,
  ADD COLUMN IF NOT EXISTS benchtop_overhang_mm integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS benchtop_waterfall_left boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS benchtop_waterfall_right boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS benchtop_cutouts jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.pcd_design_items.has_benchtop IS
  'Base/corner cabinets only. Drawn on the plan and elevation; never quoted or '
  'cut-listed — PCD does not supply benchtops.';

COMMENT ON COLUMN public.pcd_design_items.benchtop_span IS
  '"continuous" (merges with adjacent benchtopped cabinets on the same wall '
  'into one top) or "individual" (this cabinet only). Same semantics as '
  'kickboard_span.';

COMMENT ON COLUMN public.pcd_design_items.benchtop_overhang_mm IS
  'How far the top projects past the FRONT FACE of the door, not past the '
  'carcass — the drawn depth is carcass depth + front board thickness + this. '
  '20mm is the Australian standard.';

COMMENT ON COLUMN public.pcd_design_items.benchtop_waterfall_left IS
  'A vertical panel running down this end to the floor. "Left" is the viewer''s '
  'left standing in front of the cabinet, the same convention as '
  'end_panel_left/right.';

COMMENT ON COLUMN public.pcd_design_items.benchtop_cutouts IS
  'Cutouts in this cabinet''s stretch of benchtop, for the fabricator: '
  '[{ type: "sink" | "cooktop", width_mm, depth_mm }]. Centred on the cabinet. '
  'Not appliances — the tool has no appliance concept; these only say "a hole '
  'this size goes here".';
