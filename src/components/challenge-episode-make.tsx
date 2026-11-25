'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, useSocialSession, useWalletSession, webNameProof } from '~/lib/client-auth';
import { EPISODE } from '~/lib/config';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';
import { blankDraft, holdsSample, moveCard, type Problem } from '~/lib/challenge/episode/rules';
import { byline } from '~/lib/images/byline';
import { SignInChoices } from './sign-in-choices';
import { DraftMark, EpisodeGoals, OutlineFull, PictureThumb, type ShownPicture } from './challenge-episode-views';
import { EpisodeShare } from './challenge-episode-share';

/**
 * Episode 1: the deck (owner, 2026-11-24; mocks P2, P3, P4 and D1 in docs/proposals/episode-1-opening/). The draft
 * lives on this device only (localStorage) until Submit. Cards: drag ⋮⋮ to reorder (pointer events, so it works with a
 * finger as with a mouse), or ↑ ↓; the first-minute line is dragged the same way, or moved with its own ↑ ↓. Tap a card
 * to edit it (a bottom sheet on a phone, in place on a wide screen). A card may carry a picture already published on
 * the site (the picker reads /api/challenge/episode-1/pictures; nothing is generated). "Ask AI to comment" sends the
 * draft's words once, and shows the comment labelled as the AI's; there is no way to copy it into a card. Submit shows
 * the outline as it will appear, then sends it.
 */
type DCard = { happens: string; does: string; picture: string | null; pic?: ShownPicture | null; hint?: { happens: string; does: string } };
type DDraft = { title: string; cards: DCard[]; minuteAfter: number };
const KEY = `snowmoon.${EPISODE.id}.draft`;

const load = (): DDraft | null => {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as DDraft | null;
    return j && Array.isArray(j.cards) ? j : null;
  } catch {
    return null;
  }
};
const save = (d: DDraft | null) => {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
  } catch {}
};

const sampleDraft = (): DDraft => ({
  title: '',
  cards: EPISODE.sampleDeck.map((s) => ({ happens: '', does: '', picture: null, hint: { happens: s.happens, does: s.does } })),
  minuteAfter: Math.min(EPISODE.sampleMinuteAfter, EPISODE.sampleDeck.length),
});

type Drag = { kind: 'card'; from: number; over: number } | { kind: 'line'; over: number };

