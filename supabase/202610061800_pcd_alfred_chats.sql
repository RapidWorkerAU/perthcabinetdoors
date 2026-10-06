-- ASK ALFRED: KEEPING THE CHATS.
--
-- One shared list, newest first, for everyone on the admin (decided
-- 2026-10-06). A chat is the turns as the page shows them, kept so it can be
-- picked up later or on another computer. It is a convenience, not a record:
-- what was sent or changed is recorded where it always is, on the customer,
-- the order and Alfred's own drafts.
--
--   title       the first question, cut short
--   turns       the chat, as the page shows it
--   started_by  the approver name picked in that browser, if any
--
-- Safe to run twice.

do $$
begin
  create table if not exists public.pcd_alfred_chats (
    id uuid primary key default gen_random_uuid(),
    title text not null default '',
    turns jsonb not null default '[]'::jsonb,
    started_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create index if not exists pcd_alfred_chats_updated_idx on public.pcd_alfred_chats (updated_at desc);

  alter table public.pcd_alfred_chats enable row level security;
end $$;
