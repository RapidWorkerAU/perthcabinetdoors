-- Panel numbers must be unique per PANEL, not per panel key.
--
-- Panel keys for cabinet panels are built as "cabinet:<copy>:<piece>:<index>",
-- with no item id in them. That is correct where they are used to look up
-- panel_planning, which is a map stored on the item itself, so the key only has
-- to be unique inside one item.
--
-- Panel numbers are scoped to the ORDER, so two cabinets that both have a left
-- side panel produced the same key and were handed the same number. A real
-- sheet printed 14 and 15 twice, once under an oven cabinet and again under a
-- tall cabinet.
--
-- The fix is to scope the number by the line item as well as the key, rather
-- than changing the key format, because changing the key would orphan every
-- panel plan, note and supplier assignment already stored against it.
--
-- Nothing is deleted. Rows already issued keep their numbers, and the panels
-- that were sharing one will each take a free number the next time a production
-- document is generated.

drop index if exists idx_pcd_order_panel_numbers_key;

create unique index if not exists idx_pcd_order_panel_numbers_item_key
  on public.pcd_order_panel_numbers(order_id, order_line_item_id, panel_key);

notify pgrst, 'reload schema';
