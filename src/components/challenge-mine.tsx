'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, useSocialSession } from '~/lib/client-auth';
import type { MinePicture, MineWords } from '~/lib/challenge/mine';
import { AdminExampleLabel } from './admin-example-label';
import { AiTag } from './ai-tag';

/**
 * "Your challenge pictures" (owner, 2026-11-12), on the You page: the signed-in person's own published challenge
 * pictures, in two groups, newest first (GET /api/challenge/mine, src/lib/challenge/mine.ts). "Published, not submitted",
 * each with "Submit your post" (to its page, where the submit box is); "Entries", each with its post and Withdraw while
 * entries are open (asked once), an admin's examples labelled "Admin example". Every word comes from the server. Nothing
 * shows until it has loaded, or when the challenge isn't open to this person.
 */
export function ChallengeMine() {
  const [data, setData] = useState<{ published: MinePicture[]; entries: MinePicture[]; w: MineWords } | null>(null);
  const load = useCallback(() => {
    authFetch('/api/challenge/mine')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d && Array.isArray(d.published) ? d : null))
      .catch(() => setData(null));
  }, []);
  useEffect(load, [load]);
  if (!data) return null;
  const { w } = data;
  return (
    <section className="you-section ch-mine" id="your-challenge-pictures" aria-labelledby="you-challenge">
      <h2 id="you-challenge">{w.title}</h2>
      {!data.published.length && !data.entries.length ? (
        <p className="you-note">
          {w.empty} <Link href="/challenge">{w.remix}</Link>
        </p>
      ) : (
        <>
          <Group id="ch-mine-published" head={w.publishedHead} items={data.published} w={w} render={(p) => <Link className="ic-secondary ch-mine-submit" href={`${p.href}#submit`}>{w.submit}</Link>} />
          <Group id="ch-mine-entries" head={w.entriesHead} items={data.entries} w={w} render={(p) => <EntryActions p={p} w={w} done={load} />} />
        </>
      )}
    </section>
  );
}

function Group({ id, head, items, w, render }: { id: string; head: string; items: MinePicture[]; w: MineWords; render: (p: MinePicture) => React.ReactNode }) {
  return (
    <div className="ch-mine-group" data-group={id}>
      <h3 id={id}>{head}</h3>
      {items.length ? (
        <ul className="ch-mine-list" aria-labelledby={id}>
          {items.map((p) => (
            <li key={p.versionId} className="ch-mine-item" data-version={p.versionId} data-example={p.example ? 'admin' : undefined}>
              <Link href={p.href} className="ch-mine-thumb" prefetch={false}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.thumb ? <img src={p.thumb} alt={`AI-generated picture of ${p.name}`} width={96} height={54} loading="lazy" /> : <span className="cc-empty" />}
              </Link>
              <div className="ch-mine-body">
                <span className="ch-mine-name">
                  <Link href={p.href} prefetch={false}>
                    {p.name}
                  </Link>{' '}
                  <AiTag />
                  {p.example && <AdminExampleLabel label={w.exampleLabel} info={w.exampleInfo} />}
                </span>
                <time className="ch-mine-at" dateTime={p.createdAt}>
                  {p.createdAt.slice(0, 10)}
                </time>
                <div className="ch-mine-actions">{render(p)}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="you-note">{w.none}</p>
      )}
    </div>
  );
}

function EntryActions({ p, w, done }: { p: MinePicture; w: MineWords; done: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const withdraw = async () => {
    setBusy(true);
    const r = await authFetch('/api/challenge/submit', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId: p.versionId }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    setAsking(false);
    if (r?.ok) {
      setNote(w.withdrawn);
      done();
    } else setNote(out?.error ?? null);
  };
  return (
    <>
      {p.post && (
        <a className="ch-mine-post" href={p.post.url} target="_blank" rel="noopener">
          {w.post} · @{p.post.handle}
        </a>
      )}
      {p.canWithdraw &&
        (asking ? (
          <span className="ch-mine-ask" role="group" aria-label={w.ask}>
            {w.ask}{' '}
            <button type="button" className="ic-secondary" disabled={busy} onClick={withdraw}>
              {w.withdraw}
            </button>{' '}
            <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking(false)}>
              {w.cancel}
            </button>
          </span>
        ) : (
          <button type="button" className="ic-secondary ch-mine-withdraw" onClick={() => setAsking(true)}>
            {w.withdraw}
          </button>
        ))}
      {note && <span className="you-note" role="status">{note}</span>}
    </>
  );
}

/** "Yours" beside "Rules · Every entry" on the challenge home (owner, 2026-11-12): only when signed in. */
export function ChallengeYoursLink({ label }: { label: string }) {
  const auth = useAuth();
  const social = useSocialSession();
  if (auth.kind !== 'signed-in' && social === null) return null;
  return (
    <>
      {' · '}
      <Link href="/you#your-challenge-pictures" className="ch-yours-link" prefetch={false}>
        {label}
      </Link>
    </>
  );
}
