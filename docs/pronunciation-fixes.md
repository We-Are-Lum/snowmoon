# Fixing a mispronunciation

The house narration (Kokoro-82M, stock voice af_heart) gets some words wrong. This is how a
wrong word is reported and fixed, so that the reader's audio and the podcast never disagree.
Process set by the owner on 2026-10-08 (`docs/prompts/010-pronunciation-reports.md`).

## 1. A report

Anyone can report a word, with no account on this site and nothing stored here:

- **In the reader**, the chapter player shows "Report a mispronunciation" for the paragraph
  being read. Inside a Farcaster app it opens the cast composer in the /snowmoon channel,
  prefilled with the chapter, the ¶ number and a link to the paragraph. Elsewhere it opens a
  prefilled GitHub issue in this repo with the same details and the `pronunciation` label.
- **From a podcast app**, each episode description links to that chapter's report page,
  `/chapter/N/pronunciation`, which offers the same two routes for the chapter.

(GitHub applies the label from the link only for people who can triage the repo; for anyone
else the maintainer adds it.)

## 2. The owner's approval

Nothing changes until the owner (FID 6786) approves the fix, in a cast reply, an issue
comment, or an instruction to the coding agent, which is logged in `docs/prompts/`. The
approval names the word and the replacement sound, or accepts one proposed in the report.

## 3. The entry, marked reviewed

The fix is one entry in `content/snowmoon/pronunciation.json`:

- `word`, `respelling`, `phonemes` (misaki's American English set) and `override: true`, so the
  speech model is forced to say it that way;
- `match_case: false` for ordinary words, so "Breathed" at the start of a sentence is fixed too;
- `reviewed: true`, `reviewed_by: "FID 6786"`, `reviewed_on`, and a `note` that says what the
  default said, where the report and approval are, and which blocks were re-spoken.

An entry that is not marked reviewed by the owner is not a fix and is not applied by this
process.

## 4. Only the affected blocks re-spoken

Find every block whose spoken text contains the word (book text and the read-aloud
descriptions in `content/snowmoon/read-aloud/`), then:

    .venv/bin/python scripts/narrate.py --respeak c1-b3,c4-b86 --because "pronunciation: breathed"

This re-speaks those blocks only, with the same model, revision, voice and settings; refuses a
block whose spoken text did not change (the entry is missing or does not match); re-encodes
each block's web file (AAC, 64 kbps, mono); restitches each affected chapter from its existing
block audio; and records `respoken_at` and `respoken_because` on each block in the chapter's
narration recipe. Every other block keeps its audio, byte for byte.

## 5. The app and the podcast together

In one change, for the affected chapters only:

1. `npm run publish:narration -- --chapter=N` for each chapter: uploads the new block files
   and the restitched chapter file (new names, since names carry the sha256) and rewrites
   `content/snowmoon/narration/kokoro-af_heart/chapter-N.json`, which the reader's player uses.
2. `.venv/bin/python scripts/podcast-audio.py --chapter N` for each chapter: the episode is
   rebuilt from the restitched file, loudness-normalised again, and its recipe updated.
3. `npm run publish:podcast -- --evidence=docs/prompts/<the approval>.md`: uploads the new
   MP3s under new names, so podcast apps fetch them again; the episode's guid does not change.
4. Commit the pronunciation entry, the narration recipes and indexes, and the podcast
   recipes together, and deploy; `npm run check:podcast` against the live site.

## Log

| Date | Word | Default said | Now | Blocks re-spoken | Approved |
|---|---|---|---|---|---|
| 2026-10-08 | breathed | bɹˈɛθt ("breath-t") | bɹˈiðd ("breethd") | 9: c1-b3, c4-b86, c7-b56, c7-b60, c12-b141, c12-b183, c15-b54, c15-b73, c19-b42 (chapters 1, 4, 7, 12, 15, 19) | FID 6786, `docs/prompts/010-pronunciation-reports.md` |
