/**
 * Onchain v1 spike: what a match would cost on Base mainnet, commit before play (start() + record()). Read-only: eth_call
 * and block reads against Base's public RPC (https://mainnet.base.org); no key, no transaction.
 *
 * Cost = L2 execution (gasUsed x (base fee + priority fee)) + the L1 data fee (GasPriceOracle
 * 0x4200...000F getL1Fee(the signed-size transaction), Fjord/Ecotone formula, read at each block)
 * + the operator fee (getOperatorFee; 0 on Base today), for both transactions. gasUsed is measured
 * here on a fresh local Prague anvil (scripts/minpentai-onchain-gas.ts: short, median and long
 * matches, a player's first and later). USD from Chainlink's ETH / USD feed on Base, at each block.
 *
 * Sampled at 15 blocks over the last 7 days (every 12 hours); priority fee from eth_feeHistory over
 * the last 1024 blocks (10th, 50th, 90th percentile). Low = cheapest sample with the 10th
 * percentile tip; typical = median sample with the median tip; high = dearest sample with the 90th.
 *
 *   npx tsx scripts/minpentai-onchain-base-cost.ts   (writes docs/proposals/data/minpentai-commit-before-play-cost.json)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, encodeFunctionData, http, parseAbi, serializeTransaction, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { artifact } from './lib-minpentai-anvil';
import { measureGas } from './minpentai-onchain-gas';

const RPC = 'https://mainnet.base.org';
const GPO: Address = '0x420000000000000000000000000000000000000F';
const ETH_USD: Address = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';
const gpo = parseAbi(['function getL1Fee(bytes) view returns (uint256)', 'function getOperatorFee(uint256) view returns (uint256)', 'function l1BaseFee() view returns (uint256)', 'function blobBaseFee() view returns (uint256)']);
const feed = parseAbi(['function description() view returns (string)', 'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)']);

const median = <T>(a: T[], key: (x: T) => number) => [...a].sort((x, y) => key(x) - key(y))[a.length >> 1];

async function main() {
  const gas = await measureGas();
  const c = createPublicClient({ chain: base, transport: http(RPC) });
  if ((await c.getChainId()) !== 8453) throw new Error('not Base mainnet');
  if ((await c.readContract({ address: ETH_USD, abi: feed, functionName: 'description' })) !== 'ETH / USD') throw new Error('not the ETH / USD feed');
  const head = await c.getBlockNumber();
  const hist = await c.getFeeHistory({ blockCount: 1024, rewardPercentiles: [10, 50, 90], blockTag: 'latest' });
  const tips = [0, 1, 2].map((i) => median(hist.reward!.map((r) => r[i]), (x) => Number(x)));
  // A realistic record() transaction per match: Base's chain ID, a MatchLog-like address, a plausible nonce and fees.
  // Realistic transactions per match: start() and record(), Base's chain ID, a MatchLog-like address, plausible nonce and fees.
  const abi = artifact('MatchLog').abi;
  const tx = (data: Hex) => serializeTransaction({ chainId: 8453, type: 'eip1559', to: '0x8f3a1c2b9e4d5a6f7b8c9d0e1f2a3b4c5d6e7f80', nonce: 42, gas: 120_000n, maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 1_000_000n, data });
  const startTx = tx(encodeFunctionData({ abi, functionName: 'start', args: ['0x99afca1f74da319bc2ead8c1b501833b7d15efa5022cd5b4566314068c371a6f', 3] }));
  const total = (label: string) => { const g = gas.find((r) => r.label === label)!; return g.start + g.record; };
  const samples: { block: string; time: string; baseFee: string; l1BaseFee: string; blobBaseFee: string; ethUsd: number; l1Fee: Record<string, string>; operatorFee: Record<string, string> }[] = [];
  for (let i = 0; i < 15; i++) {
    const blockNumber = head - BigInt(i) * 21_600n; // 12 hours of 2-second blocks
    const b = await c.getBlock({ blockNumber });
    const [, answer] = await c.readContract({ address: ETH_USD, abi: feed, functionName: 'latestRoundData', blockNumber });
    const l1Fee: Record<string, string> = {}, operatorFee: Record<string, string> = {};
    const startL1 = await c.readContract({ address: GPO, abi: gpo, functionName: 'getL1Fee', args: [startTx], blockNumber });
    for (const m of gas) {
      const recordL1 = await c.readContract({ address: GPO, abi: gpo, functionName: 'getL1Fee', args: [tx(encodeFunctionData({ abi, functionName: 'record', args: [m.data] }))], blockNumber });
      l1Fee[m.label] = (startL1 + recordL1).toString();
      const op = async (g: bigint) => c.readContract({ address: GPO, abi: gpo, functionName: 'getOperatorFee', args: [g], blockNumber }).catch(() => 0n);
      operatorFee[m.label] = ((await op(m.start)) + (await op(m.record))).toString();
    }
    samples.push({
      block: blockNumber.toString(), time: new Date(Number(b.timestamp) * 1000).toISOString(), baseFee: b.baseFeePerGas!.toString(),
      l1BaseFee: (await c.readContract({ address: GPO, abi: gpo, functionName: 'l1BaseFee', blockNumber })).toString(),
      blobBaseFee: (await c.readContract({ address: GPO, abi: gpo, functionName: 'blobBaseFee', blockNumber })).toString(),
      ethUsd: Number(answer) / 1e8, l1Fee, operatorFee,
    });
  }
  const costOf = (s: (typeof samples)[number], label: string, tip: bigint) => (BigInt(s.baseFee) + tip) * total(label) + BigInt(s.l1Fee[label]) + BigInt(s.operatorFee[label]);
  const rows = gas.map((m) => {
    const byWei = [...samples].sort((a, b) => Number(costOf(a, m.label, 0n) - costOf(b, m.label, 0n)));
    const low = byWei[0], typ = byWei[byWei.length >> 1], high = byWei[byWei.length - 1];
    const now = samples[0];
    const usd = (s: (typeof samples)[number], wei: bigint) => (Number(wei) / 1e18) * s.ethUsd;
    const part = (s: (typeof samples)[number], tip: bigint) => ({ l2Wei: ((BigInt(s.baseFee) + tip) * total(m.label)).toString(), l1Wei: s.l1Fee[m.label], totalWei: costOf(s, m.label, tip).toString(), usd: usd(s, costOf(s, m.label, tip)) });
    return { label: m.label, bytes: m.bytes, startGas: m.start.toString(), recordGas: m.record.toString(), gasUsed: total(m.label).toString(), now: part(now, tips[1]), low: { ...part(low, tips[0]), at: low.time }, typical: { ...part(typ, tips[1]), at: typ.time }, high: { ...part(high, tips[2]), at: high.time } };
  });
  const out = {
    measured: new Date().toISOString(),
    sources: {
      rpc: RPC, gasPriceOracle: GPO, ethUsdFeed: `${ETH_USD} (Chainlink ETH / USD on Base, read at each sampled block)`,
      l2: 'block baseFeePerGas at each sample; priority fee: eth_feeHistory over the last 1024 blocks, 10th/50th/90th percentile',
      l1: 'GasPriceOracle.getL1Fee(serialized EIP-1559 record() transaction) at each sampled block',
      gasUsed: 'record() receipts on a fresh local anvil (the same EVM gas as Base)',
    },
    head: head.toString(), tipsWei: tips.map(String), samples, rows,
  };
  mkdirSync('docs/proposals/data', { recursive: true });
  writeFileSync('docs/proposals/data/minpentai-commit-before-play-cost.json', JSON.stringify(out, null, 2) + '\n');
  const f = (u: number) => (u < 0.01 ? `$${u.toFixed(5)}` : `$${u.toFixed(4)}`);
  const eth = (w: string) => `${(Number(w) / 1e18).toExponential(2)} ETH`;
  console.log(`Base mainnet, ${out.measured}; head ${head}; ETH/USD now ${samples[0].ethUsd}; tips p10/p50/p90 ${tips.join('/')} wei`);
  console.log('| match | bytes | gas | now (L2 + L1 = total) | low | typical | high |');
  for (const r of rows) console.log(`| ${r.label} | ${r.bytes} | ${r.gasUsed} | ${eth(r.now.l2Wei)} + ${eth(r.now.l1Wei)} = ${eth(r.now.totalWei)}, ${f(r.now.usd)} | ${f(r.low.usd)} | ${f(r.typical.usd)} | ${f(r.high.usd)} |`);
}
void main().catch((e) => { console.error(e); process.exit(1); });
