-- Saved quote lists: the "pick it up on another device" half of the public
-- quote list.
--
-- The list itself lives in the visitor's browser (localStorage), which covers
-- closing the tab and coming back. It does not cover measuring the kitchen on a
-- phone and finishing on a laptop. Saving writes the list here against a short
-- code, and /request-quote?list=<code> rehydrates it.
--
-- Deliberately anonymous: no account, no email required to save. A saved list is
-- also a warm lead - someone who got far enough to want it back - so the admin
-- can see the ones that were never submitted.

create table if not exists public.pcd_saved_quote_lists (
  id uuid primary key default gen_random_uuid(),
  -- Short, URL-safe, and unguessable enough that a stranger cannot walk the
  -- table. This is the only credential, so it is the whole security model:
  -- anyone with the code can read the list. It holds sizes and colours, not
  -- personal details, which is why that trade is acceptable.
  code text not null unique,
  entries jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  -- Optional. Only set if they ask us to email the link to them.
  email text,
  -- Set when the list is turned into an actual quote request, so the admin can
  -- tell a live lead from one that was followed through.
  submitted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pcd_saved_quote_lists_code_len check (char_length(code) between 6 and 24),
  -- A public, unauthenticated insert path needs a ceiling, or one script can
  -- fill the table. 200 entries is far more than any real kitchen.
  constraint pcd_saved_quote_lists_size check (item_count >= 0 and item_count <= 200)
);

create index if not exists idx_pcd_saved_quote_lists_code
  on public.pcd_saved_quote_lists(code);

create index if not exists idx_pcd_saved_quote_lists_created
  on public.pcd_saved_quote_lists(created_at desc);

drop trigger if exists trg_pcd_saved_quote_lists_updated_at on public.pcd_saved_quote_lists;
create trigger trg_pcd_saved_quote_lists_updated_at
before update on public.pcd_saved_quote_lists
for each row execute function public.set_updated_at_timestamp();

alter table public.pcd_saved_quote_lists enable row level security;

-- No anon policies at all: the public routes go through the service-role client
-- on the server, which bypasses RLS. That keeps the table unreadable from the
-- browser even with the anon key, so a code cannot be brute-forced client-side
-- and the whole table can never be listed.
drop policy if exists "pcd_saved_quote_lists_admin_all" on public.pcd_saved_quote_lists;
create policy "pcd_saved_quote_lists_admin_all"
on public.pcd_saved_quote_lists
for all
to authenticated
using (true)
with check (true);

notify pgrst, 'reload schema';
