/**
 * "Support this site" (owner, 2026-10-30: "Keep it in one constant, checksummed, and test that every place shows exactly
 * that constant"; the page simplified the same day). Static checks over the code, then the balance rules run against a
 * stand-in wallet; check:ui checks the served page (the text, the copy button and the QR code against SUPPORT.address).
 *  S1  SUPPORT.address is checksummed (EIP-55): viem's getAddress returns it unchanged.
 *  S2  the address is written in exactly one place in src/ (config.ts), in any letter case; nowhere else.
 *  S3  every place that shows or uses it reads SUPPORT.address: the page (text and QR code), the copy button, and the
 *      send's recipient (ETH and USDC), and its balance estimate.
 *  S4  USDC is native USDC on each network (Circle's contracts), not the bridged USDbC.
 *  S5  the networks are exactly Base (8453) and Ethereum (1), as eth_getCode found on 2026-10-30.
 *  S6  nothing here records the sender: the page and the send code call no API of ours; the component asks only
 *      GET /api/eth-usd (the ETH price, with nothing about the reader), and that route takes no input.
 *  S7  the balance rules, against a stand-in wallet: ETH needs the amount plus the fee; USDC needs the USDC and ETH for
 *      the fee; each shortfall is named.
 *  S8  the send refuses while the wallet is on the other network.
 *  S9  the ETH estimate's price (owner, 2026-10-31): Chainlink's ETH/USD read on Base; no price when the feed is older
 *      than two hours, reads zero, or can't be read.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getAddress } from 'viem';
import { SUPPORT } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
let passed = 0;
const failed: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  ok ? passed++ : failed.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` (${detail})` : ''}`);
};
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|json|md|css)$/.test(f) ? [p] : []; });
const rel = (p: string) => path.relative(ROOT, p);
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

check('S1 SUPPORT.address is checksummed', getAddress(SUPPORT.address) === SUPPORT.address, `${SUPPORT.address} vs ${getAddress(SUPPORT.address)}`);

const bare = SUPPORT.address.slice(2).toLowerCase();
const holders = walk(path.join(ROOT, 'src')).filter((f) => readFileSync(f, 'utf8').toLowerCase().includes(bare)).map(rel);
check('S2 the address is written only in src/lib/config.ts', holders.length === 1 && holders[0] === 'src/lib/config.ts', holders.join(', '));

const page = read('src/app/support/page.tsx');
const comp = read('src/components/support.tsx');
const client = read('src/lib/wallet/client.ts');
const fnBody = (src: string, head: string) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i) + 2); };
const giveCode = fnBody(client, 'export async function give');
const fitsCode = fnBody(client, 'export async function giftFits');
check(
  'S3 the page (text and QR code), the copy button and the send all read SUPPORT.address',
  /QRCode\.toString\(SUPPORT\.address/.test(page) && /<SupportAddress address=\{SUPPORT\.address\}/.test(page) && /data-qr-of=\{SUPPORT\.address\}/.test(page) &&
    /data-copies=\{address\}/.test(comp) && /writeText\(address\)/.test(comp) &&
    /args: \[SUPPORT\.address, value\]/.test(giveCode) && /to: SUPPORT\.address, value/.test(giveCode) && /SUPPORT\.address/.test(fitsCode),
);
const nativeUsdc: Record<number, string> = { 8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' };
check('S4 USDC is native USDC on each network (checksummed), not USDbC', SUPPORT.networks.every((n) => n.usdc === nativeUsdc[n.chainId] && getAddress(n.usdc) === n.usdc) && !SUPPORT.networks.some((n) => n.usdc.toLowerCase() === '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca'));
check('S5 the networks are Base (8453) and Ethereum (1)', JSON.stringify(SUPPORT.networks.map((n) => [n.name, n.chainId])) === '[["Base",8453],["Ethereum",1]]');
const route = read('src/app/api/eth-usd/route.ts');
const compApi = [...comp.matchAll(/['"`](\/api\/[^'"`]*)['"`]/g)].map((m) => m[1]);
check(
  'S6 nothing records the sender: the page and send code call no API of ours; the component asks only GET /api/eth-usd, which takes no input',
  giveCode.length > 100 && fitsCode.length > 100 && !/fetch\(|authFetch\(|\/api\//.test(page + giveCode + fitsCode) &&
    JSON.stringify(compApi) === '["/api/eth-usd"]' && !/authFetch\(|method:/.test(comp) &&
    /export async function GET\(\)/.test(route) && !/request|searchParams|cookies|headers\(\)/i.test(route.replace(/\/\*[\s\S]*?\*\//g, '')),
  JSON.stringify(compApi),
);

// S7, S8: a stand-in wallet (EIP-1193) answering the reads the page makes. Fees: base fee 1 gwei, tip 1 gwei; gas 21000
// for ETH and 60000 for USDC. viem's maxFeePerGas is base × 1.2 + tip = 2.2 gwei; the page adds a fifth to the gas.
const GWEI = 10n ** 9n;
const hex = (n: bigint) => `0x${n.toString(16)}`;
const fake = { chainId: 8453, eth: 0n, usdc: 0n, usdcGas: false };
// The miniapp SDK (imported by the sign-in code) wants a window it can post to and listen on; it isn't used here.
Object.assign(globalThis, { addEventListener() {}, removeEventListener() {} });
(globalThis as unknown as { window: unknown }).window = {
  postMessage() {},
  addEventListener() {},
  removeEventListener() {},
  ethereum: {
    on() {},
    async request({ method }: { method: string; params?: unknown[] }) {
      switch (method) {
        case 'eth_chainId': return hex(BigInt(fake.chainId));
        case 'eth_accounts': case 'eth_requestAccounts': return ['0x1111111111111111111111111111111111111111'];
        case 'eth_getBalance': return hex(fake.eth);
        case 'eth_call': return `0x${fake.usdc.toString(16).padStart(64, '0')}`;
        case 'eth_estimateGas': return hex(fake.usdcGas ? 60000n : 21000n);
        case 'eth_gasPrice': return hex(2n * GWEI);
        case 'eth_maxPriorityFeePerGas': return hex(GWEI);
        case 'eth_getBlockByNumber': return { number: '0x1', hash: `0x${'0'.repeat(64)}`, baseFeePerGas: hex(GWEI), timestamp: '0x1', transactions: [] };
        default: throw new Error(`stand-in wallet: ${method}`);
      }
    },
  },
};
const { giftFits, give, WalletError } = await import('../src/lib/wallet/client');
const acct = '0x1111111111111111111111111111111111111111' as const;
const [baseNet, ethNet] = SUPPORT.networks;
const ethFee = ((21000n * 12n) / 10n) * (22n * GWEI / 10n); // 25200 gas × 2.2 gwei
const usdcFee = ((60000n * 12n) / 10n) * (22n * GWEI / 10n);
const cases: [string, () => void, Parameters<typeof giftFits>[0], string][] = [
  ['ETH: amount plus fee fits', () => Object.assign(fake, { eth: 10n ** 16n + ethFee, usdcGas: false }), { network: baseNet, token: 'ETH', amount: '0.01' }, 'ok'],
  ['ETH: amount fits but not the fee', () => Object.assign(fake, { eth: 10n ** 16n + ethFee - 1n }), { network: baseNet, token: 'ETH', amount: '0.01' }, 'not-enough'],
  ['ETH: amount over the balance', () => Object.assign(fake, { eth: 10n ** 15n }), { network: ethNet, token: 'ETH', amount: '0.01' }, 'not-enough'],
  ['USDC: USDC and gas fit', () => Object.assign(fake, { usdc: 1_000_000n, eth: usdcFee, usdcGas: true }), { network: baseNet, token: 'USDC', amount: '1' }, 'ok'],
  ['USDC: not enough USDC', () => Object.assign(fake, { usdc: 999_999n, eth: 10n ** 18n }), { network: baseNet, token: 'USDC', amount: '1' }, 'not-enough'],
  ['USDC: not enough ETH for gas', () => Object.assign(fake, { usdc: 1_000_000n, eth: usdcFee - 1n }), { network: ethNet, token: 'USDC', amount: '1' }, 'no-gas'],
];
const got: string[] = [];
for (const [name, set, g, want] of cases) {
  set();
  fake.chainId = g.network.chainId;
  const r = await giftFits(g, acct).catch((e) => `error ${e}`);
  if (r !== want) got.push(`${name}: ${r}, not ${want}`);
}
check('S7 the balance rules hold for ETH and USDC on both networks', got.length === 0, got.join('; '));
fake.chainId = 1;
const wrong = await give({ network: baseNet, token: 'USDC', amount: '1' }).then(() => 'sent', (e) => (e instanceof WalletError ? e.why : String(e)));
check('S8 the send refuses while the wallet is on the other network', wrong === 'wrong-network', wrong);
// S9: the price, from a stand-in Base client.
const { ethUsdNow } = await import('../src/lib/wallet/eth-usd');
const now = Math.floor(Date.now() / 1000);
const feed = (answer: bigint, updatedAt: number, fail = false) =>
  ({ readContract: async () => { if (fail) throw new Error('down'); return [1n, answer, 0n, BigInt(updatedAt), 1n]; } }) as unknown as Parameters<typeof ethUsdNow>[0];
const p9 = [
  ['fresh', await ethUsdNow(feed(250000000000n, now - 600)), { usd: 2500, updatedAt: now - 600 }],
  ['three hours old', await ethUsdNow(feed(250000000000n, now - 3 * 3600)), null],
  ['zero', await ethUsdNow(feed(0n, now)), null],
  ['unreadable', await ethUsdNow(feed(0n, now, true)), null],
] as const;
const bad9 = p9.filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want)).map(([name, got]) => `${name}: ${JSON.stringify(got)}`);
check('S9 the ETH price: Chainlink on Base, none when stale, zero or unreadable', bad9.length === 0, bad9.join('; '));
if (failed.length) {
  console.error(`\nSUPPORT TEST FAILED (${failed.length}):\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log(`test:support: all ${passed} checks pass`);
