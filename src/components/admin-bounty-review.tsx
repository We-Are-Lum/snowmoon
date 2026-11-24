'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import { AdminNoteField } from './admin-note-field';
import { FILTERS, LABELS, type ClaimCard, type EntryCard, type Filter, type Kind, type LabelKey, type ReviewView } from '~/lib/review/types';
import '../styles/admin-bounty.css';

/**
 * /admin/bounty for a signed-in admin (owner, 2026-11-23; branch bounty-review). Everyone else, and everyone until their
 * sign-in is known, sees `fallback` (the site's usual "not found"). Phone-first: one claim or entry per screen, Back and
 * Next at the bottom, three big label buttons and a short note. Labels are private to admins; hints are only hints.
 * Two tabs: the poidh bounty's claims (read on Base) and the challenge's entries.
 */
type Card = ClaimCard | EntryCard;
const FILTER_NAMES: Record<Filter, string> = { all: 'All', unlabelled: 'Unlabelled', followed_directions: 'Followed directions', good: 'Good', top: 'Top' };
const KEY = 'snowmoon.admin-bounty.v1';
const when = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const matches = (c: Card, f: Filter) => (f === 'all' ? true : f === 'unlabelled' ? c.marks.labels.length === 0 : c.marks.labels.some((l) => l.label === f));

