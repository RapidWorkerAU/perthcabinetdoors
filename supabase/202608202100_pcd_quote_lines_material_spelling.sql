-- Quote lines that came out of the design tool with the design tool's spelling.
--
-- WHY. The design tool stores a material lowercase ("decorative board"). The
-- quote editor's material dropdown, its thickness list and its edge and profile
-- validation all match Title Case ("Decorative Board"). Every line type was
-- converted on import except a cabinet, which returned from the costing branch
-- before it reached the conversion, so cabinet lines landed with a material
-- that never matched its own dropdown. The import is fixed; these are the rows
-- already written.
--
-- 15 lines across 5 quotes. Three of those quotes are approved and one is sent,
-- so this deliberately changes NOTHING that carries a price: the material is
-- the same material, spelled the way the rest of the system spells it. No
-- total, rate, cost or quantity is touched.
--
-- Check first, if you would rather look before it runs:
--
--   select q.quote_number, q.status, l.product_type, l.material, count(*)
--     from public.pcd_quote_line_items l
--     join public.pcd_quotes q on q.id = l.quote_id
--    where l.material in ('decorative board', 'thermolaminate', 'compact laminate')
--    group by 1, 2, 3, 4
--    order by 1;

update public.pcd_quote_line_items
   set material = 'Decorative Board'
 where material = 'decorative board';

update public.pcd_quote_line_items
   set material = 'Thermolaminate'
 where material = 'thermolaminate';

update public.pcd_quote_line_items
   set material = 'Compact Laminate'
 where material = 'compact laminate';

-- The same spellings reach an order through its lines. This file originally
-- tried to fix those too and named the table pcd_order_items, which does not
-- exist: the order lines live in pcd_order_line_items. It was wrapped in an
-- "if the table exists" guard, so it did not fail, it did nothing, and said
-- nothing. The dead block is removed rather than corrected in place, because
-- anyone who already ran this file would otherwise believe their order lines
-- were handled when they were not.
--
-- Run 202608211000_pcd_order_line_material_spelling.sql for the order side.
