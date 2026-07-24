-- Diagonal (angled) corner cabinets — the corner_style toggle.
--
-- A corner cabinet (corner_base_cabinet / corner_tall_cabinet) can now be built
-- two ways:
--   'l_shape'  — the existing L: two rectangular legs, bi-fold corner door.
--   'diagonal' — a chamfered corner: backs onto both walls at a fixed depth with
--                the room-facing corner cut off, a single flat DIAGONAL door.
-- NULL/absent = 'l_shape' (backward compatible).
--
-- corner_style lives on the design item AND on the quote's cabinet_config (so
-- the quote's cut-list recomputation knows which corner carcass to cut).

alter table public.pcd_design_items
  add column if not exists corner_style text;

alter table public.pcd_cabinet_configs
  add column if not exists corner_style text;

comment on column public.pcd_design_items.corner_style is
  'Corner cabinets only: ''l_shape'' (two legs, bi-fold door) or ''diagonal'' '
  '(chamfered front, single flat diagonal door). Null = l_shape.';

notify pgrst, 'reload schema';
