/**
 * A fresh local anvil of our own (onchain v1 spike), on a free port, checked to be ours before use.
 * Never touches any other anvil (one may be running on 8547). Accounts are impersonated: no keys.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createTestClient, createWalletClient, http, publicActions, type Abi, type Address, type Hex } from 'viem';
import { foundry } from 'viem/chains';

const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); s.on('error', rej); });

export async function withAnvil<T>(chainId: bigint, f: (url: string) => Promise<T>): Promise<T> {
  const port = await freePort();
  const anvil = spawn('anvil', ['--port', String(port), '--chain-id', chainId.toString(), '--silent'], { stdio: 'ignore' });
  try {
    const url = `http://127.0.0.1:${port}`;
    let id: string | null = null;
    for (let i = 0; i < 100 && !id; i++) {
      try { id = ((await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })).json()) as { result: string }).result; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    if (id === null || BigInt(id) !== chainId || anvil.exitCode !== null) throw new Error(`not our anvil on port ${port} (chain ${id})`);
    return await f(url);
  } finally { anvil.kill(); }
}

export const artifact = (name: string) => JSON.parse(readFileSync(`contracts/minpentai/out/${name}.sol/${name}.json`, 'utf8')) as { abi: Abi; bytecode: { object: Hex }; deployedBytecode: { object: Hex } };

/** Clients for an impersonated account (funded), on our anvil. */
export async function as(url: string, account: Address) {
  const chain = { ...foundry, id: Number(BigInt(((await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })).json()) as { result: string }).result)) };
  const test = createTestClient({ chain, mode: 'anvil', transport: http(url) }).extend(publicActions);
  await test.impersonateAccount({ address: account });
  await test.setBalance({ address: account, value: 10n ** 20n });
  return { test, wallet: createWalletClient({ chain, transport: http(url), account }) };
}

/** Deploy a contract from an impersonated account; returns its address. */
export async function deploy(url: string, from: Address, name: string, args: unknown[] = []): Promise<Address> {
  const { test, wallet } = await as(url, from);
  const a = artifact(name);
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args, account: from, chain: wallet.chain });
  const r = await test.waitForTransactionReceipt({ hash });
  if (!r.contractAddress) throw new Error(`deploy ${name} failed`);
  return r.contractAddress;
}
