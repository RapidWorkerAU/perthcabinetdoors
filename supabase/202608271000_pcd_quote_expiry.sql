-- THE 30 DAY QUOTE CLOCK.
--
-- ── WHAT THIS TURNS ON ───────────────────────────────────────────────────────
--
-- A quote that has been emailed and never answered now has an ending. On day 23
-- the customer is told it expires in 7 days and on what date. On day 31 it is
-- archived, its link stops working, and both events are written against the
-- customer so anybody opening their file can see what happened.
--
-- Approved quotes, quotes awaiting a deposit, rejected quotes and drafts are
-- never touched by any of it. See lib/pcd-quote-expiry.js for the rule.
--
-- ── WHY 30 IS NOW A SETTING AND NOT A NUMBER IN THE CODE ─────────────────────
--
-- It was in two places and they disagreed. lib/pcd-lead-conversion.js counted a
-- quote lost after 30 days because "that is what the quote itself says", while
-- the terms wording seeded into this database actually said 14. A customer
-- holding a 14 day quote was about to receive an email about a 30 day expiry.
--
-- So quote_valid_days becomes a Business Default, every part of this reads it,
-- and the terms wording is corrected to match it below. One figure, changeable
-- on the settings screen, and the email, the archive job, the reporting and the
-- printed terms all say the same thing.
--
-- ── WHY archived_reason EXISTS ───────────────────────────────────────────────
--
-- Archived has always meant "somebody tidied this away", and the lead conversion
-- report leaves archived quotes out for exactly that reason. Archiving expired
-- quotes automatically would therefore have emptied the Lapsed column and walked
-- the conversion rate back toward 100%, which is the very thing that report was
-- built to stop. Recording WHY a quote was archived keeps the two apart: a
-- quote the customer went quiet on still counts as a lost lead, and a quote
-- somebody filed away still does not.
--
-- Everything already archived is marked 'manual', because it was.
--
-- ── ONE DO BLOCK ─────────────────────────────────────────────────────────────
--
-- The Supabase SQL editor pools connections, and a script that errors part way
-- through has already committed what ran before it. One block means an error
-- anywhere undoes the lot.

do $$
declare
  legacy_terms constant text :=
    'Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.';
  corrected_terms constant text :=
    'Prices are valid for 30 days. Final measurements and site conditions may affect the final invoice.';
  fixed_library  integer := 0;
  fixed_defaults integer := 0;
  fixed_drafts   integer := 0;
  left_alone     integer := 0;
  marked_manual  integer := 0;
