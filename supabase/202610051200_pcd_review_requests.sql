-- ASKING A FINISHED CUSTOMER FOR A GOOGLE REVIEW.
--
-- When an order is marked complete and paid in full, a short thank you email
-- goes out a few days later asking for a Google review. A daily job sends it.
-- The rules are in lib/pcd-review-requests.js.
--
-- ── ON THE ORDER ─────────────────────────────────────────────────────────────
--
--   review_token                   the code in the customer's two links, the
--                                  review button and the unsubscribe link.
--                                  Random, so one order's links say nothing
--                                  about another's.
--   review_request_sent_at         when it went. Set once and never cleared,
--                                  which is what stops a reopened and
--                                  re-completed order being asked twice.
--   review_request_skipped_at      a decision not to send, and
--   review_request_skipped_reason  why: 'staff', 'opted_out', 'asked_recently'.
--   review_request_skipped_by      who, when it was a person.
--   review_link_clicked_at         the first time the customer pressed the
--                                  review button.
--
-- ── ON THE CUSTOMER ──────────────────────────────────────────────────────────
--
--   review_requests_never          the "Never ask for reviews" tick on the
--                                  customer page, for trade customers and
--                                  anybody it would be wrong to ask.
--
-- ── BY ADDRESS ───────────────────────────────────────────────────────────────
--
--   pcd_review_opt_outs            addresses that pressed unsubscribe. Kept by
--                                  email rather than on the customer, because an
--                                  order can carry an address with no customer
--                                  record behind it, and the Spam Act asks us to
--                                  honour the request whatever our records say.
--
-- ── IN BUSINESS DEFAULTS ─────────────────────────────────────────────────────
--
-- The switch, the wait, the gap between asks, the Google link and the wording.
-- review_requests_enabled_at is stamped by the trigger below the moment the
-- switch goes on, and only orders completed after it are asked. Turning this on
-- must never email every customer we have ever finished a job for.
--
-- The switch starts OFF. Nothing is sent until it is turned on in Settings.
--
-- Safe to run twice.

create or replace function public.pcd_business_defaults_stamp_review_enabled()
returns trigger
language plpgsql
as $$
begin
  if new.review_requests_enabled
     and (tg_op = 'INSERT' or not coalesce(old.review_requests_enabled, false)) then
    new.review_requests_enabled_at := timezone('utc', now());
  elsif tg_op = 'UPDATE' then
    -- Never moved by a save that did not turn the switch on. The settings
    -- screen writes the whole row, and it does not send this column.
    new.review_requests_enabled_at := coalesce(new.review_requests_enabled_at, old.review_requests_enabled_at);
  end if;
  return new;
end $$;

do $$
begin
  alter table public.pcd_orders
    add column if not exists review_token uuid not null default gen_random_uuid(),
    add column if not exists review_request_sent_at timestamptz,
    add column if not exists review_request_skipped_at timestamptz,
    add column if not exists review_request_skipped_reason text,
    add column if not exists review_request_skipped_by text,
    add column if not exists review_link_clicked_at timestamptz;

  create unique index if not exists pcd_orders_review_token_key on public.pcd_orders (review_token);

  -- What the daily job reads: finished orders not yet sent or skipped.
  create index if not exists pcd_orders_review_due_idx on public.pcd_orders (completed_at)
    where status = 'complete' and review_request_sent_at is null and review_request_skipped_at is null;

  alter table public.pcd_customers
    add column if not exists review_requests_never boolean not null default false;

  create table if not exists public.pcd_review_opt_outs (
    email text primary key,
    opted_out_at timestamptz not null default now(),
    order_id uuid references public.pcd_orders(id) on delete set null,
    constraint pcd_review_opt_outs_email_lower check (email = lower(btrim(email)))
  );

  alter table public.pcd_review_opt_outs enable row level security;
  drop policy if exists pcd_review_opt_outs_rw on public.pcd_review_opt_outs;
  create policy pcd_review_opt_outs_rw on public.pcd_review_opt_outs
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

  alter table public.pcd_business_defaults
    add column if not exists review_requests_enabled boolean not null default false,
    add column if not exists review_requests_enabled_at timestamptz,
    add column if not exists review_request_delay_days integer not null default 3,
    add column if not exists review_request_gap_months integer not null default 12,
    add column if not exists google_review_url text not null default 'https://g.page/r/CaT48UGdvqV3EAI/review',
    add column if not exists review_request_subject text not null default 'Thank you from Perth Cabinet Doors',
    add column if not exists review_request_message text not null default
'Hi {first_name},

Your order {order_number} is complete and we wanted to say thank you for choosing Perth Cabinet Doors.

We are a local business and we are growing. A Google review takes about two minutes and makes a real difference. It helps other people in Perth find us, and it tells us what we are doing well and where we can improve.

{review_button}

Thanks again for your business.

The team at Perth Cabinet Doors';

  drop trigger if exists pcd_business_defaults_stamp_review_enabled on public.pcd_business_defaults;
  create trigger pcd_business_defaults_stamp_review_enabled
    before insert or update on public.pcd_business_defaults
    for each row execute function public.pcd_business_defaults_stamp_review_enabled();

  comment on column public.pcd_orders.review_request_sent_at is
    'When the Google review request email went. Never cleared, so an order is only ever asked once. See lib/pcd-review-requests.js.';
  comment on column public.pcd_customers.review_requests_never is
    'Never send this customer a Google review request. The tick on the customer page.';
  comment on table public.pcd_review_opt_outs is
    'Addresses that unsubscribed from Google review requests. Order, quote and invoice emails are not affected.';
  comment on column public.pcd_business_defaults.review_requests_enabled_at is
    'Stamped by trigger when review requests are switched on. Only orders completed after it are asked.';
end $$;
