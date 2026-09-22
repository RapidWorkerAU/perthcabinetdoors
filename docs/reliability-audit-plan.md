# Reliability and Settings Audit

**Started:** 2026-09-21
**Status:** Passes 0 to 4 done and fixed, 22 September 2026, plus a codebase-wide sweep for half-finished writes. Pass 5, production documents, is next.
**How to use this:** pick the next unticked pass, paste its prompt, work it to the end, fill in its row in the Progress log at the bottom. One pass per sitting. Nothing here expires, so stopping half way down the list costs nothing.

---

## Why this exists

On 21 September 2026 every quote in the admin was a dead page. The cause was a single block of code placed twenty-nine lines too high in `app/admin/quotes/[id]/QuoteEditor.js`, so the page tried to read a value that did not exist yet and threw before it drew anything. A sweep for the same fault found a second one in `lib/pcd-site-measure-booking.js`, sitting in the site measure refund path, waiting for the next cancellation.

What matters is not those two bugs. It is that **nothing caught either of them**:

- `next build` compiled both without a word.
- All 3,265 tests passed with both still in place.
- ESLint reported no errors.

So the concern behind this document is well founded, and it is more specific than it feels. The site is not badly built. Much of it is carefully built, and a lot of the code carries long written explanations of why it does what it does, which is rarer and more valuable than it sounds. The problem is narrower than "poor quality": **the safety net has a hole in the shape of anything that only goes wrong when the code actually runs.**

### What the site is, in numbers

| | Count |
|---|---|
| Pages | 64 |
| API routes | 134 |
| Files in `lib/` | 215 (56,728 lines) |
| Shared components | 51 |
| Database migration files | 167 |
| Test files | 178 (3,265 tests) |
| Of those, tests that read source code as **text** rather than running it | **113** |

That last row is the finding. The tests are good at checking rules, structure and arithmetic. Almost none of them ever render a page or execute a request. A page can be guaranteed to crash the moment it opens and still pass every test in the suite.

---

## The standing rules for every pass

These apply to every pass below. They exist so a pass does real work rather than producing a confident sounding summary.

**1. Nothing is assumed. Every claim is opened and read.**
A pass does not say "this looks fine". It says "I opened this, here is what it does, here is the line". If something cannot be verified, the pass says so in those words rather than guessing.

**2. A finding needs the failure written out.**
Not "this is fragile". Instead: "if a customer has a credit and no deposit percent, line 412 divides by zero and the page shows a blank total". If the failure cannot be described concretely, it is not a finding. It is a preference, and it goes in a separate list.

**3. Nothing is changed during the reading half.**
A pass reads first and reports. Fixes happen afterwards, once you have seen the list and said which ones to do. This stops a small audit turning into a large unreviewed rewrite.

**4. A fix is not done until it is proved.**
Proved means one of: a test that fails before and passes after, a command whose output is pasted, or the page opened and the result described. A build compiling is not proof, because the build compiled both September bugs.

**5. Every pass ends with the same four things.**
What was checked. The findings, with the failure written out. The settings candidates found. What was deliberately left alone, and why.

**6. The settings question is asked every time.**
It is not a separate pass. It runs alongside every pass, because whoever is reading the code is the only one in a position to notice.

---

## The two lenses

Every pass looks at its material twice.

### Lens A: will this break

Seven checks, drawn from faults that have actually happened in this codebase rather than from a generic list. Each pass runs all seven against its own material.

**A1. Order of declaration.**
Does anything read a value before the line that creates it? This is the September bug. It applies to every `const` and `let`, and it is especially dangerous inside a `useMemo` or `useEffect` dependency list, because those are read the instant the line runs, not later when the page draws. A one-off check exists and comes back clean today. Pass 0 makes it permanent.

**A2. Silent fallbacks.**
Does anything quietly substitute a different value when the real one is missing, without saying so? This has bitten three times and the code records each one. Pricing fell back to built-in constants when a permissions rule blocked the settings read, and logged nothing. Every tax invoice ever issued carried a personal mobile number, because a fallback that always fires looks exactly like a value. A genuine zero cost was thrown away by `cost || previous || 0`. The rule being enforced: a missing value is either a refusal or a visible default, never a quiet guess.

**A3. Values dropped between steps.**
When something is saved, does every field survive the whole journey? A quote line crosses four separate shapes between the website form and the order, and a field missing from any one of them disappears with no error. The same trap exists in `businessDefaultsToDbRow`, which the file itself warns about: a setting missing from that list is silently discarded when you press Save.

**A4. More than one definition of the same thing.**
Is this rule written down once, or several times? `CABINET_TYPES` exists in seven copies. Supplier name spelling was heading for a second copy before it was stopped. Two copies means one gets updated and the other does not, and the disagreement surfaces months later as a mystery.

**A5. Money arithmetic.**
Anywhere money is calculated: is GST applied at the right point, do the parts add up to the stated total, can a figure go negative, does the number on screen match the number charged. The credit work is the live example. Applied in the wrong place it would have handed back $110 for every $100 paid, and broken the line check on every invoice for the job afterwards.

**A6. What happens when it fails.**
When the database is unreachable, the email bounces, or the field is empty, does the person see something true? The pattern to hunt is the one already fixed once on the public forms, where a customer was told their message had failed when we actually had it.

**A7. Is it actually run by anything.**
Does a test execute this code, or only read it as text? For the 113 text-reading tests, the question is whether the thing they protect could be proved a better way.

### Lens B: should this be a setting

Every pass asks, of every fixed value it meets: **would the business be better off if this were editable?**

The three-way test, which the codebase already applies well in places and should keep applying:

| Verdict | Test | Already decided this way |
|---|---|---|
| **Make it a setting** | It changes with the business, and a wrong value costs money slowly and visibly. | Saw kerf and board trim, moved to Business Defaults because they change when the blade or the supplier changes. |
| **Keep it in code** | A wrong value lets through work we cannot make, and the cost lands after money has changed hands. | `SIZE_LIMITS`, kept in code on purpose: "a limit is not a preference". |
| **Keep it in code, but write it once** | It is structural, but it is currently duplicated or buried. | Business phone and ABN, pulled into `pcd-business-identity.js` after a personal mobile went out on every invoice. |

**Where a new setting goes.** Settings today is five tabs at `/admin/settings`: My Profile, Website Overlay, Business Defaults, Lists, Site Measures. A new setting joins one of those. A sixth tab is a decision, not a default.

**The trap when adding one.** A new field in Business Defaults must be added in *three* places or it will appear on screen, accept a value, and silently fail to save: the default in `DEFAULT_BUSINESS_DEFAULTS`, the normaliser, and the column list in `businessDefaultsToDbRow`. The drawer runner rates were lost to exactly this. Any pass proposing a new setting must name all three edits.

---

## Pass 0: close the hole that let this through

**Do this one first.** Everything after it is safer for having it, and it is the only pass that stops the September bug class recurring while we work through the rest.

**0.1 Make the order-of-declaration check permanent.**
The one-off version found both September bugs. The stock rule cannot be switched on as it comes: it reports about 130 harmless cases where a function mentions something defined lower down but is not called until later. The narrowed version, which only flags a read that genuinely runs before its own declaration, comes back clean across the whole repository today. It needs to become a real rule in `eslint.config.mjs` at error severity, so a future one fails the build instead of shipping.

**0.2 Make one page actually render in a test.**
Take the worst case, `QuoteEditor.js`, render it on the server with fake data, and assert it produces HTML. That single test would have caught the September bug outright. Then decide whether to extend it to the other large client components or leave it as one guard.

**0.3 Decide what the 113 text-reading tests are really for.**
Some are genuinely the right tool. `quote-lock-coverage` walks the API folder to prove no route writes the tables directly, and no amount of running the code would prove that. Others are standing in for a real test. Sort them into the two piles and write down which is which, so later work knows which to trust.

**0.4 Write down the release check.**
There is no single documented answer today to "what do I run before deploying". Establish it: tests, lint, build, and the new rule, as one list.

**Prompt:**
> Work Pass 0 of docs/reliability-audit-plan.md, items 0.1 to 0.4 in order. For 0.1, add the narrowed order-of-declaration rule to eslint.config.mjs at error severity and prove it comes back clean. For 0.2, write a test that server renders QuoteEditor with fake data, and prove it fails when the September bug is put back. For 0.3, sort the 113 text-reading tests into "right tool" and "standing in for a real test", and report both lists. For 0.4, write the release check into the doc. Follow the standing rules.

### Pass 0 result, 21 September 2026

**0.1 The guard rule is in.** `eslint-rules/no-read-before-declared.mjs`, wired into `eslint.config.mjs` at error severity across `.js`, `.jsx`, `.mjs`, `.ts` and `.tsx`. Proved both ways: clean across the whole repository, and both September bugs put back one at a time and caught, each reported with the line number to move the code below.

