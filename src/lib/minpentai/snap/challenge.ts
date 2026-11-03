/**
 * A challenge (owner, 2026-10-22): the end of a snap match shares its result with a link that starts
 * the same match for whoever opens it: the same seed, computer level, extra rule and version. In a
 * Farcaster cast the link plays in the feed (the snap); in a browser it opens Play at that start.
 *
 * Everything is in the link, nothing is stored and nothing ranks: practice only. The link is
 * signed (state.ts sign, on the server) so the result its preview shows is one the snap reached;
 * Play's client reads only the start from it and needs no key.
 *
 * Pure: shared by the snap (server) and Play (client).
 */
import { RULE_IDS, RULES, RUNGS, type RuleId, type Side } from '../play-game/game';
import { maxStepsOf, rulesetId, type RulesetId } from '../versions/solo-v1';

/** The computer players by level (game.ts botPlan): 0 Practice, then the ladder's five rungs. */
export const LEVELS = ['Practice', ...RUNGS.slice(1).map((r) => r!.n)];
export const RULE_SHORT: Record<RuleId, string> = { diag: 'diagonal gliders', cost3: 'gliders cost 3', sight2: 'sight 2', every8: 'turns every 8 steps' };

export interface Result {
  win: Side | 'D';
  resigned: boolean;
  step: number;
  /** Towers left: Cyan (the player), Amber (the computer). */
  c: number;
  a: number;
  taps: number;
}
/** rs: the ruleset (solo-v1.ts RULESETS). A link made before rulesets were numbered has 5 fields and is 1. */
export interface Challenge { seed: number; lvl: number; rule: RuleId; ver: string; res: Result; rs: RulesetId }

/** A result as one field, no dots: win (C, A or D), `r` if resigned, then step, towers, taps. */
export const RESULT_RE = /^[CAD]r?-\d{1,3}-\d{1,2}-\d{1,2}-\d{1,4}$/;
export const encResult = (r: Result) => `${r.win}${r.resigned ? 'r' : ''}-${r.step}-${r.c}-${r.a}-${r.taps}`;
export function decResult(t: string, rs: RulesetId = 1): Result | null {
  if (!RESULT_RE.test(t)) return null;
  const [w, step, c, a, taps] = t.split('-');
  const r = { win: w[0] as Side | 'D', resigned: w.length > 1, step: +step, c: +c, a: +a, taps: +taps };
  return r.step <= maxStepsOf(rs) && !(r.resigned && r.win !== 'A') ? r : null;
}

export const CHALLENGE_PATH = '/minpentai/c/';

/** The signed part of a challenge link: seed (base 36), level, rule, version (`_` for none), result, and the
 * ruleset when it isn't 1 (so every link made before rulesets were numbered reads exactly as it did). */
export const encChallenge = (c: Challenge) => [c.seed.toString(36), c.lvl, c.rule, c.ver || '_', encResult(c.res), ...(c.rs !== 1 ? [c.rs] : [])].join('.');

export function decChallenge(body: string): Challenge | null {
  const f = body.split('.');
  if (f.length !== 5 && !(f.length === 6 && f[5] === '2')) return null;
  const [seed, lvl, rule, ver, res] = f;
  const rs = rulesetId(f[5]);
  const r = decResult(res, rs);
  if (!/^[0-9a-z]{1,7}$/.test(seed) || !/^[0-5]$/.test(lvl) || !RULE_IDS.includes(rule as RuleId) || !/^(_|[a-z0-9-]{1,40})$/.test(ver) || !r) return null;
  const s = parseInt(seed, 36);
  return s <= 0xffff_ffff ? { seed: s, lvl: +lvl, rule: rule as RuleId, ver: ver === '_' ? '' : ver, res: r, rs } : null;
}

/** A link's last path segment, `<body>.<signature>`. The signature is checked on the server only. */
export function splitChallenge(segment: string): { body: string; sig: string } | null {
  const s = decodeURIComponent(segment), i = s.lastIndexOf('.');
  return i > 0 && /^[A-Za-z0-9_-]{22}$/.test(s.slice(i + 1)) ? { body: s.slice(0, i), sig: s.slice(i + 1) } : null;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "won at step 41 with 3 towers left", in the first person's words, no subject. */
export function outcome(r: Result): string {
  if (r.resigned) return `resigned at step ${r.step}`;
  if (r.win === 'C') return `won at step ${r.step} with ${plural(r.c, 'tower')} left`;
  if (r.win === 'D') return `drew at step ${r.step}`;
  return `lost at step ${r.step}`;
}

/** The words a share starts with; the player can change them in the composer before posting. */
export function challengeText(c: Challenge): string {
  return `Minpentai against ${LEVELS[c.lvl]}: I ${outcome(c.res)}, in ${plural(c.res.taps, 'tap')}. Same start, same extra rule (${RULE_SHORT[c.rule]}): can you beat it?`;
}

/** One line for a challenge's first page and its preview. */
export const challengeLine = (c: Challenge) => `Against ${LEVELS[c.lvl]}, extra rule: ${RULES[c.rule]}`;
