-- WHERE DOES THE PRODUCTION LIST DISAGREE WITH THE QUOTE IT CAME FROM?
--
-- Read only. Nothing here changes a row. Run it and read the answers.
--
-- Background. The Quote Summary tab on an order reads the quote's own lines,
-- live. The Production List tab, the production sheet PDF and the workshop
-- labels all read pcd_order_line_items, which is a COPY taken the moment the
-- quote was accepted. On an order with no variation those two should say the
-- same thing. Where they do not, one of them is being printed wrong.
--
-- Run each section on its own and look at what comes back.


-- ---------------------------------------------------------------------------
-- 1. SPEC THAT DISAGREES, on orders with no variation at all.
--
-- This is the one that matters most. Every row here is an order where the
-- workshop paperwork and the quote describe a different physical item, and no
-- variation was ever raised to explain the difference.
-- ---------------------------------------------------------------------------
select
  o.order_number,
  o.status                                   as order_status,
  q.quote_number,
  l.sort_order + 1                           as line_no,
  coalesce(l.title, '(no title)')            as line,
  case when l.material    is distinct from ql.material    then format('material: %s  vs quote %s',  coalesce(l.material,'(blank)'),    coalesce(ql.material,'(blank)'))    end as material_differs,
  case when l.thickness   is distinct from ql.thickness   then format('thickness: %s vs quote %s',  coalesce(l.thickness,'(blank)'),   coalesce(ql.thickness,'(blank)'))   end as thickness_differs,
  case when l.colour      is distinct from ql.colour      then format('colour: %s    vs quote %s',  coalesce(l.colour,'(blank)'),      coalesce(ql.colour,'(blank)'))      end as colour_differs,
  case when l.finish      is distinct from ql.finish      then format('finish: %s    vs quote %s',  coalesce(l.finish,'(blank)'),      coalesce(ql.finish,'(blank)'))      end as finish_differs,
  case when l.edge_mould  is distinct from ql.edge_mould  then format('edge: %s      vs quote %s',  coalesce(l.edge_mould,'(blank)'),  coalesce(ql.edge_mould,'(blank)'))  end as edge_differs,
  case when l.profile     is distinct from ql.profile     then format('profile: %s   vs quote %s',  coalesce(l.profile,'(blank)'),     coalesce(ql.profile,'(blank)'))     end as profile_differs,
  case when l.width_mm    is distinct from ql.width_mm    then format('width: %s     vs quote %s',  coalesce(l.width_mm::text,'(blank)'),  coalesce(ql.width_mm::text,'(blank)'))  end as width_differs,
  case when l.height_mm   is distinct from ql.height_mm   then format('height: %s    vs quote %s',  coalesce(l.height_mm::text,'(blank)'), coalesce(ql.height_mm::text,'(blank)')) end as height_differs,
  case when l.qty         is distinct from ql.qty         then format('qty: %s       vs quote %s',  coalesce(l.qty::text,'(blank)'),   coalesce(ql.qty::text,'(blank)'))   end as qty_differs
from public.pcd_order_line_items l
join public.pcd_orders          o  on o.id  = l.order_id
join public.pcd_quote_line_items ql on ql.id = l.quote_line_item_id
join public.pcd_quotes          q  on q.id  = ql.quote_id
where l.variation_id is null
  and l.variation_status is null
  and not exists (select 1 from public.pcd_order_variations v where v.order_id = o.id)
  and (
       l.material   is distinct from ql.material
    or l.thickness  is distinct from ql.thickness
    or l.colour     is distinct from ql.colour
    or l.finish     is distinct from ql.finish
    or l.edge_mould is distinct from ql.edge_mould
    or l.profile    is distinct from ql.profile
    or l.width_mm   is distinct from ql.width_mm
    or l.height_mm  is distinct from ql.height_mm
    or l.qty        is distinct from ql.qty
  )
order by o.order_number, l.sort_order;


-- ---------------------------------------------------------------------------
-- 2. THE BOARD BRAND THE QUOTE RECORDED AND THE ORDER DID NOT.
--
-- The quote knows exactly which brand of board was chosen. The conversion does
-- not copy it, so the order page and the workshop label have to guess the brand
-- back from the colour NAME. Two suppliers stocking the same colour name is
-- normal, and the guess takes whichever row comes back first.
--
-- Every row here is a line where the brand is known on the quote and absent on
-- the order.
-- ---------------------------------------------------------------------------
select
  o.order_number,
  o.status,
  count(*)                                as lines_missing_the_brand,
  string_agg(distinct ql.supplier_name, ', ') as brands_the_quote_recorded
