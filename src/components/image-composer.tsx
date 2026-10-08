'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { ADD_IMAGE_EVENT, deleteDraft, draftKey, loadDraft, saveDraft, type AddImageDetail } from '~/lib/images/client';
import { ConsentScreen, PublishedTextField, PublishFlow } from './publish-words';
import { SignInButton } from './sign-in';

/**
 * "Add an image" (docs/proposals/add-an-image.md, section 2): a sheet over the reader. The
 * passage (1 to 8 blocks, widened or narrowed here), the person's own prompt, an optional style
 * shown in full, the one model, the rules, then Generate. The draft is kept on this device only;
 * "Preview and publish" goes through the usual consent and preview. Labelled "Trial".
 */
type Status = {
  label: string;
  ready: boolean;
  signedIn: boolean;
  invited?: boolean;
  consented?: boolean;
  left?: number;
  publishesLeft?: number;
  perDay: number;
  maxBlocks: number;
  rules: string;
  model: { name: string; licence: string; host: string };
  styles: { id: string; name: string; text: string }[];
};
type Wording = { version: string; line: string; title: string; text: string[]; sha256: string };

/** The chapter's block ids in reading order, from the page (only blocks a passage can start or end on). */
function blockIds(): number[] {
  return Array.from(document.querySelectorAll<HTMLElement>('article.chapter > .block[id]'))
    .filter((el) => !el.classList.contains('break'))
    .map((el) => Number(el.id.match(/-b(\d+)$/)?.[1]))
    .filter((n) => Number.isInteger(n));
}

export function ImageComposer() {
  const [at, setAt] = useState<AddImageDetail | null>(null);
  useEffect(() => {
    const on = (e: Event) => setAt((e as CustomEvent<AddImageDetail>).detail);
    window.addEventListener(ADD_IMAGE_EVENT, on);
    return () => window.removeEventListener(ADD_IMAGE_EVENT, on);
  }, []);
  if (!at) return null;
  return <Sheet initial={at} onClose={() => setAt(null)} />;
}

