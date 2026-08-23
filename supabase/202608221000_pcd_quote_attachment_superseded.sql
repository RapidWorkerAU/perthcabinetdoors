-- KEEP EVERY QUOTE PDF WE EVER SENT, WITHOUT SHOWING THE CUSTOMER FIVE OF THEM.
--
-- WHY. Re-sending a quote deleted the previously generated PDF and its file, so
-- exactly one ever existed: the latest. There was no way to show what the
-- customer was originally given.
--
-- That deletion was there for a good reason. Leaving old copies in the customer's
-- attachment list would show them several PDFs with no way to tell which one is
-- current, and somebody would work from the wrong figures.
--
-- So this keeps both properties. A superseded PDF is MARKED rather than deleted:
-- it stays in storage and in the table, the customer's list hides it, and the
-- office can still open it to answer "what did they actually receive in July".
--
-- This matters more now than it did last week. The admin override makes pulling
-- a sent quote back a normal action, and every override used to destroy the
-- record of what had been sent before it.

alter table public.pcd_quote_attachments
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references public.pcd_quote_attachments(id) on delete set null;

comment on column public.pcd_quote_attachments.superseded_at is
  'Set when a newer generated PDF replaced this one. A superseded attachment is hidden from the customer''s list but kept as the record of what they were sent at the time. Null means this is the current document.';
comment on column public.pcd_quote_attachments.superseded_by is
  'The attachment that replaced this one, so the chain of what was sent can be walked in order.';

-- Only ever a handful are current, and every customer-facing read filters on it.
create index if not exists pcd_quote_attachments_current_idx
  on public.pcd_quote_attachments(quote_id)
  where superseded_at is null;

-- Nothing to backfill: every row that exists today is current, because the old
-- behaviour deleted the ones that were not. The history starts from here.
do $$
declare
  kept int;
begin
  select count(*) into kept from public.pcd_quote_attachments where superseded_at is null;
  raise notice 'Quote attachments now current: %. Superseded copies will be kept from the next send onwards.', kept;
end $$;
