# Make your own scene

How to fork this repository and make a scene from *Snowmoon* with the same pipeline: a script
people write, a timeline that holds the edit, stems, stills, a mix and a 1080p render, with a
public recipe for everything a model made.

*Snowmoon* is a novel by Vitalik Buterin, published under GPL-3.0 at
<https://vitalik.eth.limo/snowmoon/>. This repository is an independent edition, not affiliated
with him, and is GPL-3.0 too. Anything you make from it is GPL-3.0.

Every command below was run from a fresh clone on 2026-10-15 (macOS, Node 22, Python 3.12, ffmpeg
9). Where a step needs a model download, a paid service or a key, it says so.

## 1. Get it running

You need Node 22.11 or later, Python 3.10 or later, [uv](https://docs.astral.sh/uv/) (or any way
of making a virtual environment), and ffmpeg on your PATH.

```sh
git clone https://github.com/We-Are-Lum/snowmoon.git
cd snowmoon
npm install
npm run build && npm start            # the reader at http://localhost:3000; no keys needed
```

The scene scripts are Python. The mixer and renderer need only three packages:

```sh
uv venv --python 3.12 .venv-scene
VIRTUAL_ENV=.venv-scene uv pip install numpy soundfile pillow
```

## 2. Run the example scene, with no keys

`adaptations/dog-dawn/timeline.json` is a test timeline: placeholder voices, synthesised sound,
and stills that aren't in the repository (they're large and gitignored). Three commands take it
from nothing to a video:

```sh
.venv-scene/bin/python scripts/scene-placeholders.py dog-dawn --quick   # 20 stand-in stems
.venv-scene/bin/python scripts/mix-scene.py dog-dawn                    # the mix, measured and normalised
.venv-scene/bin/python scripts/render-scene.py dog-dawn --stand-ins     # the video
```

- `--quick` makes the voice stand-ins as soft tones, one per word, so no speech model is needed.
  Without it, they are read by Kokoro (a local open-weight model; it needs `kokoro` and `torch`
  and downloads the model once).
- `--stand-ins` draws a grey card for each still that isn't on your machine, naming the shot and
  the missing file, so you can see the camera moves and cuts. It works only on a timeline marked
  `"placeholder": true`; a real scene must have its stills.
- Output: `scenes-out/dog-dawn/mix/dog-dawn-mix.wav` (87 s, about -16 LUFS) and
  `scenes-out/dog-dawn/video/dog-dawn.mp4` (1920x1080, 30 fps), each with a `recipe.json` beside
  it. `scenes-out/` is gitignored. Add `--from 0 --to 8` to the renderer for a quick preview.

## 3. The files of a scene

A scene lives in `adaptations/<seed>/`. The format is `docs/adaptation-format.md`; the short
version:

| File | What |
|---|---|
| `brief.md` | What the book gives (with block citations) and what has to be invented |
| `script.md` | **The words.** Beats, and every line a person wrote or chose from the book |
| `timeline.json` | **The edit.** Every voice line, bed, sound effect, shot and lettering cue |
| `shots.md` | The log of what was made: every attempt and why it was kept or not |
| `voices/` | Voice sheets, one per character |
| `end-card.json` | The closing card's credits and links; the video description is made from it |

Add your seed to `config/adaptations.json` (slug, title, one line, `spoilers_through`) and write
its `brief.md`; then check it:

```sh
npm run check:adaptations     # every cited block exists, book lines are verbatim, seeds match folders
```

### The script and who writes it

Each beat is a `## Beat N · Title` section with fixed fields (who, wants, in the way, cost, what
changes, context, book lines, image, lettering, narration, dialogue). A model may draft the
structure. **Narration and dialogue are written by people, never by a model.** Each line carries
its author:

- `` `book c14-b32` ``: a line from the book, verbatim, at that block; `…` marks a cut and nothing
  else may change;
- `` `by FID 1234 on 2026-10-15` ``: a line written by that person.

Narration is at most 25 words a beat. `check:adaptations` fails on a book line that isn't exactly
in its block, and `check:principles` (P2c) fails on any line without an author. To see what a
narrator would say, without any model:

```sh
.venv-scene/bin/python scripts/narrate-adaptation.py dog-dawn --voice am_michael --check
```

### The timeline

Times in `timeline.json` are never typed in: they come from the audio. Each cue starts relative
to another cue (`"at": {"cue": "b02-1", "edge": "start", "offset": -0.6}`) or to `@start`. A
negative offset lets a sound or a picture arrive before the line it belongs to. Shots run from
one cue to the next, with a `move` (push, pan or hold, as framings with x, y and zoom) and a
`transition` (cut or dissolve). Lettering points to a record in an illustration job file, never to
text in the timeline. Tracks set levels (voice 0 dB, beds -22, Foley -10, music -16 in the
example).

`mix-scene.py` measures every stem, works out the absolute times, normalises loudness in two
passes (the example targets -16 LUFS, -1 dBTP) and writes the resolved timeline into its recipe.
`render-scene.py` reads only that resolved timeline, so the picture always follows the audio.
Change a line, re-mix, re-render: nothing else needs touching.

