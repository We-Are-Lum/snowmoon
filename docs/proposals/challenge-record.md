# The challenge record on IPFS (DRAFT, a plan only)

Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-01, on branch `deep-funding`, for the
owner's decisions of 2026-11-01. DRAFT until the owner approves it. **A plan only: nothing here pins, uploads or
exports anything, and no code is built.**

## Deadline and Privacy (owner, 2026-11-02)

- **Build and run the export by Sun 22 Nov 2026.** Privacy §4 has been live since 2026-11-01 (#93) and says the record
  is published when entries close, so it must be built, tested and ready to run at the close.
- **Name the storage service in Privacy §7 before it's used.** Whatever service stores the record (the pinning
  service, and any IPFS gateway we use) must be named in Privacy §7 before the export runs. The line must say that it
  receives only the public record (fingerprints, Farcaster IDs, publish times and links between versions), nothing
  else. That line goes through the owner's reread, like any legal text.

## What it is

When entries close (Sun 22 Nov 2026, 23:59 Pacific, `CHALLENGE.dates.closes`), a record of the remix challenge is
put on IPFS and referenced on Ethereum by every Snowmoon WIP token.

**The record holds fingerprints, not copies (owner, 2026-11-01).** For every entry, and every version an entry was
built on, it holds:

- the sha256 of each of its pictures, and of each picture's recipe;
- its maker's FID;
- when it was published;
- what it was built on.

No pictures, words, titles, recipe text or byline names are in the per-entry record. **Only the final versions that
get minted carry their pictures and their metadata**, in the results record and in the token metadata.

Anyone with the site can check a version against the record: download its pictures and its recipe, hash them, and
compare. Anyone without the site can still see who built on whom, and when.

## Two records, versioned

Each record is one JSON document with a `schema` field naming its kind and version. A new version never changes an
old one: a correction is a new record that names the one it replaces (`replaces`).

### 1. The entries record: `snowmoon.challenge.entries/1`

```json
{
  "schema": "snowmoon.challenge.entries/1",
  "challenge": "remix-2026-11",
  "site": "https://snowmoon.party",
  "window": { "opens": "2026-11-06T17:00:00Z", "closes": "2026-11-23T08:00:00Z" },
  "characters": ["zei", "bai", "gladias", "seila", "deluin", "mu"],
  "fingerprints": { "picture": "sha256 of the picture's bytes as served", "recipe": "sha256 of RFC 8785 JSON of the recipe as the page shows it (snowmoon.recipe/1)" },
  "replaces": null,
  "versions": [
    {
      "id": "<version uuid>",
      "character": "bai",
      "maker_fid": 500,
      "published_at": "2026-11-12T19:04:11.000Z",
      "entry": true,
      "pictures": [
        { "view": "front", "sha256": "<64 hex>", "recipe_sha256": "<64 hex>" },
        { "view": "side", "sha256": "<64 hex>", "recipe_sha256": "<64 hex>" }
      ],
      "built_on": [ { "version": "<uuid>", "kind": "remixed_from" }, { "version": "<uuid>", "kind": "uses" } ]
    },
    { "id": "<uuid>", "hidden_before_export": true }
  ]
}
```

