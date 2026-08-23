-- ROW LEVEL SECURITY FOR THE PROFILE LIBRARY.
--
-- WHY THIS IS A SEPARATE FILE AND WAS MISSED. 202608231000 created the table and
-- seeded 150 rows correctly, and then every screen showed "No profiles match
-- these filters". The rows were there the whole time: RLS was on with no policy,
-- so the anon key the pages read with got an empty list and an HTTP 200.
--
-- That is the worst shape a failure can take. An empty table and a blocked read
-- look identical on screen, and the page cannot tell them apart either, so it
-- says the one thing it can say: there is nothing here.
--
-- The same two policies the colour library has, for the same reasons.
--
--   Public read, ACTIVE ONLY. The finishes page and the public quote tool are
--   not signed in, and a retired profile must not be offered to a customer.
--
--   Authenticated everything. The admin manages the catalogue, including the
--   retired rows the public cannot see.

alter table public.pcd_profile_library enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'pcd_profile_library'
       and policyname = 'Public can read active profile library rows'
  ) then
    create policy "Public can read active profile library rows"
      on public.pcd_profile_library
      for select
      using (is_active = true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'pcd_profile_library'
       and policyname = 'Authenticated users can manage profile library rows'
  ) then
    create policy "Authenticated users can manage profile library rows"
      on public.pcd_profile_library
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Say what the anon key can now see, because "the rows exist" and "the page can
-- read them" are different questions and only the second one matters.
-- ---------------------------------------------------------------------------
do $$
declare
  total int;
  visible int;
begin
  select count(*) into total   from public.pcd_profile_library;
  select count(*) into visible from public.pcd_profile_library where is_active = true;

  raise notice 'Profile library rows: % total, % readable without signing in.', total, visible;
  if visible = 0 and total > 0 then
    raise warning 'Every row is inactive, so the public pages will still show nothing.';
  end if;
end $$;
