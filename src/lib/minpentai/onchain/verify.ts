/**
 * Onchain Minpentai v1 (spike): verify recorded matches. For each MatchRecorded event: is its
 * ruleset registered, and do we have the engine it pins; does the match decode (canonical form
 * only); is it the player's own nth seed; does it replay legally under that engine; and do the
 * claimed result, end kind, end step and final position equal the replay's.
 *
 * The engine for a ruleset is the one its manifest pins: replay.ts's import closure at the pinned
 * commit. If the working tree's closure hashes match the manifest, it is used directly; otherwise
 * the closure is read from git at that commit into a scratch folder and loaded from there, so a
 * match recorded under an old ruleset is always replayed by the old engine.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Address, Hex } from 'viem';
import { decode, positionOf, type EncodedMatch } from './encoding';
import { REPLAY_ENTRY, closureHash, importClosure, rulesetId, type SoloManifestV1 } from './ruleset';
import { deriveSeed } from './seed';

export type Verdict =
  | { status: 'verified'; claim: EncodedMatch['claim']; endStep: number }
  | { status: 'invalid'; code: InvalidCode; reason: string }
  | { status: 'unknown-ruleset'; code: 'unregistered' | 'no-engine'; reason: string };
export type InvalidCode = 'malformed' | 'header-mismatch' | 'wrong-seed' | 'illegal' | 'claim-mismatch' | 'end-kind-mismatch' | 'end-step-mismatch' | 'position-mismatch';

export interface RecordedMatch {
  chainId: bigint;
  matchLog: Address;
  player: Address;
  /** The event's indexed ruleset ID and n (checked against the bytes). */
  rulesetId: Hex;
  n: bigint;
  data: Hex;
}

/** What a replay engine module exports (replay.ts at some commit). */
interface Engine {
  replaySolo: typeof import('./replay').replaySolo;
  engineSeed: typeof import('./replay').engineSeed;
  ReplayError: typeof import('./replay').ReplayError;
}
export interface LoadedRuleset { id: Hex; manifest: SoloManifestV1; engine: Engine; from: 'working tree' | `git ${string}` }

/**
 * Load a manifest's engine: the working tree's replay.ts if its closure matches the manifest
 * exactly; else the closure read from git at the pinned commit (`fromGit` forces this).
 */
