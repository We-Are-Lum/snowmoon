# Proposal: word pronunciation clips

> **Proposal. Nothing here is built.** Written Oct 9, 2026 at the owner's
> request: "word-only pronunciation clips made locally with Kokoro in the house
> voice from pronunciation.json's phonemes, one recipe per clip. Cover cost,
> time, and how the glossary and the infotip would use them." No model was run,
> no audio was made, and no code was changed to write it. Every number below is
> taken from files in the repo or worked out from them; where a number is an
> assumption it says so.

## In short

- One short clip per distinct phoneme string in `content/snowmoon/pronunciation.json`:
  the house voice (Kokoro-82M, stock voice `af_heart`, same revision, speed 1.0)
  saying the word alone, from the entry's phonemes, with no text-to-phoneme step.
- One committed recipe per clip, in `content/snowmoon/recipes/words/`, shown by
  the existing recipe sheet.
- Published to the book's R2 bucket under sha256 names, listed in one public
  index the app reads at build time.
- The glossary's "Hear it" plays the word alone; today's paragraph clip stays as
  "Hear it in the book". An infotip in the reader (not built) would play the same clip.
- **Cost: nothing.** No paid service. About **2–3 minutes** of the project's
  computer for the glossary's 200 clips (about **1.1 MB**), about **4–5 minutes**
  for all 339 (about **4.3 MB**). R2 egress is free; storage is a rounding error.
- **The owner's time is the real cost:** listening to 200 clips is roughly 30–45 minutes.

---

## 1. What exists today

**The narration.** `scripts/narrate.py` runs Kokoro-82M locally (`hexgrad/Kokoro-82M`,
revision `f3ff3571791e39611d31c381e3a41a3af07b4987`, weights `kokoro-v1_0.pth`,
`kokoro` 0.9.4, `misaki` 0.9.4, torch 2.14.1) on the CPU of the project's Mac
(`macOS-26.5.1-arm64`, Python 3.12). Voice `af_heart` (stock), `lang_code a`
(American English), speed 1.0, 24 kHz mono. Each block is written as 16-bit WAV,
then encoded for the web as AAC 64 kbps mono `.m4a` (`BLOCK_AAC`). One recipe per
chapter (`content/snowmoon/recipes/narration/chapter-N.json`) records the model,
voice, settings, the exact text sent for every block, durations, sha256s and
per-block `generation_s`. `scripts/publish-narration.ts` uploads to R2 and writes
the public index `content/snowmoon/narration/kokoro-af_heart/chapter-N.json`,
which the player reads.

**Pronunciation.** `content/snowmoon/pronunciation.json` holds **345 entries**, every
one with `phonemes` in misaki's American English set (the G2P behind Kokoro;
`"g2p": "misaki 0.9.4, lang_code a (en-us)"`). Fields: `word`, `kind`, `chapters`,
`phonemes`, `override`, `reviewed`, and optionally `respelling`, `note`, `rule`,
`match_case`, `meaning`, `reviewed_by`, `reviewed_on`.

| | entries |
|---|---|
| kind `dzegoban` (spelled by the Dzegoban rule) | 216, plus `Dzego` (kind place, `rule: dzegoban`) |
| names, places, coinages, times, brands, adjective | 127 |
| `common-word` (`breathed`, `medieval`) | 2 |
| `override: true` (forced with misaki's `[word](/phonemes/)` markup) | 226 |
| `override: false` (listed as what the default G2P already says) | 119 |
| `reviewed: true` | **1** (`breathed`, FID 6786, 2026-10-08) |
| with a `respelling` | **23**; 322 have none |
| single words / 2–3 words / 4+ words | 172 / 43 / 130 (the longest is 35 words, 158 phoneme characters) |
| distinct phoneme strings | **339** (six pairs differ only in case: `ja`/`Ja`, `tei`/`TEI`, `min`/`Min`, and three Dzegoban phrases) |

For Dzegoban, the narration does not read the stored phonemes: `narrate.py`'s
`entry_phonemes` re-derives them from the rule (`dzegoban_phonemes`). The stored
`phonemes` of all 217 rule entries equal the rule's output today (checked while
writing this, by running the rule function on the stored words; no model). For
`override: false` entries the narration does not force anything: misaki's default
G2P says the word, and the stored phonemes are only a record of what it said.

