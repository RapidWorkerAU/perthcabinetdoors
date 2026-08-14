alter table public.pcd_quotes
  add column if not exists removal_cost_ex_gst numeric(12,2) not null default 0;

comment on column public.pcd_quotes.removal_cost_ex_gst is
  'Quote-level door removal and disposal cost shown on customer quote/PDF only when greater than zero.';
