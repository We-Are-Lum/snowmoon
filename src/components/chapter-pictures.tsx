'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { CHAPTER_PICTURES } from '~/lib/config';
import { resetLocal } from '~/lib/challenge/model-wording';
import type { ModelRowEntry } from '~/lib/challenge/models';
import { adminName, localDay as day, lookName, modelLine, type Look, type PictureDecision, type PictureVersion } from '~/lib/chapter-pictures/shared';
import { useChallengeModel } from './challenge-model-row';
import { PublishedTextField } from './publish-words';

/**
 * The admins' redo of the edition's chapter pictures on /you/illustrations (owner, 2026-11-18, option B). Each picture:
 * what the chapter shows now, a Redo with a note and a model (the open one first and the default; a closed one after
 * its maker's notice and the 18+ box, as the challenge asks), every version with Keep or "Show again", and the
 * committed file one tap away. Above the list: the look every redo uses, for every chapter or one, and the admins' day
 * of spending. A draft is private: its picture is fetched with the admin's sign-in and shown from memory, never from a
 * public address. Every sentence is DRAFT wording (coding agent, 2026-11-18), kept in P.
 */
export const P = {
  shownCommitted: 'The chapter shows the edition’s first picture (the committed file).',
  shownVersion: (v: PictureVersion, d: PictureDecision | undefined) => `The chapter shows a redo${d ? `, kept by ${adminName(d.byFid, d.byHandle)} on ${day(d.at)}` : ''}.`,
  redo: 'Redo this picture',
  noteLabel: 'Your note for the redo (it goes into the prompt and is shown in the picture’s recipe, credited to you)',
  model: 'Model',
  look: (l: Look | null, own: boolean) => (l ? `Style: ${lookName(l)}${own ? ' (this chapter’s own)' : ' (every chapter’s)'}` : 'Style: none set yet'),
  make: 'Make the draft',
  making: 'Making…',
  cancel: 'Cancel',
  draft: 'Draft: only admins see it until one of you keeps it.',
  keep: 'Keep: show it in the chapter now',
  showAgain: 'Show this one again',
  shownNow: 'Shown in the chapter now',
  keptBefore: 'Kept before',
  original: 'Show the first picture again (the committed file)',
  versions: 'Versions',
  history: 'Who showed what',
  historyLine: (d: PictureDecision) => `${day(d.at)} · ${adminName(d.byFid, d.byHandle)} · ${d.action === 'keep' ? 'kept a redo' : d.versionId ? 'showed a redo again' : 'showed the first picture again'}`,
  versionMeta: (v: PictureVersion, modelName: string) => `${modelLine(modelName, v.maker, v.open)} · ${lookName(v.look)} · by FID ${v.madeByFid} · ${day(v.madeAt)}`,
  lettered: 'This picture has lettering: it can be redone once the lettering work ships.',
  notReady: 'Redoing pictures needs the chapter-picture migration first (0042_chapter_picture_versions).',
  noStorage: 'Kept pictures can’t be stored on this copy of the site.',
  cap: (spent: number, cap: number, reset: string) => `Admins’ chapter pictures today: $${spent.toFixed(2)} of $${cap}. The day resets at ${reset}.`,
  capReached: (cap: number, reset: string) => `Today’s $${cap} for admins’ chapter pictures is used up. More at ${reset}.`,
  lookTitle: 'The look for redos',
  lookLede: 'Every redo uses this style, in every chapter, unless a chapter has its own. No artist, studio or film names and no real people: the prompt check refuses them. No words in the picture.',
  lookFor: 'For',
  every: 'Every chapter',
  chapter: (n: number) => `Chapter ${n}`,
  styleOption: 'One of the site’s styles',
  lineOption: 'A line you write',
  lineLabel: 'The look, in your words (shown in every redo’s recipe)',
  clear: 'Use every chapter’s look',
  saveLook: 'Save the look',
  lookNow: (l: Look | null) => (l ? `${lookName(l)}: ${l.text}` : 'None yet.'),
  couldNot: 'Could not do it',
} as const;

export interface PicturesState {
  ready: boolean;
  storage: boolean;
  models: ModelRowEntry[];
  styles: { id: string; label: string; text: string }[];
  looks: { all: { look: Look; byFid: number; at: string } | null; chapters: Record<number, { look: Look | null; byFid: number; at: string }> };
  cap: { spentUsd: number; capUsd: number; resetAt: string };
}
export interface PictureItem {
  id: string;
  chapter: number;
  redoable: boolean;
  shown: string | null;
  versions: PictureVersion[];
  decisions: PictureDecision[];
  image: { url: string; width: number; height: number } | null;
}

