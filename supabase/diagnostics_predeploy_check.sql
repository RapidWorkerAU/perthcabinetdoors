-- BEFORE YOU DEPLOY: does the database match what the code expects?
--
-- Read only. Nothing here changes a row.
--
-- Every column below is one the new code writes. A missing one does not crash
-- anything: each write has a fallback that records what it can and logs which
-- migration is needed. But a fallback is a degraded state, not a working one,
-- so it is worth knowing before rather than after.
--
-- Expect: every row says OK.

select 'settlement columns (202608221800)' as check,
       case when count(*) = 2 then 'OK' else 'MISSING - run 202608221800_pcd_payment_settled_outside.sql' end as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pcd_order_payments'
   and column_name in ('settlement_method', 'settlement_reference')

union all
select 'approval evidence (202608221200)',
       case when count(*) = 2 then 'OK' else 'MISSING - run 202608221200_pcd_approval_evidence.sql' end
  from information_schema.columns
 where table_schema = 'public' and column_name = 'evidence'
   and table_name in ('pcd_quote_actions', 'pcd_order_variation_actions')

union all
select 'kept quote PDFs (202608221000)',
       case when count(*) = 2 then 'OK' else 'MISSING - run 202608221000_pcd_quote_attachment_superseded.sql' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pcd_quote_attachments'
   and column_name in ('superseded_at', 'superseded_by')

union all
select 'cabinet link on order lines (202608221400)',
       case when count(*) = 1 then 'OK' else 'MISSING - run 202608221400_pcd_order_line_design_item.sql' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pcd_order_line_items' and column_name = 'design_item_id'

union all
select 'cabinet link on variation lines (202608221400)',
       case when count(*) = 1 then 'OK' else 'MISSING - run 202608221400_pcd_order_line_design_item.sql' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pcd_order_variation_lines' and column_name = 'design_item_id'

union all
select 'brand and drilling carried onto orders (202608211200)',
       case when count(*) = 5 then 'OK' else 'MISSING - run 202608211200_pcd_order_line_carry_spec.sql' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pcd_order_line_items'
   and column_name in ('supplier_name', 'hinge_holes', 'hinge_qty', 'unit_cost_source_id', 'unit_cost_source_label')

-- ── and the two data fixes, which are about rows rather than columns ────────

union all
select 'no quote stuck as approved with no order',
       case when count(*) = 0 then 'OK'
            else count(*) || ' still stuck - run 202608221600_pcd_unstick_dropdown_approvals.sql' end
  from public.pcd_quotes q
  left join public.pcd_orders o on o.quote_id = q.id
 where q.status = 'approved' and o.id is null

union all
select 'the three July orders match their quotes',
       case when count(*) = 0 then 'OK'
            else count(*) || ' lines still differ - run 202608211600_pcd_order_line_adopt_quote_spec.sql' end
  from public.pcd_order_line_items l
  join public.pcd_orders o on o.id = l.order_id
  join public.pcd_quote_line_items ql on ql.id = l.quote_line_item_id
 where o.order_number in ('PCD-O-2026-062E68', 'PCD-O-2026-79AB44', 'PCD-O-2026-DB2987')
   and l.variation_id is null
   and (l.colour is distinct from ql.colour
     or l.finish is distinct from ql.finish
     or l.profile is distinct from ql.profile)

union all
select 'material spelling, everywhere it lives',
       case when count(*) = 0 then 'OK' else count(*) || ' lines still lowercase' end
  from public.pcd_quote_line_items
 where material in ('decorative board', 'thermolaminate', 'compact laminate')

order by 1;
