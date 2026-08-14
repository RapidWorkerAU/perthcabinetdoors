-- Repairs quotes and orders whose global-default fields were stored as 0.
--
-- Why they exist: pcd_quotes.worker_hourly_rate and pcd_quote_line_items.
-- markup_percent are `not null default 0`, so a row that never captured a value
-- is indistinguishable from one deliberately set to zero. Every fallback in the
-- app (`??`, toNumber(value, fallback)) treats that stored 0 as a real number,
-- so the configured hourly rate and markup were skipped and the quote priced
-- its labour at nothing. The code fix makes a zero rate inherit the default
-- from here on; this repairs the rows already saved.
--
-- Run once, after deploying the code change.

begin;

-- ── 1. Hourly rate ─────────────────────────────────────────────────────────
-- Safe to apply blanket: nobody quotes a $0/hour worker, so every zero here is
-- an unset field rather than a decision. Labour costs are recalculated from the
-- restored rate so existing totals stop understating.

-- Every step below is scoped to status = 'draft'. A sent, viewed, approved or
-- rejected quote is a number the customer already has; repricing it silently
-- would be worse than leaving it wrong. Just as importantly, the three updates
-- have to cover the SAME rows — restoring the rate on a sent quote but not its
-- total would leave the row internally inconsistent, which is harder to spot
-- than the original problem. Those quotes are listed by the audit query at the
-- bottom so they can be reissued deliberately.

update public.pcd_quotes q
set worker_hourly_rate = d.worker_hourly_rate
from public.pcd_business_defaults d
where d.id = '00000000-0000-0000-0000-000000000001'
  and coalesce(q.worker_hourly_rate, 0) = 0
  and q.status = 'draft';

update public.pcd_quotes
set
  labour_cost_ex_gst = round(coalesce(labour_hours, 0) * coalesce(worker_hourly_rate, 0), 2)
where status = 'draft'
  and coalesce(labour_hours, 0) > 0
  and round(coalesce(labour_hours, 0) * coalesce(worker_hourly_rate, 0), 2)
      is distinct from coalesce(labour_cost_ex_gst, 0);

-- Re-derive each affected quote's subtotal / GST / total from its own stored
-- component costs, so the restored labour actually reaches the customer-facing
-- figure rather than sitting in a column nothing adds up.
update public.pcd_quotes
set
  subtotal_ex_gst = round(
    coalesce(material_cost_ex_gst, 0)
    + coalesce(labour_cost_ex_gst, 0)
    + coalesce(travel_cost_ex_gst, 0)
    + coalesce(delivery_cost_ex_gst, 0)
    + coalesce(installation_cost_ex_gst, 0)
    + coalesce(painting_cost_ex_gst, 0)
    + coalesce(glass_cost_ex_gst, 0), 2),
  gst_amount = round(
    round(
      coalesce(material_cost_ex_gst, 0)
      + coalesce(labour_cost_ex_gst, 0)
      + coalesce(travel_cost_ex_gst, 0)
      + coalesce(delivery_cost_ex_gst, 0)
      + coalesce(installation_cost_ex_gst, 0)
      + coalesce(painting_cost_ex_gst, 0)
      + coalesce(glass_cost_ex_gst, 0), 2)
    * coalesce(gst_rate, 0.1), 2),
  total_inc_gst = round(
    round(
      coalesce(material_cost_ex_gst, 0)
      + coalesce(labour_cost_ex_gst, 0)
      + coalesce(travel_cost_ex_gst, 0)
      + coalesce(delivery_cost_ex_gst, 0)
      + coalesce(installation_cost_ex_gst, 0)
      + coalesce(painting_cost_ex_gst, 0)
      + coalesce(glass_cost_ex_gst, 0), 2)
    * (1 + coalesce(gst_rate, 0.1)), 2)
where status = 'draft';

-- ── 2. Default quote terms ─────────────────────────────────────────────────
-- Quotes saved before the terms default existed carry a null, so the PDF prints
-- no terms at all.

update public.pcd_quotes q
set terms = d.quote_terms
from public.pcd_business_defaults d
where d.id = '00000000-0000-0000-0000-000000000001'
  and d.quote_terms is not null
  and (q.terms is null or btrim(q.terms) = '')
  and q.status = 'draft';

commit;

-- ── 3. Line markup — OPT IN, review before running ─────────────────────────
-- NOT applied automatically. Unlike an hourly rate, 0% markup is a legitimate
-- choice on a pass-through or supply-only line, and there is no way to tell
-- those apart from lines that simply never picked up the default. Run the
-- SELECT first; if the rows it returns are all ones that should have carried
-- the standard markup, uncomment the UPDATE.
--
--   select l.id, l.quote_id, q.quote_number, q.status, l.product_name,
--          l.product_cost_ex_gst, l.markup_percent
--   from public.pcd_quote_line_items l
--   join public.pcd_quotes q on q.id = l.quote_id
--   where coalesce(l.markup_percent, 0) = 0
--     and coalesce(l.product_cost_ex_gst, 0) > 0
--     and q.status = 'draft'
--   order by q.created_at desc;
--
--   update public.pcd_quote_line_items l
--   set markup_percent = d.markup_percent,
--       markup_amount_ex_gst = round(coalesce(l.product_cost_ex_gst, 0) * d.markup_percent / 100, 2)
--   from public.pcd_business_defaults d, public.pcd_quotes q
--   where d.id = '00000000-0000-0000-0000-000000000001'
--     and q.id = l.quote_id
--     and coalesce(l.markup_percent, 0) = 0
--     and coalesce(l.product_cost_ex_gst, 0) > 0
--     and q.status = 'draft';
--
-- After running it, reopen and save each affected quote so the line and quote
-- totals are recalculated together.

-- ── 4. Audit: quotes left alone because they are already out with a customer ─
--   select quote_number, status, worker_hourly_rate, labour_hours, total_inc_gst
--   from public.pcd_quotes
--   where status <> 'draft'
--     and coalesce(labour_hours, 0) > 0
--     and coalesce(labour_cost_ex_gst, 0) = 0
--   order by created_at desc;

notify pgrst, 'reload schema';
