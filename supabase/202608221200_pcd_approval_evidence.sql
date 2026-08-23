-- WHAT, EXACTLY, DID THE CUSTOMER AGREE TO?
--
-- WHY. An approval recorded a typed name and a timestamp. That answers "did they
-- approve" but not "approve WHAT", and those become different questions the
-- moment anybody disagrees later.
--
-- Three orders in July had their quotes edited after acceptance. Working out
-- what the customer had actually agreed to took a database query, a timestamp
-- comparison and a judgement call, and the answer was never certain. This is so
-- that never needs doing again.
--
-- WHAT GOES IN evidence:
--
--   document_fingerprint  a short digest of the lines and totals as they stood
--                         at the moment of approval. A later version can be
--                         compared against it and shown to differ.
--   document_summary      the same facts in words, because a digest proves a
--                         mismatch and a person still has to be told what.
--   access_code_used      the code they actually used. After an admin override
--                         this is the dead one, which is the case most worth
--                         being able to see.
--   ip / user_agent       where the response came from. Not proof of identity
--                         and not treated as such, but it separates "approved
--                         from a phone" from "approved from our own office".
--
-- This is not a signature and does not pretend to be. It is a record that the
-- thing approved was this thing, which is the part that was missing.

alter table public.pcd_quote_actions
  add column if not exists evidence jsonb not null default '{}'::jsonb;

alter table public.pcd_order_variation_actions
  add column if not exists evidence jsonb not null default '{}'::jsonb;

comment on column public.pcd_quote_actions.evidence is
  'What the quote said when this response was recorded: a fingerprint of its lines and totals, a readable summary, the access code used, and where the response came from. An empty object means the response predates this being captured, which is not the same as nothing having changed.';
comment on column public.pcd_order_variation_actions.evidence is
  'What the variation said when this response was recorded. Same shape as pcd_quote_actions.evidence.';

-- Finding an approval by what it agreed to, rather than only by its quote.
create index if not exists pcd_quote_actions_fingerprint_idx
  on public.pcd_quote_actions ((evidence ->> 'document_fingerprint'))
  where evidence ->> 'document_fingerprint' is not null;

do $$
declare
  without_evidence int;
begin
  select count(*) into without_evidence
    from public.pcd_quote_actions
   where action in ('approved', 'rejected')
     and coalesce(evidence ->> 'document_fingerprint', '') = '';

  raise notice 'Existing quote responses with no record of what was agreed: %. These cannot be backfilled, because what the quote said at the time is not recoverable. Everything from here is captured.', without_evidence;
end $$;
