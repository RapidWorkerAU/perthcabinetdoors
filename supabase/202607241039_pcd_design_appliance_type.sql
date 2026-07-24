-- Appliance item type (audit Phase 2, p2-4).
--
-- Ovens, fridges, dishwashers etc. were previously faked with generic
-- obstruction blocks, which read as "structure" (hazard-hatched) and gave no
-- hint what they were. `appliance` is a proper decorative item type — drawn,
-- never quoted (PCD doesn't supply appliances) — the counterpart to the
-- window / door_opening types added in Phase 1. It reuses the existing
-- width/height/depth/mount_height/wall/colour_hex columns; the only new field
-- is appliance_kind, so the item can carry what it is (and be labelled/drawn
-- accordingly).
--
-- item_type itself is free-text (no CHECK constraint, see v13), so no change is
-- needed there for the new "appliance" value.

alter table public.pcd_design_items
  add column if not exists appliance_kind text;

comment on column public.pcd_design_items.appliance_kind is
  'appliance items only: what the appliance is (fridge / dishwasher / oven / '
  'cooktop / rangehood / washing_machine / microwave / freezer / other). '
  'Decorative only — appliances are drawn, never quoted.';

notify pgrst, 'reload schema';
