/**
 * Onchain Minpentai v1 (spike): verify recorded matches. For each MatchRecorded event: is its
 * ruleset registered, and do we have the engine it pins; does the match decode (canonical form
 * only); is it the player's own nth seed; does it replay legally under that engine; and do the
 * claimed result, end kind, end step and final position equal the replay's.
 *
 * The engine for a ruleset is the one its manifest pins: replay.ts's import closure at the pinned
 * commit. Its text is taken from the working tree if it hashes to the manifest, else from git at the
 * pinned commit; either way exactly that text is written to a fresh private folder, hashed again
 * there, and loaded from there (review findings 2 and 4, 2026-10-21: never hash one copy and run
 * another). So a match recorded under an old ruleset is always replayed by the old engine.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hexToBytes, keccak256, type Address, type Hex } from 'viem';
import { decode, positionOf, type EncodedMatch } from './encoding';
import { REPLAY_ENTRY, closureHash, hashText, importClosure, rulesetId, type SoloManifestV1 } from './ruleset';
import { deriveSeed } from './seed';

export type Verdict =
  | { status: 'verified'; claim: EncodedMatch['claim']; endStep: number }
  | { status: 'invalid'; code: InvalidCode; reason: string }
  | { status: 'unknown-ruleset'; code: 'unregistered' | 'no-engine'; reason: string }
  /** Commit before play: a started match that ended without a record ('closed': MatchForfeited on chain;
   *  'expired': still open on chain past its deadline, so it counts as a forfeit though nobody closed it). */
  | { status: 'forfeit'; code: 'closed' | 'expired'; reason: string }
  /** Started and still inside its deadline. */
  | { status: 'open'; reason: string };
export type InvalidCode = 'malformed' | 'hash-mismatch' | 'header-mismatch' | 'wrong-seed' | 'illegal' | 'claim-mismatch' | 'end-kind-mismatch' | 'end-step-mismatch' | 'position-mismatch';

export interface RecordedMatch {
  chainId: bigint;
  matchLog: Address;
  player: Address;
  /** The event's indexed ruleset ID and n (checked against the bytes). */
  rulesetId: Hex;
  n: bigint;
  data: Hex;
  /** MatchLog.matchHash(player, n), when the caller read it: the data must hash to it. */
  storedHash?: Hex;
  /** The hash of a block, from the chain's headers (for the seed block named in the bytes); undefined if unknown. */
  blockHash: (blockNumber: bigint) => Hex | undefined;
  /** What start() fixed (from MatchStarted), when known: the bytes must carry the same. */
  started?: { rulesetId: Hex; level: number; seedBlock: bigint };
}

/** What a replay engine module exports (replay.ts at some commit). */
interface Engine {
  replaySolo: typeof import('./replay').replaySolo;
  engineSeed: typeof import('./replay').engineSeed;
  ReplayError: typeof import('./replay').ReplayError;
}
export interface LoadedRuleset { id: Hex; manifest: SoloManifestV1; engine: Engine; from: 'working tree' | `git ${string}`; /** Where the engine was loaded from: a fresh copy of exactly the pinned text. */ dir: string }

