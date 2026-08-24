-- The notes typed on a quote line have to reach the workshop
-- ---------------------------------------------------------------------------
--
-- WHAT WAS WRONG. A quote line carries two notes. The internal one, labelled
-- "production, mitres, hinges, runners", is carried onto the order. The other,
-- "Note shown on public quote", was not carried anywhere: accepting the quote
-- raised an order whose lines had never heard of it. Whatever was typed in that
-- box existed only on the quote from then on, so it was not on the order, not
-- on either production view and not on the printed production sheet.
--
-- That is a note about the work, written by the person who sold the work, and
-- the workshop was cutting without it.
--
-- WHAT IS ADDED
--
--   pcd_order_line_items.client_note   what the customer was told about this
--                                      line, carried from the quote line.
--
-- AND THE ORDERS ALREADY RAISED ARE FIXED. A column added today would only
-- help jobs quoted from today, and the jobs on the bench right now are the ones
-- with the problem. Every order line still linked to its quote line is filled
-- in from it below.
--
-- The backfill NEVER OVERWRITES. It fills a note that is empty and leaves any
-- note that already exists exactly as it is, so a note edited on the order
-- since it was raised is not thrown away by a migration.

alter table public.pcd_order_line_items
  add column if not exists client_note text;

comment on column public.pcd_order_line_items.client_note is
  'What the customer was told about this line, carried from the quote line at acceptance. Read only on the order: the quote is the record of what was agreed.';

-- One block, not four statements. A script that errors halfway has already
-- committed whatever ran before it, and a half filled backfill is harder to
-- reason about than one that either happened or did not.
do $$
declare
  filled_client integer := 0;
  filled_internal integer := 0;
begin
  -- The note shown to the customer.
  update public.pcd_order_line_items as o
  set client_note = q.client_note
  from public.pcd_quote_line_items as q
  where o.quote_line_item_id = q.id
    and coalesce(o.client_note, '') = ''
    and coalesce(q.client_note, '') <> '';
  get diagnostics filled_client = row_count;

  -- The internal note. Carried since June, so this only reaches lines on orders
  -- raised before that, which are exactly the ones nobody can explain.
  update public.pcd_order_line_items as o
  set notes = q.notes
  from public.pcd_quote_line_items as q
  where o.quote_line_item_id = q.id
    and coalesce(o.notes, '') = ''
    and coalesce(q.notes, '') <> '';
  get diagnostics filled_internal = row_count;

  raise notice 'Filled % client notes and % internal notes on existing order lines.',
    filled_client, filled_internal;
end $$;

notify pgrst, 'reload schema';