export function AdminBountyReview({ fallback }: { fallback: React.ReactNode }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [view, setView] = useState<ReviewView | null>(null);
  const [tab, setTab] = useState<Kind>('bounty_claim');
  const [filter, setFilter] = useState<Filter>('all');
  // The list for this tab and filter, fixed when the filter is chosen, so a claim labelled under "Unlabelled" stays on
  // screen until the filter is tapped again.
  const [list, setList] = useState<string[] | null>(null);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tapping the current filter again redraws its list.
  const [redraw, setRedraw] = useState(0);
  // The claim or entry last open in this tab (sessionStorage), shown again after a reload.
  const restoreTo = useRef<string | null>(null);

  const load = useCallback(async (fresh = false) => {
    const r = await authFetch(`/api/admin/bounty${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' }).catch(() => null);
    const v = r?.ok ? ((await r.json()) as ReviewView) : null;
    setView(v);
    return v;
  }, []);
  useEffect(() => {
    if (!admin) return;
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { tab?: Kind; filter?: Filter; subject?: string } | null;
      if (s?.tab === 'bounty_claim' || s?.tab === 'challenge_entry') setTab(s.tab);
      if (s?.filter && (FILTERS as readonly string[]).includes(s.filter)) setFilter(s.filter);
      if (s?.subject) restoreTo.current = s.subject;
    } catch {}
    void load();
  }, [admin, load]);

  const cards: Card[] = useMemo(() => (view ? (tab === 'bounty_claim' ? view.claims : view.entries) : []), [view, tab]);
  const bySubject = useMemo(() => new Map(cards.map((c) => [c.subject, c])), [cards]);
  // A new list when the tab or filter changes (or the first answer arrives).
  useEffect(() => {
    if (!view) return;
    const ids = cards.filter((c) => matches(c, filter)).map((c) => c.subject);
    setList(ids);
    const want = restoreTo.current;
    restoreTo.current = null;
    setAt(want && ids.includes(want) ? ids.indexOf(want) : 0);
    // Only on tab/filter changes and the first load: a label change keeps the list as it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filter, redraw, view === null]);

  const ids = list ?? [];
  const card = ids.length ? bySubject.get(ids[Math.min(at, ids.length - 1)]) ?? null : null;
  useEffect(() => {
    if (card) sessionStorage.setItem(KEY, JSON.stringify({ tab, filter, subject: card.subject }));
  }, [card, tab, filter]);

  const go = useCallback((d: number) => { setAt((i) => Math.max(0, Math.min(ids.length - 1, i + d))); window.scrollTo({ top: 0 }); }, [ids.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('textarea, input')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const change = async (body: Record<string, unknown>) => {
    if (!card) return;
    setBusy(true);
    setError(null);
    const r = await authFetch('/api/admin/bounty/marks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: card.kind, subject: card.subject, ...body }) }).catch(() => null);
    if (!r?.ok) setError(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Not saved. Try again.');
    await load();
    setBusy(false);
  };

  if (!admin || !view) return <>{fallback}</>;
  const counts = (k: Kind) => Object.fromEntries(FILTERS.map((f) => [f, (k === 'bounty_claim' ? view.claims : view.entries).filter((c) => matches(c, f)).length])) as Record<Filter, number>;
  const n = counts(tab);
  return (
    <main className="ab">
      <p className="ab-kicker">Admin · private</p>
      <h1>Review</h1>
      <div className="ab-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'bounty_claim'} onClick={() => { setTab('bounty_claim'); setFilter('all'); }}>Bounty claims <span>{view.claims.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'challenge_entry'} onClick={() => { setTab('challenge_entry'); setFilter('all'); }}>Challenge entries <span>{view.entries.length}</span></button>
      </div>
      <div className="ab-filters" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); setRedraw((x) => x + 1); }}>
            {FILTER_NAMES[f]} <span>{n[f]}</span>
          </button>
        ))}
      </div>
      {!view.labelsReady && <p className="ab-warn">Labels can’t be saved yet: the review tables aren’t on this database.</p>}
      {tab === 'bounty_claim' && <BountyRules view={view} onReload={() => void load(true)} />}
      {tab === 'challenge_entry' && <p className="ab-note">The challenge’s entries (not the admin examples), newest first. Same labels, for the deep-funding shortlist. Private to admins.</p>}
      {error && <p className="ab-warn" role="alert">{error}</p>}
      {!card && <p className="ab-note">{ids.length === 0 ? `Nothing under “${FILTER_NAMES[filter]}”.` : ''}</p>}
      {card && (
        <>
          <p className="ab-pos">{Math.min(at, ids.length - 1) + 1} of {ids.length}{filter !== 'all' ? ` · ${FILTER_NAMES[filter]}` : ''}</p>
          {card.kind === 'bounty_claim' ? <Claim c={card} /> : <Entry c={card} />}
          <section className="ab-labels" aria-label="Labels (private)">
            {LABELS.map((l) => {
              const on = card.marks.labels.find((x) => x.label === l.key);
              return (
                <button key={l.key} type="button" className="ab-label" data-label={l.key} aria-pressed={Boolean(on)} disabled={busy || !view.labelsReady} onClick={() => void change({ label: l.key as LabelKey, on: !on })}>
                  <span className="ab-label-name">{on ? '✓ ' : ''}{l.name}</span>
                  {on && <span className="ab-label-by">{on.by} · {when(on.at)}</span>}
                </button>
              );
            })}
          </section>
          <Note key={card.subject} c={card} disabled={busy || !view.labelsReady} onSave={(note) => void change({ note })} />
          <nav className="ab-nav" aria-label="Claims">
            <button type="button" onClick={() => go(-1)} disabled={at <= 0}>← Back</button>
            <button type="button" onClick={() => go(1)} disabled={at >= ids.length - 1}>Next →</button>
          </nav>
        </>
      )}
    </main>
  );
}

function BountyRules({ view, onReload }: { view: ReviewView; onReload: () => void }) {
  if (!view.bounty) return <p className="ab-warn">{view.bountyError ?? 'The bounty couldn’t be read.'} <button type="button" className="ab-link" onClick={onReload}>Read again</button></p>;
  const b = view.bounty;
  return (
    <details className="ab-rules">
      <summary>The bounty’s rules, as it states them</summary>
      <p className="ab-note">From “{b.name}” on Base, read {when(b.readAt)} PT through {b.rpc}. {b.amountEth} ETH{b.settled ? ' · settled on poidh' : ''}. Hints below are checked against these words; they are never labels. The winner is picked on <a href={b.poidhUrl} target="_blank" rel="noreferrer">poidh</a>.</p>
      <ol className="ab-quote">{b.steps.map((s) => <li key={s}>{s.replace(/^\d+\.\s*/, '')}</li>)}</ol>
      <p className="ab-note">The rules:</p>
      <ul className="ab-quote">{b.rules.map((r) => <li key={r}>{r}</li>)}</ul>
      <button type="button" className="ab-link" onClick={onReload}>Read Base again</button>
    </details>
  );
}

function ClaimPicture({ id }: { id: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    setSrc(null);
    setFailed(false);
    void authFetch(`/api/admin/bounty/image?claim=${id}`)
      .then(async (r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!alive) return;
        if (!b) return setFailed(true);
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  if (failed) return <div className="ab-pic ab-pic-none">Picture not readable</div>;
  if (!src) return <div className="ab-pic ab-pic-none">Loading the picture…</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="ab-pic" src={src} alt="The claim's picture" />;
}

function Claim({ c }: { c: ClaimCard }) {
  return (
    <article className="ab-card">
      {c.hasPicture ? <ClaimPicture id={c.id} /> : <div className="ab-pic ab-pic-none">No picture named</div>}
      <h2>{c.title || 'Untitled'}</h2>
      <p className="ab-meta">
        Claim {c.id} · {when(c.createdAt)} PT{c.accepted ? ' · accepted' : ''}
        <br />
        By {c.claimer.name ? <><strong>{c.claimer.name}</strong> · </> : null}<span className="ab-addr" title={c.claimer.address}>{short(c.claimer.address)}</span>
        {c.pictureHost ? <><br />Picture from {c.pictureHost}</> : null}
      </p>
      <ul className="ab-hints" aria-label="Hints (not labels)">
        {c.hints.map((h) => (
          <li key={h.key} data-state={h.state}>
            <span className="ab-hint-mark" aria-hidden>{h.state === 'yes' ? '✓' : h.state === 'no' ? '✗' : '?'}</span>
            <span>
              {h.text}
              {h.rule && <span className="ab-hint-rule">Rule: “{h.rule}”</span>}
            </span>
          </li>
        ))}
      </ul>
      {c.linked.length > 0 && (
        <p className="ab-meta">
          {c.linked.map((p) => (
            <a key={p.versionId} href={p.href} target="_blank" rel="noreferrer">{p.characterName} by {p.byName ? `@${p.byName}` : `FID ${p.byFid}`}</a>
          )).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}
        </p>
      )}
      <div className="ab-text">{c.description.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
    </article>
  );
}

function Entry({ c }: { c: EntryCard }) {
  return (
    <article className="ab-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {c.image ? <img className="ab-pic" src={c.image} alt={`${c.characterName}, the entry's picture`} /> : <div className="ab-pic ab-pic-none">No picture</div>}
      <h2>{c.title}</h2>
      <p className="ab-meta">{c.characterName} · by {c.by} · {when(c.createdAt)} PT · <a href={c.href} target="_blank" rel="noreferrer">Open its page</a></p>
      {c.backstory ? <div className="ab-text">{c.backstory.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div> : <p className="ab-note">No backstory on this entry.</p>}
    </article>
  );
}

function Note({ c, disabled, onSave }: { c: Card; disabled: boolean; onSave: (note: string) => void }) {
  const [text, setText] = useState(c.marks.note?.text ?? '');
  const saved = c.marks.note?.text ?? '';
  return (
    <section className="ab-notebox">
      <AdminNoteField id="ab-note" label="Private note" value={text} onChange={setText} maxLength={280} />
      <div className="ab-note-row">
        <span className="ab-note">{c.marks.note ? `${c.marks.note.by} · ${when(c.marks.note.at)}` : `${text.length}/280`}</span>
        <button type="button" disabled={disabled || text.trim() === saved} onClick={() => onSave(text)}>{text.trim() || !saved ? 'Save note' : 'Clear note'}</button>
      </div>
    </section>
  );
}
