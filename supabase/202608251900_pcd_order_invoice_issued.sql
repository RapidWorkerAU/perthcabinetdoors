-- WHEN THE TAX INVOICE WAS FIRST ISSUED.
--
-- One column, and its whole job is to stop the issue date moving.
--
-- The invoice number IS the order number, so re-sending cannot produce a second
-- invoice for one job. But the DATE would move every time without this: a
-- customer who asks for another copy in October would get an invoice for work
-- they paid for in July, dated October. A tax document that changes its own date
-- each time it is re-sent is not a tax document.
--
-- Stamped on the first successful send and never written again.
--
-- NULL means it has not been sent yet, which is also what the order page reads
-- to say "Send tax invoice" rather than "Send it again".

alter table public.pcd_orders
  add column if not exists invoice_issued_at timestamptz;

comment on column public.pcd_orders.invoice_issued_at is
  'When the tax invoice for this order was FIRST emailed. Never moved: a re-sent invoice carries the date it was issued, not the date it was re-sent. Null means it has not been sent. The invoice number is the order number.';

notify pgrst, 'reload schema';
