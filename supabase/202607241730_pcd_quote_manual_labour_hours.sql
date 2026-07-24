-- Split the MANUAL labour-hours input from the DERIVED labour-hours total.
--
-- Bug: pcd_quotes.labour_hours was used as BOTH the manual base AND the stored
-- total. calculateQuoteTotals reads it as the base and returns base + Σ line
-- labour_hours; recalculateQuoteTotals then writes that total back into
-- labour_hours. With any non-zero LINE labour (e.g. once cabinets carry labour),
-- every recalc re-adds the line labour → runaway inflation. It's dormant today
-- only because no line carries labour.
--
-- Fix: manual_labour_hours holds the user's input (the base). labour_hours
-- becomes the DERIVED total (manual_labour_hours + Σ line labour_hours), for
-- display/reporting — never fed back as the base. Backfill the base from the
-- current labour_hours (safe: no line carries labour yet, so today's
-- labour_hours equals the manual base). A default of 0 keeps new quotes from
-- ever being NULL (a NULL base would fall back to labour_hours and re-open the
-- runaway loop for new quotes).

alter table public.pcd_quotes
  add column if not exists manual_labour_hours numeric;

update public.pcd_quotes
  set manual_labour_hours = coalesce(labour_hours, 0)
  where manual_labour_hours is null;

alter table public.pcd_quotes
  alter column manual_labour_hours set default 0;

comment on column public.pcd_quotes.manual_labour_hours is
  'Manual labour-hours input (the base). labour_hours is the DERIVED total = manual_labour_hours + Σ line labour_hours; never write the derived total back into this column.';

notify pgrst, 'reload schema';