from public.pcd_order_line_items l
join public.pcd_orders           o  on o.id  = l.order_id
join public.pcd_quote_line_items ql on ql.id = l.quote_line_item_id
where l.supplier_name is null
  and nullif(btrim(coalesce(ql.supplier_name, '')), '') is not null
group by 1, 2
order by 3 desc;


-- ---------------------------------------------------------------------------
-- 3. COLOUR NAMES THAT MORE THAN ONE SUPPLIER STOCKS.
--
-- These are the names where guessing the brand back from the colour can pick
-- the wrong one. If a colour here appears on an order from section 2, that
-- order's labels may name the wrong brand.
-- ---------------------------------------------------------------------------
select
  lower(btrim(name))                       as colour_name,
  count(distinct supplier_name)            as suppliers,
  string_agg(distinct supplier_name, ', ') as which
from public.pcd_colour_library
where nullif(btrim(coalesce(name, '')), '') is not null
group by 1
having count(distinct supplier_name) > 1
order by 2 desc, 1;


-- ---------------------------------------------------------------------------
-- 4. CABINETS WHOSE STORED PANEL LIST NO LONGER MATCHES THEIR OWN SIZE.
--
-- A cabinet prints from the panel list snapshotted when the order was raised.
-- A variation that changes a cabinet updates the line's size but does NOT
-- recalculate that panel list, so the sheet keeps cutting to the old size.
-- ---------------------------------------------------------------------------
select
  o.order_number,
  l.title,
  l.variation_status,
  l.height_mm                                          as line_height,
  l.width_mm                                           as line_width,
  l.cabinet_config_snapshot ->> 'height_mm'            as snapshot_height,
  l.cabinet_config_snapshot ->> 'width_mm'             as snapshot_width,
  jsonb_array_length(coalesce(l.cabinet_config_snapshot -> 'calculated_cut_list', '[]'::jsonb)) as panels_on_the_sheet
from public.pcd_order_line_items l
join public.pcd_orders o on o.id = l.order_id
where l.cabinet_config_snapshot is not null
  and l.variation_status is not null
order by o.order_number;


-- ---------------------------------------------------------------------------
-- 5. LINES A VARIATION ADDED, WHICH CANNOT BE READ BACK TO A QUOTE LINE.
--
-- Hinge drilling and the link that groups a door with its cabinet both live on
-- the quote line. A variation-added line has no quote line, so the sheet cannot
-- know whether to drill it and cannot group it with the cabinet it belongs to.
-- It prints drilling as unknown.
-- ---------------------------------------------------------------------------
select
  o.order_number,
  o.status,
  count(*) as lines_added_by_variation
from public.pcd_order_line_items l
join public.pcd_orders o on o.id = l.order_id
where l.quote_line_item_id is null
group by 1, 2
order by 3 desc;


-- ---------------------------------------------------------------------------
-- 6. THE MATERIAL SPELLING, wherever it still survives.
--
-- Should be zero everywhere once 202608202100 and 202608211000 have both run.
-- The last column looks inside the cabinet panel snapshots, which neither
-- migration touches.
--
-- The panel check reads each panel's own material rather than searching the
-- whole snapshot as one blob of text. An earlier version did the latter and
-- could under-report: a cabinet holding one panel spelled "Decorative Board"
-- and another spelled "decorative board" matched the "has a correct spelling"
-- half and was dropped from the count, so a genuinely mixed cabinet reported
-- clean. Per panel, that cannot happen.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.pcd_quote_line_items
    where material in ('decorative board', 'thermolaminate', 'compact laminate'))  as quote_lines_left,
  (select count(*) from public.pcd_order_line_items
    where material in ('decorative board', 'thermolaminate', 'compact laminate'))  as order_lines_left,
  (select count(*)
     from public.pcd_order_line_items l,
          lateral jsonb_array_elements(
            coalesce(l.cabinet_config_snapshot -> 'calculated_cut_list', '[]'::jsonb)
          ) as piece
    where piece ->> 'material' ~ '(^|[^A-Za-z])(decorative board|thermolaminate|compact laminate)')
                                                                                   as cabinet_panels_left,
  -- The quote's own cabinet configs, which are where an order's snapshot is
  -- copied FROM. Clean order snapshots with a dirty source means the next
  -- order raised brings the old spelling straight back.
  (select count(*)
     from public.pcd_cabinet_configs c,
          lateral jsonb_array_elements(
            coalesce(c.calculated_cut_list, '[]'::jsonb)
          ) as piece
    where piece ->> 'material' ~ '(^|[^A-Za-z])(decorative board|thermolaminate|compact laminate)')
                                                                                   as quote_cabinet_panels_left;


