-- Customer desk: make the unique indexes usable by upsert
-- ---------------------------------------------------------------------------
--
-- WHY. Three tables were given case-insensitive unique indexes, on
-- lower(email) and lower(pattern). That enforces uniqueness correctly, but
-- Postgres can only match an ON CONFLICT clause to a plain index on the named
-- columns. Every upsert against them failed with:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- Found by the mail sync, which reported "problems 1" while otherwise
-- succeeding: the mail was filed and only the new senders list was left behind.
--
-- THE FIX IS TO LOWERCASE ON THE WAY IN INSTEAD. normaliseEmail() in
-- lib/pcd-mail-senders.js already does this for every write, so a plain unique
-- index gives the same guarantee and can actually be targeted.
--
-- Lowercasing what is already stored cannot create a duplicate: the functional
-- index has been enforcing case-insensitive uniqueness the whole time, so no
-- two rows can differ only in case.

update public.pcd_mail_pending_senders set email = lower(email) where email <> lower(email);
update public.pcd_mail_sender_rules     set pattern = lower(pattern) where pattern <> lower(pattern);

drop index if exists public.pcd_mail_pending_senders_email_key;
create unique index if not exists pcd_mail_pending_senders_email_key
  on public.pcd_mail_pending_senders (email);

drop index if exists public.pcd_mail_sender_rules_pattern_key;
create unique index if not exists pcd_mail_sender_rules_pattern_key
  on public.pcd_mail_sender_rules (match_type, pattern);

-- pcd_pending_customer_changes keeps its PARTIAL index, because "one pending
-- question per field" is the rule that matters and a resolved row must be free
-- to sit alongside a new one. A partial index cannot be inferred by an upsert
-- either, so that code clears the standing row and inserts instead. See
-- parkCustomerChanges in lib/pcd-customer-utils.js.

notify pgrst, 'reload schema';
