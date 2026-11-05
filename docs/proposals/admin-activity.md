# Admin activity dashboard: design

**DRAFT.** Drafted by a coding agent (Claude, a closed model by Anthropic), 2026-11-05, for the coordinator
(session snowmoon-9c). Nothing here is built. Based on `origin/main` at `fd632855` (PR #117, the sign-in release;
migrations through `0036_social_bluesky_check`). Designed from the code and migrations only; no production read.

## The brief (owner, 2026-11-05)

One page, `/admin/activity`, for admins only (404 to everyone else, as `/challenge` answers today), never cached. It
reads **only what the site already keeps**: no new table, column, log, tracking, page-view count or export. Private data
shows as totals; per person, only what is public anyway (their name, published work, entries).

## Shape

| Piece | What it is |
| --- | --- |
| `src/app/admin/activity/page.tsx` | `notFound()` for everyone, `robots: noindex`, `dynamic = 'force-dynamic'`. Its HTML says nothing of the dashboard. |
| `src/app/admin/activity/not-found.tsx` | `<AdminActivity fallback={<NotFound />} />`, the `ChallengeAdmin` pattern (`src/components/challenge-admin.tsx`): a signed-in admin's browser fetches the data and draws it; everyone else keeps the usual 404 page. |
| `src/app/api/admin/activity/route.ts` | `GET` only. `getFid(request)`, then `isAdmin(fid)` (`src/lib/admins.ts`); anything else gets `404 {"error":"Not found"}`, before any query. Answers with `Cache-Control: private, no-store`. `dynamic = 'force-dynamic'`. |
| `src/lib/admin-activity.ts` | Every query. Takes a `postgres.Sql`, never imports `ADMINS`/`isAdmin`. Returns `ActivityView` (a typed object of totals and public rows only). |
| `src/components/admin-activity.tsx` | Draws `ActivityView`: tables and plain bar rows, no chart library, no third-party request (P6a). No words of its own beyond labels. |

