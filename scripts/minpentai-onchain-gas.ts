/**
 * Onchain v1 spike: gas for MatchLog.record() on a local anvil (never a real chain). Starts anvil,
 * puts MatchLog's runtime code at the fixtures' address, records the six fixture matches (short,
 * median, long; each player's first and second) as their players, and prints each receipt's gasUsed.
 *
 *   npx tsx scripts/minpentai-onchain-gas.ts      (needs `forge build` in contracts/minpentai)
 */
import { withAnvil } from './lib-minpentai-anvil';
import { readFileSync } from 'node:fs';
import { createTestClient, createWalletClient, encodeFunctionData, http, publicActions, type Address, type Hex } from 'viem';
import { foundry } from 'viem/chains';

const fx = JSON.parse(readFileSync('contracts/minpentai/fixtures/onchain.json', 'utf8'));
const art = JSON.parse(readFileSync('contracts/minpentai/out/MatchLog.sol/MatchLog.json', 'utf8'));

if (process.argv[1]?.endsWith('minpentai-onchain-gas.ts')) {
  void withAnvil(BigInt(fx.chainId), async (url) => {
    const t = createTestClient({ chain: foundry, mode: 'anvil', transport: http(url) }).extend(publicActions);
    await t.setCode({ address: fx.matchLog, bytecode: art.deployedBytecode.object as Hex });
    const rows: string[] = [];
    for (const m of fx.matches as { label: string; player: Address; data: Hex; length: number }[]) {
      await t.impersonateAccount({ address: m.player });
      await t.setBalance({ address: m.player, value: 10n ** 18n });
      const w = createWalletClient({ chain: foundry, transport: http(url), account: m.player });
      const hash = await w.sendTransaction({ to: fx.matchLog, data: encodeFunctionData({ abi: art.abi, functionName: 'record', args: [m.data] }) });
      const r = await t.waitForTransactionReceipt({ hash });
      if (r.status !== 'success') throw new Error(`${m.label} reverted`);
      rows.push(`${m.label.padEnd(12)} ${String(m.length).padStart(4)} bytes  ${r.gasUsed} gas`);
    }
    console.log(rows.join('\n'));
  });
}
