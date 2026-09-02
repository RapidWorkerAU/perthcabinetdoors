-- Compact laminate is made to order, like thermolaminate
-- ---------------------------------------------------------------------------
--
-- WHY. There are two ways we sell a board and the library records which:
--
--   supply board       we buy the board and cut it ourselves, so we hold a cost
--                      per m² against the colour and every line prices off it.
--   made to order MTO  the job goes to the supplier and comes back priced FOR
--                      that job. There is no rate per m² to hold, and there
--                      never will be.
--
-- Thermolaminate is flagged correctly: 145 of its 148 active colours say made
-- to order. Compact laminate says supply board on all 88, which is wrong. It is
-- made to order in exactly the same way.
--
-- The consequence was not cosmetic. Five separate screens test the PRICE rather
-- than the order type, so every compact laminate colour read as a colour we had
-- forgotten to price: the Board Library said "236 of 490 have no cost", quotes
-- showed "with no board cost" in red, repricing reported lines it could never
-- have repriced, converting a request reported the same lines again, and the
-- design importer raised a pre-flight warning on nearly every design. All five
-- now read the order type instead, which only works if the order type is right.
--
-- WHAT THIS DOES NOT TOUCH:
--   * the three thermolaminate rows flagged supply board (one on its own, two
--     flagged as both). They may well be deliberate, so they are left alone.
--   * any cost already entered. One compact laminate colour carries a cost per
--     m² and it stays exactly as it is. Made to order does not make a rate
--     wrong, it only means one is not expected.
--   * decorative board, which is supply board and fully priced.
--
-- Written as ONE do block: Supabase pools connections, so a single block means
-- an error anywhere undoes all of it rather than leaving the library half
-- reflagged.

do $$
declare
  updated_rows integer;
  leftover     integer;
begin
  update public.pcd_colour_library
  set order_type  = 'made to order MTO',
      order_types = array['made to order MTO']::text[]
  where lower(material_type) = 'compact laminate'
    and not (coalesce(order_types, array[]::text[]) @> array['made to order MTO']::text[]);
  get diagnostics updated_rows = row_count;

  -- Nothing compact laminate should still read as supply board only.
  select count(*)
    into leftover
    from public.pcd_colour_library
   where lower(material_type) = 'compact laminate'
     and not (coalesce(order_types, array[]::text[]) @> array['made to order MTO']::text[]);

  if leftover > 0 then
    raise exception
      'Stopped: % compact laminate colour(s) are still not made to order. Nothing has been changed.',
      leftover;
  end if;

  raise notice 'Flagged % compact laminate colour(s) as made to order.', updated_rows;
end $$;
