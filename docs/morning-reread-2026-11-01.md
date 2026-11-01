# Morning reread, 2026-11-01

**DRAFT.** Written overnight by the coding agent (Anthropic's Claude, a closed model) for the owner. Nothing here is
merged, applied, published or deployed, and no branch was changed: every check below ran on a temporary local copy,
which was then removed.

It covers every branch waiting on your reread, in the order the **6 Nov remix challenge** launch needs them. It
replaces `reread-pack-2026-10-30.md` and `morning-sitting-2026-10-31.md` (on `next-version`): since those, main has
taken phase2-admin (#77, 0030), no-token (#73), the support pages (#71, #76, #80, #82, #83, #84) and the mint contract
(#85). Main is at `e4d866e`.

**How to answer.** One line per block, e.g. "1: reread", "2: reread part 1, applied". Then I merge one at a time,
with the live checks after each (CLAUDE.md).

**How to paste a migration.** In the Supabase SQL Editor, as `postgres`, one block at a time:
1. the **dry run** (ends in `rollback;`): no error;
2. the **migration** (ends in `commit;`);
3. **read-back (a)**: one SELECT; every row's `ok` is `true`;
4. **read-back (b)**: one `do $$ … $$;` block; it finishes with no error (a notice says "READ-BACK PASSED"). It adds a
   realistic row, checks it, and deletes it; on any problem it stops with "READ-BACK FAILED: …" and keeps nothing.

The SQL Editor runs each statement on its own, and `postgres` there can't `SET ROLE studio_writer`, so every read-back
here is in these two parts. Three branches still have the old form (`set role`, `begin … rollback` with several
selects); their two-part versions are written **here only**, not on the branches.

**Numbers.** Main's last migration is `0030_admin_picks.sql`, applied on production (checked: `studio.admin_picks` and
`studio.seeded_hidden` exist). Merged in this doc's order, the `NEXT_` migrations become:

| Order | Branch | Migration | Number |
|---|---|---|---|
| 2 | agent-pictures | `NEXT_agent_pictures.sql` | **0031** |
| 3 | social-read | `NEXT_social_read.sql` | **0032** |
| 6 | signin-lens-bluesky | `NEXT_signin_lens_bluesky.sql` | **0033** |
| 7 | remix-challenge | `NEXT_remix_challenge.sql` | **0034** |

Any other order: they number in the order merged. (Three other branches also hold `NEXT_` migrations, not in this
doc: see "Other branches found".)

---

## At a glance

| # | Branch | Reread | Migration | Switch | Onto today's main | Tests on the rebased copy |
|---|---|---|---|---|---|---|
| 1 | dashboard-rename | 3 legal sentences + ~25 non-legal lines | none | none | rebases clean | tsc ✓, principles ✓ (P6d only); **build fails** (4 pages main added still import `/you/you.css`); with that 4-line fix: you-page 74 ✓, agents 185 ✓, agent-api 25 ✓ |
| 2 | agent-pictures (Plan A 1 + 2) | Privacy §4, §7, Terms §6b | 0031 | **none between part 1 and part 2** | rebase stops (add/add in `content/snowmoon/references.json`); **a merge of main is clean** | on the merged copy: tsc ✓, principles ✓ (P6d only), chat-make 21 ✓, chat 91 ✓, chat-route 9 ✓, agent-api 30 ✓, db-limits 5 ✓, build ✓, agents 211 ✓ |
| 3 | social-read | Privacy §6, §7, Terms §7, About | 0032 | `SOCIAL_READ.show` (off) | **conflicts** (rebase and merge): `docs/principles.md`, `scripts/check-principles.ts`, `src/app/about/page.tsx` | not run (conflict) |
| 4 | (none) | | | | | |
| 5 | routing C (on agent-pictures) | Privacy §5, §7, the notice, About | none | `CHAT.make.enabled` (off) | as 2 | as 2 |
| 6 | signin-lens-bluesky | 2 live lines + Privacy §3, §4, §6, §7, Terms §4, §5 | 0033 | `SIGN_IN_METHODS` lens/bluesky (off); **sign-in-as-equals has none** | **conflicts** (rebase and merge): `src/app/api/images/status/route.ts`, `src/lib/config.ts` | not run (conflict) |
| 7 | remix-challenge | Privacy §4, §6, §7, Terms §6d, §7; /challenge copy | 0034 | `CHALLENGE.entries`, `.posts` (off); `/challenge` and share buttons have none | rebases clean | tsc ✓, principles ✓ (P6d only), test:challenge 198 ✓ |

"principles ✓ (P6d only)": `check:principles` static, every check passes but P6d, the accepted open item.
`check:ui` wasn't run (the other overnight tasks hold its lock).

## What the 6 Nov launch needs, and what blocks it

- **remix-challenge merged before Fri 6 Nov 09:00 PT**, with its reread (at least L1, which opens sheets to everyone
  in the window) and 0034 applied (for entries and "Posted on"). It doesn't depend on any other branch's code.
- **Starting sheets on production.** There are none today: on merge, /challenge would say "No sheet of Zei is
  published yet." for five characters (Gladias is held). Option A or B and the seeding `--apply` are yours (block 7).
- The other branches don't block the launch. They come first in this order because they're older and smaller; if
  time is short, remix-challenge can merge on its own (it merges cleanly with main), and the others' legal lines then
  combine with its lines (see "Clashes").

## Clashes between branches (whichever merges second must adjust)

- **Principle ids.** social-read adds `P5f` and `P6p`; main already has a different **P5f** (seeded hide, from
  phase2-admin), and signin-lens-bluesky also adds a different **P6p**. remix-challenge adds `P5g` and `P6q`. So
  social-read's P5f needs a new id (P5h if remix merges first) and one of the two P6p's needs another (P6r). This is
  what social-read's conflict with main is.
- **Terms §6d.** remix-challenge adds §6d "The remix challenge."; the approved minpentai-agent-play draft (v4) also
  adds a §6d. Whichever merges second becomes §6e.
- **Privacy §7, near Neynar.** social-read (a Neynar sentence and a Bluesky item), signin-lens-bluesky (Lens and
  Bluesky items) and remix-challenge (a Neynar sentence and a "Bluesky and Lens" item) all write here: up to three
  Bluesky mentions. Combine at the second merge.
- **Privacy §7, Groq item.** Plan A part 2 adds "(or approve from your agent's drafts)"; routing C adds a sentence.
  Both are drafted from today's text; merged, the item carries both.
- **Privacy §4 "Images you publish…".** signin-lens-bluesky rewrites it ("… Lens username or Bluesky handle");
  remix-challenge anchors three new items after it.
- **Terms §7.** social-read and remix-challenge each add one sentence.
- **"You page" → "Dashboard".** Once dashboard-rename is in, every later legal line must say "Dashboard": Plan A
  part 1's two sentences, the `log_gap` description on agent-pictures, signin's Privacy §4 link item, and signin's
  Bluesky return page ("Go to your page" links to `/you`, which then redirects).
- **Code, in this order:** dashboard-rename then agent-pictures conflict in `src/lib/agents/edits.ts` and
  `src/lib/agents/tools.ts` (both change the same replies and descriptions); signin-lens-bluesky then also conflicts in
  `scripts/check-ui.ts` and `src/components/app-shell.tsx`. remix-challenge stays clean on top of all of them.

---

## 1. dashboard-rename: "You page" becomes "Dashboard"

Branch `dashboard-rename` (`9747da3`, 4 commits). `/you` becomes `/dashboard`; the old addresses redirect. No
migration, no switch. `legal.ts` is untouched; the legal lines go in at merge.

### Legal (reread)

Main's texts say "You page" three times; the branch's own draft lists only the first two (the 2026-10-30 pack added
the third). All three "Before" lines checked word for word against main today.

| # | Where | Before | After |
|---|---|---|---|
| 1.1 | /terms §6b, 2nd paragraph, last sentence | "If it gets out, disconnect it on your You page." | "If it gets out, disconnect it on your Dashboard." |
| 1.2 | /privacy §4, wallet-link item, last sentence | "You can unlink it on your You page." | "You can unlink it on your Dashboard." |
| 1.3 | /privacy §4, agent paragraph | "That record is shown to you on your You page, and to the site's owner, who reads them, with your name, to decide what to build next." | "That record is shown to you on your Dashboard, and to the site's owner, …" (rest unchanged) |

The branch's optional Privacy §6 sentence (the public profile) isn't needed: the profile's new "Pictures" list is
behind consent v5's switch (`PROFILE_LISTS_REMIXES`), off.

### What else a visitor or an agent sees change (not legal)

| # | Where | Before | After |
|---|---|---|---|
| 1.4 | Top-bar avatar (`app-shell.tsx`), its label and tooltip | "You: ‹name›"; "You: your account, wallet and work" | "Dashboard: ‹name›"; "Dashboard: your account, wallet and work" |
| 1.5 | The page's tab title (`src/app/dashboard/page.tsx`) | (the /you page) | "Dashboard" |
| 1.6 | Owner's image review crumb | "You · Images" link to /you | "Dashboard · Images", link to /dashboard |
| 1.7 | Public profile `/@name`, empty | "Nothing published here yet." | "Nothing published yet." |
| 1.8 | MCP server instructions (every agent reads them first) | "…nothing you make is public until they publish it from their You page." / "…your person approves the spend on their You page." | "…from their Dashboard." / "…on their Dashboard." |
| 1.9 | Tool descriptions: `try_frame`, `request_video_test`, `log_gap` | "…their You page shows the estimate…" / "…is shown on their You page…" / "It shows on their You page and to the site's owner…" | "…their Dashboard shows…" / "…on their Dashboard…" / "It shows on their Dashboard…" |
| 1.10 | Tool replies | "Waiting for your person to approve about $X on their You page; nothing is spent before." / "…to your person on their You page, under "What your agent couldn't do"…" / "…disconnect one on your You page first" | "…on their Dashboard…" (each) |
| 1.11 | agents.md (6 lines, plus 2 new) | "…until they say so on their You page" etc. | "…on their Dashboard (snowmoon.party/dashboard)"; new: "Your person makes the key on snowmoon.party/dashboard → Agents → "Make an agent key"." and "3. Tell your person what's waiting for them on snowmoon.party/dashboard." |
| 1.12 | Agent connect screen (read before Allow; not a recorded consent) | "…(you publish its drafts from your You page)…" / "…your You page shows the estimated cost…" / "Disconnect it on your You page at any time…" | "…from your Dashboard)…" / "…your Dashboard shows…" / "…on your Dashboard…" |
| 1.13 | Wallet sign-in hint | "Have a Farcaster account? Link this wallet to it on your You page." | "…on your Dashboard." |

Every line in 1.8 to 1.13 is listed one by one in `reread-pack-2026-10-30.md`, item 4.

### Rebase test

Rebases onto main with no conflict. tsc passes; `check:principles` 54 of 55 (P6d only). **But the build fails**:
main added four pages since the branch was cut that import the old stylesheet path, which the branch moved:

```
./src/app/admin/review/chapter/[n]/page.tsx  Module not found: Can't resolve '../../../../you/you.css'
./src/app/admin/review/page.tsx              Module not found: Can't resolve '../../you/you.css'
./src/app/admin/review/term/[slug]/page.tsx  Module not found: Can't resolve '../../../../you/you.css'
./src/app/support/page.tsx                   Module not found: Can't resolve '../you/you.css'
```

So `test:you-page` (it builds) and `test:agents` (it needs a build) fail as is. With those four imports pointed at
`dashboard/you.css` in the temporary copy only: `test:you-page` 74 of 74, `test:agents` 185, `test:agent-api` 25 of 25.
The branch needs that fix (a merge of main plus four one-line changes) before it merges; tsc can't catch it.
No other `/you` link or "You page" is left in main's newer code, apart from the three legal lines above.

### Decisions owed

- Reread 1.1 to 1.3, and the non-legal lines (all, or name one).
- OK for me to add the four-import fix to the branch before merging?

---

## 2. agent-pictures: Plan A part 1 and part 2

Branch `agent-pictures` (`b4fbb3d`, 14 commits). It also holds routing C (block 5). **There is no switch between part
1 and part 2: merging the branch ships both** (part 2's picture tools appear to every invited agent). The 2026-10-31
sitting said "Part 2 merges after part 1"; that needs part 2 split off or held behind a switch, or both reread
together. `legal.ts` is untouched; every "Before" below matches main word for word.

### Part 1: agents' draft notes, the failure log, read tools

| # | Where | Before | After |
|---|---|---|---|
| 2.1 | /privacy §4, agent paragraph, added at its end | (ends) "…It is never published." | "Your agent may also draft notes: on your own drafts, on your published work, or on work others have published. A note it drafts stays private, shown to you on your Dashboard and to the site's owner, and appears publicly only if you publish it and the work it is on is published. When one of your agent's tools refuses or fails, we record which tool, when and why (the message your agent was given, with anything it sent taken out) and the names of what it sent, never what it sent. That record is shown to you on your Dashboard and to the site's owner, with your name, to find and fix what went wrong. It is never published." (The branch's draft says "You page" twice; shown here with "Dashboard", as dashboard-rename goes first.) |
| 2.2 | Dashboard, new section (when there are failures) | (none) | "What your agent tried that didn’t work" — "Each time one of your agent’s tools said no or broke: the tool, why, and what it sent (the names only, never your words). The site’s owner sees these too." Kinds: "refused what was sent" / "not allowed or over a limit" / "broke on our side" / "took too long"; "sent: ‹argument names›" |
| 2.3 | Your Dashboard (owner only), two new sections | (none) | "What people’s agents tried that didn’t work" — "Only you and each person see these: the tool, why it failed, and the names of what was sent."; "Notes agents drafted that aren’t published" — "Only you and each note’s person see these, including notes on drafts." |
| 2.4 | `leave_note` description (agents) | "Draft a note (up to 500 characters) on a published version. It is labelled as from an agent, and is public only after your person publishes it. …" | "Draft a note (up to 500 characters) on a version: a published one, or one of your person's own drafts (list_my_work). It is labelled as from an agent and stays private (your person and the site's owner see it); it is public only after your person publishes it, on a published version. …" |
| 2.5 | `leave_note` refusal | "notes go on published versions; no published version with that id" | "no version with that id that your person can see (list_my_work lists their drafts and published work)" |
| 2.6 | New read tools `get_glossary`, `get_sheet`, `get_references` | (none) | get_sheet's reply labels the look "Invented by this edition as a starting point where the book is silent; not the book."; get_references labels pictures "AI-generated image, not by the author" |
| 2.7 | `get_passage` and other read refusals | "at most N blocks at once"; "no such adaptation"… | each adds a "Next: …" hint (e.g. "Next: search_book finds the chapter a passage is in.") |
| 2.8 | New tool `set_camera` | (none) | "Draft a camera and staging change for a shot of your person's own version, in words… "tilt down 20°"… "closer", "wider", "higher", "lower"… Free: then try_frame draws a frame from it, which waits for their approval." Shown on the draft as "Camera: tilt down 20°, closer, 2 moved" |
| 2.9 | Reply after try_frame / request_video_test | "Waiting for your person to approve about $X on their You page; nothing is spent before." | "Saved as a private draft; nothing is made or spent yet. Next, your person taps Make it on their dashboard (about $X): that makes the frame/video privately, inside the draft, seen only by them. Publishing or using it is a separate step, Keep, which only your person can take." |
| 2.10 | Reply after a free edit | "Waiting for your person to keep it." | "Saved as a private draft. Keep, which only your person can take, is the separate step that uses it." |

### Part 2: agent pictures (draft_picture, draft_sheet, draft_place, draft_style, match_request)

| # | Where | Before | After |
|---|---|---|---|
| 2.11 | /privacy §4, agent paragraph, first two sentences | "If you use an agent here (for now, only people the site has invited): the edits it drafts for your own scene versions (a new frame, another voice take, a shot's timing, who speaks in a shot, a video test), each with the note it was drafted from. A frame or video test you approve is kept with what it cost, the model and the pictures sent, privately and only for you." | "…each with the note it was drafted from; and the pictures it drafts for you (a picture of a moment, a shot, a reference or a glossary word; a character sheet; a place; a new style and its sample), each with what it is for, the style you chose, and its prompt, showing whose words each part is. A frame, video test or picture you approve is kept with what it cost, the model, the prompt and the pictures sent, privately and only for you, until you publish or discard it." |
| 2.12 | /privacy §7, Groq item | "Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make, which are checked against the published rules." | "…and the prompts for images you make (or approve from your agent's drafts), which are checked against the published rules." |
| 2.13 | /privacy §7, fal.ai item, first clause | "fal.ai receives the prompt for an image you make, and any pictures sent with it…" | "fal.ai receives the prompt for an image you make (or approve from your agent's drafts), and any pictures sent with it…" (rest as today) |
| 2.14 | /terms §6b, 1st paragraph | "…(a new frame or a video test)… A frame counts like any other Remix frame: on a Farcaster account it uses your free frames for the day; on a wallet account…" | "…(a new frame, a video test or a picture)… A frame counts like any other Remix frame, and a picture like any other picture you make: on a Farcaster account it uses your free frames or pictures for the day; on a wallet account it's charged to your balance at the price shown (section 6a). Video tests are paid by us for now." |
| 2.15 | Reply after a picture draft | (none) | "Saved as a private draft; nothing is made or spent yet. Next, your person taps Make it on their dashboard (up to $X): that makes the picture privately, inside the draft, seen only by them. Publishing it is a separate step, Keep, which only your person can take." |
| 2.16 | Dashboard, a picture/sheet/place/style draft | (none) | Button "Make it (up to $0.0XX)" (wallet: "Make it · $X from your balance"); card "‹name›, for the book, c4-b70 / shot S of adaptation A, version V / the character reference “zei” / the glossary term “…”, in the style “‹name›” (‹by›)."; alt "AI-generated image, not by the author: ‹title›"; Recipe rows, each prompt part with who wrote it; refusals "Making images is switched off for now." / "Making images is not set up here." / "The price of this picture has changed. Ask your agent to draft it again." |
| 2.17 | New tool descriptions and refusals | (none) | e.g. "style is required: ask your person which style they want (offered: …); don't choose one for them"; "No real people: the prompt names someone on the blocked list." |
| 2.18 | `match_request` reply when nothing makes it | (none) | "Tell your person plainly that no tool can make ‹a comic / a video or film of the book / music or sound / this› yet, and that you've passed their request to the site's owner. Then offer what you can do instead." |
| 2.19 | `log_gap` description | "…It shows on their You page and to the site's owner…" | "…record it before you answer: … (match_request does this for you when nothing makes what they want). It shows on their You page…" (still "You page": conflicts with dashboard-rename's change to the same line) |

### Migration: NEXT_agent_pictures → 0031

Adds `studio.agent_failures` (append-only for the site) and four new kinds of piece (`picture`, `sheet`, `place`,
`style`). Needs 0019 (agents).

**Production, read-only (as studio_writer):** `studio.agents` (id uuid, person bigint, name text, created_at
timestamptz) and `studio.pieces` (id uuid, kind text, person bigint, title text) exist with those types;
`studio.agent_failures` doesn't exist yet; today's `pieces_kind_check` is the six kinds of 0019; the 6 existing pieces
are all `character`, so they fit the new check; 5 agents to test with; pieces' only required columns are kind, person
and title.

**The branch's read-back uses the old form** (`set local role studio_writer`, `begin … rollback`, several selects).
The two-part version below is new (here only). **PGlite, on every main migration plus this one: (a) 10 of 10 true;
(b) passes, twice in a row (nothing left behind); (a) shows false with a planted `grant update`; (b) raises with a
planted check that refuses its row.**

Dry run:

```sql
-- NEXT_agent_pictures (numbered at merge). Branch agent-pictures, owner 2026-10-25. DRAFT: the owner pastes it in the
-- Supabase SQL Editor; nothing here is applied by the coding agent.
--
-- 1. studio.agent_failures: every agent tool call that failed (the person's agent couldn't do it), so the person and
--    the owner can see what agents ran into (step 0). What is kept: who, which agent, which tool, the kind of failure,
--    the message the agent was given (or the error's code), and the names of the arguments sent, never their values
--    (they can hold the person's words). Private like agent_gaps: the person sees their own on /you, the owner all.
-- 2. studio.pieces.kind: four new kinds of draft made by the site's own pipelines on the person's approval:
--    'picture' (a book moment, Pictures' pipeline), 'sheet' (a character sheet), 'place' and 'style' (designs).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0019 (agents).
-- THIS IS THE DRY RUN: it ends in rollback;, so nothing is kept. Then paste NEXT_agent_pictures.sql (ends in commit;). Read back after: READ-BACK-agent_pictures.sql.
-- One transaction: all of it or none. Additive and safe to run twice.

begin;

create table if not exists studio.agent_failures (
  id uuid primary key default gen_random_uuid(),
  person bigint not null check (person <> 0),
  agent_id uuid not null references studio.agents(id),
  agent_name text not null,
  tool text not null check (char_length(tool) between 1 and 80),
  kind text not null check (kind in ('input', 'error', 'timeout', 'refused')),
  message text not null check (char_length(message) between 1 and 1000),
  arg_names text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists agent_failures_person on studio.agent_failures (person, created_at desc);

alter table studio.agent_failures enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'agent_failures' and policyname = 'writer_all') then
    create policy writer_all on studio.agent_failures for all to studio_writer using (true) with check (true);
  end if;
end $$;
-- Nothing for anon and authenticated; the site (studio_writer) may only read and add rows: append-only.
revoke all on studio.agent_failures from anon, authenticated, studio_writer;
grant select, insert on studio.agent_failures to studio_writer;

alter table studio.pieces drop constraint if exists pieces_kind_check;
alter table studio.pieces add constraint pieces_kind_check
  check (kind in ('idea', 'storyboard', 'frames', 'character', 'image', 'edit', 'picture', 'sheet', 'place', 'style'));

rollback;
```

Migration:

```sql
-- NEXT_agent_pictures (numbered at merge). Branch agent-pictures, owner 2026-10-25. DRAFT: the owner pastes it in the
-- Supabase SQL Editor; nothing here is applied by the coding agent.
--
-- 1. studio.agent_failures: every agent tool call that failed (the person's agent couldn't do it), so the person and
--    the owner can see what agents ran into (step 0). What is kept: who, which agent, which tool, the kind of failure,
--    the message the agent was given (or the error's code), and the names of the arguments sent, never their values
--    (they can hold the person's words). Private like agent_gaps: the person sees their own on /you, the owner all.
-- 2. studio.pieces.kind: four new kinds of draft made by the site's own pipelines on the person's approval:
--    'picture' (a book moment, Pictures' pipeline), 'sheet' (a character sheet), 'place' and 'style' (designs).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0019 (agents).
-- Dry run first: NEXT_agent_pictures.DRY-RUN.sql (the same, ending in rollback;). Read back after: READ-BACK-agent_pictures.sql.
-- One transaction: all of it or none. Additive and safe to run twice.

begin;

create table if not exists studio.agent_failures (
  id uuid primary key default gen_random_uuid(),
  person bigint not null check (person <> 0),
  agent_id uuid not null references studio.agents(id),
  agent_name text not null,
  tool text not null check (char_length(tool) between 1 and 80),
  kind text not null check (kind in ('input', 'error', 'timeout', 'refused')),
  message text not null check (char_length(message) between 1 and 1000),
  arg_names text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists agent_failures_person on studio.agent_failures (person, created_at desc);

alter table studio.agent_failures enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'agent_failures' and policyname = 'writer_all') then
    create policy writer_all on studio.agent_failures for all to studio_writer using (true) with check (true);
  end if;
end $$;
-- Nothing for anon and authenticated; the site (studio_writer) may only read and add rows: append-only.
revoke all on studio.agent_failures from anon, authenticated, studio_writer;
grant select, insert on studio.agent_failures to studio_writer;

alter table studio.pieces drop constraint if exists pieces_kind_check;
alter table studio.pieces add constraint pieces_kind_check
  check (kind in ('idea', 'storyboard', 'frames', 'character', 'image', 'edit', 'picture', 'sheet', 'place', 'style'));

commit;
```

Read-back (a):

```sql
select c.what, c.ok from (
  select 'agent_failures exists' as what, to_regclass('studio.agent_failures') is not null as ok
  union all select 'agent_failures has row security on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.agent_failures')), false)
  union all select 'exactly one policy, writer_all, for studio_writer', (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'agent_failures') = 1 and exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'agent_failures' and policyname = 'writer_all' and roles = '{studio_writer}'::name[])
  union all select 'studio_writer can select and insert', coalesce(has_table_privilege('studio_writer', to_regclass('studio.agent_failures'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.agent_failures'), 'INSERT'), false)
  union all select 'studio_writer cannot update, delete or truncate', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.agent_failures'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.agent_failures'), 'DELETE') or has_table_privilege('studio_writer', to_regclass('studio.agent_failures'), 'TRUNCATE')), false)
  union all select 'anon and authenticated have no privilege', coalesce(not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, to_regclass('studio.agent_failures'), p)), false)
  union all select 'columns: id, person, agent_id, agent_name, tool, kind, message, arg_names, created_at', (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'studio' and table_name = 'agent_failures') = array['id', 'person', 'agent_id', 'agent_name', 'tool', 'kind', 'message', 'arg_names', 'created_at']
  union all select 'pieces_kind_check names the four new kinds', coalesce((select pg_get_constraintdef(oid) ~ '''picture''' and pg_get_constraintdef(oid) ~ '''sheet''' and pg_get_constraintdef(oid) ~ '''place''' and pg_get_constraintdef(oid) ~ '''style''' and pg_get_constraintdef(oid) ~ '''edit''' from pg_constraint where conname = 'pieces_kind_check' and conrelid = 'studio.pieces'::regclass), false)
  union all select 'every existing piece still fits', not exists (select 1 from studio.pieces where kind not in ('idea', 'storyboard', 'frames', 'character', 'image', 'edit', 'picture', 'sheet', 'place', 'style'))
  union all select 'an agent exists to test with', exists (select 1 from studio.agents)
) c;
```

Read-back (b):

```sql
do $$
declare
  a record;
  f uuid;
  k text;
  p uuid;
  n int;
  refused boolean;
begin
  select person, id, name into a from studio.agents order by created_at limit 1;
  if not found then raise exception 'READ-BACK FAILED: no agent to test with'; end if;

  -- A realistic failure record: the agent's draft_picture call was refused for a missing style.
  insert into studio.agent_failures (person, agent_id, agent_name, tool, kind, message, arg_names)
    values (a.person, a.id, a.name, 'draft_picture', 'input', 'style is required: ask your person which style they want', array['attach', 'prompt'])
    returning id into f;
  select count(*) into n from studio.agent_failures where id = f and tool = 'draft_picture' and kind = 'input' and arg_names = array['attach', 'prompt'] and created_at > now() - interval '1 minute';
  if n <> 1 then raise exception 'READ-BACK FAILED: the failure record did not read back'; end if;

  -- A kind that isn't one of the four is refused.
  refused := false;
  begin
    insert into studio.agent_failures (person, agent_id, agent_name, tool, kind, message) values (a.person, a.id, a.name, 'draft_picture', 'crashed', 'x');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a failure of an unknown kind was kept'; end if;

  -- A draft piece of each new kind, for the agent's person.
  foreach k in array array['picture', 'sheet', 'place', 'style'] loop
    insert into studio.pieces (kind, person, title) values (k, a.person, 'Read-back: a ' || k || ' draft') returning id into p;
    select count(*) into n from studio.pieces where id = p and kind = k;
    if n <> 1 then raise exception 'READ-BACK FAILED: a % piece did not read back', k; end if;
    delete from studio.pieces where id = p;
  end loop;

  -- A kind outside the ten is still refused.
  refused := false;
  begin
    insert into studio.pieces (kind, person, title) values ('video', a.person, 'Read-back: not a kind');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a piece of an unknown kind was kept'; end if;

  delete from studio.agent_failures where id = f;
  select count(*) into n from studio.agent_failures where id = f;
  if n <> 0 then raise exception 'READ-BACK FAILED: the test failure record was left behind'; end if;
  select count(*) into n from studio.pieces where title like 'Read-back: a % draft';
  if n <> 0 then raise exception 'READ-BACK FAILED: test pieces left behind'; end if;
  raise notice 'READ-BACK PASSED: a failure record and four new kinds of piece inserted, read back, bad rows refused, all deleted';
end $$;
```

### Rebase test

The rebase stops at `6966c9c` (get_sheet and get_references) with an add/add conflict in
`content/snowmoon/references.json`: the branch merged main twice, and replaying its commits one by one meets a file
both sides added. Aborted. **A merge of main into it (as the PR would merge) is clean**, and on that merged copy:
tsc ✓; `check:principles` 54 of 55 (P6d only); `test:chat-make` 21 ✓ (each rule proven on a planted violation);
`test:chat` 91 ✓; `test:chat-route` 9 ✓; `test:agent-api` 30 ✓; `test:db-limits` 5 ✓; `next build` ✓; `test:agents` 211 ✓.

### Decisions owed

- Reread part 1 (2.1) and part 2 (2.11 to 2.14); and say "applied" for 0031.
- Part 1 and part 2 ship together unless split: reread both now, or have part 2 put behind a switch?
- Privacy §4's list of agent edits doesn't name the new camera edit (`set_camera`): add "a shot's camera"?
- agents.md doesn't mention the new picture, sheet, place, style, camera and match_request tools: update it in this merge?
- Should you see agents' draft notes on other people's drafts? The lines say yes (part 1 draft's question).

---

## 3. social-read: posts that link here

Branch `social-read` (`e6b2ed3`, 5 commits). "Posts that link here" under chapters, images and scenes, from
Farcaster (Neynar) and Bluesky's public API; no avatars or pictures. Behind `SOCIAL_READ.show`, off; even on, nothing
shows until 0032 is applied (it fails closed). `check:principles` P6p fails if the switch is on while Privacy §7
doesn't name Bluesky.

### Legal (reread)

| # | Where | Before | After |
|---|---|---|---|
| 3.1 | /privacy §6, a new last paragraph | (ends) "…Its card is drawn from that link, and we keep nothing about it." | "If you post on Farcaster or Bluesky with a link to a page here, your post may be shown on that page, under "Posts that link here": your handle on that network, the date, the post's text (up to 500 characters) and a link to it, newest first. We never show your picture or display name, and nothing is counted or ranked. We find these posts through Neynar (for Farcaster) and Bluesky's public service (section 7), and keep them only in our server's short-term cache, for about half an hour, not in our database. A Bluesky post or account with a label, including an account that asks not to be shown to people who aren't signed in, is not shown. If you delete your post, it leaves this site within about an hour. To have it removed here sooner, or kept off, write to snowmoon@wearelum.xyz; we then keep only the post's id, to keep it hidden." |
| 3.2 | /privacy §7, Neynar item, at its end | (ends) "…and we keep its answer in memory for five minutes." | adds: "To find public Farcaster posts that link to pages here, our server asks Neynar for them, at most every half hour; this sends nothing about you." |
| 3.3 | /privacy §7, a new item after Neynar | (none) | "Bluesky's public service (api.bsky.app) is asked by our server, at most every half hour, for public posts that link to pages here. It receives nothing about you or what you read; your browser doesn't contact it." |
| 3.4 | /terms §7, after "We may hide content that breaks these Terms." | **The draft's "Today" is out of date**: §7 now also has the two admin sentences (phase2-admin). | inserts: "Public posts on other networks that link to a page here may be shown on that page; they are their writers' and under those networks' terms, not part of the Service's own content, and we may hide any of them, and do so when the person who wrote one asks." It would now sit just before "Admins may also hide the images the project made itself…". Reread it in that place, or say it goes at the end of §7. |

### Pages (shown only while the switch is on)

| # | Where | Before | After |
|---|---|---|---|
| 3.5 | /about, new paragraph | (none) | "Posts that link here: under a chapter, an image or a scene, public posts on Farcaster and Bluesky that link to that page are shown, newest first, with the writer's handle, the date and a link to the post. Our server finds them, through Neynar for Farcaster and Bluesky's public API, sending only this site's address; your browser asks neither. Moderators can hide any of them, and the person who wrote one can ask us to remove it at snowmoon@wearelum.xyz." |
| 3.6 | Under a chapter, an image, a scene (only when a post links there) | (none) | "Posts that link here" — "Public posts on Farcaster and Bluesky that link to this page, newest first. They are not part of this edition, and we don't check them. Wrote one and want it removed here? Write to snowmoon@wearelum.xyz." Each: "Farcaster · @handle · 2026-10-30", the text quoted, "See it on Farcaster" / "See it on Bluesky". At most 20; text cut at 500 characters. |
| 3.7 | /moderate, new section | (none) | "Posts that link here" — "Public posts on Farcaster and Bluesky that link to a page here, newest first. Hide one when the person who wrote it asks (by email to snowmoon@wearelum.xyz), or when it breaks the Terms. It leaves every page within a few minutes." Buttons "Hide: the writer asked", "Hide: breaks the Terms". Before 0032: "Not shown on any page yet: the hide list isn't set up (NEXT_social_read.sql)." |

None of its words name the You page.

### Migration: NEXT_social_read → 0032

Adds `studio.social_hidden` (network, post id, who hid it, why, when); append-only for the site. Needs 0001 only.

**Production, read-only:** `studio.social_hidden` doesn't exist yet; the `studio` schema and the roles studio_writer,
anon and authenticated exist. It references no other table, so (b) needs no existing row.

**The branch's read-back uses the old form** (five informational selects, then `begin; set local role studio_writer; …
rollback;`). Two-part version below (here only). **PGlite: (a) 7 of 7 true; (b) passes twice; (a) shows false with a
planted `grant delete`; (b) raises with a planted check.**

Dry run:

```sql
-- NEXT_social_read DRY RUN: the same as supabase/migrations/NEXT_social_read.sql, ending in rollback; so nothing is kept. Branch social-read, owner 2026-10-29: "Social threads, reading half: posts on
-- Farcaster (Neynar) and Bluesky that link to a snowmoon.party page, shown newest first on that page, removable on
-- request." DRAFT: the owner pastes it in the Supabase SQL Editor; nothing here is applied by the coding agent.
--
-- 1. studio.social_hidden: posts on Farcaster or Bluesky that link here and must not be shown on any page ("Posts that
--    link here"). A row per hidden post: the network, the post's own id (a cast's hash, 0x + 40 hex; a Bluesky post's
--    at:// URI), who hid it (a moderator's or admin's FID), why ('writer_asked': its writer asked, by email;
--    'terms': it breaks the Terms) and when. Nothing else about the post is kept: the posts themselves are read from
--    the networks and kept only in the site's short-lived cache (half an hour), never in the database.
--    Private: no public read (who hid what is the moderators' business, like removal_log). The site (studio_writer) may
--    only read and add rows; a hide is never undone by the app (P5b: moderators only hide). The owner can delete a row
--    here, as postgres, to show a post again.
--
-- Until this is applied, the site reads no hide list, so it shows no posts at all (fail closed), whatever
-- SOCIAL_READ.show says.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001.
-- Dry run first: supabase/drafts/NEXT_social_read.DRY-RUN.sql (the same, ending in rollback;). Read back after:
-- supabase/drafts/READ-BACK-social_read.sql. One transaction: all of it or none. Safe to run twice.

begin;

create table if not exists studio.social_hidden (
  network text not null check (network in ('farcaster', 'bluesky')),
  post_id text not null check (
    (network = 'farcaster' and post_id ~ '^0x[0-9a-f]{40}$')
    or (network = 'bluesky' and post_id ~ '^at://did:[a-z0-9]+:[A-Za-z0-9._:%-]+/app\.bsky\.feed\.post/[A-Za-z0-9]{1,64}$')
  ),
  by_fid bigint not null check (by_fid > 0),
  reason text not null check (reason in ('writer_asked', 'terms')),
  hidden_at timestamptz not null default now(),
  primary key (network, post_id)
);

alter table studio.social_hidden enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'social_hidden' and policyname = 'writer_read') then
    create policy writer_read on studio.social_hidden for select to studio_writer using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'social_hidden' and policyname = 'writer_insert') then
    create policy writer_insert on studio.social_hidden for insert to studio_writer with check (true);
  end if;
end $$;
-- Nothing for anon and authenticated (0001's default privileges gave them select; take it back); the site may only
-- read and add rows: append-only.
revoke all on studio.social_hidden from anon, authenticated, studio_writer;
grant select, insert on studio.social_hidden to studio_writer;

rollback;
```

Migration:

```sql
-- NEXT_social_read (numbered at merge). Branch social-read, owner 2026-10-29: "Social threads, reading half: posts on
-- Farcaster (Neynar) and Bluesky that link to a snowmoon.party page, shown newest first on that page, removable on
-- request." DRAFT: the owner pastes it in the Supabase SQL Editor; nothing here is applied by the coding agent.
--
-- 1. studio.social_hidden: posts on Farcaster or Bluesky that link here and must not be shown on any page ("Posts that
--    link here"). A row per hidden post: the network, the post's own id (a cast's hash, 0x + 40 hex; a Bluesky post's
--    at:// URI), who hid it (a moderator's or admin's FID), why ('writer_asked': its writer asked, by email;
--    'terms': it breaks the Terms) and when. Nothing else about the post is kept: the posts themselves are read from
--    the networks and kept only in the site's short-lived cache (half an hour), never in the database.
--    Private: no public read (who hid what is the moderators' business, like removal_log). The site (studio_writer) may
--    only read and add rows; a hide is never undone by the app (P5b: moderators only hide). The owner can delete a row
--    here, as postgres, to show a post again.
--
-- Until this is applied, the site reads no hide list, so it shows no posts at all (fail closed), whatever
-- SOCIAL_READ.show says.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001.
-- Dry run first: supabase/drafts/NEXT_social_read.DRY-RUN.sql (the same, ending in rollback;). Read back after:
-- supabase/drafts/READ-BACK-social_read.sql. One transaction: all of it or none. Safe to run twice.

begin;

create table if not exists studio.social_hidden (
  network text not null check (network in ('farcaster', 'bluesky')),
  post_id text not null check (
    (network = 'farcaster' and post_id ~ '^0x[0-9a-f]{40}$')
    or (network = 'bluesky' and post_id ~ '^at://did:[a-z0-9]+:[A-Za-z0-9._:%-]+/app\.bsky\.feed\.post/[A-Za-z0-9]{1,64}$')
  ),
  by_fid bigint not null check (by_fid > 0),
  reason text not null check (reason in ('writer_asked', 'terms')),
  hidden_at timestamptz not null default now(),
  primary key (network, post_id)
);

alter table studio.social_hidden enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'social_hidden' and policyname = 'writer_read') then
    create policy writer_read on studio.social_hidden for select to studio_writer using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'social_hidden' and policyname = 'writer_insert') then
    create policy writer_insert on studio.social_hidden for insert to studio_writer with check (true);
  end if;
end $$;
-- Nothing for anon and authenticated (0001's default privileges gave them select; take it back); the site may only
-- read and add rows: append-only.
revoke all on studio.social_hidden from anon, authenticated, studio_writer;
grant select, insert on studio.social_hidden to studio_writer;

commit;
```

Read-back (a):

```sql
select c.what, c.ok from (
  select 'social_hidden exists' as what, to_regclass('studio.social_hidden') is not null as ok
  union all select 'columns: network, post_id, by_fid, reason, hidden_at', (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'studio' and table_name = 'social_hidden') = array['network', 'post_id', 'by_fid', 'reason', 'hidden_at']
  union all select 'social_hidden has row security on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.social_hidden')), false)
  union all select 'two policies, writer_read (SELECT) and writer_insert (INSERT), for studio_writer', (select array_agg(policyname::text || ':' || cmd order by policyname) from pg_policies where schemaname = 'studio' and tablename = 'social_hidden' and roles = '{studio_writer}'::name[]) = array['writer_insert:INSERT', 'writer_read:SELECT'] and (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'social_hidden') = 2
  union all select 'studio_writer can select and insert', coalesce(has_table_privilege('studio_writer', to_regclass('studio.social_hidden'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.social_hidden'), 'INSERT'), false)
  union all select 'studio_writer cannot update, delete or truncate', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.social_hidden'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.social_hidden'), 'DELETE') or has_table_privilege('studio_writer', to_regclass('studio.social_hidden'), 'TRUNCATE')), false)
  union all select 'anon and authenticated have no privilege', coalesce(not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, to_regclass('studio.social_hidden'), p)), false)
) c;
```

Read-back (b):

```sql
do $$
declare
  n int;
  refused boolean;
