-- ARCHIVING A FINISHED JOB MUST NOT FORGET WHEN IT FINISHED.
--
-- Two migrations written an hour apart, and together they lose a date.
--
-- 202608240900 added a trigger that clears completed_at whenever an order stops
-- being 'complete', which is right for a job being reopened: the old completion
-- date is not true any more.
--
-- 202608241000 then made 'archived' a status. So archiving a finished job takes
-- it from 'complete' to 'archived', the trigger reads that as no longer
-- complete, and wipes completed_at. Restore it and the status goes back to
-- 'complete' with nothing recorded, so the trigger stamps TODAY. A job finished
-- in June, archived by mistake and restored, comes back looking finished this
-- morning, and its unpaid balance sits at the bottom of the board under debts a
-- fraction of its age.
--
-- ARCHIVING IS NOT REOPENING. It is the record being put away, not the work
-- being undone, so the completion date is left exactly where it was.

create or replace function public.pcd_orders_stamp_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'complete' and coalesce(old.status, '') <> 'complete' then
    -- Finished. Keep a date already recorded, which is what makes restoring an
    -- archived job put its real completion date back rather than today's.
    new.completed_at := coalesce(new.completed_at, timezone('utc', now()));
  elsif new.status = 'archived' then
    -- Put away, not reopened. Whatever it knew, it still knows.
    new.completed_at := old.completed_at;
  elsif new.status <> 'complete' then
    -- Genuinely not finished any more: reopened, put on hold, cancelled. The
    -- old completion date would be a lie, and a stale clock if it is finished
    -- again later.
    new.completed_at := null;
  end if;
  return new;
end $$;

comment on function public.pcd_orders_stamp_completed_at is
  'Keeps pcd_orders.completed_at honest. Stamps it when a job is finished, leaves it alone when the record is archived, and clears it when the job is genuinely reopened.';

-- REPAIRING WHAT THE OLD TRIGGER ALREADY WIPED.
--
-- An order archived between the two migrations landing lost its date. There is
-- one thing left that remembers roughly when: the status it was archived from.
-- Where that says 'complete' and the date is gone, updated_at is the closest
-- honest guess, and it is at least older than today.
do $$
declare
  repaired int := 0;
begin
  update public.pcd_orders
     set completed_at = coalesce(updated_at, created_at)
   where status = 'archived'
     and archived_from_status = 'complete'
     and completed_at is null;
  get diagnostics repaired = row_count;
  raise notice 'Archived jobs given their completion date back: %', repaired;
end $$;

select status, archived_from_status, count(*) as orders, count(completed_at) as with_completion_date
  from public.pcd_orders
 group by status, archived_from_status
 order by orders desc;
