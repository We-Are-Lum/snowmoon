/**
 * A snap match lives in its URLs (spike, 2026-10-21): every button's target carries the whole
 * match, signed. The match is its seed, the computer player's level,
 * the version, and the person's placements; everything else is replayed from them with the site's
 * engine (match.ts). A match is bound to the Farcaster ID that started it: a POST signed by anyone
 * else starts that person a new match. Besides the links, the server keeps only each FID's latest
 * match (seed and finished turns, resume.ts), so a dropped page can be resumed.
 *
 * Practice only: nothing here is recorded anywhere. Recording happens in the mini app.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { RULE_IDS, type Piece, type RuleId } from '../play-game/game';
import { rulesetId, type RulesetId } from '../versions/solo-v1';
import { RESULT_RE } from './challenge';
import { decList, encList, type P } from './moves';

export type { P } from './moves';
export type Tool = Piece;

export interface SnapState {
  fid: number;
  /** The engine seed, 0 to 2^32 - 1. */
  seed: number;
  /** The computer player's level: 0 is Practice. */
  lvl: number;
  /** A version id from versions.ts, or '' for the base game. */
  ver: string;
  /** The extra rule the player picked (the first page, or a challenge link), or '' for the drawn one. */
  rule: RuleId | '';
  /** A challenge's result (challenge.ts encResult) when this match was started from one, else ''. */
  ch: string;
  /** The person's placements, one list per finished turn to act. */
  turns: P[][];
  /** This turn's placements so far. */
  pend: P[];
  /** The index in pend of the glider showing aim arrows, or -1. */
  aim: number;
  tool: Tool;
  /** Taps that reached the server this match, plus piece switches seen in the inputs. */
  taps: number;
  /** Resigned at the current turn to act. */
  resigned: boolean;
  /** The ruleset (solo-v1.ts RULESETS). Written only when it isn't 1, so a token made before rulesets were
   * numbered reads as 1 and every 1 token is unchanged. */
  rs: RulesetId;
}

export function serialize(s: SnapState): string {
  return [
    s.fid, s.seed.toString(36), s.lvl, s.ver, s.rule, s.ch, s.tool, s.aim + 1, s.taps, s.resigned ? 1 : 0, s.turns.length,
    s.turns.map(encList).join('~'), encList(s.pend), ...(s.rs !== 1 ? [s.rs] : []),
  ].join('.');
}

export function parse(text: string): SnapState | null {
  const f = text.split('.');
  if (f.length !== 13 && !(f.length === 14 && f[13] === '2')) return null;
  const [fid, seed, lvl, ver, rule, ch, tool, aim, taps, res, nT, turnsText, pendText] = f;
  const rs = rulesetId(f[13]);
  const num = (v: string) => (/^\d{1,10}$/.test(v) ? Number(v) : NaN);
  const st = {
    fid: num(fid), seed: /^[0-9a-z]{1,7}$/.test(seed) ? parseInt(seed, 36) : NaN, lvl: num(lvl), ver, rule: rule as RuleId | '', ch,
    tool: tool as Tool, aim: num(aim) - 1, taps: num(taps), resigned: res === '1',
  };
  if (![st.fid, st.seed, st.lvl, st.aim, st.taps].every(Number.isFinite) || st.seed > 0xffff_ffff || st.lvl > 5) return null;
  if ((rule && !RULE_IDS.includes(rule as RuleId)) || (ch && !RESULT_RE.test(ch))) return null;
  if (!/^[a-z0-9-]{0,40}$/.test(ver) || !['g', 's', 't'].includes(tool) || !/^[01]$/.test(res)) return null;
  const n = num(nT);
  const parts = turnsText === '' ? [] : turnsText.split('~');
  // One empty turn and no turns both serialize as '': the count tells them apart.
  const lists = n === 0 ? [] : n === 1 && parts.length === 0 ? [''] : parts;
  if (lists.length !== n) return null;
  const turns = lists.map(decList);
  const pend = decList(pendText);
  if (turns.some((t) => !t) || !pend) return null;
  return { ...st, turns: turns as P[][], pend, rs };
}

let cachedKey: Buffer | null = null;
/** The signing key: MINPENTAI_SNAP_SECRET, or one derived from the database URL (a server-only
 * secret every deployment already has), or a fixed key in development. */
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const own = process.env.MINPENTAI_SNAP_SECRET, db = process.env.STUDIO_DATABASE_URL;
  if (own) cachedKey = createHash('sha256').update(own).digest();
  else if (db) cachedKey = createHash('sha256').update('minpentai-snap-state/1\0' + db).digest();
  else if (process.env.NODE_ENV !== 'production') cachedKey = createHash('sha256').update('minpentai-snap-dev').digest();
  else throw new Error('No key to sign snap matches with');
  return cachedKey;
}

export function sign(text: string): string {
  return createHmac('sha256', key()).update(text).digest('base64url').slice(0, 22);
}
export function verified(text: string | null, sig: string | null): boolean {
  if (!text || !sig) return false;
  const a = Buffer.from(sign(text)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The finished part of a match, for its run pictures: no FID, no pending pieces, so the same run
 * has one address whoever asks. `upTo` turns, the last of which led to the run shown. */
export function runToken(s: SnapState, upTo: number): string {
  return [s.seed.toString(36), s.lvl, s.ver, s.rule, upTo, s.turns.slice(0, upTo).map(encList).join('~'), s.resigned ? 1 : 0, ...(s.rs !== 1 ? [s.rs] : [])].join('.');
}
export function parseRunToken(text: string): { seed: number; lvl: number; ver: string; rule: RuleId | ''; turns: P[][]; resigned: boolean; rs: RulesetId } | null {
  const f = text.split('.');
  if (f.length !== 7 && !(f.length === 8 && f[7] === '2')) return null;
  const [seed, lvl, ver, rule, nT, turnsText, res] = f;
  const s = parse(['0', seed, lvl, ver, rule, '', 'g', '0', '0', res, nT, turnsText, ''].join('.'));
  return s && { seed: s.seed, lvl: s.lvl, ver: s.ver, rule: s.rule, turns: s.turns, resigned: s.resigned, rs: rulesetId(f[7]) };
}
