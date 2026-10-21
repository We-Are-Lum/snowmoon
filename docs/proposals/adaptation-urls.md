# Adaptation URLs and scene pages

**Status: draft, 2026-10-17. Nothing is live.** The pages are built on branch `adaptation-pages`
and switched off on production (`ADAPTATION_PAGES.live = false` in `src/lib/config.ts`) until the
owner says "publish". Migration `0012_adaptations.sql` is written and tested in memory, **not
applied**. All page wording is a draft.

From the owner's spec of 2026-10-17 and the owner's mockup (boards "1 · Scene page" and
"8 · Phone: watch").

## Principles

Tensions first. Each needs the owner's ruling where it says **Decide**.

1. **Principle 5 forbids "featured" (conflict, worked around).** P5 says nothing is marked canon,
   official or *featured*, and `P5a` fails on that word in any migration or UI string. The spec's
   "featured" table and the "Feature it on my page" checkbox would fail it. So, in code and on
   screen, a person's page shows their **chosen version** (the mockup's own words: "@naaate's
   chosen version"); the table is `studio.adaptation_pages`; the checkbox is **"Show it on my
   page"**. Same behaviour, and `P5a` passes. In this document "featured" means the owner's term.
   **Ruled (owner, 2026-10-17):** keep "chosen version"; P5 stays as is.
2. **`/<id>` makes one person's choice the default (P5 review question).** `/1` sends everyone to
   the root owner's chosen version. P5 asks "does any default reflect a person's choice rather than
   a stated rule?" The stated rule here is "`/<id>` is the page of the person who started it",
   which is a rule, but in effect the starter's cut is what a bare link shows.
   **Ruled (owner, 2026-10-17):** `/1` goes to the owner's chosen version (as built).
3. **Looking up the name on each request (P6, privacy, caching, rate limits).** `/@naaate/1` asks
   Farcaster's public API (`api.farcaster.xyz/v2/user-by-username`, the service the site already
   uses for bylines) for the FID. It runs on our server only, so the visitor's browser makes no
   third-party request (P6a), and it sends only the name in the URL, nothing about the visitor.
   Cached in memory for an hour (an unknown name, five minutes), so a rename shows within the hour.
   The cache is per server instance and is lost on a cold start; Farcaster publishes no rate limit
   for this API that we found, so a crawl of many names could be throttled. When Farcaster doesn't
   answer, we fall back on names we have seen (below). Farcaster is already named on the Privacy
   page; it may want one line saying names in links are looked up there.
4. **A record of names (privacy).** To redirect after a rename, the site keeps
   `studio.account_names` (name → FID), written only when someone signs in or publishes, never on a
   page view (owner, 2026-10-17: viewing /@someone/1 stores nothing about a person who never used the site).
   That keeps a name someone has since left behind. **Ruled (owner, 2026-10-17):** private, used
   only to redirect. Built: no public read policy, and select revoked from anon and authenticated;
   only the server's writer role reads it.
5. **Names change hands.** If @bon renames and someone else takes "bon", `/@bon/1` becomes the new
   holder's page (usually "Nothing here yet"). This comes with name-based links. Fixed links are
   safer: `/@<anyone>/1/v/<n>` redirects to the version's author under their current name, so
   `/v/<n>` links survive renames and reassignment.
6. **Wallet accounts.** **Ruled (owner, 2026-10-17):** `/@<full 0x address>/<id>`. A 42-character
   address can't be a Farcaster name (16 at most), so it never clashes. Built: the address in
   lowercase; a checksum-case address redirects to it. The address is already public as the
   account's byline (shortened). Still open: a FID with no fname has no `/@` URL yet.
7. **Slugs.** **Ruled (owner, 2026-10-17):** words after the id redirect to the current title's
   slug, so `/@naaate/1-the-real-ending` goes to `/@naaate/1-fifteen-days`, and a link made before
   a retitle follows the new title. A bare `/@naaate/1` stays bare. Fixed `/v/<n>` links take no words.
8. **What "hidden" means.** A version is hidden by its author, or by a moderator (P5: moderators
   can hide and nothing else). Hidden is not deleted: versions are append-only, only `hidden`
   changes. A hidden version is not publicly readable (RLS), its page and fixed link say "Nothing
   here yet", and a page that chose it falls back to the person's latest public version under that
   root, else "Nothing here yet". Erasure is separate (`docs/removal.md`).
