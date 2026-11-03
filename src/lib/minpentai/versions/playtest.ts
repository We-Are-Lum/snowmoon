/**
 * The playtest for a version (spike): 200 computer-against-computer matches, scored against the
 * "playable" thresholds (docs/proposals/minpentai-versions.md, part 3).
 *
 * 100 pairings, each played twice on one seed with the seats swapped, so side and level effects
 * separate cleanly. The pairings cycle through the 21 pairs of the six computer players (practice
 * and rungs 1–5, each against itself too). Every match is also replayed with both sides passing
 * after setup: when that gives the same decisive result, the first move decided it.
 */
import { playVersion, type MatchLog, type Side } from './engine';
import type { Version } from './schema';

export const LEVELS = [0, 1, 2, 3, 4, 5];
export const LEVEL_NAMES = ['Practice', 'Rival', 'Blocker', 'Builder', 'Opportunist', 'Planner'];
const PAIRS: [number, number][] = [];
for (const a of LEVELS) for (const b of LEVELS) if (a <= b) PAIRS.push([a, b]);

/** The thresholds a version must meet to be called playable. */
export const THRESHOLDS = {
  /** Cyan's score (wins + half the draws) must be within this of one half. */
  sideSkew: 0.1,
  /** At most this share of matches drawn. */
  draws: 0.6,
  /** The Planner's score against the Rival, head to head (both seats), at least this. */
  plannerOverRival: 0.6,
  /** Rungs 3–5's mean score minus practice's and rung 1's, at least this. */
  skillGap: 0.1,
  /** Median length at least this many turns to act after setup. */
  minTurns: 2,
  /** At most this share of matches decided by the setup turn alone. */
  setupDecides: 0.25,
};

export interface Report {
  matches: number;
  /** Every match reached a result, with no engine error and no illegal move. */
  allEnd: boolean;
  errors: string[];
  illegal: number;
  maxGliders: number;
  ms: number;
  side: { cyan: number; amber: number; draws: number; cyanScore: number };
  levels: { level: number; name: string; score: number; played: number }[];
  plannerOverRival: number;
  skillGap: number;
  length: { median: number; p10: number; p90: number; byTime: number; turnsMedian: number };
  /** Matches between equal players: the share whose result the setup turn alone already gives (both pass afterwards). */
  setupDecides: number;
  /** Matches between equal players: the side ahead at the first turn after setup went on to win, of those with a side ahead. */
  firstLeadHolds: number;
  mirror: number;
  mirrorDraws: number;
  /** Share of matches over before the first turn after setup. */
  overBeforeTurn2: number;
  drawn: Record<string, number>;
  checks: { id: keyof typeof THRESHOLDS | 'allEnd'; ok: boolean; value: number; need: string }[];
  playable: boolean;
  /** Every match's winner and end step, in order ("C96 D96 A41 ..."), to compare versions on the same seeds. */
  outcomes: string;
}

const pct = (n: number, d: number) => (d ? n / d : 0);

