-- Structured site address, so a delivery run can be planned by suburb.
--
-- site_address has always been one free text column, which is fine to print on
-- a quote and useless for sorting a run or checking we are inside the metro
-- zone. Quote acceptance now captures street, suburb and postcode separately,
-- so those get real columns.
--
-- site_address IS STILL WRITTEN. Everything downstream reads it: the order, the
-- admin list, the quote PDF. The application writes the joined one-liner there
-- as well as the parts, so nothing has to change to keep working. These columns
-- are additive, not a replacement.
--
-- Idempotent, so running it twice is harmless.

alter table public.pcd_customers
  add column if not exists site_street   text,
  add column if not exists site_suburb   text,
  add column if not exists site_postcode text;

alter table public.pcd_quotes
  add column if not exists site_street   text,
  add column if not exists site_suburb   text,
  add column if not exists site_postcode text;

-- Orders inherit the address from the quote at acceptance, so they need the
-- same three or the detail is lost at the point it is most needed.
alter table public.pcd_orders
  add column if not exists site_street   text,
  add column if not exists site_suburb   text,
  add column if not exists site_postcode text;

-- Planning a run means "everything in these suburbs this week".
create index if not exists idx_pcd_orders_site_suburb   on public.pcd_orders(site_suburb);
create index if not exists idx_pcd_orders_site_postcode on public.pcd_orders(site_postcode);

-- ── backfill what can be read confidently ───────────────────────────────────
--
-- Only rows shaped "<street>, <suburb> <postcode>" are split, which is the
-- format the application has always written. Anything else is left alone rather
-- than guessed at: a half-parsed address is worse than an unparsed one, because
-- it looks complete. Those rows simply prompt the customer at acceptance.
do $$
declare
  updated_customers int;
  updated_quotes int;
begin
  update public.pcd_customers
  set
    site_postcode = (regexp_match(site_address, '(\d{4})\s*$'))[1],
    site_suburb   = btrim((regexp_match(site_address, ',\s*([^,]+?)\s*(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)?\s*\d{4}\s*$'))[1]),
    site_street   = btrim((regexp_match(site_address, '^(.*),[^,]*\d{4}\s*$'))[1])
  where site_address is not null
    and site_address ~ ',[^,]*\d{4}\s*$'
    and site_street is null;
  get diagnostics updated_customers = row_count;

  update public.pcd_quotes
  set
    site_postcode = (regexp_match(site_address, '(\d{4})\s*$'))[1],
    site_suburb   = btrim((regexp_match(site_address, ',\s*([^,]+?)\s*(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)?\s*\d{4}\s*$'))[1]),
    site_street   = btrim((regexp_match(site_address, '^(.*),[^,]*\d{4}\s*$'))[1])
  where site_address is not null
    and site_address ~ ',[^,]*\d{4}\s*$'
    and site_street is null;
  get diagnostics updated_quotes = row_count;

  raise notice 'Split % customer and % quote addresses. Anything not in "street, suburb postcode" form was left for the customer to confirm at acceptance.',
    updated_customers, updated_quotes;
end $$;
