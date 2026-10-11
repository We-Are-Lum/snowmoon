'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { openedChapters } from '~/lib/chat/device';
import { openComposer } from '~/lib/images/client';
import { IMAGES } from '~/lib/config';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { ImageComposer } from './image-composer';
import { searchCorpus, type CorpusEntry } from '~/lib/book-search-core';
import { SearchField } from './search-field';

/**
 * "Make an image" (/images/new): choose the text, then the prompt (owner, 2026-10-10). Browse a
 * chapter and tap the first paragraph, then the last (up to IMAGES.maxBlocks blocks, counted as the
 * server counts them on Generate), or search the book's text; then "Write the prompt →" opens the
 * composer, the same sheet as in the reader. Paragraphs and quotes can be tapped; screens and
 * figures are named in place and can sit inside a passage. Chapters past the furthest one opened on
 * this device are shown and marked, not hidden: the reader is choosing deliberately.
 * Model-drafted wording (src/lib/images/wording.ts, IMAGE_WORDING.create); one "Draft wording" line.
 */
export type CreateBlock = { idx: number; kind: string; label: number | null; html: string | null };
type Hit = { chapter: number; idx: number; label: number | null; before: string; match: string; after: string };
type Sel = { start: number; end: number; done: boolean };

const W = IMAGE_WORDING.create;
const MIN_Q = 3;

