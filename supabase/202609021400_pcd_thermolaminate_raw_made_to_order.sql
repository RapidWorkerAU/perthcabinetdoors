-- The last thermolaminate board that still said supply board
-- ---------------------------------------------------------------------------
--
-- WHY. Thermolaminate is made to order: the job goes to the supplier and comes
-- back priced for that job, so no colour holds a cost per m². 147 of the 148
-- active thermolaminate colours say so. One did not.
--
-- "Raw MDY", Polytec thermolaminate 21mm in a Raw finish, was flagged supply
-- board, so it was the single colour left in the whole library reading as a
-- price somebody had forgotten to enter. It is made to order like the rest.
--
-- Scoped to thermolaminate that is not already made to order, rather than to
-- that one row by name, so the rule and the data say the same thing: every
-- thermolaminate board is made to order.
--
-- WHAT THIS DOES NOT TOUCH:
--   * the two thermolaminate rows flagged as BOTH supply board and made to
--     order. They already read as made to order everywhere, and being able to
--     buy the board as well may be deliberate, so they keep both.
--   * any cost already entered anywhere. Made to order does not make a rate
--     wrong, it only means one is not expected.
--
-- After this the library holds no colour that is missing a price it should
-- have: 253 decorative board colours priced per m², and everything else quoted
-- by the supplier per job.

do $$
declare
  updated_rows integer;
  leftover     integer;
begin
  update public.pcd_colour_library
  set order_type  = 'made to order MTO',
      order_types = array['made to order MTO']::text[]
  where lower(material_type) = 'thermolaminate'
    and not (coalesce(order_types, array[]::text[]) @> array['made to order MTO']::text[]);
  get diagnostics updated_rows = row_count;

  select count(*)
    into leftover
    from public.pcd_colour_library
   where lower(material_type) = 'thermolaminate'
     and not (coalesce(order_types, array[]::text[]) @> array['made to order MTO']::text[]);

  if leftover > 0 then
    raise exception
      'Stopped: % thermolaminate colour(s) are still not made to order. Nothing has been changed.',
      leftover;
  end if;

  raise notice 'Flagged % thermolaminate colour(s) as made to order.', updated_rows;
end $$;
