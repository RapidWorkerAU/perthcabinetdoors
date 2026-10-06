-- ALFRED PHASE 2: WHICH SENT EMAILS COUNT AS KEEPING A CUSTOMER POSTED.
--
-- Alfred drafts an update when an active or on hold order is getting close to
-- the longest gap you allow between emails (10 days unless changed). The gap is
-- measured from the last REAL update: an email a person wrote or approved, or
-- the Customer Updates report. A payment request, a tax invoice or a review
-- request is not news about the job, so it does not restart the clock.
--
-- Until now every email the system sent was recorded the same way, so nothing
-- could tell them apart. This labels them:
--
--   reply      typed from the customer page, or Alfred's draft a person approved
--   document   a quote, variation, invoice, payment request or refund notice
--   automatic  sent by the system on its own, such as the review request
--   (blank)    read in from Outlook, or sent before this existed. Counted as a
--              real email, because a person wrote it.
--
-- Safe to run twice.

do $$
begin
  alter table public.pcd_messages
    add column if not exists sent_as text check (sent_as in ('reply', 'document', 'automatic'));

  comment on column public.pcd_messages.sent_as is
    'What kind of email this was: reply (a person wrote or approved it), document (quote, invoice, payment request), automatic. Blank is mail read from Outlook or older. Only replies and blanks count as keeping a customer posted.';
end $$;
