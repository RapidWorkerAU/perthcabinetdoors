-- Workshop labour hours allowed PER CABINET (audit p2-6). Each base-cabinet
-- line contributes labour_hours_per_cabinet × qty to the quote's labour total
-- (which then × the worker hourly rate). A single global default on the
-- business-defaults singleton; adjust per business.

alter table public.pcd_business_defaults
  add column if not exists labour_hours_per_cabinet numeric not null default 1.5;

comment on column public.pcd_business_defaults.labour_hours_per_cabinet is
  'Workshop labour hours allowed per cabinet (× qty per base-cabinet line) — feeds the quote labour total.';

notify pgrst, 'reload schema';
