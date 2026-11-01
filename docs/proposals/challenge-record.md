# The challenge record on IPFS (DRAFT, a plan only)

Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-01, on branch `deep-funding`, for the
owner's decision of 2026-11-01. DRAFT until the owner approves it. **A plan only: nothing here pins, uploads or
exports anything, and no code is built.**

## What it is

When entries close (Sun 22 Nov 2026, 23:59 Pacific, `CHALLENGE.dates.closes`), the full record of the remix
challenge is exported as JSON and put on IPFS: every entry, with its maker, its recipe and what it was built on.
After the deep funding test, a second record adds the graph, every prompt and answer, and the results, and points
back at the first. Every Snowmoon WIP token's metadata carries the record's CID, so anyone holding a token can find
how it was made and who it credits without our site.

The record holds only what is already public on snowmoon.party. It adds nothing new about anyone; it makes what is
public permanent. That permanence is the main thing to decide (see "Removal" below).

## Two records, versioned

Each record is one JSON document with a `schema` field naming its kind and version. A new kind or version never
changes an old one: a correction is a new record that names the one it replaces.

### 1. The entries record: `snowmoon.challenge.entries/1`

```json
{
  "schema": "snowmoon.challenge.entries/1",
  "challenge": "remix-2026-11",
  "site": "https://snowmoon.party",
  "work": { "title": "Snowmoon", "author": "Vitalik Buterin", "licence": "GPL-3.0", "note": "An independent adaptation; not affiliated with the author." },
  "window": { "opens": "2026-11-06T17:00:00Z", "closes": "2026-11-23T08:00:00Z" },
  "characters": ["zei", "bai", "gladias", "seila", "deluin", "mu"],
  "replaces": null,
  "versions": [
    {
      "id": "<version uuid>",
      "page": "https://snowmoon.party/references/designs/<version uuid>",
      "character": "bai",
      "design": "<element uuid>",
      "version_no": 2,
      "published_at": "2026-11-12T19:04:11Z",
      "maker": { "fid": 500, "name": "someone", "role": null },
      "entry": true,
      "title": "Bai in winter",
      "text": "A heavier coat, and a scarf",
      "drafted_by_a_model": [],
      "pictures": [
        { "view": "front", "url": "https://media.snowmoon.party/…", "sha256": "…",
          "recipe": { "prompt": "…", "model": "z-image-turbo", "endpoint": "fal-ai/z-image/turbo", "host": "fal.ai", "settings": {}, "seed": 1, "made_at": "…", "width": 576, "height": 768, "style": { "version_id": "…", "title": "…" } } }
      ],
      "built_on": [ { "version": "<uuid>", "kind": "remixed_from" } ]
    },
    { "id": "<uuid>", "hidden": true }
  ]
}
```

- **Which versions:** every published version of the six characters' sheets that an entry was built on, back to
  the starting sheets, plus every entry (each person's counted version per character, marked or latest). A version
  hidden before the export appears only as `{ "id", "hidden": true }`, as its credit shows on the site ("a remix", no
  name, maker or link; decision 16, 2026-10-09).
- **`maker`:** the FID and the name exactly as the byline shows it, and `role` (`"maintainer"` or `null`) as the
  page shows it. Admins are named as admins on /challenge, so `"admin": true` may be added if the page says so.
- **`entry`:** true or false, as the "Entry" badge shows. Nothing about why.
- **`recipe`:** exactly the fields the version page shows, field by field, checked against the page before the
  first export. Anything the page doesn't show is left out (for example a host's `request_id` or the cost, if the page
  doesn't show them).
- **`built_on`:** the version's own links (`remixed_from`, `uses` to design versions), as stored.

### 2. The results record: `snowmoon.challenge.results/1`

```json
{
  "schema": "snowmoon.challenge.results/1",
  "challenge": "remix-2026-11",
  "entries_record": { "cid": "bafy…", "sha256": "…" },
  "replaces": null,
  "method": { "doc": "https://github.com/We-Are-Lum/snowmoon/blob/<commit>/docs/proposals/deep-funding-runner.md", "commit": "<sha>", "settings": { "scoreWeights": {}, "clamp": 0.01, "creditFloor": 0.0001, "topModels": 3, "runsPerModel": 3, "minShare": 0.01, "bookRecipient": "…" } },
  "models": [ { "id": "…", "maker": "…", "provider": "…", "open_weights": true } ],
  "characters": [
    {
      "character": "bai",
      "final": "<version uuid>",
      "graph": { "nodes": [], "edges": [] },
      "prompts": [],
      "calls": [ { "model": "…", "node": "…", "run": 1, "raw": "…", "answer": {}, "error": null, "tokens": {}, "cost_usd": 0.003 } ],
      "jurors": [ { "juror": 1, "kind": "compare", "a": "…", "b": "…", "choice": "a", "times": 2 } ],
      "final_answers": {},
      "credit": {},
      "shares": [ { "to": "fid:500", "share": 0.196, "ppm": 196000 }, { "to": "lake", "share": 0.594, "ppm": 594000, "for": {} } ]
    }
  ],
  "leaderboard": [],
  "weights": { "top": {}, "fitted": {} }
}
```

It is the runner's results file (`scripts/deep-funding.ts decide`) with three changes:

- each graph node keeps only the record's public fields (no `standing` beyond eligible / not eligible / admin /
  book, never `below` or `unchecked`, which would reveal a score band);
