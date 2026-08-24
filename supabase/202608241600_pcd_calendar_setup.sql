-- The calendar: bookings, and the link to the sales mailbox calendar
-- ---------------------------------------------------------------------------
--
-- WHY. What is on each week lives in three places today: an order's scheduled
-- start and timeframe, a site measure agreed over the phone and written
-- nowhere, and whatever is in the mailbox calendar. Nobody can answer "what is
-- on the week after next" without opening all three and doing the arithmetic.
--
-- WHAT IS NOT HERE, DELIBERATELY. There is no production run table. A job's
-- dates already live on the order as scheduled_start_date and
-- production_lead_days, and the due date already follows from them, see
-- lib/pcd-order-schedule.js. Copying those onto a calendar row would create a
-- second opinion about when a job runs, and the two would disagree within a
-- week. Production runs are DRAWN from the orders every time the calendar is
-- read. The only thing stored here is what somebody books.
--
-- WHAT IS ADDED
--
--   pcd_calendar_events      one row per booking: a site measure, a delivery,
--                            an install, a reminder. Linked to a customer, and
--                            optionally to the order or quote it is about.
--   pcd_calendar_sync_state  one row. What Microsoft has been told, when it was
--                            last heard from, and when the subscription lapses.
--
-- THE OUTLOOK ID IS WHAT STOPS DUPLICATES. graph_event_id is unique. An event
-- pulled back from the mailbox twice is refused by the database rather than
-- filed twice, the same way provider_event_id already works for mail. An event
-- created in Outlook rather than here arrives with source 'outlook' and no
-- customer, and is matched to one later by a person, not by a guess.
--
-- Nothing in this file changes an existing row. It adds two tables.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ── bookings ────────────────────────────────────────────────────────────────
create table if not exists public.pcd_calendar_events (
  id uuid primary key default gen_random_uuid(),

  -- What it is. Colour and grouping on the calendar both come from this, and
  -- it decides nothing else, so a kind added later needs no migration beyond
  -- widening this list.
  kind text not null default 'measure' check (
    kind in ('measure', 'delivery', 'install', 'reminder', 'other')
  ),
  title text not null,

  -- Who it is for. customer_id is the link that matters; customer_name is a
  -- snapshot so a booking still reads correctly on a calendar printed after
  -- the customer was renamed or merged away.
  customer_id   uuid references public.pcd_customers(id)      on delete set null,
  customer_name text,
  -- What it is about. All three optional, because a measure is booked before
  -- any of them exist. That is the whole reason this is its own table rather
  -- than two date columns on a quote.
  order_id         uuid references public.pcd_orders(id)          on delete set null,
  quote_id         uuid references public.pcd_quotes(id)          on delete set null,
  quote_request_id uuid references public.pcd_quote_requests(id)  on delete set null,

  -- Where. Copied from the customer at booking time rather than read through
  -- the link, because the van needs the address that was agreed, and a
  -- customer who later moves house does not move the job that was measured.
  site_address text,

  -- When. Stored as instants, not dates, because a site measure is at half
  -- past nine and Outlook needs to be told so. All day bookings set all_day
  -- and run midnight to midnight in Perth.
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  all_day   boolean not null default false,

  notes text,

  status text not null default 'booked' check (
    status in ('booked', 'done', 'cancelled')
  ),

  -- Where the row came from. 'pcd' was booked on the site, 'outlook' appeared
  -- in the mailbox calendar and was pulled in. An outlook row is never pushed
  -- back out, which is what stops a change echoing between the two forever.
  source text not null default 'pcd' check (source in ('pcd', 'outlook')),

  -- The Outlook event this row is. Unique, so the same event pulled twice is
  -- refused rather than duplicated.
  graph_event_id    text,
  graph_change_key  text,
  graph_calendar_id text,

  -- How the last push went. 'skipped' means the person chose not to put this
  -- one in Outlook, which is a decision and not a failure, so it must not read
  -- as one.
  sync_state text not null default 'pending' check (
    sync_state in ('pending', 'synced', 'failed', 'skipped')
  ),
  sync_error text,
  synced_at  timestamptz,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- A booking that ends before it starts is not a booking.
  constraint pcd_calendar_events_ends_after_starts check (ends_at >= starts_at)
);

