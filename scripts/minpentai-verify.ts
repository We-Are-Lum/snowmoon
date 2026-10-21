/**
 * Verify every Minpentai match on a chain (onchain v1 spike, commit before play): reads MatchLog's
 * MatchStarted, MatchRecorded and MatchForfeited events, checks each ruleset against a
 * RulesetRegistry, reads each seed block's hash from the chain's headers, and replays each record
 * under the engine its ruleset pins (docs/minpentai/rulesets/). One line per started match:
 * verified, invalid (with the reason), unknown ruleset, forfeit (closed on chain, or expired and
 * never closed) or open. Read-only.
 *
 *   npx tsx scripts/minpentai-verify.ts --rpc URL --log 0x… --registry 0x… [--from DEPLOY_BLOCK] [--json]
 *
 * Every row also says how the match counts (outcome): only a verified record counts as its claim;
 * every other ended match (invalid, unknown ruleset, forfeit) is a loss; an open one is pending.
 */
import { createPublicClient, http, parseAbiItem, type Address, type Hex, type PublicClient } from 'viem';
import { loadRulesets, outcomeOf, verdictOf, type LoadedRuleset, type MatchEvents, type Verdict } from '../src/lib/minpentai/onchain/verify';

export const MATCH_STARTED = parseAbiItem('event MatchStarted(address indexed player, bytes32 indexed rulesetId, uint256 n, uint8 level, uint64 seedBlock, uint64 deadline)');
export const MATCH_RECORDED = parseAbiItem('event MatchRecorded(address indexed player, bytes32 indexed rulesetId, uint256 n, bytes data)');
export const MATCH_FORFEITED = parseAbiItem('event MatchForfeited(address indexed player, bytes32 indexed rulesetId, uint256 n)');
const IS_ADDED = parseAbiItem('function isAdded(bytes32 id) view returns (bool)');
const MATCH_HASH = parseAbiItem('function matchHash(address player, uint256 n) view returns (bytes32)');

export interface Row { player: Address; n: bigint; rulesetId: Hex; verdict: Verdict; /** How it counts: only a verified record counts as its claim; every other ended match is a loss. */ outcome: ReturnType<typeof outcomeOf> }

/**
 * All of a log's matches, grouped by (player, n), each with its verdict at the chain's safe head
 * (not the unsafe tip: review finding 7). Logs are read in pages of `chunk` blocks from `fromBlock`
 * (the log's deploy block), since public RPCs cap getLogs ranges.
 */
export async function verifyLog(client: PublicClient, log: Address, registry: Address, rulesets: Map<Hex, LoadedRuleset>, verdict: typeof verdictOf = verdictOf, opts: { fromBlock?: bigint; chunk?: bigint } = {}): Promise<Row[]> {
  const chainId = BigInt(await client.getChainId());
  const head = await client.getBlock({ blockTag: 'safe' }).then((b) => b.number!).catch(() => client.getBlockNumber());
  const chunk = opts.chunk ?? 5_000n;
  const page = async <E extends typeof MATCH_STARTED | typeof MATCH_RECORDED | typeof MATCH_FORFEITED>(event: E) => {
    const out = [];
    for (let from = opts.fromBlock ?? 0n; from <= head; from += chunk) {
      const to = from + chunk - 1n < head ? from + chunk - 1n : head;
      out.push(...(await client.getLogs({ address: log, event, fromBlock: from, toBlock: to })));
    }
    return out;
  };
  const started = await page(MATCH_STARTED), recorded = await page(MATCH_RECORDED), forfeited = await page(MATCH_FORFEITED);
  const key = (p: Address, n: bigint) => `${p.toLowerCase()}#${n}`;
  const byKey = new Map<string, MatchEvents>();
  for (const e of started) {
    const a = e.args;
    byKey.set(key(a.player!, a.n!), { player: a.player!, n: a.n!, rulesetId: a.rulesetId!, level: a.level!, seedBlock: a.seedBlock!, deadline: a.deadline! });
  }
  const known = new Map<Hex, boolean>();
  for (const id of new Set(started.map((e) => e.args.rulesetId!))) known.set(id, await client.readContract({ address: registry, abi: [IS_ADDED], functionName: 'isAdded', args: [id] }));
  // Seed block hashes, from the headers: the blocks start() named, and any block a record's bytes name.
  const blocks = new Set<bigint>(started.map((e) => e.args.seedBlock!));
  for (const e of recorded) { const d = e.args.data!; if (/^0x([0-9a-fA-F]{2}){77,}/.test(d)) blocks.add(BigInt('0x' + d.slice(2 + 138, 2 + 154))); }
  const hashes = new Map<bigint, Hex>();
  for (const b of blocks) if (b <= head) hashes.set(b, (await client.getBlock({ blockNumber: b })).hash);
  for (const e of recorded) {
    const a = e.args, m = byKey.get(key(a.player!, a.n!));
    const storedHash = await client.readContract({ address: log, abi: [MATCH_HASH], functionName: 'matchHash', args: [a.player!, a.n!] });
    const rec = { chainId, matchLog: log, player: a.player!, rulesetId: a.rulesetId!, n: a.n!, data: a.data!, storedHash, blockHash: (b: bigint) => hashes.get(b) };
    if (m) m.recorded = rec;
    else byKey.set(key(a.player!, a.n!), { player: a.player!, n: a.n!, rulesetId: a.rulesetId!, level: -1, seedBlock: -1n, deadline: -1n, recorded: rec });
  }
  for (const e of forfeited) { const m = byKey.get(key(e.args.player!, e.args.n!)); if (m) m.forfeited = true; }
  return [...byKey.values()].map((m) => { const v = verdict(m, head, (id) => known.get(id) === true, rulesets); return { player: m.player, n: m.n, rulesetId: m.rulesetId, verdict: v, outcome: outcomeOf(v) }; });
}

if (process.argv[1]?.endsWith('minpentai-verify.ts')) {
  const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  void (async () => {
    const rpc = arg('rpc'), log = arg('log') as Address, registry = arg('registry') as Address, from = arg('from');
    if (!rpc || !log || !registry) throw new Error('usage: --rpc URL --log ADDRESS --registry ADDRESS [--from DEPLOY_BLOCK] [--json]');
    const { rulesets, errors } = await loadRulesets('docs/minpentai/rulesets');
    for (const e of errors) console.error(`ruleset ${e.file}${e.id ? ` (${e.id})` : ''} not loaded: ${e.error}`);
    const rows = await verifyLog(createPublicClient({ transport: http(rpc) }), log, registry, rulesets, verdictOf, { fromBlock: from ? BigInt(from) : undefined });
    if (process.argv.includes('--json')) console.log(JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    else for (const r of rows) { const v = r.verdict; console.log(`${r.player} #${r.n}  [${r.outcome}] ${v.status}${v.status === 'verified' ? ` (${v.claim}, step ${v.endStep})` : `${'code' in v ? `: ${v.code}` : ''}: ${v.reason}`}`); }
  })();
}
