-- A PULL OUT SHOE RAIL IS ITS OWN KIND OF HARDWARE.
--
-- It is fitted inside a wardrobe on runners, at a height, like a hanging rail
-- and unlike anything that belongs to a door or a drawer. It was going to have
-- to live under Cabinet Inserts, which is where a strip light lives, so the
-- design tool's Accessories picker would have offered the two together under
-- one heading and the quote would have called a shoe rail an insert.
--
-- The list here and the one in lib/pcd-hardware-types.js are the same list, and
-- a kind that is in one and not the other either cannot be saved or cannot be
-- shown. Change both or neither.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  alter table public.pcd_hardware
    drop constraint if exists pcd_hardware_type_check;

  alter table public.pcd_hardware
    add constraint pcd_hardware_type_check
    check (type in (
      'handle',
      'hinge',
      'drawer_runner',
      'push_to_open',
      'cutlery_tray',
      'wardrobe_hanging_rail',
      'slide_out_bin',
      'bi_fold_door',
      'cabinet_inserts',
      'pull_out_shoe_rail'
    ));

  notify pgrst, 'reload schema';
end $$;