export async function loadRuleset(manifest: SoloManifestV1, opts: { repo?: string; fromGit?: boolean } = {}): Promise<LoadedRuleset> {
  const repo = opts.repo ?? process.cwd();
  const id = rulesetId(manifest) as Hex;
  const lock = JSON.parse(readFileSync(path.join(repo, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string }> };
  const here = importClosure(REPLAY_ENTRY, (p) => (existsSync(path.join(repo, p)) ? readFileSync(path.join(repo, p), 'utf8') : null));
  const herePk = Object.fromEntries(here.packages.map((n) => [n, lock.packages[`node_modules/${n}`]?.version ?? '?']));
  if (!opts.fromGit && closureHash(here.files, herePk) === manifest.engine.closureHash) {
    return { id, manifest, engine: (await import('./replay')) as Engine, from: 'working tree' };
  }
  const commit = manifest.engine.commit;
  const at = (p: string) => { try { return execFileSync('git', ['-C', repo, 'show', `${commit}:${p}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  const c = importClosure(REPLAY_ENTRY, at);
  if (closureHash(c.files, manifest.engine.packages) !== manifest.engine.closureHash) throw new Error(`the closure at ${commit} does not hash to the manifest's closureHash`);
  if (c.packages.some((n) => manifest.engine.packages[n] !== herePk[n] && lock.packages[`node_modules/${n}`]?.version !== manifest.engine.packages[n])) {
    throw new Error(`the engine at ${commit} needs package versions not installed here`);
  }
  const dir = path.join(tmpdir(), 'minpentai-engines', commit);
  for (const [f, text] of Object.entries(c.files)) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), text); }
  const engine = (await import(path.join(dir, REPLAY_ENTRY))) as Engine;
  return { id, manifest, engine, from: `git ${commit}` };
}

const claimOf = (w: 'C' | 'A' | 'D') => (w === 'C' ? 'win' : w === 'A' ? 'loss' : 'draw');
const bad = (code: InvalidCode, reason: string): Verdict => ({ status: 'invalid', code, reason });

/** Verify one recorded match. `registered` answers whether the registry has the ruleset ID. */
export function verifyMatch(rec: RecordedMatch, registered: (id: Hex) => boolean, rulesets: Map<Hex, LoadedRuleset>): Verdict {
  if (!registered(rec.rulesetId)) return { status: 'unknown-ruleset', code: 'unregistered', reason: `ruleset ${rec.rulesetId} is not in the registry` };
  const rs = rulesets.get(rec.rulesetId);
  if (!rs) return { status: 'unknown-ruleset', code: 'no-engine', reason: `ruleset ${rec.rulesetId} is registered, but no manifest or engine for it is available here` };
  let m: EncodedMatch;
  try { m = decode(Uint8Array.from(Buffer.from(rec.data.slice(2), 'hex'))); } catch (e) { return bad('malformed', (e as Error).message); }
  if (m.rulesetId !== rec.rulesetId || BigInt(m.n) !== rec.n) return bad('header-mismatch', `the bytes say ruleset ${m.rulesetId} n ${m.n}; the event says ${rec.rulesetId} n ${rec.n}`);
  if (m.seed !== deriveSeed(rec.chainId, rec.matchLog, rec.player, rec.n)) return bad('wrong-seed', `the seed is not ${rec.player}'s match ${rec.n} on this chain and log`);
  const { replaySolo, engineSeed, ReplayError } = rs.engine;
  let r: ReturnType<typeof replaySolo>;
  try {
    r = replaySolo({ seed: engineSeed(m.seed), level: m.opponent.level, turns: m.turns, end: m.end.kind === 'end' ? { kind: 'end' } : { kind: 'resign', step: m.end.step } });
  } catch (e) {
    if (!(e instanceof ReplayError)) throw e;
    const msg = (e as Error).message;
    // A played-out claim whose moves stop short, or a resign claimed after the match had ended, is a false end, not an illegal move.
    if (m.end.kind === 'resign' && /before the resign/.test(msg)) return bad('end-kind-mismatch', `claimed a resign at step ${m.end.step}, but ${msg}`);
    if (m.end.kind === 'resign' && /left over/.test(msg)) return bad('end-step-mismatch', `claimed a resign at step ${m.end.step}, but ${msg}`);
    return bad('illegal', msg);
  }
  if (m.end.kind === 'end' && r.step !== m.end.step) return bad('end-step-mismatch', `claimed it ended at step ${m.end.step}; the replay ended at step ${r.step}`);
  if (m.end.kind === 'resign' && r.step !== m.end.step) return bad('end-step-mismatch', `claimed a resign at step ${m.end.step}; the replay stopped at step ${r.step}`);
  if (claimOf(r.win) !== m.claim) return bad('claim-mismatch', `claimed a ${m.claim}; the replay is a ${claimOf(r.win)}`);
  const want = positionOf(r.board);
  if (JSON.stringify(want) !== JSON.stringify(m.position)) {
    const i = want.findIndex((p, j) => !m.position[j] || p[0] !== m.position[j][0] || p[1] !== m.position[j][1]);
    return bad('position-mismatch', `the claimed final position (${m.position.length} pieces) differs from the replay's (${want.length})${i >= 0 ? `, first at entry ${i}` : ''}`);
  }
  return { status: 'verified', claim: m.claim, endStep: m.end.step };
}

/** Every manifest in a folder (docs/minpentai/rulesets), loaded by ID. */
export async function loadRulesets(dir: string, opts: { repo?: string; fromGit?: boolean } = {}): Promise<Map<Hex, LoadedRuleset>> {
  const out = new Map<Hex, LoadedRuleset>();
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.endsWith('.canonical.json'))) {
    const rs = await loadRuleset(JSON.parse(readFileSync(path.join(dir, f), 'utf8')), opts);
    out.set(rs.id, rs);
  }
  return out;
}
