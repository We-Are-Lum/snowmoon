/**
 * The verifier, end to end, on a fresh local anvil (onchain v1 spike; no keys: accounts are
 * impersonated). Deploys RulesetRegistry and MatchLog, registers solo-v1, records 20 real matches
 * from 5 wallets and a set of planted fakes (each from its own wallet, with that wallet's own seed,
 * so MatchLog accepts it), then reads the events back and checks every verdict:
 *   real matches             verified
 *   wrong result             invalid: claim-mismatch
 *   faked final position     invalid: position-mismatch
 *   an illegal move          invalid: illegal
 *   a wrong end step         invalid: end-step-mismatch
 *   a resign claimed after the match had ended   invalid: end-kind-mismatch
 *   non-canonical bytes      invalid: malformed
 *   an unregistered ruleset  unknown-ruleset: unregistered
 * The same verdicts come from the CLI (scripts/minpentai-verify.ts) and from the engine rebuilt from
 * git at the manifest's pinned commit. Then planted bugs: mutant copies of verify.ts (each skipping
 * one check) are run against the same events, and each must make the checks fail.
 *
 *   npm run test:minpentai-onchain-verifier      (needs `forge build` in contracts/minpentai)
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encodeFunctionData, keccak256, toBytes, type Address, type Hex } from 'viem';
import { as, artifact, deploy, withAnvil } from './lib-minpentai-anvil';
import { MATCH_RECORDED } from './minpentai-verify';
import { encode, fromReplay, toHex, type EncodedMatch } from '../src/lib/minpentai/onchain/encoding';
import { engineSeed, replaySolo } from '../src/lib/minpentai/onchain/replay';
import { rulesetId, type SoloManifestV1 } from '../src/lib/minpentai/onchain/ruleset';
import { sampleMatch } from '../src/lib/minpentai/onchain/sample';
import { deriveSeed } from '../src/lib/minpentai/onchain/seed';
import { loadRuleset, loadRulesets, type LoadedRuleset, type RecordedMatch, type Verdict } from '../src/lib/minpentai/onchain/verify';
import { REPLAY_ENTRY, hashText } from '../src/lib/minpentai/onchain/ruleset';

const CHAIN = 31337n;
const MANIFEST = JSON.parse(readFileSync('docs/minpentai/rulesets/solo-v1.json', 'utf8')) as SoloManifestV1;
const ID = rulesetId(MANIFEST) as Hex;
const OWNER: Address = '0x000000000000000000000000000000000000a11c';
const DEPLOYER: Address = '0x000000000000000000000000000000000000de91';
const wallet = (i: number) => `0x${(0xa000 + i).toString(16).padStart(40, '0')}` as Address;

let failed = 0, passed = 0;
const check = (name: string, bad: string | void | undefined) => { if (bad) { failed++; console.log(`FAIL ${name}: ${bad}`); } else passed++; };

type Expect = { status: Verdict['status']; code?: string };
interface Planted { label: string; player: Address; data: Hex; expect: Expect }

/** A real match for `player`'s match number n, at a level, maybe resigned. */
function realMatch(log: Address, player: Address, n: number, level: number, resign?: number): EncodedMatch {
  const seed = deriveSeed(CHAIN, log, player, BigInt(n));
  const solo = sampleMatch(engineSeed(seed), level, resign);
  return fromReplay(ID, n, seed, solo, replaySolo(solo));
}