**0.2 One page now actually renders in a test.** `test/renders.test.mjs` builds the quote editor the way React does and asserts that HTML comes out. Rendering needed four things Node does not have, which is why no test had ever done it: JSX, stylesheets, the `@/` alias and `.tsx` support. Those live in `test/helpers/render-support.mjs` and `test/helpers/css-stub.mjs`, scoped to `app/` and `components/` so the lib modules load exactly as they did before. Proved: the test fails with "Cannot access 'totals' before initialization" when the September bug is put back, and the full suite went from 3,265 passing to 3,267 passing with nothing broken. The suite takes about 50 seconds longer, which is the resolve hook running on every import.

**0.3 The 113 text-reading tests turned out to be mostly the right tool.** This was the opposite of what was expected, and it is worth saying plainly: the suite is better designed than the September failure made it look.

- **Two exist only because there was no renderer**, and say so in their own opening comments. `cabinet-configurator-field`: "source checks rather than DOM ones because there is no renderer in this suite". `quote-acceptance-gate`: "There is no DOM renderer in this project, so these read the source". Both can now be upgraded.
- **Nine more read only component files**, so a render could prove them better: `admin-field-weight`, `calendar-mobile`, `clearable-fields`, `dashboard-website-panel`, `dropdown-mobile-sheet`, `quote-note-hover`, `read-only-when-locked`, `reporting-mobile`, `select-arrow`. Several are borderline and say they are source checks on purpose. `clearable-fields` is checking that no field anywhere puts a value back into itself, which is a property of every field rather than of any one render. Read each before changing it.
- **The other 102 are the right tool and should stay.** They prove things a render cannot: that no route writes the quote tables directly, that the code and the SQL schema agree, that a removed pattern has stayed removed, that seven copies of a list still match, that every file in a folder obeys a rule.

**The real gap was never the kind of test.** It was that there were zero render tests, not too few.

**0.4 The release check.** Run these three, in this order, before deploying. Check first that no dev server is running, because a build and a dev server both write to the same folder and corrupt each other on Windows.

| Step | Command | Green looks like |
|---|---|---|
| Tests | `npm test` | 3,267 pass, 0 fail |
| Lint | `npm run lint` | 0 errors. The warnings are pre-existing debt. |
| Build | `PCD_DIST_DIR=.next-build npm run build` | Compiled successfully |

The build is the weakest of the three and proves the least. It compiled both September bugs without a word. The tests and the lint rule are what catch this class now.

**Found while doing this:** `npm run lint` was reporting 5,419 errors, and 5,381 of them came from stale build output folders it was walking, because the ignore list named `.next/**` and nothing else. The 38 that were actually ours were invisible in the noise. The ignore now covers every build folder, and lint reports 0 errors and 195 warnings.

---

## The passes

Ordered by what a fault costs, not by what is easy. The first five are where a bug takes money or makes a promise we cannot keep.

### Pass 1: Building and pricing a quote

The largest and most dangerous surface on the site. This is where the September bug was, it holds the biggest file in the codebase, and every number it produces ends up in a contract.

**Pages:** `/admin/quotes` (list), `/admin/quotes/[id]` (the editor)
**Components:** `QuoteEditor.js` (5,888 lines), `QuotesTable.tsx`, `BoardOrderPanel.js`, `ImportOrderFormModal.js`, `SiteMeasurePanel.js`
**Routes:** the 17 routes under `/api/admin/quotes/`, plus `_quote-line-save.js`, the shared saver both write paths go through
**Deciding code:** `pcd-quote-utils.js` (totals and business defaults, 755 lines), `pcd-board.js`, `pcd-board-cost.js`, `pcd-board-order.js`, `pcd-quote-ready.js`, `pcd-quote-lock.js`, `pcd-size-limits.js`, `pcd-line-details.js`, `pcd-hinges.js`, `pcd-quote-profit.js`
**Settings already here:** markup, GST, hourly rate, labour hours per cabinet, in-house processing hours, ABS edging rate, the six default job costs, hinge drilling cost, saw kerf, board trim

**Questions to answer rather than assume:**
- `QuoteEditor.js` is 5,888 lines in one file. Is that a problem worth solving or is it working? Answer with evidence. Do not split it on principle.
- The `businessDefaultsToDbRow` trap: confirm every field the normaliser knows about is in that list, today.
- `edging_cost_override_ex_gst`, `manual_labour_hours` and the other override fields: is a blank override distinguishable from a zero override everywhere it is read?
- Check A5 across every total the editor shows against what the PDF shows. A test named `quote-pdf-matches-editor` exists. Find out what it actually covers.

**Settings candidates:** `DEFAULT_BENCHTOP_CUTOUT_FEE_EX_GST = 90` and `DEFAULT_BENCHTOP_THICKNESS_MM = 40` in `pcd-benchtop-utils.js` are a price and a specification sitting in code. `DEFAULT_HINGE_QTY = 2` and `HINGE_COUNT_ABOVE = 5` decide how many hinges get charged. `DEFAULT_KICKBOARD_HEIGHT_MM = 120`, `DEFAULT_DOOR_REVEAL_MM = 3`, `DEFAULT_PANEL_THICKNESS_MM = 16`, `FINISHED_PANEL_THICKNESS_MM = 18`, `MAX_LINES = 200`.

---

### Pass 1 result, 21 September 2026: read, then fixed 22 September

Read first and reported with nothing changed, which is the standing rule. All five were then approved and fixed, each one proved. What each finding was, and what closed it, is below.

#### Finding 1. The Currency box can take down the customer's quote. Serious.

The Currency box on the quote editor is free text, at `QuoteEditor.js:3023`. Nothing between that box and the customer's screen checks what is in it:

- the save route stores whatever arrives, `payload.currency || businessDefaults.currency`, in both `app/api/admin/quotes/route.js` and `app/api/admin/quotes/[id]/route.js`
- the database constraint only requires the value to be non-empty, so AUDD, A, a bare dollar sign and "AU D" all save
- `formatMoney` throws `RangeError: Invalid currency code` on every one of them, because `Intl.NumberFormat` accepts only a real three letter code

**The failure:** somebody types a stray character in the Currency box and saves. The quote editor throws on its next render. The customer opens their quote and gets "Application error: a client-side exception has occurred". `formatMoney` is called in 24 files, and 14 of those calls are on the customer's own quote page.

This is the same symptom as the September outage, reachable by a typo in a text box. Verified by running it: `formatMoney(1234.5, "AUDD")` throws.

#### Finding 2. A zero or negative GST rate saves, and prices silently.

`gst_rate` is editable on the settings screen but is not in `DEFAULTS_MUST_BE_POSITIVE` (`AccountSettingsForm.tsx:204`), which guards only `worker_hourly_rate`, `quote_valid_days` and `schedule_hold_hours`.

**The failure:** a zero saved there charges no GST on every quote in the system, and each one looks completely normal. A negative rate produces negative GST: verified, a rate of `-0.1` on a $100 subtotal gives a total of $90. Nothing crashes, nothing is logged, and nobody finds out until the tax return.

#### Finding 3. The GST label says 10% when the rate is 0.

[QuoteEditor.js:4434](../app/admin/quotes/%5Bid%5D/QuoteEditor.js) builds its caption with `Math.round((form.gst_rate || 0.1) * 100)`.

**The failure:** on a GST free quote the line reads "GST (10%)" beside an amount of $0.00. The label and the number contradict each other, and the label is the one a customer would quote back. This is the falsy zero pattern exactly: a legitimate 0 is falsy, so the fallback wins.

#### Finding 4. Nothing checks that the money on the PDF matches the editor.

Three test files generate a real PDF and read it back, which is good. None of them imports `calculateQuoteTotals`. `quote-pdf-matches-editor` covers descriptions, grouping, notes and line numbers, which is what it was written for. The totals block is unchecked in both directions.

**The failure:** any change to how the PDF lays out its totals, or to the arithmetic behind them, can put a different number in front of the customer than the one the office approved, and the whole suite stays green.

#### Finding 5. Two settings nobody can set. Minor, dead weight rather than a fault.

- `currency` is in the data model, normalised, written to the database and carried on every quote. There is no input for it anywhere in Settings.
- `hinge_supply_unit_cost_ex_gst` is hardcoded to `0` in both `DEFAULT_BUSINESS_DEFAULTS` and the normaliser, written to the database as 0, and read by no pricing code at all.

### What was checked and found sound in Pass 1

Verified rather than assumed, so it does not need checking again next time:

- **A1, order of declaration.** Clean across the whole repository, now held by the rule added in Pass 0.
- **A3, business defaults.** All 23 keys agree across `DEFAULT_BUSINESS_DEFAULTS`, `normalizeBusinessDefaults` and `businessDefaultsToDbRow`, checked by running the real code rather than reading it. A test already holds them in agreement. The trap the file warns about is currently shut.
- **The override fields.** Blank, null and undefined mean "follow the lines"; a typed 0 is a real override that pins the value. Correct in `calculateQuoteTotals`, and deliberately documented there.
- **The GST arithmetic itself.** Subtotal times rate, total is subtotal plus GST, every step rounded. No path produces `NaN`, including from a non-numeric rate.