comment on table public.pcd_calendar_events is
  'Bookings on the calendar: site measures, deliveries, installs and reminders. Production runs are NOT here, they are drawn from pcd_orders.';
comment on column public.pcd_calendar_events.graph_event_id is
  'The event id in the sales mailbox calendar. Unique, so the same Outlook event can only ever be one row.';
comment on column public.pcd_calendar_events.source is
  'pcd means booked here. outlook means it appeared in the mailbox calendar and was read in. An outlook row is never pushed back out.';
comment on column public.pcd_calendar_events.sync_state is
  'skipped is a decision, not a failure: somebody chose to keep this booking off the mailbox calendar.';

create unique index if not exists pcd_calendar_events_graph_event_id_key
  on public.pcd_calendar_events (graph_event_id)
  where graph_event_id is not null;

-- The calendar reads one window at a time, so this is the index that matters.
create index if not exists pcd_calendar_events_starts_at_idx
  on public.pcd_calendar_events (starts_at)
  where status <> 'cancelled';

create index if not exists pcd_calendar_events_customer_idx
  on public.pcd_calendar_events (customer_id);
create index if not exists pcd_calendar_events_order_idx
  on public.pcd_calendar_events (order_id);
create index if not exists pcd_calendar_events_quote_idx
  on public.pcd_calendar_events (quote_id);

-- Anything still owed to Microsoft. Small and constantly re-read, which is
-- exactly what a partial index is for.
create index if not exists pcd_calendar_events_unsynced_idx
  on public.pcd_calendar_events (updated_at)
  where sync_state in ('pending', 'failed');

drop trigger if exists trg_pcd_calendar_events_updated_at on public.pcd_calendar_events;
create trigger trg_pcd_calendar_events_updated_at
before update on public.pcd_calendar_events
for each row execute function public.set_updated_at_timestamp();

-- ── what Microsoft has been told ────────────────────────────────────────────
--
-- One row, always. A table rather than environment variables because every
-- value in it is written by the code as it runs: a subscription id Microsoft
-- issues, an expiry Microsoft chooses, and a delta link that changes on every
-- read.
create table if not exists public.pcd_calendar_sync_state (
  id text primary key default 'sales-calendar',

  -- The push subscription. Microsoft expires these after three days at most,
  -- so the expiry is stored and a cron renews it before it lapses.
  subscription_id         text,
  subscription_expires_at timestamptz,
  -- Sent with every notification and checked on the way back in. A notification
  -- that does not carry it did not come from our subscription.
  client_state            text,

  -- Where the last read of the calendar got to. Graph hands back a new one
  -- every time, and it is what makes the next read "what changed" rather than
  -- "everything again".
  delta_link text,

  last_pull_at timestamptz,
  last_push_at timestamptz,
  -- The last thing that went wrong, kept so the calendar can say so plainly
  -- instead of quietly showing stale bookings.
  last_error   text,

  updated_at timestamptz not null default timezone('utc', now()),

  constraint pcd_calendar_sync_state_single_row check (id = 'sales-calendar')
);

comment on table public.pcd_calendar_sync_state is
  'One row. What the sales mailbox calendar subscription is, when it lapses, and where the last read got to.';

insert into public.pcd_calendar_sync_state (id)
values ('sales-calendar')
on conflict (id) do nothing;

drop trigger if exists trg_pcd_calendar_sync_state_updated_at on public.pcd_calendar_sync_state;
create trigger trg_pcd_calendar_sync_state_updated_at
before update on public.pcd_calendar_sync_state
for each row execute function public.set_updated_at_timestamp();

-- ── access ──────────────────────────────────────────────────────────────────
-- Same policy as every other admin table: signed in or nothing. The webhook and
-- the cron run with the service role, which bypasses this by design, because a
-- change made in Outlook arrives with nobody signed in.
alter table public.pcd_calendar_events     enable row level security;
alter table public.pcd_calendar_sync_state enable row level security;

drop policy if exists pcd_calendar_events_admin_all on public.pcd_calendar_events;
create policy pcd_calendar_events_admin_all on public.pcd_calendar_events for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists pcd_calendar_sync_state_admin_all on public.pcd_calendar_sync_state;
create policy pcd_calendar_sync_state_admin_all on public.pcd_calendar_sync_state for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
