-- THREE LIVE ORDERS ARE SET TO BE MADE IN THE WRONG COLOUR. THIS FIXES THEM.
--
-- Confirmed on 21 August 2026: the customer changed their mind after accepting,
-- somebody updated the quote because it was the only editable place at the time,
-- and the order was never brought along. So the quote is right and the workshop
-- paperwork is showing the colour the customer no longer wants.
--
-- ── WHAT HAPPENED ────────────────────────────────────────────────────────────
--
-- Three orders were raised in July. Days later, somebody opened each quote and
-- changed it. The accepted-quote lock did not exist until 17 August 2026, so
-- nothing stopped them.
--
--   PCD-O-2026-062E68  raised 17 Jul 07:04, accepted 07:05
--                      quote edited 21 Jul 13:52   Amaro -> Greige, Hampton -> Sussex
--
--   PCD-O-2026-79AB44  raised 17 Jul 07:07, accepted 07:08
--                      quote edited 21 Jul 13:36   Amaro -> Greige, Hampton -> Sussex
--
--   PCD-O-2026-DB2987  raised 21 Jul 23:04, accepted 25 Jul 03:56
--                      quote edited 27 Jul 23:53   Taupe -> Florentine Walnut,
--                                                  Matt -> Woodmatt
--
-- The quote lines were EDITED IN PLACE, not deleted and rebuilt, so this was
-- somebody working in the quote editor rather than a Stage Quote re-import.
-- Almost none of these lines came from the design tool.
--
-- The order lines have never been touched. The order item route has never been
-- able to set colour, finish or profile, and none of these lines carry a
-- variation. So the order still holds exactly what was copied at acceptance,
-- and the quote holds a later, deliberate change.
--
-- ── HOW WE KNOW WHICH SIDE IS RIGHT ──────────────────────────────────────────
--
-- The data says only which side MOVED, not which side is correct, and those are
-- different questions. It was confirmed by hand before this was run: the July
-- edits were the customer's actual change of mind.
--
-- The data supports it. Two quotes were changed within sixteen minutes of each
-- other, both colour and profile, consistently across every line. That is
-- somebody deliberately recording a real change, not an accident.
--
-- ── ONE LINE THAT NEEDED NO DECISION ─────────────────────────────────────────
--
-- PCD-O-2026-79AB44 line 16 had NO colour on the order at all, where the quote
-- has Greige. That is a gap rather than a disagreement: the workshop label for
-- that panel named no board, so nobody could tell what to cut it from. It is
-- covered by the same update below, because a null colour is distinct from a
-- real one.
--
-- ── WHAT THIS DOES AND DOES NOT DO ───────────────────────────────────────────
--
-- Does:  colour, finish, profile, and the board brand and cost source that go
--        with them, copied from the quote line onto the order line. Scoped to
--        these three orders by number, so it cannot run away across the system.
--        Writes an activity row on each order, so the change has a trail rather
--        than appearing overnight.
--
-- Does NOT: touch any price, total, quantity, size or status. If the colour
--        change also changed what the customer pays, that is a separate
--        decision and belongs in a variation, not in this file.
--
-- From here this cannot recur: the lock refuses any edit to a quote that has
-- become an order, and changes to committed work go through a variation.

do $$
declare
  target_orders text[] := array['PCD-O-2026-062E68', 'PCD-O-2026-79AB44', 'PCD-O-2026-DB2987'];
  changed int;
  order_row record;
begin
  -- Refuse to run against orders that have since had a variation. A variation
  -- is a later, approved decision, and it must not be quietly overwritten by an
  -- older quote edit.
  if exists (
    select 1
      from public.pcd_orders o
      join public.pcd_order_variations v on v.order_id = o.id
     where o.order_number = any(target_orders)
  ) then
    raise exception
      'One of these orders now has a variation on it. A variation is a newer decision than the quote edit this file is applying, so this has been stopped. Re-check the three orders by hand.';
  end if;

  update public.pcd_order_line_items l
     set colour                 = ql.colour,
         finish                 = ql.finish,
         profile                = ql.profile,
         -- The brand and the priced board follow the colour, taken outright
         -- rather than kept where the quote has none. Leaving them behind would
         -- label a Greige panel with the board Amaro came off, and a stale
         -- source is worse than none: it reads as a fact.
         --
         -- Safe to overwrite. This column only ever holds the board brand
         -- carried from the quote. The planning screens write their own
         -- supplier into panel_planning, per panel, and never touch this.
         supplier_name          = ql.supplier_name,
         unit_cost_source_id    = ql.unit_cost_source_id,
         unit_cost_source_label = ql.unit_cost_source_label
    from public.pcd_quote_line_items ql,
         public.pcd_orders o
   where ql.id = l.quote_line_item_id
     and o.id = l.order_id
     and o.order_number = any(target_orders)
     and l.variation_id is null
     and l.variation_status is null
     and (
          l.colour  is distinct from ql.colour
       or l.finish  is distinct from ql.finish
       or l.profile is distinct from ql.profile
     );
  get diagnostics changed = row_count;

  raise notice 'Brought % order line(s) into line with their quote.', changed;

  -- A trail. A colour changing on a live order without any record of why is
  -- exactly the sort of thing this whole exercise exists to stop.
  for order_row in
    select id, quote_id, order_number from public.pcd_orders where order_number = any(target_orders)
  loop
    insert into public.pcd_order_activity
      (order_id, quote_id, actor_type, action_type, title, description, event_key, created_at)
    values (
      order_row.id,
      order_row.quote_id,
      'system',
      'order_spec_realigned_to_quote',
      'Order brought into line with its quote',
      'The quote was edited after this order was raised, before accepted quotes were locked. The colour, finish and profile on the order lines have been set to what the quote says. No price, size or quantity was changed.',
      format('order:%s:spec_realigned_20260821', order_row.id),
      timezone('utc', now())
    )
    on conflict do nothing;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- CHECK AFTERWARDS. Should return no rows.
-- ---------------------------------------------------------------------------
select
  o.order_number,
  l.sort_order + 1 as line_no,
  l.colour  as order_colour,  ql.colour  as quote_colour,
  l.finish  as order_finish,  ql.finish  as quote_finish,
  l.profile as order_profile, ql.profile as quote_profile
from public.pcd_order_line_items l
join public.pcd_orders           o  on o.id  = l.order_id
join public.pcd_quote_line_items ql on ql.id = l.quote_line_item_id
where o.order_number in ('PCD-O-2026-062E68', 'PCD-O-2026-79AB44', 'PCD-O-2026-DB2987')
  and l.variation_id is null
  and (
       l.colour  is distinct from ql.colour
    or l.finish  is distinct from ql.finish
    or l.profile is distinct from ql.profile
  )
order by 1, 2;