How a wrong word is fixed is set by `docs/pronunciation-fixes.md`: a report, the
owner's approval, the entry marked `reviewed`, only the affected blocks re-spoken,
the app and the podcast republished together.

**The glossary.** `content/snowmoon/glossary.json` (built by
`scripts/build-glossary.ts`, rebuilt byte for byte by `npm run test:glossary`) has
**208 terms**: 193 from pronunciation entries, 12 from the review file, 3 from
entities. 182 have a `clip`: the shortest narration block in the first chapter
that speaks the term. Since the narration has no word timings, **"Hear it" plays
the whole paragraph** (`src/components/glossary.tsx`, `Clip`), with the note
"Synthetic narration …, AI-generated · the whole of Chapter N, ¶ … since the
narration has no word timings · said as DZEH-go, a house choice, unreviewed".
That note does not yet use the `AiLabel` control ("AI voice · by Snowmoon Party")
the chapter player uses, and has no recipe link.

**The infotip. Nothing exists.** There is no infotip, tooltip or term popover in
the reader: a grep for `infotip`, `tooltip` and `popover` across `src/` finds none,
and the chapter text does not mark invented words. Section 10 describes how one
would use the clip; it is **not built** and would need its own proposal.

**Media.** README "Media": the book's audio and images are on Cloudflare R2 at
`media.snowmoon.party`, uploaded only from a trusted machine with the book's key.
Keys carry the file's sha256 (first 12 hex characters in the name, e.g.
`narration/kokoro-af_heart/c1/b069-857496a09f63.m4a`), objects are uploaded only
if missing and served `public, max-age=31536000, immutable` (`scripts/lib/r2.ts`).

## 2. Which words

Two candidate sets, and how they map.

**The glossary's words (recommended first).** A glossary term maps to a
pronunciation entry when its `term`, or one of its `aliases`, equals an entry's
`word` exactly (the glossary builds its terms from those words, so the match is
exact, case included).

- 191 headwords have their own entry.
- 2 headwords have none but have aliases that do: *Decentralized University*
  (aliases `DU`, `dzu hu sun du`) and *Greater Plum Harbor* (alias `GPH`).
- 15 terms have no entry at all, because they are English words or English
  phrases the book capitalises (*Acolyte*, *Arctic Empire*, *Order of Steering*,
  *privacy robe*, *Sentinels* …). They get no word clip under this proposal.
- Counting aliases that have entries (`autobuses`, `longhours`, `lightfeet`, `zc`,
  `Sewlert`, `Zei Leimin` …): **202 spellings, 200 distinct phoneme strings, so
  200 clips.**

**Every entry.** 339 clips. The extra 139 are the 130 phrases of four or more
words (Dzegoban sentences; the glossary excludes them as "a phrase, not a word"),
the 2 common words, and entries with no mention in the book text. They are cheap
to make but slow to review, and the long phrases are not words.

**Variants and aliases.** A plural or variant with its own entry (`autobus` /
`autobuses`) gets its own clip, because it has its own phonemes; a glossary page
plays the headword's clip and lists the alias's beside "Also written". Spellings
that differ only in case and share phonemes (`ja` / `Ja`) share one clip and one
recipe, which lists both words. A glossary alias without an entry (`Acolytes`)
has no clip.

## 3. Input: phonemes straight into Kokoro

The clip is made from the entry's `phonemes`, not from its spelling, so the
text-to-phoneme step cannot change it.

- **Route A (recommended): raw phonemes.** In `kokoro` 0.9.4, `KPipeline` takes
  a phoneme string directly (`generate_from_tokens(tokens="ˈdzɛɡO", voice=…,
  speed=1.0)`), skipping misaki entirely; the limit is 510 phoneme tokens, and the
  longest entry has 158. The recipe's "prompt" is then exactly the phoneme string.
- **Route B: the narration's own markup.** `pipeline("[Dzego](/ˈdzɛɡO/)")`, the
  same path `apply_pronunciation` uses for forced words. The result should be the
  same; Route A is simpler to state in a recipe.

