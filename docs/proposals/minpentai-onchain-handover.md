# Minpentai onchain: handover for the one engine and player versions

For the session building commit-before-play on `minpentai-onchain`. Written 2026-10-21 by the coding agent on `minpentai-one-engine`. Nothing on `minpentai-onchain` was edited; its files were read only, at 030d80e.

The owner's rules for this work:
- Player versions are **not** added to RulesetRegistry.
- A shared version's **rules-only** manifest is stored permanently on Arweave by the same route as official rulesets.
- The verifier gets an entry for versions.
- Format 4 keeps format 3's rules: one canonical form, zero padding, a re-encode check, shared fixtures, and fuzzing.

## What `minpentai-one-engine` changed that this branch depends on

- **`versions/engine.ts` is the one engine.** `play-game/game.ts` is now a thin adapter over it, under Play today's settings (`versions/solo-v1.ts`, `SOLO_V1`). It plays exactly as before: 432 whole matches compared against a frozen copy of the old `game.ts`, 1,600 random boards, 216 solo replays, and every Play test unchanged.
- **`rng` moved** to `play-game/rng.ts`; `game.ts` re-exports it.
- **`versions/replay.ts#replayVersion(rules, match)`** replays a person's solo match under any rules, the way `onchain/replay.ts#replaySolo` does: one rng; the first number draws the rule (a second one draws the switch's rule, if the version has one); the computer takes the rest. With `SOLO_V1` it gives `replaySolo`'s results (tested on 216 matches).
- **A world keeps the shape Play always saved.** First blood's counts live beside the world, not in it.

## 1. Replay and the base ruleset

1. **`onchain/replay.ts`**: `replaySolo(input)` becomes `replayVersion(SOLO_V1, input)`, keeping its signature, `engineSeed`, `MAX_SEED` and `ReplayError`. It returns `rule` as today (`first` from `replayVersion`).
2. **The closure** (`importClosure` from `onchain/replay.ts`) will reach:
   - `onchain/replay.ts`, `versions/replay.ts`, `versions/engine.ts`, `versions/schema.ts`, `versions/solo-v1.ts`, `play-game/rng.ts`;
   - **no longer** `play-game/game.ts`, `live-types.ts` or `play-server/match.ts`;
   - no npm packages (`schema.ts` and `engine.ts` import none).
3. **Rebuild `solo-v1.json`** (`build-minpentai-ruleset.ts`) at the merged commit. The engine commit, the file hashes, `closureHash`, the six `codeHash`es and `computerPlayers[].code.file` (now `src/lib/minpentai/versions/engine.ts`) all change, so **the ruleset ID changes** from 0x9107a46f…dd82. Nothing is registered or deployed (onchain-v1.md: local anvil only), so this is safe now and not after deploy.
4. **Rebuild the fixtures:** `contracts/minpentai/fixtures/onchain.json` (`build-minpentai-onchain-fixtures.ts`). `test-minpentai-onchain-{ruleset,encoding,sandbox,verifier}.ts` and `minpentai-onchain-gas.ts` read the ID from `solo-v1.json` and follow it. `RulesetRegistry.t.sol`'s `SOLO_V1` constant is an arbitrary ID and can stay.

## 1b. What players see (owner, 2026-10-21, after a phone test)

An opponent's tower out of sight is now drawn **dimmed** where it was last seen: its starting square from the start, moving only when seen again. Before, it was a dashed "?" outline. Rocks are shown everywhere, as before. This is a drawing change only (`play-game/board.ts`); the engine and every replay are unaffected. When `solo-v1.json` is rebuilt, update these rule texts in `RULES_V1` (`onchain/ruleset.ts`):
- `sight`, edition: "3 squares, not thirty (2 under \"sight2\"). Rocks are shown everywhere; an opponent's tower you cannot see is shown dimmed where you last saw it (its starting square until you first see it)."
- `last-seen`, text: "Rocks are shown everywhere; an opponent's tower you cannot see is shown dimmed where you last saw it, at its starting square until you first see it."

## 2. Encoding format 4 (replaces format 3 before the first deploy)

**Why.** Format 3 packs a square as `y*15+x` in one byte (at most 256 squares), refuses end steps above 96, keeps square hits only as "1 or 2+", and leaves rocks out because "rocks never change". Versions allow:
- boards up to 25 × 16 (400 squares) and 240 steps;
- squares of 1–4 hits;
- rocks that break (`breakable`) or appear (`debris: rock`).

**Header (unchanged offsets 0–81, so MatchLog reads the same bytes).** Big-endian:

