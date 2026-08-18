-- Customer desk: tickets, messages, and a holding pen for conflicting details
-- ---------------------------------------------------------------------------
--
-- WHY. Two people share one mailbox. A customer sends eight emails, disappears
-- for five months, comes back, and there is no way to see where it was left
-- off without reading the whole trail. Quotes, payments and orders are recorded
-- in one place and the emails about them in another.
--
-- THE EMAIL ADDRESS IS THE ANCHOR. pcd_customers already enforces one record
-- per address with a unique index on lower(email), and upsertCustomerByEmail
-- already routes every path that can create a customer through it. Everything
-- here hangs off that: a message arrives, the address decides whose it is.
--
-- WHAT IS ADDED
--
--   pcd_agents        who is answering. One row for now.
--   pcd_tickets       a conversation with a status and an owner. A customer
--                     has many. A five month old job stays closed and a new
--                     enquiry opens its own.
--   pcd_messages      one row per communication: an email in, a reply out, or
--                     an internal note that is never sent.
--   pcd_message_attachments
--                     files on a message, stored in the existing "attachments"
--                     bucket rather than a new one.
--   pcd_pending_customer_changes
--                     details that arrived and disagree with the record.
--
-- WHY THE PENDING TABLE EXISTS. upsertCustomerByEmail fills blank fields and
-- silently DISCARDS anything that disagrees with a value already there. That is
-- the right default, and it means a phone number corrected over the phone is
-- never clobbered by an old one typed into a form. But the newer value is
-- sometimes the right one, and today it is thrown away with nothing to show
-- for it. It now lands here instead, and a person decides.
--
-- Nothing in this file changes an existing row's data. It adds tables and
-- nullable columns only.

-- ── who is answering ────────────────────────────────────────────────────────
create table if not exists public.pcd_agents (
  id          uuid primary key default gen_random_uuid(),
  login_email text not null,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default timezone('utc', now())
);

create unique index if not exists pcd_agents_login_email_key
  on public.pcd_agents (lower(login_email));

comment on table public.pcd_agents is
  'People who answer customers. login_email matches the admin login, which is how a reply knows who wrote it.';

insert into public.pcd_agents (login_email, name)
select 'sales@perthcabinetdoors.com.au', 'Jason Phillips'
where not exists (
  select 1 from public.pcd_agents where lower(login_email) = 'sales@perthcabinetdoors.com.au'
);

-- ── conversations ───────────────────────────────────────────────────────────
create sequence if not exists pcd_ticket_number_seq start 400;

create table if not exists public.pcd_tickets (
  id                uuid primary key default gen_random_uuid(),
  ticket_number     bigint not null default nextval('pcd_ticket_number_seq'),
  customer_id       uuid not null references public.pcd_customers(id) on delete cascade,
  subject           text not null default 'New conversation',
  -- open    needs something from us
  -- waiting the ball is with the customer
  -- closed  done
  status            text not null default 'open'
                      check (status in ('open', 'waiting', 'closed')),
  assigned_agent_id uuid references public.pcd_agents(id) on delete set null,
  channel           text not null default 'email',
  -- Microsoft Graph gives every message a conversationId that stays the same
  -- across replies. Storing it is what makes a customer's reply rejoin this
  -- ticket instead of opening a new one, with no header parsing at all.
  provider_conversation_id text,
  -- Denormalised so the customer list can sort and show "last heard from"
  -- without counting messages on every row.
  last_message_at   timestamptz,
  first_message_at  timestamptz,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

-- Defensive: create table if not exists cannot add a column to a table that
-- already exists, so a database where an earlier version of this file was run
-- still gets the column.
alter table public.pcd_tickets
  add column if not exists provider_conversation_id text;

create unique index if not exists pcd_tickets_number_key on public.pcd_tickets (ticket_number);
-- One ticket per mail conversation. Unique, so two messages of the same thread
-- arriving at once cannot race each other into two tickets.
create unique index if not exists pcd_tickets_conversation_key
  on public.pcd_tickets (provider_conversation_id) where provider_conversation_id is not null;
create index if not exists pcd_tickets_customer_idx on public.pcd_tickets (customer_id, last_message_at desc);
create index if not exists pcd_tickets_status_idx on public.pcd_tickets (status) where status <> 'closed';

comment on column public.pcd_tickets.status is
  'open = needs us, waiting = ball is with the customer, closed = done.';

-- ── the communications themselves ───────────────────────────────────────────
create table if not exists public.pcd_messages (
  id                  uuid primary key default gen_random_uuid(),
  ticket_id           uuid not null references public.pcd_tickets(id) on delete cascade,
  -- Carried on the message as well as the ticket so the customer's whole
  -- history can be read in one query without joining through tickets.
  customer_id         uuid not null references public.pcd_customers(id) on delete cascade,
  -- inbound  from the customer
  -- outbound sent by us
  -- note     internal, NEVER sent, never shown to a customer
  direction           text not null check (direction in ('inbound', 'outbound', 'note')),
  agent_id            uuid references public.pcd_agents(id) on delete set null,
  from_name           text,
  from_email          text,
  to_email            text,
  subject             text,
  -- Sanitised to the same small subset of HTML the quote terms use. See
  -- lib/pcd-terms-html.js: nothing but p, br, strong, em, u, ul, ol, li
  -- survives, because this is rendered into an admin page.
  body_html           text not null default '',
  body_text           text,
  -- RFC 5322 threading. Our outbound Message-ID is stored so that when the
  -- customer replies, their In-Reply-To points back at it and the reply
  -- rejoins this ticket instead of opening a new one.
  provider_message_id text,
  in_reply_to         text,
  email_references    text,
  -- The provider's id for the delivery event. Unique, so a webhook that fires
  -- twice cannot write the same email onto the ticket twice.
  provider_event_id   text,
  created_at          timestamptz not null default timezone('utc', now())
);

create unique index if not exists pcd_messages_provider_event_key
  on public.pcd_messages (provider_event_id) where provider_event_id is not null;
create index if not exists pcd_messages_ticket_idx on public.pcd_messages (ticket_id, created_at);
create index if not exists pcd_messages_customer_idx on public.pcd_messages (customer_id, created_at desc);
create index if not exists pcd_messages_msgid_idx on public.pcd_messages (provider_message_id)
  where provider_message_id is not null;

comment on column public.pcd_messages.direction is
  'note is internal and is never emailed to anybody. Nothing may send a row with this direction.';
comment on column public.pcd_messages.provider_event_id is
  'Unique so a repeated inbound webhook cannot duplicate a message.';

create table if not exists public.pcd_message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.pcd_messages(id) on delete cascade,
  file_name    text not null,
  content_type text,
  size_bytes   bigint,
  -- Path inside the existing "attachments" bucket. A new bucket was not needed.
  storage_path text not null,
  created_at   timestamptz not null default timezone('utc', now())
);

