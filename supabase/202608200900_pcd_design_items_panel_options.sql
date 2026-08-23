-- Per-panel settings for design items.
--
-- Until now a cabinet had ONE pair of flags — panel_to_floor and
-- panel_to_ceiling — shared by every finished panel on it. That can't describe
-- an ordinary kitchen: the exposed left end runs to the floor while the right
-- end dies into a dishwasher, and the back panel behind an island runs to the
-- floor whatever the ends do.
--
-- panel_options holds each panel's own settings, keyed by panel:
--
--   {"end_left": {"to_floor": true},
--    "back":     {"to_floor": true, "profile_type": "Shaker", "profile": "Shaker 60"}}
--
-- A panel with no entry falls back to panel_to_floor / panel_to_ceiling, so
-- every design drawn before this keeps the exact geometry and price it had.
-- The old flags stay as the fallback rather than being migrated away.

alter table public.pcd_design_items
  add column if not exists panel_options jsonb not null default '{}'::jsonb;

comment on column public.pcd_design_items.panel_options is
  'Per-panel reach and profile, keyed by panel (end_left, end_right, back, back_wall1, back_wall2, kickboard, filler, top, underside, side_filler_left, side_filler_right). Absent panels inherit panel_to_floor / panel_to_ceiling. Panel COLOUR is not here — it lives in the per-panel style columns.';

-- Profiles briefly lived on the style objects, which could not tell a cabinet's
-- left end from its right because both read the same finish_panel_style. Move
-- any that were set onto both ends, then clear them so there is one source.
do $$
declare
  r record;
  moved int := 0;
begin
  for r in
    select id, finish_panel_style, back_panel_style, kickboard_style,
           filler_panel_style, top_panel_style, bottom_panel_style, panel_options
    from public.pcd_design_items
    where coalesce(finish_panel_style->>'profile_type', finish_panel_style->>'profile',
                   back_panel_style->>'profile_type',   back_panel_style->>'profile',
                   kickboard_style->>'profile_type',    kickboard_style->>'profile',
                   filler_panel_style->>'profile_type', filler_panel_style->>'profile',
                   top_panel_style->>'profile_type',    top_panel_style->>'profile',
                   bottom_panel_style->>'profile_type', bottom_panel_style->>'profile') is not null
  loop
    update public.pcd_design_items i
    set panel_options = coalesce(i.panel_options, '{}'::jsonb)
      || case when r.finish_panel_style ?| array['profile_type','profile'] then jsonb_build_object(
           'end_left',  jsonb_strip_nulls(jsonb_build_object('profile_type', r.finish_panel_style->>'profile_type', 'profile', r.finish_panel_style->>'profile')),
           'end_right', jsonb_strip_nulls(jsonb_build_object('profile_type', r.finish_panel_style->>'profile_type', 'profile', r.finish_panel_style->>'profile'))
         ) else '{}'::jsonb end
      || case when r.back_panel_style ?| array['profile_type','profile'] then jsonb_build_object(
           'back', jsonb_strip_nulls(jsonb_build_object('profile_type', r.back_panel_style->>'profile_type', 'profile', r.back_panel_style->>'profile'))
         ) else '{}'::jsonb end
      || case when r.kickboard_style ?| array['profile_type','profile'] then jsonb_build_object(
           'kickboard', jsonb_strip_nulls(jsonb_build_object('profile_type', r.kickboard_style->>'profile_type', 'profile', r.kickboard_style->>'profile'))
         ) else '{}'::jsonb end
      || case when r.filler_panel_style ?| array['profile_type','profile'] then jsonb_build_object(
           'filler', jsonb_strip_nulls(jsonb_build_object('profile_type', r.filler_panel_style->>'profile_type', 'profile', r.filler_panel_style->>'profile'))
         ) else '{}'::jsonb end
      || case when r.top_panel_style ?| array['profile_type','profile'] then jsonb_build_object(
           'top', jsonb_strip_nulls(jsonb_build_object('profile_type', r.top_panel_style->>'profile_type', 'profile', r.top_panel_style->>'profile'))
         ) else '{}'::jsonb end
      || case when r.bottom_panel_style ?| array['profile_type','profile'] then jsonb_build_object(
           'underside', jsonb_strip_nulls(jsonb_build_object('profile_type', r.bottom_panel_style->>'profile_type', 'profile', r.bottom_panel_style->>'profile'))
         ) else '{}'::jsonb end,
        finish_panel_style = r.finish_panel_style - 'profile_type' - 'profile',
        back_panel_style   = r.back_panel_style   - 'profile_type' - 'profile',
        kickboard_style    = r.kickboard_style    - 'profile_type' - 'profile',
        filler_panel_style = r.filler_panel_style - 'profile_type' - 'profile',
        top_panel_style    = r.top_panel_style    - 'profile_type' - 'profile',
        bottom_panel_style = r.bottom_panel_style - 'profile_type' - 'profile'
    where i.id = r.id;
    moved := moved + 1;
  end loop;
  raise notice 'panel profiles moved onto panel_options for % item(s)', moved;
end $$;
