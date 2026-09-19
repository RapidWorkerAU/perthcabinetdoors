-- MONEY WE ARE HOLDING FOR A CUSTOMER.
--
-- ── WHERE IT COMES FROM TODAY ────────────────────────────────────────────────
--
-- A site measure fee, paid on the website, which we promised comes off any
-- order that follows. One source, but the shape is general on purpose: a
-- refunded deposit, an overpayment and a goodwill credit are the same thing
-- with a different reason, and none of them will need a migration.
--
-- ── THE STATE IS THE WHOLE POINT ─────────────────────────────────────────────
--
-- One customer can have three quotes open. A credit that showed on all three
-- would be given away twice the moment two of them became orders. So a credit
-- is CLAIMED by exactly one quote at a time:
--
--   available   nobody is holding it, it can be claimed
--   held        one quote has it. held_quote_id says which.
--   spent       it became a payment on an order and is gone
--   written_off we kept it, with a reason recorded
--   refunded    it went back to their card
--
-- held_quote_id being a single column is what makes two quotes holding one
-- credit impossible rather than unlikely. Every move between states is written
-- as a conditional update on the state we read, so two requests racing cannot
-- both win.
--
-- ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
--
-- Not an accounts system. No expiry, no partial spends split across jobs, no
-- transfers between customers, no statements. Every one of those is a new way
-- to be wrong about somebody's money, and none of them has been asked for.

create table if not exists public.pcd_customer_credits (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null references public.pcd_customers(id) on delete cascade,

  -- Inc GST, because it is money we have already received inc GST. It is never
  -- applied before GST: doing that hands back more than we were paid. See
  -- lib/pcd-customer-credits.js.
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'AUD',

  -- Why they have it, and the words the customer reads. reason drives nothing
  -- but reporting; the label is what appears on their quote.
  reason text not null default 'site_measure' check (
    reason in ('site_measure', 'overpayment', 'refund_held', 'goodwill', 'other')
  ),

  -- The day the customer's money actually arrived. Printed on their quote so
  -- somebody checking it against a bank statement can find the line.
  paid_on date not null default (timezone('utc', now())::date),

  state text not null default 'available' check (
    state in ('available', 'held', 'spent', 'written_off', 'refunded')
  ),

  -- The one quote holding it. Null in every other state.
  held_quote_id uuid references public.pcd_quotes(id) on delete set null,
  held_at timestamptz,

  -- Where it ended up. The payment row is the credit, on the order.
  spent_order_id   uuid references public.pcd_orders(id)         on delete set null,
  spent_payment_id uuid references public.pcd_order_payments(id) on delete set null,
  spent_at timestamptz,

  -- Where it came from, when that was a booking.
  site_measure_booking_id uuid references public.pcd_site_measure_bookings(id) on delete set null,

  -- Taking money off a customer is recorded. Releasing a credit back to
  -- available is not: that only moves it between our own quotes and the money
  -- stays theirs either way.
  closed_at timestamptz,
  closed_reason text,
  closed_by text,
  stripe_refund_id text,

  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- The read the quote builder does on every open: what can this customer use.
create index if not exists idx_pcd_customer_credits_customer
  on public.pcd_customer_credits (customer_id, state);

-- The read the quote does: what is on me.
create index if not exists idx_pcd_customer_credits_quote
  on public.pcd_customer_credits (held_quote_id)
  where held_quote_id is not null;

-- ONE BOOKING, ONE CREDIT. A webhook delivered twice, or a cancellation
-- processed twice, cannot mint a second hundred dollars.
create unique index if not exists idx_pcd_customer_credits_booking
  on public.pcd_customer_credits (site_measure_booking_id)
  where site_measure_booking_id is not null;

-- A credit is only ever held by a quote while it says it is held, and only ever
-- points at an order once it is spent. Enforced here rather than trusted to the
-- code, because every one of these is a way to double spend.
alter table public.pcd_customer_credits
  drop constraint if exists pcd_customer_credits_state_shape;
alter table public.pcd_customer_credits
  add constraint pcd_customer_credits_state_shape check (
    (state = 'held'  and held_quote_id is not null)
    or (state = 'spent' and spent_order_id is not null)
    or (state in ('available', 'written_off', 'refunded') and held_quote_id is null)
  );

comment on table public.pcd_customer_credits is
  'Money held for a customer that comes off a later quote. Claimed by one quote at a time; becomes a paid payment row on the order at acceptance.';
comment on column public.pcd_customer_credits.state is
  'available, held by one quote, spent onto an order, written off, or refunded. held_quote_id being a single column is what stops two quotes claiming one credit.';
comment on column public.pcd_customer_credits.amount is
  'Inc GST. Applied under the quote total as money already received, never as a negative cost line: a cost line lands before GST and hands back more than we were paid.';

-- ── The quote remembers what it was given ────────────────────────────────────
--
-- Denormalised on purpose. The public quote page, the PDF and the order all
-- need the figure, and reading the credit table from each of them means three
-- chances to disagree about what a customer was shown. This is written whenever
-- credits are claimed or released, and it is what every reader reads.
alter table public.pcd_quotes
  add column if not exists credit_applied_inc_gst numeric(12,2) not null default 0;

comment on column public.pcd_quotes.credit_applied_inc_gst is
  'Total customer credit shown on this quote, inc GST. Subtracted from total_inc_gst to give the amount payable. Kept in step with pcd_customer_credits by lib/pcd-customer-credits.js; never edited by hand.';

alter table public.pcd_orders
  add column if not exists credit_applied_inc_gst numeric(12,2) not null default 0;

comment on column public.pcd_orders.credit_applied_inc_gst is
  'Customer credit carried over from the quote at acceptance. The money itself is a paid row in pcd_order_payments; this is only so the order can say where it came from.';

alter table public.pcd_customer_credits enable row level security;

drop policy if exists pcd_customer_credits_rw on public.pcd_customer_credits;
create policy pcd_customer_credits_rw on public.pcd_customer_credits
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
