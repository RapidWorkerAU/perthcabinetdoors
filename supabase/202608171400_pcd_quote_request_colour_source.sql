-- Quote request lines: remember WHICH colour library row was picked
-- ---------------------------------------------------------------------------
--
-- WHY. Converting a quote request produced quote lines with no cost on them,
-- because nothing between the website and the quote editor ever asked the
-- colour library what a board costs. The editor never looked a price up either:
-- the price rode along on the dropdown option a person clicked, so the CLICK
-- was the lookup, and a line created without a click landed at $0.
--
-- The website form already knows exactly which library row the customer picked.
-- It just had nowhere to put it. These two columns are that place, and the
-- conversion now prices off them.
--
-- supplier_name matters as well as the id: a colour name is NOT unique across
-- Polytec, Laminex and Formica, so a name-only match can find two rows at two
-- prices. It also stops the quote editor defaulting every converted line to
-- Polytec and then filtering the real colour out of its own picker.
--
-- Deliberately NOT a foreign key to pcd_colour_library. A retired or renamed
-- colour must not block a lead from landing, and the resolver falls back to
-- matching on name when the id no longer resolves.

alter table public.pcd_quote_request_line_items
  add column if not exists colour_library_id uuid,
  add column if not exists supplier_name text;

comment on column public.pcd_quote_request_line_items.colour_library_id is
  'pcd_colour_library row the customer picked. Used to price the line exactly on conversion. Not an FK on purpose: a retired colour must not block a lead.';

comment on column public.pcd_quote_request_line_items.supplier_name is
  'Brand of the picked colour (Polytec / Laminex / Formica). Colour names are not unique across suppliers.';

create index if not exists idx_pcd_quote_request_line_items_colour_source
  on public.pcd_quote_request_line_items(colour_library_id);


-- ---------------------------------------------------------------------------
-- CLEAN UP THE COLOURS THAT WERE STORED WITH THE FINISH GLUED ON
--
-- The website form used to submit the colour as "<finish> - <colour>", eg
-- "Matt - Classic White", while ALSO sending the finish in its own field. So
-- the finish was written twice and the colour column stopped being a colour
-- name. That is fixed at the source now. This repairs the rows already written.
--
-- Scope, deliberately narrow:
--   * only rows whose colour literally starts with their own finish followed
--     by " - ". A colour genuinely named after its finish (no separator) is
--     left alone.
--   * both the request lines and the quote lines they were copied into.
--   * order line items too, since converted quote lines feed them.
--
-- Written as ONE do block on purpose. Supabase pools connections, so a temp
-- table does not survive between statements, and a single block means an error
-- anywhere undoes everything rather than leaving the tables half repaired.
--
-- HOW TO USE
--   1. Run the PREVIEW at the bottom first. It is read-only and shows exactly
--      which rows will change and what they will become.
--   2. Run the do block. It reports how many rows it repaired per table.
--   3. Run the VERIFICATION at the bottom. Every count should be 0.
-- ---------------------------------------------------------------------------
do $$
declare
  fixed_requests integer;
  fixed_quotes   integer;
  fixed_orders   integer;
  leftover       integer;
begin
  update public.pcd_quote_request_line_items
  set colour = btrim(substring(colour from char_length(btrim(finish)) + 4))
  where finish is not null
    and btrim(finish) <> ''
    and colour is not null
    and lower(colour) like lower(btrim(finish)) || ' - %';
  get diagnostics fixed_requests = row_count;

  update public.pcd_quote_line_items
  set colour = btrim(substring(colour from char_length(btrim(finish)) + 4))
  where finish is not null
    and btrim(finish) <> ''
    and colour is not null
    and lower(colour) like lower(btrim(finish)) || ' - %';
  get diagnostics fixed_quotes = row_count;

  update public.pcd_order_line_items
  set colour = btrim(substring(colour from char_length(btrim(finish)) + 4))
  where finish is not null
    and btrim(finish) <> ''
    and colour is not null
    and lower(colour) like lower(btrim(finish)) || ' - %';
  get diagnostics fixed_orders = row_count;

  -- Nothing anywhere should still carry its own finish as a prefix. If one
  -- does, the repair did not do what it claimed and everything is undone.
  select
    (select count(*) from public.pcd_quote_request_line_items
      where finish is not null and btrim(finish) <> '' and colour is not null
        and lower(colour) like lower(btrim(finish)) || ' - %')
  + (select count(*) from public.pcd_quote_line_items
      where finish is not null and btrim(finish) <> '' and colour is not null
        and lower(colour) like lower(btrim(finish)) || ' - %')
  + (select count(*) from public.pcd_order_line_items
      where finish is not null and btrim(finish) <> '' and colour is not null
        and lower(colour) like lower(btrim(finish)) || ' - %')
  into leftover;

  if leftover > 0 then
    raise exception
      'Stopped: % row(s) still have the finish glued onto the colour after the repair. Nothing has been changed.',
      leftover;
  end if;

  raise notice 'Repaired % quote request line(s), % quote line(s), % order line(s).',
    fixed_requests, fixed_quotes, fixed_orders;
end $$;


-- ---------------------------------------------------------------------------
-- PREVIEW - run this on its own BEFORE the block above. Read-only.
-- ---------------------------------------------------------------------------
-- select
--   'quote request line' as source,
--   finish,
--   colour                                                       as stored_now,
--   btrim(substring(colour from char_length(btrim(finish)) + 4)) as becomes
-- from public.pcd_quote_request_line_items
-- where finish is not null and btrim(finish) <> '' and colour is not null
--   and lower(colour) like lower(btrim(finish)) || ' - %'
-- union all
-- select
--   'quote line',
--   finish,
--   colour,
--   btrim(substring(colour from char_length(btrim(finish)) + 4))
-- from public.pcd_quote_line_items
-- where finish is not null and btrim(finish) <> '' and colour is not null
--   and lower(colour) like lower(btrim(finish)) || ' - %'
-- order by 1, 2, 3;

-- ---------------------------------------------------------------------------
-- VERIFICATION - run this after the block above. Every count should be 0.
-- ---------------------------------------------------------------------------
-- select 'quote request lines' as table_name, count(*) as still_joined
--   from public.pcd_quote_request_line_items
--  where finish is not null and btrim(finish) <> '' and colour is not null
--    and lower(colour) like lower(btrim(finish)) || ' - %'
-- union all
-- select 'quote lines', count(*)
--   from public.pcd_quote_line_items
--  where finish is not null and btrim(finish) <> '' and colour is not null
--    and lower(colour) like lower(btrim(finish)) || ' - %'
-- union all
-- select 'order lines', count(*)
--   from public.pcd_order_line_items
--  where finish is not null and btrim(finish) <> '' and colour is not null
--    and lower(colour) like lower(btrim(finish)) || ' - %';
