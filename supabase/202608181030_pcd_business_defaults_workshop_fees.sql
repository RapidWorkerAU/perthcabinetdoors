-- Business defaults: workshop fees, in-house processing time, ABS edging
-- ---------------------------------------------------------------------------
--
-- WHY. Three separate things, all landing on the same settings row.
--
--   * IN-HOUSE PROCESSING TIME. Hours to make one door, drawer front or panel
--     from decorative board, so the time our own workshop spends on a front is
--     costed the way per-cabinet labour already is. Every decorative board
--     front or panel line adds this × its qty to the quote's labour hours, on
--     top of the per-cabinet hours a cabinet line carries. A cabinet is not
--     charged both: its per-cabinet hours are already the time to make it.
--
--   * ABS EDGING, PER LINEAL METRE. Edging is bought and used by the metre, not
--     per colour, so it does not want a library of its own. The metres come off
--     the quote lines and the cost lands on the quote. See the columns added in
--     202608181500.
--
--   * THE QUOTE-LEVEL COST DEFAULTS. Delivery, consumables, door removal,
--     travel, painting and glass are boxes on every quote that were typed in
--     from scratch every time. Each default_* column below prefills the box of
--     the same name on a NEW quote, and the quote can still change it. They all
--     start at 0, so nothing about an existing or a new quote changes until
--     someone fills them in.
--
-- The runner_unit_cost_* columns added in 202608171500 are NOT dropped here,
-- and nothing writes to them any more. Runners are ordinary hardware now: they
-- come off the hardware library and go on a quote as their own line, chosen per
-- job, rather than being priced from a rate per runner type. The columns keep
-- their old values in case that rate is ever wanted again.

alter table public.pcd_business_defaults
  add column if not exists inhouse_processing_hours_per_piece numeric(12,2) not null default 0,
  add column if not exists abs_edging_cost_per_lineal_metre_ex_gst numeric(12,2) not null default 0,
  add column if not exists default_travel_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists default_delivery_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists default_installation_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists default_painting_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists default_glass_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists default_removal_cost_ex_gst numeric(12,2) not null default 0;

alter table public.pcd_business_defaults
  drop constraint if exists pcd_business_defaults_workshop_fees_non_negative;

alter table public.pcd_business_defaults
  add constraint pcd_business_defaults_workshop_fees_non_negative
  check (
    inhouse_processing_hours_per_piece >= 0
    and abs_edging_cost_per_lineal_metre_ex_gst >= 0
    and default_travel_cost_ex_gst >= 0
    and default_delivery_cost_ex_gst >= 0
    and default_installation_cost_ex_gst >= 0
    and default_painting_cost_ex_gst >= 0
    and default_glass_cost_ex_gst >= 0
    and default_removal_cost_ex_gst >= 0
  );

comment on column public.pcd_business_defaults.inhouse_processing_hours_per_piece is
  'Hours to make one decorative board door, drawer front or panel. Added to a quote''s labour hours per such line x qty.';
comment on column public.pcd_business_defaults.abs_edging_cost_per_lineal_metre_ex_gst is
  'ABS edging per lineal metre, ex GST, cost plus uplift. Charged on the edges of every decorative board quote line.';
comment on column public.pcd_business_defaults.default_travel_cost_ex_gst is
  'Starting value for pcd_quotes.travel_cost_ex_gst on a new quote. 0 means the quote starts empty.';
comment on column public.pcd_business_defaults.default_delivery_cost_ex_gst is
  'Starting value for pcd_quotes.delivery_cost_ex_gst on a new quote.';
comment on column public.pcd_business_defaults.default_installation_cost_ex_gst is
  'Starting value for pcd_quotes.installation_cost_ex_gst on a new quote. Shown as "Consumables".';
comment on column public.pcd_business_defaults.default_painting_cost_ex_gst is
  'Starting value for pcd_quotes.painting_cost_ex_gst on a new quote.';
comment on column public.pcd_business_defaults.default_glass_cost_ex_gst is
  'Starting value for pcd_quotes.glass_cost_ex_gst on a new quote.';
comment on column public.pcd_business_defaults.default_removal_cost_ex_gst is
  'Starting value for pcd_quotes.removal_cost_ex_gst on a new quote. Door removal and disposal.';

comment on column public.pcd_business_defaults.runner_unit_cost_standard_ex_gst is
  'No longer used. Runners are priced from the hardware library as their own quote line.';
comment on column public.pcd_business_defaults.runner_unit_cost_soft_close_undermount_ex_gst is
  'No longer used. Runners are priced from the hardware library as their own quote line.';
comment on column public.pcd_business_defaults.runner_unit_cost_soft_close_side_ex_gst is
  'No longer used. Runners are priced from the hardware library as their own quote line.';

notify pgrst, 'reload schema';
