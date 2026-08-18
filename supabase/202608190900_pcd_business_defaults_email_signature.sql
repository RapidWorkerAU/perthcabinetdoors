-- Business defaults: the signature on emails sent from the customer desk
-- ---------------------------------------------------------------------------
--
-- WHY. A reply sent from the desk went out with nothing but "Perth Cabinet
-- Doors" and an address under it. Every email you send from Outlook carries a
-- proper sign-off, so a reply from the desk looked like it came from somewhere
-- else, which is the opposite of the point.
--
-- Kept as a setting rather than written into the template, so a phone number
-- can change without a code change and a deploy.
--
-- Same small subset of HTML the quote terms use: paragraphs, line breaks, bold,
-- italic, underline and lists, sanitised on the way in by
-- lib/pcd-terms-html.js. It is written into an email and into the admin page,
-- and both want the same guarantee.
--
-- Blank is a real answer. A business with no signature sends none, rather than
-- getting wording nobody chose, which is the same rule quote terms follow.

alter table public.pcd_business_defaults
  add column if not exists email_signature_html text;

comment on column public.pcd_business_defaults.email_signature_html is
  'Signature appended to replies sent from the customer desk. Sanitised subset of HTML. Blank means no signature.';

notify pgrst, 'reload schema';
