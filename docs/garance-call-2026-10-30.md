# From the call with Garance, 2026-10-30

The owner's notes, and what was done with each. Garance gets admin as soon as phase2-admin merges (ADMINS already
includes FID 193912 there).

## Image review: two additions (item 5)

The image review is `/you/illustrations` (`/dashboard/illustrations` after the rename). The owner's decisions are rows
in `studio.illustration_reviews`, and `scripts/illustration-redo.ts` copies them into the job files.

### 1. The concert picture at the end of chapter 1: glitches

- Job **`c1-b082-snatch`** (chapter 1, block 82): "Medium shot inside a crowded open-air concert field enclosed by a
  high soundproof wall…".
- Owner: glitches. Proposed decision: **regenerate**, note "Glitches (owner, from the call with Garance, 2026-10-30)".
  A more exact note (what glitches, where) helps the redo; the review page pre-fills one from the image check if it
  found any.

### 2. The privacy robe: Garance makes a new reference

- The design is `content/snowmoon/designs/props/privacy-robe.json` (also `privacy-robe-open.json`). It has words only
  (kind, name, status, about, prompt), no picture. `scripts/illustrate.py` adds a prop's prompt text to each job that
  lists it.
- **31 seeded images show the robe**, so they are the redo list once Garance's reference exists:
  - c1-b005-toy-drone, c1-b013-sky-bridge, c1-b082-snatch, c1-b089-autobus
  - c3-b029-fresh-robe, c3-b054-enclave-wall, c3-b072-enclave-street, c3-b092-booth
  - c6-b100-assembly, c6-b116-febric-hug, c6-b147-tower-top
  - c10-b050-booth-courtyard, c10-b114-needle-bug
  - c11-b123-heavy-water-ad, c11-b126-hug-from-behind
  - c13-b024-commercial-district, c13-b092-keeper-proposal
  - c16-b032-survival-food, c16-b060-helisport-broadcast, c16-b110-trip-news
  - c17-b053-graph-diagram, c18-b079-pyramid-view
  - c20-b013-door-screen, c20-b050-taxi, c20-b087-underground-house, c20-b174-standing-up
  - c27-b031-forest-path, c27-b040-roof-closing, c27-b071-tea-robot
  - c32-b003-camera-removal, c32-b007-sky-bridge-view
- **Waits on:** Garance's reference picture.
- **What's new:** the redo then needs one step it doesn't do today, sending a prop's picture as a reference (it sends
  characters' sheet crops and the place plate). That's a small change to the redo script, built when the reference is
  ready.
- Proposed decision for those 31: **regenerate** once the reference is in, with the note "Privacy robe: match
  Garance's reference (owner, 2026-10-30)". Until then they stay as they are.

**Not done yet:** these decisions are not recorded in the review. A decision in the review is a row in the production
database, in your name. Say "record them" and I'll add the concert one now, and the 31 robe ones when Garance's
reference is in; or tap Regenerate on the review page yourself.

## Social threads (item 8)

Garance's reference: Objects' Bluesky integration (an artwork's page shows the conversation about it). Decision: keep
"Posts that link here" as built on `social-read` (posts that link to a page, shown on it), not cross-posted replies,
for now. Noted in that branch's report (c97537a).

## Support and sign-in (items 6 and 7)

On branches `fund-block` and `signin-equals`, each with its own branch report. Not merged.
