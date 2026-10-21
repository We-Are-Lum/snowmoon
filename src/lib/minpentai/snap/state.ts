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
import type { Piece } from '../play-game/game';
import { decList, encList, type P } from './moves';

export type { P } from './moves';
export type Tool = Piece;
/** 'full': the whole 15 x 10 board. 'near': only what your towers light, at larger cells (off by default). */
export type BoardMode = 'full' | 'near';

export interface SnapState {
  fid: number;
  /** The engine seed, 0 to 2^32 - 1. */
  seed: number;
  /** The computer player's level: 0 is Practice. */
  lvl: number;
  /** A version id from versions.ts, or '' for the base game. */
  ver: string;
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
  board: BoardMode;
}

export function serialize(s: SnapState): string {
  return [
    s.fid, s.seed.toString(36), s.lvl, s.ver, s.tool, s.aim + 1, s.taps, s.resigned ? 1 : 0, s.turns.length,
    s.turns.map(encList).join('~'), encList(s.pend), s.board === 'near' ? 'n' : 'f',
  ].join('.');
}

export function parse(text: string): SnapState | null {
  const f = text.split('.');
  if (f.length !== 12) return null;
  const [fid, seed, lvl, ver, tool, aim, taps, res, nT, turnsText, pendText, board] = f;
  if (board !== 'n' && board !== 'f') return null;
  const num = (v: string) => (/^\d{1,10}$/.test(v) ? Number(v) : NaN);
  const st = {
    fid: num(fid), seed: /^[0-9a-z]{1,7}$/.test(seed) ? parseInt(seed, 36) : NaN, lvl: num(lvl), ver,
    tool: tool as Tool, aim: num(aim) - 1, taps: num(taps), resigned: res === '1',
  };
  if (![st.fid, st.seed, st.lvl, st.aim, st.taps].every(Number.isFinite) || st.seed > 0xffff_ffff) return null;
  if (!/^[a-z0-9-]{0,40}$/.test(ver) || !['g', 's', 't'].includes(tool) || !/^[01]$/.test(res)) return null;
  const n = num(nT);
  const parts = turnsText === '' ? [] : turnsText.split('~');
  // One empty turn and no turns both serialize as '': the count tells them apart.
  const lists = n === 0 ? [] : n === 1 && parts.length === 0 ? [''] : parts;
  if (lists.length !== n) return null;
  const turns = lists.map(decList);
  const pend = decList(pendText);
  if (turns.some((t) => !t) || !pend) return null;
  return { ...st, turns: turns as P[][], pend, board: board === 'n' ? 'near' : 'full' };
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
  return [s.seed.toString(36), s.lvl, s.ver, upTo, s.turns.slice(0, upTo).map(encList).join('~'), s.resigned ? 1 : 0].join('.');
}
export function parseRunToken(text: string): { seed: number; lvl: number; ver: string; turns: P[][]; resigned: boolean } | null {
  const f = text.split('.');
  if (f.length !== 6) return null;
  const [seed, lvl, ver, nT, turnsText, res] = f;
  const s = parse(['0', seed, lvl, ver, 'g', '0', '0', res, nT, turnsText, '', 'f'].join('.'));
  return s && { seed: s.seed, lvl: s.lvl, ver: s.ver, turns: s.turns, resigned: s.resigned };
}
