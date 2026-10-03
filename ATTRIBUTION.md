# Attribution

*Snowmoon* was written by Vitalik Buterin and released under the GNU General
Public License v3. Source: https://vitalik.eth.limo/snowmoon/

This project is an independent adaptation. It is not affiliated with or
endorsed by the author.

## What is in this repository

Source: https://github.com/We-Are-Lum/snowmoon

Everything used to make this edition is here and licensed GPL-3.0:

| Path | What |
|------|------|
| `content/snowmoon/source/` | The chapter pages exactly as fetched from the source site |
| `content/snowmoon/text/` | Those pages parsed into ordered, hashed text blocks |
| `scripts/` | Ingest, checks, and seeding scripts |
| `supabase/migrations/` | The database schema |
| `src/` | The app |
| `docs/` | The build brief and chapter notes this was built from |
| `docs/prompts/` | The prompts given to the coding agent that built this repo |
| `docs/source-figures/` | Every SVG figure from the source, exported standalone (GPL v3, from the book) |

As later milestones land, prompts (`prompts/`), analysis output, read-aloud
overrides, pronunciation tables, and rendered-screen templates are committed
here too, and every generation's recipe (prompt, model, parameters, cost) is
published in the public ledger.

## Styles

The hand-device screen and dateline styles in `src/app/globals.css` are
adapted from the source edition's stylesheet (GPL v3).

## The author's reading of the license

The author has said that he reads GPL v3 to mean that anyone may adapt the
book, but must open-source the pipeline used to make the adaptation: AI
prompts, scripts, task-specific harness, and other non-commodity materials.
From the book's index page (https://vitalik.eth.limo/snowmoon/):

> Yes, I said GPL v3, not CC-BY-SA. My legal theory, which Kimi K3 says is
> plausible, is that you are free to go turn it into a movie or a vibe-coded
> anime or whatever, but if you do that, you are required to open-source the
> pipeline (AI prompts, scripts, task-specific harness, etc) and other
> non-commodity materials that you used to make it so that other people can
> build on top of your work.

That is his own stated theory and has not been tested. This project follows
it because publishing how everything was made is the point of the project,
not because it is settled law.

## Contributions

Before a first contribution, contributors agree that their prompts and
generated media are published under GPL-3.0 and recorded permanently in the
public ledger.

There is no token.

## Narration

The narration of all 32 chapters is synthetic speech from Kokoro-82M
(https://huggingface.co/hexgrad/Kokoro-82M, revision `f3ff357`), using the
stock voice `af_heart`. No real person's voice was cloned or imitated.

- The model card's license line is `license: apache-2.0`. The `kokoro` and
  `misaki` libraries are also Apache-2.0.
- There is no separate license for individual voices. VOICES.md gives none for
  English voices, so we rely on the repository-wide Apache-2.0 license, which
  covers the voice files.
- Neither card mentions generated audio. Apache-2.0 places no restriction on
  output, and Apache-2.0 material can be included in a GPL-3.0 work, so the
  audio is published under GPL-3.0 with the rest of this edition.
- The model card says training data included synthetic audio from closed
  commercial TTS models. The source of each voice is not documented.

The script is `scripts/narrate.py`. Pronunciations are in
`content/snowmoon/pronunciation.json`, including the rule used to read
Dzegoban, and the spoken descriptions of screens and figures are in
`content/snowmoon/read-aloud/`. Both are drafts that nobody has reviewed yet.

## Images

Test illustrations are rendered locally with FLUX.2 [klein] 4B
(https://huggingface.co/black-forest-labs/FLUX.2-klein-4B, revision
`e7b7dc2`), whose model card's license line is `license: apache-2.0`. They
are run through mflux (MIT) on Apple Silicon. Prompts, style guides and
character profiles are in `content/snowmoon/designs/` and
`content/snowmoon/illustrations/`, and the script is `scripts/illustrate.py`.
The book barely describes how its characters look, so every character
profile is an invention, marked as a starting point and not canon. Profiles
depict fictional people only, never a real person.
