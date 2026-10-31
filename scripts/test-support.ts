/**
 * "Support this site" (owner, 2026-10-30: "Keep it in one constant, checksummed, and test that every place shows exactly
 * that constant"). Static checks over the code; check:ui checks the served page (the text, the copy button, the QR code
 * and the Splits links, each against SUPPORT.address).
 *  S1  SUPPORT.address is checksummed (EIP-55): viem's getAddress returns it unchanged.
 *  S2  the address is written in exactly one place in src/ (config.ts), in any letter case; nowhere else.
 *  S3  every place that shows or uses it reads SUPPORT.address: the page (text and QR code), the copy button, the
 *      Splits links, and the wallet send's recipient.
 *  S4  the Splits link for each network is built from SUPPORT.address.
 *  S5  the networks are exactly Ethereum (1) and Base (8453), as eth_getCode found on 2026-10-30; the send is on Base.
 *  S6  nothing here records the sender: the page and its component call no API of ours.
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
check(
  'S3 the page (text and QR code), the copy button and the wallet send all read SUPPORT.address',
  /QRCode\.toString\(SUPPORT\.address/.test(page) && /<SupportAddress address=\{SUPPORT\.address\}/.test(page) && /data-qr-of=\{SUPPORT\.address\}/.test(page) &&
    /data-copies=\{address\}/.test(comp) && /writeText\(address\)/.test(comp) && /to: SUPPORT\.address/.test(client) && /give\(\{/.test(comp),
);
check('S4 each Splits link is built from SUPPORT.address', SUPPORT.networks.every((n) => SUPPORT.splitsUrl(n.chainId) === `https://app.splits.org/accounts/${SUPPORT.address}/?chainId=${n.chainId}`) && /SUPPORT\.splitsUrl\(n\.chainId\)/.test(page));
check('S5 the networks are Ethereum (1) and Base (8453); the send is on Base', JSON.stringify(SUPPORT.networks.map((n) => [n.name, n.chainId])) === '[["Ethereum",1],["Base",8453]]' && SUPPORT.send.chainId === 8453);
const fnBody = (src: string, head: string) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i) + 2); };
const sends = fnBody(client, 'export async function give') + fnBody(client, 'async function sendOnBase');
check('S6 nothing records the sender: no call to our own API from the page, its component, give() or sendOnBase()', sends.length > 100 && !/fetch\(|authFetch\(|\/api\//.test(page + comp + sends), `checked ${sends.length} characters of the send code`);

if (failed.length) {
  console.error(`\nSUPPORT TEST FAILED (${failed.length}):\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log(`test:support: all ${passed} checks pass`);
