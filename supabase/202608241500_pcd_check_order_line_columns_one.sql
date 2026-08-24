-- THE SAME CHECK, AS ONE RESULT.
--
-- 202608241400 asked three questions in three statements and the Supabase
-- editor shows you the last one, so the answer that mattered scrolled away
-- unseen. This is the same question in a single query.
--
-- It changes nothing. It only reports.
--
-- One row per column that applying a variation writes and that a later
-- migration added. "MISSING" on any of them is what stopped Juliet Grist's
-- variation reaching her order.

with wanted(column_name) as (
  values ('supplier_name'),
         ('hinge_holes'),
         ('hinge_qty'),
         ('unit_cost_source_id'),
         ('unit_cost_source_label'),
         ('design_item_id')
),
found as (
  select w.column_name,
         (c.column_name is not null) as present
    from wanted w
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = 'pcd_order_line_items'
     and c.column_name = w.column_name
)
select column_name,
       case when present then 'present' else 'MISSING' end as state,
       case
         when (select count(*) from found where not present) = 0
           then 'All six are here, so the failure was something else. Press "Add it to the order" and read the message.'
         else 'Missing ' || (select count(*) from found where not present)
              || ' of six. That is what stopped it, and the code now works around it.'
       end as verdict
  from found
 order by present, column_name;