function Sheet({ initial, onClose }: { initial: AddImageDetail; onClose: () => void }) {
  const auth = useAuth();
  const [range, setRange] = useState(initial);
  const [status, setStatus] = useState<Status | null>(null);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ ticket: string; image: string } | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const [consent, setConsent] = useState<Wording | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const ids = useRef<number[]>([]);

  const refresh = useCallback(async () => {
    const res = await authFetch(`/api/images/status?chapter=${range.chapter}&start=${range.start}`).catch(() => null);
    if (res?.ok) setStatus((await res.json()) as Status);
  }, [range.chapter, range.start]);
  useEffect(() => {
    void refresh();
  }, [refresh, auth.kind]);

  // Focus in, Escape closes, focus back where it was.
  useEffect(() => {
    ids.current = blockIds();
    const opener = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLElement>('button, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose]);

  // A draft kept on this device for this passage comes back with the sheet.
  useEffect(() => {
    void loadDraft(draftKey(range)).then((d) => {
      if (!d) return setDraft(null);
      setDraft({ ticket: d.ticket, image: d.image });
      setPrompt(d.prompt);
      setStyle(d.style);
    });
  }, [range]);

  const passage = ids.current.filter((i) => i >= range.start && i <= range.end);
  const widen = (side: 'start' | 'end', d: 1 | -1) => {
    const all = ids.current;
    const i = all.indexOf(range[side]);
    const j = i + d;
    if (j < 0 || j >= all.length) return;
    const next = { ...range, [side]: all[j] };
    if (next.end < next.start) return;
    if (all.filter((x) => x >= next.start && x <= next.end).length > (status?.maxBlocks ?? 8)) return;
    setRange(next);
  };
  const label = (i: number) => document.getElementById(`c${range.chapter}-b${i}`)?.getAttribute('data-label');
  const from = label(range.start), to = label(range.end);
  const where = from ? (from === to || !to ? `¶ ${from}` : `¶ ${from}–${to}`) : `Chapter ${range.chapter}`;

  const startConsent = async () => {
    const res = await authFetch('/api/consent');
    if (res.ok) setConsent(((await res.json()) as { wording: Wording }).wording);
  };
  const agree = async () => {
    const res = await authFetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: consent?.sha256 }) });
    if (res.ok) {
      setConsent(null);
      void refresh();
    } else setNote('Could not record your agreement');
  };

  const generate = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await authFetch('/api/images/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chapter: range.chapter, start: range.start, end: range.end, prompt, style }),
      });
      const out = (await res.json().catch(() => ({}))) as { ticket?: string; image?: string; error?: string; left?: number };
      if (res.ok && out.ticket && out.image) {
        setDraft({ ticket: out.ticket, image: out.image });
        await saveDraft({ key: draftKey(range), ...range, prompt, style, ticket: out.ticket, image: out.image, savedAt: new Date().toISOString() });
      } else setNote(out.error ?? 'Could not make the image');
    } catch {
      setNote('No connection. Try again.');
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const publish = async () => {
    if (!draft) return;
    const res = await authFetch('/api/images/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: draft.ticket, image: draft.image }) });
    const out = (await res.json().catch(() => ({}))) as { page?: string; error?: string };
    if (!res.ok || !out.page) throw new Error(out.error ?? 'Could not publish');
    await deleteDraft(draftKey(range));
    setPublished(out.page);
  };

  const chosen = status?.styles.find((s) => s.id === style) ?? null;
  const left = status?.left ?? 0;
  return (
    <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className="recipe-sheet image-composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <div className="recipe-head">
          <p id="composer-title" className="recipe-eyebrow">
            Add an image · {status?.label ?? 'Trial'}
          </p>
          <button type="button" className="sheet-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <section className="ic-passage" aria-label="The passage">
          <p className="ic-label">
            Chapter {range.chapter} · {where} · {passage.length} {passage.length === 1 ? 'block' : 'blocks'}
          </p>
          <div className="ic-text">
            {passage.map((i) => (
              <p key={i}>{document.getElementById(`c${range.chapter}-b${i}`)?.textContent?.trim()}</p>
            ))}
          </div>
          <div className="ic-range">
            <button type="button" onClick={() => widen('start', -1)}>+ before</button>
            <button type="button" onClick={() => widen('start', 1)} disabled={range.start === range.end}>− first</button>
            <button type="button" onClick={() => widen('end', -1)} disabled={range.start === range.end}>− last</button>
            <button type="button" onClick={() => widen('end', 1)}>+ after</button>
          </div>
          <p className="ic-note">The book&apos;s text is shown to help you write. It is never sent to a model.</p>
        </section>

        {published ? (
          <p className="ic-done">
            Published. <Link href={published}>See it</Link>
          </p>
        ) : auth.kind !== 'signed-in' ? (
          <div className="ic-gate">
            <p>Sign in to make an image. The trial is open to invited readers.</p>
            <SignInButton />
          </div>
        ) : !status ? (
          <p className="ic-note">…</p>
        ) : !status.invited ? (
          <p className="ic-gate">The trial is open to invited readers only, for now.</p>
        ) : !status.ready ? (
          <p className="ic-gate">Making images isn&apos;t set up on this deployment yet.</p>
        ) : !status.consented ? (
          <div className="ic-gate">
            <p>Before your first image: how your prompt is published.</p>
            <button type="button" className="as-primary" onClick={startConsent}>
              Read and agree
            </button>
          </div>
        ) : (
          <>
            <PublishedTextField id="ic-prompt" label="Describe the image" value={prompt} onChange={setPrompt} rows={4} maxLength={600} />
            <p className="ic-note">Your prompt is sent to Groq to be checked and to fal.ai to make the image. It becomes public only if you publish.</p>

            <fieldset className="ic-style">
              <legend>Style</legend>
              <label>
                <input type="radio" name="ic-style" checked={style === null} onChange={() => setStyle(null)} /> None
              </label>
              {status.styles.map((s) => (
                <label key={s.id}>
                  <input type="radio" name="ic-style" checked={style === s.id} onChange={() => setStyle(s.id)} /> {s.name} (the project&apos;s starting style)
                </label>
              ))}
              {chosen && <p className="ic-style-text">Added to your prompt, and published with it (model-drafted): {chosen.text}</p>}
            </fieldset>

            <p className="ic-model">
              {status.model.name} · open weights, {status.model.licence} · runs on {status.model.host}
            </p>
            <p className="ic-rules">{status.rules}</p>

            <div className="ic-actions">
              <button type="button" className="as-primary" onClick={generate} disabled={busy || !prompt.trim() || left <= 0}>
                {busy ? 'Making it…' : draft ? 'Generate again' : 'Generate'}
              </button>
              <span className="ic-left">
                {left} of {status.perDay} left today
              </span>
            </div>
          </>
        )}
        {note && <p className="consent-error">{note}</p>}

        {draft && !published && (
          <section className="ic-draft" aria-label="Draft">
            <p className="ic-label">Draft · only you can see this · AI-generated image</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.image} alt={`AI-generated draft: ${prompt.split(/(?<=[.!?])\s/)[0]}`} width={1024} height={576} />
            {status?.consented && (
              <PublishFlow
                preview={
                  <figure className="ic-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={draft.image} alt="" width={1024} height={576} />
                    <figcaption className="block-caption">
                      Chapter {range.chapter} · {where} · AI-generated image · by {auth.kind === 'signed-in' ? `FID ${auth.fid}` : 'you'} · not by the author
                    </figcaption>
                    <p className="ic-prompt-preview">{chosen ? `${prompt}\n\n${chosen.text}` : prompt}</p>
                  </figure>
                }
                onPublish={publish}
              />
            )}
          </section>
        )}
        {consent && <ConsentScreen wording={consent} name={null} onAgree={agree} onCancel={() => setConsent(null)} error={null} />}
      </div>
    </div>
  );
}
