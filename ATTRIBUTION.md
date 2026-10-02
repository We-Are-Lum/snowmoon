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
That is his own stated theory and has not been tested. This project follows
it because publishing how everything was made is the point of the project,
not because it is settled law.

## Contributions

Before a first contribution, contributors agree that their prompts and
generated media are published under GPL-3.0 and recorded permanently in the
public ledger.

There is no token.