function plan(log: Address): Planted[] {
  const out: Planted[] = [];
  for (let w = 0; w < 5; w++) for (let n = 0; n < 4; n++) {
    const m = realMatch(log, wallet(w), n, (w + n) % 6, (w * 4 + n) % 7 === 3 ? 1 + (n % 3) : undefined);
    out.push({ label: `real w${w} #${n}`, player: wallet(w), data: toHex(encode(m)) as Hex, expect: { status: 'verified' } });
  }
  const fake = (i: number, label: string, f: (m: EncodedMatch) => EncodedMatch | Uint8Array, expect: Expect, level = 3, resign?: number) => {
    const p = wallet(100 + i);
    const m = realMatch(log, p, 0, level, resign);
    const r = f(m);
    out.push({ label, player: p, data: toHex(r instanceof Uint8Array ? r : encode(r)) as Hex, expect });
  };
  fake(0, 'fake: wrong result', (m) => ({ ...m, claim: m.claim === 'win' ? 'loss' : 'win' }), { status: 'invalid', code: 'claim-mismatch' });
  fake(1, 'fake: final position with a tower removed', (m) => ({ ...m, position: m.position.filter((p, i) => i !== m.position.findIndex((q) => q[1] <= 1)) }), { status: 'invalid', code: 'position-mismatch' });
  fake(2, 'fake: final position with an extra tower', (m) => ({ ...m, position: [...m.position, [149, 0] as [number, number]].sort((a, b) => a[0] - b[0] || a[1] - b[1]) }), { status: 'invalid', code: 'position-mismatch' });
  fake(3, 'fake: an illegal move (a square far outside the lit area)', (m) => ({ ...m, turns: [[...m.turns[0].filter((p) => !(p.x === 14 && p.y === 9)), { t: 's', o: 'C', x: 14, y: 9, dx: 0, dy: 0 }], ...m.turns.slice(1)] }), { status: 'invalid', code: 'illegal' });
  fake(4, 'fake: an illegal move (9 points of pieces)', (m) => ({ ...m, turns: [[{ t: 't', o: 'C', x: 2, y: 2, dx: 0, dy: 0 }, { t: 't', o: 'C', x: 2, y: 3, dx: 0, dy: 0 }, { t: 's', o: 'C', x: 2, y: 4, dx: 0, dy: 0 }], ...m.turns.slice(1)] }), { status: 'invalid', code: 'illegal' });
  fake(5, 'fake: wrong end step', (m) => ({ ...m, end: { ...m.end, step: m.end.step === 96 ? 95 : m.end.step + 1 } }), { status: 'invalid', code: 'end-step-mismatch' });
  fake(6, 'fake: a resign claimed after the match had ended', (m) => ({ ...m, end: { kind: 'resign', step: m.end.step }, claim: 'loss' }), { status: 'invalid', code: 'end-kind-mismatch' });
  fake(7, 'fake: non-canonical bytes (a padding bit set)', (m) => {
    let mm = m;
    if ((13 * mm.position.length) % 8 === 0) mm = { ...mm, position: mm.position.slice(0, -1) };
    const b = encode(mm);
    b[b.length - 1] |= 1;
    return b;
  }, { status: 'invalid', code: 'malformed' });
  fake(8, 'fake: an unregistered ruleset ID', (m) => ({ ...m, rulesetId: keccak256(toBytes('not a registered ruleset')) }), { status: 'unknown-ruleset', code: 'unregistered' });
  fake(9, 'fake: a resign moved to a later step', (m) => ({ ...m, end: { kind: 'resign', step: m.end.step + 12 } }), { status: 'invalid' }, 2, 2);
  return out;
}

type VerifyFn = (rec: RecordedMatch, registered: (id: Hex) => boolean, rs: Map<Hex, LoadedRuleset>) => Verdict;
/** Failures of a verify function against the planted expectations (empty when it gets everything right). */
function judge(verify: VerifyFn, recs: { label: string; rec: RecordedMatch; expect: Expect }[], registered: (id: Hex) => boolean, rs: Map<Hex, LoadedRuleset>): string[] {
  const out: string[] = [];
  for (const { label, rec, expect } of recs) {
    let v: Verdict;
    try { v = verify(rec, registered, rs); } catch (e) { out.push(`${label}: threw ${(e as Error).message}`); continue; }
    const code = 'code' in v ? v.code : undefined;
    if (v.status !== expect.status || (expect.code && code !== expect.code)) out.push(`${label}: ${v.status}${code ? ` ${code}` : ''}, want ${expect.status}${expect.code ? ` ${expect.code}` : ''}`);
  }
  return out;
}

const MUTANTS: [string, string, string][] = [
  ['skip the final position check', 'if (JSON.stringify(want) !== JSON.stringify(m.position)) {', 'if (false) {'],
  ['skip the result check', 'if (claimOf(r.win) !== m.claim) return', 'if (false) return'],
  ["skip the end step check for played-out matches", "if (m.end.kind === 'end' && r.step !== m.end.step) return", 'if (false) return'],
  ['trust every ruleset ID', 'if (!registered(rec.rulesetId)) return', 'if (false) return'],
  ['count an illegal replay as verified', "return bad('illegal', msg);", "return { status: 'verified', claim: m.claim, endStep: m.end.step };"],
  ['skip the canonical decode (decode errors become verified)', "catch (e) { return bad('malformed', (e as Error).message); }", "catch { return { status: 'verified', claim: 'win', endStep: 0 }; }"],
];

