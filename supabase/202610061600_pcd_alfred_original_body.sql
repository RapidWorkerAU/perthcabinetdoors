-- ALFRED LEARNS FROM WHAT YOU CHANGE BEFORE SENDING.
--
-- When a person edits one of Alfred's drafts and then approves it, the draft's
-- text is replaced with what was actually sent. Alfred's own wording was lost,
-- so there was nothing to learn from. This keeps it:
--
--   original_body   what Alfred wrote, kept only when somebody changed it
--                   before sending. body_text stays what was sent.
--
-- Alfred reads a few recent before and after pairs when he drafts, the same
-- way he reads the reasons drafts were declined.
--
-- Safe to run twice.

do $$
begin
  alter table public.pcd_alfred_drafts
    add column if not exists original_body text;
end $$;
