-- ALFRED, THE BACK OFFICE ASSISTANT: WHAT HE PREPARES AND WHAT HAPPENED TO IT.
--
-- Alfred prepares work and a person approves it. Nothing he writes reaches a
-- customer, and nothing important changes, until somebody presses approve.
-- These tables are where his work waits, where his questions wait, and the
-- record of every run. The rules are in lib/pcd-alfred-*.js.
--
--   pcd_alfred_settings   one row: the switch, each job, the limits.
--   pcd_alfred_drafts     everything he has prepared, and what became of it:
--                         waiting, approved (and sent), declined with a
--                         reason, withdrawn when it went stale, or failed.
--   pcd_alfred_questions  what he asked because a fact was missing, and the
--                         answer somebody gave.
--   pcd_alfred_runs       one row per job run: what it made, what it cost, and
--                         any problem. Spend limits are counted from here.
--
-- Two additions to what exists:
--
--   pcd_order_activity.actor_type gains 'alfred', so a timeline can tell what
--   a person did from what Alfred did.
--
--   pcd_messages gains alfred_draft_id, approved_by and edited_before_send, so
--   an email Alfred wrote shows who approved it and whether it was changed.
--
-- Alfred starts switched OFF. Nothing runs until it is turned on in Settings.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  create table if not exists public.pcd_alfred_settings (
    id text primary key default 'main',
    settings jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    constraint pcd_alfred_settings_single_row check (id = 'main')
  );
  insert into public.pcd_alfred_settings (id) values ('main') on conflict (id) do nothing;

  create table if not exists public.pcd_alfred_drafts (
    id uuid primary key default gen_random_uuid(),
    kind text not null,
    status text not null default 'waiting'
      check (status in ('waiting', 'approved', 'declined', 'withdrawn', 'failed')),
    -- Stops the same thing being drafted twice. A withdrawn draft can be made
    -- again from fresh facts; an approved or declined one is final.
    source_key text not null,
    customer_id uuid references public.pcd_customers(id) on delete set null,
    ticket_id uuid references public.pcd_tickets(id) on delete set null,
    message_id uuid references public.pcd_messages(id) on delete set null,
    order_id uuid references public.pcd_orders(id) on delete set null,
    quote_id uuid references public.pcd_quotes(id) on delete set null,
    to_email text,
    subject text,
    body_text text,
    why text,
    facts jsonb not null default '[]'::jsonb,
    checks jsonb not null default '[]'::jsonb,
    model text,
    input_tokens integer not null default 0,
    output_tokens integer not null default 0,
    cost_usd numeric(10, 4) not null default 0,
    decided_at timestamptz,
    decided_by text,
    edited_before_send boolean not null default false,
    decline_reason text,
    sent_message_id uuid references public.pcd_messages(id) on delete set null,
    problem text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index if not exists pcd_alfred_drafts_live_source_key
    on public.pcd_alfred_drafts (source_key) where status in ('waiting', 'approved', 'declined');
  create index if not exists pcd_alfred_drafts_status_idx on public.pcd_alfred_drafts (status, created_at desc);
  create index if not exists pcd_alfred_drafts_customer_idx on public.pcd_alfred_drafts (customer_id) where status = 'waiting';

  create table if not exists public.pcd_alfred_questions (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'open' check (status in ('open', 'answered', 'withdrawn')),
    source_key text not null,
    question text not null,
    why text,
    options jsonb not null default '[]'::jsonb,
    customer_id uuid references public.pcd_customers(id) on delete set null,
    ticket_id uuid references public.pcd_tickets(id) on delete set null,
    message_id uuid references public.pcd_messages(id) on delete set null,
    order_id uuid references public.pcd_orders(id) on delete set null,
    answer text,
    answered_by text,
    answered_at timestamptz,
    created_at timestamptz not null default now()
  );
  create unique index if not exists pcd_alfred_questions_live_source_key
    on public.pcd_alfred_questions (source_key) where status in ('open', 'answered');

  create table if not exists public.pcd_alfred_runs (
    id uuid primary key default gen_random_uuid(),
    job text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    drafts_made integer not null default 0,
    questions_asked integer not null default 0,
    skipped integer not null default 0,
    input_tokens integer not null default 0,
    output_tokens integer not null default 0,
    cost_usd numeric(10, 4) not null default 0,
    problems text
  );
  create index if not exists pcd_alfred_runs_started_idx on public.pcd_alfred_runs (started_at desc);

  alter table public.pcd_alfred_settings enable row level security;
  alter table public.pcd_alfred_drafts enable row level security;
  alter table public.pcd_alfred_questions enable row level security;
  alter table public.pcd_alfred_runs enable row level security;
  drop policy if exists pcd_alfred_settings_rw on public.pcd_alfred_settings;
  create policy pcd_alfred_settings_rw on public.pcd_alfred_settings
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  drop policy if exists pcd_alfred_drafts_rw on public.pcd_alfred_drafts;
  create policy pcd_alfred_drafts_rw on public.pcd_alfred_drafts
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  drop policy if exists pcd_alfred_questions_rw on public.pcd_alfred_questions;
  create policy pcd_alfred_questions_rw on public.pcd_alfred_questions
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  drop policy if exists pcd_alfred_runs_rw on public.pcd_alfred_runs;
  create policy pcd_alfred_runs_rw on public.pcd_alfred_runs
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

  -- Timelines learn a fourth kind of actor.
  alter table public.pcd_order_activity drop constraint if exists pcd_order_activity_actor_type_check;
  alter table public.pcd_order_activity add constraint pcd_order_activity_actor_type_check
    check (actor_type in ('system', 'admin', 'customer', 'alfred'));

  -- An email Alfred wrote carries who let it go.
  alter table public.pcd_messages
    add column if not exists alfred_draft_id uuid references public.pcd_alfred_drafts(id) on delete set null,
    add column if not exists approved_by text,
    add column if not exists edited_before_send boolean not null default false;

  comment on table public.pcd_alfred_drafts is
    'Work Alfred prepared for a person to approve. Nothing here is sent until somebody approves it. See lib/pcd-alfred-drafts.js.';
  comment on column public.pcd_messages.approved_by is
    'For an email Alfred wrote: the person who approved it. Blank on emails a person wrote.';
end $$;
