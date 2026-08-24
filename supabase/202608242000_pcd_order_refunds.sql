-- Refunds, as lines on the order's payments
-- ---------------------------------------------------------------------------
--
-- WHY. Money sometimes has to go back: a job quoted wrong, a deposit taken
-- twice, a variation that came off. Until now there was nowhere to record that,
-- so a refund paid out of the bank existed on a bank statement and nowhere else,
-- and the order went on saying the customer had paid the full amount.
--
-- A REFUND IS A PAYMENT LINE, NOT A NEW KIND OF RECORD. It sits in the same
-- table, in the same list, and goes through the same two steps: a line is added,
-- then it is processed and the customer is told. Anybody who can read the
-- payments tab can already read this.
--
-- THE AMOUNT IS STORED NEGATIVE, and that is the whole design.
--
--   Every sum in the system already adds pcd_order_payments.amount up:
--   what has been received, what is owed, the GST collected, the deposit
--   gate, the board, the financials. A refund stored as a positive number
--   with a flag beside it would need every one of those places to learn
--   about the flag, and the one that was missed would be silently wrong
--   about money.
--
--   Stored negative, they all net off on their own and were correct the
--   moment this migration ran.
--
-- The check constraint below is what stops the sign and the type drifting
-- apart: a refund may not be positive, and a payment may not be negative.
--
-- WHAT IS ADDED
--
--   payment_type gains 'refund'
--   refund_of_payment_id   which payment this is giving back, when it is one
--                          particular payment. Optional: money returned that
--                          does not trace to a single line is still a refund.
--   refund_method          how it went back. 'stripe' means Stripe sent it to
--                          the card; the rest are what we did by hand.
--   stripe_refund_id       Stripe's own id, so a refund cannot be sent twice.
--   refund_reason          why, in the words the customer is told.
--
-- Nothing here changes an existing row.

alter table public.pcd_order_payments
  add column if not exists refund_of_payment_id uuid references public.pcd_order_payments(id) on delete set null,
  add column if not exists refund_method text,
  add column if not exists stripe_refund_id text,
  add column if not exists refund_reason text;

comment on column public.pcd_order_payments.refund_of_payment_id is
  'The payment this refund gives back, when it is one particular payment. Null for money returned that does not trace to a single line.';
comment on column public.pcd_order_payments.refund_method is
  'stripe means Stripe sent it back to the card. bank_transfer, cash, card_in_person, cheque and other are refunds we made ourselves.';
comment on column public.pcd_order_payments.stripe_refund_id is
  'Stripe''s id for the refund. Unique, so the same refund cannot be sent to a card twice.';
comment on column public.pcd_order_payments.refund_reason is
  'Why the money went back. Goes to the customer in the email, so it is written for them rather than for us.';

-- 'refund' joins the list of what a payment line can be.
do $$
begin
  alter table public.pcd_order_payments drop constraint if exists pcd_order_payments_payment_type_check;
  alter table public.pcd_order_payments
    add constraint pcd_order_payments_payment_type_check
    check (payment_type in ('deposit', 'progress', 'final', 'other', 'refund'));
end $$;

-- THE SIGN AND THE TYPE CANNOT DISAGREE. A refund stored positive would be
-- counted as money received by every sum in the system, which is the exact
-- opposite of what happened.
do $$
begin
  alter table public.pcd_order_payments drop constraint if exists pcd_order_payments_refund_sign_check;
  alter table public.pcd_order_payments
    add constraint pcd_order_payments_refund_sign_check
    check (
      (payment_type = 'refund' and amount <= 0)
      or (payment_type <> 'refund' and amount >= 0)
    );
end $$;

-- Sent once. A retry after a timeout that actually succeeded must not put the
-- money back on the card a second time.
create unique index if not exists pcd_order_payments_stripe_refund_id_key
  on public.pcd_order_payments (stripe_refund_id)
  where stripe_refund_id is not null;

-- Every refund against a payment, which is what "how much of this is still
-- refundable" has to read.
create index if not exists pcd_order_payments_refund_of_idx
  on public.pcd_order_payments (refund_of_payment_id)
  where refund_of_payment_id is not null;

notify pgrst, 'reload schema';
