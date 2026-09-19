-- THE CREDIT THAT WAS NEVER WRITTEN, AND THE LOG ENTRY THAT WENT WITH IT.
--
-- ── WHAT WENT WRONG ──────────────────────────────────────────────────────────
--
-- A site measure booking created its customer, its calendar event and its two
-- emails, and then did nothing else. The credit was only ever written on the
-- CANCELLATION path, which is the one nobody takes.
--
-- So every customer who booked, paid and went ahead had no credit at all. The
-- promise made on the booking page, in the tick box they had to agree to, in
-- their confirmation email and in the cancellation policy, that the fee comes
-- off any order that follows, did nothing. Silently, on every booking.
--
-- The code is fixed: lib/pcd-site-measure-booking.js now writes the credit the
-- moment the fee clears. This repairs the bookings taken before that.
--
-- ── AND THE CUSTOMER'S OWN LOG ───────────────────────────────────────────────
--
-- Nothing was written to pcd_order_activity either, so a hundred dollars
-- arriving left no trace on the one screen somebody opens to ask what has
-- happened with a customer. Backfilled here with the same shape the code now
-- writes, so an old booking and a new one read identically.
--
-- ── SAFE TO RUN TWICE ────────────────────────────────────────────────────────
--
-- The credit insert skips any booking that already has one, which the unique
-- index on site_measure_booking_id would refuse anyway. The activity insert is
-- keyed on event_key, which is unique, so a second run writes nothing.

do $$
declare
  made_credits integer := 0;
  made_entries integer := 0;
begin

  -- ── the credits ───────────────────────────────────────────────────────────
  --
  -- Only bookings that are still live and were actually paid for. A cancelled
  -- one has already been settled, one way or the other, and must not have a
  -- second hundred dollars minted against it now.
  with repaired as (
    insert into public.pcd_customer_credits (
      customer_id, amount, currency, reason, paid_on, state,
      site_measure_booking_id, notes
    )
    select
      b.customer_id,
      b.fee_amount,
      'AUD',
      'site_measure',
      (b.fee_paid_at at time zone 'UTC')::date,
      'available',
      b.id,
      'Site measure fee paid on ' || to_char(b.booking_date, 'DD Mon YYYY') ||
        '. Credit written by the backfill in 202609201000.'
    from public.pcd_site_measure_bookings b
    where b.status = 'booked'
      and b.fee_paid_at is not null
      and b.customer_id is not null
      and b.fee_amount > 0
      and not exists (
        select 1 from public.pcd_customer_credits c
        where c.site_measure_booking_id = b.id
      )
    returning 1
  )
  select count(*) into made_credits from repaired;

  -- ── the log entries ───────────────────────────────────────────────────────
  --
  -- Dated when the money arrived, not when this ran, or the customer's log
  -- would show a booking from last month appearing today.
  with logged as (
    insert into public.pcd_order_activity (
      customer_id, actor_type, action_type, title, description, metadata, event_key, created_at
    )
    select
      b.customer_id,
      'customer',
      'site_measure_booked',
      'Site measure booked and paid for',
      to_char(b.booking_date, 'FMDay FMDD FMMonth YYYY') || ', between ' ||
        to_char(b.window_from, 'FMHH12:MIam') || ' and ' || to_char(b.window_to, 'FMHH12:MIam') ||
        '. Fee $' || to_char(b.fee_amount, 'FM999G999D00') || ' paid.',
      jsonb_build_object(
        'booking_id', b.id,
        'booking_date', b.booking_date,
        'fee_amount', b.fee_amount,
        'site_address', b.site_address,
        'stripe_payment_intent_id', b.stripe_payment_intent_id,
        'backfilled', true
      ),
      'site-measure:' || b.id::text || ':booked',
      b.fee_paid_at
    from public.pcd_site_measure_bookings b
    where b.fee_paid_at is not null
      and b.customer_id is not null
      and not exists (
        select 1 from public.pcd_order_activity a
        where a.event_key = 'site-measure:' || b.id::text || ':booked'
      )
    returning 1
  )
  select count(*) into made_entries from logged;

  raise notice 'Site measure backfill: % credit(s) written, % log entr(ies) written.',
    made_credits, made_entries;
end $$;
