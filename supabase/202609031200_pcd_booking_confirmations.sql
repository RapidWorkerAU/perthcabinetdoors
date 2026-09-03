-- Asking the customer to confirm a booking, a day before it happens
-- ---------------------------------------------------------------------------
--
-- WHY. A booking on the calendar is our opinion of what is happening tomorrow.
-- Nobody has ever asked the person we are driving to. A van goes out to a house
-- where nobody is home, or to an address we never held in the first place,
-- and the first anyone knows is the driver ringing from the kerb.
--
-- WHAT IS ADDED. Columns on pcd_calendar_events, nothing else. This is not a
-- table of its own because there is exactly one confirmation per booking and it
-- belongs to that booking: a separate table would let the two disagree about
-- which time was confirmed, which is the one thing this must never do.
--
-- ── SILENCE MUST NEVER BE AMBIGUOUS ─────────────────────────────────────────
--
-- confirm_state carries the difference between "we asked and they have not
-- answered" and "we never managed to ask". Those look identical on a calendar
-- that only stores the answer, and they need opposite responses from us. Every
-- state a booking can be in is one of these:
--
--   not_asked   too far out, or a kind we never ask about, or it was moved
--   asked       the email left our hands and Resend accepted it
--   failed      it did not go, and confirm_error says what happened
--   confirmed   they said yes
--   declined    they said no
--
-- 'asked' is deliberately not called 'delivered'. Resend accepting a message is
-- not the same as it arriving, and there is no bounce webhook here to tell us
-- the difference. Calling it delivered would be a claim we cannot support.
--
-- ── THE CONTACT DETAILS ARE ON THE BOOKING, NOT READ THROUGH THE CUSTOMER ───
--
-- Same reasoning as site_address, which is already copied here rather than
-- looked up: the van needs the number that was agreed for this visit. A
-- customer who later changes their mobile does not retrospectively change who
-- we were told to ring on the day.
--
-- ── A BOOKING THAT MOVES CANNOT STAY CONFIRMED ──────────────────────────────
--
-- A time change can arrive from three directions: an edit here, an edit in
-- Outlook coming back through the sync, or somebody running SQL. A rule
-- enforced in the application would have to be written three times and would be
-- missed by the third. It is a trigger, so there is one copy and nothing can
-- get past it. See pcd_calendar_clear_confirmation below.

alter table public.pcd_calendar_events
  -- The unguessable code in the customer's link. Same model as
  -- pcd_quotes.access_code: RLS stays admin only and the public routes scope
  -- every query by this value through the service role.
  add column if not exists confirm_token text,

  add column if not exists confirm_state text not null default 'not_asked',

  -- When the ask left us, and who it went to. The address is stored because
  -- "we asked" is not a useful thing to be told without "and we asked her".
  add column if not exists confirm_asked_at timestamptz,
  add column if not exists confirm_sent_to  text,
  -- Why it did not go. Read back onto the calendar in plain words, exactly the
  -- way sync_error already is.
  add column if not exists confirm_error text,

  add column if not exists confirm_answered_at timestamptz,
  add column if not exists confirm_answered_by text,
  add column if not exists confirm_notes       text,

  -- Who to ring on the day, and on what number. Both can be supplied by the
  -- customer on the confirmation page when we are short of them.
  add column if not exists contact_name   text,
  add column if not exists contact_mobile text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pcd_calendar_events_confirm_state_check'
  ) then
    alter table public.pcd_calendar_events
      add constraint pcd_calendar_events_confirm_state_check
      check (confirm_state in ('not_asked', 'asked', 'failed', 'confirmed', 'declined'));
  end if;
end;
$$;

comment on column public.pcd_calendar_events.confirm_state is
  'not_asked, asked, failed, confirmed, declined. asked means Resend accepted the message, NOT that it was delivered: there is no bounce webhook, so delivery is not something this can honestly claim.';
comment on column public.pcd_calendar_events.confirm_error is
  'Why the ask did not go out. Shown on the calendar in plain words, so a booking nobody answered is never confused with one nobody was asked about.';
comment on column public.pcd_calendar_events.contact_mobile is
  'The number to ring on the day for THIS visit. Copied here rather than read through the customer, for the same reason site_address is.';

-- The link. Unique where present, so two bookings can never share one.
create unique index if not exists pcd_calendar_events_confirm_token_key
  on public.pcd_calendar_events (confirm_token)
  where confirm_token is not null;

-- What the hourly pass reads: bookings starting soon that nobody has asked
-- about yet. Small and constantly re-read, which is what a partial index is for.
create index if not exists pcd_calendar_events_confirm_pending_idx
  on public.pcd_calendar_events (starts_at)
  where confirm_state = 'not_asked' and status = 'booked';

-- What the morning list reads: asked, and still unanswered.
create index if not exists pcd_calendar_events_confirm_waiting_idx
  on public.pcd_calendar_events (starts_at)
  where confirm_state in ('asked', 'failed') and status = 'booked';

-- ── A move clears the answer ────────────────────────────────────────────────
--
-- The token is deliberately KEPT. The link in the email the customer already
-- has goes on working and shows them the new time, which is better than a dead
-- link, and they are asked again anyway once the new time is inside the window.
create or replace function public.pcd_calendar_clear_confirmation()
returns trigger
language plpgsql
as $$
begin
  if (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at)
     and old.confirm_state <> 'not_asked' then
    new.confirm_state       := 'not_asked';
    new.confirm_asked_at    := null;
    new.confirm_sent_to     := null;
    new.confirm_error       := null;
    new.confirm_answered_at := null;
    new.confirm_answered_by := null;
    new.confirm_notes       := null;
  end if;
  return new;
end;
$$;

comment on function public.pcd_calendar_clear_confirmation() is
  'A booking that moves cannot keep an answer given about the old time. A trigger rather than application code because a time change arrives from an edit here, from Outlook through the sync, and from SQL run by hand.';

drop trigger if exists trg_pcd_calendar_events_clear_confirmation on public.pcd_calendar_events;
create trigger trg_pcd_calendar_events_clear_confirmation
before update on public.pcd_calendar_events
for each row execute function public.pcd_calendar_clear_confirmation();

-- ── The morning list needs somewhere to stamp itself ────────────────────────
--
-- The same table the quote expiry digest claims itself through, so two passes
-- arriving together cannot both send it. Created here as well because a
-- database that has had this migration but not that one should still work.
create table if not exists public.pcd_job_stamps (
  job         text primary key,
  last_run_at timestamptz not null default timezone('utc', now())
);

alter table public.pcd_job_stamps enable row level security;

drop policy if exists pcd_job_stamps_admin_all on public.pcd_job_stamps;
create policy pcd_job_stamps_admin_all on public.pcd_job_stamps for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
