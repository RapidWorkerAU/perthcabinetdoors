-- A cabinet's two end panels are two separate boards.
--
-- Both ends shared one finish_panel_style, so they could differ in how far they
-- ran but never in what they were made of. That is not how a kitchen is built:
-- the exposed end beside a walkway is regularly a different board from the end
-- that dies into a run — a profiled Thermolaminate end on show, a plain
-- Decorative Board end where nobody sees it.
--
-- It also matters downstream. Two ends on different boards are two different
-- quote lines, and with one shared style there was no way for them to arrive as
-- anything but one.
--
-- finish_panel_style STAYS as the fallback and keeps its job as the general
-- finishing-panel board (side fillers, top and underside panels all still read
-- it). These two are per-side overrides on top, exactly like kickboard_style
-- and back_panel_style already are, so every design drawn before this keeps the
-- geometry and the price it had.

alter table public.pcd_design_items
  add column if not exists end_left_style jsonb,
  add column if not exists end_right_style jsonb;

comment on column public.pcd_design_items.end_left_style is
  'Board for the LEFT end panel only. Null means it follows finish_panel_style, which in turn follows the doors and then the carcass. Same override shape as kickboard_style.';
comment on column public.pcd_design_items.end_right_style is
  'Board for the RIGHT end panel only. Null means it follows finish_panel_style. Same override shape as kickboard_style.';

-- Nothing to backfill: a null override already means "follow the finishing
-- panel", which is exactly what both ends did before. Stated rather than left
-- implied, because the temptation on the next migration is to copy
-- finish_panel_style into both, and that would freeze every existing design's
-- ends against later changes to the finishing panel.
do $$
begin
  raise notice 'end_left_style / end_right_style added; both start null so existing ends keep following finish_panel_style';
end $$;
