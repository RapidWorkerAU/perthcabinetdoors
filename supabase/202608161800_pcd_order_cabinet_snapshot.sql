-- The order carries its own cabinet panel list.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- A cabinet's panel breakdown lives in pcd_cabinet_configs, which belongs to
-- the QUOTE. The production sheet read it live, joined through
-- quote_line_item_id, every time it was generated. So the panels on an order in
-- the workshop depended on a row that the quote editor could still change or
-- delete, and saving a cabinet line without its config deleted it outright.
--
-- A real order showed the result: two cabinets printed as a single row each,
-- their descriptions still carrying the dimensions of a config that no longer
-- existed. The workshop got no panels to cut and nothing said why.
--
-- The order line now snapshots the cabinet at acceptance. Nothing downstream
-- reads the quote for it again, so an order's paperwork is reproducible: the
-- sheet printed today matches the sheet printed the day it was accepted.
--
-- Nulls are expected on orders raised before this existed. Those fall back to
-- the live join, which is the behaviour they have always had.

alter table public.pcd_order_line_items
  add column if not exists cabinet_config_snapshot jsonb;

comment on column public.pcd_order_line_items.cabinet_config_snapshot is
  'The cabinet config, including calculated_cut_list, as it stood when the order was raised. The production sheet reads this, never the quote. Null on orders created before this column, which fall back to the live join.';

notify pgrst, 'reload schema';
