'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import type { PickOption } from '~/lib/pick-options';
import type { Pick } from '~/lib/picks';
import { SignInButton } from './sign-in';

/**
 * The admins' review page (owner, 2026-10-29: "a review page per chapter and per glossary term (everything submitted,
 * with hide and pick)"). Admins only: the server answers everyone else 401 or 403. For each moment of a chapter, or for
 * a term, every image it can show, with Hide and Pick. A pick is shown to readers labelled "Picked by @…" with their
 * switch beside it (principle 5); here it is only marked "Picked by @…". Model-drafted wording (coding agent, 2026-10-29).
 */
const W = {
  loading: 'Loading…',
  signedOut: 'Sign in to review. Only admins can open this page.',
  notAdmin: 'This page is for admins.',
  failed: 'Couldn’t load the review. Try again.',
  none: 'Nothing here has an image yet.',
  pick: 'Pick for this moment',
  pickTerm: 'Pick for this word',
  clear: 'Clear the pick',
  hide: 'Hide',
  hidden: 'Hidden',
  picked: (by: string) => `Picked by @${by.replace(/^@/, '')}`,
  seeded: 'Seeded by the project',
  confirmHide: 'Hide this image for everyone?',
};

type Moment = { target: string; idx: number; images: PickOption[]; pick: Pick | null };
type Data = { chapter: number; moments: Moment[] } | { term: string; images: PickOption[]; pick: Pick | null };

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="you admin-review">
      <p className="you-kicker label">
        <Link href="/admin/review">Admin review</Link>
      </p>
      <h1 className="you-title">{title}</h1>
      {children}
    </main>
  );
}

export function AdminReview({ query, title }: { query: string; title: string }) {
  const auth = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'idle' | 'failed' | 'forbidden'>('idle');
  const load = useCallback(async () => {
    const res = await authFetch(`/api/admin/picks/review?${query}`).catch(() => null);
    if (res?.ok) setData((await res.json()) as Data);
    else if (res?.status === 403) setState('forbidden');
    else if (res?.status !== 401) setState('failed');
  }, [query]);
  useEffect(() => {
    if (auth.kind === 'signed-in') void load();
  }, [auth.kind, load]);
  if (auth.kind === 'loading') return <Frame title={title}><p className="you-note">{W.loading}</p></Frame>;
  if (auth.kind === 'signed-out')
    return (
      <Frame title={title}>
        <p className="you-lede">{W.signedOut}</p>
        <div className="you-sign-in">
          <SignInButton className="ic-secondary" />
        </div>
      </Frame>
    );
  if (state === 'forbidden') return <Frame title={title}><p className="you-note">{W.notAdmin}</p></Frame>;
  if (state === 'failed') return <Frame title={title}><p className="you-note" role="alert">{W.failed}</p></Frame>;
  if (!data) return <Frame title={title}><p className="you-note">{W.loading}</p></Frame>;
  if ('moments' in data)
    return (
      <Frame title={title}>
        {data.moments.length === 0 && <p className="you-note">{W.none}</p>}
        {data.moments.map((m) => (
          <section key={m.target} className="ar-moment">
            <h2 className="ar-head">
              <Link href={`/chapter/${data.chapter}#${m.target}`}>{m.target}</Link>
              {m.pick && <span className="ar-picked"> · {W.picked(m.pick.by)}</span>}
            </h2>
            <Images images={m.images} pick={m.pick} targetKind="moment" target={m.target} reload={load} />
          </section>
        ))}
      </Frame>
    );
  return (
    <Frame title={title}>
      {data.images.length === 0 && <p className="you-note">{W.none}</p>}
      {data.pick && <p className="ar-picked">{W.picked(data.pick.by)}</p>}
      <Images images={data.images} pick={data.pick} targetKind="term" target={data.term} reload={load} />
    </Frame>
  );
}

function Images({ images, pick, targetKind, target, reload }: { images: PickOption[]; pick: Pick | null; targetKind: 'moment' | 'term'; target: string; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async (url: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await authFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (r?.ok) await reload();
    else setError((((await r?.json().catch(() => null)) as { error?: string } | null)?.error) ?? 'That didn’t work.');
  };
  return (
    <>
      <ul className="ar-images">
        {images.map((im) => {
          const isPick = pick?.imageRef === im.key;
          return (
            <li key={im.key} className={`${im.hidden ? 'is-hidden' : ''}${isPick ? ' is-picked' : ''}`}>
              <Link href={im.href}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={im.alt} width={1024} height={576} loading="lazy" />
              </Link>
              <p className="block-caption">
                {im.by ? `AI image · by ${im.by}` : W.seeded} · {im.likes} {im.likes === 1 ? 'like' : 'likes'}
                {isPick && pick ? ` · ${W.picked(pick.by)}` : ''}
              </p>
              <div className="ar-actions">
                {im.hidden ? (
                  <span className="ar-hidden">{W.hidden}</span>
                ) : (
                  <>
                    {!isPick && (
                      <button type="button" className="ic-secondary" disabled={busy} onClick={() => void post('/api/admin/picks', { targetKind, target, imageKind: im.kind, imageRef: im.key })}>
                        {targetKind === 'moment' ? W.pick : W.pickTerm}
                      </button>
                    )}
                    {isPick && (
                      <button type="button" className="ic-secondary" disabled={busy} onClick={() => void post('/api/admin/picks', { targetKind, target, imageKind: 'none' })}>
                        {W.clear}
                      </button>
                    )}
                    <button type="button" className="ic-secondary" disabled={busy} onClick={() => window.confirm(W.confirmHide) && void post('/api/admin/hide', { kind: im.kind, id: im.key })}>
                      {W.hide}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="you-note" role="alert">{error}</p>}
    </>
  );
}
