'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { AI_LABEL } from '~/lib/ai-declared';
import { ILLUSTRATION_CHECK } from '~/lib/config';
import type { ReviewItem, Decision } from '~/lib/illustration-check/review';
import { GROUP_NAMES, MODEL_NAMES, noteCredit, reviewGroup, worstFirst } from '~/lib/illustration-check/schema';
import { AiLabel } from './recipe-sheet';
import { PublishedTextField } from './publish-words';
import { SignInButton } from './sign-in';
import { CapLine, DraftImage, LookPanel, PicturePanel, errorOf, post, type PictureItem, type PicturesState } from './chapter-pictures';
import type { WaitingDraft } from '~/lib/chapter-pictures/waiting';
import { localDay } from '~/lib/chapter-pictures/shared';

/**
 * The admins' review of the seeded images (/you/illustrations; owner, 2026-10-23: "Does each image show its scene?"; admins since
 * 2026-10-29).
 * Worst first: wrong, then partly, then matches, then not checked. Each job shows the passage, the image, the vision
 * check's fields and verdict, and three buttons: keep, regenerate with my note, drop. A decision is saved with who
 * decided and when (studio.illustration_reviews); those three change nothing on the site. Since 2026-11-18 (owner,
 * option B) each picture can also be redone here and kept, which shows it in the chapter at once
 * (src/components/chapter-pictures.tsx). Admins only: the page as served holds nothing, and /api/you/illustrations
 * answers only for admins (404 for anyone else).
 *
 * Every sentence here is DRAFT wording for the owner (coding agent, 2026-10-23), kept in W.
 */
