/**
 * The inventory's evidence (spike): Play today with one setting or rule piece changed at a time,
 * each through the full playtest (200 computer-against-computer matches). Play's four drawn rules
 * stay in. Writes docs/proposals/data/minpentai-versions-sweep.json.
 *
 *   npx tsx scripts/minpentai-versions-sweep.ts              (all cases, 7 at a time)
 *   npx tsx scripts/minpentai-versions-sweep.ts --one '{"set":{"sight":6}}'
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { playtest } from '../src/lib/minpentai/versions/playtest';
import { PIECES, PIECE_IDS, type Patch } from '../src/lib/minpentai/versions/schema';

const ROOT = path.resolve(import.meta.dirname, '..');
const one = process.argv.indexOf('--one');
if (one > 0) {
  const v = JSON.parse(process.argv[one + 1]);
  const r = playtest(v);
  process.stdout.write(JSON.stringify({ ...r, errors: r.errors.slice(0, 5) }));
  process.exit(0);
}

const VALUES: Record<string, number[]> = {
  width: [9, 12, 19, 25], height: [6, 8, 13, 16], maxSteps: [24, 48, 160, 240],
  points: [2, 4, 12, 24], setupPoints: [2, 4, 16, 32],
  costGlider: [1, 2, 6, 12], costSquare: [2, 3, 6], costTower: [1, 2, 8, 16],
  sight: [1, 2, 6, 30], reach: [1, 2, 6, 30], every: [4, 8, 20, 32], squareHits: [1, 3, 4],
  directions: [8], startTowers: [1, 3, 4], maxTowers: [2, 3, 6], carryOver: [4, 16],
};
const cases: { id: string; set: Patch }[] = [{ id: 'play', set: {} }];
for (const [k, vals] of Object.entries(VALUES)) for (const v of vals) cases.push({ id: `${k}=${v}`, set: { [k]: v } });
for (const p of PIECE_IDS) for (const o of Object.keys(PIECES[p].options)) if (o !== PIECES[p].base) cases.push({ id: `${p}=${o}`, set: { [p]: o } });
for (const h of [1, 6]) cases.push({ id: `rocks=breakable,rockHits=${h}`, set: { rocks: 'breakable', rockHits: h } });
for (const at of [24, 48]) cases.push({ id: `switchAt=${at}`, set: { switchAt: at } });

const results: Record<string, unknown> = {};
let next = 0, done = 0;
const t0 = Date.now();
await new Promise<void>((resolve) => {
  const launch = () => {
    if (next >= cases.length) { if (done === cases.length) resolve(); return; }
    const c = cases[next++];
    const ch = spawn('npx', ['tsx', path.join(ROOT, 'scripts/minpentai-versions-sweep.ts'), '--one', JSON.stringify({ set: c.set })], { cwd: ROOT });
    let out = '';
    ch.stdout.on('data', (d) => (out += d));
    ch.stderr.on('data', (d) => process.stderr.write(d));
    ch.on('close', () => {
      try { results[c.id] = { set: c.set, ...JSON.parse(out) }; } catch { results[c.id] = { set: c.set, crashed: true }; }
      const r = results[c.id] as { playable?: boolean; checks?: { id: string; ok: boolean }[] };
      done++;
      console.log(`${String(done).padStart(3)}/${cases.length} ${c.id.padEnd(32)} ${r.playable ? 'playable' : 'fails ' + (r.checks?.filter((x) => !x.ok).map((x) => x.id).join(', ') ?? 'CRASHED')}`);
      launch();
    });
  };
  for (let i = 0; i < 7; i++) launch();
});
// How often a change alters a computer match at all (same seeds, same pairings as Play today).
const base = ((results.play as { outcomes?: string }).outcomes ?? '').split(' ');
for (const r of Object.values(results) as { outcomes?: string; changedFromPlay?: number }[]) {
  const o = (r.outcomes ?? '').split(' ');
  r.changedFromPlay = o.filter((x, i) => x !== base[i]).length / Math.max(1, o.length);
}
mkdirSync(path.join(ROOT, 'docs/proposals/data'), { recursive: true });
writeFileSync(path.join(ROOT, 'docs/proposals/data/minpentai-versions-sweep.json'), JSON.stringify({ date: '2026-10-21', note: 'One change to Play today at a time; 200 matches each (scripts/minpentai-versions-sweep.ts).', results }, null, 1) + '\n');
console.log(`${Math.round((Date.now() - t0) / 1000)} s`);