- jurors are numbers only (already so);
- **no addresses.** Shares are by FID and version. The addresses are public on chain in each split, and the token
  metadata names the split; the record doesn't need them, and leaving them out keeps the record from being made
  before addresses are confirmed.

## Deterministic: the same data gives the same CID

- **Canonical JSON:** RFC 8785 (JSON Canonicalization Scheme): keys sorted, no spaces, numbers in shortest form,
  UTF-8. Every array in a fixed order: versions by `published_at` then `id`; pictures front, side, back, then
  samples; `built_on` as the graph orders parents; calls by model, node, run.
- **No clock:** nothing records when the export ran. Every time in it comes from the database or `CHALLENGE.dates`.
- **Numbers:** shares rounded to 9 decimal places before writing (floating-point sums differ by machine otherwise);
  ppm are integers.
- **One file, fixed IPFS settings:** UnixFS, CIDv1, raw leaves, sha2-256, 1 MiB chunks, balanced layout (kubo:
  `ipfs add --cid-version=1 --raw-leaves --chunker=size-1048576`). The settings are written in the export script and
  in this doc, since a different chunker gives a different CID for the same bytes.
- **The check:** the export also writes the file's sha256. Two exports on different machines must give the same
  sha256 and the same CID; the script's test runs it twice on stand-ins and compares.

## Pictures

The record links pictures by their address on our storage and their sha256. The plan's correction keeps our pages on
our own storage (never an IPFS gateway). Whether the pictures themselves also go on IPFS (so a token's image outlives
our storage) is an owner decision; if yes, each picture's CID is added as `cid` beside `url`, from the same bytes the
sha256 names, and the token's `image` uses it.

## Pinning (no key handling by agents)

- **A pinning service** chosen by the owner (for example Filebase or Pinata), with the owner's own account and key,
  used only on the owner's machine.
- **A local pin** on the owner's machine (kubo), so the record is served even if the service stops.
- Agents prepare the file and the expected CID offline (`ipfs add --only-hash`, which pins nothing and sends nothing),
  and write the exact commands for the owner to run. They never see a pinning key.
- After pinning, a check fetches the CID from two public gateways and compares the sha256 (read-only).

## How token metadata references it

The contract's per-token URI is fixed at `createToken` (`contracts/snowmoon-wip/src/SnowmoonWIP.sol`), so everything
the URI points at must exist first. The order:

1. **After entries close (from 23 Nov):** export and pin the entries record. Publish its CID on /challenge.
2. **After the jurors (3 Dec):** run `decide`; export and pin the results record (which names the entries record's
   CID). Results at the 4 Dec call.
3. **Recipients confirm payout addresses** (`docs/proposals/payout-addresses.md`); the splits are created on mainnet
   from the results' shares and the confirmed addresses.
4. **Per character:** write the token metadata JSON, pin it, and only then call `createToken(ipfs://<metadata CID>,
   price, start, end, split)`, before the mint opens (8 Dec, 09:00 Pacific).

