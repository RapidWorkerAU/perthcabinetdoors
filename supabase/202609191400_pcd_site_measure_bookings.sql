-- BOOKING A SITE MEASURE FROM THE WEBSITE.
--
-- ── WHY A TABLE OF ITS OWN, AND NOT JUST A CALENDAR EVENT ────────────────────
--
-- A site measure IS a calendar event, and once it is paid for that is exactly
-- what it becomes. But between somebody picking a day and their card clearing
-- there is a thing that is not a booking yet and must not look like one: it has
-- to hold the slot so two people cannot buy the last one, and it must never
-- reach the calendar, the Outlook sync or the day before confirmation sweep.
--
-- Writing unpaid holds into pcd_calendar_events would have meant teaching every
-- one of those to ignore them, and forgetting any of them puts a booking nobody
-- paid for in front of a driver. So the hold lives here, and a paid booking
-- creates the calendar event it always was.
--
-- ── THE SETTINGS ARE A SNAPSHOT, TWICE ───────────────────────────────────────
--
-- window_from and window_to are copied onto the booking rather than read back
-- through the settings. Move Tuesday from the afternoon to the morning and every
-- Tuesday already booked keeps the window its customer was told, because that is
-- what we promised them. The same reason a quote keeps the dates it was sent
-- with.

-- ── What we are open for ─────────────────────────────────────────────────────
--
-- One row, like pcd_business_defaults. The days are jsonb because the shape is
-- seven of the same thing and seven pairs of columns is a migration every time
-- somebody wants a different question asked about a day.
create table if not exists public.pcd_booking_settings (
  id text primary key default 'site-measure',

  -- mon..sun, each { open: boolean, from: "HH:MM", to: "HH:MM" }. A day that is
  -- not open has no window worth reading, and its times are kept rather than
  -- cleared so turning it back on remembers what it was.
  days jsonb not null default '{
    "mon": {"open": false, "from": "09:00", "to": "12:00"},
    "tue": {"open": true,  "from": "15:00", "to": "18:00"},
    "wed": {"open": true,  "from": "15:00", "to": "18:00"},
    "thu": {"open": true,  "from": "09:00", "to": "12:00"},
    "fri": {"open": false, "from": "09:00", "to": "12:00"},
    "sat": {"open": false, "from": "09:00", "to": "12:00"},
    "sun": {"open": false, "from": "09:00", "to": "12:00"}
  }'::jsonb,

  -- How many we will do in one day. Bookings made in the office count towards
  -- it too, so the website can never oversell a day we have already filled.
  max_per_day integer not null default 2 check (max_per_day >= 1),

  -- Inc GST. The customer is told this figure and it is what Stripe charges.
  fee_inc_gst numeric(12,2) not null default 100 check (fee_inc_gst >= 0),

  -- How close to today somebody may book, and how far out the calendar reaches.
  notice_days integer not null default 3 check (notice_days >= 0),
  horizon_weeks integer not null default 8 check (horizon_weeks >= 1),

  -- THE ONE NUMBER THAT DOES TWO JOBS, deliberately.
  --
  -- It is when we confirm the exact hour, and it is the cancellation cutoff.
  -- Making them the same gives the refund rule a reason the customer accepts
  -- without arguing: once we have confirmed your time, the day is committed.
  confirm_hours integer not null default 48 check (confirm_hours >= 1),

  -- Days we are shut whatever the weekday says. A booking already taken on one
  -- is NOT cancelled by adding it here; it only stops new ones.
  closed_dates date[] not null default '{}',

  -- Where we will drive. Ranges and single values, the same spelling the
  -- delivery pricing uses. Blank means anywhere, which is not what we want but
  -- is better than refusing everybody because nobody filled it in.
  postcodes text not null default '',

  -- Off until the page is ready to be found. Nothing on the website links to
  -- the booking page while this is false, and the page itself says so.
  is_live boolean not null default false,

  updated_at timestamptz not null default timezone('utc', now()),
  constraint pcd_booking_settings_single_row check (id = 'site-measure')
);

