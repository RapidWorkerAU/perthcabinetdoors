-- ALREADY DONE. RUNNING THIS AGAIN CHANGES NOTHING, BY DESIGN.
--
-- ── WHAT THIS FILE ORIGINALLY DID, AND WHY IT NO LONGER DOES IT ──────────────
--
-- Quote PCD-Q-2026-FD6DFB, Glen & Dana Taylor, was stranded by the old approval
-- flow: they clicked Approve on 25 August, an order was raised five seconds
-- later before any deposit was paid, and their own link then locked them out
-- because it reads an approved quote as finished. No money was ever taken.
--
-- The first version of this file put the quote into 'awaiting_deposit' and
-- cancelled the order. That was a MISTAKE OF SEQUENCING: the deposit gate code
-- had not been deployed, so the live admin had no tab for that status and the
-- quote fell between all five of them. It was still there under All, but
-- effectively invisible to anyone navigating by tab. A live record should never
-- be put into a state the running code cannot display.
--
-- It was then finished by hand instead:
--
--   the quote   set to 'viewed', which is true (sent 14 Aug, opened 14 Aug,
--               never validly accepted) and which BOTH the current code and the
--               deposit gate understand. Access code 8F2F203E unchanged, so
--               their link still works. All 6 line items and the $2,922.70
--               intact.
--   the order   PCD-O-2026-BCB1CC deleted outright, with its unpaid deposit
--               line and its line items. It was created by a bug and no money
--               ever touched it, so leaving it in Cancelled would have meant a
--               job that never existed sitting there looking like one that fell
--               through.
--   the record  written against the QUOTE rather than the order, so it survived
--               the order being removed. See action_type
--               'order_deleted_bug_cleanup' and 'quote_status_corrected'.
--   the customer was NOT contacted. Done as a direct database change, which
--               runs no application code and so had no path to send anything.
--
-- ── WHY THE FILE IS KEPT ─────────────────────────────────────────────────────
--
-- Deleting it would leave a gap in the numbered sequence and no explanation for
-- an order number that appears in the activity log and nowhere else. It is kept
-- as the record, and made inert so that re-running the folder cannot undo the
-- fix. The guard below is the whole point: without it, running this again would
-- put the quote back into the state that caused the problem.

begin;

do $$
declare
  v_quote_id uuid;
  v_order_id uuid;
begin
  select id into v_quote_id
  from public.pcd_quotes
  where quote_number = 'PCD-Q-2026-FD6DFB';

  if v_quote_id is null then
    raise notice 'PCD-Q-2026-FD6DFB is not here. Nothing to do.';
    return;
  end if;

  -- THE GUARD. The stranded order is what this file existed to clean up. It is
  -- gone, so there is nothing left to clean up and nothing below should run.
  select id into v_order_id
  from public.pcd_orders
  where quote_id = v_quote_id
    and status = 'pending_deposit';

  if v_order_id is null then
    raise notice 'Already done: no stranded order on PCD-Q-2026-FD6DFB. Leaving the quote as it is.';
    return;
  end if;

  -- Only reachable if a pending_deposit order somehow exists on this quote
  -- again, which would mean the old flow had run once more.
  raise exception
    'A pending_deposit order exists on PCD-Q-2026-FD6DFB again (%). Deal with it by hand: this file is a record of a fix already applied, not a repair tool.',
    v_order_id;
end $$;

commit;

-- Check the end state:
--
--   select q.quote_number, q.status, q.access_code, q.order_id,
--          (select count(*) from public.pcd_quote_line_items l where l.quote_id = q.id) as lines,
--          (select count(*) from public.pcd_orders o where o.quote_id = q.id) as orders
--   from public.pcd_quotes q
--   where q.quote_number = 'PCD-Q-2026-FD6DFB';
--
-- Expect: viewed, 8F2F203E, order_id null, 6 lines, 0 orders.