### The 5,888 line question, answered with measurements

| In one component function | |
|---|---|
| `useState` hooks | 50 |
| `useMemo` | 14 |
| `useEffect` | 12 |
| Functions declared inside the component | 74 |
| `fetch` calls | 24 |
| Render helpers | 10 |

The line count is not the problem, and splitting the file to reduce it would not have prevented anything. Fifty pieces of state and seventy four functions **in a single scope** is the problem, because that is the condition where "is this declared above or below the thing it uses" stops being something a person can hold in their head. That is exactly what the September bug was.

**Recommendation: do not rewrite it.** The specific failure mode now fails the build. If it is ever split, split it by what a part does and keep the arithmetic in `lib/` where it already is.

### Test upgrades folded into this pass

`cabinet-configurator-field` now renders the component and asserts the real invariant: no label with no `htmlFor` may contain more than one thing to click. That is what the original fault was, a combobox and a Lookup button sharing a label, and the rule holds however the source is written. The old version matched a particular spelling of a className with a regular expression.

Worth recording: **the first version of that render test was wrong, and rendering is what showed it.** It flagged `<label><input type="checkbox"/>Corner cabinet</label>` as a fault, which is the textbook correct way to write a checkbox. The rule was too crude and had to be narrowed to "more than one control". A source check would never have surfaced that.

`quote-acceptance-gate` **could not be upgraded**, and the reason defines the next piece of harness work. `QuoteApprovalClient` throws `Cannot read properties of null (reading 'get')` under a bare render, because `useSearchParams()` needs a router context. Even with that stubbed it would show only its loading state, because the quote arrives through an effect and effects do not run in a server render. Rendering a page **with data loaded** needs a real DOM and a way to settle effects. That is render harness v2, and it is worth doing before Pass 2, which is almost entirely customer-facing pages.

---


### What closed each Pass 1 finding, 22 September 2026

**Finding 1, the currency.** Fixed at three layers, because one was not enough.

- `isCurrencyCode` and `normaliseCurrencyCode` in `pcd-quote-utils.js` are now the one definition of what a currency is.
- `quoteCurrencyProblem` refuses a bad code on the way in. It is checked in all three quote save handlers, the create, the PUT and the PATCH, using the same refusal pattern the backwards date check already used. A quote can no longer be born with, or saved into, a currency nothing can format.
- The quote editor shows the problem beside the box as it is typed, reading from the same function the server refuses on, so the screen and the server cannot disagree.
- `formatMoney` no longer throws on anything at all. A code it cannot use is SHOWN rather than swapped for one it can: "1,234.50 AUDD" rather than a lie about which currency the number is in, and rather than an error page. Proved across fourteen inputs including the empty string, null and undefined.

That last part matters on its own: quotes saved before today may already hold a bad code, and their PDFs and customer pages have to keep working.

**Finding 2, the GST rate.** `gstRateProblem` in `pcd-quote-utils.js`, refused by the settings save route and shown by the settings screen from the same function. It rejects zero, negative, non-numeric and anything above 1, which catches somebody typing 10 for ten percent and charging a thousand.

**Finding 3, the GST caption.** `calculateQuoteTotals` now returns `gst_rate`, the rate it actually applied, and the editor prints that instead of re-deriving it with `|| 0.1`. The label and the amount are now the same number by construction. Proved: a rate of 0 reads 0% beside nothing, where it used to read 10%.

**Finding 4, the PDF totals.** `test/quote-pdf-totals.test.mjs`. It builds a real PDF, reads the text back, and asserts the subtotal, the GST and the total are the figures `calculateQuoteTotals` produced. Proved it can fail, by expecting a total one dollar out and watching it fail. It also holds two things Pass 1 fixed: that the printed GST follows the quote's own rate, and that a quote carrying a bad currency still produces a document.

Worth knowing for anyone writing a quote fixture later, because it cost an hour here: a line's money comes from `product_unit_cost_ex_gst` times quantity. Setting `unit_price_ex_gst` or `material_cost_ex_gst` on the way in does nothing, because `calculateQuoteLine` works both of those out for itself. A fixture built on them prices every line at zero, and assertions then pass against an empty page.

**Finding 5, the dead settings.** `currency` is now a real setting on the Business Defaults tab, validated with the same `isCurrencyCode` the quotes use. `hinge_supply_unit_cost_ex_gst` is gone from the built-in defaults, the normaliser and the database writer; its column keeps whatever it holds, which is the same treatment the runner rates already had.

All three release checks green afterwards: 3,273 tests pass, lint reports 0 errors, the build compiles.

---


### Render harness v2, 22 September 2026

Built before Pass 2, because Pass 2 is almost entirely customer-facing pages and reading them as text would have been the weaker audit.

**What was blocking it.** `QuoteApprovalClient` threw "Cannot read properties of null (reading 'get')" under a bare render. The first thing the customer's quote page does is call `useSearchParams()` to read its access code, and outside Next that returns null.

**What was built.** `test/helpers/render-page.mjs`. Next exports the real contexts those hooks read from, so rather than faking `next/navigation`, this puts real values into `SearchParamsContext`, `PathnameContext`, `PathParamsContext` and `AppRouterContext`. The page then runs the genuine `useSearchParams`, `usePathname` and `useRouter`. Nothing is replaced. It also carries `withFetch`, which answers a page's requests from a table and **fails the test** on a route the test did not stub, because a page quietly rendering its "no data" state because somebody forgot a route is exactly the test that passes while the page is broken.

**No new dependency was needed**, which was not a given. See below.

**What it covers now.** `test/renders.test.mjs` renders fourteen pages: the quote editor, and every customer-facing page in Pass 2's scope. The customer's quote, the access code form, the quote and project views, the four request-quote steps, both site measure pages, the finishes browser and the shop product page.

**Proved, not assumed.** The September bug shape was put into `QuoteApprovalClient` and both guards caught it independently: the render test failed with "Cannot access 'depositFull' before initialization", and the Pass 0 lint rule reported it with the line to move it below. Two separate nets on the fault that started this document.

**What it still cannot do, and the honest limit.** `renderToString` never runs effects, and every one of these pages loads its data in one. So what is proved is the page BEFORE its data arrives. That is the state every visitor sees for the first moment of every visit and it is where the September bug threw, so it is worth having, but a fault that only appears once a quote is on screen will not be caught.

Going further needs effects to run, which needs `react-dom/client` and a real DOM, which means adding jsdom or happy-dom as a dev dependency. This project keeps few dependencies on purpose, so that is a decision rather than a detail, and it is deliberately not taken here. Before reaching for it, check whether the thing being proved can be proved without a page at all: most of what matters on these pages is a decision made in `lib/`, and a test calling that function directly is faster, clearer and needs no DOM.

**One thing this surfaced.** `ShopProductClient` will not render without its `product` and `catalogue` props. That is not a fault, its route always supplies them, but it is worth knowing that a page taking required props needs a fixture rather than an empty render.

---

### Pass 2: Sending a quote, and the customer's answer

Everything the customer sees and does. A fault here is visible to someone outside the business, which makes it the second most expensive kind.

**Pages:** `/quotes` (code entry), `/quotes/view`, `/quote/view`, `/project/view`, `/variations/view`
**Components:** `QuoteApprovalClient.js` (1,053 lines), `QuoteAccessForm.js`, `QuoteViewClient.tsx`, `ProjectViewClient.tsx`
**Routes:** `/api/quote-workflow/get`, `/action`, `/validate`, `/api/quote-list`, `/api/quote-list/[code]`, and under `/api/admin/quotes/[id]/`: `send`, `pdf`, `quote-pdf`, `elevation-pdf`, `cabinet-drawings`
**Deciding code:** `pcd-quote-acceptance.js`, `pcd-quote-schedule.js`, `pcd-quote-expiry.js`, `pcd-quote-clock.js`, `pcd-contact-details.js`, `pcd-approval-evidence.js`, `pcd-quote-terms.js`, `pcd-terms-html.js`, `pcd-quote-pdf-attachment.js`, `pcd-cabinet-pdf.js` (3,660 lines, the biggest file in `lib/`)
**Settings already here:** quote valid days, schedule hold hours, quote terms, variation terms, email signature

**Questions:**
- The access code path: what stops somebody reading another customer's quote by guessing a code? Read it, do not assume it is handled.
- Check A6 hard here. What does the customer see when the quote has expired, when the code is wrong, when the PDF fails to build?
- `pcd-cabinet-pdf.js` produced twelve order-of-declaration warnings in the one-off scan, all judged harmless. Confirm that judgement rather than inheriting it.
- The credit block added last week renders `credit.lines.map(...)`. Confirm the server can never send a credit without lines.

