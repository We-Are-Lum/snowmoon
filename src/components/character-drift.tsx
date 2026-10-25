'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { AI_LABEL } from '~/lib/ai-declared';
import type { DriftCharacter, DriftImage, DriftStyle } from '~/lib/illustration-check/review';
import { noteCredit } from '~/lib/illustration-check/schema';
import { AiLabel } from './recipe-sheet';
import { PublishedTextField } from './publish-words';
import { SignInButton } from './sign-in';

/**
 * The owner's drift grids (/you/illustrations/characters; owner, 2026-10-25: "one grid per character showing every
 * image of them in the same style, side by side with their sheet, so I can spot drift by eye. Mark any image I flag
 * there as Regenerate, with my note. No model calls needed."). Per style, one fold per character: their cast sheet
 * beside every published image of them, in story order. Flagging an image saves Regenerate with the owner's note
 * through the review's own POST, so it shows on /you/illustrations too and the redo reads it. Owner only: the page as
 * served holds nothing, and the sheet is fetched with the owner's sign-in only when a fold is opened.
 *
 * Every sentence here is DRAFT wording for the owner (coding agent, 2026-10-25), kept in W.
 */
const W = {
  title: 'Same character, same look?',
  signedOut: 'Sign in to compare the images. Only the project’s owner can open this page.',
  notOwner: 'This page is for the project’s owner.',
  loading: 'Loading…',
  failed: 'The grids didn’t load. Try again in a moment.',
  lede: 'Each character’s sheet beside every image of them, in story order. Flag any image that drifts from the sheet: it is marked Regenerate with your note.',
  back: 'Back to the image review',
  cantSave: 'Flags can’t be saved on this copy of the site yet (the review tables aren’t there).',
  style: (name: string) => `Style: ${name}`,
  count: (n: number) => `${n} ${n === 1 ? 'image' : 'images'}`,
  flagged: (n: number) => ` · ${n} flagged`,
  sheet: 'Sheet',
  sheetAlt: (name: string) => `AI-generated character sheet for ${name}: front, three-quarter and back views`,
  noSheet: 'No sheet recorded for this character.',
  sheetMissing: 'The sheet isn’t stored on this copy of the site yet.',
  imageAlt: (name: string, ch: number, idx: number) => `AI-generated image with ${name}, chapter ${ch}, block ${idx}`,
  where: (ch: number, idx: number) => `Chapter ${ch} · block ${idx}`,
  with: (names: string[]) => `with ${names.join(', ')}`,
  decision: { keep: 'Kept', regenerate: 'Regenerate', drop: 'Dropped' } as Record<string, string>,
  flag: 'Flag',
  editNote: 'Edit the note',
  noteLabel: (name: string) => `What should change (your note for the redo, added to this image’s prompt, credited to you; it is about the whole image, not only ${name})`,
  save: 'Save: regenerate',
  cancel: 'Cancel',
  noteNeeded: 'Write what should change first.',
  couldNot: 'Could not save it',
  noteBy: (credit: string) => `Note ${credit}`,
};

interface Data {
  styles: DriftStyle[];
  canSave: boolean;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="you illus-review drift">
      <p className="you-kicker label">
        <Link href="/you">You</Link> · <Link href="/you/illustrations">Images</Link> · Characters
      </p>
      <h1 className="you-title">{W.title}</h1>
      {children}
    </main>
  );
}

export function CharacterDrift() {
  const auth = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'idle' | 'failed' | 'forbidden'>('idle');
  const load = useCallback(async () => {
    const res = await authFetch('/api/you/illustrations/characters').catch(() => null);
    if (res?.ok) setData((await res.json()) as Data);
    else if (res?.status === 403) setState('forbidden');
    else if (res?.status !== 401) setState('failed');
  }, []);
  useEffect(() => {
    if (auth.kind === 'signed-in') void load();
  }, [auth.kind, load]);

  if (auth.kind === 'loading') return <Frame>{<p className="you-note">{W.loading}</p>}</Frame>;
  if (auth.kind === 'signed-out')
    return (
      <Frame>
        <p className="you-lede">{W.signedOut}</p>
        <div className="you-sign-in">
          <SignInButton className="ic-secondary" />
        </div>
      </Frame>
    );
  if (state === 'forbidden') return <Frame>{<p className="you-note">{W.notOwner}</p>}</Frame>;
  if (state === 'failed')
    return (
      <Frame>
        <p className="you-note" role="alert">
          {W.failed}
        </p>
      </Frame>
    );
  if (!data) return <Frame>{<p className="you-note">{W.loading}</p>}</Frame>;
  return (
    <Frame>
      <p className="you-lede">{W.lede}</p>
      <p className="you-note">
        <Link href="/you/illustrations">{W.back}</Link>
      </p>
      {!data.canSave && <p className="you-note">{W.cantSave}</p>}
      {data.styles.map((s) => (
        <section key={s.style} className="drift-style" aria-label={W.style(s.name)}>
          <h2 className="you-meta drift-style-name">{W.style(s.name)}</h2>
          {s.characters.map((c) => (
            <Character key={c.slug} c={c} canSave={data.canSave} reload={load} />
          ))}
        </section>
      ))}
    </Frame>
  );
}

