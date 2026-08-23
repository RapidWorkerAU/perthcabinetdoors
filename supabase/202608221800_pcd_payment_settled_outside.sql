-- A PAYMENT THAT ARRIVED SOME OTHER WAY.
--
-- WHY. Once a payment link had been sent, the payment's financial fields were
-- locked, and is_paid was one of them. Sound reasoning: Stripe owns a requested
-- payment and hand-marking one paid invites double counting.
--
-- It did not allow for the ordinary case. A link goes out, it does not work for
-- the customer, they transfer the money instead, and there is then no way to
-- close the payment off. The money is in the bank and the system insists it is
-- still owing, on the order, in the financials, and on every chase list.
--
-- These two columns are what make settling it honest rather than just possible:
-- a payment marked paid outside the link says HOW it arrived and carries the
-- reference to find it in the bank. "Paid" with nothing behind it is exactly
-- what the locking was protecting against.
--
-- request_status also gains a new value, settled_outside, which is deliberately
-- not "paid": a later look has to be able to tell "they used the link" from "the
-- link never worked and they transferred it".

alter table public.pcd_order_payments
  add column if not exists settlement_method text,
  add column if not exists settlement_reference text;

comment on column public.pcd_order_payments.settlement_method is
  'How a payment arrived when it did not come through the link: bank_transfer, cash, card_in_person, cheque or other. Null on a payment taken through Stripe, which is its own record.';
comment on column public.pcd_order_payments.settlement_reference is
  'The bank reference, receipt number or similar, so the payment can be found later. Required for the methods that have one.';

-- Finding everything settled by hand, which is what a reconciliation asks for.
create index if not exists pcd_order_payments_settlement_idx
  on public.pcd_order_payments(settlement_method)
  where settlement_method is not null;

do $$
declare
  stranded int;
begin
  -- Payments with a link out, still unpaid. Any of these that are already in the
  -- bank can now be closed off from the order screen.
  select count(*) into stranded
    from public.pcd_order_payments
   where is_paid = false
     and coalesce(request_status, 'not_requested') <> 'not_requested';

  raise notice 'Payments with a request out and still showing as owing: %. Any already paid another way can now be marked off on the order, which records how it arrived.', stranded;
end $$;
