/**
 * The verifier, end to end, on a fresh local anvil running Prague, so the real EIP-2935 history
 * contract is there (onchain v1 spike, commit before play; no keys: accounts are impersonated).
 * Deploys RulesetRegistry and MatchLog, registers solo-v1, then for every match: start(), mine to
 * the seed block, read its hash from the chain, play from that seed, record(). Planted:
 *   20 real matches from 5 wallets                 verified
 *   wrong result                                   invalid: claim-mismatch
 *   faked final position (tower removed, added)    invalid: position-mismatch
 *   an illegal move (outside the lit area, 9 points) invalid: illegal
 *   a wrong end step                               invalid: end-step-mismatch
 *   a resign claimed after the match had ended     invalid: end-kind-mismatch
 *   non-canonical bytes                            invalid: malformed
 *   an unregistered ruleset (started under it)     unknown-ruleset: unregistered
 *   a resign moved to a later step                 invalid
 *   started, then closed after the deadline        forfeit: closed
 *   started and abandoned (never closed)           forfeit: expired
 *   started twice (the first forfeited)            forfeit: closed, then the second verified
 *   started, still inside the deadline             open
 * The CLI and the engine rebuilt from git give the same verdicts. Then planted bugs: mutant copies
 * of verify.ts (each skipping one check) are run against the same chain, and each must fail.
 *
 *   npm run test:minpentai-onchain-verifier      (needs `forge build` in contracts/minpentai)
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPublicClient, decodeEventLog, encodeFunctionData, http, keccak256, toBytes, type Address, type Hex } from 'viem';
import { as, artifact, deploy, withAnvil } from './lib-minpentai-anvil';
import { MATCH_STARTED, verifyLog } from './minpentai-verify';
import { encode, fromReplay, toHex, type EncodedMatch } from '../src/lib/minpentai/onchain/encoding';
import { engineSeed, replaySolo } from '../src/lib/minpentai/onchain/replay';
import { REPLAY_ENTRY, hashText, rulesetId, type SoloManifestV1 } from '../src/lib/minpentai/onchain/ruleset';
import { sampleMatch } from '../src/lib/minpentai/onchain/sample';
import { deriveSeed } from '../src/lib/minpentai/onchain/seed';
import { loadRuleset, loadRulesets, verifyMatch, type LoadedRuleset, type RecordedMatch, type Verdict, type verdictOf } from '../src/lib/minpentai/onchain/verify';

const CHAIN = 31337n;
const MANIFEST = JSON.parse(readFileSync('docs/minpentai/rulesets/solo-v1.json', 'utf8')) as SoloManifestV1;
const ID = rulesetId(MANIFEST) as Hex;
const UNREGISTERED = keccak256(toBytes('not a registered ruleset'));
const OWNER: Address = '0x000000000000000000000000000000000000a11c';
const DEPLOYER: Address = '0x000000000000000000000000000000000000de91';
const wallet = (i: number) => `0x${(0xa000 + i).toString(16).padStart(40, '0')}` as Address;

let failed = 0, passed = 0;
const check = (name: string, bad: string | void | undefined) => { if (bad) { failed++; console.log(`FAIL ${name}: ${bad}`); } else passed++; };
type Expect = { status: Verdict['status']; code?: string };

const main = async () => withAnvil(CHAIN, async (url) => {
  const registry = await deploy(url, DEPLOYER, 'RulesetRegistry', [OWNER]);
  const log = await deploy(url, DEPLOYER, 'MatchLog');
  const reg = artifact('RulesetRegistry'), ml = artifact('MatchLog');
  const { test } = await as(url, DEPLOYER);
  const send = async (from: Address, to: Address, data: Hex) => {
    const { wallet: w } = await as(url, from);
    const r = await test.waitForTransactionReceipt({ hash: await w.sendTransaction({ to, data, account: from, chain: w.chain }) });
    if (r.status !== 'success') throw new Error(`${from} -> ${to}: reverted`);
    return r;
  };
  await send(OWNER, registry, encodeFunctionData({ abi: reg.abi, functionName: 'add', args: [ID, 'ar://solo-v1-manifest', OWNER, '0x' + '00'.repeat(32)] }));

  /** start(), mine to the seed block, read its hash, and return what's needed to play and record. */
  const start = async (player: Address, rid: Hex, level: number) => {
    const r = await send(player, log, encodeFunctionData({ abi: ml.abi, functionName: 'start', args: [rid, level] }));
    const ev = r.logs.map((l) => { try { return decodeEventLog({ abi: [MATCH_STARTED], data: l.data, topics: l.topics }); } catch { return null; } }).find((x) => x)!;
    const { n, seedBlock } = ev.args as { n: bigint; seedBlock: bigint };
    await test.mine({ blocks: 2 });
    const seedBlockHash = (await test.getBlock({ blockNumber: seedBlock })).hash;
    const seed = deriveSeed({ chainId: CHAIN, matchLog: log, player, n, rulesetId: rid, level, seedBlockHash });
    return { n: Number(n), seedBlock, seed };
  };
  const play = async (player: Address, rid: Hex, level: number, resign?: number, fake?: (m: EncodedMatch) => EncodedMatch | Uint8Array) => {
    const s = await start(player, rid, level);
    const solo = sampleMatch(engineSeed(s.seed), level, resign);
    const m = fromReplay(rid, s.n, s.seed, s.seedBlock, solo, replaySolo(solo));
    const out = fake ? fake(m) : m;
    await send(player, log, encodeFunctionData({ abi: ml.abi, functionName: 'record', args: [toHex(out instanceof Uint8Array ? out : encode(out)) as Hex] }));
  };

  const expect = new Map<string, { label: string; e: Expect }>();
  const want = (p: Address, n: number, label: string, e: Expect) => expect.set(`${p.toLowerCase()}#${n}`, { label, e });
  for (let w = 0; w < 5; w++) for (let n = 0; n < 4; n++) {
    await play(wallet(w), ID, (w + n) % 6, (w * 4 + n) % 7 === 3 ? 1 + (n % 3) : undefined);
    want(wallet(w), n, `real w${w} #${n}`, { status: 'verified' });
  }
  const fakes: [string, (m: EncodedMatch) => EncodedMatch | Uint8Array, Expect, Hex?, number?, number?][] = [
    ['wrong result', (m) => ({ ...m, claim: m.claim === 'win' ? 'loss' : 'win' }), { status: 'invalid', code: 'claim-mismatch' }],
    ['final position with a tower removed', (m) => ({ ...m, position: m.position.filter((_, i) => i !== m.position.findIndex((q) => q[1] <= 1)) }), { status: 'invalid', code: 'position-mismatch' }],
    ['final position with an extra tower', (m) => ({ ...m, position: [...m.position, [149, 0] as [number, number]].sort((a, b) => a[0] - b[0] || a[1] - b[1]) }), { status: 'invalid', code: 'position-mismatch' }],
    ['an illegal move (outside the lit area)', (m) => ({ ...m, turns: [[...m.turns[0].filter((p) => !(p.x === 14 && p.y === 9)), { t: 's', o: 'C', x: 14, y: 9, dx: 0, dy: 0 }], ...m.turns.slice(1)] }), { status: 'invalid', code: 'illegal' }],
    ['an illegal move (9 points)', (m) => ({ ...m, turns: [[{ t: 't', o: 'C', x: 2, y: 2, dx: 0, dy: 0 }, { t: 't', o: 'C', x: 2, y: 3, dx: 0, dy: 0 }, { t: 's', o: 'C', x: 2, y: 4, dx: 0, dy: 0 }], ...m.turns.slice(1)] }), { status: 'invalid', code: 'illegal' }],
    ['wrong end step', (m) => ({ ...m, end: { ...m.end, step: m.end.step === 96 ? 95 : m.end.step + 1 } }), { status: 'invalid', code: 'end-step-mismatch' }],
    ['a resign claimed after the match had ended', (m) => ({ ...m, end: { kind: 'resign', step: m.end.step }, claim: 'loss' }), { status: 'invalid', code: 'end-kind-mismatch' }],
    ['non-canonical bytes (a padding bit set)', (m) => { const mm = (13 * m.position.length) % 8 === 0 ? { ...m, position: m.position.slice(0, -1) } : m; const b = encode(mm); b[b.length - 1] |= 1; return b; }, { status: 'invalid', code: 'malformed' }],
    ['started under an unregistered ruleset', (m) => m, { status: 'unknown-ruleset', code: 'unregistered' }, UNREGISTERED],
    ['a resign moved to a later step', (m) => ({ ...m, end: { kind: 'resign', step: m.end.step + 12 } }), { status: 'invalid' }, undefined, 2, 2],
  ];
  for (const [i, [label, f, e, rid, level, resign]] of fakes.entries()) {
    await play(wallet(100 + i), rid ?? ID, level ?? 3, resign, f);
    want(wallet(100 + i), 0, `fake: ${label}`, e);
  }
  // Forfeits and an open match.
  await start(wallet(200), ID, 1); want(wallet(200), 0, 'started, closed after the deadline', { status: 'forfeit', code: 'closed' });
  await start(wallet(201), ID, 4); want(wallet(201), 0, 'started and abandoned', { status: 'forfeit', code: 'expired' });
  await start(wallet(202), ID, 2); want(wallet(202), 0, 'started, then started again', { status: 'forfeit', code: 'closed' });
  for (let i = 0; i < 9; i++) await test.mine({ blocks: i < 8 ? 1000 : 5 }); // past the 8,000-block deadline
  await send(wallet(7), log, encodeFunctionData({ abi: ml.abi, functionName: 'close', args: [wallet(200)] }));
  await play(wallet(202), ID, 5); want(wallet(202), 1, 'the second start, played and recorded', { status: 'verified' });
  await start(wallet(203), ID, 0); want(wallet(203), 0, 'started, still open', { status: 'open' });

  const client = createPublicClient({ transport: http(url) });
  const local = await loadRuleset(MANIFEST);
  const rs = new Map([[local.id, local]]);
  const judge = async (v: typeof verdictOf) => {
    const rows = await verifyLog(client, log, registry, rs, v);
    const out: string[] = [];
    if (rows.length !== expect.size) out.push(`${rows.length} matches, want ${expect.size}`);
    for (const r of rows) {
      const x = expect.get(`${r.player.toLowerCase()}#${r.n}`);
      if (!x) { out.push(`unexpected ${r.player} #${r.n}`); continue; }
      const code = 'code' in r.verdict ? r.verdict.code : undefined;
      if (r.verdict.status !== x.e.status || (x.e.code && code !== x.e.code)) out.push(`${x.label}: ${r.verdict.status}${code ? ` ${code}` : ''}, want ${x.e.status}${x.e.code ? ` ${x.e.code}` : ''}`);
    }
    return { rows, out };
  };
  const { verdictOf: real } = await import('../src/lib/minpentai/onchain/verify');
  const first = await judge(real);
  check(`the verifier gets all ${expect.size} matches right (21 real verified; 10 fakes caught; 3 forfeits; 1 open)`, first.out.join('; ') || undefined);
  for (const r of first.rows) {
    const x = expect.get(`${r.player.toLowerCase()}#${r.n}`)!;
    if (x.e.status !== 'verified') console.log(`  ${x.label.padEnd(48)} -> ${r.verdict.status}${'code' in r.verdict ? ` ${r.verdict.code}` : ''}: ${'reason' in r.verdict ? r.verdict.reason : ''}`);
  }
  check('the engine came from the working tree (its closure matches the manifest)', local.from === 'working tree' ? undefined : local.from);
  const fromGit = await loadRuleset(MANIFEST, { fromGit: true });
  check(`the engine rebuilt from git at ${MANIFEST.engine.commit.slice(0, 7)} gives the same verdicts`, (await verifyLog(client, log, registry, new Map([[fromGit.id, fromGit]]))).map((r) => r.verdict.status).join() === first.rows.map((r) => r.verdict.status).join() && fromGit.from.startsWith('git') ? undefined : 'differs');
  const cli = JSON.parse(execFileSync('npx', ['tsx', 'scripts/minpentai-verify.ts', '--rpc', url, '--log', log, '--registry', registry, '--json'], { encoding: 'utf8' })) as { verdict: Verdict }[];
  check('the CLI gives the same verdicts', cli.map((c) => c.verdict.status + ('code' in c.verdict ? c.verdict.code : '')).join() === first.rows.map((r) => r.verdict.status + ('code' in r.verdict ? r.verdict.code : '')).join() ? undefined : 'differs');

  // Offline checks on a real record.
  const realRow = first.rows.find((r) => r.verdict.status === 'verified')!;
  const rec = (await (async () => {
    const recs = await test.getLogs({ address: log, event: (await import('./minpentai-verify')).MATCH_RECORDED, fromBlock: 0n, toBlock: 'latest' });
    const e = recs.find((x) => x.args.player!.toLowerCase() === realRow.player.toLowerCase() && x.args.n === realRow.n)!;
    const sb = BigInt('0x' + e.args.data!.slice(2 + 138, 2 + 154));
    const h = (await test.getBlock({ blockNumber: sb })).hash;
    return { chainId: CHAIN, matchLog: log, player: e.args.player!, rulesetId: e.args.rulesetId!, n: e.args.n!, data: e.args.data!, blockHash: (b: bigint) => (b === sb ? h : undefined) } as RecordedMatch;
  })());
  const vOf = (r: RecordedMatch) => verifyMatch(r, () => true, rs);
  check('a real record verifies offline', vOf(rec).status === 'verified' ? undefined : JSON.stringify(vOf(rec)));
  check("a record whose ruleset, level or seed block differ from what start() fixed is refused", (() => {
    const m = BigInt('0x' + rec.data.slice(2 + 138, 2 + 154)), lvl = parseInt(rec.data.slice(2 + 156, 2 + 158), 16);
    const bads = [{ rulesetId: UNREGISTERED, level: lvl, seedBlock: m }, { rulesetId: rec.rulesetId, level: (lvl + 1) % 6, seedBlock: m }, { rulesetId: rec.rulesetId, level: lvl, seedBlock: m + 1n }];
    const ok = vOf({ ...rec, started: { rulesetId: rec.rulesetId, level: lvl, seedBlock: m } }).status === 'verified';
    return ok && bads.every((st) => { const v = vOf({ ...rec, started: st }); return v.status === 'invalid' && v.code === 'header-mismatch'; }) ? undefined : 'not refused';
  })());
  check('a seed made from a different block hash is refused (the verifier checks the seed against the headers)', (() => { const v = vOf({ ...rec, blockHash: () => keccak256(toBytes('another block')) }); return v.status === 'invalid' && v.code === 'wrong-seed' ? undefined : JSON.stringify(v); })());
  check('a record whose seed block hash is unknown is refused', (() => { const v = vOf({ ...rec, blockHash: () => undefined }); return v.status === 'invalid' && v.code === 'wrong-seed' ? undefined : JSON.stringify(v); })());
  check('data that is not whole bytes of hex is refused, not silently trimmed', ['7', 'zzzz', '0g00', '0'].map((t) => vOf({ ...rec, data: (rec.data + t) as Hex })).every((v) => v.status === 'invalid' && v.code === 'malformed') ? undefined : 'accepted');
  check("data that does not hash to MatchLog's stored hash is refused", (() => { const v = vOf({ ...rec, storedHash: keccak256(toBytes('x')) }); return v.status === 'invalid' && v.code === 'hash-mismatch' ? undefined : JSON.stringify(v); })());
  check('each load runs a fresh private copy of exactly the pinned files', (() => {
    if (local.dir === fromGit.dir) return 'the same folder twice';
    for (const d of [local.dir, fromGit.dir]) for (const [f, h] of Object.entries(MANIFEST.engine.files)) if (hashText(readFileSync(path.join(d, f), 'utf8')) !== h) return `${d}: ${f}`;
  })());
  const fake = mkdtempSync(path.join(tmpdir(), 'minpentai-fake-repo-'));
  try {
    for (const f of Object.keys(MANIFEST.engine.files)) { mkdirSync(path.dirname(path.join(fake, f)), { recursive: true }); cpSync(f, path.join(fake, f)); }
    cpSync('package-lock.json', path.join(fake, 'package-lock.json'));
    const g = path.join(fake, 'src/lib/minpentai/play-game/game.ts');
    writeFileSync(g, readFileSync(g, 'utf8').replace('export const MAXS = 96;', 'export const MAXS = 24;'));
    let took: string | null = null;
    try { took = (await loadRuleset(MANIFEST, { repo: fake })).from; } catch { /* refused */ }
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
    check('one bad manifest never stops the others', got.size === 1 && errors.length === 2 && readdirSync(folder).length === 3 ? undefined : `${got.size} loaded, ${errors.length} errors`);
  } finally { rmSync(folder, { recursive: true, force: true }); }

  // Planted bugs: each mutant of verify.ts must make the checks fail.
  const MUTANTS: [string, string, string][] = [
    ['skip the final position check', 'if (JSON.stringify(want) !== JSON.stringify(m.position)) {', 'if (false) {'],
    ['skip the result check', 'if (claimOf(r.win) !== m.claim) return', 'if (false) return'],
    ['skip the end step check for played-out matches', "if (m.end.kind === 'end' && r.step !== m.end.step) return", 'if (false) return'],
    ['trust every ruleset ID', 'if (!registered(rec.rulesetId)) return', 'if (false) return'],
    ['count an illegal replay as verified', "return bad('illegal', msg);", "return { status: 'verified', claim: m.claim, endStep: m.end.step };"],
    ['skip the canonical decode', "catch (e) { return bad('malformed', (e as Error).message); }", "catch { return { status: 'verified', claim: 'win', endStep: 0 }; }"],
    ['count an expired open match as still open', 'return head > e.deadline', 'return false'],
    ['ignore forfeits closed on chain', "if (e.forfeited) return { status: 'forfeit', code: 'closed'", "if (false) return { status: 'forfeit', code: 'closed'"],
  ];
  const src = readFileSync('src/lib/minpentai/onchain/verify.ts', 'utf8');
  for (const [i, [name, from, to]] of MUTANTS.entries()) {
    if (!src.includes(from)) { check(`mutant "${name}" applies`, `text not found: ${from}`); continue; }
    const file = `src/lib/minpentai/onchain/verify.mutant-${i}.ts`;
    writeFileSync(file, src.replace(from, to));
    try {
      const mod = (await import(`../${file}`)) as { verdictOf: typeof verdictOf };
      const { out } = await judge(mod.verdictOf);
      check(`planted bug "${name}" makes the checks fail`, out.length ? undefined : 'the checks still pass');
      if (out.length) console.log(`  planted bug "${name}": ${out.length} failure(s), e.g. ${out[0]}`);
    } finally { rmSync(file, { force: true }); }
  }
  console.log(failed ? `verifier: ${failed} failed, ${passed} passed` : `verifier: ${passed} checks passed`);
  process.exitCode = failed ? 1 : 0;
});
void main().catch((e) => { console.error(e); process.exit(1); });

export type { LoadedRuleset };
