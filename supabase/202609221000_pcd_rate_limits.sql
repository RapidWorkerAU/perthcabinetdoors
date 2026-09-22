-- HOW MANY TIMES ONE CALLER MAY ASK, BEFORE WE STOP ANSWERING.
--
-- ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
--
-- Found in the Pass 2 audit, 22 September 2026. There was no rate limiting
-- anywhere in the application, and the pages a customer opens are reached with
-- an access code and nothing else.
--
-- The code itself is fine: eight hex characters from randomBytes, so
-- 4,294,967,296 of them, and the column is unique. The problem was that nothing
-- stopped anybody asking over and over. With N live quotes, the expected number
-- of guesses to land on one is about 4.29 billion divided by N, and at a few
-- hundred requests a second that is hours rather than years.
--
-- And a code does more than read. The approve route takes a code and an action,
-- and on approval it raises a real order and emails the customer to say they
-- approved it. So a guessed code is not only somebody reading a quote, it is
-- somebody committing us and a customer to work neither of them asked for.
--
-- ── WHY IN THE DATABASE RATHER THAN IN MEMORY ────────────────────────────────
--
-- The site runs as serverless functions, and each instance has its own memory.
-- A counter held in a module variable is per instance, so an attacker spreading
-- requests across instances, which happens by itself under load, would get a
-- fresh allowance every time. A counter nobody shares is not a limit, it is a
-- speed bump that reports itself as a limit, which is worse than none.
--
-- ── WHY THE ALLOWANCE IS GENEROUS ────────────────────────────────────────────
--
-- A real customer opens their quote, reads it, maybe refreshes, comes back the
-- next day and approves it. That is single figures. An attacker needs millions.
-- There is a very wide gap between those two, so the limit sits high enough
-- that no genuine visitor will ever meet it: locking a customer out of their own
-- quote would be a worse fault than the one this fixes.
--
-- ── CLEANING UP ──────────────────────────────────────────────────────────────
--
-- Rows are only meaningful inside their window. Rather than a scheduled job,
-- each check deletes what has expired for its own key, so the table stays small
-- on its own and there is nothing to forget to run.

create table if not exists public.pcd_rate_limits (
  -- What is being counted, and for whom. "quote-lookup:203.0.113.4".
  bucket        text        not null,
  -- When this window opened. The window is bucket plus this pair.
  window_start  timestamptz not null default now(),
  attempts      integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (bucket, window_start)
);

create index if not exists idx_pcd_rate_limits_window
  on public.pcd_rate_limits (bucket, window_start desc);

-- NOBODY SIGNED IN MAY READ OR WRITE THIS.
--
-- It is reached only by the service role, from the routes that do the counting.
-- A signed-in customer has no business reading how close anybody is to a limit,
-- and an anonymous caller certainly does not.
alter table public.pcd_rate_limits enable row level security;
