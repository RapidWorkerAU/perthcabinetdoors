-- Customer desk: deciding who is a customer, once per sender
-- ---------------------------------------------------------------------------
--
-- WHY. Supplier mail arrives almost daily. Statements, invoices, freight
-- notices. None of it is a customer conversation, and left alone it would fill
-- the desk with customer records for Polytec's accounts department.
--
-- Guessing is the wrong answer. A hardcoded list of "addresses that look
-- automated" catches mailer-daemon and misses every real supplier, and a list
-- kept by hand has to be written before the mail arrives rather than after.
--
-- SO THE FIRST EMAIL FROM AN UNKNOWN ADDRESS ASKS. It lands in
-- pcd_mail_pending_senders instead of creating anything. One decision, once,
-- and the answer is remembered in pcd_mail_sender_rules forever. The ignore
-- list builds itself out of the mail actually received.
--
-- NOTHING IS EVER LOST. Every message stays in the Outlook mailbox exactly as
-- it arrived. These tables only decide what the desk makes of it, so even the
-- worst possible rule costs nothing but a trip to Outlook.
--
-- APPROVING A SENDER REACHES BACK. Their earlier messages are still in the
-- mailbox, so saying "customer" fetches what they sent before the decision was
-- made. That is why only the sender is held here and not the message bodies:
-- Microsoft is already keeping those, and two copies is one too many.

-- ── the remembered decisions ────────────────────────────────────────────────
create table if not exists public.pcd_mail_sender_rules (
  id          uuid primary key default gen_random_uuid(),
  -- address: exactly this person, e.g. accounts@polytec.com.au
  -- domain:  everybody there, e.g. polytec.com.au
  match_type  text not null check (match_type in ('address', 'domain')),
  pattern     text not null,
  -- customer: file their mail as a normal conversation
  -- ignore:   never make a ticket from it
  decision    text not null check (decision in ('customer', 'ignore')),
  note        text,
  created_at  timestamptz not null default timezone('utc', now()),
  created_by  uuid references public.pcd_agents(id) on delete set null
);

-- One rule per pattern. Deciding the same sender twice replaces the answer
-- rather than leaving two rules to disagree with each other.
create unique index if not exists pcd_mail_sender_rules_pattern_key
  on public.pcd_mail_sender_rules (match_type, lower(pattern));

comment on table public.pcd_mail_sender_rules is
  'Remembered answers to "is this address a customer". An address rule beats a domain rule.';
comment on column public.pcd_mail_sender_rules.match_type is
  'address = one person. domain = everybody at that company.';

-- The senders that are never a person, seeded so they never reach the approval
-- list at all. There is no point asking whether a bounce is a customer.
insert into public.pcd_mail_sender_rules (match_type, pattern, decision, note)
select v.match_type, v.pattern, 'ignore', v.note
from (values
  ('address', 'mailer-daemon', 'Bounce messages'),
  ('address', 'postmaster',    'Mail system notices')
) as v(match_type, pattern, note)
where not exists (
  select 1 from public.pcd_mail_sender_rules r
  where r.match_type = v.match_type and lower(r.pattern) = lower(v.pattern)
);

-- ── senders waiting to be decided ───────────────────────────────────────────
create table if not exists public.pcd_mail_pending_senders (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  display_name  text,
  -- Enough to recognise them without opening Outlook. Not the whole message:
  -- the mailbox already holds that.
  first_subject text,
  last_subject  text,
  preview       text,
  message_count integer not null default 1,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at  timestamptz not null default timezone('utc', now()),
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'ignored')),
  resolved_at   timestamptz,
  resolved_by   uuid references public.pcd_agents(id) on delete set null
);

create unique index if not exists pcd_mail_pending_senders_email_key
  on public.pcd_mail_pending_senders (lower(email));

create index if not exists pcd_mail_pending_senders_status_idx
  on public.pcd_mail_pending_senders (status, last_seen_at desc) where status = 'pending';

comment on table public.pcd_mail_pending_senders is
  'Unknown addresses awaiting a Customer or Not a customer decision. Their mail is untouched in the mailbox meanwhile.';

-- ── access ──────────────────────────────────────────────────────────────────
alter table public.pcd_mail_sender_rules enable row level security;
alter table public.pcd_mail_pending_senders enable row level security;

drop policy if exists pcd_mail_sender_rules_admin_all on public.pcd_mail_sender_rules;
create policy pcd_mail_sender_rules_admin_all on public.pcd_mail_sender_rules for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists pcd_mail_pending_senders_admin_all on public.pcd_mail_pending_senders;
create policy pcd_mail_pending_senders_admin_all on public.pcd_mail_pending_senders for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