insert into public.pcd_booking_settings (id) values ('site-measure')
on conflict (id) do nothing;

comment on table public.pcd_booking_settings is
  'What the public site measure booking page offers: open days and their windows, how many a day, the fee, and the notice and confirmation windows. One row.';
comment on column public.pcd_booking_settings.confirm_hours is
  'Hours before a booking that we confirm the exact time. ALSO the cancellation cutoff: outside it the fee is refunded, inside it it becomes a customer credit. One number so the two can never disagree.';

-- ── A booking taken on the website ───────────────────────────────────────────
create table if not exists public.pcd_site_measure_bookings (
  id uuid primary key default gen_random_uuid(),

  -- Null until the payment clears and the customer is upserted. The name and
  -- the address are held here regardless, because a hold that expires still has
  -- to be readable and must not leave a customer record behind for somebody who
  -- never paid us.
  customer_id uuid references public.pcd_customers(id) on delete set null,
  customer_name  text not null,
  customer_email text not null,
  customer_phone text,

  site_street   text,
  site_suburb   text,
  site_postcode text,
  site_address  text,
  notes text,

  -- The day, and the window they were shown. Both snapshots: see the note at
  -- the top about why the window is not read back through the settings.
  booking_date date not null,
  window_from time not null,
  window_to   time not null,

  -- holding          slot claimed, payment page open, nothing confirmed
  -- booked           paid, on the calendar
  -- cancelled        called off by either side, see cancellation_outcome
  -- expired          they walked away from the payment page
  status text not null default 'holding' check (
    status in ('holding', 'booked', 'cancelled', 'expired')
  ),

  -- A hold that is never paid gives the slot back by itself. Without this a
  -- customer who opened the payment page and closed it would keep a day off the
  -- website forever.
  hold_expires_at timestamptz,

  fee_amount numeric(12,2) not null default 0,
  fee_paid_at timestamptz,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,

  -- The calendar event this became. Written when the payment clears, which is
  -- the moment it stops being a hold and starts being a job.
  calendar_event_id uuid references public.pcd_calendar_events(id) on delete set null,

  -- When we told them their hour. Only so the calendar can show which bookings
  -- still owe the customer that message.
  time_confirmed_at timestamptz,

  -- How a cancellation was settled. Decided by the clock against confirm_hours,
  -- not by whoever answered the phone.
  cancelled_at timestamptz,
  cancellation_outcome text check (
    cancellation_outcome is null or cancellation_outcome in ('refunded', 'credited', 'unpaid')
  ),
  cancellation_reason text,
  stripe_refund_id text,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- The capacity read, which runs on every page load of the public calendar.
create index if not exists idx_pcd_site_measure_bookings_day
  on public.pcd_site_measure_bookings (booking_date, status);

create index if not exists idx_pcd_site_measure_bookings_customer
  on public.pcd_site_measure_bookings (customer_id);

-- A Stripe session settles exactly one booking. A webhook delivered twice is
-- refused by the database rather than by remembering to check.
create unique index if not exists idx_pcd_site_measure_bookings_session
  on public.pcd_site_measure_bookings (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

comment on table public.pcd_site_measure_bookings is
  'Site measures booked on the website. A holding row claims the day while Stripe is open; a paid one creates the pcd_calendar_events row it always was.';
comment on column public.pcd_site_measure_bookings.hold_expires_at is
  'A holding row past this no longer counts towards the day. Nothing has to sweep it for the website to be correct; the sweep only tidies the rows.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Both tables are read and written by the service role only. The public booking
-- page reaches them through an API route, exactly as the public quote pages do,
-- so no anonymous policy is wanted here.
alter table public.pcd_booking_settings enable row level security;
alter table public.pcd_site_measure_bookings enable row level security;

drop policy if exists pcd_booking_settings_rw on public.pcd_booking_settings;
create policy pcd_booking_settings_rw on public.pcd_booking_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists pcd_site_measure_bookings_rw on public.pcd_site_measure_bookings;
create policy pcd_site_measure_bookings_rw on public.pcd_site_measure_bookings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