begin

  -- ── the two stamps on a quote ────────────────────────────────────────────
  --
  -- expiry_warned_at is cleared again every time a quote is sent, because
  -- sending resets sent_at and therefore restarts the clock. Without that, a
  -- re-sent quote would never be warned a second time. See the send route.
  --
  -- sent_with_price records a decision that was being thrown away. The send
  -- screen has always had an "include pricing" tick, and some quotes go out
  -- deliberately without a figure in the body. That choice was used to build the
  -- email and then forgotten, so a reminder a month later had no way of knowing
  -- and would have put the total in an inbox somebody had chosen to keep it out
  -- of. Defaults to true, which is what the tick usually is and what every quote
  -- sent before today did.
  alter table public.pcd_quotes
    add column if not exists expiry_warned_at timestamptz,
    add column if not exists archived_reason text,
    add column if not exists sent_with_price boolean not null default true;

  alter table public.pcd_quotes
    drop constraint if exists pcd_quotes_archived_reason_check;

  alter table public.pcd_quotes
    add constraint pcd_quotes_archived_reason_check
    check (archived_reason is null or archived_reason in ('manual', 'expired'));

  -- Everything archived before today was archived by a person.
  update public.pcd_quotes
     set archived_reason = 'manual'
   where status = 'archived'
     and archived_reason is null;
  get diagnostics marked_manual = row_count;

  -- The sweep reads unanswered quotes oldest first. Without this it is a
  -- sequential scan of every quote ever written, twice a day, forever.
  create index if not exists pcd_quotes_status_sent_at_idx
    on public.pcd_quotes (status, sent_at);

  -- ── how long a quote is good for ─────────────────────────────────────────
  --
  -- The one figure. 30 to match what lead conversion has always assumed and
  -- what the corrected terms wording below now says.
  alter table public.pcd_business_defaults
    add column if not exists quote_valid_days integer not null default 30;

  -- A quote good for no days, or for three years, is a mistake rather than a
  -- policy. The job would either expire everything overnight or never run.
  alter table public.pcd_business_defaults
    drop constraint if exists pcd_business_defaults_quote_valid_days_check;

  alter table public.pcd_business_defaults
    add constraint pcd_business_defaults_quote_valid_days_check
    check (quote_valid_days between 1 and 365);

  -- ── somewhere for a weekly job to record that it ran ─────────────────────
  --
  -- The expiry digest goes out once a week, and TWO schedulers call these
  -- routes: GitHub Actions and Vercel's own cron, deliberately, so one of them
  -- lapsing does not stop the work. Without a stamp both would send the same
  -- digest within hours of each other.
  --
  -- Claimed with a compare and swap on last_run_at, so two passes that overlap
  -- cannot both win. See claimJobRun in lib/pcd-quote-expiry.js.
  create table if not exists public.pcd_job_stamps (
    job text primary key,
    last_run_at timestamptz not null
  );

  alter table public.pcd_job_stamps enable row level security;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'pcd_job_stamps'
       and policyname = 'pcd_job_stamps_service_role'
  ) then
    -- Only the cron routes touch this, and they run as the service role, which
    -- bypasses RLS. No policy grants anybody else a way in.
    create policy pcd_job_stamps_service_role
      on public.pcd_job_stamps
      for all
      to authenticated
      using (false)
      with check (false);
  end if;

  -- ── 14 days becomes 30, everywhere it is still written ───────────────────
  --
  -- SCOPE, deliberately narrow, and the same rule 202608171600 followed:
  --
  --   * only wording that is EXACTLY the old sentence. Anything edited by hand,
  --     even slightly, is somebody's decision and is left alone.
  --   * only DRAFT quotes. A sent, viewed, approved or rejected quote is a
  --     document the customer is holding, and quietly rewriting its terms after
  --     the fact would be worse than leaving it. Those are counted below and
  --     listed by the audit query at the bottom so they can be reissued
  --     deliberately if it matters.

  update public.pcd_quote_terms
     set body_html = replace(body_html, legacy_terms, corrected_terms)
   where body_html like '%' || legacy_terms || '%';
  get diagnostics fixed_library = row_count;

  update public.pcd_business_defaults
     set quote_terms = replace(quote_terms, legacy_terms, corrected_terms)
   where quote_terms like '%' || legacy_terms || '%';
  get diagnostics fixed_defaults = row_count;

  update public.pcd_quotes
     set terms = replace(terms, legacy_terms, corrected_terms)
   where status = 'draft'
     and terms like '%' || legacy_terms || '%';
  get diagnostics fixed_drafts = row_count;

  select count(*) into left_alone
    from public.pcd_quotes
   where status <> 'draft'
     and terms like '%' || legacy_terms || '%';

  raise notice 'Archived quotes marked as filed by hand: %', marked_manual;
  raise notice 'Terms library rows corrected to 30 days: %', fixed_library;
  raise notice 'Business Defaults wording corrected: %', fixed_defaults;
  raise notice 'Draft quotes corrected: %', fixed_drafts;
  raise notice 'Quotes left alone because a customer already has them: %', left_alone;
end $$;

comment on column public.pcd_quotes.expiry_warned_at is
  'When the customer was emailed to say their quote is about to expire. Cleared on every send, because sending restarts the clock.';
comment on column public.pcd_quotes.sent_with_price is
  'Whether the quote email included the total. The expiry reminder follows the same decision rather than showing a figure that was deliberately left out.';
comment on column public.pcd_quotes.archived_reason is
  'Why this quote was archived. manual means a person filed it away. expired means it ran past its validity with no answer, which still counts as a lost lead in reporting.';
comment on column public.pcd_business_defaults.quote_valid_days is
  'How many days a quote stands for. The email, the archive job, the reporting and the printed terms all read this one figure.';
comment on table public.pcd_job_stamps is
  'When a scheduled job last ran, so a weekly job called by two schedulers only does the work once.';

notify pgrst, 'reload schema';

-- ── NOTHING BELOW THIS LINE ──────────────────────────────────────────────────
--
-- This file is one runnable block and ends here. The two things worth looking at
-- afterwards, the backlog the first run will archive and the quotes still
-- carrying the old 14 day wording, are separate read only queries and are not
-- pasted here, because a select tacked onto the end of a migration gets run as
-- part of it and its result scrolls past with everything else.
