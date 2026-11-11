'use client';

import { useState } from 'react';
import { authFetch, dropSocialLinkSession, signOutSocial, type SocialSessionState } from '~/lib/client-auth';
import { LINK_WORDING as L } from '~/lib/social/link-wording';
import { SignInButton } from './sign-in';
import { BlueskySignInButton, LensSignInButton } from './social-sign-in';

/**
 * The You page's Lens and Bluesky link panel (owner, 2026-11-04, 3a: "Build the link and unlink panel on the You page").
 * What it shows comes from /api/you's `social` (src/app/api/you/route.ts); what it does goes to /api/social-link, which
 * checks both sign-ins itself and enforces the 30-day wait. Wording: src/lib/social/link-wording.ts (DRAFT).
 *
 * - The Lens or Bluesky account signed in on this device: its link with Unlink, or the offer to link it to the
 *   Farcaster account (or, for Bluesky, the Lens account) signed in beside it, or how to sign in with that one too.
 * - Signed in with Farcaster (or Lens): the accounts linked to it, each with Unlink, and "Link Lens" / "Link Bluesky"
 *   (signing in with that account on this device, which makes the offer appear).
 */
export interface SocialView {
  here: {
    account: number;
    kind: 'lens' | 'bluesky';
    name: string;
    linked: { to: string | null; at: string; fid: number | null } | null;
    offer: { fid: number; name: string } | { lens: true; name: string } | null;
    waitUntil: string | null;
  } | null;
  linked: { account: number; kind: 'lens' | 'bluesky'; name: string; at: string }[];
  canAddBluesky: boolean;
}

type Send = (url: string, init: RequestInit) => Promise<Response>;

export function SocialLinks({
  view,
  hereToken,
  bearer,
  farcaster,
  lensOn,
  blueskyOn,
  reload,
}: {
  view: SocialView;
  /** The token of the account in `view.here` (sent as X-Social-Session). */
  hereToken: SocialSessionState | null;
  /** How to send as the person signed in: the Farcaster sign-in (authFetch), or the Lens session as the bearer. */
  bearer: SocialSessionState | null;
  farcaster: boolean;
  lensOn: boolean;
  blueskyOn: boolean;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<number | 'here' | null>(null);
  const [later, setLater] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const send: Send = farcaster || !bearer
    ? authFetch
    : (url, init) => fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${bearer.token}` } });
  const done = async (r: Response | null) => {
    const out = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    setAsking(null);
    if (!r?.ok) return setNote(out?.error ?? L.failed);
    setNote(null);
    reload();
  };
  const json = { 'content-type': 'application/json' };
  const linkNow = async () => {
    const h = view.here;
    if (!h?.offer || !hereToken) return;
    setBusy(true);
    const body = 'fid' in h.offer ? { fid: h.offer.fid } : { lens: true };
    const r = await send('/api/social-link', { method: 'POST', headers: { ...json, 'x-social-session': hereToken.token }, body: JSON.stringify(body) }).catch(() => null);
    await done(r);
    // A second sign-in kept only for this link is dropped either way.
    if ('lens' in h.offer) dropSocialLinkSession();
  };
  const unlinkHere = async () => {
    if (!hereToken) return;
    setBusy(true);
    const r = await fetch('/api/social-link', { method: 'DELETE', headers: { 'x-social-session': hereToken.token } }).catch(() => null);
    await done(r);
  };
  const unlinkOther = async (account: number) => {
    setBusy(true);
    await done(await send('/api/social-link', { method: 'DELETE', headers: json, body: JSON.stringify({ account }) }).catch(() => null));
  };
  const confirm = (key: number | 'here', go: () => void) =>
    asking === key ? (
      <div className="you-actions">
        <span className="you-note">{L.unlinkConfirm}</span>
        <button type="button" className="ic-secondary" disabled={busy} onClick={go}>
          {L.unlinkYes}
        </button>
        <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking(null)}>
          {L.unlinkNo}
        </button>
      </div>
    ) : (
      <div className="you-actions">
        <button type="button" className="ic-secondary" onClick={() => setAsking(key)}>
          {L.unlink}
        </button>
      </div>
    );

  const h = view.here;
  return (
    <div className="you-link social-links" aria-label={L.title}>
      <h3 className="label">{L.title}</h3>
      {h?.linked && (
        <>
          <p className="you-note">{L.linked(h.kind, h.name, h.linked.to ?? '')}</p>
          {confirm('here', () => void unlinkHere())}
        </>
      )}
      {h && !h.linked && h.offer && !later && (
        <>
          <p className="you-name">{L.offer(h.kind, h.name, h.offer.name)}</p>
          <p className="you-note">{L.offerWhat(h.offer.name)}</p>
          <p className="you-note">{L.waitNote}</p>
          {h.waitUntil ? (
            <p className="you-note" role="status">
              {L.wait(h.waitUntil)}
            </p>
          ) : (
            <div className="you-actions">
              <button type="button" className="ic-secondary" disabled={busy || !hereToken} onClick={() => void linkNow()}>
                {L.yes}
              </button>
              <button
                type="button"
                className="ic-secondary"
                disabled={busy}
                onClick={() => {
                  setLater(true);
                  if ('lens' in h.offer!) dropSocialLinkSession();
                }}
              >
                {L.no}
              </button>
            </div>
          )}
        </>
      )}
      {h && !h.linked && !h.offer && !farcaster && (
        <>
          <p className="you-note">{L.signInFarcaster}</p>
          <SignInButton className="ic-secondary" />
        </>
      )}
      {view.linked.map((a) => (
        <div key={a.account}>
          <p className="you-note">{L.linkedHere(a.kind, a.name)}</p>
          {confirm(a.account, () => void unlinkOther(a.account))}
        </div>
      ))}
      {/* Signed in with Farcaster and no Lens or Bluesky account on this device yet: sign in with one to link it. */}
      {farcaster && !h && (
        <div className="you-actions">
          {lensOn && <LensSignInButton className="ic-secondary" label={L.addLens} onDone={reload} />}
          {blueskyOn && <BlueskySignInButton className="ic-secondary" label={L.addBlueskyToFarcaster} />}
        </div>
      )}
      {view.canAddBluesky && blueskyOn && (
        <div className="you-actions">
          <BlueskySignInButton className="ic-secondary" forLink label={L.addBluesky} />
        </div>
      )}
      {farcaster && h && !h.linked && (
        <div className="you-actions">
          <button type="button" className="ic-secondary" onClick={() => signOutSocial()}>
            {L.forget(h.name)}
          </button>
        </div>
      )}
      {note && (
        <p className="you-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
