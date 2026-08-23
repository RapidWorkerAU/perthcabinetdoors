-- ARCHIVING A QUOTE OR AN ORDER.
--
-- WHAT ARCHIVED MEANS. The record is still there and can still be opened, but it
-- has stopped counting: no board card, no line in the financials, nothing in the
-- dashboard totals, and not in the lists unless you go looking for it. It is for
-- the job that was quoted twice, the order raised by mistake, the enquiry that
-- turned into nothing. Cancelled says "this was called off". Archived says "stop
-- showing me this".
--
-- WHY IT IS A STATUS AND NOT A FLAG. Nearly every query in the app already
-- filters on status, usually with an explicit list of the ones it wants. Making
-- archived a status means those queries exclude it the moment it is set, rather
-- than each one having to remember a separate flag it has never heard of. The
-- ones that DO need changing are the handful that take everything.
--
-- HOW RESTORE IS EXACT. Overwriting the status would lose what the thing
-- actually was, so archiving records it in archived_from_status and restoring
-- puts it back. A quote archived while it was 'approved' comes back approved,
-- not as a draft.
--
-- One do block, because the Supabase SQL editor pools connections and a script
-- that errors part way through has already committed what ran before it.

do $$
declare
  drops text;
begin
  -- ── the two columns that make restore exact ──────────────────────────────
  alter table public.pcd_quotes
    add column if not exists archived_at timestamptz,
    add column if not exists archived_from_status text;

  alter table public.pcd_orders
    add column if not exists archived_at timestamptz,
    add column if not exists archived_from_status text;

  -- ── the status lists, widened ────────────────────────────────────────────
  --
  -- Found by name rather than assumed: these constraints were written in two
  -- different files years apart, so neither name can be relied on and dropping
  -- one that is not there fails the whole block.
  --
  -- MATCHED ON 'ANY' AS WELL AS 'status'. Postgres does not store the
  -- constraint the way it was typed: "status in ('a','b')" comes back as
  -- "((status)::text = ANY (ARRAY[...]))". So looking for "status in (" finds
  -- nothing, and looking for "status" alone would also catch a plain
  -- "status is not null" check and drop it. Both together is the status list
  -- and nothing else.
  select coalesce(
           string_agg(format('alter table public.%I drop constraint %I;', rel.relname, con.conname), ' '),
           ''
         )
    into drops
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname in ('pcd_quotes', 'pcd_orders')
     and con.contype = 'c'
     -- pg_get_constraintdef takes the constraint's OID, not the row.
     and pg_get_constraintdef(con.oid) ilike '%status%'
     and pg_get_constraintdef(con.oid) ilike '%ANY%';

  if drops <> '' then
    execute drops;
    raise notice 'Status constraints replaced: %', drops;
  end if;

  alter table public.pcd_quotes
    add constraint pcd_quotes_status_check
    check (status in ('draft', 'sent', 'viewed', 'approved', 'rejected', 'archived'));

  alter table public.pcd_orders
    add constraint pcd_orders_status_check
    check (status in ('pending_deposit', 'active', 'on_hold', 'complete', 'cancelled', 'archived'));
end $$;

comment on column public.pcd_quotes.archived_at is
  'When this quote was archived. Null means it is live. Archived records still open, they just stop counting anywhere.';
comment on column public.pcd_quotes.archived_from_status is
  'The status it held when it was archived, so restoring puts it back exactly rather than guessing at draft.';
comment on column public.pcd_orders.archived_at is
  'When this order was archived. Null means it is live.';
comment on column public.pcd_orders.archived_from_status is
  'The status it held when it was archived, so restoring puts it back exactly.';

-- Every list that hides archived rows filters on status, so this is the index
-- those filters use.
create index if not exists pcd_quotes_status_idx on public.pcd_quotes (status);
create index if not exists pcd_orders_status_idx on public.pcd_orders (status);

notify pgrst, 'reload schema';

select 'quotes' as table_name, status, count(*) from public.pcd_quotes group by status
union all
select 'orders', status, count(*) from public.pcd_orders group by status
order by table_name, count desc;
