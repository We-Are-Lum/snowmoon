'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { CHAPTER_PICTURES } from '~/lib/config';
import { resetLocal } from '~/lib/challenge/model-wording';
import type { ModelRowEntry } from '~/lib/challenge/models';
import { adminName, creditLine, noClosedOffered, localDay as day, lookName, modelLine, type Look, type PictureDecision, type PictureVersion, type RefKind } from '~/lib/chapter-pictures/shared';
import { useChallengeModel } from './challenge-model-row';
import { PublishedTextField } from './publish-words';
import { RefSearchField } from './ref-search-field';
import { LETTERING_WORDING, parseQuotes } from '~/lib/images/lettering';
import { LetteringMismatch, LetteringRecordView, LetteringWarning, WordsToDraw, mismatchOf, type LetteringW, type Mismatch } from './lettering';
import '../styles/chapter-pictures.css';

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
  notReady: 'Redoing pictures needs the chapter-picture migration first (0042_chapter_picture_versions).',
  noStorage: 'Kept pictures can’t be stored on this copy of the site.',
  cap: (spent: number, cap: number, reset: string) => `Admins’ chapter pictures today: $${spent.toFixed(2)} of $${cap}. The day resets at ${reset}.`,
  capReached: (cap: number, reset: string) => `Today’s $${cap} for admins’ chapter pictures is used up. More at ${reset}.`,
  lookTitle: 'The look for redos',
  lookLede: 'Every redo uses this style, in every chapter, unless a chapter has its own. No artist, studio or film names and no real people: the prompt check refuses them. No words in the picture.',
  lookFor: 'For',
  every: 'Every chapter',
  chapter: (n: number) => `Chapter ${n}`,
  styleOption: 'A published style (any maker’s, the remix challenge’s included)',
  lineOption: 'A line you write',
  lineLabel: 'The look, in your words (shown in every redo’s recipe)',
  clear: 'Use every chapter’s look',
  saveLook: 'Save the look',
  lookNow: (l: Look | null) => (l ? `${lookName(l)}: ${l.text}` : 'None yet.'),
  couldNot: 'Could not do it',
  // Added pictures (owner, 2026-11-19). DRAFT wording (coding agent).
  addedShown: (d: PictureDecision | undefined) => `The chapter shows this added picture${d ? `, kept by ${adminName(d.byFid, d.byHandle)} on ${day(d.at)}` : ''}.`,
  addedOff: 'Not in the chapter now. A draft waits here until an admin keeps it; a picture taken off stays stored and can be shown again.',
  againAdded: 'Make another draft',
  noteAdded: 'What the picture shows (your note is the prompt; it is shown in the picture’s recipe, credited to you)',
  takeOff: 'Take it off the chapter',
  sheets: 'Characters’ sheet pictures to send along (optional)',
  sheetsLoading: 'Looking for the characters’ sheets…',
  sheetsNone: 'No character this passage names has a published sheet picture.',
  addedAt: (ch: number, after: number, start: number, end: number) => `Added to chapter ${ch}, after block ${after}; it shows blocks ${start}–${end}.`,
  // Any published style as the look, and others' published pictures as references (owner's request via Garance,
  // 2026-11-21). Drafted by the coding agent; reread by the owner 2026-11-21 (#204's review page).
  styleOptionLabel: (s: StyleOptionState) => `${s.label} · version ${s.versionNo} · by ${s.by}${s.challenge ? ' · remix challenge' : ''}`,
  styleWords: (text: string) => `Its words: ${text}`,
  refsLegend: 'Other published pictures to send along (optional)',
  refsLede: (max: number, redo: boolean) =>
    max > 0
      ? `Up to ${max} more: three pictures in all${redo ? ', the picture shown now first' : ', counting the character sheets'}. Remixes, readers’ pictures, bases and sheets; never a hidden one. Each maker is credited in the caption and the recipe.`
      : `That’s three pictures in all${redo ? ', the picture shown now first' : ', counting the character sheets'}.`,
  refsSearch: 'Search by maker, character or words',
  refsSearchButton: 'Search',
  refsSearching: 'Searching…',
  refsLink: 'Or paste a link to its page on snowmoon.party',
  refsLinkButton: 'Use this link',
  refsNone: 'No published picture matches.',
  refsPick: 'Pick',
  refsPicked: 'Picked',
  refsRemove: 'Remove',
  refsChosen: 'Picked references, in the order they go',
  refsItem: (r: { what: string; by: string }) => `${r.what} by ${r.by}`,
  refsKind: { remix: 'remix', picture: 'picture', base: 'base', sheet: 'sheet' } as Record<RefKind, string>,
  refsCaption: (line: string) => `The caption will add: “${line}”, and the recipe each one’s version, maker and sha256.`,
  // Owner, 2026-11-21: one line under the Model row when neither closed model is offered here; reread by the owner 2026-11-21.
  closedNotOffered: 'GPT Image and Gemini aren’t offered where you are.',
} as const;

