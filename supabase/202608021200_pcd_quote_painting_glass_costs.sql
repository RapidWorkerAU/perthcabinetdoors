alter table public.pcd_quotes
  add column if not exists painting_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists glass_cost_ex_gst numeric(12,2) not null default 0;

comment on column public.pcd_quotes.painting_cost_ex_gst is
  'Quote-level painting cost shown on customer quote/PDF only when greater than zero.';

comment on column public.pcd_quotes.glass_cost_ex_gst is
  'Quote-level glass insert cost shown on customer quote/PDF only when greater than zero.';
