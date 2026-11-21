'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import { CHAPTER_PICTURES } from '~/lib/config';
import { lookName } from '~/lib/chapter-pictures/shared';
import { useChallengeModel } from './challenge-model-row';
import { CapLine, DraftImage, ModelRow, PicturePanel, SheetPicker, errorOf, post, type PictureItem, type PicturesState } from './chapter-pictures';
import { PublishedTextField } from './publish-words';

/**
 * The admins' picture tools inside the chapter reader (owner, 2026-11-19): "Change this picture" beside Hide on each of
 * the edition's pictures (the same redo as /you/illustrations: note, model, the saved look, draft, Keep, an earlier one
 * again), and "Add a picture here" between paragraphs (the passage it shows, the note, the model, optionally characters'
 * sheet pictures; then draft, and Keep or leave it for later on /you/illustrations). Both open a sheet: full screen on a
 * phone, beside the picture on a wide screen. Admins only (src/lib/config.ts ADMINS); for anyone else they render
 * nothing, and every route they call answers 404. Every sentence is DRAFT wording (coding agent, 2026-11-19), kept in R.
 */
export const R = {
  change: 'Change this picture',
  add: '+ Add a picture here',
  close: 'Close',
  changeTitle: 'Change this picture',
  addTitle: (label: number | null) => `Add a picture here${label !== null ? ` (after ¶ ${label})` : ''}`,
  loading: 'Loading…',
  failed: 'This didn’t load. Try again in a moment.',
  reload: 'Shown in the chapter. Reload the page to see it as readers do.',
  from: 'The passage it shows: from',
  to: 'to',
  note: 'What the picture shows (your note is the prompt; it is shown in the picture’s recipe, credited to you)',
  notReady: 'Adding pictures needs the migration 0043_chapter_picture_additions first. Nothing was made.',
  make: 'Make the draft',
  making: 'Making…',
  draftLine: 'Your draft. Only admins see it until one of you keeps it.',
  keep: 'Keep: show it in the chapter now',
  later: 'Leave it for later',
  laterLine: 'It waits on /you/illustrations until an admin keeps it.',
  look: (l: string) => `Style: ${l}`,
  noteFirst: 'Write what the picture shows first.',
} as const;

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, textarea, select, input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      back?.focus?.();
    };
  }, [onClose]);
  return (
    <div ref={ref} className="rpa-sheet" role="dialog" aria-modal="false" aria-label={title}>
      <div className="rpa-head">
        <p className="rpa-title">{title}</p>
        <button type="button" className="sheet-x" aria-label={R.close} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="rpa-body">{children}</div>
    </div>
  );
}

function usePictureState(job: string | null) {
  const [data, setData] = useState<{ item: (PictureItem & { added?: PictureItem['added'] }) | null; pictures: PicturesState } | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const r = await authFetch(`/api/you/illustrations/picture${job ? `?job=${encodeURIComponent(job)}` : ''}`).catch(() => null);
    if (r?.ok) setData(await r.json());
    else setFailed(true);
  }, [job]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, failed, load };
}