/** A style as the look picker lists it (GET /api/you/illustrations: any published, visible style). */
export interface StyleOptionState {
  id: string;
  label: string;
  text: string;
  versionNo: number;
  by: string;
  challenge: boolean;
}

/** A published picture picked as a reference, as the picker shows it (GET /api/you/illustrations/references). */
export interface RefChoice {
  versionId: string;
  kind: RefKind;
  what: string;
  by: string;
  href: string;
  thumb: string;
}

export interface PicturesState {
  ready: boolean;
  storage: boolean;
  models: ModelRowEntry[];
  styles: StyleOptionState[];
  looks: { all: { look: Look; byFid: number; at: string } | null; chapters: Record<number, { look: Look | null; byFid: number; at: string }> };
  cap: { spentUsd: number; capUsd: number; resetAt: string };
  /** The model the row starts on: GPT Image 2.5 Sunburst where OpenAI serves (owner, 2026-11-18; P3 DRAFT pending his reread). */
  defaultModel?: string;
  /** Whether pictures can be added (0043_chapter_picture_additions applied). */
  adding?: boolean;
  /** Lettering's words (part C; the server's, reread by the owner 2026-11-22): the preview, the line before Make, the open refusal, the mismatch. */
  lettering?: LetteringW;
}
export interface PictureItem {
  id: string;
  chapter: number;
  redoable: boolean;
  shown: string | null;
  versions: PictureVersion[];
  decisions: PictureDecision[];
  image: { url: string; width: number; height: number } | null;
  /** A picture an admin added (owner, 2026-11-19): the block it sits after and the passage it shows. */
  added?: { after: number; start: number; end: number } | null;
  /** An edition picture's words drawn in code (lettering, part C: it can be redone now; quoted words keep them). */
  lettered?: string[];
}

/** A character's sheet picture an added picture may take along (GET /api/you/illustrations/passage). */
export interface SheetChoice {
  slug: string;
  name: string;
  url: string;
}

/**
 * The characters this passage names that have a published sheet, as checkboxes: whose front view goes along as a
 * reference (owner, 2026-11-19: "optionally which characters' sheet pictures go along as references"). At most three.
 */
