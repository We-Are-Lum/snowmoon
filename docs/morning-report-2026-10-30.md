# Morning report, 2026-10-30 (overnight run)

Rules kept:
- branches and worktrees only;
- one merge (ui-check-name-timeouts, as you said);
- no migration applied (drafts only), no fal account change;
- model spend **$1.77 of the $3**.

Every branch below is pushed and none is merged. Each has a branch report in `docs/branch-reports/` on its branch.

## At a glance: what each branch needs from you

| Branch | Head | State | What it needs from you |
|---|---|---|---|
| `main` (#63 ui-check-name-timeouts) | 02ddf08 | **Merged, live, all checks pass** | Nothing |
| `agent-pictures` (Plan A parts 1 and 2) | 97d32e4 | Built, tests pass; trial 5 ran on it | Part 1: reread + "applied" (NEXT_agent_pictures); part 2: reread `docs/legal/agents-part2-draft.md`; then your choice of assistant routing (section 1) |
| `phase2-admin` | a863e7c | Built, UI check and principles pass | Paste `NEXT_admin_picks.sql` (dry run, real, read-back); reread the two Terms §7 sentences in `docs/legal/picks-draft.md`; decide the 4 open points in section 2 |
| `dashboard-rename` | 1df20e0 | Built, UI check passes | Reread `docs/legal/dashboard-rename-draft.md` (Terms 6b and Privacy §4 still say "You page"); say whether published pictures belong on the public profile before consent v5 |
| `social-read` | e95f596 | Built, switched off, UI check passes | Reread `docs/legal/social-read-draft.md` (Privacy §6, §7, Terms §7); paste `NEXT_social_read.sql`; then the switch `SOCIAL_READ.show` goes on in the merge |

## 0. ui-check-name-timeouts: merged (#63, 02ddf08)

- Production serves 02ddf08.
- check:shipped passes. Principles: 53 pass, 0 fail, 1 not run (P6d). Miniapp passes.
- UI check on a local build of the merge: **passed, 59 pages**. Full logs kept.
- From now on, a check that breaks ends with one line naming the last page it opened and the error.
- Qwen skipped, as you said.

## 0b. The fal admin key is dead

One GET of `https://api.fal.ai/v1/storage/settings` with it answered **401**. The `FAL_ADMIN_KEY` line is removed from
`~/snowmoon/.env.local`, confirmed without printing (0 lines left). It wasn't used for anything else.

## 1. Assistant model: trial 5, the hybrid

gpt-oss-120b answers book questions; Kimi K3 does the making. Both run through the Vercel AI Gateway with zero
retention required on every call, and every call confirmed it (Baseten served them all). It ran the same 7 scenarios
plus the 5 new ones:
- a place reference;
- a style with a sample;
- a moment picture;
- a camera change on your shot 14-b1-6;
- a song (no tool covers it).

The draft tools are the site's real code on agent-pictures, with only the database stood in.

The transcripts are on this branch, in `docs/trials/`:
- `trial-5-hybrid-A.md`
- `trial-5-hybrid-B.md`
- `trial-5-hybrid-C.md`

Their scripts are beside them.

| Variant | How it switches to Kimi | Result | Cost |
|---|---|---|---|
| **A** (as you described it) | when gpt-oss calls match_request and it finds a tool | **Switched in only 3 of 12.** gpt-oss mostly doesn't call match_request, so most make requests stayed on gpt-oss: its made-up style lists and no gap for the comic came back | $0.47 for 12, $0.039 each |
| **B** | a forced routing call on gpt-oss each turn, shown the whole conversation | Called everything "make", even "What is a Keeper?" | $0.63 for 12, $0.052 each |
| **C** (recommended) | a forced routing call on gpt-oss each turn, shown only two lines of instructions and the person's latest message; once "make", the conversation stays on Kimi | **All 12 routed right** (and 10 of 10 in a separate routing test); the comic and the song each logged a gap; only offered styles named | $0.67 for 12, **$0.056 each** |

Cost per conversation, variant C:
- book question (gpt-oss only): **$0.0009**;
- making (Kimi K3): **$0.06 on average** ($0.009 for the song refusal, up to $0.15 for the 8-panel comic plan);
- the routing call: $0.0001 a turn.

What the **$2 a day** would allow, if the assistant's model cost counted against it:

| | Per day |
|---|---|
| Book questions only | about 2,200 |
| Make conversations, nothing made | about 32 |
| Make conversations, each with one picture made ($0.0065) | about 29 |
| Make conversations, each with one frame made ($0.05) | about 18 |

Today the $2 counts only what you approve with Make it. The assistant's own model cost is kept only as daily totals
for everyone (Privacy §5), so counting it per person would be new, and would need its own Privacy line.

Still wrong in variant C, for your judging:
- **The new style (9):** it said the style "becomes available for any pictures you draft next". It doesn't: a drafted
  style is private until published.
- **The camera change (3):** it said Keep "puts it in your version". Keep keeps the draft; putting kept edits into a
  new version is the next step.
- **The arena (6):** it tried a glossary target that doesn't exist, then recovered from the refusal's next step.

## 2. phase2-admin

See `docs/branch-reports/phase2-admin.md` on the branch.

- **ADMINS is now the one list every admin power reads.** It replaces the moderators list, the image review's owners,
  the old "maintainer" (FID 6786 alone) who could hide anyone's frames, storyboards and versions, the storage check,
  the 300-images-a-day count and the image gate.
- **Admin Hide in the reader:** seeded images go into a new table; readers' images go through the moderator's hide.
- **Make an image from any run of blocks** in one chapter, for admins (up to 400).
- **`/admin/review`:** a page per chapter and per glossary word, every image with Hide and Pick.
- **Picks with the switch** "Picked by @… · Most liked · Newest · Liked by me", the choice kept on the device. They
  show on chapter moments and References → Glossary cards.

Checks:
- Build passes. UI check: **passed, 59 pages**, with new checks for the review page and a chapter pick.
- Principles (static): **53 pass, 0 fail**. P5b now also covers `isAdmin`, so the remix hide code moved into its own
  file.
- test:remix 19/19; test:db-swaps passes.

Two real problems found and fixed on the way (root-caused, not rerun away):
1. The build timed out on 7 chapter pages. Each page was reading the new hidden-images table on the build worker's one
   database connection. Now it reads once per worker, and a slow read fails the build.
2. A UI check failed: `/chapter/1?view=listen` "didn't go quiet". Its picks request queued behind a database read
   stalled over 5 seconds, after 120 reads of a table that doesn't exist yet. Now the missing table is remembered for
   a minute, the reads have time limits, and the browser gives up after 8 seconds. The rerun passed with 0 failed
   reads.

Open points for you:
1. A hidden seeded image still shows on the home page and About (the intro's hand-chosen cards) and in quote cards.
   Should a hide reach those too?
2. Seeded images can't be unhidden from the site (admins only hide).
3. Word picks show on References only, not yet on the glossary's word pages.
4. **@garance gets every power you had alone.** That's what "ADMINS replaces the scattered owner lists" says; flagged
   because it's a real change.

## 3. dashboard-rename

Built by a background agent; I checked its branch and report.
- **The rename:** /you and every page under it redirect permanently to /dashboard. Every link, menu and title,
  agents.md and the agent tools now say Dashboard. `/api/you` keeps its address.
- **`/@<fname>`** now also lists published pictures, each with its AI label. Remix frames and storyboards stay off, as
  you decided on 2026-10-19 (until consent v5). Nothing published reads "Nothing published yet."; an unknown name
  gives a 404.

Checks:
- Build passes. UI check: **passed, 59 pages**.
- check:shipped (local): 13/13, including a new /you redirect check.
- Principles: 53 pass, 0 fail.
- test:agents 185; test:agent-api 25/25; test-you-page 74/74.

**Needs you:**
- Reread the "You page" → "Dashboard" lines (Terms 6b, Privacy §4) and an optional Privacy §6 line about the profile.
- Say whether listing someone's published pictures together on their profile is fine before consent v5.

## 4. social-read

Built by a background agent; I checked its branch and report.
- **What it shows:** "Posts that link here", at the end of chapter, image and scene pages. Newest first, at most 20.
  Each post shows the network, @handle, date, its words as a quotation, and a link to it. No avatars or pictures, and
  the reader's browser never contacts either network.
- **How it reads:** the server asks each network once per half hour for posts linking to snowmoon.party.
- **Removal:** moderators get a list on `/moderate` with "Hide: the writer asked" and "Hide: breaks the Terms". Writers
  can ask by email.
- **It's switched off.** Nothing is shown or fetched until you reread, paste the migration, and turn it on.

Free tiers:
- **Farcaster via Neynar:** "feed by embed URL" works on the free plan. Reading every half hour uses about 0.6M of the
  free 10M credits a month. **Not tested live**: the key lives on Vercel, not this machine.
- **Bluesky:** search by domain works without an account, but only on `api.bsky.app` (the documented public host
  answers 403), and only the latest 100 posts.

Checks:
- Build passes. UI check: **passed, 59 pages**.
- test:social-read 60/60.
- Principles against production: 55 pass, 0 fail, 1 not run (two new checks, including P6p, which keeps the switch off
  until Privacy names Bluesky).

Side effect to know: chapter pages are now rebuilt at most every 30 minutes, so new posts can appear on them.

## Corrections to earlier reports

- **Lint:** this repo has no `lint` script, and ESLint isn't installed. When I said lint passed, the command ran
  nothing. Both agents found this.
- **Principles against a local build:** P6a always fails there, because it counts the site's own picture hosts
  (media.snowmoon.party, pictures.snowmoon.party) as third parties when the address under test is localhost. The
  hosts it lists are only those. Against production it passes.

## Principles

- **P4 (a person's action): pass on all branches.**
  - Agents still only draft.
  - Picks and hides are admins' taps.
  - Social posts are only shown after your switch, and hidden by a moderator's tap.
- **P2 (AI labels): pass.** Picked images and profile pictures carry their AI label.
- **P3 (open models): concern.** The hybrid uses gpt-oss-120b and Kimi K3, both open weights, through zero-retention
  hosts only. Qwen 3.8 Flash Next is skipped, as you said. The book's declared models are Kimi K3 and Qwen 3.8 Flash
  Next; the hybrid uses only one of them.
- **P5 (no canon, labelled picks): pass** on phase2-admin. P5b now covers `isAdmin`. No ordering by engagement in
  social-read (newest first only).
- **P6 (privacy, no third parties): pass**, with P6d still your accepted open item. The new tables aren't public. The
  pick switch sends nothing. Social posts are fetched by our server only.
- **Tension:**
  - Admins' powers now include @garance for everything you held alone.
  - The profile now lists published pictures before consent v5.

  Both are for you to confirm.