**One read-only transaction.** `sql.begin('read only', async (tx) => { await tx\`set local statement_timeout = '5s'\`; … })`
as `studio_writer` (the app's only role, P6d). Postgres refuses any write inside it, so a bug can't change data. The
transaction pins one pooler connection; ~20 small queries run in turn on it.

**Which tables exist.** The first query in the transaction reads `to_regclass('studio.<t>')` for every optional table and
`information_schema.columns` for every optional column (list in *Depends on unmerged branches*). A section whose source
is missing is left out of `ActivityView` (`null`), and the page says "not on this database yet". No query names a
missing table, so nothing errors.

**Time.** `?days=7|30|90` (default 30, anything else is 30). Per-day rows are **Pacific days**
(`(at at time zone 'America/Los_Angeles')::date`) for every table with a timestamp. The cost tables keep only a
**UTC date** (`day date default (now() at time zone 'utc')::date`: `chat_costs`, `image_costs`, `remix_costs`,
`coach_costs`), so spend is shown by UTC day and labelled "UTC day". All-time totals sit above each trend.

**Order.** Trends by day, lists newest first; nothing is ordered by money, count or score (P5, P7a).

---

## 1. Sign-ins by network

The site keeps no sign-in log. What it keeps, and so all this section can show:

| Network | Source | Kept | Shown |
| --- | --- | --- | --- |
| Farcaster | `studio.account_names (fname, person, seen_at)`, written by `rememberName` (`src/lib/adaptation-pages.ts`) at `/api/auth/me` and `/api/auth/web/status` | the **latest** sign-in time per name (overwritten each time) | per day: people whose latest sign-in was that day; total people ever seen |
| Wallet | `studio.wallet_accounts (id, created_at)`, made on first sign-in (`accountFor`, `src/lib/wallet/credits.ts`) | **first** sign-in only | per day: new wallet accounts; total |
| Lens, Bluesky | `studio.social_accounts (kind, created_at, last_sign_in_at)` (0035) | first and latest sign-in | per day and kind: new accounts, and accounts whose latest sign-in was that day; totals |
| Links | `studio.wallet_links`, `studio.social_links` (`linked_at`, `unlinked_at`) | each link | per day: links made and ended, by kind; active links total |

Query shape: `select d, count(distinct person) … group by d` (Farcaster: `max(seen_at)` per `person` first, since a
person can have several names). Totals only.

**Never shown:** names, FIDs, addresses, DIDs, handles. **Says plainly on the page:** "Not a count of sign-ins: the site
keeps only the latest Farcaster sign-in, the first wallet sign-in, and the first and latest Lens and Bluesky sign-ins."
A true per-day sign-in count would need new tracking, which the brief rules out.

## 2. Making and asking

| Row | Source | Query |
| --- | --- | --- |
| Pictures asked for | `studio.image_asks (fid, at)` | per day: `count(*)`, `count(distinct fid)` |
| Remix frames asked for / made | `studio.remix_asks (person, at)`; `studio.remix_frames (created_at, hidden)` | per day: asks, distinct people, frames made, frames hidden |
| People who made pictures | union of `image_asks.fid` and `remix_asks.person` | per day: `count(distinct …)`; all-time distinct |
| Sheet remixes asked for (remix-count branch) | `studio.sheet_remix_asks (fid, units, at)` | per day: `count(*)`, `sum(units)`, distinct people |
| Assistant questions | `studio.chat_calls (fid, at)` | per day: `count(*)`, `count(distinct fid)` |
| Agent approvals | `studio.piece_versions (approved_at, spent_usd)` | per day: approvals |

**Never shown:** who asked, any per-person count, any question or prompt text (questions aren't kept anyway).

## 3. Spend by kind

| Kind | Source (UTC day) | Shown per UTC day |
| --- | --- | --- |
| Assistant | `studio.chat_costs (day, kind, model, provider, guard, calls, cost_usd)` | calls and USD by `kind` (search, answer, guard) and model; flagged answers (`guard = 'flagged'`) |
| Images | `studio.image_costs (day, kind, model, provider, verdict, calls, cost_usd, funded)` | calls and USD by kind, verdict (`ok`, `blocked`, `nsfw`) and `funded` (free, prepaid); `reserved` shown separately (money in flight), not added to spend |
| Remix frames | `studio.remix_costs (day, funded, kind, model, provider, verdict, calls, cost_usd)` | same as images |
| Coach | `studio.coach_costs` (table from `supabase/drafts/0017`; read by `src/lib/make/limits.ts`; shown only if it exists) | USD per day |
| Agent frames and video tests | `studio.piece_versions.spent_usd` by `approved_at` (Pacific day; the one spend with a timestamp) | USD per day |

Query shape: `select day, kind, …, sum(calls), sum(cost_usd) … where day >= current_date - $days group by … order by day`.
The cost tables hold no person by design (0007, 0008, 0013). `piece_versions` does: only the daily sum is read.

## 4. Prepaid payments and balances (totals)

Source: `studio.wallet_payments (usd, token, credited_at)`, `studio.wallet_debits (usd, at)`,
`studio.wallet_credits (usd, reason, at)` (0011, 0022, 0027).

- Per Pacific day: payments (count, USD, by token), debits (USD), credits back (USD, by reason).
- Totals: USD paid, spent, credited back; **balance owed** (`sum(payments) − sum(debits) + sum(credits)` over all
  accounts); number of accounts holding a balance above $0.001 (a count, from a grouped subquery).
- **person-balance branch** (`studio.person_payments`, `person_debits`, `person_credits`): the same rows, as a second
  column "per-person balances", only when those tables exist.

**Never shown:** an account, address, transaction hash, any one balance or one payment's amount on its own row.

## 5. Published work (public rows)

Each row only what the public page already shows: thumbnail (own media only), title, **public byline**, date, link.

| List (newest first, 25 each) | Source and helper | Byline and link |
| --- | --- | --- |
| Character sheets and styles: newest versions | `studio.element_versions` × `studio.elements` (`element_type = 'design'`, `status = 'published'`); `listDesigns(sql, kind, 'new')` (`src/lib/images/designs.ts`) | `body.by_name` (as the sheet's page shows it); `/references/designs/<versionId>` |
| Remixes | the same rows with `remixedFrom` set (`studio.links kind = 'remixed_from'`), with the credit line `listDesigns` already builds ("remix of …", or "a remix" when the source is hidden) | as above |
| Images | `studio.elements` `element_type = 'image'`, `status = 'published'` | the image's byline as `/image/<id>` shows it |
| Scene versions | `studio.adaptation_versions` (not hidden) × `studio.adaptations`; `publicCatalogue()` (`src/lib/adaptation-pages.ts`) | `sceneHandleFor(person)`; `/adaptation/<id>/by/<handle>/v/<n>` |
| Remix frames | `studio.remix_frames` (not hidden): public to anyone with the link (Privacy §4) | `by_name`; `/remix/<id>` |
| Bases and their first remixes | `CHALLENGE.bases` (`src/lib/config.ts`; empty today) with `basesOf`; direct forks via `remixLines` (`src/lib/challenge/lineage.ts`) | each base's byline and link; its **first** direct remix (earliest), with byline and link; how many direct remixes (public: each is a public page) |

Per-day trend: published versions, remixes, images, scene versions, frames (counts).

**Never shown:** a hidden piece's maker or link, drafts, My picks, agent drafts ("only you can see them", Privacy §3),
prompts beyond what the piece's own page shows.

## 6. Remix challenge

Shown only while `CHALLENGE.entries` is on (same switch as `standing`).

| Row | Source | Shown |
| --- | --- | --- |
| Entries per character | `standing(sql)` (`src/lib/challenge/entries.ts`): `entries`, `entrants` | per character: entries, distinct makers (`entrants`, already public on `/challenge`); each entry's public row (byline, link) |
| Admins' versions | `standing(sql).byAdmins` | count, and their public rows, labelled "not eligible" as `/challenge` does |
| Eligibility at publish | `studio.challenge_eligibility (decision, eligible, account, checked_at)` | per Pacific day and per `account` (farcaster, bluesky; lens on the contest branch): counts by `decision` (`admin`, `invited`, `passed`, `below`, `unchecked`) |
| Sign-in check decisions | `studio.check_decisions (network, threshold, passed, decided_at)` (0034) | counts by network × passed, per day, and by `threshold` (the rule's name) |
| Marks | `studio.challenge_marks (character, marked_at)` | marks per day per character |
| Withdrawals (contest branch) | `studio.challenge_marks.withdrawn_at` | per day per character; only if the column exists |
| Where posted | `studio.version_posts (network, added_at)` | per day per network (public on each version's page) |

**Never shown:** any score (none is kept), the rule's numbers beyond its name, which person passed or failed, a person's
eligibility (P6q; `versionStanding` never shows it either), who marked what.

The page notes: `check_decisions` keeps a pass 90 days and a fail 24 hours, so its counts are decisions **still kept**,
not history; withdrawals on the remix-submit branch delete the mark, so they can't be counted there.

## 7. Safety

| Row | Source | Shown |
| --- | --- | --- |
| Reports | `studio.removal_log` `step = 'reported'` (`reason`, `at`) | per day: reports, by reason; open queue size (as `fullQueue` counts it) with a link to `/moderate` |
| Moderator and rule actions | `studio.removal_log` steps `hidden`, `unhidden`, `dismissed`, `moved_private`, `restored_public`, `erasure_approved`, `erased`, by `role` (`author`, `moderator`, `maintainer`, `rule`) | per day: counts by step × role |
| Hidden pieces | `studio.elements status = 'hidden'` by `element_type`; `adaptation_versions.hidden` by `hidden_role`; `remix_frames.hidden` and `storyboards.hidden` by `hidden_role`; `studio.seeded_hidden (hidden_at)` | totals and per day (where a time is kept: `hidden_at`); counts only |

**Never shown:** who reported (the `by_fid` of a `reported` row), reporters' notes (they stay in `/moderate`), which
moderator acted, a hidden piece's maker or link. Admin picks are left out: P5e allows reading `studio.admin_picks` only in
the pick code.

## 8. Per person

Only the public: a search box takes a name or handle and resolves it with `resolveHandle` (`src/lib/adaptation-pages.ts`),
then lists that person's published sheets, images, scene versions and frames (the lists of section 5, filtered by
maker) and their challenge entries (from `standing`). No private count, no sign-in time, no balance, no eligibility, no
reports made or received.

---

## Depends on unmerged branches

Each is read only when the first query finds it.

| Branch | Adds | Section |
| --- | --- | --- |
| `contest` | `challenge_marks.withdrawn_at` (`NEXT_challenge_daily`); `challenge_eligibility.account = 'lens'` (`NEXT_social_lens_challenge`); `sheet_remix_asks` | 6 withdrawals; 6 Lens counts; 2 |
| `remix-submit` | Withdraw **deletes** the mark (`NEXT_challenge_submit`): nothing to count; `sheet_remix_asks` (`NEXT_remix_count`) | 2 |
| `person-balance` | `person_payments`, `person_debits`, `person_credits` (`NEXT_person_balance`) | 4 |
| remix-count (`NEXT_remix_count`, on contest and remix-submit) | `sheet_remix_asks (remix, fid, units, slot, at)` | 2 |
| `supabase/drafts/0017` | `coach_costs` | 3 |

## Performance

No new index; none needed at the site's size. Indexes that serve these queries:
`chat_calls_at`, `check_decisions_decided_at`, `elements_type_status_created`, the cost tables' primary keys (lead with
`day`), `challenge_eligibility_person` and `challenge_marks_person` (lead with `challenge`), `links (to_version_id, kind)`.
Sequential scans, all on small tables: `image_asks`, `remix_asks`, `remix_frames` and `account_names` by time (their
indexes lead with the person), `removal_log` by `at`, `social_accounts`, `wallet_accounts`, the wallet tables'
totals, `adaptation_versions`. Each window is ≤ 90 days; each query is one grouped scan. `statement_timeout` 5 s inside
the transaction; without a database the route answers 503 "Not available here". If a scan ever
gets slow, the fix is an index migration (`NEXT_admin_activity_indexes.sql`), owner-applied; not proposed now.

## Gate and headers

- `GET /api/admin/activity`: `getFid` + `isAdmin`, else **404** (same body as `/api/challenge/view`), before the
  database is touched. Signed out, a wallet/Lens/Bluesky session, a bad token, a non-admin FID: all 404. Other methods:
  405 (no `POST` handler exists).
- `Cache-Control: private, no-store` on every answer from the route, the 404 included.
- `/admin/activity`: always the site's 404 page (status 404); `force-dynamic` so the response carries Next's
  `private, no-cache, no-store` header. If the test finds it doesn't, add a `headers()` entry in `next.config.ts`
  for `/admin/activity` (that touches `next.config.ts` headers, so the deploy then also needs `check:snap-live`).
- `robots: { index: false, follow: false }`.

## check:principles item: `P6aa`

P6's letters are all taken on main or a branch (P6a–P6z); `P6aa` is free everywhere. Name: "the admin activity page
answers 404 to anyone but an admin, is never cached, and returns no per-person private count".

- **Live (`--url`)**: `GET <url>/admin/activity` signed out → 404, `no-store`, and the body contains none of the
  dashboard's labels (a fixed list from `src/lib/admin-activity.ts`). `GET <url>/api/admin/activity` signed out and with
  a malformed bearer token → 404 and `private, no-store`.
- **Static**: the route file calls `isAdmin` and returns 404 before any `db()`/`sql` call; it has no `POST`/`PUT`/
  `PATCH`/`DELETE` export; `src/lib/admin-activity.ts` runs everything inside `begin('read only'`; it contains no
  `insert`, `update`, `delete`; no select there groups or filters by a person column of a private table
  (`fid`, `person`, `account_id`, `by_fid`, `author_person` in `image_asks`, `remix_asks`, `chat_calls`,
  `sheet_remix_asks`, `wallet_*`, `person_*`, `check_decisions`, `challenge_eligibility`, `challenge_marks`,
  `removal_log`, `account_names`, `social_*`) except inside `count(distinct …)`.
- **PGlite**: run `activityView` on the migrations with realistic rows for two people, then walk the returned JSON:
  no key named like `fid|person|account|address|tx|did|handle|by_fid|score` outside the public-row lists, and no value
  equal to a seeded private FID, address or DID.
- **Planted faults** (each must fail): the route without the `isAdmin` line; an answer without `no-store`; a query
  `select fid, count(*) from studio.image_asks group by fid`; `ActivityView` with a reporter's `by_fid`; an `insert`
  in the module.

## Tests: `npm run test:admin-activity`

PGlite with every migration, as `test:challenge` does (`@electric-sql/pglite`, the socket server):

1. Gate: the route handler with a stubbed `getFid` (null, a non-admin FID, an admin FID): 404, 404, 200; `no-store` on all three.
2. Read-only: the module's transaction refuses a planted `insert` (Postgres error 25006).
3. Optional pieces: with `withdrawn_at`, `sheet_remix_asks` and `person_*` absent, the sections are `null` and nothing
   errors; added, they appear.
4. Days: a row at 23:30 Pacific on Nov 4 (07:30 UTC Nov 5) counts on Nov 4; a cost row's UTC day stays as kept.
5. Totals: balance = payments − debits + credits on seeded rows; `reserved` is not added to spend.
6. Public rows only: a hidden sheet, a hidden frame and a hidden scene version are counted in section 7 and absent from
   sections 5 and 8; a reporter's FID appears nowhere.
7. The P6aa static and JSON walks on the real files.

Plus `npm run typecheck`, `test:challenge` (unchanged helpers), and after any deploy the live checks in CLAUDE.md.

---

## Privacy

What Privacy (`src/lib/legal.ts`, `PRIVACY`, origin/main) says now about who sees what:

- §2: "We use no advertising or analytics trackers and set no cookies. We do not sell data."
- §3: frames and video tests an agent makes on approval are saved "privately: only you can see them".
- §4 heading: "Kept by us when you sign in." Within it: likes, "Your individual likes are private; only totals are
  shown."; My picks are "seen only by you"; agent gaps are "shown to you on your You page, and to the site's owner, who
  reads them, with your name"; "How many images and Remix frames you make each day, to count the daily limits, and the
  reports you make."
- §5: questions are counted "Under your Farcaster ID … only how many questions you ask and when"; costs "only as daily
  totals, without your ID, to track our spending."
- §1: "Lum LLC … operates Snowmoon Party."

It never says who among "us" sees what is kept, and it says "only you" in two places. The dashboard doesn't contradict
it (it shows nothing per person that isn't public, and nothing the "only you" items hold), and it isn't a tracker (it adds
nothing kept). So a line isn't strictly required. But admins are more than the owner (`ADMINS` is two FIDs), and every
count in §4 and §5 is described by its purpose ("to count the daily limits", "to track our spending"), not "to run the
site". **Recommended**, one sentence, in §4 before "Deletions happen…":

> Before: *(nothing)*
>
> After: **"Our admins see totals of what we keep, to run the site."**

Not "never who did what": on a day when one person acts, a total is theirs (the residual §5's costs already carry).
It ships in the dashboard's own release (legal texts describe today), needs the owner's reread (P6k), and goes in the
dashboard branch's `legal.ts`, not here.

## Open questions

1. **P5b.** It fails any file that checks `ADMINS`/`isAdmin` and contains `order by` or `.sort(`. This design keeps the
   check in the route and the queries in `src/lib/admin-activity.ts`, which satisfies the check's letter. Its spirit
   (admin code changes nothing anyone else sees) holds: the dashboard is read-only and private. Should P5b name this
   page as an exception explicitly ("read-only admin views, time order only"), rather than pass by file layout?
2. **Withdrawals:** `contest` keeps `withdrawn_at`; `remix-submit` deletes the mark. Which merges decides whether
   withdrawals can be counted at all.
3. **"First remixes":** read here as each base's earliest direct remix. Or every first-generation remix of a base?
4. **Moderator actions:** counts by role only, not by which moderator. OK?
5. **Small counts:** show exact counts (a 1 is one person, unnamed) or "fewer than 3"? Exact is proposed.
6. **Privacy line:** add it (recommended) or not.
7. **0036's header** still says "NOT APPLIED" on main; the design doesn't depend on it (it checks for the column), but the
   eligibility-by-account counts need it.

## Principles

- **P5 (no canon; admin powers hide and pick only):** concern, see open question 1. The page publishes, orders and hides
  nothing; it leaves `admin_picks` alone (P5e).
- **P6 (who did what stays private; totals only; no third party):** pass by design: totals for every private table,
  public rows only per person, no outside request, no new kept data; `P6aa` checks it, with planted faults. Residual:
  one-person days.
- **P7 (payments never order or score):** pass: balances and spend are totals, ordered by day; nothing is sorted by money
  (P7a).
- **P1–P4, P8:** not touched (no publishing, no model call, no book text, no Minpentai).
- **New tension:** admins seeing totals isn't stated in Privacy; the drafted line closes it, pending the owner.
