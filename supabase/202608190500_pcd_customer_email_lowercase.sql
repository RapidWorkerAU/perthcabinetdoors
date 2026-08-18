-- Customers: store the email address in lowercase
-- ---------------------------------------------------------------------------
--
-- WHY. The address is an identifier, not a piece of prose. Everything that
-- matches on it already treats it case-insensitively: the unique index is on
-- lower(email), findCustomerByEmail uses ilike, and the mail sync looks
-- customers up by the lowercase address Microsoft hands it.
--
-- Storing it as typed broke exactly one thing, and it was an important one. The
-- sync preloads customers with a plain "in" filter for speed, which IS case
-- sensitive. A record stored as Anna.Dokas@woodside.com never matched the
-- anna.dokas@woodside.com the mailbox reported, so a reply from somebody who
-- had already filled in a form was treated as a stranger and sent to the new
-- senders list to be decided all over again.
--
-- Three of sixty records were affected when this was found, including one at a
-- domain with 44 messages waiting.
--
-- Lowercasing cannot create a duplicate: idx_pcd_customers_email_unique is on
-- lower(email), so no two records can already differ only in case.
--
-- normalizeCustomerPayload now lowercases on the way in, so this is a one-off.

update public.pcd_customers
set email = lower(email)
where email is not null and email <> lower(email);

comment on column public.pcd_customers.email is
  'The anchor every message, quote and form match is filed against. Stored lowercase; see normalizeCustomerPayload.';

notify pgrst, 'reload schema';
