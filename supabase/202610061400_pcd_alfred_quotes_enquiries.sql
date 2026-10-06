-- ALFRED PHASE 3: DRAFT QUOTES FROM REQUESTS, AND REPLIES TO ENQUIRIES.
--
-- Two more kinds of work Alfred prepares for a person:
--
--   quote     a quote request nobody has turned into a quote after 24 hours.
--             Alfred presses the same Convert to quote a person would, which
--             makes a DRAFT quote priced from the libraries. Nothing is sent:
--             a person checks it and sends it the normal way.
--   enquiry   a reply to a new website enquiry, after the automatic "we got
--             your message" email. Approved and sent like any other reply.
--
-- What the drafts table needs for them:
--
--   quote_request_id  the request a draft quote was made from
--   enquiry_id        the enquiry a reply answers
--   line_notes        Alfred's note on each quote line he could not settle (no
--                     price in the library, made to order, a board the library
--                     does not have), shown as the copper bow tie on the line
--
-- Safe to run twice.

do $$
begin
  alter table public.pcd_alfred_drafts
    add column if not exists quote_request_id uuid references public.pcd_quote_requests(id) on delete set null,
    add column if not exists enquiry_id uuid references public.pcd_enquiries(id) on delete set null,
    add column if not exists line_notes jsonb not null default '[]'::jsonb;

  create index if not exists pcd_alfred_drafts_quote_idx on public.pcd_alfred_drafts (quote_id) where quote_id is not null;
end $$;