- **Which versions:** every entry (each person's counted version per character, marked or latest), and every
  published version an entry was built on, back to the starting sheets (`entry: false`). The book is implied as the
  root: a version with an empty `built_on` was made from the book.
- **A version hidden before the export** appears only as `{ "id", "hidden_before_export": true }`, so the
  `built_on` links that point at it still resolve; it has no fingerprint, maker or date. A version hidden after the
  export keeps its fingerprint in the record (the owner's Privacy words say so).
- **`maker_fid`:** the maker's Farcaster ID. No name.
- **`published_at`:** the version's `created_at` from the database, in UTC, ISO 8601 with milliseconds.
- **`entry`:** true or false, as the Entry badge shows. Nothing about why.
- **`pictures`:** each view (front, side, back, then samples in their order) with the sha256 of its bytes and the
  sha256 of its recipe.
- **`built_on`:** the version's own links (`remixed_from`, then `uses` to design versions), as stored, in the deep
  funding graph's order; a later version of a fork with no link of its own lists its fork origin with kind
  `fork-origin`.

### 2. The results record: `snowmoon.challenge.results/1`

```json
{
  "schema": "snowmoon.challenge.results/1",
  "challenge": "remix-2026-11",
  "entries_record": { "cid": "bafy…", "sha256": "<64 hex>" },
  "replaces": null,
  "method": { "doc": "https://github.com/We-Are-Lum/snowmoon/blob/<commit>/docs/proposals/deep-funding-runner.md", "commit": "<sha>", "settings": {} },
  "full_results": { "url": "https://snowmoon.party/…/results-….json", "sha256": "<64 hex>" },
  "models": [ { "id": "…", "maker": "…", "provider": "…", "open_weights": true } ],
  "characters": [
    {
      "character": "bai",
      "final": {
        "id": "<version uuid>",
        "maker_fid": 6786,
        "published_at": "…",
        "title": "…",
        "text": "…",
        "pictures": [ { "view": "front", "cid": "bafy…", "sha256": "<64 hex>", "recipe": {}, "recipe_sha256": "<64 hex>" } ]
      },
      "graph": { "nodes": [ { "id": "<uuid>", "maker_fid": 500, "eligible": true } ], "edges": [ { "from": "…", "to": "…", "kind": "uses" } ] },
      "credit": { "<uuid>": 0.126 },
      "shares": [ { "to": "fid:500", "share": 0.196, "ppm": 196000 }, { "to": "lake", "share": 0.594, "ppm": 594000, "for": {} } ]
    }
  ],
  "leaderboard": [],
  "weights": { "top": {}, "fitted": {} }
}
```

- **The final version carries itself:** its pictures (on IPFS, by CID, with their sha256), its title, text, recipe
  in full and maker. It is the one version that is minted, so the token needs it.
- **Every other node is by id, maker FID and eligible / not eligible / admin / book** (never `below` or
  `unchecked`). Its fingerprints are in the entries record.
- **The full deep funding results** (every prompt and raw answer, the jurors' answers by number) are published on the
  site and in the repository as the runner wrote them; the IPFS record holds that file's address and sha256, not its
  text. The prompts quote makers' words, which the per-entry record leaves out (see open question 1).
- **No addresses.** The shares are by FID; the addresses are public on chain in each split, and the token metadata
  names the split.

## How a fingerprint is computed (so anyone can recompute it)

**Picture:** `sha256` of the picture's bytes exactly as served at its address on our storage
(`https://media.snowmoon.party/…`). It is the `sha256` the version already stores for that picture
(`DesignPicture.sha256`), checked against the served bytes before the export.

**Recipe (`snowmoon.recipe/1`):**

1. Take the picture's recipe **as the version page shows it**: the object of the fields the page shows, with the
   values the page shows. The list of fields is fixed in the export script and checked against the page before the
   first export. From `DesignPicture.recipe` today it would be `prompt`, `model`, `endpoint`, `host`, `settings`,
   `seed`, `made_at`, `width`, `height`, `style` (`version_id`, `title`) and `assist`, with any field the page doesn't
   show (for example `request_id` or `cost_usd`, if not shown) left out. Absent optional fields are left out, not
   written as null.
2. Add `"schema": "snowmoon.recipe/1"` to the object, so a later change to the field list gets a new name.
3. Serialize it with **RFC 8785** (JSON Canonicalization Scheme): keys sorted by UTF-16 code units, no whitespace,
   numbers in ECMAScript shortest form, strings with RFC 8785's escaping.
4. `recipe_sha256` = lowercase hex `sha256` of those UTF-8 bytes.

So that "as the page shows it" is something anyone can fetch, each version page also offers its recipes as that exact
JSON (for example `GET /api/designs/<version id>/recipes`, one `snowmoon.recipe/1` object per picture). Not built; it
is part of the export's build.

## Deterministic: the same data gives the same CID

- **Canonical JSON:** both records, the token metadata and every recipe are RFC 8785. Every array in a fixed order:
  versions by `published_at`, then `id`; pictures front, side, back, then samples; `built_on` in the graph's order;
  graph nodes as the runner orders them.
- **No clock:** nothing records when the export ran. Every time in it comes from the database or `CHALLENGE.dates`.
- **Numbers:** shares rounded to 9 decimal places before writing; ppm are integers.
- **One file, fixed IPFS settings:** UnixFS, CIDv1, raw leaves, sha2-256, 1 MiB chunks, balanced layout (kubo:
  `ipfs add --cid-version=1 --raw-leaves --chunker=size-1048576`). Written in the script and here, since a different
  chunker gives a different CID for the same bytes. The final versions' pictures are added the same way.
- **The check:** the export writes each file's sha256 beside it. Two exports on different machines must give the same
  sha256 and CID; the script's test builds twice on stand-ins and compares byte for byte.

## Pinning (no key handling by agents)

- **A pinning service** the owner chooses, with the owner's own account and key, used only on the owner's machine.
- **A local pin** on the owner's machine (kubo), so the files are served even if the service stops.
- Agents prepare the files and their expected CIDs offline (`ipfs add --only-hash`, which stores and sends nothing),
  and write the commands for the owner. They never see a pinning key.
- After pinning, a read-only check fetches each CID from two public gateways and compares the sha256.
- What is pinned: the entries record, the results record, the final versions' pictures, and each token's metadata.

## How token metadata references it

The contract's per-token URI is fixed at `createToken` (`contracts/snowmoon-wip/src/SnowmoonWIP.sol`), so every CID it
points at must exist first:

1. **After entries close (from 23 Nov):** export and pin the entries record. Publish its CID on /challenge.
2. **After the jurors (3 Dec):** run `decide`; publish the full results; export and pin the final versions' pictures
   and the results record (which names the entries record's CID). Results at the 4 Dec call.
3. **Recipients confirm payout addresses** (`docs/proposals/payout-addresses.md`); the splits are created on mainnet.
4. **Per character:** write the token metadata, pin it, and only then call
   `createToken(ipfs://<metadata CID>, price, start, end, split)`, before the mint opens (8 Dec, 09:00 Pacific).

```json
{
  "name": "Bai, WIP 1 (Nov 2026)",
  "description": "…",
  "image": "ipfs://<final front picture CID>",
  "external_url": "https://snowmoon.party/references/designs/<final version uuid>",
  "properties": {
    "challenge_record": "ipfs://<results record CID>",
    "entries_record": "ipfs://<entries record CID>",
    "final_version": "<uuid>",
    "recipe_sha256": "<64 hex>",
    "split": "0x…",
    "ai": "Made with AI; its recipe is public",
    "licence": "…"
  }
}
```

Our own pages keep showing pictures from our storage, never an IPFS gateway (the plan's correction). A token can't be
changed after `createToken`; if a record is wrong after that, a corrected record names it in `replaces`, the site says
so, and the token keeps pointing at the old one.

## What is left out

- From every entry and built-on version: its pictures, title, text, recipe text and byline name (only their
  fingerprints, its maker's FID, its date and its links are in).
- Neynar scores, and every eligibility detail beyond the Entry badge.
- Private drafts, unpublished versions, versions hidden before the export (only their id).
- Marks themselves (which version was marked, and when): only `entry: true`.
- "Posted on" rows, likes, picks, ratings, juror FIDs, who added jurors.
- The deep funding prompts and raw answers (on the site and in the repository, referenced by sha256).
- Payout addresses (on chain in the split).

## Privacy and Terms

The words are the owner's own, in the remix-challenge legal draft (`docs/legal/remix-challenge-draft.md`, added there
by the coordinator): Privacy §4, "When entries close, a record of every entry is published to IPFS and referenced on
Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words
themselves), its maker's Farcaster ID, when it was published and what it was built on. Hiding a version later removes
it from this site, but not its fingerprint from that record.", and one Terms §6e sentence saying the same. This plan
drafts no lines of its own. They should be live before entries open (6 Nov), with the rest of that draft.

The owner's choice of fingerprints settles the earlier open question of removal against IPFS permanence: what can't
be removed is a fingerprint, not a picture or a person's words.

## The export script (design only, dry-run only)

`scripts/challenge-record.ts`, not built:

- `npm run challenge-record -- entries --dry-run`: reads the database in a read-only transaction (as
  `studio_writer`); fetches each picture from our storage and checks its bytes against the stored sha256; builds each
  recipe's `snowmoon.recipe/1` JSON and hashes it; builds the entries record; refuses any field outside the allow-list;
  writes `challenge-record-out/entries.json` and its sha256, and prints the expected CID if kubo is installed
  (`ipfs add --only-hash`). Without `--dry-run` it refuses: pinning is the owner's step.
- `npm run challenge-record -- results --entries-cid <cid> --results deep-funding-out/results-….json --dry-run`: the
  results record, the final versions' pictures (expected CIDs) and each token's metadata, the same way.
- **Its test (no network):** stand-in rows give a fixed file; two builds compare byte for byte; RFC 8785 output checked
  against the RFC's own examples; a recipe hash recomputed from the recipes endpoint's JSON matches; a planted copy (a
  title, a text, a recipe prompt, a byline name or a picture address in a per-entry row), a Neynar score, a mark's
  time, a draft or an address must be refused.
- It prints the owner's commands: `ipfs add --cid-version=1 --raw-leaves --chunker=size-1048576 --pin <file>` (the
  local pin), the pinning service's upload, then the gateway check.

## Open questions

1. **The full deep funding results quote makers' words** (the prompts carry every version's title, text and recipe
   prompts). Proposed: publish them on the site and in the repository, not on IPFS, with the record holding their
   sha256. The owner may prefer them reduced to fingerprints too, or not published in full.
2. Versions hidden before the export: id only (proposed), or their fingerprint as well.
3. The pinning service.
4. The recipes endpoint (`snowmoon.recipe/1` per picture), so anyone can recompute a recipe's fingerprint: its path,
   and whether it ships with the export.
