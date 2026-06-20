create table if not exists public.pcd_rooms (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.pcd_quotes(id) on delete cascade,
  name text not null,
  width_mm integer,
  depth_mm integer,
  height_mm integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pcd_rooms_quote
  on public.pcd_rooms(quote_id);

create index if not exists idx_pcd_rooms_sort
  on public.pcd_rooms(quote_id, sort_order);

drop trigger if exists trg_pcd_rooms_updated_at on public.pcd_rooms;
create trigger trg_pcd_rooms_updated_at
before update on public.pcd_rooms
for each row execute function public.set_updated_at_timestamp();

alter table public.pcd_rooms enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_rooms'
      and policyname = 'Authenticated users can manage rooms'
  ) then
    create policy "Authenticated users can manage rooms"
      on public.pcd_rooms
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

notify pgrst, 'reload schema';
