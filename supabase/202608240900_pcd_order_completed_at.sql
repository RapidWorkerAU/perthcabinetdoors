-- WHEN A JOB WAS FINISHED.
--
-- The board is being given a card for a completed job with money still owed on
-- it, and a card needs a clock. There was nothing to count from: pcd_orders
-- records accepted_at and a target_completion_date we promised, but nothing for
-- the day the work was actually done.
--
-- updated_at is not that date. It moves every time somebody edits a note, so a
-- job finished in June and touched yesterday would read as one day old and sit
-- at the bottom of the board under jobs half its age.
--
-- Set when the status becomes 'complete', and cleared if it is reopened, so the
-- clock is about the work rather than about our typing.
--
-- One do block, because the Supabase SQL editor pools connections and a script
-- that errors part way through has already committed what ran before it.

do $$
declare
  backfilled int := 0;
begin
  alter table public.pcd_orders
    add column if not exists completed_at timestamptz;

  -- WHAT THE BACKFILL CAN AND CANNOT KNOW.
  --
  -- For jobs already marked complete the day it happened is gone. updated_at is
  -- the closest thing on the row, and it is at least the last time anybody
  -- touched the job, so an old finished job reads as old rather than as new.
  -- Only where it is missing, so re-running this cannot overwrite a real date.
  update public.pcd_orders
     set completed_at = coalesce(updated_at, created_at)
   where status = 'complete'
     and completed_at is null;
  get diagnostics backfilled = row_count;

  raise notice 'Completed orders given a completion date: %', backfilled;
end $$;

comment on column public.pcd_orders.completed_at is
  'When the job was marked complete. The board clocks an unpaid balance from here, because updated_at moves whenever anybody edits the order and would make an old debt look new.';

-- The API writes this itself when the status changes, so nothing depends on a
-- trigger. This keeps rows changed by hand in the Supabase table editor honest.
create or replace function public.pcd_orders_stamp_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'complete' and coalesce(old.status, '') <> 'complete' then
    new.completed_at := coalesce(new.completed_at, timezone('utc', now()));
  elsif new.status <> 'complete' then
    -- Reopened. The old completion date is not true any more, and leaving it
    -- would put a stale clock on the job if it is finished again later.
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists pcd_orders_completed_at on public.pcd_orders;
create trigger pcd_orders_completed_at
  before update on public.pcd_orders
  for each row
  execute function public.pcd_orders_stamp_completed_at();

notify pgrst, 'reload schema';

select status, count(*) as orders, count(completed_at) as with_completion_date
  from public.pcd_orders
 group by status
 order by orders desc;