const W = {
  title: 'Does each image show its scene?',
  signedOut: 'Sign in to review the images. Only the project’s admins can open this page.',
  notOwner: 'This page is for the project’s admins.',
  loading: 'Loading…',
  failed: 'The review didn’t load. Try again in a moment.',
  lede: (n: number, checked: number) => `${n} images, ${checked} checked. Worst first: wrong, then partly, then matches, then not checked yet.`,
  checker: `Each check is written by an AI model, ${ILLUSTRATION_CHECK.modelName} (closed, by Google), through the Vercel AI Gateway: it can be wrong. Only admins see it.`,
  cantSave: 'Decisions can’t be saved on this copy of the site yet (the review tables aren’t there).',
  passage: (ch: number, dateline: string | null) => `The book, chapter ${ch}${dateline ? ` · ${dateline}` : ''}`,
  noImage: (why: string | null) => `No published image${why ? `: ${why}` : ''}.`,
  notChecked: 'Not checked yet.',
  checkBy: (model: string) => `AI check · by ${model}`,
  who: 'Who',
  people: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`,
  setting: 'Setting',
  action: 'Action',
  time: 'Time of day',
  problems: 'Problems',
  none: 'None found.',
  verdict: { wrong: 'Wrong', partly: 'Partly', matches: 'Matches' } as Record<string, string>,
  keep: 'Keep',
  regenerate: 'Regenerate with my note',
  drop: 'Drop',
  noteLabel: 'Your note for the redo (it is added to this image’s prompt, credited to you)',
  draftedBy: (check: string, fix: string | null) => `Drafted by the image check (${MODEL_NAMES[check] ?? check} finding${fix ? `, ${MODEL_NAMES[fix] ?? fix} fix line` : ''})`,
  drafted: 'Keep it as it is or edit it; saving it approves it.',
  draftedEdited: 'Edited by you.',
  finding: 'Finding',
  fix: 'Fix line',
  saveNote: 'Save the note',
  cancel: 'Cancel',
  noteNeeded: 'Write what should change first.',
  decided: (d: string, at: string, fid: number) => `Latest decision: ${d} · ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · FID ${fid}`,
  noteBy: (credit: string) => `Note ${credit}`,
  decisionWord: { keep: 'keep', regenerate: 'regenerate', drop: 'drop' } as Record<Decision, string>,
  inJobFile: 'Reviewed by a person (in the job file).',
  couldNot: 'Could not save it',
  /** Where the redo flow isn't offered (before the migration, or a lettered picture), the old buttons say what they do. Reread by the owner 2026-11-19 (no longer DRAFT). */
  recordOnly: 'These record your decision for the review only. They change nothing on the site.',
  problemType: { reference_copy_in_crowd: 'Copy of a cast member', contradicts_facts: 'Contradicts the book', stray_text: 'Stray text', other: 'Other' } as Record<string, string>,
};

interface Data {
  items: (ReviewItem & Partial<PictureItem>)[];
  canSave: boolean;
  /** The chapter pictures' state (owner, 2026-11-18); null without a database. */
  pictures: PicturesState | null;
  /** Pictures admins added while reading (owner, 2026-11-19), and every draft not kept yet. */
  added?: PictureItem[];
  waiting?: WaitingDraft[];
}

/** DRAFT wording (coding agent, 2026-11-19) for the drafts waiting and the added pictures. */
const WW = {
  waitingTitle: (n: number) => `Drafts waiting (${n})`,
  waitingNone: 'No drafts waiting.',
  waitingLede: 'Every draft no admin has kept yet, newest first, with where it would go. Nothing here is public.',
  where: (d: WaitingDraft) =>
    d.where.kind === 'replace' ? `Would replace the picture at chapter ${d.chapter}, block ${d.where.block}` : d.where.kind === 'added' ? `A new picture for chapter ${d.chapter}, after block ${d.where.after} (it shows blocks ${d.where.start}–${d.where.end})` : `A new picture for chapter ${d.chapter}`,
  meta: (d: WaitingDraft) => `${d.model} · by FID ${d.madeByFid} · ${localDay(d.madeAt)}`,
  open: 'Open in the chapter',
  keep: 'Keep: show it in the chapter now',
  addedTitle: (n: number) => `Pictures added while reading (${n})`,
};

function Waiting({ waiting, reload }: { waiting: WaitingDraft[]; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keep = async (d: WaitingDraft) => {
    setBusy(true);
    const r = await post('/api/you/illustrations/show', { jobId: d.jobId, versionId: d.versionId });
    setBusy(false);
    if (!r.ok) return setError(errorOf(r.json));
    await reload();
  };
  return (
    <section className="cp-waiting" aria-labelledby="cp-waiting-title">
      <h2 id="cp-waiting-title" className="cp-look-title">
        {WW.waitingTitle(waiting.length)}
      </h2>
      <p className="you-note">{waiting.length ? WW.waitingLede : WW.waitingNone}</p>
      {waiting.length > 0 && (
        <ol className="cp-versions">
          {waiting.map((d) => (
            <li key={d.versionId} className="cp-version" data-waiting={d.versionId} data-job={d.jobId}>
              <figure className="you-fig">
                <DraftImage id={d.versionId} alt={`AI-generated image: a draft for chapter ${d.chapter}`} />
                <figcaption className="you-meta">
                  {WW.where(d)}
                  <br />
                  {WW.meta(d)}
                  <br />“{d.note}”
                </figcaption>
              </figure>
              <div className="you-actions">
                <Link className="ic-secondary" href={d.href}>
                  {WW.open}
                </Link>
                <button type="button" className="ic-secondary" disabled={busy} onClick={() => void keep(d)}>
                  {WW.keep}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p className="you-note" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="you illus-review">
      <p className="you-kicker label">
        <Link href="/you">You</Link> · Images
      </p>
      <h1 className="you-title">{W.title}</h1>
      {children}
    </main>
  );
}

export function IllustrationReview() {
  const auth = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'idle' | 'failed' | 'forbidden'>('idle');
  const load = useCallback(async () => {
    const res = await authFetch('/api/you/illustrations').catch(() => null);
    if (res?.ok) setData((await res.json()) as Data);
    else if (res?.status === 403 || res?.status === 404) setState('forbidden');
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
      <p className="you-lede">{W.lede(data.items.length, data.items.filter((i) => i.check).length)}</p>
      <p className="you-note">{W.checker}</p>
      {!data.canSave && <p className="you-note">{W.cantSave}</p>}
      {data.pictures?.ready && (
        <>
          <CapLine cap={data.pictures.cap} />
          <Waiting waiting={data.waiting ?? []} reload={load} />
          <LookPanel state={data.pictures} reload={load} />
          {(data.added ?? []).length > 0 && (
            <section className="cp-added" aria-labelledby="cp-added-title">
              <h2 id="cp-added-title" className="cp-look-title">
                {WW.addedTitle(data.added!.length)}
              </h2>
              <ol className="illus-list">
                {data.added!.map((a) => (
                  <li key={a.id} className="illus-item" data-job={a.id}>
                    <PicturePanel item={a} state={data.pictures!} reload={load} />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
      <ol className="illus-list">
        {[...data.items].sort(worstFirst).map((item) => (
          <Item key={item.id} item={item} canSave={data.canSave} pictures={data.pictures} reload={load} />
        ))}
      </ol>
    </Frame>
  );
}

function Item({ item, canSave, pictures, reload }: { item: Data['items'][number]; canSave: boolean; pictures: PicturesState | null; reload: () => Promise<void> }) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState(item.decision?.note ?? '');
  // The note the check drafted (owner, 2026-10-24): its one-line finding, offered when Regenerate opens an empty box.
  const [fromCheck, setFromCheck] = useState(Boolean(item.decision?.draftedNote));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = item.check?.answer ?? null;
  // What pre-fills the note (owner, 2026-10-24: "Regenerate pre-fills the fix line, not the finding").
  const draft = (a?.fix_line?.text ?? '').trim();
  const draftLabel = a ? W.draftedBy(item.check!.model, a.fix_line?.model ?? null) : '';

  async function decide(decision: Decision) {
    if (decision === 'regenerate' && !note.trim()) return setError(W.noteNeeded);
    setBusy(true);
    setError(null);
    const res = await authFetch('/api/you/illustrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: item.id, decision, note: decision === 'regenerate' ? note : note.trim() || null, checkRun: item.check?.run ?? null, fromCheck: decision === 'regenerate' && fromCheck && !!a }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? W.couldNot);
    setNoting(false);
    await reload();
  }

  const headingId = `illus-${item.id}`;
  // The redo flow (src/components/chapter-pictures.tsx) is offered for this picture: the migration applied and a picture it can redo.
  const redoHere = Boolean(pictures?.ready && item.redoable);
  return (
    <li className="illus-item" data-verdict={item.verdict ?? 'unchecked'} data-group={GROUP_NAMES[reviewGroup(item.verdict, item.double)]} data-job={item.id}>
      <article aria-labelledby={headingId}>
        <h2 id={headingId} className="illus-head">
          <span className={`illus-verdict is-${item.verdict ?? 'unchecked'}`}>{item.verdict ? W.verdict[item.verdict] : W.notChecked}</span>
          <span className="illus-id">
            Chapter {item.chapter} · block {item.idx} · {item.id}
          </span>
        </h2>
        {item.image ? (
          <figure className="you-fig illus-fig">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image.url} alt={`AI-generated image for chapter ${item.chapter}, block ${item.idx}`} width={item.image.width} height={item.image.height} loading="lazy" />
            <figcaption>
              <AiLabel kind="image" text={AI_LABEL.image} file={item.recipe} item={item.id} />
            </figcaption>
          </figure>
        ) : (
          <p className="you-note">{W.noImage(item.excluded)}</p>
        )}
        <section className="illus-passage" aria-label={W.passage(item.chapter, item.dateline)}>
          <p className="you-meta">{W.passage(item.chapter, item.dateline)}</p>
          {item.passage.map((b) => (
            <p key={b.idx} className={b.target ? 'is-target' : undefined}>
              {b.text}
            </p>
          ))}
        </section>
        {a && item.check ? (
          <section className="illus-check" aria-label={W.checkBy(ILLUSTRATION_CHECK.modelName)}>
            <p className="you-meta ai-check-label">{W.checkBy(item.check.model === ILLUSTRATION_CHECK.model ? ILLUSTRATION_CHECK.modelName : item.check.model)}</p>
            <dl className="you-facts">
              <div>
                <dt>{W.who}</dt>
                <dd>
                  {W.people(a.who.count)}
                  {a.who.identities.length > 0 && (
                    <ul className="illus-who">
                      {a.who.identities.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  )}
                  {a.who.notes && <span className="illus-who-notes">{a.who.notes}</span>}
                </dd>
              </div>
              <div>
                <dt>{W.setting}</dt>
                <dd>{a.setting}</dd>
              </div>
              <div>
                <dt>{W.action}</dt>
                <dd>{a.action}</dd>
              </div>
              <div>
                <dt>{W.time}</dt>
                <dd>{a.time_of_day}</dd>
              </div>
              <div>
                <dt>{W.problems}</dt>
                <dd>
                  {a.problems.length ? (
                    <ul className="illus-problems">
                      {a.problems.map((p, i) => (
                        <li key={i}>
                          <strong>{W.problemType[p.type] ?? p.type}:</strong> {p.detail}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    W.none
                  )}
                </dd>
              </div>
              <div>
                <dt>{W.verdict[a.verdict]}</dt>
                <dd>{a.why}</dd>
              </div>
              {a.fix_line && (
                <div className="illus-fix">
                  <dt>{W.fix}</dt>
                  <dd>
                    {a.fix_line.text} <span className="you-meta">{W.draftedBy(item.check.model, a.fix_line.model)}</span>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        ) : (
          <p className="you-note">{W.notChecked}</p>
        )}
        {item.decision && <p className="you-meta illus-decided">{W.decided(W.decisionWord[item.decision.decision], item.decision.at, item.decision.byFid)}{item.decision.note ? ` · “${item.decision.note}” · ${W.noteBy(noteCredit(item.decision))}` : ''}</p>}
        {item.inJobFile && <p className="you-meta">{W.inJobFile}</p>}
        {pictures && (
          <PicturePanel
            item={{ id: item.id, chapter: item.chapter, redoable: Boolean(item.redoable), shown: item.shown ?? null, versions: item.versions ?? [], decisions: item.decisions ?? [], image: item.image }}
            state={pictures}
            reload={reload}
          />
        )}
        {/* Nate, 2026-11-18: where the redo is offered, its Redo and Keep replace these three (hidden); elsewhere they say they only record. */}
        {canSave && !redoHere && <p className="you-meta illus-record-only">{W.recordOnly}</p>}
        {canSave && !redoHere && (
          <div className="you-actions illus-actions">
            <button type="button" className="ic-secondary" disabled={busy} aria-pressed={item.decision?.decision === 'keep'} onClick={() => void decide('keep')}>
              {W.keep}
            </button>
            <button type="button" className="ic-secondary" disabled={busy} aria-expanded={noting} aria-pressed={item.decision?.decision === 'regenerate'}
              onClick={() => {
                if (!noting && !note.trim() && draft) {
                  setNote(draft);
                  setFromCheck(true);
                }
                setNoting((v) => !v);
              }}
            >
              {W.regenerate}
            </button>
            <button type="button" className="ic-secondary" disabled={busy} aria-pressed={item.decision?.decision === 'drop'} onClick={() => void decide('drop')}>
              {W.drop}
            </button>
          </div>
        )}
        {canSave && !redoHere && noting && (
          <div className="illus-note">
            {fromCheck && a && (
              <p className="you-meta illus-drafted" data-edited={note.trim() !== draft ? 'yes' : 'no'}>
                {draftLabel}. {note.trim() !== draft ? W.draftedEdited : W.drafted}
              </p>
            )}
            <PublishedTextField id={`note-${item.id}`} label={W.noteLabel} value={note} onChange={setNote} rows={3} maxLength={1000} />
            <div className="you-actions">
              <button type="button" className="ic-secondary" disabled={busy} onClick={() => void decide('regenerate')}>
                {W.saveNote}
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
      </article>
    </li>
  );
}
