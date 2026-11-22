'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import { CHAPTER_PICTURES } from '~/lib/config';
import { lookName } from '~/lib/chapter-pictures/shared';
import { paragraphOrBlock } from '~/lib/reading';
import { useChallengeModel } from './challenge-model-row';
import { CapLine, DraftImage, ModelRow, PicturePanel, ReferencePicker, SheetPicker, errorOf, post, type PictureItem, type PicturesState, type RefChoice } from './chapter-pictures';
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
  // A passage chosen by highlighting text (owner, 2026-11-20). DRAFT wording (coding agent).
  unlabelled: (blocks: number[]) =>
    `Your selection ${blocks.length > 1 ? 'starts or ends on blocks' : 'starts or ends on a block'} without a paragraph number (block ${blocks.join(', block ')}), such as a screen or a figure. ${blocks.length > 1 ? 'They are' : 'It is'} kept as the passage’s end${blocks.length > 1 ? 's' : ''} and listed below by block number; choose a paragraph instead if you prefer.`,
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
  // Every block, in the page's order; those without a paragraph number have label null (2026-11-20: a passage set from a
  // selection or the player may end on one).
  return [...document.querySelectorAll<HTMLElement>('article.chapter .block[id]')]
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

/**
 * The "Add a picture here" sheet opened from elsewhere in the reader (owner, 2026-11-20: highlighting text, the player's
 * image button and "+ Add an image", for admins): the same sheet, with the passage already set. Admins only: for anyone
 * else it renders nothing (src/components/add-image-entry.tsx sends them to the readers' composer, as before).
 */
export function AdminAddSheet({ chapter, after, start, end, onClose }: { chapter: number; after: number; start: number; end: number; onClose: () => void }) {
  const auth = useAuth();
  if (auth.kind !== 'signed-in' || !isAdmin(auth.fid)) return null;
  return <AddSheet chapter={chapter} after={after} label={null} start={start} end={end} onClose={onClose} />;
}

function AddSheet({ chapter, after, label: given, start: from = after, end: to = after, onClose }: { chapter: number; after: number; label: number | null; start?: number; end?: number; onClose: () => void }) {
  const { data, failed } = usePictureState(null);
  const [blocks, setBlocks] = useState<{ idx: number; label: number | null }[]>([]);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  // The chooser lists the paragraphs (blocks with a number). A passage set from elsewhere may start or end on a block
  // without one (a screen, a figure): it is kept, listed by its block number, and the sheet says so.
  const unlabelled = blocks.length ? [...new Set([from, to])].filter((i) => !blocks.some((b) => b.idx === i && b.label !== null)) : [];
  // In the page's order (no sorting here: P5b); a block not on the page at all is listed last.
  const options = [
    ...blocks.filter((b) => b.label !== null || unlabelled.includes(b.idx)),
    ...unlabelled.filter((i) => !blocks.some((b) => b.idx === i)).map((idx) => ({ idx, label: null })),
  ];
  const label = given ?? blocks.find((b) => b.idx === after)?.label ?? null;
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [picked, setPicked] = useState<RefChoice[]>([]);
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
      const r = await post('/api/you/illustrations/add', { ...body, note, characters: chosen, picked: picked.map((x) => x.versionId), ...m.body() });
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
    // A reference hidden since the draft was made (P5f) is refused with its plain message; the draft stays a draft.
    if (!r.ok) return setError(errorOf(r.json));
    setKept(true);
  }
  const opt = (b: { idx: number; label: number | null }) => (
    <option key={b.idx} value={b.idx}>
      {paragraphOrBlock(b.label, b.idx)}
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
          {unlabelled.length > 0 && (
            <p className="you-note" data-unlabelled={unlabelled.join(',')}>
              {R.unlabelled(unlabelled)}
            </p>
          )}
          <div className="rpa-passage" data-passage={`${Math.min(start, end)}-${Math.max(start, end)}`} data-after={after}>
            <label className="cp-field">
              <span className="you-meta">{R.from}</span>
              <select value={start} disabled={Boolean(draft)} onChange={(e) => setStart(Number(e.target.value))}>
                {options.map(opt)}
              </select>
            </label>
            <label className="cp-field">
              <span className="you-meta">{R.to}</span>
              <select value={end} disabled={Boolean(draft)} onChange={(e) => setEnd(Number(e.target.value))}>
                {options.map(opt)}
              </select>
            </label>
          </div>
          <PublishedTextField id={`rpa-note-${after}`} label={R.note} value={note} onChange={setNote} rows={3} maxLength={CHAPTER_PICTURES.noteMaxChars} />
          <SheetPicker chapter={chapter} start={Math.min(start, end)} end={Math.max(start, end)} chosen={chosen} setChosen={setChosen} max={3 - picked.length} />
          <ReferencePicker id={`add-${after}`} max={3 - chosen.length} picked={picked} setPicked={setPicked} redo={false} />
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
                  <button type="button" className="ic-secondary" disabled={busy} onClick={() => void keep()} data-keep="">
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
