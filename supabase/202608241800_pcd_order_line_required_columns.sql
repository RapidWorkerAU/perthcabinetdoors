-- THE COLUMN THAT REFUSES THE LINE.
--
-- The variation stopped before writing a single line, so it failed on the first
-- insert. All six late-migration columns are present and both qty columns are
-- numeric, so neither of those is it.
--
-- pcd_order_line_items.fulfilment_method is:
--
--     text not null default 'in_house' check (in ('in_house','supplier_ready_made'))
--
-- and both the variation path and the quote path write an explicit NULL into
-- it, on purpose:
--
--     fulfilment_method: isThermolaminated(line) ? "supplier_ready_made" : null
--
-- The intent is right. A line whose work nobody has planned yet has to read as
-- unplanned, or "panels nobody has decided about" under-reports every time a
-- variation lands, and the board stops asking for the one decision that holds a
-- job up. But a DEFAULT only applies when a column is left out. Naming it and
-- passing null is not leaving it out: it is asking for null, and the column
-- says no.
--
-- So the column has to allow it. The default stays for anything that omits the
-- column, and the check still passes on null, because a check only fails on
-- false and null is neither.
--
-- One do block, because the Supabase SQL editor pools connections and a script
-- that errors part way through has already committed what ran before it.

do $$
declare
  was_required boolean;
begin
  select c.is_nullable = 'NO' into was_required
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'pcd_order_line_items'
     and c.column_name = 'fulfilment_method';

  if was_required then
    alter table public.pcd_order_line_items
      alter column fulfilment_method drop not null;
    raise notice 'fulfilment_method now allows null, which is what "nobody has planned this yet" means.';
  else
    raise notice 'fulfilment_method already allowed null. The variation stopped on something else.';
  end if;
end $$;

comment on column public.pcd_order_line_items.fulfilment_method is
  'Who makes this line: in_house, supplier_ready_made, or NULL for nobody has decided yet. Null is a real answer and the board counts it: a line that defaults to in_house reads as planned work the moment it lands.';

notify pgrst, 'reload schema';

-- Anything else on this table that would refuse a line the same way: required,
-- and not one of the fields applying a variation sets.
select c.column_name,
       c.data_type,
       c.column_default,
       'Required, and applying a variation does not set it' as note
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name = 'pcd_order_line_items'
   and c.is_nullable = 'NO'
   and c.column_default is null
   and c.column_name not in (
     'order_id', 'quote_line_item_id', 'variation_id', 'variation_line_id', 'sort_order',
     'title', 'description', 'product_type', 'material', 'supplier_name', 'thickness',
     'profile_type', 'finish', 'colour', 'profile', 'edge_mould', 'width_mm', 'height_mm',
     'qty', 'unit_cost_source_id', 'unit_cost_source_label', 'unit_cost_per_sqm_ex_gst',
     'calculated_unit_cost_ex_gst', 'product_unit_cost_ex_gst', 'markup_percent',
     'line_total_ex_gst', 'design_item_id', 'fulfilment_method', 'status',
     'variation_status', 'notes'
   )
 order by c.column_name;
