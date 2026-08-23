-- Setting a board card aside, and the message state the board needs to group
-- reply cards by customer instead of by email thread.
--
-- ── 1. pcd_board_dismissals ───────────────────────────────────────────────
--
-- WHAT IT IS. A card can be set aside with a reason. It disappears, and it
-- comes back by itself when the thing it is about moves on. Not a delete, and
-- not a permanent hide.
--
-- HOW IT COMES BACK. Every card is about something with a clock on it: the
-- newest message from a customer, the day a quote went out, when a payment was
-- asked for. Setting the card aside records WHERE THAT CLOCK WAS. The card
-- stays off the board while nothing has changed, and the moment the clock moves
-- past that mark it is a new situation, so the card returns.
--
-- A quote nobody answered can be set aside, and reissuing it puts it back. A
-- customer who went quiet can be set aside, and their next email brings them
-- back. Nothing is lost and nobody has to remember.
--
-- One row per (card kind, subject): the same customer can be set aside on the
-- reply column and still be showing on the chase column, because those are two
-- different jobs about the same person.

create table if not exists public.pcd_board_dismissals (
  id uuid primary key default gen_random_uuid(),
  -- The board column the card was in: reply, price, chase, plan, depo,
  -- materials, late, issue. Free text on purpose, so a column added later does
  -- not need a migration before it can be set aside.
  cat text not null,
  -- What it hangs off: a customer, quote, order, quote_request, payment,
  -- variation, enquiry or issue.
  subject_type text not null,
  subject_id text not null,
  reason text not null,
  detail text,
  -- The mark. The card returns when its clock passes this.
  seen_stamp timestamptz not null,
  dismissed_at timestamptz not null default timezone('utc', now()),
  dismissed_by text,
  constraint pcd_board_dismissals_one_per_card unique (cat, subject_id)
);

comment on table public.pcd_board_dismissals is
  'Board cards somebody has set aside, with the moment they were set aside at. A card is hidden only while the thing it is about has not moved past seen_stamp.';
comment on column public.pcd_board_dismissals.seen_stamp is
  'How current the card was when it was set aside. The card reappears once its own stamp is newer than this.';

alter table public.pcd_board_dismissals enable row level security;

drop policy if exists pcd_board_dismissals_admin on public.pcd_board_dismissals;
create policy pcd_board_dismissals_admin
  on public.pcd_board_dismissals
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create index if not exists pcd_board_dismissals_lookup_idx
  on public.pcd_board_dismissals(cat, subject_id);

-- ── 2. pcd_board_message_state gains what the grouping needs ──────────────
--
-- last_by_ticket now carries WHEN the last message was, not just which way it
-- went, so the card can be timed from the customer's OLDEST unanswered message
-- rather than their newest. Somebody who has written three times is owed an
-- answer from the first one.
--
-- last_inbound is when each address last wrote to us, whatever thread it was
-- on. It is what flips a quote between "chase them" and "answer them": if they
-- wrote after we sent it, the ball is ours.

create or replace function public.pcd_board_message_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- The newest message on every ticket that is not closed, which way it went
    -- and when.
    --
    -- NOTES ARE EXCLUDED. A note is us writing to ourselves, not an answer to
    -- the customer, so counting one would clear a card off the board without
    -- anybody having replied.
    'last_by_ticket', coalesce((
      select jsonb_agg(jsonb_build_object('ticket_id', t.ticket_id, 'direction', t.direction, 'created_at', t.created_at))
      from (
        select distinct on (m.ticket_id) m.ticket_id, m.direction, m.created_at
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
    ), '[]'::jsonb),

    -- When each address last wrote to US.
    'last_inbound', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'received_at', i.received_at))
      from (
        select lower(m.from_email) as email, max(m.created_at) as received_at
        from public.pcd_messages m
        where m.direction = 'inbound'
          and coalesce(btrim(m.from_email), '') <> ''
        group by lower(m.from_email)
      ) i
    ), '[]'::jsonb)
  );
$$;

comment on function public.pcd_board_message_state is
  'Board message state: the newest message per open ticket with its direction and time, when we last wrote to each address, and when each address last wrote to us.';
