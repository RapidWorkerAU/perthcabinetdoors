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
    'cabinet_inserts'
  ));

notify pgrst, 'reload schema';
