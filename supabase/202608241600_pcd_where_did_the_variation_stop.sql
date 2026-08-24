-- WHERE DID IT ACTUALLY STOP.
--
-- All six columns are present, so the missing-column theory was wrong. Applying
-- a variation does three things in order, and knowing which one it reached
-- decides what happens when the button is pressed:
--
--   1. insert a line on the order for each "add" line on the variation
--   2. move the order's subtotal, GST and total
--   3. mark the variation applied
--
-- If it failed at 1, the order has none of the lines and retrying is clean.
-- If it failed at 2 or 3, THE LINES ARE ALREADY THERE, and applying it again
-- would add them a second time. That is the thing worth knowing before pressing
-- anything.
--
-- It changes nothing. It only reports.

select
  v.variation_number,
  o.order_number,
  o.customer_name,

  -- What the variation is worth, and what the order currently thinks.
  v.total_inc_gst                                        as variation_total_inc_gst,
  o.total_inc_gst                                        as order_total_inc_gst,

  -- Step 1. Lines already written onto the order BY this variation. Five means
  -- the inserts ran and it stopped after them; zero means it never got started.
  (select count(*)
     from public.pcd_order_line_items li
    where li.variation_id = v.id)                        as lines_already_on_order,

  (select count(*)
     from public.pcd_order_variation_lines vl
    where vl.variation_id = v.id
      and vl.action = 'add')                             as lines_it_should_add,

  -- Step 2. Whether the order total already includes it. If the lines are on
  -- the order AND this says yes, everything ran except the last write.
  case
    when (select count(*) from public.pcd_order_line_items li where li.variation_id = v.id) = 0
      then 'Stopped before writing any lines. Retrying is clean.'
    when (select count(*) from public.pcd_order_line_items li where li.variation_id = v.id)
       < (select count(*) from public.pcd_order_variation_lines vl where vl.variation_id = v.id and vl.action = 'add')
      then 'Stopped PART WAY through the lines. Retrying would duplicate the ones already there.'
    else 'All the lines are already on the order. It stopped at the totals or the status. Retrying would duplicate them.'
  end                                                    as where_it_stopped,

  v.apply_error
from public.pcd_order_variations v
join public.pcd_orders o on o.id = v.order_id
where v.status = 'approved'
order by v.approved_at;
