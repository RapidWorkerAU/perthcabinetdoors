-- WHY JULIET GRIST'S VARIATION NEVER REACHED HER ORDER.
--
-- Six columns on pcd_order_line_items were added by later migrations. Accepting
-- a quote has always coped with one of them being missing: it drops those
-- fields, raises the order anyway and logs that it did. Applying a VARIATION
-- had no such guard, so the same missing column threw, and because the status
-- had already been claimed the variation was left saying "approved" with the
-- order still on its old figures.
--
-- The code now carries the same guard both ways, so this cannot strand a
-- variation again. This tells you whether a column really is missing, which is
-- worth knowing either way: a line raised from a quote on this database has
-- been quietly losing that field too.
--
-- Nothing here changes anything. It only reports.

select column_name,
       case when column_name is null then 'MISSING' else 'present' end as state
  from (
    select unnest(array[
      'supplier_name',
      'hinge_holes',
      'hinge_qty',
      'unit_cost_source_id',
      'unit_cost_source_label',
      'design_item_id'
    ]) as wanted
  ) w
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'pcd_order_line_items'
   and c.column_name = w.wanted
 order by w.wanted;

-- The same six, as one line saying whether anything is short.
select case
         when count(*) = 6 then 'All six columns are present. The failure was something else: press "Add it to the order" and read the message.'
         else 'Missing ' || (6 - count(*)) || ' of the six. That is what stopped it, and the code now works around it.'
       end as verdict
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'pcd_order_line_items'
   and column_name in (
     'supplier_name', 'hinge_holes', 'hinge_qty',
     'unit_cost_source_id', 'unit_cost_source_label', 'design_item_id'
   );

-- What the variation is actually trying to write, so the shape of it is in
-- front of you when you press the button.
select l.action,
       l.title,
       l.qty,
       l.proposed_line_total_ex_gst,
       l.order_line_item_id
  from public.pcd_order_variation_lines l
  join public.pcd_order_variations v on v.id = l.variation_id
 where v.status = 'approved'
 order by v.variation_number, l.sort_order;