begin
  -- A realistic hide of each kind: a Farcaster cast its writer asked to remove, a Bluesky post that breaks the Terms.
  insert into studio.social_hidden (network, post_id, by_fid, reason) values
    ('farcaster', '0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 6786, 'writer_asked'),
    ('bluesky', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de', 6786, 'terms');
  select count(*) into n from studio.social_hidden
    where post_id in ('0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de') and hidden_at > now() - interval '1 minute';
  if n <> 2 then raise exception 'READ-BACK FAILED: % of 2 hides read back', n; end if;

  -- The same post hidden twice is refused.
  refused := false;
  begin
    insert into studio.social_hidden (network, post_id, by_fid, reason) values ('farcaster', '0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 6786, 'terms');
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: the same post was hidden twice'; end if;

  -- A Farcaster id that isn't a cast hash is refused.
  refused := false;
  begin
    insert into studio.social_hidden (network, post_id, by_fid, reason) values ('farcaster', 'https://farcaster.xyz/x/0x6a1b', 6786, 'terms');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a post id of the wrong shape was kept'; end if;

  delete from studio.social_hidden where post_id in ('0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de');
  select count(*) into n from studio.social_hidden where post_id in ('0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de');
  if n <> 0 then raise exception 'READ-BACK FAILED: test hides left behind'; end if;
  raise notice 'READ-BACK PASSED: a hide of each kind inserted, read back, bad rows refused, both deleted';
end $$;
```

### Rebase test

**Conflicts**, both as a rebase (at `47b8f05`, its first commit) and as a merge of main:
- `docs/principles.md` and `scripts/check-principles.ts`: the branch's **P5f** ("Posts that link here" newest first)
  against main's **P5f** (the seeded hide, from phase2-admin). Same id, two principles.
- `src/app/about/page.tsx`: the config import line (`SOCIAL_READ` against main's `SUPPORT`).

Aborted; no tests run. The fix is mechanical (renumber its P5f, keep both imports) but changes the branch, so it's
yours to OK.

### Decisions owed

- Reread 3.1 to 3.4 (3.4 in today's longer Terms §7) and the About line; "applied" for 0032.
- Merge with "switch on", or merge it off.
- OK to renumber its P5f (and its P6p, which signin also uses) when I resolve the conflict?
- The limits (20 posts a page, 500 characters, every half hour; "within about an hour" after a deletion).
- Farcaster spam: hide by hand (as built), or also filter by Neynar score (not built)?

---

## 4. (none)

---

## 5. Routing C (on agent-pictures): the assistant's make mode

On branch `agent-pictures` (`380bca0`, `e08e434`, `b4fbb3d`). **Ships off** (`CHAT.make.enabled: false`): while off,
no routing call is made and nothing goes to Baseten. No migration (its caps use the existing tables). Make mode reads
the book and plans with you; it can't draft yet (that needs the assistant as your agent, not built). Real trial:
$0.03, every Kimi turn served by Baseten with zero retention. The full text is in `docs/legal/routing-c-draft.md`;
every "Before" below matches main word for word.

| # | Where | Before | After |
|---|---|---|---|
| 5.1 | /privacy §5 | "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending." | "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Until you ask the assistant to make something, Groq first reads each message on its own, to tell a question about the book from a request to make something. When you do, the conversation from then on is sent through Vercel AI Gateway to Baseten, which runs Kimi K3, and to no other provider. All are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask, and how many times you start making something, and when, to count the daily limits. The assistant's costs are kept only as daily totals, without your ID, to track our spending and to pause the assistant, or its making, for the day when its spending limit is reached." |
| 5.2 | /privacy §7, Groq item | (as 2.12) | adds: "When you ask the assistant to make something, Vercel AI Gateway also receives the conversation and passes it to Baseten." (With 2.12 merged, the item carries both changes.) |
| 5.3 | /privacy §7, new item | (none) | "Baseten runs Kimi K3 for the assistant when you ask it to make something. It receives assistant questions in that conversation through Vercel AI Gateway, answers them, and keeps nothing (its zero-data-retention terms, and Vercel's agreement with it)." |
| 5.4 | Assistant notice, item 1 | "**It helps you read.** Ask about the book. Answers point to the passages they rest on, with chapter and ¶, and show the book’s own words." | "**It helps you read and plan.** Ask about the book, or say what you’d like to make. Answers point to the passages they rest on and show the book’s own words. It can plan something with you from the book, but it can’t draft or make anything yet." |
| 5.5 | Notice, item 2 | "**It won’t write for you.** No dialogue, narration or description. It gives context and commentary only." | "**It won’t write the story for you.** No dialogue or narration: lines it plans with you are the book’s own words or yours, exactly. When you make something, it may describe what a picture should show." |
| 5.6 | Notice, item 3 | "**Your messages go to Groq (not the Grok of X).** Groq runs gpt-oss-120b, an open-weights model. When Groq is busy, a message goes through Vercel AI Gateway to Groq instead. Both are set to keep nothing, and this app keeps no copy of your messages." | "**Your messages go to Groq (not the Grok of X), or to Baseten when you make something.** Questions about the book go to Groq, which runs gpt-oss-120b, an open-weights model; when Groq is busy, through Vercel AI Gateway instead. Until you ask to make something, gpt-oss-120b first reads each message on its own, to tell a question from a request to make something. From then on, the conversation goes through Vercel AI Gateway to Baseten, which runs Kimi K3, an open-weights model by Moonshot AI; if Baseten isn’t available, making is paused rather than sent elsewhere. All are set to keep nothing, and this app keeps no copy of your messages." |
| 5.7 | Notice, item 4 | "**Your questions are saved only on this device.** They are sent to Groq (or through Vercel AI Gateway when Groq is busy) to be answered, and never published. … The app records only how many you ask and when, under your Farcaster ID, to count the daily limit. …" | "…They are sent to Groq (or, when you make something, to Baseten) to be answered, and never published. … The app records only how many you ask, and how many times you start making something (10 a day), and when, under your Farcaster ID, to count the daily limits. …" |
| 5.8 | /about, "The reading assistant" (in the draft only; not built on the branch) | (none) | "When you ask it to make something, the conversation goes instead through Vercel AI Gateway to Baseten, which runs Kimi K3 (Moonshot AI, open weights), with zero data retention required and no other provider allowed: if Baseten isn't available, making pauses. Making has its own daily limits: 10 conversations for you and a spending limit for the whole site." |
| 5.9 | /terms §8 (optional) | "…not advice of any kind." | adds: "When you ask the assistant to make something, each day is limited to 10 such conversations for you and to a spending limit for the whole site; when either is reached, making pauses until the next day, and questions about the book still work." |
| 5.10 | Assistant, in make mode | (none) | label "Assistant · making · N new left today"; "Making: 0 left today" — "You’ve started today’s make conversations. They come back at 00:00 UTC, in ‹h m›. Questions about the book still work."; "Making is paused for today" — "Making has reached today’s spending limit for everyone. It comes back at 00:00 UTC. …"; "Making is unavailable" — "The model that makes things can’t be reached right now, and this conversation isn’t sent anywhere else. …"; footer "Kimi K3 · open weights · Baseten via Vercel AI Gateway" |

Rebase and tests: as block 2 (same branch).

### Decisions owed

- Reread 5.1 to 5.7 (and 5.8, 5.9 in or out); then switch on in its own release, with `ownerReread` set for the notice.
- Make mode for everyone signed in with Farcaster (as built), or only the agents allowlist?
- No routing call on "sticky" make turns: OK?
- The routing call counted under `search` in the daily totals: OK, or a small migration for its own label?
- Baseten's zero retention rests on Vercel's agreement with Baseten, not a contract of ours: acceptable?
- Next: build the assistant as your agent (drafting in make mode; its notice was reread 2026-10-29), or not yet?

---

## 6. signin-lens-bluesky: Lens and Bluesky sign-in

Branch `signin-lens-bluesky` (`21f508a`, 7 commits). Two pieces of work:
- **Sign-in as equals** (Farcaster and a wallet in the same style, each with a line under it). **No switch: live on merge.**
- **Lens and Bluesky sign-in**, off in `SIGN_IN_METHODS` (every Lens/Bluesky route answers 404 while off).
  `check:principles` P6p fails if either is on while Privacy §4 and §7 don't describe them.

### Live on merge (reread)

| # | Where | Before | After |
|---|---|---|---|
| 6.1 | Phone menu, rail foot, image maker, Dashboard signed out, Make your own, agent connect screen, editor (`sign-in-text.ts`) | "Sign in with Farcaster" (filled), "Sign in with a wallet" (outlined); in the image maker the wallet came first | "Sign in with Farcaster" with **"Your Farcaster account, approved in the Farcaster app."** under it; "Sign in with a wallet" with **"An Ethereum wallet, in this browser or in your wallet app."** under it; same style, Farcaster first everywhere; then "Signing in is free. It's a signature, not a payment." |
| 6.2 | The assistant, signed out | One filled "Sign in with Farcaster" | Same, with "Your Farcaster account, approved in the Farcaster app." (still Farcaster only) |

### Legal (shown once Lens and Bluesky are on)

| # | Where | Before | After |
|---|---|---|---|
| 6.3 | /privacy §3 | **The draft's "Today" is out of date** (no-token): main says "…and, on the website, your sign-in, which lasts about an hour (a day for a wallet sign-in), and a payment you have sent but not yet seen credited." | On today's words: "…and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, and a payment you have sent but not yet seen credited." (The branch's draft says "a sign-in token"; rewritten here without "token".) |
| 6.4 | /privacy §4, opening | "Your account (a Farcaster account or a wallet address; other sign-in methods will be listed here when they come), and what you do with it here:" | "Your account (a Farcaster account, a wallet address, a Lens account or a Bluesky account), and what you do with it here:" |
| 6.5 | /privacy §4, new item | (none) | "If you sign in with Lens: your Lens account's address and its Lens username, as Lens gave them at your last sign-in, and when you first and last signed in that way. If you sign in with Bluesky: your Bluesky account's identifier (its DID) and your handle, if your handle points back to that account, and when you first and last signed in that way. We keep these while you use the Service (section 9). We keep no token from Lens or from your Bluesky server: we use what they give us once, to confirm who you are, and drop it. We don't keep the wallet you signed with for Lens." |
| 6.6 | /privacy §4, new item | (none) | "If your Lens or Bluesky account is linked to your Farcaster account, or your Bluesky account to your Lens account (you linked them while signed in with both): which is linked to which, and when it was linked or unlinked. While linked, signing in with it is signing in as that account. You can unlink it on your Dashboard." (draft says "You page"; and **no page offers unlinking yet**) |
| 6.7 | /privacy §4, images item | "…your name (Farcaster name or wallet address)…" | "…your name (Farcaster name, wallet address, Lens username or Bluesky handle)…" |
| 6.8 | /privacy §6, byline | "…(your Farcaster name, or, for a wallet account, its address shortened; your Farcaster ID on quote cards)…" | "…(your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle; your Farcaster ID on quote cards)…" |
| 6.9 | /privacy §7, new Lens item (variant A) | (none) | "If you sign in with Lens: our server asks Lens's API (api.lens.xyz) for a sign-in message for your Lens account and the wallet you sign with, and sends Lens your signature, which Lens checks. Lens receives those two addresses and learns that you signed in here. To show you which Lens accounts your wallet can sign in as, Lens also receives your wallet's address." (Variant B adds the Lens score lookup.) |
| 6.10 | /privacy §7, new Bluesky item | (none) | "If you sign in with Bluesky: our server looks up your handle (in its domain's DNS, or at the handle's own web address), your account's public record (at plc.directory, run by Bluesky, or at your own domain), and your Bluesky server (your PDS) and the sign-in server it names, which may be Bluesky's or another provider's. You approve the sign-in on that sign-in server, under its own terms, and it learns that you signed in here. We ask it only to confirm who you are, not to read or post anything for you." |
| 6.11 | /terms §4 (variant A) | "…Your account here is a Farcaster account or a wallet address. You can link a wallet to your Farcaster account; while it is linked, signing in with the wallet is signing in as that account. Other ways to sign in may come later; these Terms will list each one when it does." | "…Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can link a wallet, a Lens account or a Bluesky account to your Farcaster account, and a Bluesky account to your Lens account; while it is linked, signing in with it is signing in as that account. Free daily images and frames come with a Farcaster account; a Lens or Bluesky account gets them only while it is linked to one. To prepay for generations, sign in with a wallet (section 6a)." |
| 6.12 | /terms §5 | "Your name is shown with it: your Farcaster name, or, for a wallet account, its address shortened." | "Your name is shown with it: your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle." |

### Pages (once on)

| # | Where | Before | After |
|---|---|---|---|
| 6.13 | The sign-in list | (none) | "Sign in with Lens" — "Your Lens account, signed for by the wallet that owns or manages it."; "Sign in with Bluesky" — "Your Bluesky account, approved on your Bluesky server." (website only) |
| 6.14 | Bluesky handle box | (none) | "Your Bluesky handle", placeholder "alice.bsky.social", "Sent to us to find your Bluesky server and sign you in. Never published by us.", "Continue" |
| 6.15 | /sign-in/bluesky (return page) | (none) | "Signed in as ‹name›. Go to your page or back to the book." ("Go to your page" links to `/you`; should be `/dashboard`) |
| 6.16 | Free images refused, Bluesky not linked | (none) | "Free images and frames come with a Farcaster or Lens account. Link one to this Bluesky account, or sign in with a wallet to pay. …" (**disagrees with 6.11 under variant A**, where only Farcaster gives them) |
| 6.17 | Sign-in errors | (none) | e.g. "This wallet doesn't own or manage a Lens account." / "We couldn't find that handle on Bluesky." / "Your Bluesky server isn't answering. Try again in a moment." (full list in the branch's `SOCIAL_WORDING` and the auth routes) |

### Migration: NEXT_signin_lens_bluesky → 0033

Adds `studio.social_accounts` and `studio.social_links`. Needs 0001 only. Unlike the others, it isn't safe to run
twice (plain `create table` / `create policy`); a second run just stops with "already exists", inside its transaction.
The branch's file holds the dry run, the migration and the old read-back in one; the blocks below split them.

**Production, read-only:** neither table exists yet; no other table is referenced, so (b) needs no existing row.

**The branch's read-back uses the old form** (`set local role studio_writer`, several selects in `begin … rollback`;
it also uses a real Lens address and the real bsky.app DID). The two-part version below uses made-up ones. **PGlite:
(a) 12 of 12 true; (b) passes twice; (a) shows false with a planted `grant update (subject)`; (b) raises with a
planted check.**

Dry run:

```sql
-- NEXT_signin_lens_bluesky DRY RUN: block A of supabase/migrations/NEXT_signin_lens_bluesky.sql (the migration, ending
-- in rollback; nothing is kept). Run as postgres in the Supabase SQL Editor. DRAFT, NOT APPLIED.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept.
begin;

-- ---------------------------------------------------------------------------
-- 1. Lens and Bluesky accounts.
-- ---------------------------------------------------------------------------

create table studio.social_accounts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lens', 'bluesky')),
  -- Lens: the account's address, lowercase. Bluesky: the DID (did:plc or did:web).
  subject text not null check (
    (kind = 'lens' and subject ~ '^0x[0-9a-f]{40}$')
    or (kind = 'bluesky' and subject ~ '^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]{1,253})$')
  ),
  -- Lens: "lens/<name>"; Bluesky: the handle, only if it resolved back to the DID. Refreshed at each sign-in.
  handle text check (handle is null or char_length(handle) between 1 and 253),
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz not null default now(),
  unique (kind, subject)
);

alter table studio.social_accounts enable row level security;
create policy writer_insert on studio.social_accounts for insert to studio_writer with check (true);
create policy writer_read on studio.social_accounts for select to studio_writer using (true);
-- Sign-in refreshes the handle and the time (insert … on conflict do update); nothing else can change (column grant below).
create policy writer_update on studio.social_accounts for update to studio_writer using (true) with check (true);
revoke all on studio.social_accounts from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.social_accounts from studio_writer;
grant select, insert on studio.social_accounts to studio_writer;
grant update (handle, last_sign_in_at) on studio.social_accounts to studio_writer;

-- ---------------------------------------------------------------------------
-- 2. Links: a Lens or Bluesky account to a Farcaster ID, or a Bluesky account to a Lens account.
-- ---------------------------------------------------------------------------

create table studio.social_links (
  id bigint generated always as identity primary key,
  account_id bigint not null references studio.social_accounts(id),
  fid bigint check (fid > 0),
  lens_account_id bigint references studio.social_accounts(id),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  ended_by text check (ended_by in ('person')),
  check ((fid is null) <> (lens_account_id is null)),
  check (lens_account_id is distinct from account_id),
  check (unlinked_at is null or unlinked_at >= linked_at),
  check ((unlinked_at is null) = (ended_by is null))
);
-- One active link per account.
create unique index social_links_one_active on studio.social_links (account_id) where unlinked_at is null;
create index social_links_fid on studio.social_links (fid) where fid is not null;
create index social_links_lens on studio.social_links (lens_account_id) where lens_account_id is not null;

alter table studio.social_links enable row level security;
create policy writer_insert on studio.social_links for insert to studio_writer with check (unlinked_at is null and ended_by is null);
create policy writer_read on studio.social_links for select to studio_writer using (true);
-- Ending only: an active row may be given its unlinked_at and ended_by, once; nothing else can change (column grant below).
create policy writer_unlink on studio.social_links for update to studio_writer using (unlinked_at is null) with check (unlinked_at is not null and ended_by is not null);
revoke all on studio.social_links from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.social_links from studio_writer;
grant select, insert on studio.social_links to studio_writer;
grant update (unlinked_at, ended_by) on studio.social_links to studio_writer;

rollback;
```

Migration:

```sql
begin;

-- ---------------------------------------------------------------------------
-- 1. Lens and Bluesky accounts.
-- ---------------------------------------------------------------------------

create table studio.social_accounts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lens', 'bluesky')),
  -- Lens: the account's address, lowercase. Bluesky: the DID (did:plc or did:web).
  subject text not null check (
    (kind = 'lens' and subject ~ '^0x[0-9a-f]{40}$')
    or (kind = 'bluesky' and subject ~ '^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]{1,253})$')
  ),
  -- Lens: "lens/<name>"; Bluesky: the handle, only if it resolved back to the DID. Refreshed at each sign-in.
  handle text check (handle is null or char_length(handle) between 1 and 253),
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz not null default now(),
  unique (kind, subject)
);

alter table studio.social_accounts enable row level security;
create policy writer_insert on studio.social_accounts for insert to studio_writer with check (true);
create policy writer_read on studio.social_accounts for select to studio_writer using (true);
-- Sign-in refreshes the handle and the time (insert … on conflict do update); nothing else can change (column grant below).
create policy writer_update on studio.social_accounts for update to studio_writer using (true) with check (true);
revoke all on studio.social_accounts from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.social_accounts from studio_writer;
grant select, insert on studio.social_accounts to studio_writer;
grant update (handle, last_sign_in_at) on studio.social_accounts to studio_writer;

-- ---------------------------------------------------------------------------
-- 2. Links: a Lens or Bluesky account to a Farcaster ID, or a Bluesky account to a Lens account.
-- ---------------------------------------------------------------------------

create table studio.social_links (
  id bigint generated always as identity primary key,
  account_id bigint not null references studio.social_accounts(id),
  fid bigint check (fid > 0),
  lens_account_id bigint references studio.social_accounts(id),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  ended_by text check (ended_by in ('person')),
  check ((fid is null) <> (lens_account_id is null)),
  check (lens_account_id is distinct from account_id),
  check (unlinked_at is null or unlinked_at >= linked_at),
  check ((unlinked_at is null) = (ended_by is null))
);
-- One active link per account.
create unique index social_links_one_active on studio.social_links (account_id) where unlinked_at is null;
create index social_links_fid on studio.social_links (fid) where fid is not null;
create index social_links_lens on studio.social_links (lens_account_id) where lens_account_id is not null;

alter table studio.social_links enable row level security;
create policy writer_insert on studio.social_links for insert to studio_writer with check (unlinked_at is null and ended_by is null);
create policy writer_read on studio.social_links for select to studio_writer using (true);
-- Ending only: an active row may be given its unlinked_at and ended_by, once; nothing else can change (column grant below).
create policy writer_unlink on studio.social_links for update to studio_writer using (unlinked_at is null) with check (unlinked_at is not null and ended_by is not null);
revoke all on studio.social_links from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.social_links from studio_writer;
grant select, insert on studio.social_links to studio_writer;
grant update (unlinked_at, ended_by) on studio.social_links to studio_writer;

commit;
```

Read-back (a):

```sql
select c.what, c.ok from (
  select 'social_accounts exists' as what, to_regclass('studio.social_accounts') is not null as ok
  union all select 'social_links exists', to_regclass('studio.social_links') is not null
  union all select 'social_accounts columns: id, kind, subject, handle, created_at, last_sign_in_at', (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'studio' and table_name = 'social_accounts') = array['id', 'kind', 'subject', 'handle', 'created_at', 'last_sign_in_at']
  union all select 'social_links columns: id, account_id, fid, lens_account_id, linked_at, unlinked_at, ended_by', (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'studio' and table_name = 'social_links') = array['id', 'account_id', 'fid', 'lens_account_id', 'linked_at', 'unlinked_at', 'ended_by']
  union all select 'row security on, both tables', coalesce((select bool_and(relrowsecurity) and count(*) = 2 from pg_class where oid in (to_regclass('studio.social_accounts'), to_regclass('studio.social_links'))), false)
  union all select 'six policies, all for studio_writer', (select array_agg(tablename::text || '.' || policyname || ':' || cmd order by tablename, policyname) from pg_policies where schemaname = 'studio' and tablename in ('social_accounts', 'social_links') and roles = '{studio_writer}'::name[]) = array['social_accounts.writer_insert:INSERT', 'social_accounts.writer_read:SELECT', 'social_accounts.writer_update:UPDATE', 'social_links.writer_insert:INSERT', 'social_links.writer_read:SELECT', 'social_links.writer_unlink:UPDATE'] and (select count(*) from pg_policies where schemaname = 'studio' and tablename in ('social_accounts', 'social_links')) = 6
  union all select 'studio_writer can select and insert both', coalesce(has_table_privilege('studio_writer', to_regclass('studio.social_accounts'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.social_accounts'), 'INSERT') and has_table_privilege('studio_writer', to_regclass('studio.social_links'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.social_links'), 'INSERT'), false)
  union all select 'studio_writer: no table-wide update, delete or truncate on either', coalesce(not exists (select 1 from unnest(array['studio.social_accounts', 'studio.social_links']) t, unnest(array['UPDATE', 'DELETE', 'TRUNCATE']) p where has_table_privilege('studio_writer', to_regclass(t), p)), false)
  union all select 'studio_writer may update only handle and last_sign_in_at on accounts', coalesce(has_column_privilege('studio_writer', to_regclass('studio.social_accounts'), 'handle', 'UPDATE') and has_column_privilege('studio_writer', to_regclass('studio.social_accounts'), 'last_sign_in_at', 'UPDATE') and not has_column_privilege('studio_writer', to_regclass('studio.social_accounts'), 'subject', 'UPDATE') and not has_column_privilege('studio_writer', to_regclass('studio.social_accounts'), 'kind', 'UPDATE'), false)
  union all select 'studio_writer may update only unlinked_at and ended_by on links', coalesce(has_column_privilege('studio_writer', to_regclass('studio.social_links'), 'unlinked_at', 'UPDATE') and has_column_privilege('studio_writer', to_regclass('studio.social_links'), 'ended_by', 'UPDATE') and not has_column_privilege('studio_writer', to_regclass('studio.social_links'), 'fid', 'UPDATE') and not has_column_privilege('studio_writer', to_regclass('studio.social_links'), 'account_id', 'UPDATE'), false)
  union all select 'anon and authenticated have no privilege on either', coalesce(not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.social_accounts', 'studio.social_links']) t, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, to_regclass(t), p)), false)
  union all select 'one active link per account (social_links_one_active)', to_regclass('studio.social_links_one_active') is not null
) c;
```

Read-back (b):

```sql
do $$
declare
  lens_id bigint;
  bsky_id bigint;
  n int;
  refused boolean;
begin
  -- A realistic Lens account and Bluesky account, as a first sign-in stores them (made-up address and DID).
  insert into studio.social_accounts (kind, subject, handle) values ('lens', '0x5e1d0c3b2a19f8e7d6c5b4a39281706f5e4d3c2b', 'lens/readback') returning id into lens_id;
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:readbackreadbackreadback', 'readback.bsky.social') returning id into bsky_id;
  -- A sign-in again refreshes the handle.
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:readbackreadbackreadback', 'readback2.bsky.social')
    on conflict (kind, subject) do update set handle = excluded.handle, last_sign_in_at = now();
  select count(*) into n from studio.social_accounts where id in (lens_id, bsky_id) and (id = lens_id or handle = 'readback2.bsky.social');
  if n <> 2 then raise exception 'READ-BACK FAILED: the accounts did not read back (or the handle was not refreshed)'; end if;

  -- A subject of the wrong shape is refused.
  refused := false;
  begin
    insert into studio.social_accounts (kind, subject) values ('bluesky', 'readback.bsky.social');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a Bluesky account without a DID was kept'; end if;

  -- The Bluesky account linked to FID 6786; a second active link for it is refused.
  insert into studio.social_links (account_id, fid) values (bsky_id, 6786);
  refused := false;
  begin
    insert into studio.social_links (account_id, lens_account_id) values (bsky_id, lens_id);
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a second active link was kept'; end if;

  -- A link to both a FID and a Lens account is refused.
  refused := false;
  begin
    insert into studio.social_links (account_id, fid, lens_account_id) values (lens_id, 6786, bsky_id);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a link to two accounts was kept'; end if;

  -- The person ends the link.
  update studio.social_links set unlinked_at = now(), ended_by = 'person' where account_id = bsky_id and unlinked_at is null;
  select count(*) into n from studio.social_links where account_id = bsky_id and ended_by = 'person' and unlinked_at is not null;
  if n <> 1 then raise exception 'READ-BACK FAILED: the link did not end'; end if;

  delete from studio.social_links where account_id in (lens_id, bsky_id) or lens_account_id in (lens_id, bsky_id);
  delete from studio.social_accounts where id in (lens_id, bsky_id);
  select (select count(*) from studio.social_accounts where id in (lens_id, bsky_id)) + (select count(*) from studio.social_links where account_id in (lens_id, bsky_id)) into n;
  if n <> 0 then raise exception 'READ-BACK FAILED: test rows left behind'; end if;
  raise notice 'READ-BACK PASSED: a Lens and a Bluesky account, a sign-in again, a link and its end inserted, read back, bad rows refused, all deleted';
end $$;
```

### Rebase test

**Conflicts**, as a rebase (at `ecaeeff`, the Lens and Bluesky commit) and as a merge of main:
`src/app/api/images/status/route.ts` and `src/lib/config.ts`. Aborted; no tests run. On top of dashboard-rename it
would also conflict in `scripts/check-ui.ts` and `src/components/app-shell.tsx`.

### Decisions owed

- Reread 6.1 and 6.2 (live on merge, no switch).
- Reread 6.3 to 6.12; variant A (no Lens score threshold: Lens gets no free generations) or B (set a threshold: 100, 1000 or 5000).
- 6.6 says you can unlink on the Dashboard, but no page offers it: build the panel first, or say "write to us to unlink it" for now?
- 6.16 vs 6.11 under variant A: change the refusal to "come with a Farcaster account", or choose B?
- Register Snowmoon's own Lens App on Lens Chain (an onchain deploy, small gas, public)? Today it uses Lens's test App.
- The four new P4a sign-in exemptions (lens/challenge, lens/verify, bluesky/start, bluesky/callback): yes or no.
- Should the assistant also offer a wallet sign-in?
- "applied" for 0033, then Lens and Bluesky on, in the same release as the legal lines.

---

## 7. remix-challenge: the 6 Nov launch

Branch `remix-challenge` (`2dba626`, 12 commits). /challenge, entry marking, share buttons, "Add where you posted it"
and "Posted on". **/challenge and the share buttons have no switch** (live on merge). `CHALLENGE.entries` and
`CHALLENGE.posts` are off. `openSheets` is on, but works only inside the window **and** once Privacy §4 says "remix
challenge" (`privacyDescribesChallenge`): without the reread, on 6 Nov only invited people can fork a sheet, and no
eligibility is stored. Every "Before" in its draft matches main; Terms §6c (Support) is live, so its new section is
§6d. One stale part: its opening "conflict to settle first" quotes "There is no token" (Terms §2) and principle 7's
"No token", both gone since no-token.

### Legal (reread)

| # | Where | Before | After |
|---|---|---|---|
| 7.1 (L1) | /privacy §4, new item after "Images you publish…" | (none) | "Character sheets you publish, with their text, their views, your name and the record of how each view was made. These are public. During the remix challenge, anyone who passes the same check as making images can publish a remix of its characters' sheets." |
| 7.2 (L2) | /privacy §4, new item | (none) | "If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or your account's score when you published it), decided once when you publish it and kept with it; and which of your versions you mark as your entry for each character, and when. Whether a version is an entry is shown on its page and on the challenge page, with how many people have entered each character; your score itself is never shown." |
| 7.3 (L3) | /privacy §4, new item | (none) | "If you add where a version was posted: the post's network, its id there, its writer's handle, when it was posted, its address, and who added it and when. The network, handle, date and a link to the post are shown on the version's page; who added it isn't. You can remove a post you added; a moderator can remove any of them, on its writer's request or under the Terms." |
| 7.4 (L4) | /privacy §6, end | "…Its card is drawn from that link, and we keep nothing about it." | adds: "During the remix challenge, a version of one of its characters that you publish may be shown as your entry, on its page and on the challenge page." |
| 7.5 (L5) | /privacy §7, Neynar item, after "We keep the score for a day." | (none) | "During the remix challenge, the score you have when you publish a remix of a challenge character decides whether it can count as an entry; that score (looked up then, at most once, and usually already kept from making its views) is kept with the version. Neynar is never asked about you when someone views a page. When someone adds a Farcaster post to a version's page, Neynar receives that post's address or id, to read it." |
| 7.6 (L6) | /privacy §7, new item after Neynar | (none) | "Bluesky and Lens receive the details of a post someone adds to a version's page (Bluesky: its writer's handle or account id and the post's id; Lens: the post's id), so our server can read the post and check it links there. They receive nothing about you or the person who added it, and your browser never contacts them for this." |
| 7.7 (L7) | /privacy §7, last item | "A "report" or "share" link may open GitHub, Farcaster or X, where what you post is public and under their terms." | "A "report" or "share" link may open GitHub, Farcaster, X, Bluesky or Lens (through hey.xyz), where what you post is public and under their terms." |
| 7.8 (L8) | /terms, new §6d "The remix challenge." | (none) | "The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. One entry per person per character: your latest version counts unless you mark another. Admins can make versions but aren't eligible for rewards. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so." |
| 7.9 (L9) | /terms §7, after "You may hide your own work yourself…" | (none) | "A post you add to a version's page must be one that links there; you or a moderator can remove it, and we remove a post on its writer's request." |

What's needed when: L1, L2, L4, L5, L8 with entries on; L3, L6, L7, L9 with posts on. 7.7 (share links to Bluesky
and Lens) describes the share buttons, which have no switch, so it's needed at merge.

### /challenge (new, live on merge; words in `src/lib/challenge/wording.ts`)

| # | Where | After (all new) |
|---|---|---|
| 7.10 | Title, heading, Draft line | "Remix the cast"; "Draft wording: drafted for the owner, not yet approved." |
| 7.11 | Deadline line | before: "Entries open Friday 6 November, 09:00 Pacific. Entries close Sunday 22 November, 23:59 Pacific."; during: "Entries close Sunday 22 November, 23:59 Pacific."; after: "Entries closed …" (the weekdays are right for 2026) |
| 7.12 | Intro | "From 6 to 22 November, make your own version of Zei, Bai, Gladias, Seila, Deluin or Mu on snowmoon.party: start from a published sheet, or from someone else's remix, change it, and publish. Your version gets its own page, credited back to what you built on." |
| 7.13 | What happens next | "At the call on Friday 4 December, Nate shows the versions he's taking into Episode 1, built from your remixes and credited to you. AI models and a small jury divide the credit for each one among everything it was built on, and we publish how every model did it. We plan to mint each final version as an open edition, with what it raises going to everyone it was built on. Details come with the mint page." |
| 7.14 | The bounty | "There is one poidh bounty for the whole challenge. It goes to the remix that most changes how we see a character while staying true to the book. To be in the running, also post your version's link as a claim on the bounty." |
| 7.15 | The rules | "Make your remix on snowmoon.party with the site's tools. Every recipe is published." / "Only remixes count: start from a published sheet or someone else's remix. A new sheet made from scratch isn't an entry." / "One entry per person per character. Your latest version counts unless you mark another." / "To count as an entry, sign in with a Farcaster account that passes the site's check. It's checked once, when you publish." / "Each character needs at least three different people with an entry. A character with fewer gets no final version, credit test or mint." / "Entering is free. Minting isn't needed for anything." / "Post your version anywhere with its link. If you're remixing someone's post, quote or reply to it." / "Admins (the site's owner and @garance) can make versions too, but aren't eligible for rewards." |
| 7.16 | Each character | the sheet's text, "What the book says about ‹Name› →", "Sheets to start from"; none: "No sheet of ‹Name› is published yet."; Gladias: "Gladias's starting sheet is held for a check before it's published."; with entries on: "N people have entered · N more needed for a final version" |
| 7.17 | Entries so far | off: "Entries will be listed here once the challenge starts."; on: "Newest first.", "Entry ‹Name›: ‹title› · ‹byline› · vN", "Made by admins (not eligible for rewards)" |

### A sheet or style version's page

| # | Where | After (all new) |
|---|---|---|
| 7.18 | Share block, every style and sheet page (no switch) | "Share this version"; "Farcaster", "Bluesky", "Lens"; "If you're remixing someone's post, quote or reply to it on the same network. Always include your version's link."; prefilled: "‹Name›: ‹title›, made on Snowmoon Party ‹link›" |
| 7.19 | Entry marks (entries on) | "Entry This is its maker's entry for ‹Name› in the remix challenge. Remix the cast →"; "Made during the remix challenge. Its maker's latest version counts unless they mark another." + "Mark as my entry"; "Marked as your entry."; admin: "Made by an admin during the remix challenge: admins aren't eligible for rewards." |
| 7.20 | "Add where you posted it" and "Posted on" (posts on) | "Your post's address (Farcaster, Bluesky or Lens)", "Add"; "Added." / "Already listed." / "That post doesn't link to this version's page. Add the page's link to your post, then add it here." / "You can add 20 posts a day. More tomorrow (00:00 UTC)."; "Posted on", "See it on ‹network›", "Remove", "Posts that link to this page, newest first, as their writers or the people who added them listed them. Shown as links only." |
| 7.21 | Remix buttons and the sheet form on a challenge character | invited only → anyone signed in, inside the window, once Privacy has L1 (the Generate gate still applies) |

Not words, but noticeable: the site-wide free image spend cap is $15 a day from 6 Nov 09:00 PT to the close, $2 otherwise.

### Migration: NEXT_remix_challenge → 0034

Adds `studio.challenge_marks`, `studio.version_posts` and `studio.challenge_eligibility`. Needs 0001 (and
`studio.element_versions`).

**Production, read-only:** `studio.element_versions` (id uuid, element_id uuid, created_at timestamptz) and
`studio.elements` (id uuid, status text) exist with those types; none of the three new tables exists yet; **14
published versions** to test with (6 design, 2 image, 6 text).

**Its read-back is already two-part** (copied unchanged from the branch). **PGlite: (a) 16 of 16 true; (b) passes
twice; (a) shows false with a planted `grant update`; (b) raises with a planted check.** It also passes inside the
branch's own `test:challenge`. All four migrations applied together in this order also pass every read-back.

Dry run:

```sql
-- NEXT_remix_challenge.DRY-RUN.sql — the dry run of supabase/migrations/NEXT_remix_challenge.sql: the same SQL,
-- ending in rollback, so nothing is kept. Run as postgres in the Supabase SQL Editor. It should finish with no error.
-- Any error here means: stop, and don't run the migration.

begin;

create table if not exists studio.challenge_marks (
  id bigint generated always as identity primary key,
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid > 0),
  character text not null check (character ~ '^[a-z0-9-]{1,40}$'),
  version_id uuid not null references studio.element_versions(id),
  marked_at timestamptz not null default now()
);
create index if not exists challenge_marks_person on studio.challenge_marks (challenge, fid, character, marked_at desc);

create table if not exists studio.version_posts (
  id bigint generated always as identity primary key,
  version_id uuid not null references studio.element_versions(id),
  network text not null check (network in ('farcaster', 'bluesky', 'lens')),
  post_id text not null check (length(post_id) between 1 and 200),
  handle text not null check (handle ~ '^[a-z0-9][a-z0-9._-]{0,252}$'),
  posted_at timestamptz not null,
  url text not null check (
    (network = 'farcaster' and url ~ '^https://farcaster\.xyz/[a-z0-9._-]{1,64}/0x[0-9a-f]{8,40}$')
    or (network = 'bluesky' and url ~ '^https://bsky\.app/profile/did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,253}/post/[A-Za-z0-9]{1,64}$')
    or (network = 'lens' and url ~ '^https://hey\.xyz/posts/[a-z0-9]{1,64}$')
  ),
  fid bigint not null check (fid <> 0),
  added_at timestamptz not null default now(),
  constraint version_posts_once unique (version_id, network, post_id)
);
create index if not exists version_posts_version on studio.version_posts (version_id, posted_at desc);
create index if not exists version_posts_person on studio.version_posts (fid, added_at);

create table if not exists studio.challenge_eligibility (
  version_id uuid primary key references studio.element_versions(id),
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid > 0),
  decision text not null check (decision in ('admin', 'invited', 'score', 'below', 'unchecked')),
  score numeric(6, 5) check (score is null or (score >= 0 and score <= 1)),
  eligible boolean not null,
  checked_at timestamptz not null default now(),
  constraint score_with_its_decision check ((decision in ('score', 'below')) = (score is not null)),
  constraint eligible_follows_decision check (eligible = (decision in ('invited', 'score')))
);
create index if not exists challenge_eligibility_person on studio.challenge_eligibility (challenge, fid);

