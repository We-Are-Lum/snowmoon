# Adaptation format

How an adaptation is written and rendered. This document describes; only stage
1 (the narrated comic) is being built, for one seed (`dog-dawn`). Stages 2 to 4
are described so the format does not have to change when they come.

## One source

Each adaptation lives in `adaptations/<seed>/`:

| File | What |
|---|---|
| `brief.md` | The seed: citations, what the text gives and what must be invented, open questions |
| `script.md` | **The single source.** Every rendering (comic, audio, animatic, video) is made from it |
| `timeline.json` | **The source of the edit**: every cue (voice line, ambience, Foley, music, shot, lettering), its track, level, fades and stem, and for shots the image or clip, framing and move. Times are anchors and offsets, never fixed starts (see Timing) |
| `shots.md` | The log of what was made: every attempt, its recipe and the notes on why it was or wasn't picked |
| `voices/` | The piece's voice sheets (Stage 2) |
| `prompts/` | Every prompt used: the owner's requests, the agent's drafting instructions, every image and speech prompt |

Nothing rendered is edited by hand afterwards. A change goes into `script.md`
and is rendered again.

## Who writes what

**Models build structure and images. People write every published word.**

- A model (including the coding agent) may draft the structure of a script:
  who is present, wants, obstacles, costs, what changes, context, image
  descriptions and lettering plans. It may also collect candidate lines from
  the book, verbatim.
- Voice descriptions, the sound line for each place, and style texts are
  the owner's words; until the owner sends them they are clearly marked
  placeholders, and nothing is published with one. Per-shot and per-cue
  prompts (image, motion, sound effect) may be drafted by a model and are
  labelled model-drafted in their recipes, like image prompts (owner,
  2026-10-13).
- A model never writes narration, dialogue, or any description that is
  published. Those fields stay empty until a person writes them.
- Every published word is the author's (a verbatim book line, tagged with its
  block) or a signed-in person's (tagged with their FID and the date).
  `npm run check:principles` (`P2c`) fails on any narration or dialogue line
  without one of these.

## The script

### Header

- **Status.** `Structure drafted by <who>. Not approved.` until a person
  approves it; then a line `> **Approved** by FID <n> on <YYYY-MM-DD>.`, with
  any edits they made. Nothing is generated from an unapproved script, and no
  audio is made for a beat until its narration is written.
- **Stage** being rendered, **narrator** voice, **point of view**, and
  **length** (beats; narration words written so far).
- **What is invented**: every place the structure goes beyond the book, with
  the brief's section that names the gap.

### Beats

Each beat is a `## Beat N · Title` section with these fields, in this order:

- **who**: the characters present (on the page or on the other end of a
  message).
- **wants**: what the beat's central character wants, by name.
- **in the way**: what stops them.
- **cost**: what getting it costs, and who pays. Where the book is silent,
  the cost is marked *(Invented: …)*.
- **what changes**: what is different at the end of the beat.
- **context**: the block IDs the beat draws on, each with a few words on what
  it gives. Anything the book does not give is noted *(Invented: …)*.
  `npm run check:adaptations` fails on any ID that is not in the book.
- **book lines**: candidate lines for the writer to use or ignore, each
  `` `c<ch>-b<idx>` `` and the text, verbatim from that block. `…` marks a cut;
  nothing else may change. A trailing *(note)* says who speaks or where the
  line sits. `npm run check:adaptations` fails on any candidate that is not in
  its block.
- **image**: a description of the panel, for the image model. Character looks
  come from the design board (`content/snowmoon/designs/`), and invented
  details are marked *(Invented: …)*. This is an input to the image model; it
  is not published as text.
- **lettering**: text that appears in the image, as `kind, lang` and the text
  (with a gloss for Dzegoban). The text in the image must match its lettering record exactly. It may be drawn in code, or repainted by the image model from the code-drawn version, and it is checked either way. The image model never invents text. Only book words or
  words a person wrote; Dzegoban must use the source's words. An in-world
  screen is the book's own screen block, captured from the reader's template
  (`scripts/capture-screen.ts`) and composited onto the device
  (`scripts/composite-screens.py`); a cut of it is marked `…` and recorded.
- **narration**: empty until a person writes it. At most 25 words per beat.
  Each line is tagged:
  - `` `book c<ch>-b<idx>` ``: a book line, verbatim (usually one of the
    candidates), or
  - `` `by FID <n> on <YYYY-MM-DD>` ``: written by that person.
- **dialogue**: empty until a person writes it. Each line is
  `Speaker: line`, tagged the same way. In stage 1 the narrator reads it; from
  stage 2 each speaker has a voice.

An empty field reads `*(empty until a person writes it)*`.

### Timing

