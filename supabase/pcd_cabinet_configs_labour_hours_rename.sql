-- pcd_cabinet_configs.labour_cost has always held HOURS, never dollars.
--
-- Every writer puts hours in it — normalizeCabinetConfig() in
-- lib/pcd-cabinet-utils.js sets `labour_cost: labourHours`, and both the
-- quote-line configurator and the design import route pass
-- `totals.labour_hours` straight into it. Every reader takes hours back out.
-- So the value is correct today; the NAME is the hazard.
--
-- It is a numeric(12,2) called "labour_cost", sitting immediately below
-- cost_per_sqm_carcass and cost_per_sqm_shelf, inside a constraint called
-- "costs_non_negative". Anyone reading the schema — or writing a migration,
-- a backfill, or a report — would reasonably put dollars in it. The moment
-- they do, $250 is read as 250 hours and billed at the worker hourly rate:
-- 250 x $85 = $21,250 on a customer's quote, from one plausible mistake.
--
-- Renaming rather than adding a column: the data needs no conversion (it's
-- already hours), and leaving a decoy named labour_cost behind would keep
-- the trap open. The check constraint follows the column automatically.
--
-- Idempotent: safe to re-run, and a no-op once applied.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'pcd_cabinet_configs'
      and column_name  = 'labour_cost'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'pcd_cabinet_configs'
      and column_name  = 'labour_hours'
  ) then
    alter table public.pcd_cabinet_configs
      rename column labour_cost to labour_hours;
  end if;
end $$;

comment on column public.pcd_cabinet_configs.labour_hours is
  'Labour HOURS for this cabinet, not a dollar amount. Priced by multiplying '
  'against the business default worker_hourly_rate at quote-calculation time '
  '(see calculateQuoteTotals in lib/pcd-quote-utils.js). Was misleadingly '
  'named labour_cost.';
