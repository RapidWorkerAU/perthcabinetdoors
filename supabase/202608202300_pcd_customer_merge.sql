-- One person, more than one customer record.
--
-- WHY. The same person writes from two addresses, or their partner answers on
-- their behalf, and the mail sync makes a second customer record because it has
-- nothing else to go on. Kristy Smith has a quote, an order and 17 messages
-- under her outlook address and another 9 under her gmail one. Same person,
-- same job, counted twice everywhere.
--
-- HOW. NOTHING IS EVER MOVED. A record is marked as belonging to another, and
-- everything that reads a customer resolves through that link. Quotes, orders,
-- tickets and messages stay exactly where they were written.
--
-- That is what makes unmerging exact. Undoing it is deleting the link, and
-- every row is already sitting where it always was. Repointing rows onto the
-- primary and archiving the other record cannot be undone honestly: anything
-- edited while merged has no way to say which record it started on.
--
-- ONE LEVEL ONLY, enforced below. A secondary cannot have secondaries of its
-- own, and you cannot merge into a record that is already somebody's secondary.
-- Chains would turn "who is the primary" into a walk instead of a lookup.

alter table public.pcd_customers
  add column if not exists merged_into_id uuid references public.pcd_customers(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by text;

comment on column public.pcd_customers.merged_into_id is
  'The customer record this one belongs to. Null means this record is a primary. Set means it is a secondary contact: its own rows stay where they are and are read through the primary.';

create index if not exists pcd_customers_merged_into_idx
  on public.pcd_customers(merged_into_id)
  where merged_into_id is not null;

-- A record cannot belong to itself.
alter table public.pcd_customers
  drop constraint if exists pcd_customers_not_merged_into_self;
alter table public.pcd_customers
  add constraint pcd_customers_not_merged_into_self
  check (merged_into_id is null or merged_into_id <> id);

-- And no chains. Refusing this in the database as well as in the app, because a
-- chain formed by a bad write would break the customer page for both people and
-- there would be nothing on screen to explain why.
create or replace function public.pcd_customers_no_merge_chains()
returns trigger
language plpgsql
as $$
begin
  if new.merged_into_id is not null then
    -- The record it is being merged into must be a primary itself.
    if exists (
      select 1 from public.pcd_customers c
       where c.id = new.merged_into_id and c.merged_into_id is not null
    ) then
      raise exception 'That record already belongs to somebody else. Merge into the primary contact instead.';
    end if;

    -- And this record must not already own contacts of its own.
    if exists (
      select 1 from public.pcd_customers c
       where c.merged_into_id = new.id
    ) then
      raise exception 'That record has contacts of its own. Separate them first, then merge it.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pcd_customers_no_merge_chains_trg on public.pcd_customers;
create trigger pcd_customers_no_merge_chains_trg
  before insert or update of merged_into_id on public.pcd_customers
  for each row execute function public.pcd_customers_no_merge_chains();

-- Records that look like the same person, to check before merging anything.
-- Matched on name only: no two records share an address, and two people at one
-- house genuinely have different ones.
--
-- select c.name,
--        c.email,
--        c.id,
--        (select count(*) from public.pcd_quotes q where q.customer_id = c.id)   as quotes,
--        (select count(*) from public.pcd_orders o where o.customer_id = c.id)   as orders,
--        (select count(*) from public.pcd_messages m where m.customer_id = c.id) as messages
--   from public.pcd_customers c
--  where c.merged_into_id is null
--    and lower(btrim(c.name)) in (
--      select lower(btrim(name)) from public.pcd_customers
--       where merged_into_id is null and coalesce(btrim(name), '') <> ''
--       group by lower(btrim(name)) having count(*) > 1
--    )
--  order by lower(btrim(c.name)), quotes desc, messages desc;
