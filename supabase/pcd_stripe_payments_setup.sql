alter table public.pcd_quotes
  add column if not exists deposit_required boolean not null default false,
  add column if not exists deposit_percent numeric(6,2) not null default 0;

alter table public.pcd_order_payments
  add column if not exists request_status text not null default 'not_requested',
  add column if not exists requested_at timestamptz,
  add column if not exists request_url text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_payment_status text,
  add column if not exists receipt_number text,
  add column if not exists receipt_sent_at timestamptz,
  add column if not exists receipt_pdf_url text;

create unique index if not exists idx_pcd_order_payments_stripe_session
  on public.pcd_order_payments(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists idx_pcd_order_payments_request_status
  on public.pcd_order_payments(request_status);

alter table public.pcd_quotes
  drop constraint if exists pcd_quotes_deposit_percent_check;

alter table public.pcd_quotes
  add constraint pcd_quotes_deposit_percent_check
  check (deposit_percent >= 0 and deposit_percent <= 100);