export function playtest(v: Pick<Version, 'set' | 'drawn' | 'rocksAt'>, opts: { pairings?: number; seed?: number } = {}): Report {
  const pairings = opts.pairings ?? 100, seed0 = opts.seed ?? 20261021;
  const t0 = Date.now();
  const errors: string[] = [];
  const logs: { c: number; a: number; m: MatchLog; pass: MatchLog | null }[] = [];
  for (let j = 0; j < pairings; j++) {
    const [p, q] = PAIRS[j % PAIRS.length], seed = seed0 + j;
    for (const [c, a] of [[p, q], [q, p]]) {
      try {
        const m = playVersion(v, c, a, seed);
        const pass = playVersion(v, c, a, seed, { pass: true });
        logs.push({ c, a, m, pass });
      } catch (e) {
        errors.push(`C${c} v A${a} seed ${seed}: ${(e as Error).message}`);
      }
    }
  }
  const n = logs.length;
  const score = (m: MatchLog, side: Side) => (m.win === side ? 1 : m.win === 'D' ? 0.5 : 0);
  const cyan = logs.filter((l) => l.m.win === 'C').length, amber = logs.filter((l) => l.m.win === 'A').length, draws = n - cyan - amber;
  const levels = LEVELS.map((lv) => {
    let sc = 0, played = 0;
    for (const l of logs) {
      if (l.c === l.a) continue;
      if (l.c === lv) { sc += score(l.m, 'C'); played++; }
      if (l.a === lv) { sc += score(l.m, 'A'); played++; }
    }
    return { level: lv, name: LEVEL_NAMES[lv], score: pct(sc, played), played };
  });
  let pr = 0, prn = 0;
  for (const l of logs) {
    if (l.c === 5 && l.a === 1) { pr += score(l.m, 'C'); prn++; }
    if (l.a === 5 && l.c === 1) { pr += score(l.m, 'A'); prn++; }
  }
  const plannerOverRival = pct(pr, prn);
  const skillGap = (levels[3].score + levels[4].score + levels[5].score) / 3 - (levels[0].score + levels[1].score) / 2;
  const steps = logs.map((l) => l.m.step).sort((a, b) => a - b);
  const q = (f: number) => steps[Math.min(steps.length - 1, Math.floor(f * steps.length))] ?? 0;
  const turnsMedian = (() => { const t = logs.map((l) => l.m.turns.length - 1).sort((a, b) => a - b); return t[Math.floor(t.length / 2)] ?? 0; })();
  const byTime = logs.filter((l) => l.m.how === 'time').length;
  // Only matches between equal players: otherwise "the stronger side won either way" would count.
  const mirror = logs.filter((l) => l.c === l.a);
  const setupDecides = pct(mirror.filter((l) => l.pass && l.m.win !== 'D' && l.pass.win === l.m.win).length, mirror.length);
  let led = 0, held = 0;
  for (const l of mirror) {
    const t = l.m.towersAt[1];
    if (!t || t.C === t.A) continue;
    led++;
    if (l.m.win === (t.C > t.A ? 'C' : 'A')) held++;
  }
  const overBeforeTurn2 = pct(logs.filter((l) => l.m.turns.length < 2).length, n);
  const mirrorDraws = pct(mirror.filter((l) => l.m.win === 'D').length, mirror.length);
  const drawn: Record<string, number> = {};
  for (const l of logs) { const k = [l.m.first, l.m.second].filter(Boolean).join(' then ') || 'none'; drawn[k] = (drawn[k] || 0) + 1; }
  const illegal = logs.reduce((t, l) => t + l.m.illegal, 0);
  const maxGliders = Math.max(0, ...logs.map((l) => l.m.maxGliders));
  const T = THRESHOLDS;
  const allEnd = errors.length === 0 && illegal === 0 && n === 2 * pairings;
  const cyanScore = pct(cyan + draws / 2, n);
  const checks: Report['checks'] = [
    { id: 'allEnd', ok: allEnd, value: n, need: `${2 * pairings} matches end, no errors, no illegal moves` },
    { id: 'sideSkew', ok: Math.abs(cyanScore - 0.5) <= T.sideSkew, value: cyanScore, need: `Cyan's score within ${T.sideSkew} of 0.5` },
    { id: 'draws', ok: pct(draws, n) <= T.draws, value: pct(draws, n), need: `draws at most ${T.draws}` },
    { id: 'plannerOverRival', ok: plannerOverRival >= T.plannerOverRival, value: plannerOverRival, need: `Planner beats Rival at least ${T.plannerOverRival}` },
    { id: 'skillGap', ok: skillGap >= T.skillGap, value: skillGap, need: `rungs 3-5 score at least ${T.skillGap} above practice and rung 1` },
    { id: 'minTurns', ok: turnsMedian >= T.minTurns, value: turnsMedian, need: `median match has at least ${T.minTurns} turns after setup` },
    { id: 'setupDecides', ok: setupDecides <= T.setupDecides, value: setupDecides, need: `setup alone decides at most ${T.setupDecides}` },
  ];
  return {
    matches: n, allEnd, errors, illegal, maxGliders, ms: Date.now() - t0,
    side: { cyan, amber, draws, cyanScore },
    levels, plannerOverRival, skillGap,
    length: { median: q(0.5), p10: q(0.1), p90: q(0.9), byTime: pct(byTime, n), turnsMedian },
    setupDecides, firstLeadHolds: pct(held, led), mirror: mirror.length, mirrorDraws, overBeforeTurn2, drawn,
    checks, playable: checks.every((c) => c.ok),
    outcomes: logs.map((l) => `${l.m.win}${l.m.step}`).join(' '),
  };
}

/** The report in a few plain lines. */
export function summary(r: Report): string {
  const p = (x: number) => `${Math.round(100 * x)}%`;
  return [
    `${r.playable ? 'PLAYABLE' : 'NOT PLAYABLE'} (${r.matches} matches, ${(r.ms / 1000).toFixed(1)} s)`,
    `sides: Cyan ${r.side.cyan}, Amber ${r.side.amber}, draws ${r.side.draws} (Cyan's score ${p(r.side.cyanScore)})`,
    `levels: ${r.levels.map((l) => `${l.name} ${p(l.score)}`).join(', ')}; Planner v Rival ${p(r.plannerOverRival)}; skill gap ${r.skillGap.toFixed(2)}`,
    `length: median step ${r.length.median} (${r.length.turnsMedian} turns after setup), 10-90% ${r.length.p10}-${r.length.p90}, ${p(r.length.byTime)} to the step limit`,
    `first move (${r.mirror} equal-player matches, ${p(r.mirrorDraws)} drawn): setup alone decides ${p(r.setupDecides)}; first lead holds ${p(r.firstLeadHolds)}; over before turn 2 ${p(r.overBeforeTurn2)}`,
    `max gliders ${r.maxGliders}; illegal ${r.illegal}${r.errors.length ? `; errors: ${r.errors.slice(0, 3).join(' | ')}` : ''}`,
    ...r.checks.filter((c) => !c.ok).map((c) => `  fails ${c.id}: ${typeof c.value === 'number' && c.value <= 1 && c.id !== 'minTurns' ? p(c.value) : c.value.toFixed?.(2) ?? c.value} (needs ${c.need})`),
  ].join('\n');
}
