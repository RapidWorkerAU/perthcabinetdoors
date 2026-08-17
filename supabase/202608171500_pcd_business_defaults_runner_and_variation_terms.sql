-- Business defaults: drawer runner rates and variation terms
-- ---------------------------------------------------------------------------
--
-- WHY. Two sets of numbers were being applied to real quotes with no way to
-- change them.
--
--   * The three drawer runner rates existed only as constants in the code.
--     There was no column, nothing on the settings screen, and
--     normalizeBusinessDefaults did not even carry them through, so the design
--     importer always priced a runner pair at the built-in $8 / $25 / $15 no
--     matter what. Three columns, three inputs, and the importer now reads them.
--
--   * Variation terms were a hardcoded sentence in the variations API. Quote
--     terms have been configurable for a while; the wording that goes out with
--     a variation was not, so a business could change one and not the other.
--
-- The defaults below are the values the code was already using, so nothing
-- changes price until someone edits them. variation_terms is seeded with the
-- sentence the API was hardcoding, so existing behaviour is preserved exactly
-- and it is now editable.

alter table public.pcd_business_defaults
  add column if not exists runner_unit_cost_standard_ex_gst numeric(12,2) not null default 8,
  add column if not exists runner_unit_cost_soft_close_undermount_ex_gst numeric(12,2) not null default 25,
  add column if not exists runner_unit_cost_soft_close_side_ex_gst numeric(12,2) not null default 15,
  add column if not exists variation_terms text;

alter table public.pcd_business_defaults
  drop constraint if exists pcd_business_defaults_runner_costs_non_negative;

alter table public.pcd_business_defaults
  add constraint pcd_business_defaults_runner_costs_non_negative
  check (
    runner_unit_cost_standard_ex_gst >= 0
    and runner_unit_cost_soft_close_undermount_ex_gst >= 0
    and runner_unit_cost_soft_close_side_ex_gst >= 0
  );

comment on column public.pcd_business_defaults.runner_unit_cost_standard_ex_gst is
  'Supply cost of one standard runner pair, ex GST. One pair per drawer.';
comment on column public.pcd_business_defaults.runner_unit_cost_soft_close_undermount_ex_gst is
  'Supply cost of one soft-close undermount runner pair, ex GST.';
comment on column public.pcd_business_defaults.runner_unit_cost_soft_close_side_ex_gst is
  'Supply cost of one soft-close side-mount runner pair, ex GST.';
comment on column public.pcd_business_defaults.variation_terms is
  'Terms printed on an order variation. Blank means the variation carries no terms.';

update public.pcd_business_defaults
set variation_terms = coalesce(
  variation_terms,
  'This variation changes the accepted order scope. Work proceeds only after approval and any required payment is received.'
)
where id = '00000000-0000-0000-0000-000000000001';

notify pgrst, 'reload schema';