alter table studio.challenge_marks enable row level security;
alter table studio.challenge_eligibility enable row level security;
alter table studio.version_posts enable row level security;
drop policy if exists writer_read on studio.challenge_marks;
create policy writer_read on studio.challenge_marks for select to studio_writer using (true);
drop policy if exists writer_insert on studio.challenge_marks;
create policy writer_insert on studio.challenge_marks for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.challenge_eligibility;
create policy writer_read on studio.challenge_eligibility for select to studio_writer using (true);
drop policy if exists writer_insert on studio.challenge_eligibility;
create policy writer_insert on studio.challenge_eligibility for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.version_posts;
create policy writer_read on studio.version_posts for select to studio_writer using (true);
drop policy if exists writer_insert on studio.version_posts;
create policy writer_insert on studio.version_posts for insert to studio_writer with check (true);
drop policy if exists writer_delete on studio.version_posts;
create policy writer_delete on studio.version_posts for delete to studio_writer using (true);
revoke all on studio.challenge_marks from anon, authenticated;
revoke all on studio.version_posts from anon, authenticated;
revoke all on studio.challenge_eligibility from anon, authenticated;
revoke update, delete, truncate on studio.challenge_marks from studio_writer;
revoke update, truncate on studio.version_posts from studio_writer;
revoke update, delete, truncate on studio.challenge_eligibility from studio_writer;
grant select, insert on studio.challenge_marks to studio_writer;
grant select, insert, delete on studio.version_posts to studio_writer;
grant select, insert on studio.challenge_eligibility to studio_writer;

