-- SUGGESTED DATES ON A QUOTE, AND HOW LONG THEY HOLD.
--
-- WHY. A customer deciding whether to accept wants to know when the job would
-- happen, and until now the only place a date existed was on the order, which
-- does not exist until after they have accepted. So they were asked to commit
-- to work with no timeframe attached to it, and the dates were then typed onto
-- the order by hand afterwards, from memory or from an email.
--
-- These two columns are what the quote SUGGESTS. They are copied onto the order
-- at acceptance, where they become scheduled_start_date and
-- target_completion_date, and from that moment the order's pair is the live
-- schedule. The quote's pair never changes again: it is the record of what the
-- customer was shown.
--
-- WHY THE HOLD IS A SETTING AND NOT A NUMBER IN THE CODE. A suggested start
-- date is only honest while the bench is still free, and a quote can sit
-- unanswered for weeks. So the quote tells the customer the dates hold for a
-- limited window from when it was sent, and how long that window is is a
-- policy, not a constant. It sits beside quote_valid_days for the same reason.

alter table public.pcd_quotes
  add column if not exists suggested_start_date date,
  add column if not exists suggested_completion_date date;

comment on column public.pcd_quotes.suggested_start_date is
  'The day we suggest the job goes on the bench, shown to the customer on the quote. Copied to pcd_orders.scheduled_start_date at acceptance. Never changed afterwards: it is the record of what the customer was shown.';

comment on column public.pcd_quotes.suggested_completion_date is
  'The day we suggest the job is finished, shown to the customer on the quote. Copied to pcd_orders.target_completion_date at acceptance.';

alter table public.pcd_business_defaults
  add column if not exists schedule_hold_hours integer not null default 48;

comment on column public.pcd_business_defaults.schedule_hold_hours is
  'How many hours from sending a quote its suggested start and completion dates are held for. Past this the customer is told on the quote that new dates will be offered. Policy, not a constant: the quote page, the quote PDF and the order page all read it.';