/** Load a manifest's engine (see the header). `fromGit` skips the working tree. Throws if anything doesn't match. */
export async function loadRuleset(manifest: SoloManifestV1, opts: { repo?: string; fromGit?: boolean } = {}): Promise<LoadedRuleset> {
  const repo = opts.repo ?? process.cwd();
  const id = rulesetId(manifest) as Hex;
  const e = manifest.engine;
  if (!/^[0-9a-f]{40}$/.test(e.commit)) throw new Error(`the manifest's engine commit ${JSON.stringify(e.commit)} is not 40 hex characters`);
  if (e.entry !== REPLAY_ENTRY || e.replay !== 'replaySolo') throw new Error(`this verifier replays ${REPLAY_ENTRY} replaySolo; the manifest names ${e.entry} ${e.replay}`);
  if (Object.keys(e.packages).length) throw new Error('engines that reach npm packages are not supported by this verifier yet');
  const pinned = (files: Record<string, string>) =>
    closureHash(files, e.packages) === e.closureHash &&
    Object.keys(files).sort().join() === Object.keys(e.files).sort().join() &&
    Object.entries(files).every(([f, t]) => (e.files as Record<string, string>)[f] === hashText(t));
  let files: Record<string, string> | null = null, from: LoadedRuleset['from'] = 'working tree';
  if (!opts.fromGit) {
    try {
      const here = importClosure(REPLAY_ENTRY, (p) => (existsSync(path.join(repo, p)) ? readFileSync(path.join(repo, p), 'utf8') : null));
      if (!here.packages.length && !here.builtins.length && pinned(here.files)) files = here.files;
    } catch { /* the working tree's closure doesn't resolve: use git */ }
  }
  if (!files) {
    const at = (p: string) => { try { return execFileSync('git', ['-C', repo, 'show', `${e.commit}:${p}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
    const c = importClosure(REPLAY_ENTRY, at);
    if (c.packages.length || c.builtins.length || !pinned(c.files)) throw new Error(`the closure at ${e.commit} does not match the manifest`);
    files = c.files;
    from = `git ${e.commit}`;
  }
  // Exactly the pinned text, in a fresh private folder, hashed again after writing, then loaded from there.
  const dir = mkdtempSync(path.join(tmpdir(), 'minpentai-engine-'));
  for (const [f, text] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true, mode: 0o700 }); writeFileSync(path.join(dir, f), text, { mode: 0o600 }); }
  const written = Object.fromEntries(Object.keys(files).map((f) => [f, readFileSync(path.join(dir, f), 'utf8')]));
  if (!pinned(written)) throw new Error('the engine changed while it was being written');
  const engine = (await import(pathToFileURL(path.join(dir, REPLAY_ENTRY)).href)) as Engine;
  return { id, manifest, engine, from, dir };
}

const claimOf = (w: 'C' | 'A' | 'D') => (w === 'C' ? 'win' : w === 'A' ? 'loss' : 'draw');
const bad = (code: InvalidCode, reason: string): Verdict => ({ status: 'invalid', code, reason });

/** Verify one recorded match. `registered` answers whether the registry has the ruleset ID. */
export function verifyMatch(rec: RecordedMatch, registered: (id: Hex) => boolean, rulesets: Map<Hex, LoadedRuleset>): Verdict {
  if (!registered(rec.rulesetId)) return { status: 'unknown-ruleset', code: 'unregistered', reason: `ruleset ${rec.rulesetId} is not in the registry` };
  const rs = rulesets.get(rec.rulesetId);
  if (!rs) return { status: 'unknown-ruleset', code: 'no-engine', reason: `ruleset ${rec.rulesetId} is registered, but no manifest or engine for it is available here` };
  // Strict hex (review finding 3): an odd nibble or a non-hex character is never silently dropped.
  if (typeof rec.data !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(rec.data)) return bad('malformed', 'the data is not whole bytes of hex');
  if (rec.storedHash !== undefined && keccak256(rec.data) !== rec.storedHash) return bad('hash-mismatch', `the data does not hash to MatchLog's stored hash for ${rec.player} #${rec.n}`);
  let m: EncodedMatch;
  try { m = decode(hexToBytes(rec.data)); } catch (e) { return bad('malformed', (e as Error).message); }
  if (m.rulesetId !== rec.rulesetId || BigInt(m.n) !== rec.n) return bad('header-mismatch', `the bytes say ruleset ${m.rulesetId} n ${m.n}; the event says ${rec.rulesetId} n ${rec.n}`);
  if (rec.started && (m.rulesetId !== rec.started.rulesetId || m.opponent.level !== rec.started.level || m.seedBlock !== rec.started.seedBlock)) {
    return bad('header-mismatch', `the bytes' ruleset, level or seed block are not the ones start() fixed`);
  }
  // The seed, recomputed from the seed block's real hash (from the headers, so it is checkable forever).
  const sbh = rec.blockHash(m.seedBlock);
  if (!sbh) return bad('wrong-seed', `the hash of seed block ${m.seedBlock} is not available`);
  if (m.seed !== deriveSeed({ chainId: rec.chainId, matchLog: rec.matchLog, player: rec.player, n: rec.n, rulesetId: m.rulesetId, level: m.opponent.level, seedBlockHash: sbh })) {
    return bad('wrong-seed', `the seed is not ${rec.player}'s match ${rec.n} for this ruleset, level and seed block ${m.seedBlock}`);
  }
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

/**
 * Every manifest in a folder (docs/minpentai/rulesets), loaded by ID. One that fails to load is
 * reported in `errors` and skipped (review finding D3): it never stops the others.
 */
export async function loadRulesets(dir: string, opts: { repo?: string; fromGit?: boolean } = {}): Promise<{ rulesets: Map<Hex, LoadedRuleset>; errors: { file: string; id?: Hex; error: string }[] }> {
  const rulesets = new Map<Hex, LoadedRuleset>(), errors: { file: string; id?: Hex; error: string }[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.endsWith('.canonical.json')).sort()) {
    let id: Hex | undefined;
    try {
      const manifest = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as SoloManifestV1;
      id = rulesetId(manifest) as Hex;
      const rs = await loadRuleset(manifest, opts);
      rulesets.set(rs.id, rs);
    } catch (e) {
      errors.push({ file: f, id, error: (e as Error).message });
    }
  }
  return { rulesets, errors };
}

/** A match as MatchLog's events tell it: started, then recorded, forfeited, or neither yet. */
export interface MatchEvents {
  player: Address;
  n: bigint;
  rulesetId: Hex;
  level: number;
  seedBlock: bigint;
  deadline: bigint;
  recorded?: RecordedMatch;
  forfeited?: boolean;
}

/**
 * The verdict for one started match: a record is verified as above; a forfeit on chain is a
 * forfeit; a match still open past its deadline (at `head`) is a forfeit too, though nobody has
 * closed it yet; otherwise it is open. A record's ruleset, level and seed block must also be the
 * ones start() fixed.
 */
export function verdictOf(e: MatchEvents, head: bigint, registered: (id: Hex) => boolean, rulesets: Map<Hex, LoadedRuleset>): Verdict {
  if (e.forfeited) return { status: 'forfeit', code: 'closed', reason: `forfeited on chain (match ${e.n})` };
  if (!e.recorded) {
    return head > e.deadline
      ? { status: 'forfeit', code: 'expired', reason: `not recorded by block ${e.deadline}; counts as a forfeit (nobody has closed it on chain yet)` }
      : { status: 'open', reason: `can be recorded until block ${e.deadline}` };
  }
  // A record with no MatchStarted (level -1) can't match what start() fixed.
  if (e.level < 0) return bad('header-mismatch', 'recorded without a MatchStarted event');
  return verifyMatch({ ...e.recorded, started: { rulesetId: e.rulesetId, level: e.level, seedBlock: e.seedBlock } }, registered, rulesets);
}