-- The dry run keeps nothing.
rollback;
```

Migration:

```sql
-- NEXT_remix_challenge.sql — the remix challenge's entry marks and "Posted on". Branch remix-challenge, owner
-- 2026-10-31 (docs/proposals/remix-challenge-plan.md, build list items 2 and 3). NOT APPLIED. It takes the next free
-- number at merge, checked against origin/main and production.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001 only.
-- One transaction: all of it or none. Safe to run twice. First run supabase/drafts/NEXT_remix_challenge.DRY-RUN.sql
-- (the same SQL ending in rollback), then this, then both parts of supabase/drafts/READ-BACK-remix_challenge.sql.
--
-- What it adds (no table is publicly readable: no public read policy, and anon and authenticated lose every
-- privilege 0001's default privileges gave them; the site reads them on the server, as studio_writer):
-- 1. studio.challenge_marks: "Mark as my entry". A person (FID) marks one of their own versions as their entry for a
--    challenge character; append-only, the latest row per (challenge, fid, character) counts. Without a mark, their
--    latest version in the window counts, so the site works without this table (marking says "not available yet").
-- 2. studio.version_posts: "Posted on". A post on Farcaster, Bluesky or Lens that links to a version's page, added by a
--    signed-in person after our server read it from that network's own API and found the link. Kept: the network, the
--    post's id there, the writer's handle, when it was posted, its address (rebuilt by us), who added it (fid: a FID,
--    or minus a wallet account) and when. Never the post's words, avatar or pictures. One row per post per version.
--    The person who added it, or a moderator, can remove it (a delete: the row is gone).
-- 3. studio.challenge_eligibility: whether a version can count as an entry, decided once, when it is published
--    (owner, 2026-10-31: "checked once at publish and stored; never on page view"). One row per version: its maker's
--    FID, the decision ('admin': never eligible; 'invited': IMAGES.invited; 'score' or 'below': the Neynar score at
--    publish, kept here with it; 'unchecked': Neynar didn't answer, so it doesn't count), whether it is eligible, and
--    when it was decided. Pages read only this; Neynar is never asked when someone views a page. Append-only.
--
-- studio_writer's privileges: challenge_marks and challenge_eligibility select and insert (no update, delete or
-- truncate); version_posts select, insert and delete (no update or truncate).

