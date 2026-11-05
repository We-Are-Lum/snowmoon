'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authFetch, webNameProof } from '~/lib/client-auth';
import { loadDraft, markPublished, saveDraft, type FlowDraft } from '~/lib/challenge/flow-storage';
import { AiTag } from './ai-tag';

/**
 * The preview, /challenge/make/<draft> (owner, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S3): the new
 * picture, the one it started from (small), the character and moment, "Your words" exactly as they will be published,
 * Try again (another picture with the same words; it counts as a picture) and Publish, and "How it was made" (the exact
 * prompt and the model, collapsed). The draft lives only in this tab (src/lib/challenge/flow-storage.ts).
 *
 * Navigation: "‹ Back" is the browser's back, to the remix screen with the words kept; "✕" goes to the hub at the
 * character's card, asking once when the picture isn't published. Publish replaces this page with the published
 * picture's page (/challenge/p/<version>), so back never returns to a publish button. Its words come with the draft,
 * from the server's answer.
 */
export function ChallengePreview({ id }: { id: string }) {
  const router = useRouter();
  const [d, setD] = useState<FlowDraft | null | 'gone'>(null);
  const [busy, setBusy] = useState<'again' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setD(loadDraft(id) ?? 'gone'), [id]);
  if (d === null) return <div className="mk-page" aria-busy="true" />;
  if (d === 'gone')
    return (
      <div className="mk-page" data-step="preview">
        <p className="dz-muted">This preview is no longer here.</p>
        <p>
          <Link href="/challenge">←</Link>
        </p>
      </div>
    );
  const w = d.w;
  const hub = `/challenge#${d.character}`;

  const again = async () => {
    setBusy('again');
    setError(null);
    const r = await authFetch('/api/challenge/make', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: d.from, moment: d.moment.id, words: d.words }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { ticket?: string; image?: string; prompt?: string; error?: string };
    setBusy(null);
    if (!r?.ok || !out.ticket || !out.image) return setError(out.error ?? 'Could not make it');
    const next = { ...d, ticket: out.ticket, image: out.image, prompt: out.prompt ?? d.prompt };
    saveDraft(next);
    setD(next);
  };
  const publish = async () => {
    setBusy('publish');
    setError(null);
    const r = await authFetch('/api/images/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: d.ticket, image: d.image, nameProof: webNameProof() }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { versionId?: string; error?: string };
    if (!r?.ok || !out.versionId) {
      setBusy(null);
      return setError(out.error ?? 'Could not publish it');
    }
    markPublished(d, out.versionId);
    router.replace(`/challenge/p/${out.versionId}`);
  };
  const close = () => {
    if (window.confirm(w.leave)) router.push(hub);
  };

  return (
    <div className="mk-page" data-step="preview">
      <nav className="mk-bar">
        <button type="button" className="mk-back" onClick={() => router.back()}>
          {w.back}
        </button>
        <button type="button" className="mk-close" aria-label={w.close} onClick={close}>
          ✕
        </button>
      </nav>
      <figure className="mk-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mk-picture" src={d.image} alt={`AI-generated picture of ${d.name}, not by the author`} />
        <figcaption className="mk-cap">
          <AiTag />
          <span className="mk-from">
            <span className="dz-muted">{w.startedFrom}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mk-thumb" src={d.sourceUrl} alt="" width={48} height={64} />
          </span>
        </figcaption>
      </figure>
      <p className="mk-at">
        {d.name} · {d.moment.title} ({d.moment.chip})
      </p>
      <p className="mk-words">
        <span className="dz-muted">{w.yourWords}</span> “{d.words}”
      </p>
      <div className="mk-actions">
        <button type="button" className="ic-secondary mk-again" onClick={again} disabled={busy !== null}>
          {busy === 'again' ? w.making : w.tryAgain}
        </button>
        <button type="button" className="rl-remix mk-publish" onClick={publish} disabled={busy !== null}>
          {busy === 'publish' ? w.publishing : w.publish}
        </button>
      </div>
      {error && (
        <p className="ia-note" role="alert">
          {error}
        </p>
      )}
      <details className="mk-how">
        <summary>{w.howMade}</summary>
        <p className="dz-muted">{d.model}</p>
        <pre className="mk-prompt">{d.prompt}</pre>
      </details>
    </div>
  );
}
