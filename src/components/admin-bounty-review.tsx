'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import { AdminNoteField } from './admin-note-field';
import { LINK_REL, linkParts } from '~/lib/review/links';
import { FILTERS, LABELS, type ClaimCard, type EntryCard, type Filter, type InlineView, type Kind, type LabelKey, type NotEnteredCard, type PostSlot, type ProfileView, type ReviewView } from '~/lib/review/types';
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
  // The live part (owner, 2026-11-27): posts and profiles read from their networks when the page opens.
  const [inline, setInline] = useState<InlineView | 'loading' | 'failed'>('loading');
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
    void authFetch('/api/admin/bounty/inline', { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as InlineView) : 'failed'))
      .then((v) => setInline(v))
      .catch(() => setInline('failed'));
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
          {card.kind === 'bounty_claim' ? <Claim c={card} inline={inline} /> : <Entry c={card} inline={inline} />}
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
      <NotEnteredList all={view.notEntered ?? []} />
    </main>
  );
}

function BountyRules({ view, onReload }: { view: ReviewView; onReload: () => void }) {
  if (!view.bounty) return <p className="ab-warn">{view.bountyError ?? 'The bounty couldn’t be read.'} <button type="button" className="ab-link" onClick={onReload}>Read again</button></p>;
  const b = view.bounty;
  return (
    <details className="ab-rules">
      <summary>The bounty’s rules, as it states them</summary>
      <p className="ab-note">From “{b.name}” on Base, read {when(b.readAt)} PT through {b.rpc}. {b.amountEth} ETH{b.settled ? ' · settled on poidh' : ''}. Hints below are checked against these words; they are never labels. The winner is picked on <Out href={b.poidhUrl}>poidh</Out>.</p>
      <ol className="ab-quote">{b.steps.map((s) => <li key={s}>{s.replace(/^\d+\.\s*/, '')}</li>)}</ol>
      <p className="ab-note">The rules:</p>
      <ul className="ab-quote">{b.rules.map((r) => <li key={r}>{r}</li>)}</ul>
      <button type="button" className="ab-link" onClick={onReload}>Read Base again</button>
    </details>
  );
}

function ClaimPicture({ id }: { id: number }) {
  return <AuthImage src={`/api/admin/bounty/image?claim=${id}`} className="ab-pic" alt="The claim's picture" />;
}

/** A picture from an admin route (it needs the sign-in, so it is fetched, then shown from memory). */
function AuthImage({ src: from, className, alt, small = false }: { src: string; className: string; alt: string; small?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    setSrc(null);
    setFailed(false);
    void authFetch(from)
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
  }, [from]);
  if (failed) return small ? <span className={`${className} ab-pic-none`} /> : <div className={`${className} ab-pic-none`}>Picture not readable</div>;
  if (!src) return small ? <span className={`${className} ab-pic-none`} /> : <div className={`${className} ab-pic-none`}>Loading the picture…</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt={alt} />;
}

const NETWORK: Record<ProfileView['network'], string> = { farcaster: 'Farcaster', bluesky: 'Bluesky', lens: 'Lens' };

/** A profile read live: picture, name, handle and bio (no counts are ever read). */
function Profile({ p, label }: { p: ProfileView; label: string }) {
  const name = p.name ?? (p.handle ? `@${p.handle}` : NETWORK[p.network]);
  return (
    <div className="ab-profile">
      {p.picture ? <AuthImage src={p.picture} className="ab-avatar" alt="" small /> : <span className="ab-avatar ab-pic-none" />}
      <div>
        <p className="ab-live-label">{label}</p>
        <p className="ab-profile-name">{p.url ? <Out href={p.url}>{name}</Out> : name}{p.handle && p.name ? <span className="ab-note"> @{p.handle}</span> : null}</p>
        {p.bio && <p className="ab-profile-bio">{linkParts(p.bio).map((x, k) => ('href' in x ? <Out key={k} href={x.href} className="ab-url">{x.text}</Out> : <span key={k}>{x.text}</span>))}</p>}
      </div>
    </div>
  );
}

/** A post read live: its writer, words, pictures and date, and a link to it on its network. */
function Post({ slot }: { slot: PostSlot }) {
  if (!slot.ok) return <p className="ab-note ab-live">{slot.why}</p>;
  const p = slot.post;
  return (
    <div className="ab-live ab-post">
      {p.author && <Profile p={p.author} label={`Posted on ${NETWORK[p.network]}`} />}
      {p.text && <LinkedText text={p.text} />}
      {p.pictures.length > 0 && <div className="ab-post-pics">{p.pictures.map((m) => <AuthImage key={m} src={m} className="ab-post-pic" alt="A picture in the post" />)}</div>}
      <p className="ab-note">{when(p.at)} PT · <Out href={p.url}>Open the post</Out></p>
    </div>
  );
}

/** The live block's state: reading, failed, or what was read. */
function Live({ inline, children }: { inline: InlineView | 'loading' | 'failed'; children: (v: InlineView) => React.ReactNode }) {
  if (inline === 'loading') return <p className="ab-note ab-live">Reading the linked posts and profiles…</p>;
  if (inline === 'failed') return <p className="ab-note ab-live">The linked posts and profiles couldn’t be read just now.</p>;
  return <>{children(inline)}</>;
}