begin;

create table if not exists studio.challenge_marks (
  id bigint generated always as identity primary key,
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid > 0),
  character text not null check (character ~ '^[a-z0-9-]{1,40}$'),
  version_id uuid not null references studio.element_versions(id),
  marked_at timestamptz not null default now()
);
create index if not exists challenge_marks_person on studio.challenge_marks (challenge, fid, character, marked_at desc);

create table if not exists studio.version_posts (
  id bigint generated always as identity primary key,
  version_id uuid not null references studio.element_versions(id),
  network text not null check (network in ('farcaster', 'bluesky', 'lens')),
  post_id text not null check (length(post_id) between 1 and 200),
  handle text not null check (handle ~ '^[a-z0-9][a-z0-9._-]{0,252}$'),
  posted_at timestamptz not null,
  url text not null check (
    (network = 'farcaster' and url ~ '^https://farcaster\.xyz/[a-z0-9._-]{1,64}/0x[0-9a-f]{8,40}$')
    or (network = 'bluesky' and url ~ '^https://bsky\.app/profile/did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,253}/post/[A-Za-z0-9]{1,64}$')
    or (network = 'lens' and url ~ '^https://hey\.xyz/posts/[a-z0-9]{1,64}$')
  ),
  fid bigint not null check (fid <> 0),
  added_at timestamptz not null default now(),
  constraint version_posts_once unique (version_id, network, post_id)
);
create index if not exists version_posts_version on studio.version_posts (version_id, posted_at desc);
create index if not exists version_posts_person on studio.version_posts (fid, added_at);

