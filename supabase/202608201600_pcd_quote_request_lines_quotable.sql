-- A quote request line has to carry enough to be quoted.
--
-- WHY. A request came in reading "Thermolaminate / 18mm / Natura" on all ten of
-- its lines with the colour blank on every one. Natura is a finish, so what
-- arrived was a material, a thickness and a finish, and nothing to price. It
-- converted to a quote with ten lines nobody could put a number against, and
-- the only way to finish it was to ring the customer and ask them a question
-- the form had already asked them.
--
-- The website checks this as the row is filled in, the API checks it again, and
-- lib/pcd-quote-request.js checks it at the one place a request is written.
-- This is the last of the four and the only one that cannot be got around: not
-- by a new submit path, not by an old browser holding a stale copy of the form,
-- not by anything talking to the database directly.
--
-- WHAT IS REQUIRED
--   product type   always. It decides how the line is priced and cut, and a
--                  blank one lands on the quote as a blank Type.
--   material       for anything cut from a board.
--   thickness      for anything cut from a board. Board prices are held per
--                  material, thickness, finish and colour.
--   colour         for anything cut from a board. This is the one that was
--                  missing.
--
-- WHAT IS DELIBERATELY NOT REQUIRED
--   a price         much of the colour library has no cost against it yet and
--                   those lines are costed by hand when the request becomes a
--                   quote. That is work, not a broken request.
--   width, height   a person typing a line on the website is asked for both and
--                   the form will not send one without them. From a design
--                   planner every size is worked out from what the customer
--                   drew, and where one genuinely is not known yet (a filler
--                   panel closing a gap that has to be measured on site) the
--                   line says so in its notes and goes through on purpose.
--                   Refusing the request over it would lose the lead over a
--                   number the customer was never asked for.
--   a cabinet's     a cabinet is priced from its cut list, lands on the quote
--   board           flagged "Needs configuration", and on a carcass the customer
--                   already owns we are not making the box at all, so naming a
--                   board for it would be wrong.
--
-- NOT VALID means this applies to everything written from now on and leaves the
-- rows already there alone. Those are real leads and rejecting them
-- retrospectively would help nobody. The query at the bottom lists them.

alter table public.pcd_quote_request_line_items
  drop constraint if exists pcd_quote_request_line_items_quotable;

alter table public.pcd_quote_request_line_items
  add constraint pcd_quote_request_line_items_quotable
  check (
    -- Nothing cut from a board: hardware is a unit cost, a benchtop is priced
    -- from the benchtop material list.
    product_type in ('Hardware', 'Benchtop')
    -- A cabinet is complete with a type alone.
    or product_type = 'base_cabinet'
    or (
      coalesce(btrim(product_type), '') <> ''
      and coalesce(btrim(material), '') <> ''
      and coalesce(btrim(thickness), '') <> ''
      and coalesce(btrim(colour), '') <> ''
    )
  )
  not valid;

comment on constraint pcd_quote_request_line_items_quotable
  on public.pcd_quote_request_line_items is
  'A line must carry a product type, and a board line must carry a material, thickness and colour. Added after a ten-line request arrived with no colour on any line and could not be priced. Hardware, benchtops and cabinets are exempt: see the migration for why.';

-- The lines already in the table that would not pass. Each one needs a colour
-- confirmed with the customer before its quote can be finished.
--
-- select r.created_at::date as received, r.customer_name, r.status,
--        l.product_type, l.material, l.thickness, l.finish, l.colour
--   from public.pcd_quote_request_line_items l
--   join public.pcd_quote_requests r on r.id = l.quote_request_id
--  where l.product_type is distinct from 'base_cabinet'
--    and (l.product_type is null or l.product_type not in ('Hardware', 'Benchtop'))
--    and (coalesce(btrim(l.product_type), '') = ''
--         or coalesce(btrim(l.material), '') = ''
--         or coalesce(btrim(l.thickness), '') = ''
--         or coalesce(btrim(l.colour), '') = '')
--  order by r.created_at desc, l.sort_order;