**Settings candidates:** `WARN_DAYS_BEFORE_EXPIRY = 7` decides when the reminder goes out, and is a business decision sitting in code while the expiry period beside it is already a setting. `FALLBACK_VALID_DAYS = 30` and `FALLBACK_HOLD_HOURS = 48` are the check A2 pattern. Confirm they can only fire in a genuine outage.

---


### Pass 2 result, 22 September 2026: read, not fixed

Nothing was changed. Five findings. The first three are the same shape as each other and they are the serious ones: **the pages a customer opens hand over more than they show, and nothing limits who can ask.**

#### Finding 1. The customer's quote page sends their browser our cost and our margin. Serious.

`app/api/quote-workflow/get/route.js` ends with a spread of the whole database row:

    quote: {
      ...quote,
      pcd_quote_line_items: (quote.pcd_quote_line_items || []).map((line) => ({ ...line, ... })),
    }

Nothing is filtered out, and the read uses the service role client, so no row level security narrows it either. Every column on `pcd_quotes` and on `pcd_quote_line_items` goes to the browser, including:

- `product_unit_cost_ex_gst`, what the item costs us
- `markup_percent` and `markup_amount_ex_gst`, our margin on that line
- `material_cost_ex_gst`, `unit_cost_per_sqm_ex_gst`, `unit_cost_source_label`
- `notes`, the office's own note on the line

That last one is the sharpest part. `notes` is the internal column and `client_note` is the customer-facing one, and the codebase already knows the difference: `test/quote-pdf-matches-editor.test.mjs` has a test called "the internal note is never printed" whose fixture is the note "Chase the deposit before cutting". It is kept off the PDF on purpose, and then sent to the same customer in the JSON behind the page.

**The failure:** a customer opens developer tools on their own quote, or forwards the link to somebody who does, and reads our cost price and our margin on every line, plus whatever the office wrote about their job.

Worth noting what this is not: the `details` block in the same response IS filtered, through `prefillDetails`. So somebody did think about what a customer should receive, for contact details, and the quote itself was never given the same treatment. That reads as an oversight rather than a decision.

#### Finding 2. The variation page sends the whole order record. Same shape, wider.

`app/api/variation-workflow/get/route.js` selects `*, pcd_order_variation_lines(*), pcd_orders(*)` and returns the result whole. So a variation link hands over the entire order row as well as every variation line, with the same cost and markup columns on each, and `original_order_item`, which is a full order line item.

**The failure:** the same as Finding 1, over a wider surface, to whoever holds a variation link.

#### Finding 3. Nothing limits guessing, and the code alone can approve a quote. Serious.

The access code itself is sound: `randomBytes(4).toString("hex").toUpperCase()`, so eight hex characters, 4,294,967,296 possibilities, cryptographically random, and the column is `not null unique`. That is not the problem.

Two things around it are:

- **There is no rate limiting anywhere in this codebase.** Searched across `app`, `lib` and `middleware.js`: no limiter, no throttle, nothing. So the lookup can be asked an unlimited number of times.
- **The code is the only credential, and it authorises more than reading.** `app/api/quote-workflow/action/route.js` takes a code and an action and, on approval, calls `createOrderFromQuote`, emails the customer to say their quote was approved, and starts a deposit checkout.

**The failure:** with N live quotes, the expected number of guesses to hit one is about 4.29 billion divided by N. At a few hundred requests a second, which is trivial to arrange, a few hundred live quotes puts that in hours rather than years. What the finder gets is not just a read: they can approve somebody else's quote, which raises a real order in the business and sends that customer a confirmation for something they never agreed to.

The entropy is fine. It is the absence of a limiter that turns it from impractical into merely tedious.

#### Finding 4. A raw technical error can reach the customer. Minor.

`QuoteApprovalClient.js` handles a failed load with `setMessage(error?.message || "We could not load this quote.")`, and the same pattern on the response path. Our own errors from the route are well worded and arrive as `payload.error`. The catch is for the other kind.

**The failure:** the network drops and the customer reads "Failed to fetch" or "NetworkError when attempting to fetch resource" on a Perth Cabinet Doors page, in the browser's words rather than ours.

#### Finding 5. The deposit shown can go stale against the deposit charged. Minor.

The page works the deposit out from the credits as they are now, through `credit.depositAfter`. The approval route works it out from `quote.credit_applied_inc_gst`, the stored column.

`syncQuoteCreditTotal` is a single documented writer and every admin path that touches credits calls it, so the two normally agree. They can part company in one window: the customer has the page open, somebody releases the credit, the customer then approves.

**The failure:** the page promised a deposit of one amount and the checkout asks for a larger one. Mitigated in practice because Stripe shows the amount before anybody pays, so it is a contradiction rather than a wrong charge.

### What was checked and found sound in Pass 2

- **A1, order of declaration.** The twelve warnings the one-off scan raised in `pcd-cabinet-pdf.js` were genuinely harmless. The permanent rule added in Pass 0 reports zero there. That question is now answered and does not need asking again.
- **The credit block cannot render with no lines.** `quoteCreditView` returns null unless something was actually applied, and `applyCredits` always returns `lines` as an array, so `credit.lines.map` on the page is safe.
- **The expired path.** An archived quote is properly dead, refused by the route with wording written for the customer rather than for us. This was done well and deliberately, and the comment explains why.
- **The schedule and validity fallbacks.** `FALLBACK_HOLD_HOURS` and `FALLBACK_VALID_DAYS` can only fire in a genuine outage, because `normalizeBusinessDefaults` inherits when the stored value is zero, so a real reader never sees a zero to fall back from.

### A7, what is actually run

Pass 2's pages are now rendered by `test/renders.test.mjs`, which harness v2 made possible, so a crash in any of them fails the suite.

Nothing anywhere asserts what the public routes RETURN. No test opens the payload of `quote-workflow/get` or `variation-workflow/get` and checks a cost column is absent. That is why Findings 1 and 2 could exist beside a test file that carefully keeps the same note off the PDF: the document was guarded and the API behind it was not.

### Settings candidates in Pass 2

None new. Nothing found in this pass belongs on a settings screen: an access code length and a rate limit are security parameters, and a wrong value costs more than a wrong price. They belong in code, under the reasoning `SIZE_LIMITS` already uses.

---


### What closed each Pass 2 finding, 22 September 2026

**Findings 1 and 2, the leaking payloads.** `lib/pcd-public-payload.js` is now the one definition of what a customer's browser may receive, and both routes shape their response through it.

A **named safe list** rather than stripping what is sensitive, because of which way each fails. A blocklist has to be remembered every time a column is added to a table, and forgetting sends the new column to customers silently, possibly for months. A named list means a new column is invisible until somebody adds it deliberately, and forgetting costs a missing field on a page, which gets noticed in a day.

The lists are **per table and are not copies of each other**, which matters more than it sounds. `notes` on a quote line is the office's internal note and is refused. `notes` on a variation line is rendered in a table cell on the customer's own page, on purpose, because a change to agreed work has to say why. Same column name, opposite answer. The same is true of `product_unit_cost_ex_gst`: hidden on a quote, and on a variation it is the rate printed as "3.5 hrs at $85.00 per hour". Both facts are written into the file so nobody tidies the two lists into one.

Verified rather than assumed: every field the customer's quote page reads, every field its display helpers read, and every field the variation page reads were extracted from the source and checked against the lists. Nothing the pages need is missing, and the safe lists and the refusal lists do not contradict each other anywhere.

`test/public-payload.test.mjs` locks it, nine tests, checking by field name AND by value, so a sensitive column renamed on its way out is caught too. It also checks the routes still shape their responses rather than going back to spreading a row.

**Finding 3, the rate limiting.** `lib/pcd-rate-limit.js` and `supabase/202609221000_pcd_rate_limits.sql`, applied to all ten public handlers that take an access code: both quote workflow routes, both variation routes, the quote list, the public design, and both booking confirmation routes.

Counted **in the database rather than in memory**, because each serverless instance has its own memory and a counter nobody shares is a speed bump that reports itself as a limit. Reading allows 60 attempts in ten minutes and answering allows 10, which are generous on purpose: a customer opening their own quote must never meet them, because locking somebody out of their own quote would be a worse fault than the one this fixes.

It **fails open and says so loudly** if it cannot count, including when this migration has not been run yet. That is deliberate and uncomfortable, and the reasoning is written in the file: failing closed would mean a database hiccup stops every customer opening their quote. The log line is what stops the absence being quiet.

`test/rate-limit.test.mjs` covers the caller key, the allowances, the refusal, and, most usefully, walks every route under `app/api` and fails if one takes an access code and is not counted. Proved it discriminates by removing the guard from a route and watching that test fail.