A beat lasts as long as its audio. Durations are measured from the rendered
audio; nothing is timed by hand. `timeline.json` holds only edit decisions:
each voice line points to its place in `script.md` (`b<beat>-<n>`) and follows
a named cue with a gap; a negative offset overlaps it (J-cuts and L-cuts).
Shots run from one cue to another, beds and Foley hang off a cue or a shot
with an offset, and lettering on cue points to a record in the lettering
file, never to text. `scripts/mix-scene.py` measures every stem, resolves the
absolute times, measures and normalises loudness, and writes
`timeline.resolved.json` into the mix's recipe with each stem's sha256. The
renderer and the player read only the resolved file.

## Stage 1: narrated comic

- One image per beat, made through the image job pipeline
  (`content/snowmoon/illustrations/`, `scripts/illustrate.py`): a recipe for
  each image, the clean render kept, lettering added by
  `scripts/letter-images.py`. At most three attempts per panel; all attempts
  are listed in `shots.md`.
- One narrator voice, different from the house narration, through the speech
  adapter (`scripts/narrate.py`), with the pronunciation table and its
  Dzegoban rule. The voice's license is checked and recorded before use.
- Rendered as the existing player on `/adaptations/<seed>`, showing each panel
  while its beat plays, and as one 1080p video file (panels and audio, simple
  cuts) for posting.
- The adaptation page shows the piece first: each panel's image (alt text
  beginning "AI-generated image:") and the lines people chose or wrote, each
  with its author. The structure, candidate lines and image descriptions sit
  under a collapsed "How this was built", labelled model-drafted. Panel images
  are listed in `adaptations/<seed>/panels.json`. A beat may show more than
  one image in sequence (each with an `order`): the page shows them one after
  the other, and the video cuts from one to the next within the beat.
- The page carries an AI use declaration: what was generated, with which
  models, and who wrote each line (the author or a signed-in person).
- Published only after the owner has watched it, by a signed-in action
  (principle 4).

## Stage 2: audio drama with character voices

- The same script, with `dialogue` voiced: each named speaker is cast to a
  voice. Synthetic voices are stock voices, voices designed from a written
  description (the owner's words), or a consenting person's performance
  converted into a designed voice, all through models on the allowlist.
  A voice is never a clone of a real person, and no prompt names a real
  person.
- **Performed lines.** A person may perform lines that are converted into a
  character's voice. They first agree to the voice consent
  (`own-voice-v1`, `config/consent.json`): the converted output is released
  under GPL-3.0 and anyone may convert it further; their raw takes are not
  released. Conversion runs on the performer's own machine, so a take never
  leaves it; a hosted conversion model is used only if that performer agrees
  to it for that take. Raw takes stay in a private folder outside the
  repository and outside R2. The converted line is published as that line's
  source; its recipe gives the model and revision, the settings, the
  character's reference clip and the sha256 of the raw take, not the take
  itself. This is a recorded exception to principle 1 (owner, 2026-10-13).
- **Voice sheets.** Each character's voice is a voice sheet in
  `adaptations/<seed>/voices/`: the character, the description (the owner's
  words), the model, seed and a reference clip of about ten seconds,
  pronunciation notes, and the recipe. Later lines are spoken through a
  model that clones from the reference clip, so the voice stays the same.
  A sheet is forkable, shown with its character, and labelled AI voice.
- Text-only voice models take respellings from the pronunciation table;
  Kokoro keeps phonemes. Dzegoban has a respelling rule beside its phoneme
  rule.
- The narrator keeps the `narration` lines, as people wrote them. Sound and music, if any, are
  licensed for GPL release or made for the piece, each with a recipe or
  source.
- Each beat's duration comes from its mixed audio, as in stage 1.
- **Podcast feed.** Finished audio dramas are published as episodes of a
  podcast feed (RSS), like the house narration feed: free, non-exclusive, the
  files downloadable without DRM, and every episode carrying the GPL-3.0
  notice, the source link, and the AI declaration. The script is the
  episode's transcript.

## Stage 3: animatic

- A storyboard timed to the stage 2 audio. A beat may hold several shots;
  each shot is a still (or a crop of one) with a simple camera move (pan, push,
  hold) and a cut or dissolve.
- The shot list is in `timeline.json`: per shot, the image (or clip), its
  framing, its move, and the cues it runs between. `shots.md` keeps the log
  of attempts.
- Lettering follows the same rule (drawn in code, or repainted from the
  code-drawn version, and checked), and may now appear and move on cue.
- Output: one video, made entirely from approved stills and audio.

## Stage 4: video

- Motion for each shot of the animatic, timed to it: from an open-weight video
  model on the allowlist (license checked first, recipe for every clip), or
  drawn by hand.
- The animatic stays the timing reference; a shot that cannot be made well
  stays as its animatic still.
- Same rules as before: every clip has a recipe, the AI declaration covers it,
  and a person approves and publishes.

## Checks that apply at every stage

- Book lines verbatim and citations real (`check:adaptations`).
- Every narration and dialogue line has a human author recorded: the book's
  author or a signed-in person (principle 2, `P2c`).
- Every generated asset has a recipe (principle 1) and is declared where it is
  shown (principle 2).
- Models come from `config/models.json`, open weights preferred (principle 3).
- Nothing is published without a signed-in person's action (principle 4).