create table if not exists studio.challenge_eligibility (
  version_id uuid primary key references studio.element_versions(id),
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid > 0),
  decision text not null check (decision in ('admin', 'invited', 'score', 'below', 'unchecked')),
  score numeric(6, 5) check (score is null or (score >= 0 and score <= 1)),
  eligible boolean not null,
  checked_at timestamptz not null default now(),
  constraint score_with_its_decision check ((decision in ('score', 'below')) = (score is not null)),
  constraint eligible_follows_decision check (eligible = (decision in ('invited', 'score')))
);
create index if not exists challenge_eligibility_person on studio.challenge_eligibility (challenge, fid);

alter table studio.challenge_marks enable row level security;
alter table studio.challenge_eligibility enable row level security;
alter table studio.version_posts enable row level security;
drop policy if exists writer_read on studio.challenge_marks;
create policy writer_read on studio.challenge_marks for select to studio_writer using (true);
drop policy if exists writer_insert on studio.challenge_marks;
create policy writer_insert on studio.challenge_marks for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.challenge_eligibility;
create policy writer_read on studio.challenge_eligibility for select to studio_writer using (true);
drop policy if exists writer_insert on studio.challenge_eligibility;
create policy writer_insert on studio.challenge_eligibility for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.version_posts;
create policy writer_read on studio.version_posts for select to studio_writer using (true);
drop policy if exists writer_insert on studio.version_posts;
create policy writer_insert on studio.version_posts for insert to studio_writer with check (true);
drop policy if exists writer_delete on studio.version_posts;
create policy writer_delete on studio.version_posts for delete to studio_writer using (true);
revoke all on studio.challenge_marks from anon, authenticated;
revoke all on studio.version_posts from anon, authenticated;
revoke all on studio.challenge_eligibility from anon, authenticated;
revoke update, delete, truncate on studio.challenge_marks from studio_writer;
revoke update, truncate on studio.version_posts from studio_writer;
revoke update, delete, truncate on studio.challenge_eligibility from studio_writer;
grant select, insert on studio.challenge_marks to studio_writer;
grant select, insert, delete on studio.version_posts to studio_writer;
grant select, insert on studio.challenge_eligibility to studio_writer;

