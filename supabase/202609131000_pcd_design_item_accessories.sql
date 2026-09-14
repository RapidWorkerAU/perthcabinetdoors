-- WHAT IS FITTED INSIDE A CABINET: RAILS, BINS AND INSERTS.
--
-- A wardrobe needs a hanging rail, a bin cabinet needs the bin, and both are
-- bought items with their own price. They are not cut from board, so they are
-- not part of the cut list: each one becomes its own Hardware line on the
-- quote, priced from the hardware library the day it is staged.
--
--   accessories  a list, one entry per accessory fitted in this cabinet:
--
--     [{ "id": "acc-ab12", "hardware_id": "<pcd_hardware.id>",
--        "name": "Oval Hanging Rail", "type": "wardrobe_hanging_rail",
--        "qty": 1, "height_mm": 1650 }]
--
--     height_mm is measured up from the bottom of the carcass, the same datum
--     shelf heights use, so a drawing reads the two the same way. Null means
--     nobody has said, and it sits where that kind normally goes.
--
-- A list rather than a column per kind, because the kinds come from the
-- hardware library and a new one must never need a migration. Same shape as
-- shelf_rail_config, which reserved its own array for exactly this reason.
--
-- Staff only for now: lib/pcd-public-design.js refuses it on the public
-- planner, the same as handles and hinges.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  alter table public.pcd_design_items
    add column if not exists accessories jsonb not null default '[]'::jsonb;

  comment on column public.pcd_design_items.accessories is
    'Hardware fitted inside this cabinet: [{id, hardware_id, name, type, qty, height_mm}]. height_mm is measured up from the bottom of the carcass, the same datum as shelf_heights_mm. Each entry becomes its own Hardware quote line, priced from pcd_hardware when the quote is staged.';

  notify pgrst, 'reload schema';
end $$;