-- ---------------------------------------------------------------------------
-- 7. WHICH SIDE MOVED, for the orders section 1 listed.
--
-- Section 1 says the order and the quote disagree. It does not say which one
-- changed, and that is the whole decision: one of them is what the customer
-- agreed to and the other is not.
--
-- What we already know from the code:
--
--   The order line CANNOT have been edited. The order item route accepts only
--   planning fields, never colour, profile or finish, and these lines carry no
--   variation. So nothing in the application could have changed them.
--
--   The quote line CAN have been, but only before 17 August 2026, when the
--   accepted-quote lock landed.
--
-- So the expectation is that the QUOTE moved and the order still holds what was
-- copied at acceptance. This proves or disproves it.
--
-- Read the last two columns:
--
--   quote_line_written_after_order = true
--       The quote line was created AFTER the order existed. It cannot be the
--       line the order was raised from, so the lines were deleted and rebuilt,
--       which is what a Stage Quote re-import does. The ORDER holds what the
--       customer accepted.
--
--   quote_line_edited_after_order = true (but written_after = false)
--       The same line was edited in place after the order was raised. Again the
--       ORDER holds what the customer accepted.
--
--   both false
--       The quote has not moved since acceptance, so the difference came from
--       somewhere else and none of the above reasoning applies. Stop and tell
--       me: I would be guessing, and the cost of guessing here is scrap.
-- ---------------------------------------------------------------------------
select
  o.order_number,
  o.status,
  q.quote_number,
  o.created_at                                as order_raised,
  o.accepted_at,
  min(ql.created_at)                          as earliest_quote_line_written,
  max(ql.updated_at)                          as latest_quote_line_edited,
  max(l.updated_at)                           as latest_order_line_touched,
  count(*)                                    as lines_that_disagree,
  bool_or(ql.created_at > o.created_at)       as quote_line_written_after_order,
  bool_or(ql.updated_at > o.created_at)       as quote_line_edited_after_order
from public.pcd_order_line_items l
join public.pcd_orders           o  on o.id  = l.order_id
join public.pcd_quote_line_items ql on ql.id = l.quote_line_item_id
join public.pcd_quotes           q  on q.id  = ql.quote_id
where l.variation_id is null
  and l.variation_status is null
  and not exists (select 1 from public.pcd_order_variations v where v.order_id = o.id)
  and (
       l.colour  is distinct from ql.colour
    or l.profile is distinct from ql.profile
    or l.finish  is distinct from ql.finish
  )
group by 1, 2, 3, 4, 5
order by 1;


-- ---------------------------------------------------------------------------
-- 8. WHAT THE DESIGN SAYS NOW, for those same quotes.
--
-- If these quote lines came from the design tool, a re-import would have
-- rewritten them to whatever the design says TODAY. A design colour matching
-- the QUOTE rather than the order is the confirmation: somebody changed the
-- design and pressed Stage Quote again, on a quote that had already become an
-- order.
-- ---------------------------------------------------------------------------
select
  q.quote_number,
  p.name                          as design_project,
  ql.design_project_id is not null as came_from_the_design_tool,
  count(*)                        as lines,
  string_agg(distinct ql.colour, ', ')  as colour_on_the_quote_now,
  string_agg(distinct l.colour, ', ')   as colour_on_the_order
from public.pcd_order_line_items l
join public.pcd_orders           o  on o.id  = l.order_id
join public.pcd_quote_line_items ql on ql.id = l.quote_line_item_id
join public.pcd_quotes           q  on q.id  = ql.quote_id
left join public.pcd_design_projects p on p.id = ql.design_project_id
where l.variation_id is null
  and l.variation_status is null
  and not exists (select 1 from public.pcd_order_variations v where v.order_id = o.id)
  and l.colour is distinct from ql.colour
group by 1, 2, 3
order by 1;


-- ---------------------------------------------------------------------------
-- 9. THE ORDER LINE THAT HAS NO COLOUR AT ALL.
--
-- Separate from the rest, because it needs no decision. PCD-O-2026-79AB44 line
-- 16 has a blank colour where the quote has one. Blank is not a disagreement,
-- it is a gap: the workshop label for that panel prints no colour and nobody
-- can tell what board it is. Whatever is decided about the others, a blank
-- should take the quote's value.
-- ---------------------------------------------------------------------------
select
  o.order_number,
  l.sort_order + 1  as line_no,
  l.title,
  l.colour          as colour_on_the_order,
  ql.colour         as colour_on_the_quote
from public.pcd_order_line_items l
join public.pcd_orders           o  on o.id  = l.order_id
join public.pcd_quote_line_items ql on ql.id = l.quote_line_item_id
where nullif(btrim(coalesce(l.colour, '')), '') is null
  and nullif(btrim(coalesce(ql.colour, '')), '') is not null
order by 1, 2;
