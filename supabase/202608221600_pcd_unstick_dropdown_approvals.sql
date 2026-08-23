-- THREE QUOTES STUCK AS "APPROVED" WITH NO ORDER BEHIND THEM.
--
-- WHY THEY EXIST. The quote editor had a Status dropdown with "Approved" on it.
-- Choosing it wrote the word and raised no order. Sealing accepted quotes then
-- made those records unusable: an approved quote is permanently read only, and
-- the refusal tells you to raise a variation on the order, which does not exist.
-- So they cannot be edited, cannot be un-accepted, and have nothing to raise a
-- variation against.
--
-- HOW WE KNOW they were never real acceptances: approved_at is null on all
-- three. Every genuine acceptance, by a customer or by staff, sets it. The
-- dropdown did not.
--
-- ── WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────
--
-- It puts them back where they were before somebody chose the wrong dropdown
-- value: sent if they had been sent, draft if they had not. That makes them
-- editable and sendable again.
--
-- It does NOT raise their orders, and that is the important half.
--
-- Raising an order here would mean writing an acceptance nobody gave. There is
-- no record of who accepted, when, or how, because none was ever taken. SQL
-- cannot invent one honestly. If any of these three genuinely were accepted,
-- open the quote and press "Accept for the customer", which raises the order and
-- records who said yes and how they said it. That takes ten seconds and produces
-- a record that means something.
--
-- Nothing priced is touched.

-- ---------------------------------------------------------------------------
-- LOOK FIRST. What are these three?
-- ---------------------------------------------------------------------------
-- select q.quote_number, q.customer_name, q.total_inc_gst, q.status,
--        q.sent_at, q.viewed_at, q.approved_at, q.created_at
--   from public.pcd_quotes q
--   left join public.pcd_orders o on o.quote_id = q.id
--  where q.status = 'approved' and o.id is null and q.approved_at is null
--  order by q.created_at;

do $$
declare
  moved int;
  quote_row record;
begin
  -- Scoped hard. Only a quote that says approved, has NO order, and has no
  -- approved_at. A real acceptance always sets approved_at, so this cannot
  -- reach one however many quotes are added between writing and running it.
  for quote_row in
    select q.id, q.quote_number, q.sent_at
      from public.pcd_quotes q
      left join public.pcd_orders o on o.quote_id = q.id
     where q.status = 'approved'
       and o.id is null
       and q.approved_at is null
  loop
    update public.pcd_quotes
       set status = case when quote_row.sent_at is not null then 'sent' else 'draft' end
     where id = quote_row.id;

    -- A record of the correction, so a quote that changed status overnight has
    -- a reason attached rather than appearing to have moved on its own.
    insert into public.pcd_order_activity
      (quote_id, actor_type, action_type, title, description, event_key, created_at)
    values (
      quote_row.id,
      'system',
      'quote_approval_unstuck',
      'Quote status corrected',
      'This quote was marked approved from the status dropdown, which never raised an order and left the quote read only with nothing behind it. It has been put back to ' ||
        case when quote_row.sent_at is not null then 'sent' else 'draft' end ||
        ' so it can be worked on. If the customer did accept it, use "Accept for the customer" on the quote, which raises the order and records who accepted and how.',
      format('quote:%s:approval_unstuck_20260822', quote_row.id),
      timezone('utc', now())
    )
    on conflict do nothing;
  end loop;

  get diagnostics moved = row_count;
  raise notice 'Quotes put back so they can be worked on again. Check the list below is now empty.';
end $$;


-- ---------------------------------------------------------------------------
-- CHECK AFTERWARDS. Should return no rows.
--
-- Anything still here says approved, has no order, AND has an approved_at, which
-- would mean a real acceptance whose order failed to be raised. That is a
-- different problem and worth telling me about rather than running anything at.
-- ---------------------------------------------------------------------------
select q.quote_number, q.status, q.approved_at, q.sent_at
  from public.pcd_quotes q
  left join public.pcd_orders o on o.quote_id = q.id
 where q.status = 'approved' and o.id is null
 order by q.quote_number;