create index if not exists pcd_message_attachments_message_idx
  on public.pcd_message_attachments (message_id);

-- ── details that disagree with the record ───────────────────────────────────
create table if not exists public.pcd_pending_customer_changes (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.pcd_customers(id) on delete cascade,
  field          text not null,
  current_value  text,
  proposed_value text not null,
  -- Where the newer value came from, so the person deciding can judge it.
  source         text not null default 'form',
  source_id      uuid,
  source_label   text,
  status         text not null default 'pending'
                   check (status in ('pending', 'applied', 'dismissed')),
  created_at     timestamptz not null default timezone('utc', now()),
  resolved_at    timestamptz,
  resolved_by    uuid references public.pcd_agents(id) on delete set null
);

-- One pending suggestion per field. A customer who submits three forms with
-- the same new phone number raises one question, not three. A newer suggestion
-- replaces the standing one rather than queueing behind it.
create unique index if not exists pcd_pending_changes_one_per_field
  on public.pcd_pending_customer_changes (customer_id, field)
  where status = 'pending';

create index if not exists pcd_pending_changes_customer_idx
  on public.pcd_pending_customer_changes (customer_id) where status = 'pending';

comment on table public.pcd_pending_customer_changes is
  'Details that arrived and disagree with the customer record. Nothing is overwritten until somebody chooses.';

-- ── link what already exists to the customer ────────────────────────────────
--
-- All three of these already carry a customer email and nothing else, so the
-- quote sent, the payment taken and the website enquiry could never appear
-- beside the emails about them. Nullable on purpose: an old row with no match
-- is left alone rather than guessed at.
alter table public.pcd_order_activity
  add column if not exists customer_id uuid references public.pcd_customers(id) on delete set null;
alter table public.pcd_enquiries
  add column if not exists customer_id uuid references public.pcd_customers(id) on delete set null;
alter table public.pcd_quote_requests
  add column if not exists customer_id uuid references public.pcd_customers(id) on delete set null;

create index if not exists pcd_order_activity_customer_idx on public.pcd_order_activity (customer_id, created_at desc);
create index if not exists pcd_enquiries_customer_idx on public.pcd_enquiries (customer_id);
create index if not exists pcd_quote_requests_customer_idx on public.pcd_quote_requests (customer_id);

-- ── access ──────────────────────────────────────────────────────────────────
-- Same policy as every other admin table: signed in or nothing. The inbound
-- webhook runs with the service role, which bypasses this by design, because
-- an email arrives with nobody signed in.
alter table public.pcd_agents enable row level security;
alter table public.pcd_tickets enable row level security;
alter table public.pcd_messages enable row level security;
alter table public.pcd_message_attachments enable row level security;
alter table public.pcd_pending_customer_changes enable row level security;

drop policy if exists pcd_agents_admin_all on public.pcd_agents;
create policy pcd_agents_admin_all on public.pcd_agents for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists pcd_tickets_admin_all on public.pcd_tickets;
create policy pcd_tickets_admin_all on public.pcd_tickets for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists pcd_messages_admin_all on public.pcd_messages;
create policy pcd_messages_admin_all on public.pcd_messages for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists pcd_message_attachments_admin_all on public.pcd_message_attachments;
create policy pcd_message_attachments_admin_all on public.pcd_message_attachments for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists pcd_pending_changes_admin_all on public.pcd_pending_customer_changes;
create policy pcd_pending_changes_admin_all on public.pcd_pending_customer_changes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
