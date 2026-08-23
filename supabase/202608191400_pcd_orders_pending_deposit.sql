-- Orders: a "pending deposit" status
-- ---------------------------------------------------------------------------
--
-- WHY. When a quote requires a deposit, the order is created the moment the
-- customer clicks accept, BEFORE any money arrives. It was created with
-- status 'active' and accepted_at null, which made it indistinguishable in the
-- orders list from a job somebody had actually paid for. A customer who opened
-- the Stripe page and closed it left a permanent phantom active order.
--
-- The order now starts life as 'pending_deposit' and is promoted to 'active'
-- when the deposit is paid. See lib/pcd-order-deposit.js, which is the single
-- place that decides this for both Stripe and hand-entered payments.
--
-- SAFE TO RE-RUN. The constraint is dropped and recreated, and the backfill
-- only touches rows that are unambiguously phantoms.

alter table public.pcd_orders
  drop constraint if exists pcd_orders_status_check;

alter table public.pcd_orders
  add constraint pcd_orders_status_check
  check (status in ('pending_deposit', 'active', 'on_hold', 'complete', 'cancelled'));

comment on column public.pcd_orders.status is
  'pending_deposit = raised from an accepted quote, deposit not yet paid, not confirmed work. Promoted to active when the deposit lands.';

-- ── backfill ────────────────────────────────────────────────────────────────
--
-- Two different broken rows can exist, and they must not be treated the same.
--
--   deposit_paid true, accepted_at null
--     A REAL job. The deposit was ticked by hand and the old admin code forgot
--     to stamp accepted_at. Stays active, gets its stamp back.
--
--   deposit_paid false, accepted_at null
--     A phantom from an abandoned checkout. Becomes pending_deposit.
--
-- Both counted zero when this was written. They are handled anyway, because a
-- migration that only works on one database is not a migration.

update public.pcd_orders
set accepted_at = coalesce(deposit_paid_at::timestamptz, updated_at, created_at)
where status = 'active'
  and accepted_at is null
  and deposit_paid;

update public.pcd_orders
set status = 'pending_deposit'
where status = 'active'
  and accepted_at is null
  and deposit_required
  and not deposit_paid;

-- The orders list opens on this status, so it is worth an index of its own.
create index if not exists pcd_orders_pending_deposit_idx
  on public.pcd_orders (created_at desc)
  where status = 'pending_deposit';
