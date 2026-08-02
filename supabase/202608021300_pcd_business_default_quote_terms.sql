alter table public.pcd_business_defaults
  add column if not exists quote_terms text;

update public.pcd_business_defaults
set
  quote_terms = coalesce(
    quote_terms,
    'Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.'
  ),
  hinge_supply_unit_cost_ex_gst = 0
where id = '00000000-0000-0000-0000-000000000001';

notify pgrst, 'reload schema';
