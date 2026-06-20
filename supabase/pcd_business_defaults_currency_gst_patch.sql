alter table public.pcd_business_defaults
  add column if not exists currency text not null default 'AUD',
  add column if not exists gst_rate numeric(8,4) not null default 0.1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pcd_business_defaults_currency_check'
  ) then
    alter table public.pcd_business_defaults
      add constraint pcd_business_defaults_currency_check
      check (char_length(trim(currency)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pcd_business_defaults_gst_rate_check'
  ) then
    alter table public.pcd_business_defaults
      add constraint pcd_business_defaults_gst_rate_check
      check (gst_rate >= 0);
  end if;
end;
$$;

update public.pcd_business_defaults
set
  currency = coalesce(nullif(trim(currency), ''), 'AUD'),
  gst_rate = coalesce(gst_rate, 0.1)
where id = '00000000-0000-0000-0000-000000000001';

notify pgrst, 'reload schema';