export function SheetPicker({ chapter, start, end, chosen, setChosen, max = 3 }: { chapter: number; start: number; end: number; chosen: string[]; setChosen: (v: string[]) => void; max?: number }) {
  const [sheets, setSheets] = useState<SheetChoice[] | null>(null);
  useEffect(() => {
    let live = true;
    setSheets(null);
    void authFetch(`/api/you/illustrations/passage?chapter=${chapter}&start=${start}&end=${end}`)
      .then((r) => (r.ok ? r.json() : { sheets: [] }))
      .then((j: { sheets?: SheetChoice[] }) => live && setSheets(j.sheets ?? []))
      .catch(() => live && setSheets([]));
    return () => {
      live = false;
    };
  }, [chapter, start, end]);
  if (sheets === null) return <p className="you-meta">{P.sheetsLoading}</p>;
  if (!sheets.length) return <p className="you-meta">{P.sheetsNone}</p>;
  return (
    <fieldset className="cp-choice cp-sheets">
      <legend className="you-meta">{P.sheets}</legend>
      {sheets.map((x) => (
        <label key={x.slug} data-sheet={x.slug}>
          <input
            type="checkbox"
            checked={chosen.includes(x.slug)}
            disabled={!chosen.includes(x.slug) && chosen.length >= max}
            onChange={(e) => setChosen(e.target.checked ? [...chosen, x.slug] : chosen.filter((c) => c !== x.slug))}
          />{' '}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={x.url} alt="" width={36} height={48} className="cp-sheet-thumb" /> {x.name}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Others' published pictures as references (owner's request via Garance, 2026-11-21): search (maker, character, words)
 * or paste a snowmoon.party link; the server resolves either to a version and refuses anything hidden, not published or
 * not found, with the reason. At most `max` (three pictures in all, counting the sheets, or the picture shown now in a
 * redo). Only the version ids are sent with Make, where the server checks each again.
 */
export function ReferencePicker({ id, max, picked, setPicked, redo }: { id: string; max: number; picked: RefChoice[]; setPicked: (v: RefChoice[]) => void; redo: boolean }) {
  const [q, setQ] = useState('');
  const [link, setLink] = useState('');
  const [results, setResults] = useState<RefChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const room = Math.max(0, max - picked.length);
  const add = (r: RefChoice) => {
    if (picked.some((x) => x.versionId === r.versionId) || room <= 0) return;
    setPicked([...picked, r]);
  };
  async function ask(params: string, pickOne: boolean) {
    setBusy(true);
    setError(null);
    const res = await authFetch(`/api/you/illustrations/references?${params}`).catch(() => null);
    const j = ((await res?.json().catch(() => null)) ?? {}) as { error?: string; results?: RefChoice[]; ref?: RefChoice };
    setBusy(false);
    if (!res?.ok) return setError(j.error ?? P.couldNot);
    if (pickOne && j.ref) {
      add(j.ref);
      setLink('');
    } else setResults(j.results ?? []);
  }
  const line = picked.length ? creditLine(picked.map((r) => ({ what: r.what, by: r.by, hidden: false }))) : '';
  return (
    <fieldset className="cp-choice cp-refs" data-refs={id} data-room={room}>
      <legend className="you-meta">{P.refsLegend}</legend>
      <p className="you-meta">{P.refsLede(room, redo)}</p>
      {picked.length > 0 && (
        <ol className="cp-refs-chosen" aria-label={P.refsChosen}>
          {picked.map((r) => (
            <li key={r.versionId} data-picked={r.versionId}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.thumb} alt="" width={48} height={36} className="cp-ref-thumb" /> <a href={r.href}>{P.refsItem(r)}</a>{' '}
              <button type="button" className="ic-secondary cp-ref-btn" onClick={() => setPicked(picked.filter((x) => x.versionId !== r.versionId))}>
                {P.refsRemove}
              </button>
            </li>
          ))}
        </ol>
      )}
      {line && <p className="you-meta" data-ref-caption="">{P.refsCaption(line)}</p>}
      {room > 0 && (
        <>
          <div className="cp-ref-row">
            <RefSearchField id={`cp-ref-q-${id}`} label={P.refsSearch} kind="search" value={q} onChange={setQ} onEnter={() => q.trim().length >= 2 && void ask(`q=${encodeURIComponent(q)}`, false)} />
            <button type="button" className="ic-secondary" disabled={busy || q.trim().length < 2} onClick={() => void ask(`q=${encodeURIComponent(q)}`, false)}>
              {busy ? P.refsSearching : P.refsSearchButton}
            </button>
          </div>
          <div className="cp-ref-row">
            <RefSearchField id={`cp-ref-link-${id}`} label={P.refsLink} kind="url" value={link} placeholder="https://snowmoon.party/challenge/p/…" onChange={setLink} />
            <button type="button" className="ic-secondary" disabled={busy || !link.trim()} onClick={() => void ask(`link=${encodeURIComponent(link.trim())}`, true)}>
              {P.refsLinkButton}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="you-note" role="alert" data-ref-error="">
          {error}
        </p>
      )}
      {room > 0 && results !== null && (
        results.length === 0 ? (
          <p className="you-meta">{P.refsNone}</p>
        ) : (
          <ul className="cp-refs-results">
            {results.map((r) => {
              const isPicked = picked.some((x) => x.versionId === r.versionId);
              return (
                <li key={r.versionId} data-result={r.versionId} data-kind={r.kind}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.thumb} alt="" width={64} height={48} className="cp-ref-thumb" loading="lazy" />
                  <span className="you-meta">
                    {P.refsItem(r)} <span className="cp-ref-kind">· {P.refsKind[r.kind]}</span>
                  </span>
                  <button type="button" className="ic-secondary cp-ref-btn" disabled={isPicked} onClick={() => add(r)}>
                    {isPicked ? P.refsPicked : P.refsPick}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}
    </fieldset>
  );
}

/** The Model row, as on /you/illustrations: each offered model, with its maker, open or closed, and a closed one's line. */
export function ModelRow({ m, name }: { m: ReturnType<typeof useChallengeModel>; name: string }) {
  return (
    <>
      <fieldset className="cp-choice cp-models">
        <legend className="you-meta">{P.model}</legend>
        {(m.list ?? []).map((x) => (
          <label key={x.id} data-model={x.id}>
            <input type="radio" name={name} checked={m.chosen?.id === x.id} onChange={() => m.pick(x)} /> {x.label} · {x.maker} · {x.open ? 'open' : 'closed'}
            {!x.open && m.meta(x) && <span className="you-meta cp-model-line"> {m.meta(x)!.replace(/ · uses 3 of today's pictures$/, '')}</span>}
          </label>
        ))}
      </fieldset>
      {noClosedOffered(m.list) && (
        <p className="you-meta cp-closed-none" data-closed-none="">
          {P.closedNotOffered}
        </p>
      )}
      {m.notice}
    </>
  );
}

const lookOf = (s: PicturesState, chapter: number) => (s.looks.chapters[chapter] ? s.looks.chapters[chapter].look : null) ?? s.looks.all?.look ?? null;

export async function post(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return { ok: Boolean(res?.ok), json: ((await res?.json().catch(() => null)) ?? {}) as Record<string, unknown> };
}
export const errorOf = (j: Record<string, unknown>) => {
  const e = typeof j.error === 'string' ? j.error : P.couldNot;
  return e.includes('{reset}') ? e.replace('{reset}', resetLocal(new Date(Date.parse(String(j.resetAt ?? '')) - 1 || Date.now()))) : e;
};

/** A draft's picture: fetched with the admin's sign-in, shown from memory (it has no public address). */
export function DraftImage({ id, alt }: { id: string; alt: string }) {
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
                  {P.styleOptionLabel(s)}
                </option>
              ))}
            </select>
          )}
          {kind === 'style' && state.styles.find((s) => s.id === styleId) && (
            <p className="you-meta cp-style-words" data-style-words={styleId}>
              {P.styleWords(state.styles.find((s) => s.id === styleId)!.text)}
            </p>
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
export function PicturePanel({ item, state, reload, onShown }: { item: PictureItem; state: PicturesState; reload: () => Promise<void>; onShown?: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [picked, setPicked] = useState<RefChoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = useChallengeModel(state.models, null, state.defaultModel ?? null);
  const added = item.added ?? null;
  const pickedIds = picked.map((r) => r.versionId);
  const ownLook = Boolean(state.looks.chapters[item.chapter]?.look);
  const look = lookOf(state, item.chapter);
  const keptIds = new Set(item.decisions.filter((d) => d.versionId).map((d) => d.versionId));
  const shownDecision = item.decisions.find((d) => d.versionId === item.shown);
  // Lettering (part C): the note's words in quotation marks, as a closed model would draw them; never the open model.
  const [mismatch, setMismatch] = useState<Mismatch | null>(null);
  const L = state.lettering;
  const parsed = parseQuotes(note);
  const phrases = parsed.ok ? parsed.phrases : [];
  const openWithWords = phrases.length > 0 && Boolean(m.chosen?.open);

  async function redo() {
    if (!note.trim()) return setError('Write what should change first.');
    if (!parsed.ok) return setError(parsed.error);
    if (openWithWords && L) return setError(L.openRefused);
    const send = async () => {
      setBusy(true);
      setError(null);
      setMismatch(null);
      const r = added
        ? await post('/api/you/illustrations/add', { jobId: item.id, note, characters: chosen, picked: pickedIds, ...m.body() })
        : await post('/api/you/illustrations/redo', { jobId: item.id, note, picked: pickedIds, ...m.body() });
      setBusy(false);
      // The words came out wrong: nothing was saved; what was read, and Try again only (option a).
      const wrong = mismatchOf(r.json as { reason?: string });
      if (wrong) return setMismatch(wrong);
      if (!r.ok) return setError(errorOf(r.json));
      setOpen(false);
      setNote('');
      setPicked([]);
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
    // A reference hidden since the draft was made (P5f) is refused with its plain message; the draft stays a draft.
    if (!r.ok) return setError(errorOf(r.json));
    onShown?.();
    await reload();
  }

  if (!state.ready) return <p className="you-note">{P.notReady}</p>;
  if (!item.redoable) return null;
  const shown = item.versions.find((v) => v.id === item.shown);
  return (
    <section className="cp-panel" aria-label={P.versions} data-shown={item.shown ?? 'original'}>
      {added && <p className="you-meta cp-where">{P.addedAt(item.chapter, added.after, added.start, added.end)}</p>}
      <p className="you-meta cp-shown">{added ? (shown ? P.addedShown(shownDecision) : P.addedOff) : shown ? P.shownVersion(shown, shownDecision) : P.shownCommitted}</p>
      <div className="you-actions">
        <button type="button" className="ic-secondary" disabled={busy} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {added ? P.againAdded : P.redo}
        </button>
        {item.shown && (
          <button type="button" className="ic-secondary" disabled={busy} onClick={() => void show(null)}>
            {added ? P.takeOff : P.original}
          </button>
        )}
      </div>
      {open && (
        <div className="cp-redo">
          {item.lettered && item.lettered.length > 0 && (
            <p className="you-meta" data-slot="lettered-job">
              {LETTERING_WORDING.letteredJob(item.lettered)}
            </p>
          )}
          <PublishedTextField id={`cp-note-${item.id}`} label={added ? P.noteAdded : P.noteLabel} value={note} onChange={setNote} rows={3} maxLength={CHAPTER_PICTURES.noteMaxChars} />
          {L && <WordsToDraw parsed={parsed} w={L} refused={openWithWords} />}
          {added && <SheetPicker chapter={item.chapter} start={added.start} end={added.end} chosen={chosen} setChosen={setChosen} max={3 - picked.length} />}
          <ReferencePicker id={item.id} max={added ? 3 - chosen.length : 2} picked={picked} setPicked={setPicked} redo={!added} />
          <ModelRow m={m} name={`cp-model-${item.id}`} />
          <p className="you-meta" data-look="">
            {P.look(look, ownLook)}
          </p>
          {L && phrases.length > 0 && m.chosen && !m.chosen.open && !mismatch && <LetteringWarning w={L} />}
          {L && mismatch && <LetteringMismatch m={mismatch} w={L} busy={busy} onTryAgain={() => void redo()} />}
          <div className="you-actions">
            {!mismatch && (
              <button type="button" className="ic-secondary" disabled={busy} onClick={() => void redo()}>
                {busy ? P.making : P.make}
              </button>
            )}
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
                    {v.recipe?.picked?.length ? <> · {creditLine(v.recipe.picked.map((x) => ({ what: x.what, by: x.by, hidden: false })))}</> : null}
                    <br />“{v.note}”
                    {v.recipe?.lettering && L ? <LetteringRecordView r={v.recipe.lettering} w={L} /> : null}
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
