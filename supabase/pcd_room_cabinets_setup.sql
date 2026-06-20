create table if not exists public.pcd_room_cabinets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.pcd_rooms(id) on delete cascade,
  quote_line_item_id uuid references public.pcd_quote_line_items(id) on delete set null,
  cabinet_type text not null check (
    cabinet_type in ('base', 'wall', 'tall', 'corner_base', 'corner_wall', 'island')
  ),
  label text,
  x_mm integer,
  wall text check (
    wall in ('top', 'bottom', 'left', 'right', 'island')
  ),
  width_mm integer,
  height_mm integer,
  depth_mm integer,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pcd_room_cabinets_room
  on public.pcd_room_cabinets(room_id);

create index if not exists idx_pcd_room_cabinets_sort
  on public.pcd_room_cabinets(room_id, sort_order);

create index if not exists idx_pcd_room_cabinets_line_item
  on public.pcd_room_cabinets(quote_line_item_id);

drop trigger if exists trg_pcd_room_cabinets_updated_at on public.pcd_room_cabinets;
create trigger trg_pcd_room_cabinets_updated_at
before update on public.pcd_room_cabinets
for each row execute function public.set_updated_at_timestamp();

alter table public.pcd_room_cabinets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_room_cabinets'
      and policyname = 'Authenticated users can manage room cabinets'
  ) then
    create policy "Authenticated users can manage room cabinets"
      on public.pcd_room_cabinets
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

notify pgrst, 'reload schema';