export function EpisodeMake() {
  const auth = useAuth();
  const social = useSocialSession();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || social !== null || wallet !== null;
  const walletOnly = wallet !== null && auth.kind !== 'signed-in' && social === null;
  const [d, setD] = useState<DDraft | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview' | 'done'>('edit');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; left: number } | null>(null);
  const [mine, setMine] = useState<{ open: boolean; left: number } | null>(null);
  const [comment, setComment] = useState<{ text: string; label: string } | { withheld: true } | { error: string } | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [goals, setGoals] = useState(false);
  const cardEls = useRef<(HTMLLIElement | null)[]>([]);

  // Start: ?start=blank or ?start=sample replaces nothing if a draft exists (the landing offers "Continue your draft").
  useEffect(() => {
    const start = new URLSearchParams(window.location.search).get('start');
    const kept = load();
    const first = kept ?? (start === 'sample' && EPISODE.sampleDeck.length ? sampleDraft() : (blankDraft() as DDraft));
    setD(first);
    // A picture hidden or unpublished since it was attached is dropped from the draft.
    const ids = first.cards.map((c) => c.picture).filter((p): p is string => Boolean(p));
    if (ids.length)
      void authFetch(`/api/challenge/episode-1/pictures?ids=${ids.join(',')}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { pictures?: ShownPicture[] } | null) => {
          if (!j?.pictures) return;
          const ok = new Map(j.pictures.map((p) => [p.versionId, p]));
          setD((x) => (x ? { ...x, cards: x.cards.map((c) => (c.picture && !ok.has(c.picture) ? { ...c, picture: null, pic: null } : c.picture ? { ...c, pic: ok.get(c.picture) } : c)) } : x));
        })
        .catch(() => null);
  }, []);
  useEffect(() => {
    if (d && mode !== 'done') save(d);
  }, [d, mode]);
  useEffect(() => {
    void authFetch('/api/challenge/episode-1/mine')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { open?: boolean; left?: number } | null) => setMine(j ? { open: Boolean(j.open), left: j.left ?? 0 } : null))
      .catch(() => setMine(null));
  }, [signedIn]);

  const update = useCallback((f: (x: DDraft) => DDraft) => {
    setD((x) => (x ? f(x) : x));
    setProblems([]);
  }, []);
  const setCard = (i: number, patch: Partial<DCard>) => update((x) => ({ ...x, cards: x.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const move = (from: number, to: number) => update((x) => ({ ...moveCard(x, from, to) }) as DDraft);
  const moveLine = (to: number) => update((x) => ({ ...x, minuteAfter: Math.max(0, Math.min(x.cards.length, to)) }));
  const add = () => {
    update((x) => (x.cards.length >= EPISODE.maxCards ? x : { ...x, cards: [...x.cards, { happens: '', does: '', picture: null }] }));
    setEditing(d ? d.cards.length : null);
  };
  const remove = (i: number) => {
    update((x) => ({ ...x, cards: x.cards.filter((_, j) => j !== i), minuteAfter: i < x.minuteAfter ? x.minuteAfter - 1 : Math.min(x.minuteAfter, x.cards.length - 1) }));
    setEditing(null);
  };

  // Dragging: where the pointer is among the cards' middles.
  const slotAt = (y: number, skip: number | null) => {
    let n = 0;
    cardEls.current.forEach((el, i) => {
      if (!el || i === skip) return;
      const r = el.getBoundingClientRect();
      if (y > r.top + r.height / 2) n++;
    });
    return n;
  };
  const startDrag = (e: React.PointerEvent, what: Drag) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(what);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag(drag.kind === 'card' ? { ...drag, over: slotAt(e.clientY, drag.from) } : { kind: 'line', over: slotAt(e.clientY, null) });
  };
  const endDrag = () => {
    if (!drag) return;
    if (drag.kind === 'card') move(drag.from, drag.over);
    else moveLine(drag.over);
    setDrag(null);
  };

  const body = useMemo(() => (d ? { title: d.title, cards: d.cards.map((c) => ({ happens: c.happens, does: c.does, picture: c.picture })), minuteAfter: d.minuteAfter } : null), [d]);
  const filled = d?.cards.filter((c) => c.happens.trim() || c.does.trim()).length ?? 0;

  const askComment = async () => {
    if (!body) return;
    setCommenting(true);
    setComment(null);
    const res = await authFetch('/api/challenge/episode-1/comment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { state?: string; text?: string; label?: string; error?: string };
    setCommenting(false);
    if (res?.ok && j.state === 'comment' && j.text) setComment({ text: j.text, label: j.label ?? '' });
    else if (res?.ok && j.state === 'withheld') setComment({ withheld: true });
    else setComment({ error: j?.error ?? 'Something went wrong' });
  };

  const submit = async () => {
    if (!body) return;
    setBusy(true);
    setNote(null);
    const res = await authFetch('/api/challenge/episode-1/outlines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, nameProof: webNameProof() }) }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { id?: string; left?: number; error?: string; problems?: Problem[] };
    setBusy(false);
    if (res?.ok && j.id) {
      setDone({ id: j.id, left: j.left ?? 0 });
      setMode('done');
      save(null);
      return;
    }
    if (j?.problems) {
      setProblems(j.problems);
      setMode('edit');
    }
    setNote(j?.error ?? 'Something went wrong');
  };

  if (!d) return <div className="page ep-page" />;

  if (mode === 'done' && done)
    return (
      <div className="page ep-page ep-done">
        <p className="ep-crumb">
          <Link href="/challenge/episode-1">{W.back}</Link>
        </p>
        <h1 className="ep-title">{W.submitted}</h1>
        <p className="ep-small">{W.left(done.left)}</p>
        <EpisodeShare id={done.id} mine />
        <p className="ep-btns">
          <Link href={`/challenge/episode-1/o/${done.id}`} className="ep-btn ep-btn-solid">
            {W.seeIt}
          </Link>
          <Link href="/challenge/episode-1/outlines" className="ep-btn">
            {W.everyOutline}
          </Link>
        </p>
      </div>
    );

  const me = auth.kind === 'signed-in' ? auth.fid : 0;
  const name = auth.kind === 'signed-in' ? auth.username : (social?.handle ?? null);
  const problemsFor = (i: number) => problems.filter((p) => p.card === i);
  const general = problems.filter((p) => p.card === null);
  const canSubmit = signedIn && !walletOnly && mine?.open && (mine?.left ?? 0) > 0 && filled > 0;

  const gate = (
    <section className="ep-submit-box">
      {!signedIn ? (
        <>
          <p className="ep-small">{W.signInToSubmit}</p>
          <SignInChoices wallet size="small" note={false} only={['farcaster', 'lens', 'bluesky']} />
        </>
      ) : walletOnly ? (
        <p className="ep-small">{W.walletCantSubmit}</p>
      ) : mine && !mine.open ? (
        <p className="ep-small">{W.closed}</p>
      ) : mine && mine.left === 0 ? (
        <p className="ep-small">{W.tooMany(EPISODE.livePerPerson)}</p>
      ) : null}
      {note && <p className="ep-note" role="alert">{note}</p>}
    </section>
  );

  if (mode === 'preview')
    return (
      <div className="page ep-page ep-preview">
        <p className="ep-crumb">
          <button type="button" className="ep-link" onClick={() => setMode('edit')}>
            {W.editAgain}
          </button>
        </p>
        <OutlineFull preview o={{ id: 'preview', byFid: me, byName: name, title: d.title.trim() || null, cards: d.cards, minuteAfter: d.minuteAfter, submittedAt: new Date().toISOString() }} />
        <p className="ep-small">{W.savedHere}</p>
        <p className="ep-btns">
          <button type="button" className="ep-btn ep-btn-solid" disabled={busy || !canSubmit} onClick={() => void submit()}>
            {busy ? W.submitting : W.submit}
          </button>
          <button type="button" className="ep-btn" onClick={() => setMode('edit')}>
            {W.editAgain}
          </button>
        </p>
        {gate}
      </div>
    );

  const line = drag?.kind === 'line' ? drag.over : d.minuteAfter;
  // The order shown while dragging a card: the card lifted to where it would land.
  const order = d.cards.map((_, i) => i);
  if (drag?.kind === 'card') {
    order.splice(drag.from, 1);
    order.splice(drag.over, 0, drag.from);
  }
  const lineItem = (
    <li key="line" className={`ep-minute ep-minute-edit${drag?.kind === 'line' ? ' ep-dragging' : ''}`}>
      <button type="button" className="ep-minute-grip" aria-label={W.minuteMove} onPointerDown={(e) => startDrag(e, { kind: 'line', over: d.minuteAfter })} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
        ⇕ {W.minuteLine}
      </button>
      <span className="ep-minute-moves">
        <button type="button" className="ep-mini" aria-label={W.minuteUp} disabled={d.minuteAfter === 0} onClick={() => moveLine(d.minuteAfter - 1)}>
          ↑
        </button>
        <button type="button" className="ep-mini" aria-label={W.minuteDown} disabled={d.minuteAfter >= d.cards.length} onClick={() => moveLine(d.minuteAfter + 1)}>
          ↓
        </button>
      </span>
    </li>
  );

  return (
    <div className="page ep-page ep-make" data-page="episode-make">
      <div className="ep-make-main">
        <p className="ep-crumb">
          <Link href="/challenge/episode-1">{W.back}</Link> <DraftMark />
        </p>
        <label className="ep-title-field">
          <span className="sr-only">{W.titleLabel}</span>
          <input value={d.title} maxLength={EPISODE.titleMaxChars} placeholder={W.titlePlaceholder} onChange={(e) => update((x) => ({ ...x, title: e.target.value }))} />
        </label>
        <p className="ep-hint">
          {W.cardsOf(d.cards.length)} · {W.dragHint}
        </p>
        {d.cards.some((c) => c.hint) && <p className="ep-hint">{W.sampleHint}</p>}
        <ol className="ep-deck ep-deck-edit">
          {line === 0 && lineItem}
          {order.map((i, pos) => {
            const c = d.cards[i];
            const ps = problemsFor(i);
            const isEditing = editing === i;
            const sample = holdsSample(c);
            const item = (
              <li
                key={`card-${i}`}
                ref={(el) => {
                  cardEls.current[i] = el;
                }}
                className={`ep-card ep-card-edit${isEditing ? ' ep-editing' : ''}${ps.length || sample ? ' ep-problem' : ''}${drag?.kind === 'card' && drag.from === i ? ' ep-dragging' : ''}`}
              >
                <button type="button" className="ep-handle" aria-label={W.dragCard} onPointerDown={(e) => startDrag(e, { kind: 'card', from: i, over: i })} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
                  ⋮⋮
                </button>
                <div className="ep-card-body">
                  <span className="ep-num">{pos + 1}</span>
                  {!isEditing ? (
                    <button type="button" className="ep-card-tap" onClick={() => setEditing(i)}>
                      <span className={c.happens ? 'ep-happens' : 'ep-happens ep-empty'}>{c.happens || c.hint?.happens || W.happensEmpty}</span>
                      <span className={c.does ? 'ep-does' : 'ep-does ep-empty'}>{c.does || c.hint?.does || W.doesEmpty}</span>
                    </button>
                  ) : (
                    <>
                      <div className="ep-sheet-backdrop" onClick={() => setEditing(null)} />
                      <div className="ep-editor" role="group" aria-label={W.editCard(pos + 1, d.cards.length)}>
                        <p className="ep-hint">
                          {W.editCard(pos + 1, d.cards.length)}
                          <span className="ep-moves">
                            <button type="button" className="ep-mini" aria-label={W.moveUp} disabled={i === 0} onClick={() => { move(i, i - 1); setEditing(i - 1); }}>
                              ↑
                            </button>
                            <button type="button" className="ep-mini" aria-label={W.moveDown} disabled={i === d.cards.length - 1} onClick={() => { move(i, i + 1); setEditing(i + 1); }}>
                              ↓
                            </button>
                          </span>
                        </p>
                        <label className="ep-field">
                          <span className="ep-field-label">{W.happens}</span>
                          <textarea rows={2} value={c.happens} maxLength={EPISODE.cardMaxChars} placeholder={c.hint?.happens ?? ''} onChange={(e) => setCard(i, { happens: e.target.value })} autoFocus />
                          <span className={[...c.happens].length > EPISODE.cardChars ? 'ep-count ep-over' : 'ep-count'}>{W.counter([...c.happens].length)}</span>
                        </label>
                        <label className="ep-field">
                          <span className="ep-field-label">{W.does}</span>
                          <textarea rows={2} value={c.does} maxLength={EPISODE.cardMaxChars} placeholder={c.hint?.does ?? ''} onChange={(e) => setCard(i, { does: e.target.value })} />
                          <span className={[...c.does].length > EPISODE.cardChars ? 'ep-count ep-over' : 'ep-count'}>{W.counter([...c.does].length)}</span>
                        </label>
                        <p className="ep-field-label">{W.pictureHead}</p>
                        {c.pic ? (
                          <p className="ep-pic-row">
                            <PictureThumb p={c.pic} />
                            <span className="ep-small">{W.pictureBy(byline(c.pic.byName, c.pic.byFid))}</span>
                            <button type="button" className="ep-btn" onClick={() => setCard(i, { picture: null, pic: null })}>
                              {W.removePicture}
                            </button>
                          </p>
                        ) : (
                          <p className="ep-btns">
                            <button type="button" className="ep-btn" onClick={() => setPicking(i)}>
                              {W.choosePicture}
                            </button>
                          </p>
                        )}
                        <p className="ep-small">{W.pictureNote}</p>
                        <p className="ep-btns ep-editor-end">
                          <button type="button" className="ep-btn ep-btn-warn" onClick={() => remove(i)}>
                            {W.deleteCard}
                          </button>
                          <button type="button" className="ep-btn ep-btn-solid" onClick={() => setEditing(null)}>
                            {W.done}
                          </button>
                        </p>
                      </div>
                    </>
                  )}
                  {ps.map((p) => (
                    <p key={p.why} className="ep-note" role="alert">
                      {p.why}
                    </p>
                  ))}
                </div>
                {!isEditing && c.pic && <PictureThumb p={c.pic} />}
              </li>
            );
            return line === pos + 1 ? [item, lineItem] : [item];
          })}
        </ol>
        {d.cards.length < EPISODE.maxCards && (
          <button type="button" className="ep-add" onClick={add}>
            {W.addCard(EPISODE.maxCards - d.cards.length)}
          </button>
        )}
        {general.map((p) => (
          <p key={p.why} className="ep-note" role="alert">
            {p.why}
          </p>
        ))}
        <p className="ep-small">{W.savedHere}</p>
        <p className="ep-btns">
          <button
            type="button"
            className="ep-link"
            onClick={() => {
              if (window.confirm(W.startOverConfirm)) {
                save(null);
                setD(blankDraft() as DDraft);
                setComment(null);
              }
            }}
          >
            {W.startOver}
          </button>
        </p>
      </div>
      <aside className={`ep-make-side${goals ? ' ep-goals-open' : ''}`}>
        <div className="ep-panel ep-side-goals">
          <EpisodeGoals compact />
        </div>
        <section className="ep-panel ep-comment">
          <h2 className="ep-panel-title">{W.commentHead}</h2>
          <p className="ep-small">{W.commentAbout}</p>
          {signedIn ? (
            <p className="ep-btns">
              <button type="button" className="ep-btn" disabled={commenting || filled === 0} onClick={() => void askComment()}>
                {commenting ? W.commentBusy : W.commentAsk}
              </button>
            </p>
          ) : (
            <p className="ep-small">{W.commentSignIn}</p>
          )}
          {comment && 'text' in comment && (
            <div className="ep-ai-comment" aria-live="polite">
              <p className="ep-ai-label">{comment.label}</p>
              {comment.text.split(/\n{2,}/).map((para, k) => (
                <p key={k}>{para}</p>
              ))}
            </div>
          )}
          {comment && 'withheld' in comment && <p className="ep-note">{W.commentWithheld}</p>}
          {comment && 'error' in comment && <p className="ep-note">{comment.error}</p>}
        </section>
        {gate}
      </aside>
      <div className="ep-bar">
        <button type="button" className="ep-btn ep-bar-goals" aria-expanded={goals} onClick={() => setGoals((g) => !g)}>
          {W.goalsHead}
        </button>
        <button
          type="button"
          className="ep-btn ep-bar-comment"
          onClick={() => {
            setGoals(true);
            if (signedIn && filled > 0) void askComment();
          }}
          disabled={commenting}
        >
          {W.commentAsk}
        </button>
        <span className="ep-grow" />
        <button type="button" className="ep-btn ep-btn-solid" disabled={filled === 0} onClick={() => setMode('preview')}>
          {W.submit}
        </button>
      </div>
      {picking !== null && <PicturePicker onPick={(p) => { setCard(picking, { picture: p.versionId, pic: p }); setPicking(null); }} onClose={() => setPicking(null)} signedIn={signedIn} />}
    </div>
  );
}

/** Choose a picture already published on the site (mock P4): three sources, a grid, "Use this picture". */
function PicturePicker({ onPick, onClose, signedIn }: { onPick: (p: ShownPicture) => void; onClose: () => void; signedIn: boolean }) {
  const [from, setFrom] = useState<'characters' | 'challenge' | 'mine'>('characters');
  const [list, setList] = useState<ShownPicture[] | null>(null);
  const [chosen, setChosen] = useState<ShownPicture | null>(null);
  useEffect(() => {
    setList(null);
    setChosen(null);
    if (from === 'mine' && !signedIn) return setList([]);
    void authFetch(`/api/challenge/episode-1/pictures?from=${from}`)
      .then((r) => (r.ok ? r.json() : { pictures: [] }))
      .then((j: { pictures?: ShownPicture[] }) => setList(j.pictures ?? []))
      .catch(() => setList([]));
  }, [from, signedIn]);
  return (
    <div className="ep-picker-wrap" role="dialog" aria-modal="true" aria-labelledby="ep-picker-title">
      <div className="ep-picker">
        <p className="ep-crumb">
          <button type="button" className="ep-link" onClick={onClose}>
            {W.pickerCancel}
          </button>
        </p>
        <h2 id="ep-picker-title" className="ep-title ep-picker-title">
          {W.pickerTitle}
        </h2>
        <div className="ch-filter" role="group">
          {(['characters', 'challenge', 'mine'] as const).map((s) => (
            <button key={s} type="button" className="ch-chip" aria-pressed={from === s} onClick={() => setFrom(s)}>
              {W.pickerSources[s]}
            </button>
          ))}
        </div>
        {list === null ? (
          <p className="ep-small">…</p>
        ) : list.length === 0 ? (
          <p className="ep-small">{from === 'mine' && !signedIn ? W.pickerSignIn : W.pickerNone}</p>
        ) : (
          <ul className="ep-picker-grid" role="list">
            {list.map((p) => (
              <li key={p.versionId}>
                <button type="button" className={chosen?.versionId === p.versionId ? 'ep-pick ep-picked' : 'ep-pick'} aria-pressed={chosen?.versionId === p.versionId} onClick={() => setChosen(p)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the site's own picture host */}
                  <img src={p.thumb} alt={W.pictureAlt(byline(p.byName, p.byFid))} loading="lazy" />
                  <span className="ep-ai">{W.aiTag}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {chosen && (
          <p className="ep-small">
            {chosen.title ? `${chosen.title} · ` : ''}
            {W.pictureBy(byline(chosen.byName, chosen.byFid))} ·{' '}
            <a href={chosen.href} target="_blank" rel="noopener">
              {W.pictureRecipe}
            </a>
          </p>
        )}
        <p className="ep-btns">
          <button type="button" className="ep-btn ep-btn-solid" disabled={!chosen} onClick={() => chosen && onPick(chosen)}>
            {W.pickerUse}
          </button>
        </p>
      </div>
    </div>
  );
}
