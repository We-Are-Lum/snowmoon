/**
 * Onchain v1 spike: gas for MatchLog.record() on a local anvil (never a real chain). Starts anvil,
 * puts MatchLog's runtime code at the fixtures' address, records the six fixture matches (short,
 * median, long; each player's first and second) as their players, and prints each receipt's gasUsed.
 *
 *   npx tsx scripts/minpentai-onchain-gas.ts      (needs `forge build` in contracts/minpentai)
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { createTestClient, createWalletClient, encodeFunctionData, http, publicActions, type Address, type Hex } from 'viem';
import { foundry } from 'viem/chains';

const fx = JSON.parse(readFileSync('contracts/minpentai/fixtures/onchain.json', 'utf8'));
const art = JSON.parse(readFileSync('contracts/minpentai/out/MatchLog.sol/MatchLog.json', 'utf8'));

/** A free local port (another anvil may already be running on the usual ones; never touch it). */
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); s.on('error', rej); });

/** A fresh local anvil of our own on a free port, refusing to run against anything else. */
export async function withAnvil<T>(f: (url: string) => Promise<T>): Promise<T> {
  const port = await freePort();
  const anvil = spawn('anvil', ['--port', String(port), '--chain-id', fx.chainId, '--silent'], { stdio: 'ignore' });
  try {
    const url = `http://127.0.0.1:${port}`;
    let id: string | null = null;
    for (let i = 0; i < 100 && !id; i++) {
      try { id = ((await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })).json()) as { result: string }).result; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    if (id === null || BigInt(id) !== BigInt(fx.chainId) || anvil.exitCode !== null) throw new Error(`not our anvil on port ${port} (chain ${id})`);
    return await f(url);
  } finally { anvil.kill(); }
}

if (process.argv[1]?.endsWith('minpentai-onchain-gas.ts')) {
  void withAnvil(async (url) => {
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
