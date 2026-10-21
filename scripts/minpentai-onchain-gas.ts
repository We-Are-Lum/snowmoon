/**
 * Onchain v1 spike, commit before play: gas for MatchLog.start() and record() on a local anvil
 * running Prague (the real EIP-2935 history contract; never a real chain). Deploys MatchLog; three
 * players (short, median, long) each play two matches: start(), mine to the seed block, read its
 * hash, play from that seed (trying every level and resign point, keeping the shortest, median or
 * longest encoding), record(). Prints each transaction's gasUsed and returns them for the cost script.
 *
 *   npx tsx scripts/minpentai-onchain-gas.ts      (needs `forge build` in contracts/minpentai)
 */
import { readFileSync } from 'node:fs';
import { decodeEventLog, encodeFunctionData, type Address, type Hex } from 'viem';
import { as, artifact, deploy, withAnvil } from './lib-minpentai-anvil';
import { MATCH_STARTED } from './minpentai-verify';
import { encode, fromReplay, toHex } from '../src/lib/minpentai/onchain/encoding';
import { engineSeed, replaySolo } from '../src/lib/minpentai/onchain/replay';
import { rulesetId } from '../src/lib/minpentai/onchain/ruleset';
import { sampleMatch } from '../src/lib/minpentai/onchain/sample';
import { deriveSeed } from '../src/lib/minpentai/onchain/seed';

const ID = rulesetId(JSON.parse(readFileSync('docs/minpentai/rulesets/solo-v1.json', 'utf8'))) as Hex;
export interface GasRow { label: string; bytes: number; start: bigint; record: bigint; data: Hex }

export async function measureGas(): Promise<GasRow[]> {
  return withAnvil(31337n, async (url) => {
    const log = await deploy(url, '0x000000000000000000000000000000000000de91', 'MatchLog');
    const ml = artifact('MatchLog');
    const rows: GasRow[] = [];
    for (const [i, which] of (['short', 'median', 'long'] as const).entries()) {
      const player = `0x${(0xb000 + i).toString(16).padStart(40, '0')}` as Address;
      const { test, wallet } = await as(url, player);
      const send = async (data: Hex) => { const r = await test.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to: log, data, account: player, chain: wallet.chain }) }); if (r.status !== 'success') throw new Error('reverted'); return r; };
      for (let k = 0; k < 2; k++) {
        // The level is fixed before the seed is known; gas doesn't depend on it. Length comes from the resign point.
        const level = 3;
        const s = await send(encodeFunctionData({ abi: ml.abi, functionName: 'start', args: [ID, level] }));
        const ev = s.logs.map((l) => { try { return decodeEventLog({ abi: [MATCH_STARTED], data: l.data, topics: l.topics }); } catch { return null; } }).find((x) => x)!;
        const { n, seedBlock } = ev.args as { n: bigint; seedBlock: bigint };
        await test.mine({ blocks: 2 });
        const seed = deriveSeed({ chainId: 31337n, matchLog: log, player, n, rulesetId: ID, level, seedBlockHash: (await test.getBlock({ blockNumber: seedBlock })).hash });
        const cands = [undefined, 0, 1, 2, 3, 4, 6].map((resign) => { const solo = sampleMatch(engineSeed(seed), level, resign); return toHex(encode(fromReplay(ID, Number(n), seed, seedBlock, solo, replaySolo(solo)))) as Hex; }).sort((a, b) => a.length - b.length);
        const data = which === 'short' ? cands[0] : which === 'long' ? cands[cands.length - 1] : cands[cands.length >> 1];
        const r = await send(encodeFunctionData({ abi: ml.abi, functionName: 'record', args: [data] }));
        rows.push({ label: `${which} ${k === 0 ? 'first' : 'later'}`, bytes: (data.length - 2) / 2, start: s.gasUsed, record: r.gasUsed, data });
      }
    }
    return rows;
  });
}

if (process.argv[1]?.endsWith('minpentai-onchain-gas.ts')) {
  void measureGas().then((rows) => {
    for (const r of rows) console.log(`${r.label.padEnd(14)} ${String(r.bytes).padStart(4)} bytes  start ${r.start}  record ${r.record}  total ${r.start + r.record} gas`);
  });
}