9. **Recipes (P1).** Every published generated asset needs a public recipe with its exact prompt.
   **Ruled (owner, 2026-10-17):** version 1's recipe link is the scene's recipe folder on main,
   `https://github.com/We-Are-Lum/snowmoon/tree/main/adaptations/fifteen-days`. It loads only once
   `scenes-sound` is merged, so checking that it loads is part of going live.
10. **AI declared where it appears (P2).** Under the player, the version's `ai_label`. Seeded from
    **Ruled (owner, 2026-10-17):** "Pictures: AI-generated, not by the author · Voices: @naaate's performances, AI-converted." It keeps P2b's
    standard wording, so the check needs no exception. No watermark claims.
11. **Spoilers.** The seed brief says spoilers through chapter 19 (beat 6's on-screen line), and
    the page shows that. The seed pages in `/adaptations` keep the piece behind a "Show the
    adaptation" gate; this page shows the player straight away, as the mockup does.
    **Ruled (owner, 2026-10-17):** no spoiler gate for Sunday.
12. **P4 (a signed-in action publishes).** The publish route (later) will require a signed-in FID
    or wallet (`getPerson`), like every write route. For Sunday there is no publish route: the
    owner's version is a static entry and a seed row.
13. **P6a (no third-party requests).** The player plays only files on `snowmoon.party` or its
    subdomains (`ownMedia` in `src/lib/adaptation-pages.ts`); any other URL is treated as not
    published. The page loads nothing from elsewhere (checked in a browser at 390 and 1440 px).
14. **P7.** Nothing here involves payment.

Checks run on this branch: `typecheck`, `test:db` (314, including 0012), `test:render`,
`check:adaptations`, `check:tokens`, `check:intro`, `test:images`, `test:wallet`, `test:chat`,
`test:chat-route`, the Minpentai tests, and `check:principles` against a local build (P5a passes).
`check:principles` P6a fails locally only because it treats `media.snowmoon.party` as third-party
when the site is `localhost`; `test:glossary` fails on `main` too.

## Tables (migration 0012)

People are person numbers, as in the image tables: a FID, or minus a wallet account's id.

| Table | Columns | Rules |
|---|---|---|
| `studio.adaptations` | `id` (assigned; 1 = Fifteen Days), `owner_person`, `title`, `created_at`, `updated_at` | Title can change |
| `studio.adaptation_versions` | `id`, `adaptation_id` (the root), `parent_version_id`, `author_person`, `recipe` (jsonb), `created_at`, `hidden` | Append-only except `hidden`; the parent must be a version of the same root (composite foreign key), so forks of forks stay under it |
| `studio.adaptation_pages` | `person`, `adaptation_id`, `version_id`, `updated_at` | One row per (person, adaptation); the version must be under that root. The spec's "featured" |
| `studio.account_names` | `fname`, `person`, `seen_at` | Names seen, for rename redirects |

RLS as in 0001 and later: public read of what is published (versions only when not hidden; a
page row only when its version is not hidden); `studio_writer` reads, inserts and updates; nobody
deletes; anon and authenticated can't write. Seed: adaptation 1, "Fifteen Days", owner FID 6786
(@naaate, `SYSTEM_FID`); version 1 by 6786 with a placeholder recipe; the owner's page at version 1;
the name "naaate".

`recipe` holds at least `video_url`, plus `poster_url`, `recipe_url` (the full recipe: prompts,
models, hashes), `ai_label`, `after_chapter`, `spoilers_through` (`VersionRecipe` in
`src/lib/adaptation-pages.ts`).

## Routes

| URL | What |
|---|---|
| `/@<fname>/<id>[-slug]` | That person's chosen version of root `<id>`. The slug is ignored |
| `/@<fname>/<id>/v/<n>` | Version `<n>`, fixed. Redirects to its author's name if another name is used |
| `/<id>` | 307 to `/@<owner>/<id>`, the root owner's page |

**Next.js and `@`.** In the App Router a folder named `@something` is a parallel-route slot, so
`src/app/@[fname]` can't be used. `next.config.ts` rewrites the public URLs to internal ones:
`/@:handle/:id` → `/adaptation/:id/by/:handle`, `/@:handle/:id/v/:n` →
`/adaptation/:id/by/:handle/v/:n`, and `/:id(\d{1,9})` → `/adaptation/:id` (a redirect handler).
Rewrites run after the app's own pages and files, so nothing existing is shadowed.

**Collisions.** None today: no top-level route or public file is all digits, and nothing else
starts with `@`. From now on, all-digit top-level paths are reserved for adaptations. The internal
`/adaptation/…` paths also answer directly; their canonical link points at the `/@` URL.

**Resolving a name, on each request** (`resolveHandle`):

1. Ask Farcaster for the name's FID (cached). Found: that person. A different spelling (case)
   redirects to Farcaster's spelling.
2. Not found, but we saw this name on a FID before: ask Farcaster for that FID's name now; if it
   changed, redirect to `/@<new name>/…`. If Farcaster didn't answer, use the name we saw.
3. A full `0x` address (40 hex digits): the wallet account with that address (lowercase; other case redirects).
4. Otherwise 404.

**What a page shows** (`shownVersion`): the version in the person's `adaptation_pages` row, if
public; else their latest public version under that root (forks of forks included); else
"Nothing here yet".

## Choosing what your page shows

- A person's first published version under a root is shown on their page automatically.
- Publishing has a **"Show it on my page"** checkbox, ticked by default on someone's first fork,
  unticked after that. Ticked: their page row points at the new version. Unticked: the row stays.
- Note: with the fallback rule, unticking it on a first publish changes nothing (with no row, the
  page shows their latest public version, which is this one). *Decide:* show it ticked and
  disabled on a first publish, or let a first publish leave the page on "Nothing here yet".
- Later: a page may show someone else's version (the table already allows it; the publish flow
  doesn't offer it yet).

The publish flow itself is not built. It will be a signed-in route that inserts the version, then
upserts `adaptation_pages` when the box is ticked, in one transaction.

## The scene page

From the mockup, in the site's tokens and floors (Crimson Pro and DM Mono only; the mockup's
Instrument Sans helper lines are set in Crimson Pro, since the site keeps Instrument Sans for
Veridian screens and `check:ui` fails on it in chrome). Left out of the mockup: the prototype
banner, the sample account, the shot strip and grid, "Fork this shot", "Re-voice", forks list,
Review, the synopsis (whose words it is isn't recorded; P2).

- The player (or "The video is not published yet."), version and date, the AI label.
- `snowmoon.party/@naaate/1 · @naaate's chosen version` (on a fixed page: `…/v/1 · this version,
  fixed`), "A scene after chapter 14", the title, "Spoilers through chapter 19".
- Book, Adaptation, Licence, Recipe.
- **SHARE**, the main button: opens a panel with "Always @naaate's latest chosen version", the
  `/@naaate/1` link, **COPY LINK**, and **CAST IT** (inside the Farcaster app, the cast composer
  with the link attached, `sdk.actions.composeCast`; on the website, Farcaster's compose page, as
  the site's other Cast buttons do). Under a rule: "This exact cut, never changes:
  `/@naaate/1/v/1`" with its own **COPY LINK**.
- **FORK**: for now, the repository's README, "How to fork". Later: the editor on this version.
- **MAKE YOUR OWN · SOON**: shown, `aria-disabled`, dashed, does nothing.
- Phone: player edge to edge; SHARE and FORK side by side; the share panel under them; MAKE YOUR
  OWN under that.
- The cast embed (`fc:miniapp`) opens the page in the app, with the version's poster when there is
  one.

## Sunday minimum, and later

**Built for Sunday:** `/@naaate/1`, `/@naaate/1/v/1`, `/1`, the buttons above, the README section,
the migration (not applied), and a static fallback so all of it works with no tables.

**Placeholders:** version 1's `video_url`, `poster_url` and `recipe_url` (null), in
`src/lib/adaptation-pages.ts` (`STATIC`) and in the 0012 seed. The AI label and "A scene after
chapter 14" are drafts.

**Later:** the publish flow and its checkbox; showing other people's forks; the editor behind
FORK and MAKE YOUR OWN; a list of forks; hiding from the page; wallet and no-name URLs (6 above).

## How it switches to the database

`src/lib/adaptation-pages.ts` asks the 0012 tables first. With no database connection (local,
previews), or while the tables don't exist (Postgres error 42P01), it uses `STATIC`, which holds
the same rows as the seed. Once 0012 is applied, the tables answer and `STATIC` is no longer read;
nothing else changes. To publish the cut after that, insert version 2 with the real URLs and point
the owner's page row at it (versions are append-only), or, before applying 0012, put the URLs
into the seed and `STATIC`.

## To go live (on the owner's "publish")

1. Real `video_url` (on `media.snowmoon.party`) and `poster_url`.
2. Apply 0012 (dry run first), or ship on `STATIC`.
3. `ADAPTATION_PAGES.live = true`.
4. Add `/@naaate/1` to the pages `check:principles` P6a loads, and its AI label to P2b.
5. Rulings on the **Decide** items above.
