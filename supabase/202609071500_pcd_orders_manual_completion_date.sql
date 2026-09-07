-- Orders: the completion date is typed, not worked out
-- ---------------------------------------------------------------------------
--
-- WHY. Scheduling an order used to be a start date plus a timeframe picked from
-- a list of eight fixed lengths, with target_completion_date worked out from
-- the two and pulled back off a weekend. That is only honest while every job
-- takes one of those eight lengths, and real jobs do not: a job needing the
-- bench for nine days had to be called a week or two weeks, and a job waiting
-- on a supplier delivery could not be described at all.
--
-- Both dates are now typed by the person scheduling the work:
--
--   scheduled_start_date     the day the job goes on the bench
--   target_completion_date   the day it is expected to be finished
--
-- NOTHING IS LOST BY DROPPING production_lead_days. Every order that had a
-- start date and a timeframe already has the date those two produced sitting in
-- target_completion_date, written there on every save. An order that had a
-- timeframe and NO start date never had a completion date to lose, because one
-- was never worked out for it; that order now reads as unscheduled, which is
-- what it always was.
--
-- The list of timeframes in Settings > Lists goes with it. It described a
-- choice that no longer exists, and the rows are deleted rather than left to
-- sit in a list nothing reads.
--
-- Run this AFTER deploying the code that stops writing the column.

begin;

-- 1. The column and the check that went with it.
alter table public.pcd_orders
  drop constraint if exists pcd_orders_production_lead_days_positive;

alter table public.pcd_orders
  drop column if exists production_lead_days;

-- 2. What the two remaining columns mean now.
comment on column public.pcd_orders.scheduled_start_date is
  'The day the job is booked to start. Typed by hand. Jobs are scheduled rather than all begun at once.';

comment on column public.pcd_orders.target_completion_date is
  'The day the job is expected to be finished. Typed by hand, never worked out from the start date. Must not be earlier than scheduled_start_date; that pair is checked in lib/pcd-order-schedule.js before a save.';

-- 3. The timeframes vocabulary, which described a choice nothing offers now.
delete from public.pcd_list_items
  where list_key = 'production_timeframes';

commit;
