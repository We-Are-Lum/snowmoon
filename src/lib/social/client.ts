'use client';

import { createWalletClient, custom, type EIP1193Provider } from 'viem';
import { saveSocialSession } from '../client-auth';

/**
 * Lens and Bluesky sign-in in the browser (branch signin-lens-bluesky). The server does the checking
 * (src/app/api/auth/lens/*, src/app/api/auth/bluesky/*); the browser only signs (Lens) or travels (Bluesky).
 * Wording of the errors: DRAFT, by the coding agent, for the owner's reread.
 */
export const SOCIAL_WORDING = {
  noWallet: 'Signing in with Lens needs a wallet in this browser: the one that owns or manages your Lens account.',
  noLensAccount: 'This wallet doesn’t own or manage a Lens account.',
  declined: 'The signature was declined.',
  odd: 'That sign-in message wasn’t for this site and this wallet, so we didn’t ask your wallet to sign it.',
  blueskyLost: 'That sign-in was started in another tab or took too long. Start again.',
  server: 'Signing in didn’t work. Try again in a moment.',
} as const;

export class SocialError extends Error {}

function provider(): EIP1193Provider | null {
  return typeof window !== 'undefined' ? ((window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null) : null;
}

export interface LensChoice {
  address: `0x${string}`;
  username: string | null;
  role: 'owner' | 'manager';
}

/** The wallet in this browser, and the Lens accounts it owns or manages. */
export async function lensAccounts(): Promise<{ wallet: `0x${string}`; accounts: LensChoice[] }> {
  const p = provider();
  if (!p) throw new SocialError(SOCIAL_WORDING.noWallet);
  const [wallet] = await createWalletClient({ transport: custom(p) }).requestAddresses();
  if (!wallet) throw new SocialError(SOCIAL_WORDING.noWallet);
  const res = await fetch(`/api/auth/lens/accounts?wallet=${wallet}`).catch(() => null);
  const out = (await res?.json().catch(() => ({}))) as { accounts?: LensChoice[]; error?: string };
  if (!res?.ok || !out.accounts) throw new SocialError(out.error ?? SOCIAL_WORDING.server);
  if (!out.accounts.length) throw new SocialError(SOCIAL_WORDING.noLensAccount);
  return { wallet, accounts: out.accounts };
}

/** Sign in as this Lens account: Lens's challenge, signed by the wallet, checked by our server. */
export async function signInWithLens(wallet: `0x${string}`, account: `0x${string}`): Promise<string | null> {
  const p = provider();
  if (!p) throw new SocialError(SOCIAL_WORDING.noWallet);
  const c = await fetch('/api/auth/lens/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, signer: wallet }) }).catch(() => null);
  const ch = (await c?.json().catch(() => ({}))) as { text?: string; ticket?: string; error?: string };
  if (!c?.ok || !ch.text || !ch.ticket) throw new SocialError(ch.error ?? SOCIAL_WORDING.server);
  // Only a message for this site and this wallet is signed.
  if (!ch.text.startsWith(`${location.host} wants you to sign in`) || !ch.text.toLowerCase().includes(wallet.toLowerCase())) throw new SocialError(SOCIAL_WORDING.odd);
  let signature: `0x${string}`;
  try {
    signature = await createWalletClient({ transport: custom(p) }).signMessage({ account: wallet, message: ch.text });
  } catch {
    throw new SocialError(SOCIAL_WORDING.declined);
  }
  const v = await fetch('/api/auth/lens/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: ch.ticket, signature }) }).catch(() => null);
  const out = (await v?.json().catch(() => ({}))) as { token?: string; handle?: string | null; error?: string };
  if (!v?.ok || !out.token) throw new SocialError(out.error ?? SOCIAL_WORDING.server);
  saveSocialSession(out.token, 'lens', out.handle ?? null);
  return out.handle ?? null;
}

const PENDING = 'snowmoon.bluesky.pending';

/** Start a Bluesky sign-in: the browser leaves for the person's Bluesky authorization server. */
export async function startBlueskySignIn(handle: string): Promise<void> {
  const res = await fetch('/api/auth/bluesky/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle }) }).catch(() => null);
  const out = (await res?.json().catch(() => ({}))) as { url?: string; sealed?: string; error?: string };
  if (!res?.ok || !out.url || !out.sealed) throw new SocialError(out.error ?? SOCIAL_WORDING.server);
  try {
    sessionStorage.setItem(PENDING, out.sealed);
  } catch {
    throw new SocialError(SOCIAL_WORDING.server);
  }
  location.assign(out.url);
}

/** Finish it, on /sign-in/bluesky, with what the authorization server put in the address. */
export async function finishBlueskySignIn(params: URLSearchParams): Promise<string | null> {
  let sealed: string | null = null;
  try {
    sealed = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
  } catch {
    sealed = null;
  }
  if (!sealed) throw new SocialError(SOCIAL_WORDING.blueskyLost);
  if (params.get('error')) throw new SocialError(SOCIAL_WORDING.declined);
  const res = await fetch('/api/auth/bluesky/callback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: params.get('code'), state: params.get('state'), iss: params.get('iss'), sealed }),
  }).catch(() => null);
  const out = (await res?.json().catch(() => ({}))) as { token?: string; handle?: string | null; error?: string };
  if (!res?.ok || !out.token) throw new SocialError(out.error ?? SOCIAL_WORDING.server);
  saveSocialSession(out.token, 'bluesky', out.handle ?? null);
  return out.handle ?? null;
}
