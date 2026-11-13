'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, inMiniApp, useWalletSession } from '~/lib/client-auth';
import { ADD_BACKSTORY_WORDING as A, BACKSTORY_GUIDE, BACKSTORY_MAX, type StoredBackstory } from '~/lib/challenge/backstory';
import { BOUNTY_WORDING as W } from '~/lib/poidh/wording';
import { connect, hasGasForClaim, sendClaim, type WalletKind } from '~/lib/poidh/wallet';
import { PublishedTextField } from './publish-words';

/**
 * "Add a backstory" on a challenge picture's page, for its maker only (owner, 2026-11-12; branch
 * challenge-backstory-bounty). The box starts from the picture's backstory (written at publish, or added here since);
 * "What makes a good backstory" sits beside it (five DRAFT points: advice only, never put in the box). Saving sends what
 * was typed; the server checks it with the prompt guard and keeps it as a new row. No model writes, fills or suggests
 * it.
 *
 * Then "Submit it to the poidh bounty": from the Farcaster app's wallet, or a wallet sign-in's wallet, the maker's own
 * wallet sends createClaim on Base (they pay the network fee; nothing is sponsored), after the owner's warning. Everyone
 * else gets the bounty's link and their backstory ready to copy. Voting, accepting and anything else about the bounty
 * happen on poidh: this only submits claims.
 */
interface Info {
  mine: boolean;
  name?: string;
  backstory?: StoredBackstory | null;
  title?: string;
  copyText?: string | null;
  bountyUrl?: string | null;
  claims?: { left: number; max: number; mine: { id: string; txHash: string; claimId: string | null; outcome: string | null }[] } | null;
  inApp?: boolean;
  ready?: boolean;
}

export function ChallengeBackstoryBounty({ versionId, onBackstory }: { versionId: string; onBackstory?: (b: StoredBackstory) => void }) {
  const wallet = useWalletSession();
  const [info, setInfo] = useState<Info | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<WalletKind | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await authFetch(`/api/challenge/backstory?versionId=${encodeURIComponent(versionId)}`).catch(() => null);
    const out = (r?.ok ? ((await r.json()) as Info) : { mine: false }) as Info;
    setInfo(out);
    return out;
  }, [versionId]);
  useEffect(() => {
    void load().then((out) => setText(out.backstory?.text ?? ''));
  }, [load, wallet?.token]);
  useEffect(() => {
    // Which wallet can send from here: the Farcaster app's, or a wallet sign-in's (with a wallet in this browser).
    void inMiniApp().then((app) => setKind(app ? 'miniapp' : wallet && typeof window !== 'undefined' && (window as unknown as { ethereum?: unknown }).ethereum ? 'injected' : null));
  }, [wallet]);
  if (!info?.mine) return null;

  const save = async () => {
    setBusy(true);
    setNote(null);
    const r = await authFetch('/api/challenge/backstory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId, text }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { backstory?: StoredBackstory; unchanged?: boolean; error?: string };
    setBusy(false);
    if (!r?.ok || !out.backstory) return setNote(out.error ?? 'Couldn’t save it. Try again.');
    setNote(out.unchanged ? A.unchanged : A.saved);
    onBackstory?.(out.backstory);
    await load();
  };

  const submit = async () => {
    if (!kind) return;
    setBusy(true);
    setNote(null);
    try {
      const w = await connect(kind);
      if ('error' in w) return setNote(w.error === 'cancelled' ? W.cancelled : W.noWallet);
      if (!(await hasGasForClaim(w))) return setNote(W.needsEth);
      setStage(W.pinning);
      const r = await authFetch('/api/challenge/backstory/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId }) }).catch(() => null);
      const p = (await r?.json().catch(() => ({}))) as { id?: string; to?: string; data?: string; error?: string };
      if (!r?.ok || !p.id || !p.to || !p.data) return setNote(p.error ?? W.pinFailed);
      setStage(W.confirm);
      const sent = await sendClaim(w, p.to, p.data);
      if (!sent.ok) return setNote(sent.cancelled ? W.cancelled : W.noWallet);
      setStage(W.waiting);
      const c = await authFetch('/api/challenge/backstory/claimed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p.id, tx: sent.hash }) }).catch(() => null);
      const out = (await c?.json().catch(() => ({}))) as { claimId?: string; error?: string };
      setNote(c?.status === 200 && out.claimId ? W.done(out.claimId) : out.error ?? W.pendingConfirm);
    } finally {
      setStage(null);
      setBusy(false);
      await load();
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.copyText ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the text is selectable in the box */
    }
  };

  const saved = info.backstory ?? null;
  const claims = info.claims ?? null;
  const fromHere = Boolean(kind && info.inApp && info.ready && claims && claims.left > 0);
  return (
    <section className="bb-backstory" data-slot="add-backstory" aria-label={saved ? A.edit : A.head}>
      <h2 className="sf-head">{saved ? A.edit : A.head}</h2>
      <div className="bb-cols">
        <div className="bb-box">
          <p className="dz-muted bb-intro">{A.intro}</p>
          <PublishedTextField id="bb-backstory" label={A.head} value={text} onChange={setText} rows={6} maxLength={BACKSTORY_MAX} />
          <button type="button" className="ia-button" onClick={save} disabled={busy || !text.trim()}>
            {busy && !stage ? A.saving : A.save}
          </button>
        </div>
        <aside className="bb-guide" aria-label={A.guideHead}>
          <h3>{A.guideHead}</h3>
          <ol>
            {BACKSTORY_GUIDE.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ol>
        </aside>
      </div>
      {note && (
        <p className="bb-note" role="status">
          {note}
        </p>
      )}
      <section className="bb-bounty" data-slot="bounty">
        <h3>{W.head}</h3>
        {claims && claims.mine.length > 0 && (
          <ul className="bb-claims" aria-label={W.yours}>
            {claims.mine.map((c) => (
              <li key={c.id}>
                {c.claimId ? W.claim(c.claimId) : c.outcome === 'reverted' ? W.claimFailed : W.claimPending} ·{' '}
                <a href={`https://basescan.org/tx/${c.txHash}`} target="_blank" rel="noreferrer">
                  {W.tx} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
        {!saved ? (
          <p className="dz-muted">{W.saveFirst}</p>
        ) : fromHere ? (
          <>
            <p className="bb-warning">
              <strong>{W.warning}</strong>
            </p>
            <p className="dz-muted">{W.needsEth}</p>
            <button type="button" className="ia-button" onClick={submit} disabled={busy}>
              {stage ?? W.submit}
            </button>
            <p className="dz-muted">{W.left(claims!.left, claims!.max)}</p>
          </>
        ) : (
          <>
            <p className="dz-muted">{claims && claims.left === 0 ? W.none(claims.max) : info.inApp && kind && !info.ready ? W.notSetUp : W.elsewhere}</p>
            {info.copyText && (
              <>
                <textarea className="bb-copy" readOnly rows={6} value={info.copyText} aria-label={W.copy} />
                <button type="button" className="ia-button" onClick={copy}>
                  {copied ? W.copied : W.copy}
                </button>
              </>
            )}
          </>
        )}
        {info.bountyUrl && (
          <p className="bb-links">
            <a href={info.bountyUrl} target="_blank" rel="noreferrer">
              {W.openBounty} ↗
            </a>{' '}
            <span className="dz-muted">{W.voteThere}</span>
          </p>
        )}
      </section>
    </section>
  );
}
