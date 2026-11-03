# Minpentai: one engine, version links, any board size: plan

Plan, approved with changes by the owner on 2026-10-21. Written by the coding agent. Branch `minpentai-one-engine` (worktree `~/snowmoon-one-engine`, from origin/main b770a17). **Status (2026-10-21):** A steps 1–5 and C built and committed (c70f7d7, 31f3c4f), the onchain handover written (f874dfa), the visibility change committed on its own (1e2e2ff). Stopped at the checkpoint, before B. Nothing pushed, deployed or merged.

It builds on the spike (`minpentai-versions-spike`, doc `docs/proposals/minpentai-versions.md`) and your five decisions of 2026-10-21.

**Owner's changes to this plan (2026-10-21), applied below where they bear on it:**
1. Checkpoint after A steps 1–5 and C; stop before B.
2. Step 6 (onchain) is a handover spec, `docs/proposals/minpentai-onchain-handover.md`, including format 4. Nothing on `minpentai-onchain` is edited (another session is building there).
3. Manifests are rules only: exactly what `replayVersion` needs. Title, line, idea, prompt, author and parent live in `mp_versions` columns (published on Recipe, removable under docs/removal.md). Only the rules-only manifest goes to Arweave. Identical rules give the same ID and link; Share then says "This version already exists by @x" and links to it. The Share screen and Privacy wording follow this.
4. Arweave: ArDrive Turbo (free under 105 KiB per ar.io's docs, checked 2026-10-21), with a dedicated uploader key in server env only, never the owner's wallet or the Safe. Until it's set up: database, "not yet on Arweave".
5. 10-character IDs and 10 trials per version per day: approved.
6. Play accepting a seed and moves in the URL: dropped. The snap branch built `/minpentai?match=` and re-applies it after this merges, so that URL's handling is not touched here.
7. The versions migration is named by topic with no number (`supabase/migrations/NEXT_minpentai_versions.sql`) while the branch is unmerged. At merge it takes the next free number, checked against main and production (0018–0024 applied, 0025 reserved by the snap branch as of 2026-10-22), and its paste files and mentions are updated then (owner's standing rule, 2026-10-22).

## A correction first

In the spike I wrote that a version "becomes a ruleset manifest with no contract change". That is true for Play-sized versions, but not for larger ones:
- **Squares.** Encoding format 3 (onchain branch, `encoding.ts`) packs a square as one byte, `y*15+x`, so a board can have at most 256 squares. A 25 × 16 board has 400.
- **Steps.** It refuses any end step above 96.
- **Hits.** It keeps square hits only as "1 or 2+", so `squareHits` 3–4 is lost.

Recording any version therefore needs a format 4, and MatchLog checks `FORMAT_VERSION == 3`. Nothing is deployed (onchain-v1.md: "local anvil only"), so the fix is to make format 4 the only format before the first deploy. It is a constant and an encoder change, plus rebuilt fixtures. Part A, step 6 has the details.

## The approach in one paragraph

`versions/engine.ts` becomes the only engine. Play today becomes one version among many, `SOLO_V1`: the empty version, with Play's four drawn rules and its 15 × 10 board. `game.ts` first turns into a thin adapter that keeps its exact API, so every caller works unchanged. Then each caller moves to the engine directly, in the order of part C. When nothing imports `game.ts`, it is deleted. At every step, Play must play exactly as it does today, checked against a frozen copy of today's `game.ts`. One-on-one stays Play-only (solo-v1) in this round, so its stored matches and table need no migration. Versions are solo, against the computer.

## A. One engine

**Steps**, each one commit, each passing the gate below before the next:
1. **Bring in the spike code**, by cherry-picking `versions/*` and its test. Move `rng` and `fmt` out of `game.ts` into `play-game/rng.ts`, so the engine no longer imports `game.ts`.
2. **Freeze the reference.** Copy today's `game.ts` to `scripts/fixtures/minpentai/game-2026-10-21.ts`, used by tests only and never shipped. The identity tests compare against this copy, so they still mean something after `game.ts` changes.
3. **Make the engine take old state.** A world saved before this change has no `kills`, and its rocks are `1`. The engine fills `kills` in when it is missing, and reads any rock value above zero as a rock. So old saved one-on-one matches and old `#fp=` free-play links load as they are.
4. **Add `SOLO_V1`** (`versions/solo-v1.ts`): the empty version, Play's layout and drawn rules, and `engineFor(version)`. Turn `game.ts` into an adapter over `engine(SOLO_V1 layout)`. The rule-id functions (`RULES`, `RULE_IDS`, `drawRule`, R/every/cost by id) map onto `BASE_DRAWN`, whose ids and texts are the same.
5. **Snap.** It imports `W, K, XY, D4, D8, RULES, lit, botPlan…` from `game.ts`, so it keeps working through the adapter. Moving it to versions waits for its own branch:
   - Its worktree has another session's half-finished, uncommitted edit (`state.ts` / `moves.ts`). I won't touch it.
   - When it moves: the token carries the version's short ID; `moves.ts` uses `W*H` instead of 150 (two base64url characters hold 4,096 codes, and 25 × 16 needs 4,000); `cell_grid` takes `rows: H` (the snap allows 32 × 16); the run GIF sizes its cells to fit 640 × 360.
   - The snap's match loop is a copy of the controller's. It should call the same per-turn function as Play (part C, step 3) instead.
6. **The onchain branch** (`minpentai-onchain`). Changes, all before any deploy:
   - **Replay.** `onchain/replay.ts` calls `replayVersion(SOLO_V1, match)`. Its closure becomes `onchain/replay.ts`, `versions/replay.ts`, `versions/engine.ts`, `versions/schema.ts`, `play-game/rng.ts`. Today it is `game.ts`, `live-types.ts`, `play-server/match.ts`.
   - **Base ruleset ID.** solo-v1.json is rebuilt with `build-minpentai-ruleset.ts`: new commit, file hashes, `closureHash`, the six `codeHash`es and `computerPlayers[].code.file` (`versions/engine.ts`). So the ID changes from 0x9107…dd82. That's fine: it isn't registered or deployed anywhere.
   - **Fixtures.** Rebuild `contracts/minpentai/fixtures/onchain.json` (`build-minpentai-onchain-fixtures.ts`). The other onchain tests read the ID from solo-v1.json and follow it. `RulesetRegistry.t.sol`'s `SOLO_V1` constant is an arbitrary ID and can stay.
   - **Encoding format 4.** Squares as u16; end step checked against the manifest's `maxSteps` (u8 holds 240); square hits 1–4 and rock hits kept in the final position; level still 0–5. MatchLog's `FORMAT_VERSION` becomes 4. Re-run the Forge tests, the mutants and Slither.
   - **Verifier, entry points.** `verify.ts:118` allows exactly two entries: `onchain/replay.ts#replaySolo` and `versions/replay.ts#replayVersion`. `importClosure` starts from the manifest's entry, and the sandbox's esbuild entry follows it. For a version the bundle runs `replayVersion(manifest.version, match)`, with the same vm limits (no clock, no randomness, 10 s a call, only JSON across).
   - **Verifier, unregistered versions.** Player versions aren't in the registry (your decision 3). The verifier gains a source of version manifests: Arweave transaction IDs, or the site's list of shared versions, used only as a locator. It accepts a fetched manifest only if keccak of its sorted JSON equals the ruleset ID in the `MatchRecorded` event. That way a swapped manifest can't hash to someone else's ID, and that match stays "unknown ruleset". The entry and closure must still be one of the two allowed, at a commit in the repository, so a manifest can choose settings but never code.
   - **Verifier, reporting.** It reports version matches per ruleset, with the version's title and whether the version's own playtest passes (the verifier re-runs it, once per version). A win on a version is never counted as a solo-v1 win.
   - **Arweave upload.** The route is planned but not built (onchain-v1.md step 3; the only `ar://` today is a test placeholder). One upload path serves both official rulesets and shared versions. It runs on the server, and a manifest is about 10 KB.
   - **Owner decisions needed before building the Arweave route:** which uploader (ArDrive Turbo has free uploads under 100 KiB, which I'd need to confirm), and who holds its signing key. Until then, Share stores the manifest in our database and marks it "not yet on Arweave".

**The gate.** Every commit in parts A and C must pass all of these, with nothing loosened:
- `test-minpentai-versions`, comparing against the frozen copy: 432 whole matches, 1,600 random boards, 216 solo replays. Extended with one new case: 200 stored one-on-one states (saved in the old format by the current server) resumed under the engine give the same remaining match.
- The existing Play tests, unchanged: `test-minpentai-play` (against Design's mockup), `-ladder`, `-players`, `-play-server`, `-share`, `-agents-md`, and `-snap` on its branch.
- `typecheck` and `check:principles`.

On the onchain branch, also: its ruleset, sandbox, verifier, encoding and fixtures tests, plus `forge test`.

## B. Version links

**Short ID, not the encoded version.** A shared version lives at `snowmoon.party/minpentai/v/<id>`. That's about 45 characters, well inside cast embed and X limits.
- `<id>` is the first 50 bits of the version's ruleset ID, in lowercase Crockford base32, 10 characters (e.g. `k3x9q2m8ab`). The same version always gets the same link, so a version shared twice isn't stored twice.
- On the rare collision (a different ruleset with the same 10 characters), the newcomer gets 12 characters. The database's unique key decides.
- The page shows the version's title, its line, the author's stamp ("Idea and words by @x · rules made by the computer, tested 200 times"), the rules in code-written sentences, Play against Builder/Blocker/…, and Recipe (the prompt, the model, the manifest, the playtest), one tap away.
- Its OG/embed image is the starting board, drawn at the version's size by the card route.
- **Export.** `/minpentai?version=<encoded>` stays as an export and import, under Recipe as "Copy as file / link" and in the editor as "Open from link". It is never the share link.

**The flow, with your decisions:**
1. The editor shows, before you type: "Your idea will be public with your version." (P1)
2. **Idea → draft.** `POST /api/minpentai/versions/draft` calls the model through the gateway (Groq pinned, zero retention), with a daily spend cap like the chat's. The browser shows the version, the rules (code-written) and the model's draft title and line, labelled "Draft by the model". (P2)
3. **Rules the computer can't play.** A version is held back if it uses a rule on the static list (saving points; rock options other than bounce; a tower cap of 5 or more), or if the browser's per-change check shows the computer ignores it: under 5% of 60 matches change when that one change is removed. The editor says "The computer can't play this rule yet", and logs a request to teach the computer (decision 4). The static list is the sweep's 0% rows, and the per-change check catches the same thing in combinations.
4. **Playtest.** 200 matches run in a Web Worker in the browser, for instant feedback (decision 2). "Most matches reach the step limit" is a warning, not a fail (decision 5).
5. **Beat it.** You play against Builder or higher, on a seed the server picks (decision 1). `POST …/trial` issues a seed and level, and asking again cancels your previous trial. You get 10 trials per version per day.
6. **Share.** You write the title and the line yourself; the draft is offered, not filled in. `POST …/share`:
   - re-runs `check()`, the "computer can't play it" check and the full playtest on the server (only this result counts);
   - replays your trial moves with `replayVersion` and confirms a win on the issued seed;
   - stores the version and its manifest, and gives the link.

**Migration** `supabase/migrations/NEXT_minpentai_versions.sql` (no number until merge; see change 7): written, not applied, tested in PGlite like 0021. All tables are server-only, like 0009 (no anon or authenticated access; `studio_writer` only).
- **`studio.mp_versions`** (one row per shared version):
  - `short_id` (pk) and `ruleset_id` (unique);
  - `manifest` as the exact sorted JSON text of the rules-only manifest, so its hash can always be re-checked;
  - `title`, `line` (the creator's words), `idea` (their words, public), `prompt` (the model's input and model name), `author_fid`, `parent_ruleset_id`: never in the manifest, published on Recipe, removable;
  - `playtest` (the server's report), `trial_id`;
  - `arweave_tx` and `arweave_at` (null until uploaded);
  - `hidden_at` and `hidden_by` (moderators can hide, nothing else: P5);
  - `created_at`.

  Kept until erased: removing a person's versions is added to `docs/removal.md`. The Arweave copy can't be erased, which the Share screen and the Privacy page must say.
- **`studio.mp_version_trials`:** `id`, `fid`, `ruleset_id`, `seed`, `level` (check 3–5), `issued_at`, `cancelled_at`, `finished_at`, `won`, `moves` (jsonb). Trials that weren't won are deleted after 7 days by the existing cleanup. A winning trial is kept with its version.
- **`studio.mp_teach_requests`:** `id`, `rule` (the setting or piece), `idea` (the words, already public by P1), `created_at`. No FID.
- **Limits:** new counters in `mp_rate` for drafts, trials and shares per person per day, plus a daily model spend cap.
- **One-on-one:** no change to `mp_matches` this round.

**Legal texts** (see legal-texts-describe-today). Terms and Privacy must describe versions before this goes live: the idea goes to Groq through Vercel AI Gateway; versions are public; the Arweave copy is permanent. Preview only until you've reread them.

## C. The eight files that assume 15 × 10, in order

Each step is one commit and passes the gate.

| Step | File | Runs in | What changes | Why this order |
|---|---|---|---|---|
| 1 | `play-game/board.ts` | browser | `BoardOpts` takes W and H (or the engine). The loops at 76–77 and `cols` at 79 use them; `lit` takes the version's sight (47). Rocks are already truthy-only | Draws only; `test-minpentai-play` compares its cells with Design's. `play-board.tsx` already sizes itself from `cols` |
| 2 | `share-result.ts` | both | Optional `v=<short id>` in the link; with it, the step limit is the version's and the text names it ("Beat Builder on *title*"). Without it, as today (MAXS 96, ladder rung of 5). Old `?r=&s=` links parse unchanged | Small and additive; `test-minpentai-share` covers it |
| 3 | `play-game/controller.ts` | browser | `mk` takes a version: `drawRules`, the layout's start squares and last-seen (159), settings for points, costs, step limit, sight vs reach, square hits and the switch. Rule text from the drawn rule's `{id, text}`, not `RULES[id]`. `ruleNote` reads `directions === 8`. All labels from settings: "Spend 8 points", "OF 8 PTS", "STEP 96", "CYAN 2", costs 1 and 4 (329–358). Free play stays solo-v1, and old `#fp=` links load as 15 × 10. The per-turn logic moves into one shared function, used by the snap and replay too | The browser's whole match. Nothing is stored. `test-minpentai-play` / `-share` / `-players` under solo-v1 catch any change |
| 4 | `play-game/players.ts` | scripts only | `playMatch` and `tally` take a version; it uses the engine's own `turned` / `unturn` (64–79), and `PlayerView` gains the settings and W/H | Script-only; `-players` and `-ladder` confirm the same results |
| 5 | `play-server/ladder.ts` | server | Unchanged except `MAXS` from `SOLO_V1`. The ladder stays Play-only; versions have no ladder | Keeps `mp_progress` as it is |
| 6 | `live-types.ts` + `play-server/view.ts` | server → browser | `MatchView` gains `W`, `H`, `version`, rule `{id, text}`, points, costs, `maxSteps`, `directions`, sight and reach. `rule` stays for compatibility. `view.ts` uses the match's engine (12, 16, 27) and its step limit (43) | Additive to the API before match logic moves; `-play-server` covers `fog` / `viewFor` |
| 7 | `play-server/match.ts` | server | `createMatch(seed, now, version = SOLO_V1)`; `LiveMatch` gains an optional `versionId`, missing on old rows, meaning solo-v1. `checkPlacements` keeps its words and uses the engine's limits, plus the tower cap. `checkEnd` → `verdict`. `POINTS` and the list-length cap come from the budget | The heart of one-on-one, so it goes after the tools that test it. The resume-old-state case in the gate guards live matches |
| 8 | `app/minpentai/play-live.tsx` | browser | Reads the board size, rules and labels from `MatchView` and builds `engine(L)` itself. Drops "15 × 10, 2 towers each, 96 steps", "About 8 minutes", "STEP 96", "Spend 8 points", "CYAN 2", costs 1 and 4. `flipK` / `flipP` use W and H | Last, because it depends on step 6; checked by `check-minpentai-live` in the browser on the preview |

**Then:** delete the `game.ts` adapter once nothing imports it (scripts move to `SOLO_V1` or the frozen copy). Add the version page, editor and routes (part B). Deploy a preview.

**Not in this round:** versions in one-on-one, a ladder per version, and Learn (its own game).

## What I need from you before starting

1. OK to go ahead with A, B and C as above, on this branch, preview only.
2. Encoding format 4 replacing format 3 before the first deploy (part A, step 6).
3. Arweave: the uploader and who holds its key. Until you choose, Share stores the manifest in our database marked "not yet on Arweave".
4. The short ID shape (10 characters of base32 from the ruleset ID), and the trial limit (10 per version per day).

## Principles

| Principle | Touched? | Status |
|---|---|---|
| 1. Public recipe; words known public | Yes | Pass by design: the notice comes before typing; Recipe shows the prompt, model, manifest and playtest |
| 2. AI use declared; words are people's | Yes | Pass by design: the creator writes the title and line, the model's draft is labelled, rule sentences come from code |
| 3. Allowlist, open weights | Yes | Pass: gpt-oss-120b |
| 4. Published by a signed-in person's action | Yes | Pass: Share, after beating it |
| 5. Nothing canon or featured; moderators can only hide | Yes | Pass: `hidden_at` / `hidden_by` only; no featured or ordering field |
| 6. No third-party page requests; readers' words; legal texts | Yes | **Concern until done:** Terms and Privacy must name Groq via the gateway and the permanent Arweave copy before going live. Preview only until then |
| 7. Payments | No | |
| 8. Minpentai matches the source | Yes | Pass: quotes checked word for word; versions labelled as player-made with invented rules marked; Play's own rules unchanged, as the gate proves |
