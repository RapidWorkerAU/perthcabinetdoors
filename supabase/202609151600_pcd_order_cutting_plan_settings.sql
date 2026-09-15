-- The cutting plan: what an order decided about cutting its boards
-- ---------------------------------------------------------------------------
--
-- WHY. The Made In House tab can now print a cutting plan: every panel we cut,
-- laid onto boards for the panel saw, one page per board. The blade width, the
-- trim, the edge tape, the smallest offcut worth keeping, and any board size or
-- grain set by hand are all decisions about THIS job, so they are kept on the
-- order and the plan prints the same way the next time.
--
-- One jsonb rather than a column each, the same shape as the quote's
-- board_order_settings, because the per board answers are keyed by supplier,
-- colour, finish and thickness and that is not a set of columns:
--
--   {
--     "kerf_mm": 3.2, "trim_mm": 10, "tape_mm": 1,
--     "min_offcut_length_mm": 300, "min_offcut_width_mm": 100,
--     "standard_grain": "height" | "by_type",
--     "boards": { "polytec|greige|smooth|18": { "width_mm": 1200, "length_mm": 2400, "has_grain": false } }
--   }
--
-- Null means nothing has been saved, and the plan falls back to the quote's
-- Board to Order settings, then the Business Defaults. The code runs without
-- this column and says the settings could not be saved, so the order of running
-- this and deploying does not matter.

begin;

alter table public.pcd_orders
  add column if not exists cutting_plan_settings jsonb;

comment on column public.pcd_orders.cutting_plan_settings is
  'What this order decided about cutting its boards, from the cutting plan on the Made In House tab: blade width, trim, edge tape, smallest offcut worth keeping, and any board size or grain set by hand. Null means nothing was saved. Normalised by normalizeCuttingSettings in lib/pcd-cutting-plan.js.';

commit;
