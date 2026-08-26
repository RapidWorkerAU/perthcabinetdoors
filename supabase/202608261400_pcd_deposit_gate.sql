-- THE DEPOSIT GATE.
--
-- Approving a quote that needs a deposit used to create the order there and
-- then, before a cent had been paid. A customer who clicked Approve and closed
-- the payment tab left an order behind for work nobody had paid for, and their
-- quote link locked itself so they could not come back and finish. Both halves
-- were wrong: we held a job that was not a job, and they were stranded.
--
-- From here the approval and the deposit are one transaction. Neither counts on
-- its own. A quote waits in 'awaiting_deposit' until Stripe says the money
-- arrived, and only then does anything get created.
--
-- This file adds somewhere to keep the payment attempts.
--
-- CORRECTION. This originally said pcd_quotes.status was free text and needed no
-- constraint change. It was wrong: pcd_quotes_status_check exists and refuses
-- 'awaiting_deposit'. 202608261405_pcd_quote_status_awaiting_deposit.sql adds
-- the value and explains how the check was missed. Run it before the data fix
-- in 202608261410.

-- ---------------------------------------------------------------------------
-- Every attempt at paying a deposit, kept rather than overwritten.
--
-- One row per Stripe checkout session. Kept as history because a customer who
-- abandons in March and pays in May made two attempts, and squashing that into
-- one row loses the fact that they tried and stopped. It also stops a second
-- click minting a second payment page when the first is still perfectly good.
-- ---------------------------------------------------------------------------
create table if not exists public.pcd_quote_checkouts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.pcd_quotes(id) on delete cascade,

  -- Unique, because it is the key the Stripe webhook, the thank you page and
  -- the sweep all arrive holding. Two rows for one session would let the same
  -- payment be finalised twice.
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  checkout_url text,

  amount numeric(12,2) not null default 0,
  currency text not null default 'AUD',

  --   open            payment page is live and unpaid
  --   paid            money arrived and the order was created
  --   expired         Stripe's 24 hours ran out with nothing paid
  --   superseded      a newer attempt replaced it, or the quote was pulled back
  --   needs_attention money arrived against a quote that was no longer held.
  --                   Never resolved automatically: see lib/pcd-deposit-gate.js
  status text not null default 'open',

  -- The order this attempt produced, so a repeat webhook can answer "already
  -- done, here it is" without going near the quote again.
  order_id uuid references public.pcd_orders(id) on delete set null,

  -- What the customer typed when they approved. Held here rather than written
  -- onto the quote, because until they pay they have not approved anything.
  client_name text,

  created_at timestamptz not null default now(),
  expires_at timestamptz,
  paid_at timestamptz
);

create index if not exists pcd_quote_checkouts_quote_idx
  on public.pcd_quote_checkouts (quote_id, created_at desc);

-- The sweep asks for exactly this: attempts still open, oldest first.
create index if not exists pcd_quote_checkouts_open_idx
  on public.pcd_quote_checkouts (status, created_at)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- The chase, tracked on the QUOTE and not on the attempt.
--
-- A customer gets the two reminders once, ever. Tracking it per attempt would
-- restart the chase every time they came back and abandoned again, which is a
-- machine that is not paying attention.
-- ---------------------------------------------------------------------------
alter table public.pcd_quotes
  -- When they first reached a payment page. The reminders are timed from here
  -- rather than from the attempt, so a second attempt does not reset the clock.
  add column if not exists awaiting_deposit_at timestamptz,
  add column if not exists deposit_reminded_at timestamptz,
  add column if not exists deposit_final_reminded_at timestamptz,
  -- Separate from the customer's final reminder even though they go together,
  -- because one being refused by the mail provider must not silently swallow
  -- the other.
  add column if not exists deposit_staff_notified_at timestamptz;
