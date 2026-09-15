-- A REPLY TO THEIR OTHER ADDRESS COUNTED AS NO REPLY AT ALL.
--
-- The board decides whether somebody is owed an answer by comparing what they
-- sent to when we last wrote to them, and it found "when we last wrote to them"
-- by looking up the email address on their CUSTOMER RECORD.
--
-- People write from more than one address. Somebody emails from their work
-- account, we reply to that account, and the address never gets added to their
-- record. The board then finds no reply to that person anywhere, and the rule
-- for somebody we have never answered is that EVERYTHING they ever sent is
-- still waiting, however old. So the card gets timed from their very first
-- email while the conversation carries on in front of us.
--
-- That is the shape of the complaint: a card saying they reached out 45 days
-- ago, and a customer page showing a fortnight of back and forth.
--
-- So the board learns their addresses from their conversations instead of only
-- from their record: every address a customer has WRITTEN FROM on a ticket of
-- theirs is an address of theirs, and a reply sent to any of them answers them.
--
-- ── WHY ONLY THE ADDRESSES THEY WROTE FROM ──────────────────────────────────
--
-- Outbound recipients are deliberately not included. A reply on a job often
-- goes to the homeowner and their builder, and counting the builder's address
-- as the homeowner's would mean answering the builder cleared the homeowner's
-- card while they were still owed an answer. An address somebody has sent mail
-- from is unambiguously theirs. The safe direction here is the card staying up.
--
-- ── AND ACROSS CLOSED TICKETS TOO ───────────────────────────────────────────
--
-- This is not asking what is open, it is asking which addresses belong to whom.
-- A thread that has since been closed still proves the address is theirs.

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

    -- When we last wrote to each address, counted per RECIPIENT rather than per
    -- message, so an email to two people answers both of them. Lowercased and
    -- trimmed here so the page never has to care how it was typed.
    'last_outbound', coalesce((
      select jsonb_agg(jsonb_build_object('email', o.email, 'sent_at', o.sent_at))
      from (
        select lower(btrim(recipient)) as email, max(m.created_at) as sent_at
        from public.pcd_messages m
        cross join lateral unnest(string_to_array(m.to_email, ',')) as recipient
        where m.direction = 'outbound'
          and coalesce(btrim(m.to_email), '') <> ''
          and coalesce(btrim(recipient), '') <> ''
        group by lower(btrim(recipient))
      ) o
    ), '[]'::jsonb),

    -- When each address last wrote to US. One sender per message, so nothing to
    -- split.
    'last_inbound', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'received_at', i.received_at))
      from (
        select lower(btrim(m.from_email)) as email, max(m.created_at) as received_at
        from public.pcd_messages m
        where m.direction = 'inbound'
          and coalesce(btrim(m.from_email), '') <> ''
        group by lower(btrim(m.from_email))
      ) i
    ), '[]'::jsonb),

    -- EVERY ADDRESS A CUSTOMER HAS WRITTEN FROM, so a reply sent to any of them
    -- counts as having answered that person. The customer record's own address
    -- is added on the page; this is the set it did not know about.
    'customer_addresses', coalesce((
      select jsonb_agg(jsonb_build_object('customer_id', a.customer_id, 'email', a.email))
      from (
        select distinct tk.customer_id, lower(btrim(m.from_email)) as email
        from public.pcd_messages m
        join public.pcd_tickets tk on tk.id = m.ticket_id
        where m.direction = 'inbound'
          and tk.customer_id is not null
          and coalesce(btrim(m.from_email), '') <> ''
      ) a
    ), '[]'::jsonb)
  );
$$;

comment on function public.pcd_board_message_state is
  'Board message state: the newest message per open ticket with its direction and time, when we last wrote to each address (counted per recipient, so a reply to two people answers both), when each address last wrote to us, and every address each customer has written from so a reply to any of them answers that person.';

grant execute on function public.pcd_board_message_state() to authenticated, service_role;
