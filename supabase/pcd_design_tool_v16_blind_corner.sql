-- Blind corner cabinets.
--
-- The existing corner_base_cabinet is a true L-shaped carcass: two legs, a
-- bi-fold door, and (by its own admission in calculateCornerCabinetCutList)
-- an approximate cut list. A BLIND corner is the far more common approach —
-- an ordinary rectangular box that runs into the corner, where the adjacent
-- cabinet's carcass covers part of its width. That covered part is dead
-- space: you can't reach it and no door opens onto it.
--
-- So structurally it needs nothing new — it's a plain box, and the standard
-- carcass cut list, plan rectangle and elevation all apply unchanged. The one
-- thing that makes it a corner is that its FRONT is narrower than its
-- carcass:
--
--     |<---------------- width_mm 900 ---------------->|
--     |<-- blind_width_mm 450 -->|<-- opening 450 -->|
--      dead zone (behind the       the only part a
--      return cabinet)             door covers
--
-- Doors/drawers are therefore sized against (width_mm - blind_width_mm), not
-- width_mm. Everything else — kickboard, panels, back, shelves — spans the
-- full carcass as usual.

alter table public.pcd_design_items
  ADD COLUMN IF NOT EXISTS blind_width_mm integer,
  ADD COLUMN IF NOT EXISTS blind_side text;

COMMENT ON COLUMN public.pcd_design_items.blind_width_mm IS
  'blind_corner_cabinet only: how much of width_mm is dead space covered by '
  'the adjacent return cabinet. The door/drawer opening is '
  'width_mm - blind_width_mm; the carcass itself is still the full width_mm. '
  'Null/0 means the whole front is accessible.';

COMMENT ON COLUMN public.pcd_design_items.blind_side IS
  'blind_corner_cabinet only: which END of the cabinet the dead space is at, '
  '"left" or "right", as seen standing in front of it — the same viewer-facing '
  'convention as end_panel_left/right. Only affects where the zone is drawn '
  'and which end the door sits at; the cut sizes are the same either way. '
  'Defaults to "left".';
