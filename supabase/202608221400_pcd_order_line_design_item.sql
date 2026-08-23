-- WHICH CABINET DOES THIS PIECE BELONG TO?
--
-- WHY. The production sheet groups a cabinet with its own doors, drawer fronts,
-- kickboard and panels. The link that makes that possible is design_item_id, and
-- it lived only on the QUOTE line: an order line reached it by reading back
-- through quote_line_item_id.
--
-- A line a variation ADDED has no quote line behind it, so it could never be
-- grouped. A replacement door added by a variation printed in a loose "Doors"
-- group instead of with the cabinet it goes on, which is exactly the piece
-- somebody at the bench most needs to see in context.
--
-- Now the order line carries it, so it answers for itself. The read-back stays
-- as a fallback for orders raised before this existed.
--
-- Also added to variation lines, so a variation can say which cabinet the piece
-- it is adding belongs to.

alter table public.pcd_order_line_items
  add column if not exists design_item_id uuid;

alter table public.pcd_order_variation_lines
  add column if not exists design_item_id uuid;

comment on column public.pcd_order_line_items.design_item_id is
  'The design tool item this piece belongs to. Every line generated for one cabinet shares it, which is how the production sheet groups a cabinet with its doors and panels. Null on a hand-added line, which correctly belongs to nothing.';
comment on column public.pcd_order_variation_lines.design_item_id is
  'Which cabinet a variation-added piece belongs to, so it groups with that cabinet on the production sheet rather than printing loose.';

create index if not exists pcd_order_line_items_design_item_idx
  on public.pcd_order_line_items(design_item_id)
  where design_item_id is not null;

-- Backfill from the quote lines every existing order line still points at.
update public.pcd_order_line_items l
   set design_item_id = ql.design_item_id
  from public.pcd_quote_line_items ql
 where ql.id = l.quote_line_item_id
   and l.design_item_id is null
   and ql.design_item_id is not null;

do $$
declare
  grouped int;
  loose int;
begin
  select count(*) into grouped
    from public.pcd_order_line_items where design_item_id is not null;

  select count(*) into loose
    from public.pcd_order_line_items
   where design_item_id is null and quote_line_item_id is null;

  raise notice 'Order lines that now know their cabinet: %', grouped;
  raise notice 'Lines added by a variation with no cabinet recorded (they print loose, which may be correct): %', loose;
end $$;
