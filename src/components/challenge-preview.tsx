'use client';

import { SETTING_WORDING } from '~/lib/challenge/settings-wording';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authFetch, webNameProof } from '~/lib/client-auth';
import { loadDraft, markPublished, saveDraft, type FlowDraft } from '~/lib/challenge/flow-storage';
import { AiTag } from './ai-tag';
import { BackstoryField } from './challenge-backstory';
import { BACKSTORY_WORDING } from '~/lib/challenge/backstory';

/**
 * The preview, /challenge/make/<draft> (owner, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S3): the new
 * picture, the one it started from (small), the character (and its moment while the moments are on), "Your words" exactly as they will be published,
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
  // The optional backstory (owner, 2026-11-09): typed here only; a refusal by the check offers publishing without it.
  const [story, setStory] = useState('');
  const [storyRefused, setStoryRefused] = useState(false);
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
    // The same request again: the moment while the moments are on; else the same style choice (Random draws afresh) and model.
    const body = d.moment ? { from: d.from, moment: d.moment.id, words: d.words, model: d.modelId } : { from: d.from, words: d.words, style: d.style, model: d.modelId };
    const r = await authFetch('/api/challenge/make', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { ticket?: string; image?: string; prompt?: string; style?: string | null; setting?: { id: string; text: string; blocks: string[] } | null; error?: string };
    setBusy(null);
    if (!r?.ok || !out.ticket || !out.image) return setError(out.error ?? 'Could not make it');
    const next = { ...d, ticket: out.ticket, image: out.image, prompt: out.prompt ?? d.prompt, styleLine: out.style ?? d.styleLine ?? null, setting: out.setting ?? null };
    saveDraft(next);
    setD(next);
  };
  const publish = async (withStory = true) => {
    setBusy('publish');
    setError(null);
    const backstory = withStory && story.trim() ? { text: story } : undefined;
    const r = await authFetch('/api/images/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: d.ticket, image: d.image, nameProof: webNameProof(), ...(backstory ? { backstory } : {}) }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { versionId?: string; error?: string; reason?: string };
    if (!r?.ok || !out.versionId) {
      setBusy(null);
      setStoryRefused(out.reason === 'backstory');
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
        <img className="mk-picture" src={d.image} alt={`AI-generated picture of ${d.name}`} />
        <figcaption className="mk-cap">
          <AiTag />
          <span className="mk-from">
            <span className="dz-muted">{w.startedFrom}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mk-thumb" src={d.sourceUrl} alt="" width={48} height={64} />
          </span>
        </figcaption>
      </figure>
      <p className="mk-at">{d.moment ? `${d.name} · ${d.moment.title} (${d.moment.chip})` : d.name}</p>
      <p className="mk-words">
        <span className="dz-muted">{w.yourWords}</span> “{d.words}”
      </p>
      <BackstoryField name={d.name} text={story} onText={(v) => { setStory(v); setStoryRefused(false); }} />
      <div className="mk-actions">
        <button type="button" className="ic-secondary mk-again" onClick={again} disabled={busy !== null}>
          {busy === 'again' ? w.making : w.tryAgain}
        </button>
        <button type="button" className="rl-remix mk-publish" onClick={() => publish()} disabled={busy !== null}>
          {busy === 'publish' ? w.publishing : w.publish}
        </button>
      </div>
      {error && (
        <p className="ia-note" role="alert">
          {error}
        </p>
      )}
      {storyRefused && (
        <button type="button" className="ic-secondary mk-publish-without" onClick={() => publish(false)} disabled={busy !== null}>
          {BACKSTORY_WORDING.withoutIt}
        </button>
      )}
      <details className="mk-how">
        <summary>{w.howMade}</summary>
        <p className="dz-muted">{d.model}</p>
        {d.styleLine && (
          <p className="dz-muted mk-style-line">
            {w.style}: {d.styleLine}
          </p>
        )}
        {d.setting && (
          <p className="dz-muted mk-setting-line" data-slot="setting">
            {SETTING_WORDING.head}: {SETTING_WORDING.line(d.setting)}
          </p>
        )}
        <pre className="mk-prompt">{d.prompt}</pre>
      </details>
    </div>
  );
}
