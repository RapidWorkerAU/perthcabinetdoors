-- A REPLY TO TWO PEOPLE COUNTED AS A REPLY TO NEITHER.
--
-- pcd_messages.to_email holds every recipient of an outbound message, joined
-- with commas, because that is what the mailbox gives us: "kirsty@example.com,
-- her.builder@example.com".
--
-- last_outbound grouped on that whole string. So the board learned that we had
-- last written to somebody called "kirsty@example.com, her.builder@example.com",
-- which is nobody, and both of the real people went on looking unanswered. Any
-- reply sent to more than one person did this, which on a job with a builder
-- and a homeowner on the thread is most of them.
--
-- Split on the comma and count the reply against each person on it, which is
-- what actually happened.
--
-- last_by_ticket and last_inbound are untouched. A thread already knows who it
-- belongs to, and an inbound message has exactly one sender.

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
    ), '[]'::jsonb)
  );
$$;

comment on function public.pcd_board_message_state is
  'Board message state: the newest message per open ticket with its direction and time, when we last wrote to each address (counted per recipient, so a reply to two people answers both), and when each address last wrote to us.';

grant execute on function public.pcd_board_message_state() to authenticated, service_role;

-- What the board can now see. A row per address we have written to, which
-- should include the second addresses that were previously invisible.
select count(*) as addresses_we_have_written_to
  from (
    select distinct lower(btrim(recipient)) as email
      from public.pcd_messages m
      cross join lateral unnest(string_to_array(m.to_email, ',')) as recipient
     where m.direction = 'outbound'
       and coalesce(btrim(recipient), '') <> ''
  ) t;
