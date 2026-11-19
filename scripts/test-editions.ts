/**
 * Snowmoon Editions test pages (handoff 18 Nov 2026): the pure rules, the wording rules, and the config's limits.
 *  E1  prices display at the ladder's step; "at most" figures round up, never down.
 *  E2  the page's quote equals the contract's: the sum of the reference ladder (contracts/snowmoon-editions/test/reference).
 *  E3  quiet sends exactly the quote; busy sends the cushion (k pieces further up, stopping at the top), never less.
 *  E4  busy means a mint within the window (3 minutes); no mint known is quiet.
 *  E5  a returned amount exists only when money came back.
 *  E6  the page's states: not deployed, not open, sold out, open; the wallet's steps; each contract error by name.
 *  E7  the ladder drawing: true scale, minted / next / waiting, ticks; the countdown and the next opening.
 *  E8  wording: no investment talk, no Terms or Privacy lines, the new name only, the owner's lines are placeholders.
 *  E9  config: Sepolia only (no mainnet chain id or address), no key, no RPC request from the browser.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { EDITIONS_TEST } from '../src/lib/editions/config';
import {
  amountToSend, countdown, countdownText, cushionFrom, editionState, formatEth, formatUsd, isBusy, ladderBars, ladderTicks,
  nextOpening, piecesText, problemOf, quoteFrom, returned, walletStep,
} from '../src/lib/editions/ladder';
import { EW } from '../src/lib/editions/wording';
import catalog from '../config/editions-sepolia.json';

const ROOT = path.resolve(import.meta.dirname, '..');
let passed = 0;
const failed: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  ok ? passed++ : failed.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` (${detail})` : ''}`);
};
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const walk = (d: string): string[] =>
  readdirSync(path.join(ROOT, d)).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(path.join(ROOT, p)).isDirectory() ? walk(p) : /\.(ts|tsx|json|css)$/.test(f) ? [p] : [];
  });

const ref = (name: string) => (JSON.parse(read(`contracts/snowmoon-editions/test/reference/${name}.json`)).prices as string[]).map(BigInt);
const first = ref('first_256');
const five = ref('third_3');

// E1
check('E1 0.0005 ETH', formatEth(500000000000000n) === '0.0005');
check('E1 0.000513 ETH', formatEth(513000000000000n) === '0.000513');
check('E1 0.5 ETH', formatEth(500000000000000000n) === '0.5');
check('E1 whole ETH', formatEth(18690311000000000000n) === '18.690311');
check('E1 below the step rounds down for display', formatEth(513000000000001n) === '0.000513');
check('E1 "at most" rounds up', formatEth(513000000000001n, { up: true }) === '0.000514');
check('E1 zero', formatEth(0n) === '0');
check('E1 dollars', formatUsd(500000000000000000n, 3000) === '$1500', String(formatUsd(500000000000000000n, 3000)));
check('E1 dollars, small', formatUsd(513000000000000n, 3000) === '$1.54', String(formatUsd(513000000000000n, 3000)));
check('E1 dollars, under a cent', formatUsd(1000000000000n, 3000) === 'under $0.01');
check('E1 no price, no dollars', formatUsd(1n, null) === null && formatUsd(1n, 0) === null);

// E2
check('E2 quote of piece 1 is the start price', quoteFrom(first, 0, 1) === 500000000000000n);
check('E2 quote of 10 from the start', quoteFrom(first, 0, 10) === first.slice(0, 10).reduce((a, b) => a + b, 0n));
check('E2 the whole ladder is 18.690311 ETH', quoteFrom(first, 0, 256) === 18690311000000000000n, formatEth(quoteFrom(first, 0, 256)));
check('E2 quote of the last piece', quoteFrom(first, 255, 1) === 500000000000000000n);

// E3
const quiet = amountToSend({ quote: quoteFrom(first, 40, 2), prices: first, sold: 40, quantity: 2, busy: false, cushionPieces: 3 });
check('E3 quiet sends exactly the quote', quiet.send === quiet.quote && !quiet.cushion);
const busy = amountToSend({ quote: quoteFrom(first, 40, 2), prices: first, sold: 40, quantity: 2, busy: true, cushionPieces: 3 });
check('E3 busy sends the price 3 pieces further up', busy.send === quoteFrom(first, 43, 2) && busy.cushion);
check('E3 the cushion is more than the quote on a rising ladder', busy.send > busy.quote);
check('E3 near the top the cushion stops at the last piece', cushionFrom(first, 253, 2, 3) === quoteFrom(first, 254, 2));
check('E3 at the very end there is no cushion (nothing above)', !amountToSend({ quote: quoteFrom(first, 255, 1), prices: first, sold: 255, quantity: 1, busy: true, cushionPieces: 3 }).cushion);
check('E3 a flat ladder never adds a cushion', !amountToSend({ quote: 5n, prices: [5n, 5n, 5n, 5n, 5n, 5n], sold: 1, quantity: 1, busy: true, cushionPieces: 3 }).cushion);
check('E3 a fresh quote above the cushion is sent as is', amountToSend({ quote: 10n ** 18n, prices: first, sold: 0, quantity: 1, busy: true, cushionPieces: 3 }).send === 10n ** 18n);
check('E3 the 3-piece edition', cushionFrom(five, 0, 1, 3) === five[2]);

// E4
check('E4 a mint 2 minutes ago is busy', isBusy(1000, 1120, EDITIONS_TEST.busyWindowSeconds));
check('E4 a mint 3 minutes ago is quiet', !isBusy(1000, 1180, EDITIONS_TEST.busyWindowSeconds));
check('E4 no known mint is quiet', !isBusy(null, 1000, 180));
check('E4 the window is 3 minutes', EDITIONS_TEST.busyWindowSeconds === 180);

// E5
check('E5 money came back', returned(110n, 100n) === 10n);
check('E5 exact payment: no returned line', returned(100n, 100n) === null);

// E6
const at = 1_800_000_000;
check('E6 not deployed', editionState({ deployed: false, startTime: 0, sold: 0, size: 256 }, at) === 'not-deployed');
check('E6 not open yet', editionState({ deployed: true, startTime: at + 60, sold: 0, size: 256 }, at) === 'not-open');
check('E6 open at the start time', editionState({ deployed: true, startTime: at, sold: 0, size: 256 }, at) === 'open');
check('E6 sold out', editionState({ deployed: true, startTime: 0, sold: 5, size: 5 }, at) === 'sold-out');
const w = { found: true, account: '0x1', chainId: 11155111, balance: 10n };
check('E6 no wallet', walletStep({ ...w, found: false }, { chainId: 11155111, value: 1n }) === 'no-wallet');
check('E6 connect', walletStep({ ...w, account: null }, { chainId: 11155111, value: 1n }) === 'connect');
check('E6 wrong network', walletStep({ ...w, chainId: 1 }, { chainId: 11155111, value: 1n }) === 'wrong-network');
check('E6 not enough ETH', walletStep(w, { chainId: 11155111, value: 11n }) === 'not-enough');
check('E6 ready', walletStep(w, { chainId: 11155111, value: 10n }) === 'ready');
check('E6 price moved', problemOf('Underpaid') === 'price-moved');
check('E6 wallet cannot receive', problemOf('ERC1155InvalidReceiver') === 'cannot-receive');
check('E6 sold out', problemOf('NotEnoughLeft') === 'sold-out' && problemOf('ExceedsMaxSupply') === 'sold-out');
check('E6 not open', problemOf('NotStarted') === 'not-open');
check('E6 rejected in the wallet', problemOf(null, { userRejected: true }) === 'rejected');
check('E6 anything else: failed, never a raw error', problemOf('SomethingNew') === 'failed' && problemOf(null) === 'failed');
const states = ['price-moved', 'cannot-receive', 'sold-out', 'not-open', 'rejected', 'failed'] as const;
check('E6 every problem has words', states.every((s) => ({ 'price-moved': EW.priceMoved('1'), 'cannot-receive': EW.cannotReceive, 'sold-out': EW.soldOutNow, 'not-open': EW.notOpenYet, rejected: EW.rejected, failed: EW.failed })[s].length > 10));

// E7
const bars = ladderBars(first, 10);
check('E7 one bar per piece', bars.length === 256);
check('E7 true scale: the last bar is full height, the first 1/1000', bars[255].height === 1 && Math.abs(bars[0].height - 0.001) < 1e-9);
check('E7 minted, next, waiting', bars[9].status === 'minted' && bars[10].status === 'next' && bars[11].status === 'waiting');
check('E7 sold out: no next', ladderBars(five, 3).every((b) => b.status === 'minted'));
check('E7 ticks for 256', JSON.stringify(ladderTicks(256)) === '[1,64,128,192,256]', JSON.stringify(ladderTicks(256)));
check('E7 ticks for 5', JSON.stringify(ladderTicks(5)) === '[1,2,3,4,5]');
check('E7 next opening from the contract first', nextOpening([at - 10, at + 500, at + 100], '2030-01-01T00:00:00Z', at) === at + 100);
check('E7 then from config', nextOpening([at - 10], new Date((at + 900) * 1000).toISOString(), at) === at + 900);
check('E7 else none', nextOpening([], null, at) === null && nextOpening([], new Date((at - 1) * 1000).toISOString(), at) === null);
check('E7 countdown', countdownText(countdown(at + 90061, at)) === '1d 1h 1m' && countdownText(countdown(at + 65, at)) === '1m 05s' && countdown(at, at + 5).done);
check('E7 pieces text', piecesText(12, 1) === 'Piece 12' && piecesText(12, 10) === 'Pieces 12–21');

// E8
const call = (f: (...a: unknown[]) => unknown) => {
  try {
    return f(1, 2, 3, 4);
  } catch {
    return f(10n ** 15n, 2, 3, 4); // the wei ones
  }
};
const words = JSON.stringify(Object.values(EW).map((v) => (typeof v === 'function' ? call(v as (...a: unknown[]) => unknown) : v)));
const banned = /price (?:goes|will go) up|early (?:buyers|birds?|collectors)|resale|resell|flip|invest|profit|return on|appreciat|floor price|moon(?:ing)?\b(?!.*Snowmoon)/i;
check('E8 no investment talk', !banned.test(words.replace(/Snowmoon/g, '')), words.match(banned)?.[0]);
check('E8 no Terms or Privacy lines', !/\b(terms|privacy|refund polic)/i.test(words), words.match(/\b(terms|privacy)/i)?.[0]);
check('E8 the banner says it is a test on a test network', /test/i.test(EW.banner) && /Sepolia/.test(EW.banner) && /not real|nothing here is real/i.test(EW.banner));
check('E8 "Editions", "Earlier editions", "All editions"', EW.title === 'Editions' && EW.earlier === 'Earlier editions' && EW.allEditions === 'All editions');
check('E8 not "the making so far" or "the work so far"', !/(making|work) so far/i.test(words));
const editionsFiles = [...walk('src/app/editions'), ...walk('src/components/editions'), ...walk('src/lib/editions'), 'config/editions-sepolia.json'];
const oldName = editionsFiles.filter((f) => /Snowmoon WIP|SMWIP/.test(read(f)));
check('E8 the old name is gone from the pages', oldName.length === 0, oldName.join(', '));
check('E8 the collection is named "Snowmoon Editions"', EDITIONS_TEST.collectionName === 'Snowmoon Editions');
const entries = Object.values((catalog as { editions: Record<string, Record<string, unknown>> }).editions);
check('E8 no invented story text: the owner\'s fields are empty until he writes them', entries.every((e) => e.story === null && e.line === null && e.title === null && e.madeBy === null && e.builtOn === null));
check('E8 placeholders are bracketed', [EW.storyPlaceholder, EW.linePlaceholder, EW.titlePlaceholder, EW.madeByPlaceholder, EW.builtOnPlaceholder, EW.earlierPlaceholder, EW.recipientPlaceholder].every((p) => /^\[.*\]$/.test(p)));
check('E8 test editions are marked TEST', entries.every((e) => e.test === true));
check('E8 media is first-party', entries.every((e) => !e.media || String((e.media as { url: string }).url).startsWith('https://media.snowmoon.party/')));

// E9
check('E9 Sepolia only', EDITIONS_TEST.chainId === 11155111);
const code = editionsFiles.map((f) => [f, read(f)] as const);
const uncommented = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const mainnet = code.filter(([, t]) => /\bchainId:\s*1\b|\bid:\s*1\b|mainnet|etherscan\.io(?!\/)|\/\/etherscan\.io/.test(uncommented(t).replace(/sepolia\.etherscan\.io/g, '')));
check('E9 no mainnet configuration', mainnet.length === 0, mainnet.map(([f]) => f).join(', '));
const keys = code.filter(([, t]) => /private[_ ]?key|mnemonic|0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/i.test(t.replace(/\^0x\[0-9a-fA-F\]\{64\}\$/g, '')));
check('E9 no keys or signing secrets', keys.length === 0, keys.map(([f]) => f).join(', '));
const clientFiles = code.filter(([, t]) => t.startsWith("'use client'"));
const browserFetch = clientFiles.filter(([, t]) => /fetch\(\s*['`]https?:/.test(t) || /\bhttp\(/.test(t));
check('E9 the browser asks only our API or the wallet (no RPC, P6a)', browserFetch.length === 0, browserFetch.map(([f]) => f).join(', '));
check('E9 the server reads Sepolia, the wallet adds it only if asked', /ethereum-sepolia/.test(EDITIONS_TEST.rpcUrl) || !!process.env.EDITIONS_RPC_URL);
check('E9 pages are noindex', /robots:\s*\{\s*index:\s*false/.test(read('src/app/editions/layout.tsx')));
const linked = walk('src').filter((f) => !f.includes('/editions') && /href=["'{`]\/editions/.test(read(f)));
check('E9 unlisted: nothing else links to /editions', linked.length === 0, linked.join(', '));

console.log(`\ntest:editions: ${passed} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