function Character({ c, canSave, reload }: { c: DriftCharacter; canSave: boolean; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<string | null | 'missing'>(null);
  // The sheet is the owner's only (not published): fetched with their sign-in when the fold first opens.
  useEffect(() => {
    if (!open || sheet !== null || !c.sheet) return;
    let url: string | null = null;
    void authFetch(`/api/you/illustrations/sheet/${c.slug}`)
      .then(async (r) => {
        if (!r.ok) return setSheet('missing');
        url = URL.createObjectURL(await r.blob());
        setSheet(url);
      })
      .catch(() => setSheet('missing'));
  }, [open, sheet, c.sheet, c.slug]);
  useEffect(() => () => {
    if (sheet && sheet !== 'missing') URL.revokeObjectURL(sheet);
  }, [sheet]);
  const flagged = c.images.filter((i) => i.decision?.decision === 'regenerate').length;
  return (
    <details className="drift-char" data-character={c.slug} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="drift-summary">
        <span className="drift-name">{c.name}</span>
        <span className="you-meta">
          {W.count(c.images.length)}
          {flagged ? W.flagged(flagged) : ''}
        </span>
      </summary>
      {open && (
        <div className="drift-body">
          <figure className="you-fig drift-sheet">
            {!c.sheet ? (
              <p className="you-note">{W.noSheet}</p>
            ) : sheet === 'missing' ? (
              <p className="you-note">{W.sheetMissing}</p>
            ) : sheet ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sheet} alt={W.sheetAlt(c.name)} width={c.sheet.width} height={c.sheet.height} />
            ) : (
              <p className="you-note">{W.loading}</p>
            )}
            <figcaption className="you-meta">{W.sheet}</figcaption>
          </figure>
          <ol className="drift-grid">
            {c.images.map((im) => (
              <Tile key={im.id} im={im} slug={c.slug} name={c.name} canSave={canSave} reload={reload} />
            ))}
          </ol>
        </div>
      )}
    </details>
  );
}

function Tile({ im, slug, name, canSave, reload }: { im: DriftImage; slug: string; name: string; canSave: boolean; reload: () => Promise<void> }) {
  const d = im.decision;
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState(d?.decision === 'regenerate' ? (d.note ?? '') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flag() {
    if (!note.trim()) return setError(W.noteNeeded);
    setBusy(true);
    setError(null);
    const res = await authFetch('/api/you/illustrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: im.id, decision: 'regenerate', note, fromCheck: false }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? W.couldNot);
    setNoting(false);
    await reload();
  }

  return (
    <li className="drift-tile" data-job={im.id} data-decision={d?.decision ?? 'none'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={im.image.url} alt={W.imageAlt(name, im.chapter, im.idx)} width={im.image.width} height={im.image.height} loading="lazy" />
      <AiLabel kind="image" text={AI_LABEL.image} file={im.recipe} item={im.id} />
      <p className="you-meta">
        {W.where(im.chapter, im.idx)}
        {im.with.length > 0 && <span className="drift-with"> {W.with(im.with)}</span>}
      </p>
      {d && (
        <p className={`you-meta drift-decision is-${d.decision}`}>
          {W.decision[d.decision]}
          {d.note ? ` · “${d.note}” · ${W.noteBy(noteCredit(d))}` : ''}
        </p>
      )}
      {canSave && !noting && (
        <div className="you-actions">
          <button type="button" className="ic-secondary" disabled={busy} onClick={() => setNoting(true)}>
            {d?.decision === 'regenerate' ? W.editNote : W.flag}
          </button>
        </div>
      )}
      {canSave && noting && (
        <div className="illus-note">
          <PublishedTextField id={`drift-${slug}-${im.id}`} label={W.noteLabel(name)} value={note} onChange={setNote} rows={3} maxLength={1000} />
          <div className="you-actions">
            <button type="button" className="ic-secondary" disabled={busy} onClick={() => void flag()}>
              {W.save}
            </button>
            <button type="button" className="ic-secondary" disabled={busy} onClick={() => setNoting(false)}>
              {W.cancel}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="you-note" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
