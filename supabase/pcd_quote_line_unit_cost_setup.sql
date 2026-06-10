alter table public.pcd_quote_line_items
  add column if not exists unit_cost_mode text not null default 'manual',
  add column if not exists unit_cost_source_id uuid,
  add column if not exists unit_cost_source_label text,
  add column if not exists unit_cost_per_sqm_ex_gst numeric(12,2) not null default 0,
  add column if not exists calculated_unit_cost_ex_gst numeric(12,2) not null default 0;

alter table public.pcd_quote_line_items
  drop constraint if exists pcd_quote_line_items_unit_cost_mode_check;

alter table public.pcd_quote_line_items
  add constraint pcd_quote_line_items_unit_cost_mode_check
  check (unit_cost_mode in ('auto', 'manual'));
