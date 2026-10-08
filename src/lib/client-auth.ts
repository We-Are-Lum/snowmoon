'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Sign-in on the client, one helper for every signed-in call (docs/proposals/web-sign-in.md).
 * - Inside a Farcaster app: Quick Auth (sdk.quickAuth), silent, token kept by the SDK.
 * - On the plain website: Sign in with Farcaster through our own server, which returns the
 *   same kind of token (issued by auth.farcaster.xyz, one hour). It is kept in localStorage,
 *   never in a cookie, and sent only as a bearer header on API calls.
 */
const KEY = 'snowmoon.signin';
const EVENT = 'snowmoon:signin';

interface WebSession {
  token: string;
  fid: number;
  username?: string | null;
  /** The relay's name for this FID, signed by our server at sign-in (shown as the byline when publishing). */
  nameProof?: string | null;
  /** Seconds since the epoch, from the token. */
  exp: number;
}

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'signed-in'; fid: number; username: string | null; via: 'farcaster-app' | 'website'; expires?: number }
  | { kind: 'signed-out'; inApp: boolean };

let inAppCache: Promise<boolean> | null = null;
export function inMiniApp(): Promise<boolean> {
  return (inAppCache ??= sdk.isInMiniApp().catch(() => false));
}

function readSession(): WebSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as WebSession | null;
    // Treat a token with under two minutes left as gone, so nothing is lost mid-flight.
    return s && s.exp * 1000 > Date.now() + 120_000 ? s : null;
  } catch {
    return null;
  }
}

export function saveWebSession(token: string, username?: string | null, nameProof?: string | null) {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub: number | string; exp: number };
  try {
    localStorage.setItem(KEY, JSON.stringify({ token, fid: Number(payload.sub), username: username ?? null, nameProof: nameProof ?? null, exp: payload.exp }));
  } catch {
    /* storage blocked: signed in until the page closes is not possible; the call still works once */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The signed name from a website sign-in, if there is one. */
export function webNameProof(): string | null {
  return readSession()?.nameProof ?? null;
}

export function signOut() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** fetch with the person's token when there is one; a plain fetch otherwise. */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  if (await inMiniApp()) return sdk.quickAuth.fetch(url, init);
  const s = readSession();
  if (!s) return fetch(url, init);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${s.token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) signOut();
  return res;
}

/** Who is signed in, kept current across components and tabs. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (await inMiniApp()) {
        const res = await sdk.quickAuth.fetch('/api/auth/me').catch(() => null);
        // Not sdk.context.catch(…): the context is a bridge to the host, and a function can't cross it.
        let ctx: Awaited<typeof sdk.context> | null = null;
        try {
          ctx = await sdk.context;
        } catch {
          ctx = null;
        }
        if (!alive) return;
        if (res?.ok) {
          const { fid } = (await res.json()) as { fid: number };
          setState({ kind: 'signed-in', fid, username: ctx?.user?.username ?? null, via: 'farcaster-app' });
        } else setState({ kind: 'signed-out', inApp: true });
        return;
      }
      const s = readSession();
      if (!alive) return;
      setState(s ? { kind: 'signed-in', fid: s.fid, username: s.username ?? null, via: 'website', expires: s.exp } : { kind: 'signed-out', inApp: false });
    };
    void check();
    const again = () => void check();
    window.addEventListener(EVENT, again);
    window.addEventListener('storage', again);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, again);
      window.removeEventListener('storage', again);
    };
  }, []);
  return state;
}