/** "Change this picture": the redo of /you/illustrations, in a sheet, for one picture of this chapter. */
export function AdminChangePicture({ chapter, jobId }: { chapter: number; jobId: string }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  if (auth.kind !== 'signed-in' || !isAdmin(auth.fid)) return null;
  return (
    <>
      {' · '}
      <button type="button" className="admin-hide rpa-open" data-change={jobId} onClick={() => setOpen(true)}>
        {R.change}
      </button>
      {open && <ChangeSheet chapter={chapter} jobId={jobId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangeSheet({ jobId, onClose }: { chapter: number; jobId: string; onClose: () => void }) {
  const { data, failed, load } = usePictureState(jobId);
  const [shown, setShown] = useState(false);
  return (
    <Sheet title={R.changeTitle} onClose={onClose}>
      {failed && <p className="you-note" role="alert">{R.failed}</p>}
      {!data && !failed && <p className="you-meta">{R.loading}</p>}
      {data?.item && (
        <>
          <CapLine cap={data.pictures.cap} />
          <PicturePanel item={data.item} state={data.pictures} reload={load} onShown={() => setShown(true)} />
          {shown && <p className="you-note" role="status">{R.reload}</p>}
        </>
      )}
    </Sheet>
  );
}

/** The chapter's blocks that can bound a passage, read from the page as served (their ids and paragraph labels). */
function pageBlocks(): { idx: number; label: number | null }[] {
  return [...document.querySelectorAll<HTMLElement>('article.chapter [id^="c"][data-label]')]
    .map((el) => ({ idx: Number(/-b(\d+)$/.exec(el.id)?.[1]), label: el.dataset.label ? Number(el.dataset.label) : null }))
    .filter((b) => Number.isInteger(b.idx));
}

/** "Add a picture here", between paragraphs: admins only. */
export function AdminAddHere({ chapter, after, label }: { chapter: number; after: number; label: number | null }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  if (auth.kind !== 'signed-in' || !isAdmin(auth.fid)) return null;
  return (
    <div className="rpa-add" data-add-after={after}>
      <button type="button" className="admin-hide rpa-open" onClick={() => setOpen(true)}>
        {R.add}
      </button>
      {open && <AddSheet chapter={chapter} after={after} label={label} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AddSheet({ chapter, after, label, onClose }: { chapter: number; after: number; label: number | null; onClose: () => void }) {
  const { data, failed } = usePictureState(null);
  const [blocks, setBlocks] = useState<{ idx: number; label: number | null }[]>([]);
  const [start, setStart] = useState(after);
  const [end, setEnd] = useState(after);
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ jobId: string; versionId: string } | null>(null);
  const [kept, setKept] = useState(false);
  const [later, setLater] = useState(false);
  useEffect(() => setBlocks(pageBlocks()), []);
  const m = useChallengeModel(data?.pictures.models, null, data?.pictures.defaultModel ?? null);
  const look = data ? ((data.pictures.looks.chapters[chapter] ? data.pictures.looks.chapters[chapter].look : null) ?? data.pictures.looks.all?.look ?? null) : null;

  async function make() {
    if (!note.trim()) return setError(R.noteFirst);
    const send = async () => {
      setBusy(true);
      setError(null);
      const body = draft ? { jobId: draft.jobId } : { chapter, after, start: Math.min(start, end), end: Math.max(start, end) };
      const r = await post('/api/you/illustrations/add', { ...body, note, characters: chosen, ...m.body() });
      setBusy(false);
      if (!r.ok) return setError(errorOf(r.json));
      setDraft({ jobId: String(r.json.jobId), versionId: String(r.json.versionId) });
    };
    if (m.askFirst(() => void send())) return;
    await send();
  }
  async function keep() {
    if (!draft) return;
    setBusy(true);
    const r = await post('/api/you/illustrations/show', { jobId: draft.jobId, versionId: draft.versionId });
    setBusy(false);
    if (!r.ok) return setError(errorOf(r.json));
    setKept(true);
  }
  const opt = (b: { idx: number; label: number | null }) => (
    <option key={b.idx} value={b.idx}>
      {b.label !== null ? `¶ ${b.label}` : `block ${b.idx}`}
    </option>
  );
  return (
    <Sheet title={R.addTitle(label)} onClose={onClose}>
      {failed && <p className="you-note" role="alert">{R.failed}</p>}
      {!data && !failed && <p className="you-meta">{R.loading}</p>}
      {data && !data.pictures.adding && <p className="you-note" data-add-not-ready="">{R.notReady}</p>}
      {data?.pictures.adding && (
        <div className="cp-redo rpa-add-form">
          <CapLine cap={data.pictures.cap} />
          <div className="rpa-passage">
            <label className="cp-field">
              <span className="you-meta">{R.from}</span>
              <select value={start} disabled={Boolean(draft)} onChange={(e) => setStart(Number(e.target.value))}>
                {blocks.map(opt)}
              </select>
            </label>
            <label className="cp-field">
              <span className="you-meta">{R.to}</span>
              <select value={end} disabled={Boolean(draft)} onChange={(e) => setEnd(Number(e.target.value))}>
                {blocks.map(opt)}
              </select>
            </label>
          </div>
          <PublishedTextField id={`rpa-note-${after}`} label={R.note} value={note} onChange={setNote} rows={3} maxLength={CHAPTER_PICTURES.noteMaxChars} />
          <SheetPicker chapter={chapter} start={Math.min(start, end)} end={Math.max(start, end)} chosen={chosen} setChosen={setChosen} />
          <ModelRow m={m} name={`rpa-model-${after}`} />
          <p className="you-meta" data-look="">
            {R.look(look ? lookName(look) : 'none set yet')}
          </p>
          {!kept && (
            <div className="you-actions">
              <button type="button" className="ic-secondary" disabled={busy} onClick={() => void make()}>
                {busy && !draft ? R.making : R.make}
              </button>
            </div>
          )}
          {draft && (
            <div className="rpa-draft" data-draft={draft.versionId}>
              <figure className="you-fig">
                <DraftImage id={draft.versionId} alt="AI-generated image: a draft of a picture an admin is adding" />
                <figcaption className="you-meta">{kept ? R.reload : R.draftLine}</figcaption>
              </figure>
              {!kept && !later && (
                <div className="you-actions">
                  <button type="button" className="ic-secondary" disabled={busy} onClick={() => void keep()}>
                    {R.keep}
                  </button>
                  <button type="button" className="ic-secondary" disabled={busy} onClick={() => setLater(true)}>
                    {R.later}
                  </button>
                </div>
              )}
              {later && <p className="you-note" role="status">{R.laterLine}</p>}
            </div>
          )}
          {error && (
            <p className="you-note" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
