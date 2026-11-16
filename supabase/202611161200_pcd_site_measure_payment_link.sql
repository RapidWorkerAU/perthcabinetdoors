-- A SITE MEASURE BOOKED ON THE PHONE, PAID THROUGH A LINK.
--
-- Somebody rings, a measure goes on the calendar by hand, and the calendar
-- sends them a link to pay the fee (and fill in their details if we need them).
-- The link makes a pcd_site_measure_bookings row tied to that calendar event,
-- in a new status, awaiting_payment. Paying it runs the same completion as a
-- website booking: the event is updated rather than copied, the same emails go
-- out and the fee is held as a credit.
--
-- Nothing is confirmed until it is paid. The link closes at a time chosen when
-- it is sent, and the confirmation page stops taking payment pay_cutoff_hours
-- before the visit.

alter table public.pcd_site_measure_bookings
  drop constraint if exists pcd_site_measure_bookings_status_check;
alter table public.pcd_site_measure_bookings
  add constraint pcd_site_measure_bookings_status_check check (
    status in ('holding', 'awaiting_payment', 'booked', 'cancelled', 'expired')
  );

alter table public.pcd_site_measure_bookings
  add column if not exists source text not null default 'website',
  add column if not exists payment_link_token text,
  add column if not exists payment_link_expires_at timestamptz,
  add column if not exists payment_link_sent_at timestamptz,
  add column if not exists payment_link_sent_to text,
  add column if not exists details_requested boolean not null default false,
  add column if not exists details_completed_at timestamptz,
  add column if not exists pending_confirmation jsonb;

comment on column public.pcd_site_measure_bookings.source is
  'website for a booking taken on the booking page, payment_link for one booked by hand and paid through the link the calendar sent.';
comment on column public.pcd_site_measure_bookings.payment_link_expires_at is
  'The link stops taking payment here. Chosen when it is sent, never later than the moment the day before confirmation goes out.';
comment on column public.pcd_site_measure_bookings.pending_confirmation is
  'An answer given on the confirmation page that is waiting on the fee. Written onto the calendar event when the payment clears.';

create unique index if not exists idx_pcd_site_measure_bookings_link_token
  on public.pcd_site_measure_bookings (payment_link_token)
  where payment_link_token is not null;

-- One live booking per calendar event, so a link sent twice updates the same
-- row rather than making a second one.
create unique index if not exists idx_pcd_site_measure_bookings_live_event
  on public.pcd_site_measure_bookings (calendar_event_id)
  where calendar_event_id is not null and status in ('holding', 'awaiting_payment', 'booked');

alter table public.pcd_booking_settings
  add column if not exists pay_cutoff_hours integer not null default 12
    check (pay_cutoff_hours >= 1 and pay_cutoff_hours <= 168);

comment on column public.pcd_booking_settings.pay_cutoff_hours is
  'Hours before a site measure that the confirmation page stops taking the fee from somebody who has not paid. After it they are told to call.';