const main = async () => withAnvil(CHAIN, async (url) => {
  const registry = await deploy(url, DEPLOYER, 'RulesetRegistry', [OWNER]);
  const log = await deploy(url, DEPLOYER, 'MatchLog');
  const reg = artifact('RulesetRegistry'), ml = artifact('MatchLog');
  {
    const { test, wallet: w } = await as(url, OWNER);
    const h = await w.sendTransaction({ to: registry, data: encodeFunctionData({ abi: reg.abi, functionName: 'add', args: [ID, 'repo:docs/minpentai/rulesets/solo-v1.json', OWNER, '0x' + '00'.repeat(32)] }), account: OWNER, chain: w.chain });
    if ((await test.waitForTransactionReceipt({ hash: h })).status !== 'success') throw new Error('register failed');
  }
  const planted = plan(log);
  for (const p of planted) {
    const { test, wallet: w } = await as(url, p.player);
    const h = await w.sendTransaction({ to: log, data: encodeFunctionData({ abi: ml.abi, functionName: 'record', args: [p.data] }), account: p.player, chain: w.chain });
    const r = await test.waitForTransactionReceipt({ hash: h });
    if (r.status !== 'success') throw new Error(`${p.label}: record() reverted`);
  }
  const { test } = await as(url, DEPLOYER);
  const events = await test.getLogs({ address: log, event: MATCH_RECORDED, fromBlock: 0n, toBlock: 'latest' });
  check(`all ${planted.length} recordings are on chain as events`, events.length === planted.length ? undefined : `${events.length} events`);
  const isAdded = (await import('viem')).parseAbiItem('function isAdded(bytes32 id) view returns (bool)');
  const known = new Map<Hex, boolean>();
  for (const id of new Set(events.map((e) => e.args.rulesetId!))) known.set(id, await test.readContract({ address: registry, abi: [isAdded], functionName: 'isAdded', args: [id] }));
  const registered = (id: Hex) => known.get(id) === true;
  const recs = events.map((e, i) => ({ label: planted[i].label, expect: planted[i].expect, rec: { chainId: CHAIN, matchLog: log, player: e.args.player!, rulesetId: e.args.rulesetId!, n: e.args.n!, data: e.args.data! } as RecordedMatch }));
  check('events come back in the order recorded, from the right players', recs.every((r, i) => r.rec.player.toLowerCase() === planted[i].player.toLowerCase() && r.rec.data.toLowerCase() === planted[i].data.toLowerCase()) ? undefined : 'order or data differs');

  const { verifyMatch } = await import('../src/lib/minpentai/onchain/verify');
  const local = await loadRuleset(MANIFEST);
  const rs = new Map([[local.id, local]]);
  const real = judge(verifyMatch, recs, registered, rs);
  check(`the verifier gets all ${recs.length} right (20 real verified; ${recs.length - 20} fakes caught with the right reason)`, real.join('; ') || undefined);
  for (const r of recs.filter((x) => x.expect.status !== 'verified')) {
    const v = verifyMatch(r.rec, registered, rs);
    console.log(`  ${r.label.padEnd(56)} -> ${v.status}${'code' in v ? ` ${v.code}: ${v.reason}` : ''}`);
  }
  check('the engine came from the working tree (its closure matches the manifest)', local.from === 'working tree' ? undefined : local.from);

  const fromGit = await loadRuleset(MANIFEST, { fromGit: true });
  check(`the engine rebuilt from git at ${MANIFEST.engine.commit.slice(0, 7)} gives the same verdicts`, judge(verifyMatch, recs, registered, new Map([[fromGit.id, fromGit]])).join('; ') || (fromGit.from.startsWith('git') ? undefined : 'not loaded from git'));

  const cli = JSON.parse(execFileSync('npx', ['tsx', 'scripts/minpentai-verify.ts', '--rpc', url, '--log', log, '--registry', registry, '--json'], { encoding: 'utf8' })) as { verdict: Verdict }[];
  check('the CLI gives the same verdicts', cli.map((c) => c.verdict.status + ('code' in c.verdict ? c.verdict.code : '')).join() === recs.map((r) => { const v = verifyMatch(r.rec, registered, rs); return v.status + ('code' in v ? v.code : ''); }).join() ? undefined : 'differs');

  // Planted bugs: each mutant must make the checks fail.
  const src = readFileSync('src/lib/minpentai/onchain/verify.ts', 'utf8');
  for (const [name, from, to] of MUTANTS) {
    if (!src.includes(from)) { check(`mutant "${name}" applies`, `text not found: ${from}`); continue; }
    const file = `src/lib/minpentai/onchain/verify.mutant-${MUTANTS.findIndex((m) => m[0] === name)}.ts`;
    writeFileSync(file, src.replace(from, to));
    try {
      const mod = (await import(`../${file}`)) as { verifyMatch: VerifyFn };
      const caught = judge(mod.verifyMatch, recs, registered, rs);
      check(`planted bug "${name}" makes the checks fail`, caught.length ? undefined : 'the checks still pass');
      if (caught.length) console.log(`  planted bug "${name}": ${caught.length} failure(s), e.g. ${caught[0]}`);
    } finally { rmSync(file, { force: true }); }
  }
  // Review fixes (2026-10-21), offline.
  const good = recs[0].rec;
  const vOf = (rec: RecordedMatch) => verifyMatch(rec, registered, rs);
  check('data that is not whole bytes of hex is refused, not silently trimmed (review finding 3)', ['7', 'zzzz', '0g00', '0'].map((tail) => vOf({ ...good, data: (good.data + tail) as Hex })).every((v) => v.status === 'invalid' && v.code === 'malformed') ? undefined : 'accepted');
  check("data that does not hash to MatchLog's stored hash is refused", (() => { const v = vOf({ ...good, storedHash: keccak256(toBytes('another match')) }); return v.status === 'invalid' && v.code === 'hash-mismatch' ? undefined : JSON.stringify(v); })());
  check('with the right stored hash it still verifies', vOf({ ...good, storedHash: keccak256(good.data) }).status === 'verified' ? undefined : 'not verified');
  check('each load runs a fresh private copy of exactly the pinned files (review findings 2 and 4)', (() => {
    const a = local.dir, b = fromGit.dir;
    if (a === b) return 'the same folder twice';
    for (const d of [a, b]) for (const [f, h] of Object.entries(MANIFEST.engine.files)) if (hashText(readFileSync(path.join(d, f), 'utf8')) !== h) return `${d}: ${f}`;
  })());
  // A working tree whose engine differs (the reviewer's MAXS = 24), with no git history to fall back on: refused.
  const fake = mkdtempSync(path.join(tmpdir(), 'minpentai-fake-repo-'));
  try {
    for (const f of Object.keys(MANIFEST.engine.files)) { mkdirSync(path.dirname(path.join(fake, f)), { recursive: true }); cpSync(f, path.join(fake, f)); }
    cpSync('package-lock.json', path.join(fake, 'package-lock.json'));
    const g = path.join(fake, 'src/lib/minpentai/play-game/game.ts');
    writeFileSync(g, readFileSync(g, 'utf8').replace('export const MAXS = 96;', 'export const MAXS = 24;'));
    let took: string | null = null;
    try { const r = await loadRuleset(MANIFEST, { repo: fake }); took = r.from; } catch { /* refused */ }
    check('a working tree with a changed engine (and no git to fall back on) is refused, not run', took === null ? undefined : `loaded from ${took}`);
  } finally { rmSync(fake, { recursive: true, force: true }); }
  for (const [what, m] of [["a commit that is not 40 hex ('HEAD')", { ...MANIFEST, engine: { ...MANIFEST.engine, commit: 'HEAD' } }], ['a different entry file', { ...MANIFEST, engine: { ...MANIFEST.engine, entry: 'src/other.ts' } }], ['a wrong per-file hash', { ...MANIFEST, engine: { ...MANIFEST.engine, files: { ...MANIFEST.engine.files, [REPLAY_ENTRY]: keccak256(toBytes('x')) } } }]] as [string, SoloManifestV1][]) {
    let ok = false;
    try { await loadRuleset(m); } catch { ok = true; }
    check(`a manifest with ${what} is refused`, ok ? undefined : 'loaded');
  }
  const folder = mkdtempSync(path.join(tmpdir(), 'minpentai-rulesets-'));
  try {
    cpSync('docs/minpentai/rulesets/solo-v1.json', path.join(folder, 'solo-v1.json'));
    writeFileSync(path.join(folder, 'broken.json'), '{ not json');
    writeFileSync(path.join(folder, 'head.json'), JSON.stringify({ ...MANIFEST, engine: { ...MANIFEST.engine, commit: 'HEAD' } }));
    const { rulesets: got, errors } = await loadRulesets(folder);
    check('one bad manifest never stops the others (review finding D3)', got.size === 1 && errors.length === 2 && readdirSync(folder).length === 3 ? undefined : `${got.size} loaded, ${errors.length} errors`);
  } finally { rmSync(folder, { recursive: true, force: true }); }

  console.log(failed ? `verifier: ${failed} failed, ${passed} passed` : `verifier: ${passed} checks passed`);
  process.exitCode = failed ? 1 : 0;
});
void main().catch((e) => { console.error(e); process.exit(1); });
