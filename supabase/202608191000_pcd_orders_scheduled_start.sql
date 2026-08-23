-- Orders: a scheduled start date, and a due date that follows from it
-- ---------------------------------------------------------------------------
--
-- WHY. target_completion_date was typed in by hand, so it was a guess written
-- down rather than a date the workshop could plan against. As we get busier
-- every job cannot start at once, so the thing worth recording is when a job is
-- SCHEDULED TO START. The due date then follows from the start plus how long
-- the job takes, and stops being a separate opinion that can quietly disagree
-- with the schedule.
--
-- WHAT IS ADDED
--
--   scheduled_start_date   the day the job is booked to go on the bench
--   production_lead_days   how long it takes, in calendar days, chosen from a
--                          fixed list (see lib/pcd-order-schedule.js)
--
-- target_completion_date is KEPT and is now derived: start plus lead days,
-- pulled back to the Friday if it lands on a weekend. It stays a real column
-- rather than a computed one so that every existing hand-typed date survives
-- untouched, and so anything already reading it keeps working.
--
-- Nothing here changes an existing row. Both columns are nullable, both start
-- empty, and no order's current target date is rewritten by this file.

alter table public.pcd_orders
  add column if not exists scheduled_start_date date,
  add column if not exists production_lead_days integer;

comment on column public.pcd_orders.scheduled_start_date is
  'The day the job is booked to start. Jobs are scheduled rather than all begun at once.';
comment on column public.pcd_orders.production_lead_days is
  'How long the job takes in calendar days. Chosen from the fixed list in lib/pcd-order-schedule.js.';
comment on column public.pcd_orders.target_completion_date is
  'Due date. Derived from scheduled_start_date plus production_lead_days when both are set, pulled back to the Friday if it falls on a weekend. Older orders may hold a hand-typed date with no schedule behind it.';

-- Sane values only. Left permissive on purpose: the allowed timeframes live in
-- lib/pcd-order-schedule.js and will change as the workshop's capacity does,
-- and a check constraint listing them here would need a migration every time.
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'pcd_orders'
      and constraint_name = 'pcd_orders_production_lead_days_positive'
  ) then
    alter table public.pcd_orders
      add constraint pcd_orders_production_lead_days_positive
      check (production_lead_days is null or production_lead_days > 0);
  end if;
end $$;

-- The scheduling view: what is starting, and when. Ordered so the next job on
-- the bench is the first row.
create index if not exists pcd_orders_scheduled_start_idx
  on public.pcd_orders (scheduled_start_date)
  where scheduled_start_date is not null and status <> 'cancelled';
