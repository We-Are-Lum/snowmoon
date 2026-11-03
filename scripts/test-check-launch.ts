/**
 * Tests check:launch's dry mode (--at=<ISO>): no network, the code's expectations at an instant.
 *   npm run test:check-launch
 * The window's edges from CHALLENGE.dates (opens included, closes excluded), the cap ($2 outside, $15 inside), sheets
 * opening to everyone only inside, the deadline line /challenge should serve, and the launch kit's dates. Also: a bad
 * --at is refused, --at with --url is refused, and with neither it refuses to run ("no target") before sending anything.
 * Drafted by Claude Code (Claude, a closed model by Anthropic), 2026-11-02.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { CHALLENGE, IMAGES } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const run = (...args: string[]) => spawnSync('npm', ['run', '-s', 'check:launch', '--', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
const ms = (iso: string) => Date.parse(iso);
const iso = (t: number) => new Date(t).toISOString();

let failed = 0, checks = 0;
const ok = (pass: boolean, what: string) => {
  checks++;
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}`);
};

const opens = ms(CHALLENGE.dates.opens), closes = ms(CHALLENGE.dates.closes);
// Admin-only (owner, 2026-11-04): while CHALLENGE.public is off, every instant expects everything off.
const off = !CHALLENGE.public;
const NOT_FOUND = /^not found \(admin-only/;
const cases: { at: string; phase: string; cap: number; sheets: boolean; line: RegExp }[] = [
  { at: '2026-11-02T12:00:00Z', phase: 'before', cap: IMAGES.dailySpendCapUsd, sheets: false, line: /^Entries open Friday 6 November, 09:00 Pacific\.$/ },
  { at: iso(opens - 1000), phase: 'before', cap: IMAGES.dailySpendCapUsd, sheets: false, line: /^Entries open / },
  { at: iso(opens), phase: 'open', cap: CHALLENGE.dailySpendCapUsd, sheets: true, line: /^Entries close Sunday 22 November, 23:59 Pacific\.$/ },
  { at: iso(opens + 60_000), phase: 'open', cap: CHALLENGE.dailySpendCapUsd, sheets: true, line: /^Entries close / },
  { at: iso(closes - 1000), phase: 'open', cap: CHALLENGE.dailySpendCapUsd, sheets: true, line: /^Entries close / },
  { at: iso(closes), phase: 'closed', cap: IMAGES.dailySpendCapUsd, sheets: false, line: /^Entries closed Sunday 22 November, 23:59 Pacific\.$/ },
];

for (const c0 of cases) {
  const c = off ? { ...c0, cap: IMAGES.dailySpendCapUsd, sheets: false, line: NOT_FOUND } : c0;
  const r = run(`--at=${c.at}`);
  const line = r.stdout.split('\n').find((l) => l.startsWith('expected '));
  let e: { public?: boolean; entriesTaken?: boolean; phase?: string; capUsd?: number; sheetsOpenToEveryone?: boolean; deadlineLine?: string; kitDatesMatch?: boolean; bounties?: string[] } = {};
  try {
    e = JSON.parse(line?.slice('expected '.length) ?? '{}');
  } catch {
    /* fails below */
  }
  ok(r.status === 0, `${c.at}: exit 0 (${r.status}${r.stderr ? `, ${r.stderr.slice(0, 120)}` : ''})`);
  ok(e.phase === c.phase, `${c.at}: phase ${e.phase} (want ${c.phase})`);
  ok(e.capUsd === c.cap, `${c.at}: cap $${e.capUsd} (want $${c.cap})`);
  ok(e.sheetsOpenToEveryone === c.sheets, `${c.at}: sheets open to everyone ${e.sheetsOpenToEveryone} (want ${c.sheets})`);
  ok(c.line.test(e.deadlineLine ?? ''), `${c.at}: /challenge line "${e.deadlineLine}"`);
  ok(e.public === CHALLENGE.public && e.entriesTaken === (!off && c.phase === 'open'), `${c.at}: public ${e.public}, entries taken ${e.entriesTaken}`);
  ok(e.kitDatesMatch === true, `${c.at}: the launch kit's dates match CHALLENGE.dates`);
  ok(JSON.stringify(e.bounties) === JSON.stringify(CHALLENGE.characters.filter((s) => CHALLENGE.bounties[s])), `${c.at}: bounties set ${JSON.stringify(e.bounties)}`);
}

// Refusals: each exits 1 quickly with its words, and sends nothing (no target is ever reached).
for (const [args, words] of [[['--at=tomorrow'], /needs an ISO instant/], [['--at=2026-11-06T17:00:00Z', '--url=https://snowmoon.party'], /leave out --url/], [[], /no target/], [['--url=snowmoon.party'], /no target/]] as const) {
  const t0 = Date.now();
  const r = run(...args);
  ok(r.status === 1 && words.test(r.stderr) && Date.now() - t0 < 30_000, `refused: ${args.join(' ') || '(no args)'} (exit ${r.status})`);
}

console.log(failed ? `check:launch dry mode: ${failed} of ${checks} failed` : `check:launch dry mode: ${checks} checks passed`);
process.exit(failed ? 1 : 0);
