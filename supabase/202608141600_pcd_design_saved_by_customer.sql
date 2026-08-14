-- Save & share on the public planner: capture who saved a design, and make the
-- one-customer-per-email rule provable rather than assumed.
--
-- Two things happen here:
--   1. pcd_design_projects gets a customer_id, so a saved design is attached to
--      the person who saved it and staff can see whose it is.
--   2. Any duplicate email addresses already in pcd_customers are merged, then
--      the unique index on lower(email) is (re)asserted.
--
-- Point 2 matters because the index is declared in quote_project_workflow_setup
-- with "if not exists", which quietly does nothing when it failed the first time
-- because duplicates were already present. If that happened, the application's
-- find-or-create is the only thing standing between us and two records for one
-- person. After this runs, the database enforces it.
--
-- Everything is idempotent, so running it twice is harmless.

-- ── 1. who saved the design ─────────────────────────────────────────────────
alter table public.pcd_design_projects
  add column if not exists customer_id uuid references public.pcd_customers(id) on delete set null;

create index if not exists idx_pcd_design_projects_customer
  on public.pcd_design_projects(customer_id);

-- ── 2. merge duplicate customers, then enforce uniqueness ───────────────────
do $$
declare
  dupe record;
  keeper uuid;
begin
  -- Work through each email that appears on more than one row. The oldest
  -- record wins, because it is the one other tables are most likely already
  -- pointing at.
  for dupe in
    select lower(email) as email_key, count(*) as n
    from public.pcd_customers
    where email is not null and email <> ''
    group by lower(email)
    having count(*) > 1
  loop
    select id into keeper
    from public.pcd_customers
    where lower(email) = dupe.email_key
    order by created_at asc, id asc
    limit 1;

    raise notice 'Merging % duplicate customer rows for %', dupe.n, dupe.email_key;

    -- Fill any blank on the keeper from its duplicates before they go, so
    -- merging never loses a phone number or an address.
    update public.pcd_customers k
    set
      name         = coalesce(nullif(k.name, ''), nullif(k.name, 'Customer'), d.name),
      phone        = coalesce(nullif(k.phone, ''), d.phone),
      site_address = coalesce(nullif(k.site_address, ''), d.site_address),
      company_name = coalesce(nullif(k.company_name, ''), d.company_name),
      notes        = coalesce(nullif(k.notes, ''), d.notes)
    from (
      select
        max(name)         filter (where name is not null and name <> '' and name <> 'Customer') as name,
        max(phone)        filter (where phone is not null and phone <> '')        as phone,
        max(site_address) filter (where site_address is not null and site_address <> '') as site_address,
        max(company_name) filter (where company_name is not null and company_name <> '') as company_name,
        max(notes)        filter (where notes is not null and notes <> '')        as notes
      from public.pcd_customers
      where lower(email) = dupe.email_key and id <> keeper
    ) d
    where k.id = keeper;

    -- Repoint everything that references a losing row.
    update public.pcd_quotes set customer_id = keeper
      where customer_id in (select id from public.pcd_customers where lower(email) = dupe.email_key and id <> keeper);
    update public.pcd_projects set customer_id = keeper
      where customer_id in (select id from public.pcd_customers where lower(email) = dupe.email_key and id <> keeper);
    update public.pcd_orders set customer_id = keeper
      where customer_id in (select id from public.pcd_customers where lower(email) = dupe.email_key and id <> keeper);
    update public.pcd_design_projects set customer_id = keeper
      where customer_id in (select id from public.pcd_customers where lower(email) = dupe.email_key and id <> keeper);

    delete from public.pcd_customers
      where lower(email) = dupe.email_key and id <> keeper;
  end loop;
end $$;

-- Now that no duplicates remain, this can actually be created. Dropped first so
-- a version that failed to apply earlier does not leave us thinking it is there.
drop index if exists public.idx_pcd_customers_email_unique;
create unique index idx_pcd_customers_email_unique
  on public.pcd_customers (lower(email))
  where email is not null and email <> '';
