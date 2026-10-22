# Minpentai: start here (for agents)

> DRAFT. Written by a coding agent (Anthropic's Claude, a closed model) for the site's owner to rewrite or approve. Plain text for an AI agent, or a person, who wants to build on this edition's Minpentai. Served at https://snowmoon.party/minpentai/agents.md; the source is `docs/minpentai/agents.md`. This project is not affiliated with or endorsed by the book's author.

## What it is

Minpentai is a game played in the novel *Snowmoon* (https://vitalik.eth.limo/snowmoon/). The book never gives its full rules. This edition's Minpentai (https://snowmoon.party/minpentai) is a simplified version, not the full game: a few of its rules come from the book, and the rest were invented for this edition. Every rule below says which.

In the book the board is a grid of cells that changes by a rule, and the game is played by building structures in it. This edition's playable game, called Play, uses pieces instead: towers, gliders, squares and rocks on a 15 × 10 board.

## License

- `LICENSE` is the GNU Affero General Public License, version 3, for the code. `package.json` says `"license": "AGPL-3.0-only"`. The book, and everything made from it, is under the GPL v3 (`LICENSE-GPL-3.0`, `LICENSING.md`, `ATTRIBUTION.md`).
- What that means for a contribution: a computer player is code, so once merged it is published under AGPL-3.0 with the rest of the code. Anyone may use, change and share it under the same license. If you distribute a changed version, or run one as a website, it must be under AGPL-3.0 too, with its source.
- `ATTRIBUTION.md`, under Contributions: "Before a first contribution, contributors agree that their prompts and generated media are published under GPL-3.0 and recorded permanently in the public ledger."
- Contribute only work you have the right to license that way.

## The repository

https://github.com/We-Are-Lum/snowmoon (public). The site is a Next.js app in TypeScript. There are three Minpentai engines; Play is the real one.

| What | Where |
|---|---|
| **Play**: the real game (practice, the computer ladder, free play, one-on-one) | `src/lib/minpentai/play-game/game.ts`: the board, `step`, `apply`, `lit`, `updLS`, the four drawn rules (`RULES`), the five computer players (`RUNGS`, `botPlan`) |
| Play in the browser | `src/lib/minpentai/play-game/controller.ts` (the match flow, without React), `src/app/minpentai/play.tsx` (the page) |
| One-on-one on the server | `src/lib/minpentai/play-server/match.ts` (clocks, the end, `checkPlacements`), `src/lib/minpentai/play-server/store.ts`, `src/app/api/minpentai/` |
| Computer players outside the page | `src/lib/minpentai/play-game/players.ts`, `scripts/minpentai-vs-rungs.ts` (below) |
| **Learn**: the lessons, on the first version of the rules | `src/lib/minpentai/learn-game/` (`pieces.ts` is its game), words in `src/lib/minpentai/learn-text.ts` |
| **The old one**: the book's cell rule, recovered from the book's animated figure (c4-b5, c4-b7) | `src/lib/minpentai/engine.ts`, shown at https://snowmoon.party/minpentai/rule (`src/app/minpentai/rule/`) |
| Older code on the book's rule, out of the menus | `src/lib/minpentai/match.ts`, `src/lib/minpentai/ai.ts`, `src/app/minpentai/sandbox.tsx` |
| The rules page | https://snowmoon.party/minpentai/rules: `src/app/minpentai/rules/rules-html.ts`, written by `scripts/build-minpentai-rules.ts` from `docs/design/minpentai-rules.dc.html` |
| What the book says about the rules | `docs/minpentai-rules.md` |
| The book's passages about Minpentai | `docs/minpentai/passages.md`, served at https://snowmoon.party/minpentai/passages.md |
| The book's text | `content/snowmoon/text/chapter-N.json` (never changed by hand) |
| The site's principles | `docs/principles.md` |

The lessons still use the first rules (Claude Design's v3, `docs/design/minpentai-intro-v3.dc.html`). For example, in Learn gliders move one at a time, in list order; in Play they all move at once. Section 11 of the rules page lists every difference. Play's rules page says its rules replace v3's; the lessons have not been changed yet.

## Run it locally

The repository is large (over 600 MB, mostly the films in `scenes-out/` and `adaptations/`), and Minpentai needs none of that. This fetches only what Minpentai, its tests and its pages need (about 45 MB, seconds):

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/We-Are-Lum/snowmoon.git
cd snowmoon
git sparse-checkout set src scripts docs content public config supabase
npm install                # Node 22.11 or later
npm run dev                # then open http://localhost:3000/minpentai?mode=play
```

`npm run dev` builds each page when you open it. `npm run build` builds the whole site, which needs the full clone (`git clone --depth 1 https://github.com/We-Are-Lum/snowmoon.git`, about 1.2 GB on disk). To write a computer player you need only the tests and `minpentai:vs-rungs` below; running the site is optional.

No keys are needed for Minpentai's practice match and free play (`/minpentai?mode=free`); they run in the browser. The ladder and one-on-one need Farcaster sign-in, and one-on-one also needs the database.

## Run the tests

None of these needs a key, a server or the network.

```sh
npm run typecheck
npm run test:minpentai-play           # Play, run beside Design's own mockup code and compared
npm run test:minpentai-play-server    # one-on-one: rules, clocks, refusals, views (an in-memory Postgres)
npm run test:minpentai-learn          # Learn, run beside Design's v3 code and compared
npm run test:minpentai-share          # sharing a ladder win
npm run test:minpentai-players        # players.ts and minpentai:vs-rungs
npm run test:minpentai-ladder         # the ladder: a seeded round robin of the five rungs (about a minute)
npm run test:minpentai-agents         # this file: its paths, scripts, quotes and example
npx tsx scripts/test-minpentai.ts       # the book's cell rule (engine.ts)
npx tsx scripts/test-minpentai-match.ts # the older match code on the book's rule
```

The ladder's own test, `test:minpentai-ladder` (`scripts/test-minpentai-ladder.ts`), plays every rung against every other over seeded matches in both seats and checks that each rung beats every rung below it. One pair is left open: Builder (rung 3) and Opportunist (rung 4) are about even, so the test only checks that Opportunist isn't easier.

To print the same kind of table for any players, without asserting anything:

```sh
npm run minpentai:vs-rungs -- --round-robin
```

## The rules

These are Play's rules as `game.ts`, `controller.ts` and `play-server/match.ts` run them. The marks follow the rules page (draft 1). **From the book** gives the block it rests on: c4-b84 is chapter 4, block 84, and its words are in `docs/minpentai/passages.md`. **Invented** means this edition made it up. The same rules, machine-readable, are in https://snowmoon.party/minpentai/rules.json (`public/minpentai/rules.json`, generated from `src/lib/minpentai/kit-rules.ts` by `scripts/build-minpentai-kit.ts`): every rule marked from the book, with its block and words, or invented, with where it is in the code, and whether the site follows it. The page https://snowmoon.party/minpentai/build shows them with the passages. The rules page (https://snowmoon.party/minpentai/rules) and `docs/minpentai-rules.md` are the documents the marks below follow.

The board

- 15 × 10 squares. Invented.
- The board has edges and corners (from the book: c4-b113, c7-b81). A glider that would leave the board turns back on that side instead, and stays put for that step. Invented.
- Each side starts with 2 towers: Cyan at (1, 2) and (1, 7), Amber at (13, 2) and (13, 7), with six rocks; all mirrored, so both start even. Invented. Starting in your own corner is from the book (c4-b94).

The pieces

- Tower: your score, your sight, and where you may place. From the book, where they are "symbols" (c4-b93); the tower shape is invented.
- Glider: moves one square a step in a straight line, up, down, left or right (diagonally too only under the "diag" rule), and never stops on its own. Gliders are from the book (c4-b84); their speed is invented.
- Square: blocks a glider. The first hit cracks it and turns the glider straight back; the second breaks the square and the glider. Any glider cracks any square, its own side's too. From the book: walls that reflect gliders (c2-b12), and walls that can be destroyed (c4-b9). Two hits is invented.
- Rock: fixed; turns every glider straight back, and never breaks. Rocks are from the book (c4-b108); bouncing only is invented (in the book, gliders hitting rocks can make more gliders, c4-b108).

One step (all invented)

- Every glider moves at the same moment.
- Two gliders of different sides break each other if they head for the same square, swap squares, or cross. A side's own gliders pass through each other.
- A glider reaching an opponent's tower destroys it and breaks. Your own tower turns it straight back (in the book a stray glider can wreck its own side, c4-b109; that is left out here).
- Broken pieces leave nothing behind (the book's boards fill with debris, c4-b140).

Turns to act

- A setup turn at step 0, then a turn every 12 steps; between turns the match runs on its own. Turns to act are from the book (c4-b110, c14-b45); 12 is invented.
- 8 points a turn: glider 4, square 1, tower 4. Unspent points are lost. Invented.
- You may place on any empty square within 3 squares, counting diagonals, of a tower you had when the turn began. A tower placed this turn lights more squares only from the next turn. Placing near your symbols is from the book (c4-b110); the distance is invented.
- Both sides place at the same time without seeing each other's choices; everything appears at once when the run starts. Two pieces placed on one square cancel each other. Invented.
- Time to act: no limit against the computer; in one-on-one, 90 seconds for setup and 45 for later turns, and what you placed stands when time runs out. A time limit is from the book (c12-b149); the seconds are invented.

Sight

- You see every square within 3 of one of your towers; the rest is dark. From the book: "would allow him to see everything within thirty squares" (c4-b93). 3 is invented.
- Rocks are shown everywhere. An opponent's tower you cannot see is drawn where you last saw it, marked with the step; it may be gone. Invented.
- Players never see the whole board during a match; when it ends, the result and "watch it again" show all of it. In the book, too, the players cannot see everything and the audience can (c14-b51).

How a match ends

- A side with no towers left loses; both at the same step is a draw. From the book: a player whose symbols are gone is out (c4-b136–b138).
- At step 96 the match stops: most towers wins, equal is a draw. Invented.
- You may resign in practice, the ladder and one-on-one; it counts as a loss. From the book (c4-b141, c10-b164). The computer players never resign.
- One-on-one: a player not heard from for 15 seconds pauses the match; 60 seconds more counts as resigning (during setup, the match is cancelled with no result). Invented.

The match's new rule

- In the book, "every game there's always some kind of new rule" (c4-b84). In Play, one of four is drawn at random at the start of every practice, ladder and one-on-one match, and both players see it when the match starts. The four are invented: "Gliders may also fly diagonally." "Gliders cost 3 points." "You see only 2 squares around your towers." "Turns to act come every 8 steps."

The computer players

- The ladder has five rungs, in `RUNGS` and `botPlan` in `game.ts`: Rival, Blocker, Builder, Opportunist, Planner. Their behaviours are invented. The book has bots too: "the bots play better than me on stock Minpentai, but they are much worse at adapting to any new situation they don't have training data for" (c7-b14).

## The book's passages

All 152 are in `docs/minpentai/passages.md` (https://snowmoon.party/minpentai/passages.md), word for word, with their block ids, in chapter order: every block that names Minpentai, plus every block that `docs/minpentai-rules.md` or Learn's words cite. **Spoilers**: the file has a spoiler heading before chapter 15; everything after it is from chapters 15–31. `npx tsx scripts/build-minpentai-passages.ts` writes it from the book; `npm run test:minpentai-agents` fails if it is out of date.

## Writing a computer player

A player is a function: what it can see in, one turn's placements out. The types are in `src/lib/minpentai/play-game/players.ts` and `src/lib/minpentai/play-game/game.ts`.

```ts
type Player = (view: PlayerView) => Placement[];

interface PlayerView {
  w: World;            // the board as you see it (a copy)
  R: number;           // sight and placing distance: 3, or 2 under "sight2"
  cost: number;        // a glider's cost: 4, or 3 under "cost3"; square 1, tower 4
  every: number;       // steps between turns: 12, or 8 under "every8"
  rule: RuleId;        // 'diag' | 'cost3' | 'sight2' | 'every8'
  points: number;      // 8 a turn
  mine: number[];      // your towers when this turn began: place within R of these
  lastSeen: Record<number, number>; // square → step you last saw an opponent tower there
  rng: () => number;   // your own seeded random numbers
}

interface Placement { t: 'g' | 's' | 't'; o: 'C' | 'A'; x: number; y: number; dx: number; dy: number }
```

- You always play Amber (`'A'`); the opponent is Cyan (`'C'`). In Cyan's seat the board is turned 180° and the colours swapped before you see it, and your placements are turned back, so your code never needs to know which seat it is in.
- A square is a number: `K(x, y) = y * 15 + x`, and `XY(k)` turns it back (both in `game.ts`). x runs 0–14, y runs 0–9.
- What you see (`fogView`): every rock; your own towers and squares; and every piece, either side's, on a square within R of one of your towers. Nothing else: not what the opponent places this turn, not the seed. The five rungs plan from exactly this view (the test checks that they plan the same on it as on the whole board). It is slightly more than the page draws for a person, which shows your own squares in the dark as dark.
- What you return: gliders with `dx, dy` in -1, 0, 1 (straight only, unless the rule is "diag"); squares and towers with `dx = dy = 0`. Each on an empty square within R of `mine`, one piece a square, at most 8 points in all. They are checked by the one-on-one server's own check (`checkPlacements` in `play-server/match.ts`). A refused turn, or a player that throws, counts as a loss.
- A match is seeded: the same players and seed always give the same match, if the players take their random numbers only from `rng` (the rungs do). The rule is drawn from the seed as the page and the server draw it, and the test plays ladder matches through the page's own code (`controller.ts`) beside `playMatch` and compares them, turn by turn.

A minimal player, `scripts/minpentai-players/first-player.ts` (the test checks that this is the file, word for word, and that it plays every rung with no refused turn):

```ts
// A first computer player for Minpentai Play: a starting point to copy, not a strong player.
// Try it: npm run minpentai:vs-rungs -- scripts/minpentai-players/first-player.ts
import { K, XY, empty, lit, type Placement } from '../../src/lib/minpentai/play-game/game';
import type { Player } from '../../src/lib/minpentai/play-game/players';

const player: Player = (v) => {
  // Where I may place: empty squares within R of the towers I had when this turn began.
  const zone = [...lit(v.w, 'A', v.R, v.mine)].filter((k) => empty(v.w, k));
  const out: Placement[] = [];
  let points = v.points;
  // One glider flying left (towards Cyan's side), on the row of a tower I last saw if I can.
  const rows = Object.keys(v.lastSeen).map((k) => XY(+k)[1]);
  const shot = zone.find((k) => rows.includes(XY(k)[1])) ?? zone[0];
  if (shot !== undefined && points >= v.cost) {
    const [x, y] = XY(shot);
    out.push({ t: 'g', o: 'A', x, y, dx: -1, dy: 0 });
    points -= v.cost;
  }
  // The rest on squares (1 point each) just left of my towers, as a wall.
  for (const t of v.mine) {
    const [x, y] = XY(t);
    for (const k of [K(x - 1, y - 1), K(x - 1, y), K(x - 1, y + 1)]) {
      if (points < 1 || x < 1 || !zone.includes(k) || out.some((p) => K(p.x, p.y) === k)) continue;
      const [sx, sy] = XY(k);
      out.push({ t: 's', o: 'A', x: sx, y: sy, dx: 0, dy: 0 });
      points -= 1;
    }
  }
  return out;
};
export default player;
```

Test a player against the five rungs:

```sh
npm run minpentai:vs-rungs -- scripts/minpentai-players/first-player.ts          # 20 matches a seat against each rung
npm run minpentai:vs-rungs -- scripts/minpentai-players/first-player.ts --n 100  # more seeds
npm run minpentai:vs-rungs -- rung:5                                             # a rung as the player
```

It prints wins, draws and losses against each rung (seeds 1–N with you as Amber, 10001 onward as Cyan) and lists any refused turn. A player that takes its random numbers only from `rng` gets the same table every run. A rung is also a player: `rung(n)` in `players.ts`, so your player can call one.

Playing your player on the site is not built: the ladder is the five rungs in `botPlan`, and `controller.ts` stops at rung 5.

## Ideas to build, easiest first

These are ideas, not features. None of them is built.

1. **Idea: a stronger player.** Write one, run it against the five, and send it with its table. Nothing on the site changes.
2. **Idea: a new drawn rule.** Add it to `RULES` in `game.ts` and wherever it changes a number: `mk` in `controller.ts`, `createMatch` in `play-server/match.ts` and `playMatch` in `players.ts`; then the rules page.
3. **Idea: a computer player that plays either colour.** `botPlan` always plays Amber; `players.ts` turns the board for Cyan.
4. **Idea: a replay file.** A match as one JSON file (seed, rule, every turn's placements) that plays back on the page. `playMatch` already returns the placements.
5. **Idea: Learn on Play's rules.** Bring the lessons from v3 to Play's rules, using section 11 of the rules page.
6. **Idea: the book's own game.** The cell rule recovered from c4-b5 (`engine.ts`) or the hex rule the book describes (c12-b169, c12-b170; tested in `docs/minpentai-rules.md`, section 3.2) as a game you can play. Older match code on the cell rule (`src/lib/minpentai/match.ts`, `src/lib/minpentai/ai.ts`) is kept in the repository, out of the menus.
7. **Idea: bigger matches.** Larger boards or four players; section 10 of the rules page has placeholders, none designed.

## How to contribute

1. **Check with your human before you open a pull request.** They should see what you will send, and agree to it under the license above.
2. Fork https://github.com/We-Are-Lum/snowmoon, make a branch, and open a pull request against `main`.

A good pull request:

- **Tests pass**: `npm run typecheck` and every Minpentai test above. Add a test for what you add: for a player, a check in `scripts/test-minpentai-players.ts` that it plays all five rungs, in both seats, with no refused turn.
- **The rules are updated** if you change one: this file's rules section, and the rules page (`docs/design/minpentai-rules.dc.html`, then `npx tsx scripts/build-minpentai-rules.ts`). Mark each new rule from the book (with its block) or invented.
- **Cites word for word**: anything said about the book gives its block id, and any quote is copied exactly from `docs/minpentai/passages.md` or `content/snowmoon/text/`. Never change the book's text.
- **Says who made it**: that an agent wrote it, and which model.
- Is small, and says in plain words what it changes and how you tested it.
