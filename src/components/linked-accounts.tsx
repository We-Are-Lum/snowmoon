'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, deviceSessions, type DeviceSession } from '~/lib/client-auth';
import { LINKED_ACCOUNTS } from '~/lib/config';
import { LINKED_WORDING, networksPhrase, type Network } from '~/lib/linked/wording';

/**
 * The You page's linked-accounts panel (owner, 2026-11-05: "build the You page panel for linking and unlinking, using
 * the API you built, behind the switch"). Shown only while LINKED_ACCOUNTS.enabled is on (off: nothing renders and
 * /api/linked-accounts answers 404). DRAFT, drafted by a coding agent (Claude, a closed model by Anthropic); its words
 * (LINKED_WORDING.panel) await the owner's OK, and its UI check (check:ui) is owed.
 *
 * - The person's accounts (GET /api/linked-accounts), each with Unlink behind a confirm (not the last one; the server
 *   refuses it and every rule A1–A8 itself).
 * - Every other sign-in kept on this device that isn't one of them yet, with Link behind a confirm that says what
 *   becomes public: the request carries the person's sign-in (authFetch) and that account's own token as
 *   X-Link-Session, so both are checked in one request.
 * - "Link another account": the networks not linked yet, and how many wallets are left.
 */
type Kind = 'farcaster' | 'wallet' | 'lens' | 'bluesky';
type Member = { kind: Kind; account: number };
type View = { accounts: Member[]; canLink: Network[]; walletsLeft: number };
const P = LINKED_WORDING.panel;
const json = { 'content-type': 'application/json' };

export function LinkedAccountsPanel({ onChange }: { onChange?: () => void }) {
  const [view, setView] = useState<View | null>(null);
  const [device, setDevice] = useState<DeviceSession[]>([]);
  const [asking, setAsking] = useState<{ what: 'link'; s: DeviceSession } | { what: 'unlink'; m: Member } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await authFetch('/api/linked-accounts').catch(() => null);
    setView(r?.ok ? ((await r.json()) as View) : null);
    setDevice(deviceSessions());
  }, []);
  useEffect(() => {
    if (LINKED_ACCOUNTS.enabled) void load();
  }, [load]);
  if (!LINKED_ACCOUNTS.enabled || !view) return null;

  const done = async (r: Response | null) => {
    const out = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    setAsking(null);
    setNote(r?.ok ? null : (out?.error ?? P.failed));
    await load();
    onChange?.();
  };
  const link = async (s: DeviceSession) => {
    setBusy(true);
    await done(await authFetch('/api/linked-accounts', { method: 'POST', headers: { ...json, 'x-link-session': s.token }, body: JSON.stringify({ account: s.account }) }).catch(() => null));
  };
  const unlink = async (m: Member) => {
    setBusy(true);
    await done(await authFetch('/api/linked-accounts', { method: 'DELETE', headers: json, body: JSON.stringify({ account: m.account }) }).catch(() => null));
  };

  const mine = new Set(view.accounts.map((m) => m.account));
  const here = device.filter((d) => mine.has(d.account));
  const offers = device.filter((d) => !mine.has(d.account));
  const nameOf = (m: Member) => device.find((d) => d.account === m.account)?.name ?? P.kinds[m.kind];
  const another = networksPhrase(view.canLink);

  return (
    <div className="you-linked" aria-labelledby="you-linked">
      <h3 id="you-linked">{P.title}</h3>
      <p className="you-note">{P.intro}</p>
      <ul className="you-linked-list">
        {view.accounts.map((m) => (
          <li key={m.account}>
            <span className="you-linked-kind">{P.kinds[m.kind]}</span> {nameOf(m)}
            {here.some((d) => d.account === m.account) && <span className="you-note"> ({P.you})</span>}
            {view.accounts.length > 1 && (
              <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking({ what: 'unlink', m })}>
                {P.unlink}
              </button>
            )}
          </li>
        ))}
      </ul>
      {offers.map((s) => (
        <p key={s.account}>
          <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking({ what: 'link', s })}>
            {P.linkThis(`${P.kinds[s.kind]} ${s.name}`)}
          </button>
        </p>
      ))}
      {asking && (
        <div className="you-confirm" role="dialog" aria-modal="false">
          <p>{asking.what === 'link' ? `${P.linkAsk(`${P.kinds[asking.s.kind]} ${asking.s.name}`)} ${LINKED_WORDING.confirm}` : P.unlinkAsk}</p>
          <button type="button" className="as-primary" disabled={busy} onClick={() => void (asking.what === 'link' ? link(asking.s) : unlink(asking.m))}>
            {asking.what === 'link' ? P.linkYes : P.unlinkYes}
          </button>{' '}
          <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking(null)}>
            {P.cancel}
          </button>
        </div>
      )}
      <h4>{P.another}</h4>
      {another && <p className="you-note">{P.anotherHow(another)}</p>}
      <p className="you-note">{view.walletsLeft > 0 ? `${P.wallets(view.walletsLeft)} ${P.walletSignIn}` : P.wallets(0)}</p>
      {note && <p className="you-note" role="alert">{note}</p>}
    </div>
  );
}
