-- ALFRED IS THE CHAT AND NOTHING ELSE (2026-11-23).
--
-- The hourly drafting, order updates, quote and enquiry drafts and the morning
-- summary are gone, so nothing reads or writes his drafts or his questions any
-- more. This drops those two tables.
--
-- Run AFTER the code that stops using them is live.
--
-- KEPT, because the chat still uses them:
--   pcd_alfred_settings   the switch, the monthly limit, the approvers
--   pcd_alfred_runs       what each chat question cost, for the monthly limit
--   pcd_alfred_chats      the shared chat history
--   pcd_order_activity actor_type 'alfred', for changes approved in the chat
--
-- KEPT on pcd_messages: alfred_draft_id, approved_by and edited_before_send.
-- Past emails Alfred drafted still show "Approved by" on the customer desk.
-- Dropping the drafts table with cascade removes only the link from
-- alfred_draft_id to it; the values stay.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  drop table if exists public.pcd_alfred_questions cascade;
  drop table if exists public.pcd_alfred_drafts cascade;
end
$$;
