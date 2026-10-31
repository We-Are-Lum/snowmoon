/**
 * A version as a ruleset manifest (spike), the same shape as the onchain branch's solo-v1.json
 * (format snowmoon.minpentai.ruleset/1), so its ID is the keccak256 of its sorted JSON and
 * MatchLog.start(rulesetId, level) takes it with no contract change.
 *
 * What differs from solo-v1: the engine entry is versions/replay.ts (replayVersion), the board,
 * settings and rules come from the version, and the version itself rides along whole under
 * "version" (with its author, parent and prompt), so the manifest alone replays any match.
 *
 * stableJson() repeats the onchain branch's (ruleset.ts: keys sorted, no whitespace, non-negative
 * safe integers and printable ASCII only); on merge, use that one.
 */
import { keccak256, toBytes } from 'viem';
import { drawRules, layout } from './engine';
import { BASE, BASE_DRAWN, PIECES, SETTINGS, type PieceId, type SettingId, type Settings, type Version } from './schema';

export function stableJson(v: unknown): string {
  if (typeof v === 'number' && !(Number.isSafeInteger(v) && v >= 0)) throw new Error(`ruleset JSON: ${v} is not a non-negative safe integer`);
  if (typeof v === 'string' && !/^[\x20-\x7e]*$/.test(v)) throw new Error(`ruleset JSON: a non-ASCII string ${JSON.stringify(v)}`);
  if (v === undefined || typeof v === 'function' || typeof v === 'bigint' || typeof v === 'symbol') throw new Error(`ruleset JSON: a ${typeof v}`);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
}
export const rulesetId = (manifest: unknown) => keccak256(toBytes(stableJson(manifest)));
const hashText = (text: string) => keccak256(toBytes(text));

export const REPLAY_ENTRY = 'src/lib/minpentai/versions/replay.ts';

interface Rule { id: string; text: string; book?: { says: string; blocks: string[]; basis: 'stated' }; edition?: string }

/** One rule line per setting or piece, its source from the version's own change when it made one. */
function rules(v: Version, s: Settings): Rule[] {
  const changed = new Map(v.changes.map((c) => [c.what, c]));
  const from = (id: string, text: string, spec: { book?: { says: string; blocks: string[] }; edition: string }): Rule => {
    const c = changed.get(id);
    if (c) return c.basis === 'book' ? { id, text, book: { says: c.says!, blocks: c.blocks!, basis: 'stated' }, edition: `Changed in this version by ${v.author}.` } : { id, text, edition: `Invented for this version by ${v.author}.` };
    return { id, text, ...(spec.book ? { book: { ...spec.book, basis: 'stated' as const } } : {}), edition: spec.edition };
  };
  const out: Rule[] = [];
  for (const k of Object.keys(SETTINGS) as SettingId[]) {
    if (k === 'rockHits' && s.rocks !== 'breakable') continue;
    if (k === 'switchAt' && !s.switchAt) continue;
    out.push(from(k, `${SETTINGS[k].text}: ${s[k]}.`, SETTINGS[k]));
  }
  for (const p of Object.keys(PIECES) as PieceId[]) {
    const opt = (PIECES[p].options as Record<string, { text: string; book?: { says: string; blocks: string[] }; edition: string }>)[s[p]];
    out.push(from(p, `${PIECES[p].text}: ${opt.text}`, opt));
  }
  return out;
}

export interface Pin { commit: string; files: Record<string, string> }

export function versionManifest(v: Version, pin: Pin) {
  if (!/^[0-9a-f]{40}$/.test(pin.commit)) throw new Error(`pin a full 40-character commit, not ${pin.commit}`);
  const s0: Settings = { ...BASE, ...v.set };
  const L = layout(v, drawRules(v, () => 0).s1);
  const xy = (k: number) => [k % L.W, Math.floor(k / L.W)];
  const files = Object.fromEntries(Object.entries(pin.files).map(([f, t]) => [f, hashText(t)]));
  const closure = keccak256(toBytes(stableJson({ files, packages: {} })));
  return {
    format: 'snowmoon.minpentai.ruleset/1',
    name: `Minpentai version: ${v.title}`,
    edition: "snowmoon.party: an independent edition of Vitalik Buterin's Snowmoon, not affiliated with or endorsed by the author. A player-made version; rules marked invented were made up for it or for this edition.",
    license: 'GPL-3.0-only',
    engine: { repository: 'https://github.com/We-Are-Lum/snowmoon', commit: pin.commit, entry: REPLAY_ENTRY, replay: 'replayVersion', files, packages: {}, closureHash: closure },
    board: { width: L.W, height: L.H, maxSteps: s0.maxSteps, rocks: L.rocks.map(xy), towers: { C: L.towers.C.map(xy), A: L.towers.A.map(xy) } },
    settings: s0,
    rules: rules(v, s0),
    drawnRules: (v.drawn ?? BASE_DRAWN).map((d) => ({ id: d.id, text: d.text, set: d.set, ...(d.book ? { book: { ...d.book, basis: 'stated' } } : { edition: 'The whole rule.' }) })),
    version: v,
    computerPlayers: ['Practice', 'Rival', 'Blocker', 'Builder', 'Opportunist', 'Planner'].map((name, level) => ({
      level, name, code: { file: 'src/lib/minpentai/versions/engine.ts', function: 'botPlan', level },
      codeHash: keccak256(toBytes(`${closure}:level:${level}`)),
    })),
    sides: { person: 'C', computer: 'A' },
  };
}
