'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { SignInButton } from './sign-in';
import { WalletSignInButton } from './wallet';
import { PrivateDraftField } from './private-draft-field';
import { PrivateTextField } from './private-text-field';
import { CHAT } from '~/lib/config';
import { emptyDraft, MAKE, SHOT_TYPES, type Draft, type Shot } from '~/lib/make/draft';
import type { CoachResult, Stage } from '~/lib/make/coach';
import type { Quote } from '~/lib/chat/ask';

/**
 * "Make your own", story flow v1 (owner's long run 2, item 5): 1 the idea, in your own words; 2 talk it through with
 * the coach; 3 your beats, with notes; 4 your text storyboard, with notes. Saved as a private draft adaptation. The
 * coach asks and gives notes and never writes (checked on the server: src/lib/make/no-writing.ts and
 * config/prompts/make-guard.md). The conversation stays on this device. Every word on these screens is a DRAFT.
 */
type Step = 'idea' | 'talk' | 'beats' | 'storyboard';
const STEPS: { id: Step; n: number; label: string }[] = [
  { id: 'idea', n: 1, label: 'Your idea' },
  { id: 'talk', n: 2, label: 'Talk it through' },
  { id: 'beats', n: 3, label: 'Beats' },
  { id: 'storyboard', n: 4, label: 'Storyboard' },
];
type Turn = { role: 'user'; text: string } | { role: 'coach'; result: CoachResult };
type Saved = { id: string; title: string; updatedAt: string };

const threadKey = (id: string, stage: Stage) => `snowmoon.make.thread.${id}.${stage}`;
function loadTurns(id: string | null, stage: Stage): Turn[] {
  if (!id) return [];
  try {
    return JSON.parse(localStorage.getItem(threadKey(id, stage)) ?? '[]') as Turn[];
  } catch {
    return [];
  }
}
function saveTurns(id: string | null, stage: Stage, turns: Turn[]) {
  if (!id) return;
  try {
    localStorage.setItem(threadKey(id, stage), JSON.stringify(turns.slice(-40)));
  } catch {
    /* device storage unavailable: the conversation lasts this visit only */
  }
}
const noteText = (r: CoachResult) => (r.state === 'note' ? r.parts.map((p) => (p.type === 'text' ? p.text : `[${p.id}]`)).join('') : '');