| Offset | Size | Field | Change from format 3 |
|---|---|---|---|
| 0 | u8 | format version | **4** |
| 1 | bytes32 | ruleset ID | |
| 33 | u32 | n | |
| 37 | bytes32 | seed | |
| 69 | u64 | seed block | |
| 77 | u8 | opponent kind (0 computer) | |
| 78 | u8 | level (0–5) | |
| 79 | u8 | claim (0 loss, 1 win, 2 draw) | |
| 80 | u8 | end kind (0 played out, 1 resigned) | |
| 81 | u8 | end step | **0–240.** The decoder caps it at 240; the verifier checks it against the manifest's `maxSteps` |
| 82 | u8 | board width W (9–25) | **new.** The verifier checks it equals the manifest's |
| 83 | u8 | board height H (6–16) | **new**, the same |
| 84 | u8 | turns to act T | moved from 82 |

**Turns.** For each turn: a u8 placement count n (0–255), then n placements of **2 bytes each**, in the order placed (the order sets glider ids):
- a u16 = `square << 5 | piece << 3 | dir`;
- `square` = `y*W + x`, which must be below `W*H` (9 bits; 400 squares needs 9);
- `piece` is 0 glider, 1 square, 2 tower (3 is refused);
- `dir` is the D8 index 0–7 for a glider, and must be 0 otherwise;
- **the top 2 bits must be zero.**

The same size per placement as format 3, so a Play match costs the same gas.

**Final position.** A **u16** piece count P (a 400-square board can hold more than 255 pieces), then P × **14 bits**, packed most-significant bit first, with the last byte zero-padded. Each piece is a 9-bit square and a 5-bit kind:

| Kind | Meaning |
|---|---|
| 0, 1 | Cyan tower, Amber tower |
| 2–5 | Cyan square with 1–4 hits left |
| 6–9 | Amber square with 1–4 hits left |
| 10–17 | Cyan glider, direction 0–7 |
| 18–25 | Amber glider, direction 0–7 |
| 26–31 | rock with 1–6 hits left |

- Every rock is listed, including the starting ones. Under rocks that never break, each is kind 26. Rocks can change in versions, and listing all of them keeps one form, with no "differs from the start" rule.
- The list is sorted by square, then kind; one square holds at most one non-glider.
- A Play match pays about 11 bytes more for its six rocks.

**MIN_LENGTH** becomes 87: the 84-byte header plus W and H, the turn count (1) and the piece count (2). MatchLog's `FORMAT_VERSION` = 4 and `MIN_LENGTH` = 87; it reads nothing past offset 78, so nothing else in the contract changes. Please confirm that against `MatchLog.sol` and `MatchLogLimits.t.sol` (my read: `record()` checks the version, the length and header fields only).

**Worst-case length** (the limits tests): 61 turns × (1 + 40 placements × 2) + 87 + ⌈400 × 14 / 8⌉ = 4,941 + 87 + 700 ≈ 5.7 KB. That's 40 placements at 24 points plus 16 saved, every piece costing 1, in a 240-step match with a turn every 4 steps. It's far beyond any real match, but the limits test should take it.

**Kept from format 3:**
- **One canonical form.** `decode()` re-encodes what it read and refuses any byte difference. That covers: an unsorted position, non-zero padding bits, non-zero top bits in a placement, a direction on a square or tower, piece 3, a square ≥ W*H, W or H out of range, an end step > 240, a level > 5, and trailing or truncated bytes.
- **Shared fixtures** (`contracts/minpentai/fixtures/onchain.json`, rebuilt): the same matches read by the TypeScript tests and by `MatchLog.t.sol`. Add version matches: 25 × 16 × 240 steps, 9 × 6, `squareHits` 4, breakable rocks and debris (the position lists changed rocks), and a switch match.
- **Fuzzing:**
  - Forge fuzzing on `record()` lengths and versions.
  - The TypeScript round-trip fuzzer over random valid matches on random board sizes: encode, decode, re-encode must be identical. Random byte strings must decode or be refused, never mis-read.
  - Mutation of each refused case above.
- **The Python ID check** (`minpentai_ruleset_id.py`) is unaffected: it reads manifests, not matches.

## 3. Version manifests: rules only

The owner's decision: a manifest holds **exactly what `replayVersion` needs**. The version's title, its one line, the idea, the prompt, the author and the parent live in the site's database (published on the version's Recipe page, removable under `docs/removal.md`) and never go to Arweave.

```json
{
  "format": "snowmoon.minpentai.ruleset/1",
  "engine": { "repository": "https://github.com/We-Are-Lum/snowmoon", "commit": "<40 hex>",
              "entry": "src/lib/minpentai/versions/replay.ts", "replay": "replayVersion",
              "files": { "<path>": "<keccak>", "...": "..." }, "packages": {}, "closureHash": "<keccak>" },
  "rules": {
    "set": { "width": 21, "height": 13, "sight": 6 },
    "drawn": [ { "costGlider": 3 }, { "directions": 8 } ],
    "rocksAt": [ [5, 3], [15, 9] ]
  }
}
```