export function ImageCreate({
  chapters,
  chapter,
  initial,
  badLink,
  maxBlocks,
}: {
  chapters: { n: number; dateline: string }[];
  chapter: { n: number; dateline: string; blocks: CreateBlock[]; all: number[] } | null;
  initial: { start: number; end: number; open: boolean } | null;
  badLink: boolean;
  maxBlocks: number;
}) {
  const [mode, setMode] = useState<'browse' | 'search'>('browse');
  const [furthest, setFurthest] = useState<number | null>(null);
  const [sel, setSel] = useState<Sel | null>(initial ? { start: initial.start, end: initial.end, done: initial.open } : null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setFurthest(Math.max(1, ...openedChapters())), []);
  const ahead = (n: number) => furthest !== null && n > furthest;

  // A deep link opens the prompt at once; a search hit shows its paragraph, chosen.
  useEffect(() => {
    if (!chapter || !initial) return;
    document.getElementById(`c${chapter.n}-b${initial.start}`)?.scrollIntoView({ block: 'center' });
    if (!initial.open) return;
    // After the composer below has started listening.
    const t = setTimeout(() => openComposer({ chapter: chapter.n, start: initial.start, end: initial.end }), 0);
    return () => clearTimeout(t);
  }, [chapter, initial]);

  const count = (a: number, z: number) => chapter?.all.filter((i) => i >= a && i <= z).length ?? 0;
  const tap = (idx: number) => {
    setNote(null);
    if (!sel || sel.done) return setSel({ start: idx, end: idx, done: false });
    if (idx === sel.start) return setSel({ ...sel, done: true });
    const start = Math.min(sel.start, idx), end = Math.max(sel.start, idx);
    const n = count(start, end);
    if (n > maxBlocks) return setNote(W.tooMany(n, maxBlocks));
    setSel({ start, end, done: true });
  };
  const labelOf = (idx: number) => chapter?.blocks.find((b) => b.idx === idx)?.label ?? null;
  const where = (() => {
    if (!sel) return '';
    const a = labelOf(sel.start), z = labelOf(sel.end);
    return a === null ? '' : a === z || z === null ? `¶ ${a}` : `¶ ${a}–${z}`;
  })();

  return (
    <div className="page prose pictures make-image">
      <p className="label pictures-label">
        <Link href="/images">← Pictures</Link> · {IMAGES.label}
      </p>
      <h1>{W.title}</h1>
      <p>{W.intro}</p>
      {badLink && <p className="mi-note" role="status">{W.badLink}</p>}

      <div className="mode-switch mi-switch" role="group" aria-label="Choose the text">
        <button type="button" aria-pressed={mode === 'browse'} onClick={() => setMode('browse')}>
          {W.browse}
        </button>
        <button type="button" aria-pressed={mode === 'search'} onClick={() => setMode('search')}>
          {W.search}
        </button>
      </div>

      {mode === 'search' ? (
        <Search ahead={ahead} />
      ) : !chapter ? (
        <section aria-labelledby="mi-chapters">
          <h2 id="mi-chapters" className="mi-h">
            {W.chooseChapter}
          </h2>
          <ol className="chapter-list mi-chapters">
            {chapters.map(({ n, dateline }) => (
              <li key={n}>
                <Link href={`/images/new?chapter=${n}`}>
                  <span className="ch-num">Chapter {n}</span>
                  <span className="ch-dateline">{dateline}</span>
                  {ahead(n) && <span className="mi-ahead">{W.ahead}</span>}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section aria-labelledby="mi-chapter">
          <p className="mi-back">
            <Link href="/images/new">{W.allChapters}</Link>
          </p>
          <h2 id="mi-chapter" className="mi-h">
            Chapter {chapter.n}
            {chapter.dateline && <span className="mi-dateline"> · {chapter.dateline}</span>}
          </h2>
          {ahead(chapter.n) && <p className="mi-ahead mi-ahead-line">{W.ahead}</p>}
          <p className="mi-tap">{W.tap(maxBlocks)}</p>
          {/* The composer reads the passage from here: article.chapter > .block[id], with data-label. */}
          <article className="chapter mi-text" data-chapter={chapter.n}>
            {chapter.blocks.map((b) => {
              const id = `c${chapter.n}-b${b.idx}`;
              const inSel = !!sel && b.idx >= sel.start && b.idx <= sel.end;
              const cls = `${inSel ? ' is-in' : ''}${sel && b.idx === sel.start ? ' is-first' : ''}${sel && b.idx === sel.end ? ' is-last' : ''}`;
              if (b.html === null)
                return (
                  <p key={id} id={id} data-label={b.label ?? undefined} className={`block mi-other${cls}`}>
                    {W.notChosen(b.kind)}
                  </p>
                );
              const Tag = b.kind === 'paragraph' ? 'p' : 'div';
              return (
                <Tag
                  key={id}
                  id={id}
                  data-label={b.label ?? undefined}
                  className={`block ${b.kind} mi-pick${cls}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={inSel}
                  onClick={() => tap(b.idx)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      tap(b.idx);
                    }
                  }}
                  dangerouslySetInnerHTML={{ __html: b.html }}
                />
              );
            })}
          </article>
          <nav className="chapter-nav" aria-label="Chapters">
            {chapter.n > 1 ? <Link href={`/images/new?chapter=${chapter.n - 1}`}>← Chapter {chapter.n - 1}</Link> : <span />}
            {chapter.n < chapters.length ? <Link href={`/images/new?chapter=${chapter.n + 1}`}>Chapter {chapter.n + 1} →</Link> : <span />}
          </nav>
          {sel && (
            <div className="mi-bar" role="region" aria-label="Your passage">
              <p className="mi-count" aria-live="polite">
                Chapter {chapter.n}
                {where ? ` · ${where}` : ''} · {W.count(count(sel.start, sel.end), maxBlocks)}
              </p>
              {note && (
                <p className="mi-cap" role="status">
                  {note}
                </p>
              )}
              <div className="mi-actions">
                <button
                  type="button"
                  className="ic-secondary"
                  onClick={() => {
                    setSel(null);
                    setNote(null);
                  }}
                >
                  {W.clear}
                </button>
                <button type="button" className="ic-primary mi-write" onClick={() => openComposer({ chapter: chapter.n, start: sel.start, end: sel.end })}>
                  {W.write}
                </button>
              </div>
            </div>
          )}
          <ImageComposer />
        </section>
      )}
      <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
    </div>
  );
}

/** The book's text, fetched once when Search is first used (about 200 KB), then searched on this device. */
let corpusOnce: Promise<CorpusEntry[]> | null = null;
const loadCorpus = () =>
  (corpusOnce ??= fetch('/api/book/text')
    .then((r) => (r.ok ? (r.json() as Promise<{ entries: CorpusEntry[] }>) : Promise.reject(new Error('text'))))
    .then((j) => j.entries)
    .catch((e) => {
      corpusOnce = null;
      throw e;
    }));

/** Search the book's text on this device (no query leaves it), debounced; a hit opens its chapter with the paragraph chosen. */
function Search({ ahead }: { ahead: (n: number) => boolean }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<{ q: string; hits: Hit[]; more: boolean } | { error: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    void loadCorpus().catch(() => {});
  }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_Q) return setState(null);
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = searchCorpus(await loadCorpus(), term);
        if (live) setState(r.ok ? { q: r.q, hits: r.hits, more: r.more } : { error: r.error });
      } catch {
        if (live) setState({ error: W.searchFailed });
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <section className="mi-search" aria-label={W.searchLabel}>
      <SearchField ref={input} id="mi-q" label={W.searchLabel} value={q} onChange={setQ} maxLength={80} hint={q.trim().length < MIN_Q ? W.searchHint(MIN_Q) : undefined} />
      {state && 'error' in state && (
        <p className="mi-cap" role="status">
          {state.error}
        </p>
      )}
      {state && 'hits' in state && (
        <>
          <p className="mi-note" role="status">
            {state.hits.length === 0 ? W.noHits(state.q) : state.more ? W.more(state.hits.length) : `${state.hits.length} ${state.hits.length === 1 ? 'paragraph' : 'paragraphs'}`}
          </p>
          <ul className="mi-hits">
            {state.hits.map((h) => (
              <li key={`${h.chapter}-${h.idx}`}>
                <Link href={`/images/new?chapter=${h.chapter}&pick=${h.idx}`} className="mi-hit">
                  <span className="mi-hit-where">
                    Chapter {h.chapter}
                    {h.label !== null ? ` · ¶ ${h.label}` : ''}
                    {ahead(h.chapter) && <span className="mi-ahead"> · {W.ahead}</span>}
                  </span>
                  <span className="mi-hit-text">
                    {h.before}
                    <mark>{h.match}</mark>
                    {h.after}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