/** walletSignIn: offer the wallet sign-in too (only while it is open on this deployment; owner, 2026-10-19). */
export function MakeYourOwn({ walletSignIn = false }: { walletSignIn?: boolean }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || wallet !== null;
  const [drafts, setDrafts] = useState<Saved[] | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [step, setStep] = useState<Step>('idea');
  const [status, setStatus] = useState('');
  const [dirty, setDirty] = useState(false);

  const refresh = useCallback(async () => {
    const r = await authFetch('/api/make/drafts');
    if (r.ok) setDrafts(((await r.json()) as { drafts: Saved[] }).drafts);
  }, []);
  useEffect(() => {
    if (signedIn) void refresh();
  }, [signedIn, wallet?.address, refresh]);

  const edit = (d: Partial<Draft>) => {
    setDraft((x) => ({ ...x, ...d }));
    setDirty(true);
  };

  async function save() {
    setStatus('Saving…');
    const r = await authFetch(id ? `/api/make/drafts/${id}` : '/api/make/drafts', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return setStatus(body.error ?? 'Not saved. Try again.');
    setId(body.id);
    setDirty(false);
    setStatus('Saved. Only you can see this draft.');
    void refresh();
  }
  async function open(d: Saved) {
    const r = await authFetch(`/api/make/drafts/${d.id}`);
    if (!r.ok) return setStatus('That draft could not be opened.');
    const body = await r.json();
    setId(body.id);
    setDraft(body.draft);
    setStep('idea');
    setDirty(false);
    setStatus('');
  }
  async function remove() {
    if (!id) return;
    const r = await authFetch(`/api/make/drafts/${id}`, { method: 'DELETE' });
    if (!r.ok) return setStatus('Not deleted. Try again.');
    for (const s of ['talk', 'beats', 'storyboard'] as Stage[]) {
      try {
        localStorage.removeItem(threadKey(id, s));
      } catch {
        /* nothing kept */
      }
    }
    setId(null);
    setDraft(emptyDraft());
    setStep('idea');
    setStatus('Deleted.');
    void refresh();
  }

  if (auth.kind === 'loading') return <p className="mk-muted">Loading…</p>;
  if (!signedIn)
    return (
      <section className="mk">
        <Header />
        <p>{walletSignIn && auth.kind === 'signed-out' && !auth.inApp ? 'Sign in with Farcaster or a wallet' : 'Sign in with Farcaster'} to start a draft. It stays private to you.</p>
        <SignInButton />
        {walletSignIn && auth.kind === 'signed-out' && !auth.inApp && <WalletSignInButton />}
      </section>
    );

  return (
    <section className="mk">
      <Header />
      <div className="mk-drafts" aria-label="Your drafts">
        <button type="button" className="mk-chip" aria-pressed={!id} onClick={() => { setId(null); setDraft(emptyDraft()); setStep('idea'); setStatus(''); }}>
          New draft
        </button>
        {(drafts ?? []).map((d) => (
          <button key={d.id} type="button" className="mk-chip" aria-pressed={d.id === id} onClick={() => void open(d)}>
            {d.title || 'Untitled draft'}
          </button>
        ))}
      </div>

      <nav className="mk-steps" aria-label="Steps">
        {STEPS.map((s) => (
          <button key={s.id} type="button" aria-current={s.id === step ? 'step' : undefined} onClick={() => setStep(s.id)}>
            <span>{s.n}</span> {s.label}
          </button>
        ))}
      </nav>

      {step === 'idea' && <IdeaStep draft={draft} edit={edit} />}
      {step === 'talk' && <CoachPanel key={`${id}-talk`} stage="talk" id={id} draft={draft} intro="Say where you're stuck or what you want to work out. The coach asks about wants, stakes, tension and how to show it." />}
      {step === 'beats' && (
        <>
          <BeatsStep draft={draft} edit={edit} />
          <CoachPanel key={`${id}-beats`} stage="beats" id={id} draft={draft} intro="Ask for notes on your beats. The coach won't write or reword them." />
        </>
      )}
      {step === 'storyboard' && (
        <>
          <StoryboardStep draft={draft} edit={edit} />
          <CoachPanel key={`${id}-storyboard`} stage="storyboard" id={id} draft={draft} intro="Ask for notes on your shots. The coach won't write shots or lines." />
        </>
      )}

      <div className="mk-save">
        <button type="button" className="as-primary" onClick={() => void save()}>
          {id ? 'Save draft' : 'Save as a draft adaptation'}
        </button>
        {id && (
          <button type="button" className="as-quiet" onClick={() => void remove()}>
            Delete this draft
          </button>
        )}
        <p className="mk-muted" role="status">
          {status || (dirty ? 'Not saved yet.' : '')}
        </p>
      </div>
      <p className="mk-draftline">Draft wording · not yet reread by the owner</p>
    </section>
  );
}

function Header() {
  return (
    <header className="mk-head">
      <p className="mk-eyebrow">Make your own</p>
      <h1>Your own adaptation</h1>
      <p className="mk-muted">
        You write everything: the idea, the beats, the shots and the lines. An AI coach ({CHAT.modelName}) asks questions and gives notes, and can point
        to the book. It never writes for you. Your drafts are private to you.
      </p>
    </header>
  );
}

function IdeaStep({ draft, edit }: { draft: Draft; edit: (d: Partial<Draft>) => void }) {
  return (
    <div className="mk-step">
      <PrivateDraftField id="mk-title" label="Working title" single value={draft.title} maxLength={MAKE.titleMax} onChange={(v) => edit({ title: v })} />
      <PrivateDraftField id="mk-idea" label="Your idea, in your own words" rows={6} value={draft.idea} maxLength={MAKE.ideaMax} onChange={(v) => edit({ idea: v })} />
      <label className="mk-field mk-narrow">
        <span>Chapters it draws on: 1 to</span>
        <select value={draft.upTo} onChange={(e) => edit({ upTo: Number(e.target.value) })}>
          {Array.from({ length: 32 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <p className="mk-muted">The coach only uses the book up to that chapter.</p>
    </div>
  );
}

function BeatsStep({ draft, edit }: { draft: Draft; edit: (d: Partial<Draft>) => void }) {
  const set = (i: number, v: string) => edit({ beats: draft.beats.map((b, k) => (k === i ? v : b)) });
  const drop = (i: number) => edit({ beats: draft.beats.filter((_, k) => k !== i), shots: draft.shots.filter((s) => s.beat !== i).map((s) => (s.beat > i ? { ...s, beat: s.beat - 1 } : s)) });
  return (
    <div className="mk-step">
      <ol className="mk-beats">
        {draft.beats.map((b, i) => (
          <li key={i}>
            <PrivateDraftField id={`mk-beat-${i}`} label={`Beat ${i + 1}`} value={b} maxLength={MAKE.beatMax} onChange={(v) => set(i, v)} />
            <button type="button" className="as-quiet" onClick={() => drop(i)}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      {draft.beats.length < MAKE.beatsMax && (
        <button type="button" className="as-ink" onClick={() => edit({ beats: [...draft.beats, ''] })}>
          Add a beat
        </button>
      )}
    </div>
  );
}

function StoryboardStep({ draft, edit }: { draft: Draft; edit: (d: Partial<Draft>) => void }) {
  if (!draft.beats.length) return <p className="mk-muted">Write your beats first; shots go under them.</p>;
  const set = (i: number, s: Partial<Shot>) => edit({ shots: draft.shots.map((x, k) => (k === i ? { ...x, ...s } : x)) });
  const add = (beat: number) => edit({ shots: [...draft.shots, { beat, type: 'mid', who: '', see: '', line: '' }] });
  return (
    <div className="mk-step">
      {draft.beats.map((b, beat) => (
        <section key={beat} className="mk-beat">
          <h2>
            Beat {beat + 1} <span className="mk-muted">{b ? `· ${b.slice(0, 80)}${b.length > 80 ? '…' : ''}` : ''}</span>
          </h2>
          {draft.shots.map((s, i) =>
            s.beat !== beat ? null : (
              <div key={i} className="mk-shot">
                <label className="mk-field mk-narrow">
                  <span>Shot type</span>
                  <select value={s.type} onChange={(e) => set(i, { type: e.target.value as Shot['type'] })}>
                    {SHOT_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <PrivateDraftField id={`mk-who-${i}`} label="Who’s in frame" single value={s.who} maxLength={MAKE.fieldMax} onChange={(v) => set(i, { who: v })} />
                <PrivateDraftField id={`mk-see-${i}`} label="What we see" value={s.see} maxLength={MAKE.fieldMax} onChange={(v) => set(i, { see: v })} />
                <PrivateDraftField id={`mk-line-${i}`} label="The line" value={s.line} maxLength={MAKE.fieldMax} onChange={(v) => set(i, { line: v })} />
                <button type="button" className="as-quiet" onClick={() => edit({ shots: draft.shots.filter((_, k) => k !== i) })}>
                  Remove shot
                </button>
              </div>
            ),
          )}
          {draft.shots.length < MAKE.shotsMax && (
            <button type="button" className="as-ink" onClick={() => add(beat)}>
              Add a shot
            </button>
          )}
        </section>
      ))}
    </div>
  );
}

function CoachPanel({ stage, id, draft, intro }: { stage: Stage; id: string | null; draft: Draft; intro: string }) {
  const [turns, setTurns] = useState<Turn[]>(() => loadTurns(id, stage));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError('');
    const history = turns
      .map((t) => (t.role === 'user' ? { role: 'user' as const, text: t.text } : { role: 'assistant' as const, text: noteText(t.result) }))
      .filter((h) => h.text);
    const r = await authFetch('/api/make/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, message, draft, history }) });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(body.error ?? 'The coach did not answer. Try again in a moment.');
    const next: Turn[] = [...turns, { role: 'user', text: message }, { role: 'coach', result: body as CoachResult }];
    setTurns(next);
    saveTurns(id, stage, next);
    setText('');
  }

  return (
    <aside className="mk-coach" aria-label="Coach">
      <p className="mk-eyebrow">Coach · AI ({CHAT.modelName}) · notes only, never writing</p>
      <p className="mk-muted">{intro}</p>
      <ol className="mk-turns">
        {turns.map((t, i) => (
          <li key={i} className={t.role === 'user' ? 'mk-you' : 'mk-note'}>
            {t.role === 'user' ? <p>{t.text}</p> : <CoachReply r={t.result} />}
          </li>
        ))}
      </ol>
      <div className="mk-field">
        <span aria-hidden="true">To the coach</span>
        <PrivateTextField id={`mk-coach-${stage}`} label="To the coach" value={text} maxLength={MAKE.messageMax} onChange={setText} />
      </div>
      <button type="button" className="as-ink" disabled={busy} onClick={() => void send()}>
        {busy ? 'Thinking…' : 'Ask'}
      </button>
      {error && <p className="mk-warn">{error}</p>}
      <p className="mk-muted">This conversation stays on this device. It isn&rsquo;t saved with your draft.</p>
    </aside>
  );
}

function CoachReply({ r }: { r: CoachResult }) {
  if (r.state === 'limit')
    return (
      <p>
        You&rsquo;ve used today&rsquo;s {r.perDay} messages to the coach. More at 00:00 UTC.
        {r.perDay < MAKE.coachPerDay && ` A wallet account with a payment gets ${MAKE.coachPerDay} a day.`}
      </p>
    );
  if (r.state === 'spend') return <p>The coach has reached today&rsquo;s spending limit for everyone. It comes back at 00:00 UTC.</p>;
  if (r.state === 'declined')
    return r.why === 'pronouns' ? (
      <p>The coach&rsquo;s reply wasn&rsquo;t shown: it got a character&rsquo;s pronoun wrong twice. Ask again.</p>
    ) : (
      <p>The coach&rsquo;s reply wasn&rsquo;t shown: it tried to write for you, which it doesn&rsquo;t do. Ask it a question about your own draft instead.</p>
    );
  return (
    <>
      <p>
        {r.parts.map((p, i) =>
          p.type === 'text' ? (
            <span key={i}>{p.text}</span>
          ) : (
            <a key={i} className="mk-cite" href={`#${p.id}`}>
              [{label(r.quotes, p.id)}]
            </a>
          ),
        )}
      </p>
      {r.quotes.map((q) => (
        <figure key={q.id} id={q.id} className="as-quote">
          <blockquote dangerouslySetInnerHTML={{ __html: q.html }} />
          <figcaption>
            <Link href={`/chapter/${q.chapter}#${q.id}`}>
              Chapter {q.chapter}
              {q.label ? `, ¶${q.label}` : ''}
            </Link>
          </figcaption>
        </figure>
      ))}
    </>
  );
}

const label = (qs: Quote[], id: string) => {
  const q = qs.find((x) => x.id === id);
  return q ? `ch ${q.chapter}${q.label ? ` ¶${q.label}` : ''}` : id;
};