/** A link out, in a new tab (owner, 2026-11-26): rel noopener noreferrer nofollow. */
function Out({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel={LINK_REL} className={className}>{children}</a>;
}

/** Text with every http(s) URL as a link showing the URL in full; nothing else becomes a link. Paragraphs kept. */
function LinkedText({ text }: { text: string }) {
  return (
    <div className="ab-text">
      {text.split(/\n\s*\n/).map((p, i) => (
        <p key={i}>{linkParts(p).map((part, k) => ('href' in part ? <Out key={k} href={part.href} className="ab-url">{part.text}</Out> : <span key={k}>{part.text}</span>))}</p>
      ))}
    </div>
  );
}

function Claim({ c, inline }: { c: ClaimCard; inline: InlineView | 'loading' | 'failed' }) {
  return (
    <article className="ab-card">
      {c.hasPicture ? <ClaimPicture id={c.id} /> : <div className="ab-pic ab-pic-none">No picture named</div>}
      <h2>{c.title || 'Untitled'}</h2>
      <p className="ab-meta">
        Claim {c.id} · {when(c.createdAt)} PT{c.accepted ? ' · accepted' : ''}
        <br />
        By {c.claimer.name ? <><strong>{c.claimer.profile ? <Out href={c.claimer.profile}>{c.claimer.name}</Out> : c.claimer.name}</strong> · </> : null}
        {c.claimer.basescan ? <Out href={c.claimer.basescan} className="ab-addr">{short(c.claimer.address)}</Out> : <span className="ab-addr" title={c.claimer.address}>{short(c.claimer.address)}</span>}
        {c.claimer.poidh ? <> · <Out href={c.claimer.poidh}>on poidh</Out></> : null}
        {c.pictureHost ? <><br />Picture from {c.pictureHost}{c.pictureHref ? <> · <Out href={c.pictureHref}>original</Out></> : null}</> : null}
      </p>
      <Live inline={inline}>
        {(v) => {
          const x = v.claims[c.subject];
          return (
            <>
              {x?.profile ? <Profile p={x.profile} label="Farcaster profile (by the claimer's address)" /> : v.farcasterNote ? <p className="ab-note ab-live">{v.farcasterNote}</p> : null}
              {(x?.posts ?? []).map((slot, i) => <Post key={i} slot={slot} />)}
            </>
          );
        }}
      </Live>
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
            <Out key={p.versionId} href={p.href}>{p.characterName} by {p.byName ? `@${p.byName}` : `FID ${p.byFid}`}</Out>
          )).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}
        </p>
      )}
      <LinkedText text={c.description} />
    </article>
  );
}

function Entry({ c, inline }: { c: EntryCard; inline: InlineView | 'loading' | 'failed' }) {
  return (
    <article className="ab-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {c.image ? <img className="ab-pic" src={c.image} alt={`${c.characterName}, the entry's picture`} /> : <div className="ab-pic ab-pic-none">No picture</div>}
      <h2>{c.title}</h2>
      <p className="ab-meta">{c.characterName} · by {c.byHref ? <Out href={c.byHref}>{c.by}</Out> : c.by} · {when(c.createdAt)} PT · <Out href={c.href}>Open its page</Out></p>
      {c.backstory ? <LinkedText text={c.backstory} /> : <p className="ab-note">No backstory on this entry.</p>}
      <Live inline={inline}>
        {(v) => {
          const posts = v.entries[c.subject]?.posts ?? [];
          return posts.length ? posts.map((slot, i) => <Post key={i} slot={slot} />) : <p className="ab-note ab-live">No post added to this entry.</p>;
        }}
      </Live>
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

/**
 * "Published, not entered" (2026-11-27): every challenge picture published in the window that isn't an entry now, newest
 * first, with its count at the top. Admins only: each maker's eligibility as decided at publish shows here and nowhere
 * public. Only Submit makes an entry; this list changes nothing.
 */
function NotEnteredList({ all }: { all: NotEnteredCard[] }) {
  const eligible = all.filter((c) => c.eligible).length;
  return (
    <section className="ab-not-entered" aria-labelledby="ab-not-entered-h" data-slot="not-entered">
      <h2 id="ab-not-entered-h">Published, not entered <span className="ab-count">{all.length}</span></h2>
      <p className="ab-note">
        {all.length} challenge {all.length === 1 ? 'picture' : 'pictures'} published in the window and not an entry now (never submitted, or withdrawn); {eligible} by makers eligible at publish. Newest first. Private to admins: eligibility shows only here.
      </p>
      {all.length > 0 && (
        <ul className="ab-ne-list" role="list">
          {all.map((c) => (
            <li key={c.versionId} className="ab-ne-row" data-version={c.versionId} data-eligible={c.eligible ? 'yes' : 'no'}>
              <Out href={c.href} className="ab-ne-pic-link">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.image ? <img className="ab-ne-pic" src={c.image} alt={`${c.characterName}, the picture`} loading="lazy" /> : <span className="ab-ne-pic ab-pic-none">No picture</span>}
              </Out>
              <div className="ab-ne-text">
                <Out href={c.href} className="ab-ne-title">{c.title}</Out>
                <span className="ab-meta">
                  {c.characterName} · by {c.byHref ? <Out href={c.byHref}>{c.by}</Out> : c.by} · {when(c.createdAt)} PT
                </span>
                <span className="ab-ne-elig" data-eligible={c.eligible ? 'yes' : 'no'}>{c.eligibility}</span>
                {c.tags.map((t) => <span key={t} className="ab-ne-tag">{t}</span>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
