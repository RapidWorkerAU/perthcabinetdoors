-- The Board: what it needs from the database
-- ---------------------------------------------------------------------------
--
-- Two things, both about not making the page do work the database is better at.
--
-- 1. pcd_board_message_state()
--    The board has to know who spoke last on each open ticket, and when we last
--    wrote to a given address. Doing that in the page meant pulling the newest
--    few thousand messages and sifting them, which was both wasteful and
--    silently wrong past the cap: an old ticket got judged on data that had
--    scrolled off the end.
--
-- 2. pcd_order_issues.panel_label
--    An issue card should name the panel, not say "a panel". Working it out on
--    every board load means rebuilding the cut list, so the name is recorded
--    once when the issue is raised. It also survives the panel being deleted,
--    which is the whole reason line_item_id is nullable.

alter table public.pcd_order_issues
  add column if not exists panel_label text;

comment on column public.pcd_order_issues.panel_label is
  'The panel''s name as it read when the issue was raised. Recorded rather than derived, so it stays true even if the line is later removed.';

-- Backfill what can be recovered. A line's title is the closest thing to a
-- panel name that exists outside the cut list, and null stays null rather than
-- inventing one.
update public.pcd_order_issues i
set panel_label = li.title
from public.pcd_order_line_items li
where i.line_item_id = li.id
  and i.panel_label is null
  and coalesce(btrim(li.title), '') <> '';

create or replace function public.pcd_board_message_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- The direction of the newest message on every ticket that is not closed.
    --
    -- NOTES ARE EXCLUDED. A note is us writing to ourselves, not an answer to
    -- the customer, so counting one would clear a card off the board without
    -- anybody having replied. Only what was actually sent or received decides
    -- whose turn it is.
    --
    -- distinct on is the cheap way to say "one row per ticket, newest first".
    'last_by_ticket', coalesce((
      select jsonb_agg(jsonb_build_object('ticket_id', t.ticket_id, 'direction', t.direction))
      from (
        select distinct on (m.ticket_id) m.ticket_id, m.direction
        from public.pcd_messages m
        join public.pcd_tickets tk on tk.id = m.ticket_id
        where tk.status <> 'closed'
          and m.direction in ('inbound', 'outbound')
        order by m.ticket_id, m.created_at desc
      ) t
    ), '[]'::jsonb),

    -- When we last sent anything to each address. Lowercased here so the page
    -- never has to care about how it was typed.
    'last_outbound', coalesce((
      select jsonb_agg(jsonb_build_object('email', o.email, 'sent_at', o.sent_at))
      from (
        select lower(m.to_email) as email, max(m.created_at) as sent_at
        from public.pcd_messages m
        where m.direction = 'outbound'
          and coalesce(btrim(m.to_email), '') <> ''
        group by lower(m.to_email)
      ) o
    ), '[]'::jsonb)
  );
$$;

comment on function public.pcd_board_message_state is
  'Who spoke last on each open ticket, and when we last emailed each address. Used by /admin/board so the page does not have to read every message to find out.';

grant execute on function public.pcd_board_message_state() to authenticated, service_role;

-- ── closing a conversation ──────────────────────────────────────────────────
--
-- Closing is not a dismiss. It draws a line in time: everything before it is
-- settled, and a new inbound email reopens the ticket by itself, which
-- lib/pcd-desk-sync.js already does. So a thread that went quiet a year ago
-- leaves the board, and the same customer writing next month brings it back.
--
-- The reason is kept as a note on the conversation rather than a column, so it
-- shows in the desk timeline next to everything else that happened, and so a
-- ticket closed twice keeps both stories.

alter table public.pcd_messages
  add column if not exists note_kind text
    check (note_kind is null or note_kind in ('note', 'closure'));

comment on column public.pcd_messages.note_kind is
  'closure marks the note that closed the conversation, and carries why. Null on ordinary messages.';

create index if not exists pcd_messages_closure_idx
  on public.pcd_messages (ticket_id, created_at desc)
  where note_kind = 'closure';

create index if not exists pcd_messages_outbound_email_idx
  on public.pcd_messages (lower(to_email), created_at desc)
  where direction = 'outbound' and to_email is not null;
