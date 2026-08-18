-- Customer desk: link what already exists to the customer it belongs to
-- ---------------------------------------------------------------------------
--
-- WHY. 202608182100 added customer_id to enquiries, quote requests and the
-- activity log, but nothing filled it in and no writer set it, so the desk had
-- nothing to show. A quote request came in through the website and did not
-- appear on anybody's desk, because none of these rows knew whose they were.
--
-- The writers are fixed now (see insertQuoteRequest, the enquiries route and
-- logOrderActivity). This is the history.
--
-- ENQUIRIES AND QUOTE REQUESTS NEVER MADE A CUSTOMER AT ALL. They stored the
-- address as text and nothing else, so somebody who filled in the form and then
-- emailed had a customer record from the email and no link back to the form
-- that started it. The first statement below creates the missing records; every
-- one is anchored on the address, which is the same rule the application uses,
-- so nothing can duplicate an existing customer.
--
-- Matching is on lower(email) throughout, the same as the unique index on
-- pcd_customers. A row with no address stays unlinked rather than being guessed
-- at: a wrong customer on somebody's history is worse than a missing one.

-- ── customers that were never created from a form ───────────────────────────
insert into public.pcd_customers (name, email, phone, site_suburb, is_active)
select distinct on (lower(v.email))
  coalesce(nullif(btrim(v.name), ''), v.email),
  lower(v.email),
  nullif(btrim(v.phone), ''),
  nullif(btrim(v.suburb), ''),
  true
from (
  select customer_name as name, customer_email as email, customer_phone as phone,
         delivery_suburb as suburb, created_at
  from public.pcd_quote_requests
  where customer_email is not null and btrim(customer_email) <> ''
  union all
  select customer_name, customer_email, customer_phone, null, created_at
  from public.pcd_enquiries
  where customer_email is not null and btrim(customer_email) <> ''
) as v
where not exists (
  select 1 from public.pcd_customers c where lower(c.email) = lower(v.email)
)
order by lower(v.email), v.created_at desc;

-- ── link the forms ──────────────────────────────────────────────────────────
update public.pcd_quote_requests r
set customer_id = c.id
from public.pcd_customers c
where r.customer_id is null
  and r.customer_email is not null
  and lower(c.email) = lower(r.customer_email);

update public.pcd_enquiries e
set customer_id = c.id
from public.pcd_customers c
where e.customer_id is null
  and e.customer_email is not null
  and lower(c.email) = lower(e.customer_email);

-- ── link the activity, through the quote or the order it belongs to ─────────
update public.pcd_order_activity a
set customer_id = q.customer_id
from public.pcd_quotes q
where a.customer_id is null and a.quote_id = q.id and q.customer_id is not null;

update public.pcd_order_activity a
set customer_id = o.customer_id
from public.pcd_orders o
where a.customer_id is null and a.order_id = o.id and o.customer_id is not null;

-- ── and the quotes and orders themselves, where they were never linked ──────
-- Both carry a customer_email of their own, and a quote raised before the
-- customer record existed can still be matched to it now.
update public.pcd_quotes q
set customer_id = c.id
from public.pcd_customers c
where q.customer_id is null
  and q.customer_email is not null
  and lower(c.email) = lower(q.customer_email);

update public.pcd_orders o
set customer_id = c.id
from public.pcd_customers c
where o.customer_id is null
  and o.customer_email is not null
  and lower(c.email) = lower(o.customer_email);

notify pgrst, 'reload schema';