commit;
```

Read-back (a):

```sql
select c.what, c.ok from (
  select 'challenge_marks exists' as what, to_regclass('studio.challenge_marks') is not null as ok
  union all select 'version_posts exists', to_regclass('studio.version_posts') is not null
  union all select 'challenge_eligibility exists', to_regclass('studio.challenge_eligibility') is not null
  union all select 'challenge_eligibility has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.challenge_eligibility')), false)
  union all select 'studio_writer can select and insert challenge_eligibility', coalesce(has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'INSERT'), false)
  union all select 'studio_writer cannot update, delete or truncate challenge_eligibility', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'DELETE') or has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'TRUNCATE')), false)
  union all select 'challenge_marks has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.challenge_marks')), false)
  union all select 'version_posts has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.version_posts')), false)
  union all select 'studio_writer can select and insert challenge_marks', coalesce(has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'INSERT'), false)
  union all select 'studio_writer cannot update, delete or truncate challenge_marks', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'DELETE') or has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'TRUNCATE')), false)
  union all select 'studio_writer can select, insert and delete version_posts', coalesce(has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'INSERT') and has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'DELETE'), false)
  union all select 'studio_writer cannot update or truncate version_posts', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'TRUNCATE')), false)
  union all select 'anon and authenticated have no privilege on either', coalesce(not exists (
      select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.challenge_marks', 'studio.version_posts', 'studio.challenge_eligibility']) t, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
      where to_regclass(t) is null or has_table_privilege(r, to_regclass(t), p)), false)
  union all select 'only studio_writer policies on either', not exists (
      select 1 from pg_policies where schemaname = 'studio' and tablename in ('challenge_marks', 'version_posts', 'challenge_eligibility') and roles <> '{studio_writer}'::name[])
  union all select 'the expected policies exist (7)', (select count(*) from pg_policies where schemaname = 'studio' and tablename in ('challenge_marks', 'version_posts', 'challenge_eligibility')) = 7
  union all select 'a published version exists to test with', exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id where e.status = 'published')
) c;
```

Read-back (b):

```sql
do $$
declare
  v uuid;
  mark_id bigint;
  post_id bigint;
  n int;
  refused boolean;
