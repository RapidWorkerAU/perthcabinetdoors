-- RLS policies for the single colour library table.
-- Run this after creating/importing public.pcd_colour_library.

alter table public.pcd_colour_library enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_colour_library'
      and policyname = 'Public can read active colour library rows'
  ) then
    create policy "Public can read active colour library rows"
      on public.pcd_colour_library
      for select
      using (is_active = true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_colour_library'
      and policyname = 'Authenticated users can manage colour library rows'
  ) then
    create policy "Authenticated users can manage colour library rows"
      on public.pcd_colour_library
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
