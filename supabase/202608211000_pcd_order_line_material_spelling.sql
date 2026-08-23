-- The half of the material spelling fix that never ran.
--
-- WHY. 202608202100_pcd_quote_lines_material_spelling.sql fixed the quote lines
-- and then tried to bring the order lines into line with them. It named the
-- table pcd_order_items. There is no such table: the order's lines live in
-- pcd_order_line_items. The block was wrapped in an "if the table exists" guard,
-- so instead of failing it did nothing at all and reported success.
--
-- That is the worse half of the bug. The quote now says "Decorative Board" and
-- the order raised from it still says "decorative board", so the workshop
-- paperwork disagrees with the quote it came from, and nothing anywhere said so.
--
-- No guard this time. If the column is not there this must fail and be seen.
--
-- Nothing priced is touched. The material is the same material, spelled the way
-- the rest of the system spells it. No total, rate, cost, quantity or status
-- changes.
--
-- Check first, if you would rather look before it runs:
--
--   select o.order_number, o.status, l.product_type, l.material, count(*)
--     from public.pcd_order_line_items l
--     join public.pcd_orders o on o.id = l.order_id
--    where l.material in ('decorative board', 'thermolaminate', 'compact laminate')
--    group by 1, 2, 3, 4
--    order by 1;

update public.pcd_order_line_items
   set material = 'Decorative Board'
 where material = 'decorative board';

update public.pcd_order_line_items
   set material = 'Thermolaminate'
 where material = 'thermolaminate';

update public.pcd_order_line_items
   set material = 'Compact Laminate'
 where material = 'compact laminate';

-- A variation's lines are the same shape and reach the workshop the same way,
-- so they get the same treatment rather than being left as the one place the
-- old spelling survives.
update public.pcd_order_variation_lines
   set material = case material
                    when 'decorative board' then 'Decorative Board'
                    when 'thermolaminate'   then 'Thermolaminate'
                    when 'compact laminate' then 'Compact Laminate'
                  end
 where material in ('decorative board', 'thermolaminate', 'compact laminate');

-- Say what was left, so running this is not something you have to take on
-- trust. Anything other than zero means a spelling nobody has accounted for.
do $$
declare
  remaining_lines int;
  remaining_variation_lines int;
begin
  select count(*) into remaining_lines
    from public.pcd_order_line_items
   where material is not null and material <> initcap(material);

  select count(*) into remaining_variation_lines
    from public.pcd_order_variation_lines
   where material is not null and material <> initcap(material);

  raise notice 'Order lines still spelled differently to the quote editor: %', remaining_lines;
  raise notice 'Variation lines still spelled differently to the quote editor: %', remaining_variation_lines;
end $$;