- **`rules.set`**: only the settings and pieces that differ from Play today; a key equal to Play's value is refused, as `check()` does.
- **`rules.drawn`**: present only when the version replaces Play's four. It's a list of setting changes in draw order, with no ids and no sentences: the code writes the sentences from the settings (owner, P2), and the replay draws by position.
- **`rules.rocksAt`**: present only when the version places rocks. It is the **full** rock set after the 180° completion, sorted, so two ways of writing the same rocks give one form.
- **Same rules, same ID.** The ID is keccak256 of the sorted JSON (onchain `canonical()`, unchanged). Identical rules give the same ruleset ID and the same link; the site says "This version already exists by @x" and links to it.
- Official rulesets keep their full manifest (`solo-v1.json`, with rule texts, sources and computer players). Player versions use the rules-only form above.

## 4. The verifier

1. **Two entries, nothing else.** `verify.ts:118` becomes an allow-list: `{ 'src/lib/minpentai/onchain/replay.ts': 'replaySolo', 'src/lib/minpentai/versions/replay.ts': 'replayVersion' }`.
   - `importClosure` starts from the manifest's `engine.entry`.
   - The esbuild stdin entry follows it. For a version it's `import { replayVersion, ReplayError } from './src/lib/minpentai/versions/replay'`, and `__run = (s) => replayVersion(RULES, JSON.parse(s))`, with `RULES` the manifest's `rules` as a JSON literal.
   - The vm limits are unchanged: no clock, no randomness, 10 s a call, only JSON across.
   - The pinned commit must exist in the repository. So a manifest chooses settings, never code.
2. **Where version manifests come from.** Not the registry.
   - A new loader takes candidate manifests from Arweave (Turbo uploads, found by the site's list of shared versions or by tag queries) and from local files.
   - It keys each by `rulesetId(fetched)`, computed on the fetched JSON exactly as fetched, through `canonical()`.
   - It accepts a manifest for a recorded match only when that ID equals the `MatchRecorded` event's ruleset ID. The locator never binds anything; the hash does. A swapped or edited manifest hashes elsewhere, and the match stays `unknown-ruleset` (a loss, as today).
3. **Registration.** `verifyMatch` today returns `unregistered` before anything else (`:154`). For a manifest whose entry is `versions/replay.ts`, skip the registry check. For any other entry, it stays required.
4. **Checking the version itself, once per version:**
   - re-run `check()` on the rules (from the pinned commit's `versions/schema.ts`), and the computer-can't-play-it check;
   - re-run the 200-match playtest (`versions/playtest.ts`, deterministic, about 20 CPU-seconds);
   - report "version: playable / not playable" beside its matches. A match on a version that fails is still replayed and reported, but marked.
5. **Reporting.** Results are per ruleset ID. A win on a version never counts as a solo-v1 win and never enters solo-v1 standings.
6. **Tests to add:**
   - a version manifest from a local "Arweave" fixture verifies;
   - an edited manifest (one setting changed) is `unknown-ruleset`;
   - a manifest naming a third entry is refused;
   - a version match replays identically to the site's `replayVersion`;
   - format 4 version matches round-trip through record and verify on anvil.

## 5. The Arweave route (shared by official rulesets and versions)

- **ArDrive Turbo.** ar.io's upload docs say uploads under 105 KiB are free ("subsidized small file uploads"), with no lifetime cap stated. The 5 MiB items and 100 MiB per-wallet caps elsewhere are the testnet sandbox's.
  - A manifest is about 1–2 KB rules-only (about 10 KB for `solo-v1.json` with its rule texts).
  - Closure files are about 10–40 KB each, uploaded once per engine commit.
  - All are under the free size.
  - Because it is a subsidy, the uploader checks each receipt (`winc: "0"`) and stops, telling the owner, if an upload would be charged.
- **Key.** A dedicated uploader key, used only for this, held in server env only. Never the owner's wallet or the Safe.
- **Tags.** `App-Name: snowmoon-minpentai`, `Type: ruleset-manifest` or `engine-file`, `Ruleset-Id: 0x…` (manifests), `Path` and `Sha3: 0x…` (files), `Content-Type: application/json`.
- **Until the key is set**, the site stores manifests in its database marked "not yet on Arweave", and the verifier can read them from a local export.

Sources: [ar.io: Upload Data](https://docs.ar.io/build/upload/) (free under 105 KiB); [ar.io: Uploading & Credits](https://docs.ar.io/build/testnet/uploading-and-credits/) (the testnet sandbox's larger allowance, "far larger than mainnet's 105 KiB").