The metadata (also canonical JSON, pinned the same way):

```json
{
  "name": "Bai, WIP 1 (Nov 2026)",
  "description": "…",
  "image": "ipfs://<picture CID>",
  "external_url": "https://snowmoon.party/references/designs/<final version uuid>",
  "properties": {
    "challenge_record": "ipfs://<results record CID>",
    "entries_record": "ipfs://<entries record CID>",
    "final_version": "<uuid>",
    "split": "0x…",
    "recipe": "https://snowmoon.party/references/designs/<uuid>#recipe",
    "ai": "Made with AI; its recipe is public",
    "licence": "…"
  }
}
```

A token can't be changed after `createToken`. If a record is wrong after that, a corrected record names it in
`replaces`, and the site says so; the token keeps pointing at the old one.

## What is left out

- Neynar scores, and every eligibility detail beyond the Entry badge (`decision`, `score`, `below`, `unchecked`).
- Private drafts, unpublished versions, versions hidden before the export (only `hidden: true`).
- Marks themselves (which version was marked and when): only `entry: true`, as the badge shows.
- "Posted on" rows, likes, picks, ratings, juror FIDs, who added jurors.
- Payout addresses (on chain in the split, not in the record).
- Agents' private work, and any site account detail.

## Removal: the decision to make first

Today a maker can hide their version, and the site honours a removal request (Terms §7). IPFS is different: once a
record is pinned and fetched, copies may exist that we can't delete. We can unpin and publish a corrected record,
but not recall the old one.

Options for the owner:

- **(a) Say so before people enter:** the Terms and /challenge say that, when entries close, the record of published
  entries is put on IPFS, where it can't be deleted. Versions hidden before the export are left out.
- **(b)** Keep pictures off IPFS (record by URL and sha256 only), so a hidden picture disappears from our storage even
  if the record's words remain.

Recommendation: (a), and (b) unless the owner wants token images on IPFS.

## Privacy and Terms lines needed

**Privacy §6 (What you publish), one sentence added:**

> When the remix challenge's entries close, a record of its published versions (each version's words, pictures'
> addresses, recipe, maker's name and Farcaster ID, whether it is an entry, and what it was built on) is put on IPFS,
> a public network where it can't be deleted, and the tokens made from the challenge point at it. Versions hidden
> before then are left out.

**Terms 6d (the remix challenge), one sentence added:**

> When entries close, we publish the challenge's record on IPFS; what it holds was already public here, and it can't
> be withdrawn from IPFS afterwards.

Neither is needed until the export runs, but both should be live before entries open (6 Nov), since they change what
entering means. They belong with the remix-challenge legal draft.

## The export script (design only, dry-run only)

`scripts/challenge-record.ts`, not built:

- `npm run challenge-record -- entries --dry-run`: reads the database in a read-only transaction (as
  `studio_writer`), builds the entries record, checks every field against the allow-list above, writes
  `challenge-record-out/entries.json` and its sha256, and prints the expected CID if kubo is installed
  (`ipfs add --only-hash`, which stores and sends nothing). Without `--dry-run` it refuses: pinning is the owner's
  step.
- `npm run challenge-record -- results --entries-cid <cid> --results deep-funding-out/results-….json --dry-run`:
  the same for the results record, from the runner's file.
- **Its test (no network):** stand-in rows give a fixed file; two builds compare byte for byte; a planted private
  field (a Neynar score, a mark's time, a draft, a hidden version's words, an address) must be refused; RFC 8785
  output checked against the RFC's own examples.
- Prints the commands for the owner: `ipfs add --cid-version=1 --raw-leaves --chunker=size-1048576 --pin
  entries.json` (local pin) and the pinning service's upload, then the gateway check.

## Open questions

1. Removal: option (a), (b) or both, and the words, before entries open.
2. Token images on IPFS or not.
3. The pinning service.
4. Whether the record names makers by FID as well as name (FIDs are public on Farcaster and shown when there is no
   name; the byline otherwise shows the name only).
5. Whether non-entry versions in the graph (pre-window, or made by people who weren't eligible) are in the entries
   record in full: they are public on the site, but weren't entries.
