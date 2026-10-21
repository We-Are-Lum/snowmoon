/**
 * Verify every recorded Minpentai match on a chain (onchain v1 spike): reads MatchRecorded events
 * from a MatchLog, checks each ruleset against a RulesetRegistry, and replays each match under the
 * engine its ruleset pins (docs/minpentai/rulesets/). Prints one line per match:
 * verified, invalid (with the reason) or unknown ruleset. Read-only.
 *
 *   npx tsx scripts/minpentai-verify.ts --rpc http://127.0.0.1:PORT --log 0x… --registry 0x… [--json]
 */
import { createPublicClient, http, parseAbiItem, type Address, type Hex, type PublicClient } from 'viem';
import { loadRulesets, verifyMatch, type LoadedRuleset, type RecordedMatch, type Verdict } from '../src/lib/minpentai/onchain/verify';

export const MATCH_RECORDED = parseAbiItem('event MatchRecorded(address indexed player, bytes32 indexed rulesetId, uint256 n, bytes data)');
const IS_ADDED = parseAbiItem('function isAdded(bytes32 id) view returns (bool)');

export interface Row { player: Address; n: bigint; rulesetId: Hex; tx: Hex; verdict: Verdict }

export async function verifyLog(client: PublicClient, log: Address, registry: Address, rulesets: Map<Hex, LoadedRuleset>): Promise<Row[]> {
  const chainId = BigInt(await client.getChainId());
  const events = await client.getLogs({ address: log, event: MATCH_RECORDED, fromBlock: 0n, toBlock: 'latest' });
  const known = new Map<Hex, boolean>();
  for (const id of new Set(events.map((e) => e.args.rulesetId!))) known.set(id, await client.readContract({ address: registry, abi: [IS_ADDED], functionName: 'isAdded', args: [id] }));
  return events.map((e) => {
    const rec: RecordedMatch = { chainId, matchLog: log, player: e.args.player!, rulesetId: e.args.rulesetId!, n: e.args.n!, data: e.args.data! };
    return { player: rec.player, n: rec.n, rulesetId: rec.rulesetId, tx: e.transactionHash!, verdict: verifyMatch(rec, (id) => known.get(id) === true, rulesets) };
  });
}

if (process.argv[1]?.endsWith('minpentai-verify.ts')) {
  const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  void (async () => {
    const rpc = arg('rpc'), log = arg('log') as Address, registry = arg('registry') as Address;
    if (!rpc || !log || !registry) throw new Error('usage: --rpc URL --log ADDRESS --registry ADDRESS [--json]');
    const rows = await verifyLog(createPublicClient({ transport: http(rpc) }), log, registry, await loadRulesets('docs/minpentai/rulesets'));
    if (process.argv.includes('--json')) console.log(JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    else for (const r of rows) console.log(`${r.player} #${r.n}  ${r.verdict.status}${r.verdict.status === 'verified' ? ` (${r.verdict.claim}, step ${r.verdict.endStep})` : `: ${r.verdict.code}: ${r.verdict.reason}`}`);
  })();
}
