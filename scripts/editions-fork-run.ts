/**
 * Snowmoon Editions test pages against a local fork of Sepolia (handoff 18 Nov 2026, "Checks"). No key, nothing sent
 * to any network: anvil forks Sepolia, its accounts are impersonated, and the browser's wallet is a stand-in that hands
 * every request to this script (so the page itself still asks no outside service).
 *
 *   npx tsx scripts/editions-fork-run.ts --env          print the build's NEXT_PUBLIC_EDITIONS_* (fixed addresses)
 *   (build: export each of those variables, then next build; in zsh an unquoted $(…) is not split into words)
 *   npx tsx scripts/editions-fork-run.ts --shots=DIR     run every scenario, save screenshots to DIR
 *
 * Scenarios: mint 1; mint 10 (busy, with a returned cushion); a quiet exact mint that loses a race (clear message, the
 * retry works); sold out on the 5-piece edition; wrong network (one-tap switch); a wallet that can't receive the piece;
 * not enough ETH; rejected in the wallet; waiting for the block; no wallet; not open yet (an edition with a future
 * start); the Editions list with a countdown. Hold the shared heavy lock while this runs.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createPublicClient, createTestClient, createWalletClient, getContractAddress, http, parseEther, type Abi, type Hex } from 'viem';
import { startReaderImagesDb } from './fixtures/reader-images-db';

const ROOT = path.resolve(import.meta.dirname, '..');
const C = path.join(ROOT, 'contracts/snowmoon-editions');
const arg = (n: string) => process.argv.slice(2).find((a) => a.startsWith(`--${n}`))?.split('=').slice(1).join('=');

const DEPLOYER = '0xed17000000000000000000000000000000000d01' as const;
const CREATOR = '0xed17000000000000000000000000000000000c01' as const;
const PAYOUT = '0xed17000000000000000000000000000000000a01' as const;
const BUYER = '0xed17000000000000000000000000000000000b01' as const;
const RIVAL = '0xed17000000000000000000000000000000000b02' as const;
const POOR = '0xed17000000000000000000000000000000000b03' as const;
const NO_RECEIVER = '0xed17000000000000000000000000000000000b04' as const;
const COLLECTION = getContractAddress({ from: DEPLOYER, nonce: 0n });
const SELLER = getContractAddress({ from: DEPLOYER, nonce: 1n });
const ANVIL_PORT = 8548;
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;
// A sample opening time for the list's countdown: three days after the build, clearly a test value.
const NEXT_OPENING = new Date(Date.now() + 3 * 86400_000).toISOString();

if (arg('env') !== undefined && process.argv.includes('--env')) {
  console.log(`NEXT_PUBLIC_EDITIONS_COLLECTION=${COLLECTION} NEXT_PUBLIC_EDITIONS_SELLER=${SELLER} NEXT_PUBLIC_EDITIONS_NEXT_OPENING=${NEXT_OPENING}`);
  process.exit(0);
}

const artifact = (name: string) => {
  const j = JSON.parse(readFileSync(path.join(C, `out/${name}.sol/${name}.json`), 'utf8'));
  return { abi: j.abi as Abi, bytecode: j.bytecode.object as Hex };
};
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const results: { name: string; ok: boolean; detail?: string }[] = [];
const record = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

async function main() {
  const shots = arg('shots') ?? path.join(process.env.HOME ?? '/tmp', 'snowmoon-editions-screens');
  mkdirSync(shots, { recursive: true });
  const procs: ChildProcess[] = [];
  const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
  process.on('exit', stop);

  // 1. anvil, forking Sepolia, every address impersonated.
  const anvil = spawn('anvil', ['--fork-url', process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com', '--port', String(ANVIL_PORT), '--auto-impersonate', '--silent'], { stdio: 'ignore' });
  procs.push(anvil);
  const pub = createPublicClient({ transport: http(RPC) });
  for (let i = 0; ; i++) {
    if (await pub.getChainId().then(() => true, () => false)) break;
    if (i > 240) throw new Error("anvil did not start");
    await wait(500);
  }
  const test = createTestClient({ mode: 'anvil', transport: http(RPC) });
  const wallet = createWalletClient({ transport: http(RPC) });
  for (const a of [DEPLOYER, CREATOR, BUYER, RIVAL, NO_RECEIVER]) await test.setBalance({ address: a, value: parseEther('10') });
  await test.setBalance({ address: POOR, value: parseEther('0.000001') });
  // A wallet whose account has code without ERC-1155 receiver hooks (a contract that only takes ETH).
  await test.setCode({ address: NO_RECEIVER, bytecode: '0x00' });
  if ((await pub.getTransactionCount({ address: DEPLOYER })) !== 0) throw new Error('the fixed deployer already has transactions on this fork');
  record('fork: chain id is Sepolia', (await pub.getChainId()) === 11155111);

  // 2. Deploy both contracts and create the two test editions (as DEPLOY.md does, by impersonation instead of signing).
  const ed = artifact('SnowmoonEditions');
  const ls = artifact('LadderSeller');
  const send = async (h: Promise<Hex>) => {
    const r = await pub.waitForTransactionReceipt({ hash: await h });
    if (r.status !== 'success') throw new Error(`transaction ${r.transactionHash} reverted`);
    return r;
  };
  await send(wallet.deployContract({ account: DEPLOYER, chain: null, abi: ed.abi, bytecode: ed.bytecode, args: [CREATOR, 'ipfs://test-collection'] }));
  await send(wallet.deployContract({ account: DEPLOYER, chain: null, abi: ls.abi, bytecode: ls.bytecode, args: [COLLECTION] }));
  const data = (start: bigint, top: bigint, startTime = 0n) => `0x${[start, top, startTime].map((v) => v.toString(16).padStart(64, '0')).join('')}` as Hex;
  const create = (uri: string, size: number, start: bigint, top: bigint, startTime = 0n) =>
    send(wallet.writeContract({ account: CREATOR, chain: null, address: COLLECTION, abi: ed.abi, functionName: 'createEdition', args: [uri, BigInt(size), SELLER, PAYOUT, data(start, top, startTime)] }));
  await create('ipfs://test-edition-1', 256, 2_000_000_000_000n, 2_000_000_000_000_000n);
  await create('ipfs://test-edition-2', 5, 100_000_000_000_000n, 1_000_000_000_000_000n);
  const name = await pub.readContract({ address: COLLECTION, abi: ed.abi, functionName: 'name' });
  const symbol = await pub.readContract({ address: COLLECTION, abi: ed.abi, functionName: 'symbol' });
  record('fork: collection deployed as "Snowmoon Editions" / SNOWMOON', name === 'Snowmoon Editions' && symbol === 'SNOWMOON', `${name} / ${symbol}`);
  const rivalMint = async (id: number, q: number) => {
    const cost = (await pub.readContract({ address: SELLER, abi: ls.abi, functionName: 'quote', args: [BigInt(id), BigInt(q)] })) as bigint;
    await send(wallet.writeContract({ account: RIVAL, chain: null, address: SELLER, abi: ls.abi, functionName: 'mint', args: [BigInt(id), BigInt(q), RIVAL], value: cost }));
  };
  const quiet = async () => {
    await test.increaseTime({ seconds: 240 });
    await test.mine({ blocks: 1 });
  };

  // 3. The site: this checkout's build, reading the fork, with the readers' fixture database (never .env.local).
  const db = await startReaderImagesDb(await freePort());
  const port = await freePort();
  const server = spawn(process.execPath, [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], {
    cwd: ROOT,
    // The server reads these at run time (the browser's copy was inlined at build).
    env: { ...process.env, STUDIO_DATABASE_URL: db.url, EDITIONS_RPC_URL: RPC, NEXT_PUBLIC_EDITIONS_COLLECTION: COLLECTION, NEXT_PUBLIC_EDITIONS_SELLER: SELLER, NEXT_PUBLIC_EDITIONS_NEXT_OPENING: process.env.NEXT_PUBLIC_EDITIONS_NEXT_OPENING ?? NEXT_OPENING },
    stdio: 'ignore',
  });
  procs.push(server);
  const BASE = `http://localhost:${port}`;
  for (let i = 0; ; i++) {
    if (await fetch(`${BASE}/editions`).then((r) => r.ok, () => false)) break;
    if (i > 120) throw new Error('the local build did not start (build first with --env)');
    await wait(500);
  }

  // 4. The browser and the stand-in wallet.
  const browser: Browser = await chromium.launch({ channel: 'chrome' });
  type W = { account: string; chainId: number; connected: boolean; reject?: boolean; beforeSend?: () => Promise<void>; holdBlocks?: boolean };
  const open = async (url: string, w: W | null, view: { width: number; height: number; dark?: boolean }) => {
    const page = await browser.newPage({ viewport: { width: view.width, height: view.height }, colorScheme: view.dark ? 'dark' : 'light', deviceScaleFactor: 1 });
    await page.addInitScript('window.__name = (f) => f');
    await page.addInitScript(`try{localStorage.setItem('snowmoon.theme','${view.dark ? 'dark' : 'light'}')}catch(e){}`);
    // Nothing leaves the machine: anything not on localhost is refused (the page must not need it).
    const outside: string[] = [];
    await page.route((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u.href) && !u.href.startsWith('data:') && !u.href.startsWith('blob:') && !u.href.startsWith('https://media.snowmoon.party/'), (r) => (outside.push(r.request().url()), r.abort()));
    if (w) {
      const state = { ...w };
      await page.exposeFunction('__walletRpc', async (method: string, params: unknown[]) => {
        if (method === 'eth_requestAccounts') {
          state.connected = true;
          return { result: [state.account] };
        }
        if (method === 'eth_accounts') return { result: state.connected ? [state.account] : [] };
        if (method === 'eth_chainId') return { result: `0x${state.chainId.toString(16)}` };
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
          state.chainId = 11155111;
          await page.evaluate(() => (window as unknown as { __emit: (e: string, v: unknown) => void }).__emit('chainChanged', '0xaa36a7'));
          return { result: null };
        }
        if (method === 'eth_sendTransaction') {
          if (state.reject) return { error: { code: 4001, message: 'User rejected the request.' } };
          await state.beforeSend?.();
          if (state.holdBlocks) await test.setAutomine(false);
        }
        const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((r) => r.json());
        // As a wallet answers: the JSON-RPC error with its code and revert data (an exposed function can't throw them).
        if (res.error) return { error: res.error };
        return { result: res.result };
      });
      await page.addInitScript(() => {
        const listeners: Record<string, ((v: unknown) => void)[]> = {};
        const call = (window as unknown as { __walletRpc: (m: string, p: unknown[]) => Promise<unknown> }).__walletRpc;
        (window as unknown as { __emit: (e: string, v: unknown) => void }).__emit = (e, v) => (listeners[e] ?? []).forEach((f) => f(v));
        (window as unknown as { ethereum: unknown }).ethereum = {
          isStandIn: true,
          request: async ({ method, params }: { method: string; params?: unknown[] }) => {
            const out = (await call(method, params ?? [])) as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
            if (out.error) throw Object.assign(new Error(out.error.message), { code: out.error.code, data: out.error.data });
            return out.result;
          },
          on: (e: string, f: (v: unknown) => void) => ((listeners[e] ??= []).push(f)),
          removeListener: (e: string, f: (v: unknown) => void) => (listeners[e] = (listeners[e] ?? []).filter((x) => x !== f)),
        };
      });
    }
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    return { page, outside };
  };
  const phone = { width: 390, height: 844 };
  const desk = { width: 1440, height: 900 };
  const shot = async (page: Page, name: string, full = true) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: full });
  const both = async (url: string, name: string, w: W | null = null) => {
    for (const [v, tag] of [[phone, 'phone'], [desk, 'desktop']] as const)
      for (const dark of [false, true]) {
        const { page, outside } = await open(url, w ? { ...w } : null, { ...v, dark });
        if (w?.connected) await page.waitForSelector('[data-mint], .ed-card-title', { timeout: 15_000 }).catch(() => {});
        await shot(page, `${name}-${tag}-${dark ? 'dark' : 'light'}`);
        if (outside.length) record(`${name}: no outside requests`, false, outside.join(' '));
        await page.close();
      }
  };
  const mintVia = async (page: Page, q = 1) => {
    for (let i = 1; i < q; i++) await page.click('[aria-label="One more"]');
    await page.click('[data-mint]');
  };
  const ready = { account: BUYER, chainId: 11155111, connected: true };

  // The list, and an edition before anyone mints (no wallet; then not connected).
  await both('/editions', 'list');
  await both('/editions/1', 'edition-no-wallet');
  await both('/editions/1', 'edition-connect', { account: BUYER, chainId: 11155111, connected: false });

  // Wrong network, then one tap to Sepolia.
  {
    const { page } = await open('/editions/1', { account: BUYER, chainId: 1, connected: true }, phone);
    await page.waitForSelector('[data-switch]');
    await shot(page, 'state-wrong-network-phone-light', false);
    await page.click('[data-switch]');
    const ok = await page.waitForSelector('[data-mint]', { timeout: 10_000 }).then(() => true, () => false);
    record('wrong network: one tap switches to Sepolia, then the mint button shows', ok);
    await page.close();
  }

  // Mint 1, quiet: exactly the price, no returned line.
  {
    const { page } = await open('/editions/1', ready, phone);
    await page.waitForSelector('[data-mint]');
    await shot(page, 'edition-ready-phone-light');
    const price = await page.getAttribute('[data-total]', 'data-total');
    const busyNote = await page.$('.ed-busy');
    record('quiet: no cushion note before the first mint', busyNote === null);
    await mintVia(page, 1);
    await page.waitForURL(/\/minted\//, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    const paid = await page.getAttribute('[data-paid]', 'data-paid');
    const back = await page.$('[data-returned]');
    record('mint 1 (quiet): paid exactly the quote, no returned line', paid === price && back === null, `paid ${paid}, quoted ${price}`);
    record('mint 1: "Piece 1 is yours"', (await page.textContent('h1'))?.includes('Piece 1 is yours') ?? false, (await page.textContent('h1')) ?? '');
    await both(new URL(page.url()).pathname, 'after-mint-quiet');
    await page.close();
  }

  // Mint 10 right after a rival's: busy. The cushion is said before confirming, sent, and the difference shown as
  // returned. The rival buys 50 first: the test ladder's first ~15 pieces all cost 0.000002 ETH (the 0.000001 step),
  // where a cushion 3 pieces up costs the same and the page rightly says nothing.
  {
    for (let i = 0; i < 5; i++) await rivalMint(1, 10);
    const { page } = await open('/editions/1', ready, phone);
    await page.waitForSelector('[data-mint]');
    for (let i = 1; i < 10; i++) await page.click('[aria-label="One more"]');
    const note = await page.waitForSelector('.ed-busy', { timeout: 15_000 }).then(() => true, () => false);
    record('busy: the cushion note shows before confirming', note);
    await shot(page, 'state-busy-phone-light', false);
    await both('/editions/1', 'edition-busy', ready);
    const quote = BigInt((await page.getAttribute('[data-total]', 'data-total')) ?? '0');
    const cushion = BigInt((await page.getAttribute('[data-cushion]', 'data-cushion')) ?? '0');
    await page.click('[data-mint]');
    await page.waitForURL(/\/minted\//, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    const paid = BigInt((await page.getAttribute('[data-paid]', 'data-paid')) ?? '0');
    const back = BigInt((await page.getAttribute('[data-returned]', 'data-returned').catch(() => null)) ?? '0');
    record('mint 10 (busy): sent the cushion, paid the quote, the rest came back', cushion > quote && paid === quote && back === cushion - quote, `quote ${quote}, cushion ${cushion}, paid ${paid}, back ${back}`);
    record('mint 10: "Pieces 52–61 are yours"', (await page.textContent('h1'))?.includes('Pieces 52–61 are yours') ?? false, (await page.textContent('h1')) ?? '');
    await both(new URL(page.url()).pathname, 'after-mint-busy');
    await page.close();
  }

  // A quiet exact mint that loses a race: a rival mints between the price read and the send.
  {
    await quiet();
    let raced = false;
    const w: W = { ...ready, beforeSend: async () => { if (!raced) { raced = true; await rivalMint(1, 3); } } };
    const { page } = await open('/editions/1', w, phone);
    await page.waitForSelector('[data-mint]');
    record('quiet again after 4 minutes: no cushion note', (await page.$('.ed-busy')) === null);
    await mintVia(page, 1);
    const moved = await page.waitForSelector('[data-problem="price-moved"]', { timeout: 20_000 }).then(() => true, () => false);
    record('race lost: says the price moved, plainly', moved, (await page.textContent('.ed-card').catch(() => '')) ?? '');
    await shot(page, 'state-price-moved-phone-light', false);
    await page.click('[data-mint]'); // "Try again at …" (now busy: the page may show the cushion first)
    if (await page.$('.ed-busy')) await page.click('[data-mint]').catch(() => {});
    const retried = await page.waitForURL(/\/minted\//, { timeout: 30_000 }).then(() => true, () => false);
    record('race lost: the retry works', retried);
    await page.close();
  }

  // Not enough ETH, a wallet that can't hold the piece, rejected in the wallet.
  {
    await quiet();
    const { page } = await open('/editions/1', { account: POOR, chainId: 11155111, connected: true }, phone);
    const ok = await page.waitForSelector('[data-state="not-enough"]', { timeout: 15_000 }).then(() => true, () => false);
    record('not enough ETH: says so, with the faucet link', ok && (await page.$(`a[href^="https://sepolia-faucet"]`)) !== null);
    await shot(page, 'state-not-enough-phone-light', false);
    await page.close();
  }
  {
    const { page } = await open('/editions/1', { account: NO_RECEIVER, chainId: 11155111, connected: true }, phone);
    await page.waitForSelector('[data-mint]');
    await mintVia(page, 1);
    const ok = await page.waitForSelector('[data-problem="cannot-receive"]', { timeout: 20_000 }).then(() => true, () => false);
    record('a wallet that cannot receive: plain words, no raw error', ok && !/0x[0-9a-f]{8}|revert|ERC1155/i.test((await page.textContent('[role="alert"]')) ?? ''));
    await shot(page, 'state-cannot-receive-phone-light', false);
    await page.close();
  }
  {
    const { page } = await open('/editions/1', { ...ready, reject: true }, phone);
    await page.waitForSelector('[data-mint]');
    await mintVia(page, 1);
    const ok = await page.waitForSelector('[data-problem="rejected"]', { timeout: 20_000 }).then(() => true, () => false);
    record('rejected in the wallet: "You cancelled…"', ok);
    await shot(page, 'state-rejected-phone-light', false);
    await page.close();
  }
  // Waiting for the block.
  {
    const { page } = await open('/editions/1', { ...ready, holdBlocks: true }, phone);
    await page.waitForSelector('[data-mint]');
    await mintVia(page, 1);
    const ok = await page.waitForSelector('[data-state="waiting"]', { timeout: 20_000 }).then(() => true, () => false);
    record('waiting: shows the transaction while it confirms', ok);
    await shot(page, 'state-waiting-phone-light', false);
    await test.mine({ blocks: 1 });
    await test.setAutomine(true);
    record('waiting: then lands on the after-mint page', await page.waitForURL(/\/minted\//, { timeout: 30_000 }).then(() => true, () => false));
    await page.close();
  }

  // Sold out on the 5-piece edition (video).
  {
    await quiet();
    const { page } = await open('/editions/2', ready, phone);
    await page.waitForSelector('[data-mint]');
    await shot(page, 'edition2-video-phone-light');
    await mintVia(page, 5);
    if (await page.$('.ed-busy')) await page.click('[data-mint]').catch(() => {});
    await page.waitForURL(/\/minted\//, { timeout: 30_000 });
    await page.goto(`${BASE}/editions/2`, { waitUntil: 'networkidle' });
    const sold = (await page.getAttribute('.ed-card', 'data-state')) === 'sold-out';
    record('sold out: the 5-piece edition says so, with no mint button', sold && (await page.$('[data-mint]')) === null);
    await page.close();
    await both('/editions/2', 'edition2-sold-out', ready);
  }

  // Not open yet: 31 days later a third edition with a start two days ahead (the contract's countdown source).
  {
    await test.increaseTime({ seconds: 31 * 86400 });
    await test.mine({ blocks: 1 });
    const now = (await pub.getBlock()).timestamp;
    await create('ipfs://test-edition-3', 10, 100_000_000_000_000n, 1_000_000_000_000_000n, now + 2n * 86400n);
    const { page } = await open('/editions/3', ready, phone);
    await page.waitForSelector('.ed-card');
    const ok = (await page.getAttribute('.ed-card', 'data-state')) === 'not-open' && (await page.isDisabled('[data-mint]'));
    record('not open yet: says so with the countdown, the button is off', ok);
    await shot(page, 'state-not-open-phone-light');
    await page.close();
    await both('/editions', 'list-after');
  }

  await browser.close();
  await db.stop();
  stop();
  const failed = results.filter((r) => !r.ok);
  console.log(`\neditions fork run: ${results.length - failed.length} passed, ${failed.length} failed; screenshots in ${shots}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
