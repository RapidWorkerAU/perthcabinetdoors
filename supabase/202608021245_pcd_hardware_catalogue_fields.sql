alter table public.pcd_hardware
  add column if not exists brand text,
  add column if not exists sku text,
  add column if not exists description text,
  add column if not exists image_url text,
  add column if not exists image_path text,
  add column if not exists width_mm numeric,
  add column if not exists height_mm numeric,
  add column if not exists depth_mm numeric,
  add column if not exists length_mm numeric,
  add column if not exists hole_spacing_mm numeric,
  add column if not exists projection_mm numeric;

alter table public.pcd_hardware
  drop constraint if exists pcd_hardware_type_check;

alter table public.pcd_hardware
  add constraint pcd_hardware_type_check
  check (type in ('handle', 'hinge', 'drawer_runner'));

notify pgrst, 'reload schema';