For your own scene, point `end_card` in the timeline at your own `adaptations/<seed>/end-card.json`
(the example still points at Fifteen Days' card), then:

```sh
.venv-scene/bin/python scripts/scene-description.py <seed>    # the video description, from the end card
```

## 4. Recipes

Every file a model or a script makes gets a recipe: the model and its revision (or, for a hosted
model, the endpoint, the date and the host's request id), the exact prompt or text sent, the seed
and settings, the cost, and the sha256 of the output. Mixes and renders get one too (inputs by
sha256, the ffmpeg version and command, the measured loudness). Recipes are committed; outputs
mostly aren't. Prompts drafted by a model are labelled as such in the recipe's `assist` field.
`npm run check:principles` checks recipes and labels across the repository.

## 5. Models and licences

Only models in `config/models.json` may make anything published. Each entry quotes the licence
line from the model's own card, pins a revision (or names the hosted endpoint) and says whether
its weights are open. A model is added only if its licence clearly allows releasing its outputs
under GPL-3.0. Published scene assets use open-weight models only. The list also records models
that were checked and excluded, and why.

| Job | Models on the list | Runs |
|---|---|---|
| Narration | Kokoro-82M (stock voices `af_heart`, `am_michael`) | locally |
| Designing a voice from a description | Qwen3-TTS VoiceDesign, Maya1 | fal.ai (needs a key; paid) |
| Speaking in a designed voice | Chatterbox Turbo; MOSS-TTSD (two speakers) | fal.ai; a rented GPU |
| A performance converted into a designed voice | Chatterbox speech-to-speech | locally |
| Stills | FLUX.2 [klein] 4B; Z-Image Turbo; ERNIE-Image Turbo | locally (Apple Silicon); fal.ai |
| Motion | Wan 2.2 I2V A14B, LongCat-Video, Kandinsky 5 I2V Pro | fal.ai |
| Speaking close-ups | InfiniteTalk, LongCat-Video-Avatar | fal.ai |

To add a model, quote its card's licence line in a reviewed change, as the other entries do.

## 6. Voices

A voice is one of three things: a stock voice, a voice designed from a written description, or a
person's performance converted into a designed voice. No voice is a clone of a real person, and no
prompt names one.

- **Voice sheets.** `adaptations/<seed>/voices/<id>.json` holds the character, the description,
  who wrote it, and the reference text. `scripts/design-voice.py <seed> <ids…> --cap <usd>` designs
  each voice on fal.ai under a hard spending cap and saves a ten-second reference clip; it needs
  `FAL_KEY` and costs money (see its header). Later lines are spoken or converted into that clip,
  so the character keeps one voice.
- **Performed lines.** `scripts/convert-voice.py` converts a person's take into a character's voice
  on their own machine with Chatterbox; the take never leaves it and is never published. The
  recipe records the take's sha256, not the take. The performer agrees to the voice consent first
  (draft: `docs/proposals/own-voice-v1.md`). In this version the script expects the Chatterbox
  weights at a fixed path on the maintainer's Mac; read its header and change `wdir` before you
  run it.
- **Labels.** Every voice made or converted by a model is labelled "AI voice" wherever it plays.
- **Names.** `content/snowmoon/pronunciation.json` says how the book's invented words are spoken
  (phonemes for Kokoro, respellings for text-only models). Dzegoban words follow one rule, in
  `scripts/narrate.py`.

## 7. Sound

Ambience beds and Foley are stems on the `bed` and `foley` tracks. The example's are synthesised in
code by `scene-placeholders.py`. For real sound, use recordings you may release under GPL-3.0:
CC0, CC BY 4.0, CC BY-SA 4.0, GPL-3.0, or GPL-2.0-or-later (not GPL-2.0-only), and credit CC BY
and CC BY-SA authors in the end card. No non-commercial, no-derivatives or no-redistribution
sources. Record each file's URL, author, licence and sha256. (A checked sound-sources folder is
planned but not built yet.)

## 8. Stills

`scripts/illustrate.py` renders stills locally with FLUX.2 [klein] (Apple Silicon, through mflux);
its setup is at the top of the file. `scripts/fal-render.py` renders on fal.ai with the hosted
models above and needs `FAL_KEY`. Character looks come from the design sheets in
`content/snowmoon/designs/`. Images carry no text: lettering is drawn in code by
`scripts/letter-images.py` from a lettering record, and only book words or words a person wrote
may appear. An in-world screen is the book's own screen block, captured from the reader.

## 9. What runs where

| Step | No keys, on any machine | Needs more |
|---|---|---|
| Reader, tests, checks | yes | 7 principle checks read the live database or Vercel and are skipped |
| Script, timeline, `check:adaptations` | yes | |
| Placeholder stems, mix, render | yes | Kokoro voices: `kokoro` and `torch` |
| Stills | | Apple Silicon (local), or `FAL_KEY` (paid) |
| Designed voices, motion, close-ups | | `FAL_KEY` (paid) |
| Converted performances | | Chatterbox weights, local (see section 6) |
| Two-speaker dialogue (MOSS-TTSD) | | a rented GPU |
| Publishing to snowmoon.party | | the maintainer only |

Keys go in `.env.local` (gitignored); `.env.example` lists the names. Never commit a key.

## 10. The rules

- The book's text is never altered. A book line is quoted verbatim at its block, or cut with `…`.
- People write every published word: narration, dialogue, voice descriptions and style texts.
  A model may draft structure and per-shot prompts, labelled as model-drafted.
- AI use is declared on every element, where it appears (principle 2): images, voices, sound and
  video a model made say so.
- Every model-made file has a public recipe.
- Open-weight models only, from the allowlist, for anything published.
- Nothing is presented as the author's, or as endorsed by him.
- Your scene is GPL-3.0, like the book. Link the book and this repository, and publish your
  scene's source (script, timeline, recipes, the stems you can share) so others can build on it.

`docs/principles.md` has the eight principles behind these rules and the checks that enforce them.
