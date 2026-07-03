-- Corner cabinet and rangehood cabinet fields were already being calculated
-- correctly at design-tool import time (see designItemToLine/withCalculatedCabinetCost
-- in app/api/admin/design/projects/[projectId]/import/route.js) but pcd_cabinet_configs
-- had no columns to persist them, and the whitelist in
-- app/api/admin/quotes/[id]/_quote-line-save.js dropped them silently. Any
-- later re-save of an imported corner/rangehood cabinet from the quote editor
-- would then recalculate it as a plain rectangular cabinet and quietly lose
-- the second leg's / rangehood housing's material cost and cut pieces.

alter table public.pcd_cabinet_configs
  add column if not exists is_corner boolean not null default false;

alter table public.pcd_cabinet_configs
  add column if not exists secondary_width_mm numeric(12,2) not null default 0;

alter table public.pcd_cabinet_configs
  add column if not exists has_rangehood boolean not null default false;

alter table public.pcd_cabinet_configs
  add column if not exists rangehood_housing_height_mm numeric(12,2) not null default 0;

alter table public.pcd_cabinet_configs
  add column if not exists rangehood_channel_width_mm numeric(12,2) not null default 0;

alter table public.pcd_cabinet_configs
  add column if not exists mount_height_mm numeric(12,2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pcd_cabinet_configs_corner_rangehood_non_negative'
  ) then
    alter table public.pcd_cabinet_configs
      add constraint pcd_cabinet_configs_corner_rangehood_non_negative
      check (
        secondary_width_mm >= 0
        and rangehood_housing_height_mm >= 0
        and rangehood_channel_width_mm >= 0
      );
  end if;
end $$;
