-- A PULL OUT TROUSER RACK IS ITS OWN KIND OF HARDWARE.
--
-- A frame on runners with a row of arms you lay trousers over, fitted inside a
-- wardrobe at a height. Like the shoe rail beside it, and unlike a runner or a
-- tray, it goes in a cabinet on its own, so the design tool's Accessories
-- picker offers it under its own heading and the quote calls it what it is.
--
-- THE WHOLE LIST IS HERE, the shoe rail included, so this file stands on its
-- own: running it is enough whether or not 202609131500 has been run.
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
      'pull_out_shoe_rail',
      'pull_out_trouser_rack'
    ));

  notify pgrst, 'reload schema';
end $$;