**Finding 4, the wording.** All four `setMessage(error?.message || ...)` on the two customer pages now use our own sentence. That value was never one of our messages: our refusals arrive as `payload.error` and are already written for the customer. It was the browser's, and "Failed to fetch" on a Perth Cabinet Doors page tells the reader nothing they can act on.

**Finding 5, the stale deposit.** The approval route re-reads the credits immediately before working out the deposit, so the amount charged is worked out from the credits as they are at the moment of charging rather than from a column that could have moved since the page loaded.

**One thing this pass found on its own:** two route handlers were written as `GET(_request, { params })` because nothing used the request. Adding the limiter made something use it, and `no-undef` caught both immediately. That rule is the one the lint config was written for, and this is it earning its place.

All three release checks green afterwards: 3,303 tests pass, lint reports 0 errors, the build compiles.

**The migration was run on 22 September 2026, and the limiter was then proved against the real database** rather than taken on trust: the table reads clean, eleven attempts against a limit of ten were allowed ten times and refused on the eleventh with a Retry-After, and a second caller in the same window was unaffected. The rows it wrote were cleaned up afterwards.

---

### Pass 3: Money

Deposits, payments, refunds, credits, tax invoices. A smaller surface than the two above, and the one where a fault is least forgivable.

**Pages:** `/admin/financials`, `/admin/customers/[id]` (credits and payments cards), `/payments/success`, `/orders/confirmed`
**Routes:** the payments, refunds, settle, request and process-refund routes under `/api/admin/orders/[id]/`, `/api/admin/quotes/[id]/credits`, `/api/admin/customers/[id]/credits`, `/api/stripe/webhook`, `/api/shop/checkout`
**Deciding code:** `pcd-customer-credits.js`, `pcd-customer-payments.js`, `pcd-payment-settlement.js`, `pcd-refunds.js`, `pcd-deposit-gate.js` (513 lines), `pcd-order-deposit.js`, `pcd-deposit-sweep.js`, `pcd-tax-invoice.js`, `pcd-tax-invoice-pdf.js`, `pcd-board-money.js`, `pcd-stripe.js`, `pcd-financials.js`, `pcd-quote-profit.js`

**Questions:**
- Check A5 is the whole pass. Every total, every direction money moves, every rounding.
- The credit system is one week old and produced one of the two September bugs. Give it a full reading: the claim, the release, the race between two quotes claiming the same credit, and the refund path that was crashing.
- The Stripe webhook: what happens if it arrives twice, or never?
- The local environment file holds a live Stripe key. Confirm nothing in the test or development path can reach it.

**Settings candidates:** deposit percent lives on each quote. Ask whether a business default for it belongs in Business Defaults the way the six job costs already do.

---


### Pass 3 result, 22 September 2026: read, not fixed

Nothing was changed. Five findings. The first two are the same root cause: **an asynchronous payment is treated as if every payment settles instantly.**

#### Finding 1. A payment that fails after settling is never marked unpaid. Serious.

`completeCheckoutSession` sets `is_paid: true` the moment `checkout.session.completed` arrives, without looking at `session.payment_status`. For a card that is right, because the money is already there.

For a payment method that settles later it is not. Those report the session complete while the money is still on its way and say afterwards whether it arrived. The route handles the good news, `checkout.session.async_payment_succeeded`, and it handles the bad news, `checkout.session.async_payment_failed`, but only for two flows:

    if (isSiteMeasure && (async_payment_failed || expired)) { ... }
    if (event.type === "checkout.session.async_payment_failed" && isDepositGate) { ... }

**An ordinary order payment has no failure path at all.** There is one webhook route, it handles four event types, and neither of the failure branches reaches a normal payment.

**The failure:** a customer pays an invoice with a method that settles later, the order is marked paid straight away, the payment then bounces, and nothing anywhere changes. The order reads as paid, the deposit gate lets the job through, the money never arrived, and the first anybody knows is the bank reconciliation.

**This is live, not theoretical.** The enabled payment methods on the Stripe account were read during this pass, and they include klarna, zip, pix, bancontact, blik, eps, mb_way and satispay alongside card, apple_pay and link. Several of those settle asynchronously by their nature. The async handlers were also written deliberately, with a comment saying that without them "a customer paying that way was treated as if they never paid at all", so somebody already knew these arrive.

#### Finding 2. The normal success sequence is reported as the customer paying twice. Serious.

For an asynchronous method the sequence is two events for one payment: `checkout.session.completed`, then `checkout.session.async_payment_succeeded`. Both call the same handler. The first marks the payment paid. The second re-enters and finds `existingPayment.is_paid` already true, which it treats as a second payment:

    [stripe-webhook] DUPLICATE PAYMENT on <id>: ... The customer has paid twice and needs a refund.

and writes an order activity entry titled "Customer paid twice, refund needed".

The same thing happens on any Stripe retry of an event it already delivered, which happens whenever a response is slow or lost.

**The failure:** staff are told to refund money that was only paid once. If somebody acts on it, we hand back money we are owed. If nobody acts on it, the alarm stops being believed, which is worse, because the genuine version of this alarm is real and valuable.

**What makes it clearly a bug rather than a judgement call:** the information needed to tell the two apart is already written on the row. The success path stores `stripe_checkout_session_id`, so a redelivery of the same session can be recognised by comparing it. The duplicate check simply does not look at it: it tests `is_paid` and nothing else.

The genuine duplicate case, where a payment was settled by hand and then the link was paid as well, is handled carefully and well, and none of that needs changing. It is the comparison that is missing.

#### Finding 3. A failed payment insert loses the customer's credit. Serious.

`spendCreditsOnOrder` marks the credit spent first, then inserts the payment row that credits it against the order, then links them:

    update credit -> state: spent, spent_order_id     (conditional, correct)
    insert into pcd_order_payments ...                (throws on failure)
    update credit -> spent_payment_id

There is no transaction, and Supabase cannot give these three writes one. If the insert throws, the first write has already committed.

**The failure:** the credit is marked spent against an order that has no payment for it. The customer's money is consumed in the credit ledger and credited nowhere, so they are asked to pay the full amount. Nothing anywhere looks for a credit that is spent with `spent_payment_id` still null, so it would never be found.

The conditional itself is correct and was verified rather than trusted: the update is conditional on `state = held` and on the holding quote, and the code skips creating a payment when nothing was written. Two requests racing genuinely cannot both win. It is the partial failure of one request that is unguarded.

#### Finding 4. Nothing stops a development server charging a real card. Moderate.

`.env.local` holds a live secret key, and there is no environment check anywhere: not in `pcd-stripe.js`, not in `pcd-deposit-gate.js`, not in `pcd-shop-checkout.js`. Nothing compares `NODE_ENV` or `VERCEL_ENV`, and nothing notices that a key begins `sk_live`.

**The failure:** somebody runs the site locally to test a checkout, presses Pay, and charges a real card through the live account.

The only protection today is remembering. That is worth saying plainly because it is currently written down as a personal note rather than enforced by anything.

Tests are safe, and that was checked rather than assumed: the test harness does not load `.env.local`, so `STRIPE_SECRET_KEY` is undefined during `npm test` and `stripeSecretKey()` throws rather than reaching for a live key. No test constructs a client either.

#### Finding 5. Money is rounded two different ways. Minor.

There are fourteen separate rounding expressions across the money libraries, in two variants. Some add `Number.EPSILON` before rounding and some do not:

    withEpsilon(1.005) = 1.01      plain(1.005) = 1.00

`pcd-quote-utils.js`, `pcd-quote-profit.js`, `pcd-board-cost.js` and `pcd-cabinet-utils.js` use the first. `pcd-customer-credits.js`, `pcd-customer-payments.js`, `pcd-board-money.js`, `pcd-refunds.js` and five others use the second.

Measured rather than guessed: across two million halfway values they disagree 61 times, about one in thirty three thousand.

**The failure:** a quote total and a credit applied against it can round the same underlying figure a cent differently, which is exactly the kind of one cent gap that fails the line sum check on a tax invoice. Rare, small, and the sort of thing that takes an afternoon to find when it does happen.

### What was checked and found sound in Pass 3

- **The credit races.** The file claims that every state move is conditional on the state that was read, so two requests racing cannot both win. That claim was checked rather than trusted, on both the claim and the spend, and it holds. A credit cannot be claimed twice or spent twice.
- **Refunds cannot exceed what was paid.** `refundableAmount` subtracts refunds already made and refuses anything larger, with a small tolerance for floating point rather than an exact comparison, which is the right way round.
- **A genuine duplicate payment is handled well.** Settled by hand and then paid by link is detected, shouted about in the log, and written into the order's activity with enough detail to act on. The row is deliberately not overwritten, and the reasoning for that is written down.
- **Tests cannot reach the live Stripe key.** Verified by reading the harness rather than by assuming.

### Settings candidates in Pass 3

