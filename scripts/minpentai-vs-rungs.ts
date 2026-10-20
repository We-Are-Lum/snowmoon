/**
 * Play a computer player against the five ladder rungs (Rival, Blocker, Builder, Opportunist,
 * Planner), with Play's own rules (src/lib/minpentai/play-game/players.ts). Seeded: the same player
 * gets the same results every run. Each rung is played N times in each seat (Amber and Cyan), each
 * match under the rule its seed draws.
 *
 *   npm run minpentai:vs-rungs -- <player.ts> [--n 20]
 *   npm run minpentai:vs-rungs -- rung:3              (a rung as the player)
 *   npm run minpentai:vs-rungs -- --round-robin [--n 20]
 *
 * The file's default export (or its export named `player`) is a Player: (view) => Placement[].
 * A refused turn (an illegal placement, or the player threw) counts as a loss and is printed.
 * Prints the table; it asserts nothing about strength. Exits 1 if any of the player's turns was refused.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RUNGS } from '../src/lib/minpentai/play-game/game';
import { rung, tally, type Player } from '../src/lib/minpentai/play-game/players';

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const N = Number(opt('--n') ?? 20);
if (!Number.isInteger(N) || N < 1) { console.error('--n takes a whole number of seeds a seat'); process.exit(2); }
const name = (l: number) => `${l} ${RUNGS[l]!.n}`;
const pct = (t: { win: number; draw: number; loss: number }) => Math.round((100 * (t.win + t.draw / 2)) / (t.win + t.draw + t.loss));

async function load(spec: string): Promise<{ label: string; player: Player }> {
  const m = /^rung:([0-5])$/.exec(spec);
  if (m) return { label: m[1] === '0' ? 'practice' : `rung ${name(+m[1])}`, player: rung(+m[1]) };
  const mod = (await import(pathToFileURL(path.resolve(spec)).href)) as { default?: unknown; player?: unknown };
  const p = (typeof mod.default === 'function' ? mod.default : mod.player) as Player | undefined;
  if (typeof p !== 'function') { console.error(`${spec}: export a Player as default, or as \`player\``); process.exit(2); }
  return { label: spec, player: p };
}

if (argv.includes('--round-robin')) {
  const levels = [1, 2, 3, 4, 5];
  console.log(`round robin: the row's score against the column (wins + half the draws), ${2 * N} matches a pair, both seats`);
  console.log(''.padEnd(16) + levels.map((l) => String(l).padStart(6)).join(''));
  // Each pair is played once (2N matches); the column's score is the rest of the row's.
  const S: Record<string, number> = {};
  for (const a of levels) for (const b of levels) if (a < b) { const x = pct(tally(rung(a), rung(b), N)); S[`${a},${b}`] = x; S[`${b},${a}`] = 100 - x; }
  for (const a of levels) console.log(name(a).padEnd(16) + levels.map((b) => (a === b ? '     —' : `${S[`${a},${b}`]}%`.padStart(6))).join(''));
  process.exit(0);
}

const spec = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--n'));
if (!spec) { console.error('usage: npm run minpentai:vs-rungs -- <player.ts> [--n 20]   (or rung:N, or --round-robin)'); process.exit(2); }
const { label, player } = await load(spec);
console.log(`${label} against the five rungs: ${N} matches as Amber and ${N} as Cyan each (seeds 1–${N} and ${10001}–${10000 + N})`);
let refused = 0;
for (let l = 1; l <= 5; l++) {
  const t = tally(player, rung(l), N);
  console.log(`${name(l).padEnd(14)} won ${String(t.win).padStart(3)}  drew ${String(t.draw).padStart(3)}  lost ${String(t.loss).padStart(3)}  score ${pct(t)}%`);
  for (const r of t.refused.slice(0, 3)) console.log(`  refused: ${r}`);
  if (t.refused.length > 3) console.log(`  … and ${t.refused.length - 3} more refused`);
  refused += t.refused.length;
}
if (refused) { console.error(`${refused} turn(s) refused: each counted as a loss`); process.exit(1); }
