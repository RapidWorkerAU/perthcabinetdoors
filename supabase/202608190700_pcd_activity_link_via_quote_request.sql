-- Activity: link the rows that point only at a quote request
-- ---------------------------------------------------------------------------
--
-- 202608190300 linked activity through the quote or the order it belonged to.
-- It missed the rows attached to a quote REQUEST and nothing else, which is
-- every "quote request received" event: 46 of them, all from before a request
-- knew whose it was.
--
-- Now that pcd_quote_requests carries customer_id, they can be traced.
--
-- The rows with nothing attached at all stay unlinked. There is nothing to
-- match them on, and a guess would put somebody else's history on a customer's
-- desk, which is worse than an event that is not shown.

update public.pcd_order_activity a
set customer_id = r.customer_id
from public.pcd_quote_requests r
where a.customer_id is null
  and a.quote_request_id = r.id
  and r.customer_id is not null;

notify pgrst, 'reload schema';