None. Nothing here belongs on a settings screen: a rounding rule, a webhook's idempotency and an environment guard are all code.

---


### What closed each Pass 3 finding, 22 September 2026

**Findings 1 and 2, the asynchronous payment.** Both decisions the webhook was getting wrong are now named functions in `lib/pcd-stripe.js`, so they can be tested against the literal values Stripe sends rather than by reading the route and hoping.

`paymentHasSettled(session)` is the answer to "has the money arrived". Only "paid" and "no_payment_required" count. A session that completes with the money still moving now records the Stripe ids and stops, and nothing is marked received; `async_payment_succeeded` comes back later and that is when it becomes paid. A missing status counts as not settled, where the old code defaulted it to paid.

`isSameSessionAgain(payment, session)` is the answer to "is this the same payment arriving again". It compares the session id already written on the row. A redelivery is ignored. A genuinely different session on an already paid row still raises the duplicate alarm, and so does a Stripe payment landing on a row somebody settled by hand, because that one has no session id to match. None of the good work in the existing duplicate handling was changed.

And the branch that was missing entirely: an ordinary order payment that fails now marks the Stripe status, shouts in the log and writes an order activity entry saying to send a fresh link. Previously `async_payment_failed` was caught for site measures and the deposit gate and for nothing else.

**Finding 3, the credit spend.** The payment insert is now wrapped, and a failure puts the credit back to held before raising. The undo is conditional on the credit still being in the state this call left it, so it can only undo its own work. The customer's money stays where it was instead of being consumed against an order that has no payment for it.

**Finding 4, the live Stripe key.** `stripeSecretKey()` refuses a key beginning `sk_live` or `rk_live` unless it is running on Vercel or somebody sets `PCD_ALLOW_LIVE_STRIPE=yes` for that run. Deliberately not keyed on `NODE_ENV`, because `next build` runs as production on a laptop and a build must not be mistaken for the live site. Proved all four ways: refused on a laptop, allowed with the override, allowed on Vercel, and a test key untouched.

**Finding 5, the rounding. This one corrected itself halfway through and it is worth recording why.**

The plan was to standardise on the `Number.EPSILON` variant, on the grounds that it was the one that got 1.005 right. The test written to prove it failed on 8.165, and measuring the two properly showed the chosen version was the worse one:

    over 200,000 halfway values
      Math.round((v + Number.EPSILON) * 100) / 100    wrong 9,158 times
      the version now in lib/pcd-money.js             wrong 0 times

`Number.EPSILON` is the gap between doubles **at magnitude one**, and money is not at magnitude one. By 8.165 the real gap is wider than one epsilon, so the nudge no longer reaches the boundary. It works on exactly the small examples anybody would test with, which is the worst way for something to be wrong, and standardising on it would have spread that across every money module in the codebase.

`lib/pcd-money.js` now scales, uses `toFixed(2)` to discard the binary noise at the right magnitude, and rounds half away from zero so a refund and a charge of the same size cannot disagree by a cent. All nine money modules read from it, and a test walks `lib/` and fails if any of them grows its own again.

**The lesson worth keeping:** the first fix was wrong and only the test caught it. That is the whole argument for rule 4 in this document, that a fix is not done until it is proved, and this pass is the clearest example of it so far.

**One existing test needed its boundary moved, not its rule changed.** `payment-settlement` checked that the duplicate branch does not write to the row, by slicing the webhook from the duplicate check to `const paidAt`. The not-settled branch now sits in that gap, so the slice swept in a write that has nothing to do with duplicates. The slice was narrowed to the duplicate branch itself. The rule it protects is unchanged and still holds.

All three release checks green afterwards: 3,318 tests pass, lint reports 0 errors, the build compiles.

---

### Pass 4: Quote becomes an order, and variations

The handover, plus every change after the customer has committed. The lock rules live here, and they are what stops two documents describing different jobs.

**Pages:** `/admin/orders`, `/admin/orders/[id]`, `/admin/orders/[id]/variations/[variationId]`, `/admin/board`, `/admin/calendar`
**Components:** `OrderDetail.js` (4,531 lines), `VariationEditor.js` (1,914 lines), `BoardClient.tsx`, `CalendarManager.tsx` (1,865 lines)
**Routes:** the 26 routes under `/api/admin/orders/`
**Deciding code:** `pcd-order-from-quote.js`, `pcd-order-stage.js`, `pcd-order-variations.js` (611 lines), `pcd-variation-override.js`, `pcd-variation-pricing.js`, `pcd-document-lock.js`, `pcd-quote-lock.js`, `pcd-order-schedule.js`, `pcd-board.js`, `pcd-calendar.js` (728 lines), `pcd-order-history.js`

**Questions:**
- Check A3 is the whole pass. A field that exists on the quote and not on the order is the classic fault here, and `pcd-order-from-quote.js` already carries a warning about `CARRIED_SPEC_COLUMNS`.
- The document lock: prove it cannot be gone around, rather than reading that it exists.
- `LATE_AT = 8` in `pcd-board.js` decides what counts as late. Settings candidate.

---


### Pass 4 result, 22 September 2026: read, not fixed

Nothing was changed. Four findings. The headline question for this pass, whether a field is dropped between the quote and the order, came back clean, and the faults are elsewhere.

#### Finding 1. Accepting a quote can leave the customer approved with no usable order. Serious.

The acceptance route does the right thing first: it claims the approval with a conditional update, so two clicks cannot raise two orders. Then it calls `createOrderFromQuote`, and that function does three things in this order:

    1. insert the order row
    2. refuse if any cabinet has no cut list
    3. insert the order lines

Step 2 throws. Its own comment calls it the "last chance to catch a cabinet nobody configured", and it is placed after the order row already exists. Step 3 can throw too, after its retries.

There is no rollback anywhere. The outer catch returns a 500 and nothing undoes the approval.

**The failure:** a customer approves a quote that has a cabinet nobody configured. The quote is now marked approved, an order row exists with no lines on it, and they are shown an error. They cannot try again, because the quote reads as already responded to. Nothing tells anybody in the office that it happened. The customer's next move is to ring and ask why nothing happened.

This is the same shape as the credit spend fault found in Pass 3: several writes, no transaction available, and no compensation when one of them fails partway.

The cheapest part of the fix is free: the cabinet check needs nothing from the order row, so moving it above step 1 removes that path entirely.

#### Finding 2. A second open variation shows the customer a total that is wrong. Moderate.

`recalcVariation` works out what the order will come to as the order's current total plus this variation's own delta, and stores it as `revised_order_total_inc_gst`. That figure is printed on the page the customer opens.

Nothing stops two variations being open on one order at the same time, and applying one does not recalculate the others.

**The failure:** two variations are out with a customer. They approve the first, and the order total goes up correctly. The second variation's page still says "your order will come to X", worked out before the first was applied, so it is understated by the whole of the first variation. They approve it believing a number we will not honour.

The order's own arithmetic stays right, because applying adds each delta to the order in turn. It is only the figure promised to the customer that goes stale, and only on the second and later variations.

#### Finding 3. The order side has no equivalent of the quote's lock coverage. Moderate.

The quote side is protected properly. `test/quote-lock-coverage.test.mjs` walks every route under `app/api`, finds everything that writes a quote line, and fails if one of them does not go through the lock. That is the right tool and it would catch a new route on the day it was written.

The order and variation side has no such walk. `test/document-lock.test.mjs` names three variation routes by hand and checks those three.

**The failure:** somebody adds a route that writes variation lines or order line specs and does not call `assertOpenForEditing`. Nothing notices. The rule that committed work only changes through a variation is currently held by the fact that nobody has written such a route, not by anything that would find out.

#### Finding 4. A raw server error can still reach the customer. Minor, and a leftover.

Pass 2 fixed the four places where the customer pages showed `error.message` from a caught exception. The other half is still there: when the acceptance route fails it returns `error?.message` in `payload.error`, and the page shows `payload.error` because that is normally our own carefully worded refusal. A 500 from a database error puts its own words on the customer's screen instead.

### What was checked and found sound in Pass 4

- **A3, which the plan called the whole pass: no spec answer is dropped.** All four hops a line field crosses were run against a line carrying every spec answer the system knows about, and all twenty six survive from the quote to the order line: the sizes, the board, the profile and edge, the panel use, the banded edges, the hole type, the edge finish, the supplier, the cabinet brand and all six hinge fields, plus the customer's own note. Nothing reaches the quote and fails to reach the order.
- **The lock fails closed.** `editability` returns "sealed" for a status it does not recognise, so a state nobody anticipated cannot become a way past the rule.
- **The routes with no lock check are right not to have one.** Eight write to an order or variation table without it, and each was opened and read. Six are the state change itself: archiving, creating a variation, sending one, the sanctioned override, the cutting plan settings and recording an invoice send. The other two write only production tracking, supplier references, contact details, the site address and the status. None of them can change what is being made or what it costs.
- **Variations applied one after another keep the order total correct.** Each adds its own delta to the order's subtotal, GST and total.
- **The missing-column fallbacks shout.** When a database has not had a migration run, applying a variation drops the columns it cannot write and logs which ones, rather than losing the whole variation the customer has already agreed to. That is the right trade and it is said out loud.

