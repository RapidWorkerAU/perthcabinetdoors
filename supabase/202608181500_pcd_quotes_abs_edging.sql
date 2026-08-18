-- Quotes: ABS edging worked out from the lines
-- ---------------------------------------------------------------------------
--
-- WHY. The edging on a job was never costed. Every decorative board piece we
-- make gets its edges taped, the tape is bought and used by the lineal metre,
-- and none of that reached a quote: it was absorbed into the board price or
-- forgotten.
--
-- The metres are not typed in. Every decorative board line on the quote carries
-- a width, a height and a quantity, so the metres are the perimeter of each
-- piece times how many there are, added up. Four edges is the rule for every
-- line, a base cabinet included, because a carcass is taped across its front —
-- two sides plus top and bottom — which is the perimeter of the face already on
-- the line. Hardware and benchtop lines carry no board and are left out.
--
--   edging_lineal_metres        what the lines add up to
--   edging_cost_ex_gst          what is actually charged, and part of the
--                               subtotal like delivery or consumables
--   edging_cost_override_ex_gst what someone typed over the calculation, or
--                               NULL when they have not
--
-- THE OVERRIDE IS NULLABLE ON PURPOSE, and a typed 0 is not the same as NULL.
-- NULL means "follow the lines", so adding a door later moves the cost. 0 means
-- "this job carries no edging cost", and a recalculation must leave it alone.
-- A not-null default would make those two indistinguishable and every quote
-- would look overridden.
--
-- The rate is abs_edging_cost_per_lineal_metre_ex_gst in pcd_business_defaults
-- (202608181030). It is our cost plus our uplift, ex GST, so the edging cost is
-- charged as it stands and is never marked up again.

alter table public.pcd_quotes
  add column if not exists edging_lineal_metres numeric(12,2) not null default 0,
  add column if not exists edging_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists edging_cost_override_ex_gst numeric(12,2);

alter table public.pcd_quotes
  drop constraint if exists pcd_quotes_edging_non_negative;

alter table public.pcd_quotes
  add constraint pcd_quotes_edging_non_negative
  check (
    edging_lineal_metres >= 0
    and edging_cost_ex_gst >= 0
    and (edging_cost_override_ex_gst is null or edging_cost_override_ex_gst >= 0)
  );

comment on column public.pcd_quotes.edging_lineal_metres is
  'Lineal metres of ABS edge tape, added up from the decorative board lines. Calculated, never typed.';
comment on column public.pcd_quotes.edging_cost_ex_gst is
  'Edging charged on this quote, ex GST. The override when there is one, otherwise metres x the configured rate.';
comment on column public.pcd_quotes.edging_cost_override_ex_gst is
  'Edging cost typed over the calculation, ex GST. NULL means follow the lines; 0 means charge nothing for edging.';

notify pgrst, 'reload schema';