begin
  select v0.id into v from studio.element_versions v0 join studio.elements e on e.id = v0.element_id
    where e.status = 'published' and not exists (select 1 from studio.challenge_eligibility x where x.version_id = v0.id) order by v0.created_at limit 1;
  if v is null then raise exception 'READ-BACK FAILED: no published version to test with'; end if;

  -- A decision that contradicts itself (a score below the threshold marked eligible) is refused.
  refused := false;
  begin
    insert into studio.challenge_eligibility (version_id, challenge, fid, decision, score, eligible) values (v, 'remix-2026-11', 500, 'below', 0.42, true);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a contradictory eligibility decision was kept'; end if;

  -- A realistic eligibility decision, as the publish route stores it: FID 500, Neynar score 0.81 at publish.
  insert into studio.challenge_eligibility (version_id, challenge, fid, decision, score, eligible) values (v, 'remix-2026-11', 500, 'score', 0.81, true);
  select count(*) into n from studio.challenge_eligibility where version_id = v and fid = 500 and decision = 'score' and score = 0.81 and eligible and checked_at > now() - interval '1 minute';
  if n <> 1 then raise exception 'READ-BACK FAILED: the eligibility decision did not read back'; end if;

  -- A realistic mark: FID 6786 marks this version as their Zei entry.
  insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 6786, 'zei', v) returning id into mark_id;
  select count(*) into n from studio.challenge_marks where id = mark_id and fid = 6786 and character = 'zei' and version_id = v and marked_at > now() - interval '1 minute';
  if n <> 1 then raise exception 'READ-BACK FAILED: the mark did not read back'; end if;

  -- A realistic post on each network.
  insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
    values (v, 'farcaster', '0x0a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'naaate', now() - interval '1 hour', 'https://farcaster.xyz/naaate/0x0a1b2c3d', 6786) returning id into post_id;
  insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
    values (v, 'bluesky', 'at://did:plc:abcdefghijklmnopqrstuvwx/app.bsky.feed.post/3mz6hon3w6c2h', 'someone.bsky.social', now() - interval '2 hours', 'https://bsky.app/profile/did:plc:abcdefghijklmnopqrstuvwx/post/3mz6hon3w6c2h', -12);
  insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
    values (v, 'lens', '25371949111464640548176823129788244947682797056317189597818095179944227075316', 'someone', now() - interval '3 hours', 'https://hey.xyz/posts/1q4tkta5f47sz8032wm', 6786);
  select count(*) into n from studio.version_posts where version_id = v and fid in (6786, -12) and added_at > now() - interval '1 minute';
  if n <> 3 then raise exception 'READ-BACK FAILED: % of 3 posts read back', n; end if;

  -- The same post twice on one version is refused.
  refused := false;
  begin
    insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
      values (v, 'farcaster', '0x0a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'naaate', now(), 'https://farcaster.xyz/naaate/0x0a1b2c3d', 6786);
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: the same post was kept twice'; end if;

  -- An address that isn't the network's own post address is refused.
  refused := false;
  begin
    insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
      values (v, 'farcaster', '0xffff', 'naaate', now(), 'https://evil.example/naaate/0x0a1b2c3d', 6786);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a post address on another host was kept'; end if;

  -- A mark with a wallet number (not a FID) is refused.
  refused := false;
  begin
    insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', -12, 'bai', v);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a mark without a FID was kept'; end if;

  delete from studio.version_posts where version_id = v and fid in (6786, -12) and added_at > now() - interval '1 minute';
  delete from studio.challenge_eligibility where version_id = v and fid = 500 and checked_at > now() - interval '1 minute';
  select count(*) into n from studio.challenge_eligibility where version_id = v and fid = 500;
  if n <> 0 then raise exception 'READ-BACK FAILED: the test eligibility decision was left behind'; end if;
  delete from studio.challenge_marks where id = mark_id;
  select count(*) into n from studio.version_posts where version_id = v and added_at > now() - interval '1 minute';
  if n <> 0 then raise exception 'READ-BACK FAILED: test posts left behind'; end if;
  select count(*) into n from studio.challenge_marks where id = mark_id;
  if n <> 0 then raise exception 'READ-BACK FAILED: the test mark was left behind'; end if;
  raise notice 'READ-BACK PASSED: an eligibility decision, a mark and three posts inserted, read back, bad rows refused, all deleted';
end $$;
```

### Rebase test

Rebases onto main with no conflict. tsc ✓; `check:principles` 56 of 57 (P6d only); `test:challenge` 198 of 198.
(One line in its log, "posts: the network did not answer", is a check that the site copes when a network is down; it
passed.) It also merges cleanly on top of all the other branches here.

### Decisions owed

- Reread 7.1 to 7.9; entries and posts on at merge, or later.
- Starting sheets: Option A (crop the seeded renders, $0) or B (new views, about $0.12 to $0.30 for six), and the go
  for the seeding `--apply` before Fri 6 Nov 09:00 PT. Without them, five characters say "No sheet … is published yet."
- Publish Techno vistas first (so the sheets' "made in" style link isn't empty)?
- Gladias: release from `held` after the privacy-robe check, or keep him held.
- 7.13's "with what it raises going to everyone it was built on", next to principle 7's "no promises" and Terms §2's
  "Nothing else here is for sale": keep, soften, or wait for the mint page's own Terms.
- The /challenge rules (Draft wording): approve.
- P5g and P6q in `docs/principles.md`: yes or no.
- From the plan, still yours: the poidh bounty amount (solo or open), the extra reward pot, the mint price, your own
  originality share (recommended: the support wallet), jurors and models for the credit test.

---

## Other branches found

Searched every remote branch not merged into main for `docs/legal/*-draft.md`, `legal.ts`, consent files and `NEXT_`
migrations. Besides the six above:

| Branch | What waits | Status |
|---|---|---|
| `minpentai-agent-play` | `docs/legal/minpentai-agent-play-draft.md` (v4, approved 2026-10-31, recorded as reread at merge); `NEXT_minpentai_agent_matches`, `NEXT_minpentai_resume_ruleset` | Waits for one-engine, then the stronger computer (your order of 2026-10-30). Its Terms §6d clashes with remix-challenge's §6d. |
| `minpentai-search-ladder`, `minpentai-cap10-120` | `NEXT_minpentai_resume_ruleset` (adds `mp_snap_resume.ruleset`; not on production) | No legal lines. Same migration on three branches: it takes one number, at the first of them to merge. |
| `chat-search-live` (2026-10-24) | `NEXT_chat_block_vectors` (`studio.block_vectors`; not on production) | No legal lines; older. |
| `next-version` | `docs/legal/assistant-agent-draft.md` (the assistant as an agent; reread 2026-10-29 with one change) | Not built; ships with the feature. |
| `fund-block` | `docs/legal/fund-draft.md` | Superseded by the support pages (its own report says so). Nothing to reread. |
| `record-takes`, `editor-v2`, `consent-v5-drafts`, `payment-recovery`, `merge-thursday`, `refund-on-outage` | older drafts (2026-10-14 to 10-19) | Stale; superseded by what's live. Not reread here. |

None of these needs a migration number before the four above if merged in this doc's order.

## Production checks (read-only)

One read-only transaction as `studio_writer` (`transaction_read_only = on`), SELECT only, Postgres 17.6:
- 0030 is applied (`studio.admin_picks`, `studio.seeded_hidden` exist).
- None of the tables the four migrations create exists: `agent_failures`, `social_hidden`, `social_accounts`,
  `social_links`, `challenge_marks`, `version_posts`, `challenge_eligibility`. Nor do the other branches'
  (`mp_agent_matches`, `block_vectors`, `mp_snap_resume.ruleset`).
- Roles `studio_writer`, `anon`, `authenticated` exist; studio_writer can't create in `studio` (so `postgres` must run
  them, as each file says).
- Referenced columns and types, and rows to test with, as given in each block.

## Principles

- **P6 (privacy, honest texts):** concern, flagged above: three drafts no longer match today's texts (social-read's
  Terms §7, signin's Privacy §3 "token", remix's stale "no token" note); the Plan A and signin drafts still say "You
  page"; signin's Privacy §4 promises an unlink page that doesn't exist; signin's free-images refusal disagrees with its
  Terms §4 under variant A. Each is a decision above, none changed on a branch.
- **P6b (migrations tested):** pass: every migration and read-back here was run in PGlite on all of main's
  migrations, singly and all four together; the three rewritten read-backs are new and pass, and each part catches a
  planted violation.
- **P5 (no hidden ordering) and P7 (nothing sold beyond prepaid generations):** concern on wording only: remix's
  mint sentence (7.13). Principle ids clash (P5f, P6p) between branches.
- **P6d:** fails, the accepted open item, on every branch checked.
- No new tension found. This doc changes no code.
