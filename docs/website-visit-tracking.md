# Website visit tracking: what it collects and how to switch it on

A record of what the visit counter records, what it deliberately does not, and
the three things that have to be done by hand. Written down because two of those
three are decisions rather than steps, and neither lives in the code.

## Why we built our own rather than using Google

The site already loads a Google tag, `AW-17868932250`. That is a **Google Ads
conversion tag**. It is not analytics, it keeps no visit history, and there is
nothing in it to read.

A GA4 property would have given us the numbers free, and it is still worth
adding as a second opinion. What it could not do is put a tile on
`/admin/dashboard`: the figures live inside Google, and getting them out means
the GA4 Data API and a service account. So the counting is first party, the rows
are ours, and the dashboard reads them straight.

## Switching it on

Three steps, in order.

**1. Run the migration.** `supabase/202608311400_pcd_site_traffic.sql`, whole
file, in the Supabase SQL editor. It is one `do` block, so an error anywhere
undoes the lot, and it is safe to run twice.

**2. Set `SITE_TRACKING_SALT` in Vercel.** Any long random string, on all three
environments. This is what stops a stored visitor hash being guessable. Without
it the counter still works and still stores no address, but the hash becomes
guessable by anybody who knows the date and the address, and `/api/track` says
so in the log once per cold start.

**3. Check the nightly job.** `/api/cron/site-rollup` is already in `vercel.json`
and in `.github/workflows/scheduled-sync.yml`. Both use the existing
`CRON_SECRET`, so there is nothing new to configure. The first full day appears
on the dashboard after its first run.

Until the roll up has run at least once the dashboard says "No visit figures
yet" rather than drawing zeroes, because a panel of noughts reads as a website
nobody visits.

## What is stored

One row per page view, in `pcd_site_events`:

the path, the referring site, the channel it was bucketed into, any UTM tags,
the `gclid` off an ad link, phone or desktop, the city and state from Vercel's
own headers, whether it was a crawler, and how long the page was visible.

## What is deliberately not stored

**No IP address. No user agent string. No name, no email, nothing a person could
be picked out by.**

The address and the browser are used to work out a device, a region and a daily
hash, and are then dropped. Neither is a column on the table, and there is a test
that reads the route and fails if either becomes one.

A visitor is `sha256(daily salt + address + browser)`, truncated. The salt
changes every day, so:

- two visits from the same person on the same day match, which is the only
  reason a unique visitor count is possible at all;
- the same person tomorrow is a completely different hash, and nothing in this
  app can join them up.

Nothing is written to the visitor's machine except a session id in
`sessionStorage`, which dies when the tab closes. **That is why there is no
cookie banner**, and it is the thing to remember before anybody adds a stored
identifier to get better returning visitor numbers. That change needs a consent
notice and is a decision to make out loud.

## Two decisions that were made, and could be remade

**Returning visitors are not counted properly.** Doing it would need an
identifier that survives the day, which means a consent notice. The trade was
taken the other way: better privacy, no banner, and no "new against returning"
figure.

**Raw rows are pruned after ninety days.** The roll ups are kept for good, so
history never disappears from the dashboard; what goes is the ability to
re-answer a question about last March that we did not think to ask at the time.
`RAW_RETENTION_DAYS` in `lib/pcd-site-tracking.js` is the whole of it.

## What is not counted

- **The admin.** It would be the largest number on the panel inside a week.
- **A customer's own paperwork.** `/quotes/view`, `/project/view` and the rest
  are one person's document behind a private link. Counting them would put
  somebody's quote at the top of "most read pages", and how often they open it
  is already on the quote.
- **Crawlers.** A third or more of raw hits. They are recorded and then excluded
  from every figure, so "how much of this was bots" stays answerable rather than
  being a silent subtraction. The panel says how many it left out.

## Where each piece lives

| File | What it does |
|---|---|
| `lib/pcd-site-tracking.js` | Every rule: which pages count, what a bot is, which channel a referrer belongs to. Client safe, so the browser and the server judge things identically. |
| `lib/pcd-site-hash.js` | The daily visitor hash. Its own file because it imports `node:crypto`, which cannot go in the browser bundle. |
| `app/(site)/SiteTracker.js` | Sends a view when a page opens and the visible time when it is left. Mounted once, in the public site's layout. |
| `app/api/track/route.js` | Writes the row. Every path out of it is a 204: a visitor must never see anything go wrong because a counting table was busy. |
| `lib/pcd-site-rollup.js` | Folds finished days into `pcd_site_daily` and `pcd_site_page_daily`, then prunes. |
| `lib/pcd-site-stats.js` | What the dashboard reads. Every figure is worked out here and handed over finished. |

## Things worth knowing when a number looks wrong

**Our count will run under Google's.** A phone with tracking protection turned
up blocks the beacon. Expect a gap and do not go looking for a bug in it.

**Today is counted differently from every other day.** The roll up only folds
days that are over, because a half day written into the row the dashboard reads
would look like a real number and be wrong until midnight. Today is counted
straight off the raw table.

**Visits can never be added up from the pages list.** One visit that reads four
pages sits on four page rows. That is why the pages panel shows page views and
not visits, and why there are two roll up tables rather than one.

**Every time figure is a median.** One tab left open over lunch drags an average
into fiction and moves a median by one row.

## What it will never tell you

What somebody typed into Google to find us. Our own tracking cannot see it and
nor can anybody else's. **Google Search Console** answers it, is free, needs no
code, and is worth connecting on its own.