The phonemes are misaki's set, not espeak IPA: `A` = "ay", `O` = "oh", `I` = "eye",
`W` = "ow", `T` = flapped t, `ˈ`/`ˌ` stress, `ᵊ` reduced vowel. Kokoro's
vocabulary is that set. (`espeak-ng` is installed only as misaki's fallback for
unknown words in running text; Route A never calls it.)

**Which phonemes.** The entry's stored `phonemes`, for every entry. For Dzegoban
entries the build also runs the rule and refuses a clip if the two differ, so a
word clip can never disagree with the narration's rule.

**`override: false` entries.** The narration said these with misaki's default G2P,
in context; the stored phonemes are a record of that, never checked since. A clip
forced from them could differ from what the paragraph says. The build should run
misaki alone (`KPipeline(lang_code="a", model=False)`, text to phonemes, no speech
model) on each such word and refuse a clip whose stored phonemes differ, listing
the word for the owner. That check needs the narration's Python environment but
not the speech model.

**Punctuation.** A word alone can sound clipped or question-like. Whether to send
the bare phonemes or the phonemes followed by `.` (falling end) is decision 2;
whichever is chosen is part of the recorded input.

## 4. The house voice and settings

Exactly the narration's: `hexgrad/Kokoro-82M` at revision
`f3ff3571791e39611d31c381e3a41a3af07b4987`, `kokoro-v1_0.pth` (sha256
`496dba11…1e4`), voice `af_heart` (file sha256 `0ab5709b…4cb4ff`, stock),
`lang_code a`, speed 1.0, 24 kHz, CPU, the same `kokoro`/`misaki`/torch versions.
The script reuses `narrate.py`'s pinned constants rather than copying them, so a
clip can't drift from the narration. If the narration's model or voice ever
changes, every clip is re-made in the same change (section 13 checks this).

Two honest caveats:

- Kokoro picks a row of the voice file by the length of the phoneme string, so a
  five-phoneme word is spoken with a different style row than a 200-phoneme
  paragraph. Same voice, but the word alone may sound a little different from the
  same word inside a sentence. Listening is the test.
- The narration recipes record no seed. Kokoro's decoder adds random noise, so
  two runs of the same input may differ slightly. The clip script should set
  `torch.manual_seed` per clip and record the seed, so a clip can be re-made
  exactly. (To confirm against `kokoro` 0.9.4 when built.)

## 5. Output format