const lookOf = (s: PicturesState, chapter: number) => (s.looks.chapters[chapter] ? s.looks.chapters[chapter].look : null) ?? s.looks.all?.look ?? null;

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return { ok: Boolean(res?.ok), json: ((await res?.json().catch(() => null)) ?? {}) as Record<string, unknown> };
}
const errorOf = (j: Record<string, unknown>) => {
  const e = typeof j.error === 'string' ? j.error : P.couldNot;
  return e.includes('{reset}') ? e.replace('{reset}', resetLocal(new Date(Date.parse(String(j.resetAt ?? '')) - 1 || Date.now()))) : e;
};

/** A draft's picture: fetched with the admin's sign-in, shown from memory (it has no public address). */
function DraftImage({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    void authFetch(`/api/you/illustrations/draft/${id}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b) setSrc((url = URL.createObjectURL(b)));
      })
      .catch(() => {});
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} width={1024} height={576} /> : <div className="cp-thumb-wait" aria-hidden="true" />;
}

/** The look panel above the list. */
export function LookPanel({ state, reload }: { state: PicturesState; reload: () => Promise<void> }) {
  const [chapter, setChapter] = useState<number | null>(null);
  const current = chapter === null ? (state.looks.all?.look ?? null) : (state.looks.chapters[chapter]?.look ?? null);
  const [kind, setKind] = useState<'style' | 'line'>(current?.kind ?? 'style');
  const [styleId, setStyleId] = useState<string>(current?.kind === 'style' ? current.versionId : (state.styles.find((s) => s.label === 'Comic book')?.id ?? state.styles[0]?.id ?? ''));
  const [line, setLine] = useState(current?.kind === 'line' ? current.text : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(clear = false) {
    setBusy(true);
    setError(null);
    const look = clear ? null : kind === 'style' ? { kind: 'style', id: styleId } : { kind: 'line', text: line };
    const r = await post('/api/you/illustrations/look', { chapter, look });
    setBusy(false);
    if (!r.ok) return setError(errorOf(r.json));
    await reload();
  }
  return (
    <section className="cp-look" aria-labelledby="cp-look-title">
      <h2 id="cp-look-title" className="cp-look-title">
        {P.lookTitle}
      </h2>
      <p className="you-note">{P.lookLede}</p>
      <p className="you-meta" data-look-now="">
        {P.every}: {P.lookNow(state.looks.all?.look ?? null)}
      </p>
      {Object.entries(state.looks.chapters)
        .filter(([, v]) => v.look)
        .map(([n, v]) => (
          <p key={n} className="you-meta">
            {P.chapter(Number(n))}: {P.lookNow(v.look)}
          </p>
        ))}
      <div className="cp-look-form">
        <label className="cp-field">
          <span className="you-meta">{P.lookFor}</span>
          <select value={chapter ?? ''} onChange={(e) => setChapter(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{P.every}</option>
            {Array.from({ length: 32 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {P.chapter(n)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="cp-choice">
          <label>
            <input type="radio" name="cp-look-kind" checked={kind === 'style'} onChange={() => setKind('style')} /> {P.styleOption}
          </label>
          {kind === 'style' && (
            <select aria-label={P.styleOption} value={styleId} onChange={(e) => setStyleId(e.target.value)}>
              {state.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          <label>
            <input type="radio" name="cp-look-kind" checked={kind === 'line'} onChange={() => setKind('line')} /> {P.lineOption}
          </label>
        </fieldset>
        {kind === 'line' && <PublishedTextField id="cp-look-line" label={P.lineLabel} value={line} onChange={setLine} rows={2} maxLength={CHAPTER_PICTURES.lookMaxChars} />}
        <div className="you-actions">
          <button type="button" className="ic-secondary" disabled={busy} onClick={() => void save()}>
            {P.saveLook}
          </button>
          {chapter !== null && state.looks.chapters[chapter]?.look && (
            <button type="button" className="ic-secondary" disabled={busy} onClick={() => void save(true)}>
              {P.clear}
            </button>
          )}
        </div>
        {error && (
          <p className="you-note" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

/** The day's admin spending, and the cap's message once it is reached (the reset in the admin's own time). */
export function CapLine({ cap }: { cap: PicturesState['cap'] }) {
  const [reset, setReset] = useState('00:00 UTC');
  useEffect(() => setReset(resetLocal(new Date(Date.parse(cap.resetAt) - 1))), [cap.resetAt]);
  const reached = cap.spentUsd + 0.05 > cap.capUsd;
  return reached ? (
    <p className="you-note cp-cap is-reached" role="status" data-cap="reached">
      {P.capReached(cap.capUsd, reset)}
    </p>
  ) : (
    <p className="you-meta cp-cap" data-cap="ok">
      {P.cap(cap.spentUsd, cap.capUsd, reset)}
    </p>
  );
}

/** One picture's redo, versions and history. */
export function PicturePanel({ item, state, reload }: { item: PictureItem; state: PicturesState; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = useChallengeModel(state.models);
  const ownLook = Boolean(state.looks.chapters[item.chapter]?.look);
  const look = lookOf(state, item.chapter);
  const keptIds = new Set(item.decisions.filter((d) => d.versionId).map((d) => d.versionId));
  const shownDecision = item.decisions.find((d) => d.versionId === item.shown);

  async function redo() {
    if (!note.trim()) return setError('Write what should change first.');
    const send = async () => {
      setBusy(true);
      setError(null);
      const r = await post('/api/you/illustrations/redo', { jobId: item.id, note, ...m.body() });
      setBusy(false);
      if (!r.ok) return setError(errorOf(r.json));
      setOpen(false);
      setNote('');
      await reload();
    };
    if (m.askFirst(() => void send())) return;
    await send();
  }
  async function show(versionId: string | null) {
    setBusy(true);
    setError(null);
    const r = await post('/api/you/illustrations/show', { jobId: item.id, versionId });
    setBusy(false);
    if (!r.ok) return setError(errorOf(r.json));
    await reload();
  }

  if (!state.ready) return <p className="you-note">{P.notReady}</p>;
  if (!item.redoable) return item.image ? <p className="you-note">{P.lettered}</p> : null;
  const shown = item.versions.find((v) => v.id === item.shown);
  return (
    <section className="cp-panel" aria-label={P.versions} data-shown={item.shown ?? 'original'}>
      <p className="you-meta cp-shown">{shown ? P.shownVersion(shown, shownDecision) : P.shownCommitted}</p>
      <div className="you-actions">
        <button type="button" className="ic-secondary" disabled={busy} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {P.redo}
        </button>
        {item.shown && (
          <button type="button" className="ic-secondary" disabled={busy} onClick={() => void show(null)}>
            {P.original}
          </button>
        )}
      </div>
      {open && (
        <div className="cp-redo">
          <PublishedTextField id={`cp-note-${item.id}`} label={P.noteLabel} value={note} onChange={setNote} rows={3} maxLength={CHAPTER_PICTURES.noteMaxChars} />
          <fieldset className="cp-choice cp-models">
            <legend className="you-meta">{P.model}</legend>
            {(m.list ?? []).map((x) => (
              <label key={x.id} data-model={x.id}>
                <input type="radio" name={`cp-model-${item.id}`} checked={m.chosen?.id === x.id} onChange={() => m.pick(x)} /> {x.label} · {x.maker} · {x.open ? 'open' : 'closed'}
                {!x.open && m.meta(x) && <span className="you-meta cp-model-line"> {m.meta(x)!.replace(/ · uses 3 of today's pictures$/, '')}</span>}
              </label>
            ))}
          </fieldset>
          {m.notice}
          <p className="you-meta" data-look="">
            {P.look(look, ownLook)}
          </p>
          <div className="you-actions">
            <button type="button" className="ic-secondary" disabled={busy} onClick={() => void redo()}>
              {busy ? P.making : P.make}
            </button>
            <button type="button" className="ic-secondary" disabled={busy} onClick={() => setOpen(false)}>
              {P.cancel}
            </button>
          </div>
        </div>
      )}
      {item.versions.length > 0 && (
        <ol className="cp-versions" aria-label={P.versions}>
          {item.versions.map((v) => {
            const isShown = v.id === item.shown;
            const kept = keptIds.has(v.id);
            const alt = `AI-generated image: a redo of the picture for chapter ${v.chapter}`;
            const url = item.decisions.find((d) => d.versionId === v.id && d.publicUrl)?.publicUrl;
            return (
              <li key={v.id} className="cp-version" data-version={v.id} data-state={isShown ? 'shown' : kept ? 'kept' : 'draft'}>
                <figure className="you-fig">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {kept && url ? <img src={url} alt={alt} width={v.width} height={v.height} loading="lazy" /> : <DraftImage id={v.id} alt={alt} />}
                  <figcaption className="you-meta">
                    {P.versionMeta(v, v.recipe?.model?.name ?? v.model)}
                    <br />“{v.note}”
                  </figcaption>
                </figure>
                {isShown ? (
                  <p className="you-meta cp-state">{P.shownNow}</p>
                ) : (
                  <>
                    <p className="you-meta cp-state">{kept ? P.keptBefore : P.draft}</p>
                    <div className="you-actions">
                      <button type="button" className="ic-secondary" disabled={busy || (!kept && !state.storage)} onClick={() => void show(v.id)}>
                        {kept ? P.showAgain : P.keep}
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {item.decisions.length > 0 && (
        <details className="cp-history">
          <summary className="you-meta">{P.history}</summary>
          <ul>
            {item.decisions.map((d) => (
              <li key={d.id} className="you-meta">
                {P.historyLine(d)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p className="you-note" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