### Settings candidates in Pass 4

`LATE_AT = 8` in `pcd-board.js` decides what counts as late on the board, which is a judgement about how this business works rather than a rule with geometry behind it. It is the one candidate in this pass and it is a reasonable one.

---


### What closed each Pass 4 finding, 22 September 2026

**Finding 1, the stuck acceptance.** Two changes, and the first one cost nothing.

The reads and the unconfigured cabinet check were moved ABOVE the order insert. They never needed the order to exist; the check's own comment called itself the "last chance" while sitting after the thing it was meant to prevent. A quote with an unconfigured cabinet is now refused before anything is written, so the customer can go back and the quote is still theirs.

For the failure that can still happen after the order row exists, when the lines will not insert, `discardHalfMadeOrder` removes the empty order row and lets the error travel on. An order with no lines is worth nothing to anybody and looks like real work on the board. It never throws itself, because it runs while another error is already on its way up and must not replace the reason things went wrong.

**Finding 2, the stale variation total.** Applying a variation now recalculates every other variation still out on that order, draft ones included, because the order total is what a staff member is pricing against. It never throws: the applied variation is correct and the order is correct, and a sibling with a stale figure is a wrong number on a page rather than a reason to fail work the customer has agreed to.

**Finding 3, the missing coverage walk.** `test/order-lock-coverage.test.mjs`, the order side's equivalent of `quote-lock-coverage`. It walks every route under `app/api/admin/orders`, finds everything that writes to an order or variation table, and fails on any that does not ask the lock. Exemptions carry their reason in the file, and a second test fails if an exemption stops describing a route that actually skips the lock.

That staleness check earned itself on day one: the first draft excused the variation send route, and the check pointed out it already asks through `assertSendable` and needed no excuse.

**Finding 4, the raw errors.** All five public workflow routes now log the real error and return a sentence written for the customer. This catch is the unexpected path: everything these routes genuinely mean the customer to read is returned further up with its own status. What was reaching here was database wording, or instructions addressed to the office. The clearest example is the unconfigured cabinet refusal, which tells the reader to open the cabinet form in the quote and save it, and that reader is now a customer who can do nothing with it.

---

### The half-finished write, swept across the whole codebase

Asked for after this pattern turned up twice in a row: the credit spend in Pass 3 and the quote acceptance in Pass 4.

Every function in `lib/` and `app/api/` that writes to more than one table in sequence was found and counted.

| | |
|---|---|
| Operations writing to more than one table | 38 |
| Of those, with no way to put anything back | 14 |

**The honest headline is that this is structural, not a list of bugs.** Supabase's client cannot put several writes in one transaction, so every multi-step write in this codebase is exposed by default, and the codebase handles it case by case. Some paths compensate, now including the two fixed in Passes 3 and 4. Some are safe by a different route: the site measure refund carries a Stripe idempotency key, so a retry cannot send the money twice, and several state changes are conditional updates that cannot both win. Most simply throw and leave whatever they had already written.

The fourteen, and what a failure partway leaves behind:

**Leaves something wrong and hard to see**

- `insertQuoteRequest` (`pcd-quote-request.js`). Saves the request, then its lines. If the lines fail it throws, leaving a request with nothing in it. The customer is told it failed and sends it again, so what builds up is empty shells beside a duplicate.
- `acceptQuoteForCustomer` (`pcd-quote-acceptance.js`). Claims the quote, raises the order, links the order back onto the quote, then records the deposit payment. A failure between the last two leaves an order whose quote does not point at it, or a deposit that was taken and is not recorded.
- `deleteQuoteLine` (`_quote-line-save.js`). Deletes the cabinet config, then the line. A failure between them leaves a line whose panels have gone.

**Leaves something wrong but obvious**

- `startDepositCheckout` and `sendDepositChases` (the deposit gate and its sweep). Quote state and checkout rows can part company; a stranded checkout row is visible and the sweep is built to re-run.
- `recalculateQuoteTotals`. Lines saved, totals not. The next save fixes it.
- `cancelSiteMeasureBooking`. The refund goes first and carries an idempotency key, so the money is safe. A failure after it leaves a refunded booking still reading as booked.
- The three customer desk paths (`fileMessagesForCustomer`, `recordOutboundEmail`, the reply route). A ticket with no message on it.
- `PATCH /api/public/design/[code]`, and the customer changes route.

**Not yet assessed in detail:** the remaining entries were identified by the sweep and classified by shape rather than opened line by line. Each is named above so the next pass over that area starts from a list rather than from scratch.

**What to do about it is a decision, not a fix.** Three honest options, in order of how much they change:

1. Leave it, and compensate case by case as each pass finds one. That is what Passes 3 and 4 did. It works and it is slow, and it only ever covers what somebody has looked at.
2. Compensate the three in the first group, which are the ones where the wreckage is hard to see. A day's work, and it closes the cases that cost a phone call.
3. Move the sequences that matter into Postgres functions called through `rpc`, which is the only way to get a real transaction here. The most work by far, and the only answer that is actually general.

None of these is urgent. The pattern has been in the codebase a long time and the two instances found so far both needed something else to go wrong first.

All three release checks green after the Pass 4 fixes: 3,322 tests pass, lint reports 0 errors, the build compiles.

---

### Pass 5: Production, and the documents the workshop uses

Where a wrong number gets cut into a board.

**Routes:** `cut-list-pdf`, `cutting-plan`, `labels`, `delivery-label`, `order-form`, `order-form/email`
**Deciding code:** `pcd-cut-list.js`, `pcd-cutting-plan.js` (1,088 lines), `pcd-cutting-plan-pdf.js`, `pcd-order-label-pdf.js` (918 lines), `pcd-order-labels.js`, `pcd-order-label-delivery.js`, `pcd-order-form-workbook.js` (1,394 lines), `pcd-order-form-import.js`, `pcd-order-form-tabs.js`, `pcd-production-groups.js`, `pcd-order-panel-numbers.js`, `pcd-order-reference-images.js`
**Settings already here:** cutting plan settings on the order, saw kerf, board trim

**Questions:**
- The Excel order form builds its dropdowns live from the libraries and its validations are chained. Checks A3 and A4: does a colour added to the library reach every tab that should offer it?
- `pcd-order-reference-images.js` is the file that took a function from 444MB to 47MB against a 250MB ceiling. Confirm nothing has crept back.
- `ITEM_ROWS = 100` caps how many lines an order form carries. What happens on line 101?

---

### Pass 6: How work arrives

Four front doors, all public, all judged by strangers.

**Pages:** `/`, `/contact`, `/request-quote` and its list, send and sent pages, `/book-a-site-measure` and `/booked`, `/design` (the public planner), `/start`, `/finishes`, `/products`, `/products/[slug]`, `/ikea-kaboodle`, `/kitchen-refresh`, `/bespoke`, `/launch`
**Components:** `RequestQuoteFormClient.js` (1,411 lines), `PublicDesignClient.js` (2,858 lines), `PartConfigWindow.js` (940 lines, 48 order-of-declaration warnings to confirm are harmless), `BookSiteMeasureClient.js`, `FinishesBrowser.js`
**Routes:** `/api/enquiries`, `/api/quote-requests`, `/api/public/design/*`, `/api/public/site-measure/*`, `/api/colour-library`, `/api/profile-library`, `/api/hardware`, `/api/track`
**Deciding code:** `pcd-quote-request.js`, `pcd-quote-request-payload.js`, `pcd-public-design.js`, `pcd-public-config.js` (547 lines), `pcd-public-parts.js`, `pcd-site-measure-booking.js` (one of the two September bugs), `pcd-booking-store.js`, `pcd-booking-settings.js`, `pcd-notify.js`, `pcd-site-tracking.js`
**Settings already here:** all of Site Measures, all of Website Overlay

**Questions:**
- Check A6 across all four doors. The "we could not send your message" fault was fixed once here. Confirm it cannot return through a newer path.
- Quote request completeness is enforced in four places. Check A4: are those four still in agreement?
- The public design tool has a Phase 4 feature list of its own. This pass is about whether what exists today is reliable, not about the new features.

**Settings candidates:** `HOLD_MINUTES = 20` (how long a booking slot is held), `MAX_ITEMS_PER_SESSION = 80`, `DESIGN_NAME_MAX = 80`, `PUBLIC_CARCASS_THICKNESS_MM = 18`, `PUBLIC_SHELF_THICKNESS_MM = 18`. The thicknesses are probably correctly in code under the size-limits reasoning. Confirm rather than assume.

---

### Pass 7: The libraries everything is priced from