| | |
|---|---|
| Raw | Kokoro's output, 24 kHz mono float, written as 16-bit WAV (kept locally, sha256 in the recipe, like the narration's block WAVs) |
| Trim | Kokoro pads short inputs: a one-word block such as "Yep." is 1.25–1.3 s long. Trim leading and trailing silence below −50 dBFS in code (numpy, recorded in the recipe), keep 60 ms before and 150 ms after, 5 ms fades. Nothing in the middle is cut. |
| Loudness | **No gain change** (recommended, decision 3): the narration's web blocks are not normalised either, so the word and "Hear it in the book" play at the same level. The recipe records the clip's peak (dBFS) and, for clips over 0.4 s, its loudness (LUFS, by ffmpeg `ebur128`); the build refuses a clip that clips (peak above −1 dBFS) or is near silent. Integrated LUFS is not meaningful under 0.4 s, which is why the podcast's −16 LUFS normalisation is not proposed here. |
| Web file | AAC-LC 64 kbps mono `.m4a`, 24 kHz, `ffmpeg -c:a aac -b:a 64k -ac 1` (the narration's `BLOCK_AAC`), plays everywhere the narration plays |
| Length | single words about 0.4–1.2 s after trimming (median estimate 0.6 s); the longest phrase about 10 s |
| Size | about 1 KB of container plus 8 KB per second: a typical word is **5–10 KB** |

## 6. One recipe per clip

**Where:** `content/snowmoon/recipes/words/<slug>.json`, one file per clip. The
slug is the word lowercased, with runs of other characters turned into `-`
(`dzego`, `the-aks`, `milli-ticks`); spellings that differ only in case share a
phoneme string, so they share one file.

**Fields** (example, values illustrative):

```json
{
  "work_id": "snowmoon",
  "kind": "word",
  "words": ["Dzego"],
  "phonemes": "ˈdzɛɡO",
  "input": "ˈdzɛɡO.",
  "input_route": "KPipeline.generate_from_tokens (no G2P)",
  "pronunciation": {
    "file": "content/snowmoon/pronunciation.json",
    "file_sha256": "…",
    "override": true,
    "rule": "dzegoban",
    "respelling": "DZEH-go",
    "reviewed": false
  },
  "model": {
    "name": "Kokoro-82M", "repo": "hexgrad/Kokoro-82M",
    "revision": "f3ff3571791e39611d31c381e3a41a3af07b4987",
    "weights_file": "kokoro-v1_0.pth", "weights_sha256": "496dba11…",
    "license": "apache-2.0",
    "kokoro_version": "0.9.4", "misaki_version": "0.9.4", "torch_version": "2.14.1"
  },
  "voice": { "name": "af_heart", "file_sha256": "0ab5709b…", "stock": true },
  "settings": { "lang_code": "a", "speed": 1.0, "sample_rate": 24000, "device": "cpu", "seed": 0 },
  "trim": { "threshold_dbfs": -50, "lead_ms": 60, "tail_ms": 150, "fade_ms": 5, "made_by": "code (numpy)" },
  "host": { "platform": "macOS-26.5.1-arm64-arm-64bit", "machine": "arm64", "python": "3.12.15" },
  "generated_at": "…",
  "generation_s": 0.21,
  "raw":  { "file": "words/dzego.wav", "sha256": "…", "duration_ms": 1300 },
  "clip": { "file": "words/dzego.m4a", "sha256": "…", "duration_ms": 640, "peak_dbfs": -4.1, "encoding": "aac 64k mono, ffmpeg" },
  "cost": "nothing: ran on the project's computer",
  "listened": null,
  "assist": {
    "model": "claude-coding-agent",
    "drafted": ["the pronunciation entry (content/snowmoon/pronunciation.json)"],
    "see": "config/models.json drafting; principle 3"
  }
}
```

`listened` is filled when the owner approves the clip (section 8). `assist` says
what the narration recipes already say: the pronunciation entries were drafted by
the coding agent, a closed model (principle 3's report).

**In the recipe sheet.** `src/lib/recipe-view.ts` gets a fourth family beside
images, narration and the podcast, for `recipes/words/` (`safeRecipePath` already
admits any committed file under `content/snowmoon/recipes/`). Filled by the fixed
template, as now, nothing written by a model:

- **Who made it:** a new `WHOSE.word`, draft wording: "Snowmoon Party, the project,
  made it with a speech model. AI-generated voice, not by the author. The word is
  the book's; how it is said is a house choice."
- **What:** "The word *Dzego*, said alone by the house narration's voice, from its
  phonemes in pronunciation.json."
- **Model:** "Kokoro-82M, stock voice af_heart", Apache-2.0, "on the project's own
  computer (arm64), not a hosted service" (the existing `where()`).
- **The exact input:** "The exact phonemes spoken (misaki, American English)":
  `ˈdzɛɡO.`
- **Inputs:** model revision; respelling, if any; "Pronunciation: a house choice,
  unreviewed" or "reviewed by FID 6786 on …"; "Spelled by the Dzegoban rule" where
  it applies; the trim and encoding.
- **Cost:** the existing `cost(0)` sentence, "Nothing: it ran on the project's own
  computer".
- **Published:** from the index's `published_by`.

## 7. Publishing

- **R2 path:** `narration/kokoro-af_heart/words/<slug>-<sha256[0:12]>.m4a` in the
  book's bucket, served at `https://media.snowmoon.party/…`. Same key scheme as the
  narration: a new clip gets a new name, nothing is overwritten, uploads skip what
  exists, cached forever.
- **Script:** `npm run publish:words -- --evidence=docs/prompts/<the approval>.md`
  (new, modelled on `publish-narration.ts`), from the trusted machine with the
  book's key in `.env.local`. It refuses a clip whose `.m4a` sha256 differs from
  its recipe, or whose recipe has no `listened` approval (decision 6).
- **Index the app reads:** `content/snowmoon/narration/kokoro-af_heart/words.json`,
  committed, like `chapter-N.json`: `work_id`, `voice`, `label`, `license`,
  `published_by` (FID 6786, role maintainer, script, date, evidence), the model and
  voice, `pronunciation_sha256`, and `clips: [{ slug, words, phonemes, url, sha256,
  bytes, duration_ms, recipe }]`.
- **The glossary reads it at build time** (`src/lib/glossary.ts`), matching each
  term's spellings to `clips[].words`. `glossary.json` stays untouched, so its rule
  ("the book's, and only the book's") and its byte-for-byte rebuild test are
  unchanged (decision 4).

## 8. Review: the owner listens

1. The build writes every clip locally and a plain local review page (or a
   terminal list) of word, respelling, phonemes, chapters and a play button.
   Nothing is uploaded before review.
2. The owner listens and marks each clip **approve** or **re-make**, with a word
   about what is wrong. Approval is recorded in the clip's recipe:
   `listened: { by: "FID 6786", on: "…", verdict: "approved" }`, and the
   instruction is logged in `docs/prompts/`.
3. **A bad clip is re-made one of two ways:**
   - **The sound is wrong** (wrong stress, wrong vowel). That is a
     pronunciation fix, and it goes through `docs/pronunciation-fixes.md` as it
     stands: the entry gets new phonemes, `override: true`, `reviewed: true`, and
     the affected narration blocks are re-spoken. The word clip is re-made in the
     same change, so the glossary's two buttons never disagree.
   - **The render is bad** (a click, a swallowed ending, a rising "question"
     tone) but the phonemes are right. Re-made with a different recorded seed,
     or with/without the trailing `.`, recorded in the recipe; the entry does not
     change.
4. **Approving a clip is not reviewing the pronunciation.** The owner's approval
   says the clip is a faithful, clean rendering of the entry. The entry stays
   `reviewed: false` (and every label keeps saying "a house choice, unreviewed")
   until the owner signs off the pronunciation itself under
   `pronunciation-fixes.md`. The owner may choose to do both at once (decision 6).
5. **Respellings are marked unreviewed** wherever shown: "said as DZEH-go, a house
   choice, unreviewed", exactly as the glossary does now. A respelling made by the
   Dzegoban rule says "spelled by the Dzegoban rule". Only an entry with
   `reviewed: true` drops "unreviewed".

## 9. How the glossary uses them

On a word's page (`/glossary/[term]`), under the heading:

```
[ ▶ Hear it ]  AI voice · by Snowmoon Party
Said as DZEH-go, a house choice, unreviewed.
[ ▶ Hear it in the book · 5 s ]  the whole of Chapter 1, ¶112
```

- **"Hear it"** plays the word clip only (well under 2 s). Where a term has no
  word clip, the paragraph button keeps today's plain "Hear it" label.
- **"Hear it in the book"** is today's paragraph clip, unchanged, with its note
  ("the whole of Chapter N, ¶ …, since the narration has no word timings"). For
  the 26 terms whose only narrated mention is a model-drafted description, there
  is no paragraph clip today, and there still isn't (section 12).
- **The label** is the existing `AiLabel` with `kind="voice"` and
  `AI_LABEL.voice` ("AI voice · by Snowmoon Party"); its visually hidden
  declaration ("Synthetic narration, an AI-generated voice, not by the author")
  is part of the button's name. Pressing the label opens the **recipe sheet** for
  the word clip's recipe (`file="content/snowmoon/recipes/words/dzego.json"`).
  This also fixes today's gap: the paragraph clip's note says "AI-generated" but
  has no label or recipe link; it gets the same label, opening the chapter's
  narration recipe at that block.
- **Reading limits stay.** A word from a later chapter is covered until the
  reader shows it, exactly like its quotes; the word clip is covered with it.
- One clip plays at a time: starting one stops the other.
- The glossary index (`/glossary`) does not get play buttons (decision 11 could
  add them later).

## 10. How the infotip would use them (not built)

There is no infotip today. If one is built, its own proposal must settle how
words are marked in the chapter without altering the book's text (principle 2,
`P2a`: the marking would be added at render time, never in the stored blocks)
and when a word is marked (only glossary terms, only within the reader's
chapters, perhaps only the first mention per chapter). How it would use the clip:

- Tapping or focusing a marked word opens a small popover: the word, "Said as
  DZEH-go, a house choice, unreviewed", a **Hear it** button playing the same
  word clip from `words.json`, the `AiLabel` ("AI voice · by Snowmoon Party")
  opening the same recipe sheet, and "In the glossary →".
- It shows no definition. If it shows anything else, it is the glossary's first
  quoted sentence with its block link (principle 2, `P2e`).
- It never plays on open. If the chapter player is playing, Hear it pauses it
  first, or Hear it is disabled while it plays (Design to choose).
- The clip URL is on `media.snowmoon.party`, fetched only on tap.

## 11. Accessibility

- **A real button:** `<button type="button">`, keyboard reachable, `aria-pressed`
  while playing, label switching to "Stop", as the glossary's `Clip` does now. Its
  accessible name includes the word: "Hear *Dzego* said alone".
- **A text alternative:** the respelling is printed next to the button in plain
  text, so the sound is never the only way to learn it, and a screen reader reads
  it. Where there is no respelling (181 of the glossary's 202 spellings today),
  decision 5 decides: a rule-made respelling, a drafted one labelled as such, or
  "No respelling yet". Raw phonemes are not a usable text alternative and are
  shown only in the recipe sheet.
- **No autoplay**, ever, on the glossary or in an infotip. The audio object is
  created on the first press (as `Clip` does now), so the page makes no media
  request on load.
- The AI declaration is in the button's accessible name, not only in a tooltip.
- `check:ui`'s contrast and target-size floors apply to the new buttons.

## 12. Risks

- **Wrong stress.** Only one entry (`breathed`, not in the glossary) has been
  reviewed. The Dzegoban rule stresses the first syllable of every word, so a
  phrase gets a stress on each word, and a single word said alone with a falling
  end can sound emphatic or odd. The 119 default-G2P entries were never chosen by
  anyone. A clip makes a guess sound authoritative. Mitigation: every label says
  "a house choice, unreviewed"; the owner listens before anything is published;
  fixes go through `pronunciation-fixes.md`.
- **Words the book never says aloud.** 26 glossary terms (e.g. *Bonne*,
  *Clearhill*, *Petersvil*, *Silverbeach*, *Vidrik*, *TEI*, `sen hu`) are
  mentioned only in screens and figures, which the narration covers only with
  model-drafted spoken descriptions; that is why they have no paragraph clip. A
  word clip would be the first time anyone hears them, with no sentence around
  them. Acronyms (`GPH`, `DU`, `KAG`, `VNU`, `zc`) are spelled letter by letter by
  choice; the book never says how they are spoken. Decision 8 decides whether
  these get clips.
- **The word alone vs. in the sentence.** For `override: false` entries the
  narration used the default G2P in context; a forced clip could differ (section 3
  check). The style-row and seed caveats in section 4 may make the word sound a
  little unlike the paragraph.
- **Drift.** If an entry changes and the clip is not re-made, the two disagree.
  The checks in section 13 fail in that case.
- **The toolchain on this machine.** In the main checkout, `.venv` is a symlink
  to itself ("too many levels of symbolic links"), so `narrate.py` cannot run
  there as things stand. The model weights are in the Hugging Face cache. The
  environment must be re-created per `narrate.py`'s setup lines before any clip
  is made.
- **Dzegoban sound as the book's.** The book gives no pronunciation. A clip must
  never be presented as how the author says it (principle 8 tension, below).

## 13. Checks to add

In `npm run check:principles` (each proven to fail on a planted violation, as the
others are):

- **P1g** (new): every clip in `words.json` has a committed recipe; the recipe's
  `clip.sha256` equals the index's; the index's URL carries that sha256; every
  recipe's `phonemes` equal its pronunciation entry's `phonemes` now (and, for
  Dzegoban, the rule's output); every word listed in a recipe exists in
  `pronunciation.json`; the model, revision and voice equal the narration's. A
  changed entry fails until its clip is re-made.
- **P1d** extended: a signed-out visitor reaches the word clip's recipe from a
  glossary page (`/glossary/zei`), and that public file holds the phonemes.
- **P2b** extended: the glossary word page's word clip and paragraph clip both
  carry the `AiLabel` voice label with the declaration served.
- **P3b / P3c** extended: the walk over narration recipes also covers
  `recipes/words/` (model on the allowlist; `assist` present).
- **P4b** extended: `words.json` records `published_by` with an evidence file that
  exists.
- **P6a**: already loads `/glossary/zei`; add an assertion that every clip URL in
  `words.json` is on `media.snowmoon.party`.

Elsewhere:

- `npm run test:glossary`: a term with a word clip maps to existing spellings;
  `glossary.json` still rebuilds byte for byte.
- `npm run check:ui`: on `/glossary/zei`, "Hear it" and "Hear it in the book" are
  buttons, the respelling text is visible, no audio request is made on load, and
  pressing plays from `media.snowmoon.party`.
- In the clip script itself: refuse a clip that is near silent, clips, or is over
  3 s for a single word; refuse an `override: false` entry whose misaki output
  differs from its stored phonemes.

## 14. Cost and time

**Money: nothing.** Kokoro runs on the project's own computer; no hosted model,
no paid API. `config/models.json` already lists `kokoro-82m` with
`cost_usd_per_unit: 0`.

**Generation time**, from the narration's own logs (4,237 blocks, 32 chapter
recipes):

- The narration took 5,967 s of generation for 39,107 s of audio: **0.15–0.16 s
  per second of audio** on this Mac's CPU.
- The 904 blocks of 2.5 s or less took **0.17–1.0 s each, median 0.30 s**; one-word
  blocks ("Yep.", "Why?") came out 1.25–1.3 s long and took 0.17–0.24 s.
- Model and voice loading is not logged (the recipes' `generation_seconds` is the
  sum of the blocks). **Assumed** 15–30 s per run, once.
- Trimming and encoding with ffmpeg: **assumed** about 0.1–0.2 s per clip.

| | clips | raw audio | after trim | generation | + encode, load | web files |
|---|---|---|---|---|---|---|
| Glossary words | 200 | ~3.3 min | ~2 min (avg 0.6 s) | ~40 s | **~2–3 min** | **~1.1 MB** |
| Every entry | 339 | ~10.4 min | ~8 min (avg 1.4 s) | ~2 min | **~4–5 min** | **~4.3 MB** |

(Estimated duration per clip ≈ 0.5 s + 65 ms per phoneme character, from the
narration's short blocks; generation ≈ 0.165 × duration, at least 0.2 s.)

**Storage:** about 1–4 MB on R2, inside the free 10 GB; at R2's list price of
$0.015 per GB-month that would be under $0.0001 a month even if it were billed.
The local WAVs (not uploaded, not committed) are about 2× that.

**Bandwidth:** a play fetches one 5–10 KB file once, then the browser keeps it
(immutable). 10,000 plays ≈ 80 MB. R2 charges no egress; reads count toward the
free 10 million operations a month.

**People's time:** listening to 200 clips at about 10–15 s each, with notes, is
roughly **30–45 minutes** of the owner's time; 339 including the long Dzegoban
sentences is more like 1.5 hours. Re-making a clip is seconds of computer time.

## Principles

Tensions first.

- **2. AI declared; nothing generated presented as the author's — tension.** The
  word is the author's; the sound is a house choice the author never gave, made by
  a model from phonemes the coding agent drafted. A clean clip of a word can read
  as "this is how it is said". Held by: the `AiLabel` voice label and declaration
  on every clip, "a house choice, unreviewed" beside every respelling, the recipe
  sheet's "how it is said is a house choice", and never the words "correct" or
  "official". **Concern until the wording is the owner's.**
- **8. Dzegoban matches the source — tension.** The source shows Dzegoban as
  written and gives no sound. A clip of a Dzegoban word is the house rule, not the
  source. Held by: "spelled by the Dzegoban rule, unreviewed" on every Dzegoban
  clip; the text is still quoted as written. **Pass, if labelled.**
- **5. Nothing canon or official — tension, small.** A single "Hear it" for a word
  could be taken as the canonical sound. Held by the same labels; no "official
  pronunciation" wording anywhere. **Pass.**
- **1. Public recipes — pass, by design.** One committed recipe per clip with the
  exact phoneme input, model, revision, voice, seed, settings, machine and sha256s;
  P1g and the extended P1d check it. `assist` records that the entries were
  drafted by the coding agent.
- **3. Allowlist, open weights — pass.** Kokoro-82M is already allowlisted
  (Apache-2.0, open weights, local). No new model. misaki is used only as a
  check on `override: false` entries, not to make audio. The closed drafting model
  (Claude) drafted the pronunciation entries and this proposal; that is already
  reported under principle 3.
- **4. A person's action publishes — pass.** The maintainer path: the owner
  listens, approves, and runs `publish:words` with an evidence file; `words.json`
  records `published_by`.
- **6. No third-party requests — pass.** Clips are on `media.snowmoon.party`,
  fetched only on a press; no player library, no external service.
- **7. Payments, token — not touched.** Costs nothing; no payment enters anything.

## The owner's decisions

1. **Which words.**
   (a) the glossary's words, 200 clips; (b) every entry, 339 clips, including the
   130 long Dzegoban phrases; (c) headwords only, 191 clips.
   **Recommend (a)**; (b) later only if an infotip ever needs phrases.
2. **How the word is fed to Kokoro.**
   (a) raw phonemes (`generate_from_tokens`) with a trailing `.`; (b) raw phonemes,
   bare; (c) the narration's `[word](/phonemes/)` markup.
   **Recommend (a)**, after a 10-word listening test of (a) against (b).
3. **Loudness.**
   (a) no gain change, so the word matches "Hear it in the book"; (b) peak-normalise
   every clip to the same level; (c) −16 LUFS like the podcast.
   **Recommend (a)**; (c) is unreliable on clips under 0.4 s.
4. **Where the clip list lives.**
   (a) a separate `words.json` index the glossary reads; (b) a `word_clip` field
   inside `glossary.json`.
   **Recommend (a)**: `glossary.json` stays the book's, and its rebuild test is
   untouched.
5. **Respellings for the 181 glossary spellings that have none.**
   (a) Dzegoban (75) respelled by code from the rule's own table, others (106)
   drafted by the coding agent, both labelled "unreviewed"; (b) only the
   rule-made ones, "No respelling yet" for the rest; (c) the owner writes them.
   **Recommend (b)** now, (a) or (c) later; no model-drafted text goes on the page
   without a label.
6. **What the owner's approval of a clip means.**
   (a) the clip is a clean rendering only; the entry stays unreviewed;
   (b) approving a clip also marks the entry `reviewed: true` (the pronunciation
   is signed off too, under `pronunciation-fixes.md`, which re-speaks nothing for
   an unchanged sound).
   **Recommend (a)** by default, with (b) word by word when the owner is sure.
7. **Glossary terms with no pronunciation entry** (15: *Acolyte*, *Arctic Empire* …).
   (a) no word clip, keep the paragraph clip; (b) add entries so they get clips.
   **Recommend (a)**: they are English words.
8. **Words the book never says aloud** (26 terms mentioned only in screens and
   figures; acronyms).
   (a) make clips like the rest, labelled the same; (b) leave them out until the
   owner has heard them; (c) clips, with an extra line "this word is never spoken
   in the narration".
   **Recommend (b)** for the first pass.
9. **Aliases with their own entry** (`autobuses`, `GPH`, `lightfeet` …).
   (a) their own clips, played from "Also written"; (b) headword clip only.
   **Recommend (a)**: 11 extra clips at no cost.
10. **Recipes in the database.**
    (a) committed files only, like the image recipes; (b) also `studio.recipes`, like
    the narration's.
    **Recommend (a)**: no reader writes or reads them through the API.
11. **Label and wording.**
    (a) "AI voice · by Snowmoon Party" and "Said as …, a house choice, unreviewed",
    the `WHOSE.word` sentence as drafted here; (b) the owner's own words.
    **Recommend (b)** before anything is published; (a) is a draft.
12. **The infotip.**
    (a) a separate proposal after the glossary clips ship; (b) build it with them.
    **Recommend (a)**: marking words in the book's text needs its own rules.
13. **Seeds.**
    (a) seed 0 for every clip, a new seed only to re-make a bad render; (b) no seed,
    like the narration.
    **Recommend (a)**: a clip can then be re-made exactly.
