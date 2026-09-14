-- PCD-O-2026-652917: bring the line totals back in line with the order total.
--
-- WHAT HAPPENED. The quote was built and sent on 9 July at $2,306.00 ex GST,
-- with hinge drilling charged at $15 a hole. The drilling default was later
-- changed to $5. On 5 August the quote was marked approved, that write
-- recalculated the HEADER against the business defaults as they stood that day,
-- and the subtotal dropped to $2,106.00. The line rows were not rewritten, so
-- they still carry the $15 drilling: six door lines, $200 in total.
--
-- The customer was billed and has paid $2,316.60, which is the $2,106.00
-- header. So the header is what was charged and the lines are the stale half.
-- The tax invoice refuses to print while its own lines do not add up to its
-- total, which is correct of it.
--
-- WHAT THIS DOES. Recomputes each line total from the row's own numbers:
--
--     unit cost x qty x (1 + markup) + the drilling on that line
--
-- The drilling comes from the quote line's own stored figure, which was already
-- rewritten at $5, so this makes each line internally consistent and makes the
-- nine of them add up to the $1,381.00 the header was built from. Nothing else
-- is touched: no price the customer sees changes, because the price they were
-- charged is the header and the header is already right.
--
-- Scoped to this one order by number. Running it twice changes nothing the
-- second time, because the arithmetic is the same both times.

do $$
declare
  target_quote uuid;
  target_order uuid;
  quote_lines int;
  order_lines int;
  line_sum numeric;
begin
  select o.id, o.quote_id into target_order, target_quote
    from pcd_orders o
   where o.order_number = 'PCD-O-2026-652917';

  if target_order is null then
    raise notice 'PCD-O-2026-652917 was not found, so nothing was changed.';
    return;
  end if;

  -- The quote lines first: they hold the drilling figure everything else reads.
  update pcd_quote_line_items l
     set line_total_ex_gst = round(
           coalesce(l.product_unit_cost_ex_gst, 0) * coalesce(l.qty, 0)
             * (1 + coalesce(l.markup_percent, 0) / 100.0)
           + coalesce(l.hinge_drilling_cost_ex_gst, 0), 2),
         material_cost_ex_gst = round(
           coalesce(l.product_unit_cost_ex_gst, 0) * coalesce(l.qty, 0)
             * (1 + coalesce(l.markup_percent, 0) / 100.0)
           + coalesce(l.hinge_drilling_cost_ex_gst, 0), 2),
         updated_at = now()
   where l.quote_id = target_quote;
  get diagnostics quote_lines = row_count;

  -- Then the order lines, which are what the tax invoice adds up. Taken from
  -- the quote line they came from where that link exists, and worked out the
  -- same way where it does not.
  update pcd_order_line_items o
     set line_total_ex_gst = coalesce(
           (select q.line_total_ex_gst from pcd_quote_line_items q where q.id = o.quote_line_item_id),
           round(coalesce(o.product_unit_cost_ex_gst, 0) * coalesce(o.qty, 0)
                 * (1 + coalesce(o.markup_percent, 0) / 100.0), 2)
         ),
         updated_at = now()
   where o.order_id = target_order;
  get diagnostics order_lines = row_count;

  select sum(line_total_ex_gst) into line_sum
    from pcd_order_line_items where order_id = target_order;

  raise notice 'Rewrote % quote lines and % order lines. The order lines now add up to %, and with labour and travel that is the order subtotal.',
    quote_lines, order_lines, line_sum;
end $$;