If these are wrong, every quote after them is wrong.

**Pages:** `/admin/options` (colour), `/admin/profiles`, `/admin/benchtop-materials`, `/admin/hardware`, `/admin/products`
**Components:** `ColourLibraryManager.tsx` (1,196 lines), `ProductEditorForm.js` (1,821 lines)
**Deciding code:** `pcd-colour-library.js`, `pcd-board-load.ts` (734 lines), `pcd-board-cost.js`, `pcd-catalogue-cost.js`, `pcd-profile-library.js`, `pcd-profile-specs.js`, `pcd-hardware-types.js`, `pcd-hardware-line.js`, `pcd-benchtop-utils.js`, `pcd-materials.js`, `pcd-supplier-selection.js`

**Questions:**
- Check A2 is the whole pass. The falsy-zero fault lives in this territory: a genuine $0 cost must not be swallowed.
- Check A4: `matchBoardCost` distrusts an id that contradicts the board beside it. Is that distrust applied everywhere a board is written?
- Most of the colour library has no cost, which is accepted and deliberate. Confirm nothing has started treating that as an error.

---

### Pass 8: The shop

Smallest surface, real money, runs with nobody in the loop.

**Pages:** `/products/[slug]`, `/cart`, `/checkout`, `/payments/success`
**Routes:** `/api/shop/price`, `/api/shop/checkout`, `/api/stripe/webhook`
**Deciding code:** `pcd-shop.js`, `pcd-shop-pricing.js`, `pcd-shop-cart.js`, `pcd-shop-checkout.js`
**Settings already here:** metro delivery charge

**Settings candidates:** `METRO_POSTCODES = { from: 6000, to: 6199 }` is the delivery area, and the same file writes that range into the customer-facing wording. If the area ever changes, two things must change together, which is check A4.

---

### Pass 9: The things that run on their own

Six scheduled jobs and two outside services. Nobody is watching when these fail.

**Jobs:** mail-sync (22:00), calendar-sync (21:00), deposit-sweep (20:00), quote-expiry (19:00), site-rollup (18:00), booking-confirmations (17:00)
**Deciding code:** `pcd-graph-mail.js`, `pcd-graph-calendar.js`, `pcd-calendar-sync.js`, `pcd-deposit-sweep.js`, `pcd-quote-expiry.js`, `pcd-site-rollup.js`, `pcd-booking-confirmation-sweep.js`, `pcd-mail-catchup.js`, `pcd-desk-sync.js`
**Also:** `middleware.js`, `lib/admin-guard.js`, the Graph calendar webhook

**Questions:**
- How would you find out that a job has been failing for a week? Answer honestly. If the answer is that you would not, that is the finding.
- Every job has a batch cap: `MAX_PER_PASS = 200` and `300`, `BATCH = 40`, `PUSH_BATCH = 25`, `PASSES = 12`. What happens to the work past the cap, and does the next run pick it up or is it dropped?
- `SUBSCRIPTION_MINUTES = 4230` and `RENEW_WHEN_UNDER_MINUTES = 1440`: what happens if a renewal is missed?
- Check A6 across all six. A job that fails silently is the worst case in this document.

---

### Pass 10: Email, and what we say to people

Cuts across everything, so it is read once on its own rather than a piece at a time.

**Deciding code:** `pcd-email-templates.js` (1,154 lines), `pcd-customer-confirmations.js`, `pcd-quote-expiry-emails.js`, `pcd-deposit-emails.js`, `pcd-site-measure-emails.js`, `pcd-booking-confirmation-emails.js`, `pcd-tax-invoice-email.js`, `pcd-design-share-email.js`, `pcd-order-form-email.js`, `pcd-update-wording.js`, `pcd-line-summary.js`, `pcd-mail-senders.js`, `pcd-send-email.js`, `pcd-business-identity.js`
**Settings already here:** email signature

**Questions:**
- Check A4: `pcd-line-summary.js` is meant to be the single place a requested line is turned into words. Confirm nothing has grown a second describer.
- Every address, phone number and ABN a customer receives should trace back to `pcd-business-identity.js`. That file notes the public pages still have the phone number typed into their markup. Find every copy and list them.
- Read the tone of every automated email against the rule that we say it once and never promise a call back.

---

## The settings register

Candidates found while mapping. **None of these are decisions yet.** Each gets the three-way test during its own pass, and plenty of them will correctly stay in code.

| Value | Where | Today | Pass |
|---|---|---|---|
| Benchtop cutout fee, $90 | `pcd-benchtop-utils.js` | code | 1 |
| Benchtop thickness and overhang, 40mm and 20mm | `pcd-benchtop-utils.js` | code | 1 |
| Default hinge quantity 2, count threshold 5 | `pcd-door-utils.js`, `pcd-hinges.js` | code | 1 |
| Kickboard height 120mm, door reveal 3mm | `pcd-kickboard-utils.js`, `pcd-door-utils.js` | code | 1 |
| Panel thicknesses, 16mm and 18mm | `pcd-finishpanel-utils.js`, `pcd-panel-board.js` | code | 1 |
| Expiry warning, 7 days before | `pcd-quote-clock.js` | code | 2 |
| Deposit percent as a business default | per quote today | not a default | 3 |
| Late threshold on the board, 8 | `pcd-board.js` | code | 4 |
| Order form row cap, 100 | `pcd-order-form-tabs.js` | code | 5 |
| Booking slot hold, 20 minutes | `pcd-booking-store.js` | code | 6 |
| Design session item cap, 80 | `pcd-public-design.js` | code | 6 |
| Metro postcode range, 6000 to 6199 | `pcd-shop.js` | code | 8 |
| Job batch caps: 200, 300, 40, 25, 12 | six job files | code | 9 |
| Calendar subscription and renewal windows | `pcd-graph-calendar.js` | code | 9 |

---

## Progress log

Fill in as each pass finishes. Findings is how many real faults were found. Fixed is how many were fixed and proved.

| Pass | What | Done | Findings | Fixed | Settings added | Notes |
|---|---|---|---|---|---|---|
| 0 | Close the hole | 2026-09-21 | 1 | 1 | none | Guard rule added, first render test added, 113 tests sorted, release check written |
| 1 | Quote build and price | 2026-09-22 | 5 | 5 | Currency | Currency box was the serious one. Configurator test upgraded to a render. |
| 2 | Quote out and decision | 2026-09-22 | 5 | 5 | none | Public payloads now filtered; rate limiting added. Migration still to run. |
| 3 | Money | 2026-09-22 | 5 | 5 | none | Asynchronous payments were treated as if every payment settles instantly |
| 4 | Order and variations | 2026-09-22 | 4 | 4 | LATE_AT | No spec answer is dropped quote to order. Acceptance no longer half-commits. |
| 5 | Production documents | | | | | |
| 6 | How work arrives | | | | | |
| 7 | Libraries | | | | | |
| 8 | Shop | | | | | |
| 9 | Jobs and integrations | | | | | |
| 10 | Email and wording | | | | | |

### Faults found outside a pass

Anything that turns up during other work goes here, so the pattern stays visible even when there is no time to chase it.

| Date | What broke | Which check would have caught it | Fixed |
|---|---|---|---|
| 2026-09-21 | Every quote in the admin was a dead page | A1 | yes |
| 2026-09-21 | Site measure refund path crashed before refunding | A1 | yes |
| 2026-09-21 | `npm run lint` was reporting 5,381 errors from stale build folders, hiding the 38 real ones | A6, a check that fails loudly enough to be ignored | yes |
| 2026-09-21 | The Currency box could crash the quote editor and the customer's quote | A2 and A6 | yes |
| 2026-09-21 | A zero or negative GST rate saved silently and charged no GST | A2 and A5 | yes |
| 2026-09-21 | The GST caption printed 10% beside an amount of zero | A2, falsy zero | yes |
| 2026-09-22 | Customer quote and variation pages sent our cost, margin and internal notes to the browser | A2 and A6 | yes |
| 2026-09-22 | No rate limiting anywhere, on routes where a guessed code can approve a quote | A6 | yes |
| 2026-09-22 | A payment that bounced after settling went on reading as paid | A5 and A6 | yes |
| 2026-09-22 | The normal two events of one asynchronous payment were reported as paying twice | A5 | yes |
| 2026-09-22 | A failed payment insert could consume a credit and credit it nowhere | A5 | yes |
| 2026-09-22 | Money was rounded two different ways, and the more common one was wrong 4.6% of the time at halfway values | A4 and A5 | yes |
| 2026-09-22 | Accepting a quote with an unconfigured cabinet left the customer approved with an empty order and no way back | A5 and A6 | yes |
| 2026-09-22 | A second open variation promised the customer a revised order total that ignored the first | A5 | yes |
| 2026-09-22 | 14 multi-table write sequences can leave half their work behind | A5 | swept and listed, not fixed |
