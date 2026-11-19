/**
 * The pure rules behind the Snowmoon Editions test pages: price display, how much a mint sends (quiet and busy), the
 * page's states, the ladder drawing and the countdown. No network, no wallet: scripts/test-editions.ts tests all of it.
 * DRAFT, written by an AI agent (Claude, made by Anthropic).
 */

export const WEI = 10n ** 18n;
/** LadderSeller.PRICE_STEP: every interior price is a whole number of these (0.000001 ETH). */
export const STEP = 10n ** 12n;

/**
 * Wei as ETH, at most six decimals (the ladder's step), trailing zeros dropped: 500000000000000n → "0.0005".
 * `up` rounds a remainder below the step up, for a "you pay at most" figure that must never understate.
 */
export function formatEth(wei: bigint, opts: { up?: boolean } = {}): string {
  let micro = wei / STEP;
  if (opts.up && wei % STEP !== 0n) micro += 1n;
  const whole = micro / 1_000_000n;
  const frac = (micro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** An approximate dollar figure, or null without a current price. Under a cent shows as "under $0.01". */
export function formatUsd(wei: bigint, ethUsd: number | null): string | null {
  if (ethUsd === null || !(ethUsd > 0)) return null;
  const usd = (Number(wei) / 1e18) * ethUsd;
  if (usd > 0 && usd < 0.01) return 'under $0.01';
  return `$${usd.toFixed(usd >= 100 ? 0 : 2)}`;
}

/** What `quote(id, quantity)` returns: the next `quantity` prices after `sold` pieces. `prices[0]` is piece 1. */
export function quoteFrom(prices: readonly bigint[], sold: number, quantity: number): bigint {
  let sum = 0n;
  for (let n = sold; n < sold + quantity; n++) sum += prices[n];
  return sum;
}

/**
 * The busy cushion: the cost of the same number of pieces `k` places further up the ladder, so the mint still goes
 * through if up to `k` pieces sell first. Near the top of the ladder the window stops at the last piece. Never less than
 * the quote.
 */
export function cushionFrom(prices: readonly bigint[], sold: number, quantity: number, k: number): bigint {
  const start = Math.max(sold, Math.min(sold + k, prices.length - quantity));
  const c = quoteFrom(prices, start, quantity);
  const q = quoteFrom(prices, sold, quantity);
  return c > q ? c : q;
}

/** Busy: someone minted this edition within the window (seconds). No known mint: quiet. */
export function isBusy(lastMintAt: number | null, now: number, windowSeconds: number): boolean {
  return lastMintAt !== null && now - lastMintAt < windowSeconds;
}

export type Amount = {
  /** What quote(id, quantity) says right now. */
  quote: bigint;
  /** What the page sends: the quote when quiet; the cushion when busy. */
  send: bigint;
  /** True only when `send` is more than `quote` (then, and only then, the page explains the difference). */
  cushion: boolean;
};

/**
 * How much a mint sends (owner, 2026-11-18): quiet, exactly the quoted price; busy, the cushion, said before confirming.
 * `quote` is the fresh on-chain quote read just before sending; `prices` and `sold` give the cushion.
 */
export function amountToSend(opts: { quote: bigint; prices: readonly bigint[]; sold: number; quantity: number; busy: boolean; cushionPieces: number }): Amount {
  if (!opts.busy) return { quote: opts.quote, send: opts.quote, cushion: false };
  const c = cushionFrom(opts.prices, opts.sold, opts.quantity, opts.cushionPieces);
  const send = c > opts.quote ? c : opts.quote;
  return { quote: opts.quote, send, cushion: send > opts.quote };
}

/** What came back after a mint: the value sent minus the cost the seller kept. Shown only when above zero. */
export function returned(sent: bigint, cost: bigint): bigint | null {
  return sent > cost ? sent - cost : null;
}

export type EditionState = 'not-deployed' | 'not-open' | 'sold-out' | 'open';
export function editionState(e: { deployed: boolean; startTime: number; sold: number; size: number }, now: number): EditionState {
  if (!e.deployed) return 'not-deployed';
  if (e.sold >= e.size) return 'sold-out';
  if (now < e.startTime) return 'not-open';
  return 'open';
}

export type WalletStep = 'no-wallet' | 'connect' | 'wrong-network' | 'not-enough' | 'ready';
/** Where the buyer is, before the mint button can send. `balance` null: not read yet (treated as ready to try). */
export function walletStep(w: { found: boolean; account: string | null; chainId: number | null; balance: bigint | null }, want: { chainId: number; value: bigint }): WalletStep {
  if (!w.found) return 'no-wallet';
  if (!w.account) return 'connect';
  if (w.chainId !== want.chainId) return 'wrong-network';
  if (w.balance !== null && w.balance < want.value) return 'not-enough';
  return 'ready';
}

export type MintProblem = 'price-moved' | 'cannot-receive' | 'sold-out' | 'not-open' | 'rejected' | 'not-enough' | 'failed';
/** A contract error (by name) or a wallet refusal, as one of the page's plain states. Never a raw error. */
export function problemOf(errorName: string | null, opts: { userRejected?: boolean; insufficientFunds?: boolean } = {}): MintProblem {
  if (opts.userRejected) return 'rejected';
  if (opts.insufficientFunds) return 'not-enough';
  switch (errorName) {
    case 'Underpaid':
      return 'price-moved';
    case 'ERC1155InvalidReceiver':
      return 'cannot-receive';
    case 'NotEnoughLeft':
    case 'ExceedsMaxSupply':
      return 'sold-out';
    case 'NotStarted':
      return 'not-open';
    default:
      return 'failed';
  }
}

export type Bar = { n: number; height: number; status: 'minted' | 'next' | 'waiting' };
/**
 * The ladder to true scale: each bar's height is its price over the top price (linear, so the early pieces are short,
 * as they are). Minted, next and waiting are told apart by fill (solid, marked, hollow), not by colour alone.
 */
export function ladderBars(prices: readonly bigint[], sold: number): Bar[] {
  const top = prices.length ? prices[prices.length - 1] : 0n;
  return prices.map((p, i) => ({
    n: i + 1,
    height: top > 0n ? Number((p * 1_000_000n) / top) / 1_000_000 : 0,
    status: i < sold ? 'minted' : i === sold ? 'next' : 'waiting',
  }));
}

/** Piece numbers to mark with their price: the first, the middle, three quarters and the last (no repeats). The first
 *  quarter is left out: on a rising ladder its bars sit by the first, and the labels would collide at phone width. */
export function ladderTicks(size: number): number[] {
  if (size <= 5) return Array.from({ length: size }, (_, i) => i + 1);
  return [...new Set([1, Math.round(size / 2), Math.round((3 * size) / 4), size])];
}

/** "Piece 12" or "Pieces 12–21". */
export function piecesText(first: number, quantity: number): string {
  return quantity > 1 ? `Pieces ${first}–${first + quantity - 1}` : `Piece ${first}`;
}

/** The next opening: the earliest future start on the contract, else the configured one, else none. Unix seconds. */
export function nextOpening(contractStarts: readonly number[], configured: string | null, now: number): number | null {
  const onChain = contractStarts.filter((t) => t > now).sort((a, b) => a - b)[0];
  if (onChain !== undefined) return onChain;
  const c = configured ? Math.floor(Date.parse(configured) / 1000) : NaN;
  return Number.isFinite(c) && c > now ? c : null;
}

/** Days, hours, minutes and seconds left; all zero once it's time. */
export function countdown(target: number, now: number): { d: number; h: number; m: number; s: number; done: boolean } {
  const left = Math.max(0, target - now);
  return { d: Math.floor(left / 86400), h: Math.floor((left % 86400) / 3600), m: Math.floor((left % 3600) / 60), s: left % 60, done: left === 0 };
}

export const countdownText = (c: ReturnType<typeof countdown>) =>
  c.done ? 'now' : c.d > 0 ? `${c.d}d ${c.h}h ${c.m}m` : c.h > 0 ? `${c.h}h ${c.m}m` : `${c.m}m ${String(c.s).padStart(2, '0')}s`;
