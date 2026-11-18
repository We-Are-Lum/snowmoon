'use client';

import { InfoLabel } from './info-label';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, inMiniApp } from '~/lib/client-auth';
import { SignInChoices } from './sign-in-choices';
import { MakeImageLink } from './make-image-link';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { PrivateTextField } from './private-text-field';
import { ASSISTANT, CHAT } from '~/lib/config';
import { ASK_WORDING, type AccountKind } from '~/lib/chat/who-can-ask';
import { OWNER_WORDING } from '~/lib/wording';
import type { AskResult, NoteCite, Quote } from '~/lib/chat/ask';
import type { GlossaryLink } from '~/lib/chat/glossary';
import { noticeItems, noticeKey } from '~/lib/chat/notice';
import { NOTE_WORDING, SUMMARY_LABEL } from '~/lib/chat/notes';
import type { AnswerPart } from '~/lib/chat/sanitize';
import {
  currentChapter, deleteThread, lastChapter, markNoticeSeen, newThread, noticeSeen, saveThread, thread as loadThread, threads as loadThreads,
  type AnsweredMessage, type Thread,
} from '~/lib/chat/device';

/**
 * The reading assistant, slice 1: ask about the book (docs/design/assistant-chat.dc.html,
 * screens 1d, 2, 3, 9a–9d). Private: threads stay on this device. Wording: the owner's
 * (FID 6786, 2026-10-08; src/lib/wording.ts) on every screen but the first-time notice,
 * which is model-drafted and labelled draft until the owner's reread is recorded.
 */
type Status =
  | { kind: 'loading' }
  | { kind: 'signed-out'; inApp: boolean }
  /** Signed in, but this account can't ask (src/lib/chat/gate.ts): a wallet, a Lens or Bluesky account, or a failed check. */
  | { kind: 'refused'; inApp: boolean; error: string; account: AccountKind | null }
  | { kind: 'ready'; available: boolean; reason?: string; model: string; host: string | null; provider: string | null; route: string; perDay: number; left: number };

const authedFetch = authFetch;

function untilUtcMidnight(): string {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const mins = Math.max(0, Math.round((next - now.getTime()) / 60000));
  return `${Math.floor(mins / 60)} hours ${mins % 60} minutes`;
}

/** The text of an answer, as it was shown, for the thread history sent back to the model. */
function answerText(m: AnsweredMessage): string {
  const r = m.result;
  if (r.state !== 'answer') return '';
  return r.parts.map((p) => (p.type === 'text' ? p.text : p.type === 'cite' ? `[${p.id}]` : `[${p.label}]`)).join('');
}

/** Owner (2026-10-07): shown until a fresh 50-question check has at most 2 wrong answers. */
function TestingLabel() {
  if (!CHAT.testing) return null;
  return (
    <p className="as-testing" role="note">
      Testing · answers can be wrong; check the quotes
    </p>
  );
}

/** One small line per screen (owner, 2026-10-08): the wording on this screen is model-drafted. Now only the notice. */
function DraftLine() {
  return <p className="as-draft">Draft wording</p>;
}

/** Screen 2: before the first message, until "don't show this again" is ticked for these exact words. */
function Notice({ host, provider, model, onClose }: { host: string | null; provider: string | null; model: string; onClose: (go: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false);
  const items = noticeItems({ host, provider, model });
  return (
    <div className="as-overlay" role="dialog" aria-modal="true" aria-labelledby="as-notice-title">
      <div className="as-sheet">
        <p className="as-label">Before you start</p>
        <h2 id="as-notice-title">What the assistant does</h2>
        <ol className="as-notice">
          {items.map(([h, b], i) => (
            <li key={h}>
              <span className="as-n">{i + 1}</span>
              <span>
                <strong>{h}.</strong> {b}
              </span>
            </li>
          ))}
        </ol>
        <label className="as-check">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          Don’t show this again
        </label>
        <div className="as-actions">
          <button type="button" className="as-quiet" onClick={() => onClose(false)}>
            Not now
          </button>
          <button
            type="button"
            className="as-primary"
            onClick={() => {
              if (dontShow) markNoticeSeen(noticeKey(items));
              onClose(true);
            }}
          >
            Continue
          </button>
        </div>
        <DraftLine />
      </div>
    </div>
  );
}

/**
 * Questions to start an empty thread with (from the clickable prototype). Model-drafted
 * wording. Each is answerable from what the thread may use: the attached passage, the
 * chapter, or chapter 1 for a thread with neither.
 */
function starters(t: Thread): string[] {
  if (t.attached.length) return ['What is happening in this passage?', 'Who is speaking here, and to whom?', 'Why might this moment matter?'];
  if (t.chapter) return [`What happens in chapter ${t.chapter}?`, `Who are the main people in chapter ${t.chapter}?`, `Where and when is chapter ${t.chapter} set?`];
  return ['Who is Gladias?', 'How does voting on buildings work in Veridia?', 'What is the Order of Steering?'];
}

/** The passage a thread was opened from, in the book's own words (GET /api/book/block). */
function PassageCard({ id }: { id: string }) {
  const [q, setQ] = useState<Quote | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/book/block?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Quote>) : Promise.reject()))
      .then(setQ, () => setFailed(true));
  }, [id]);
  if (failed || !q) return <p className="as-attached">Asking about {id}</p>;
  return (
    <figure className="as-quote as-passage">
      <p className="as-label">Asking about</p>
      <blockquote dangerouslySetInnerHTML={{ __html: q.html }} />
      <figcaption>
        <span>
          Ch {q.chapter}
          {q.label !== null ? ` · ¶ ${q.label}` : ''}
        </span>
        <Link href={`/chapter/${q.chapter}#${q.id}`}>Open in reader →</Link>
      </figcaption>
    </figure>
  );
}

/**
 * A citation: the book's own words, rendered from the stored text by block id. "Make an image of
 * this passage" (shown where "Add an image" shows) links to /references/new with the cited block only:
 * nothing from the conversation goes in the link. Model-drafted wording.
 */
function QuoteCard({ q }: { q: Quote }) {
  const idx = Number(q.id.match(/-b(\d+)$/)?.[1]);
  return (
    <figure className="as-quote">
      <blockquote dangerouslySetInnerHTML={{ __html: q.html }} />
      <figcaption>
        <span>
          Ch {q.chapter}
          {q.label !== null ? ` · ¶ ${q.label}` : ''}
        </span>
        <Link href={`/chapter/${q.chapter}#${q.id}`}>Open in reader →</Link>
      </figcaption>
      {Number.isInteger(idx) && (
        <MakeImageLink className="mi-from as-make" passage={{ chapter: q.chapter, start: idx, end: idx }}>
          {IMAGE_WORDING.create.ofThis} →
        </MakeImageLink>
      )}
    </figure>
  );
}

/**
 * Commentary with its quote cards placed after the sentence that cites them. A reviewed note cited by its label shows its
 * name, with the passages it rests on folded under it (owner, 2026-11-17).
 */
function Answer({ parts, quotes, noteCites }: { parts: AnswerPart[]; quotes: Quote[]; noteCites?: NoteCite[] }) {
  const byId = new Map(quotes.map((q) => [q.id, q]));
  const byLabel = new Map((noteCites ?? []).map((n) => [n.label, n]));
  const out: React.ReactNode[] = [];
  let text = '';
  let pending: string[] = [];
  let pendingNotes: string[] = [];
  const flush = (k: number) => {
    if (text.trim()) out.push(<p key={`t${k}`}>{text.trim()}</p>);
    text = '';
    for (const id of pending) {
      const q = byId.get(id);
      if (q) out.push(<QuoteCard key={`q${k}-${id}`} q={q} />);
    }
    for (const label of pendingNotes) {
      const n = byLabel.get(label);
      if (n) out.push(<NoteCard key={`n${k}-${label}`} note={n} quotes={n.sources.flatMap((id) => byId.get(id) ?? [])} />);
    }
    pending = [];
    pendingNotes = [];
  };
  parts.forEach((p, k) => {
    if (p.type === 'cite') {
      if (!pending.includes(p.id)) pending.push(p.id);
      return;
    }
    if (p.type === 'note') {
      if (!pendingNotes.includes(p.label)) pendingNotes.push(p.label);
      return;
    }
    // A citation belongs to the sentence before it: show its card once that sentence ends.
    if ((pending.length || pendingNotes.length) && /^\s*[.!?…]?\s/.test(p.text)) {
      const m = p.text.match(/^\s*[.!?…]?/)![0];
      text += m;
      flush(k);
      text = p.text.slice(m.length);
    } else text += p.text;
  });
  flush(parts.length);
  return <div className="as-answer">{out}</div>;
}

/** A reviewed note an answer cites: its name, and the passages it rests on, folded. */
function NoteCard({ note, quotes }: { note: NoteCite; quotes: Quote[] }) {
  return (
    <details className="as-note-cite">
      <summary>
        {note.title}
        {quotes.length ? ` · rests on ${quotes.map((q) => (q.label !== null ? `ch ${q.chapter} ¶ ${q.label}` : q.id)).join(', ')}` : ''}
      </summary>
      {quotes.map((q) => (
        <QuoteCard key={q.id} q={q} />
      ))}
    </details>
  );
}

/** The glossary entries the question names, before the answer (owner, 2026-10-14). */
function GlossaryLinks({ links }: { links?: GlossaryLink[] }) {
  if (!links?.length) return null;
  return (
    <p className="as-glossary">
      <span className="as-label">Glossary</span>{' '}
      {links.map((l, i) => (
        <span key={l.slug}>
          {i ? ', ' : ''}
          <Link href={`/glossary/${l.slug}`}>{l.term}</Link>
        </span>
      ))}
    </p>
  );
}

/**
 * Under an answer that rests on reviewed notes (owner, 2026-11-17): which ones, with the AI label the chapter summaries
 * carry. Drafted by the coding agent, approved by the owner as drafted (2026-11-17): src/lib/chat/notes.ts NOTE_WORDING.
 */
function NoteLines({ lines }: { lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <div className="as-notes" data-wording={NOTE_WORDING.draft ? 'draft' : 'FID 6786'}>
      {lines.map((l) => (
        <p key={l} className="as-note">
          {l}
        </p>
      ))}
    </div>
  );
}

/** "Where was I" with no chapter known on this device: pick one, and it is asked again with that chapter. DRAFT wording. */
function WhichChapter({ onPick }: { onPick: (n: number) => void }) {
  const [n, setN] = useState(1);
  return (
    <div className="as-reply as-which" data-wording="draft">
      <p className="as-label">Assistant · which chapter?</p>
      <p>Which chapter are you on? Pick it and the assistant recaps it and the two before it.</p>
      <div className="as-actions">
        <label className="as-picker">
          <span className="as-visually-hidden">The chapter you are on</span>
          <select value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="The chapter you are on">
            {Array.from({ length: 32 }, (_, i) => i + 1).map((c) => (
              <option key={c} value={c}>
                Chapter {c}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="as-ink" onClick={() => onPick(n)}>
          Recap
        </button>
      </div>
    </div>
  );
}

/**
 * "What is the book about" (owner, 2026-11-17): no model. Each chapter's first summary section as written, under its
 * chapter, with the AI label and licence line the chapter pages' summaries carry (src/components/chapter-summary.tsx).
 */
function BookInBriefReply({ chapters, quotes }: { chapters: { n: number; text: string; sources: string[] }[]; quotes: Quote[] }) {
  const byId = new Map((quotes ?? []).map((q) => [q.id, q]));
  return (
    <div className="as-reply as-book">
      <p className="as-label">The book in brief · from the chapter summaries</p>
      {chapters.map((c) => (
        <section key={c.n} className="as-book-chapter">
          <h3>
            <Link href={`/chapter/${c.n}`}>Chapter {c.n}</Link>
          </h3>
          <p>{c.text}</p>
          <BookWords quotes={c.sources.slice(0, 2).flatMap((id) => byId.get(id) ?? [])} />
        </section>
      ))}
      <p className="as-note">
        {SUMMARY_LABEL.made} <a href={SUMMARY_LABEL.recipeHref}>How it was made</a>
      </p>
      <p className="as-note">{SUMMARY_LABEL.licence}</p>
    </div>
  );
}

/** The passages a chapter's summary rests on, folded: chapter and ¶, and the book's own words. */
function BookWords({ quotes }: { quotes: Quote[] }) {
  if (!quotes.length) return null;
  return (
    <details className="as-book-words">
      <summary>
        The book’s words · {quotes.map((q) => (q.label !== null ? `¶ ${q.label}` : q.id)).join(', ')}
      </summary>
      {quotes.map((q) => (
        <QuoteCard key={q.id} q={q} />
      ))}
    </details>
  );
}

function Reply({ m, onAsk }: { m: AnsweredMessage; onAsk: (question: string) => void }) {
  const r = m.result;
  if (r.state === 'book') return <BookInBriefReply chapters={r.chapters} quotes={r.quotes} />;
  if (r.state === 'answer')
    return (
      <div className="as-reply">
        <GlossaryLinks links={r.glossary} />
        <p className="as-label">Assistant · commentary</p>
        <Answer parts={r.parts} quotes={r.quotes} noteCites={r.noteCites} />
        <NoteLines lines={r.notes} />
      </div>
    );
  if (r.state === 'which') return <WhichChapter onPick={(n) => onAsk(`Where was I? I'm on chapter ${n}.`)} />;
  // Threads saved before 2026-11-17 may hold a "held back" reply: shown as the passages not saying.
  if ((r.state as string) === 'held')
    return (
      <div className="as-reply">
        <p className="as-label">Assistant · the passages don’t say</p>
        <p>Ask again: the assistant now uses the whole book.</p>
      </div>
    );
  if (r.state === 'declined')
    return (
      <div className="as-reply">
        <p className="as-label">Assistant · won’t show this</p>
        <p>That answer read like writing for you, so it isn’t shown. The words of anything you make have to be yours. Instead it can:</p>
        <ul className="as-instead">
          <li>show what the book says at that moment</li>
          <li>talk through what a character seems to be weighing</li>
          <li>check something you wrote against the book</li>
        </ul>
      </div>
    );
  if (r.state === 'unsupported')
    return (
      <div className="as-reply">
        <GlossaryLinks links={r.glossary} />
        <p className="as-label">Assistant · the passages don’t say</p>
        <p>The passages found for this question don’t say. Try asking another way.</p>
      </div>
    );
  if (r.state === 'limit')
    return (
      <div className="as-reply as-stop">
        <p className="as-label">0 left today</p>
        <p>You’ve used today’s messages. They come back at 00:00 UTC, in {untilUtcMidnight()}.</p>
        <p>Your threads are still here, and the book is open.</p>
        <Link className="as-ink" href={`/chapter/${lastChapter()}`}>
          Read the book
        </Link>
      </div>
    );
  if (r.state === 'spend')
    return (
      <div className="as-reply as-stop">
        <p className="as-label">Paused for today</p>
        <p>The assistant has reached today’s spending limit for everyone. It comes back at 00:00 UTC.</p>
      </div>
    );
  if (r.state === 'unavailable')
    return (
      <div className="as-reply as-stop">
        <p>The assistant isn’t available on this deployment.</p>
      </div>
    );
  return (
    <div className="as-reply as-stop">
      <p>{r.error}</p>
    </div>
  );
}

/** Screen 3: one private thread. */
function ThreadView({ id, status, refresh }: { id: string; status: Extract<Status, { kind: 'ready' }>; refresh: () => void }) {
  const [t, setT] = useState<Thread | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<null | ((go: boolean) => void)>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setT(loadThread(id));
  }, [id]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [t?.messages.length]);
  const last = t?.messages[t.messages.length - 1];
  const reachedLimit = status.left <= 0;
  // The limit reply already says it (9c); don't say it twice under it.
  const limitShown = last?.role === 'assistant' && last.result.state === 'limit';

  const send = useCallback(
    async (question: string) => {
      if (!t || !question.trim()) return;
      const go = noticeSeen(noticeKey(noticeItems(status))) ? true : await new Promise<boolean>((resolve) => setNotice(() => resolve));
      setNotice(null);
      if (!go) return;
      const th: Thread = { ...t };
      const history = th.messages.slice(-6).map((m) => (m.role === 'user' ? { role: 'user' as const, text: m.text } : { role: 'assistant' as const, text: answerText(m) }));
      th.messages = [...th.messages, { role: 'user', text: question.trim(), at: new Date().toISOString() }];
      setT(th);
      saveThread(th);
      setQ('');
      setBusy(true);
      let result: AnsweredMessage['result'];
      try {
        const res = await authedFetch('/api/chat/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The chapter opened last, only as a hint for "where was I" (owner, 2026-11-17).
          body: JSON.stringify({ question: question.trim(), position: currentChapter(), attached: th.messages.filter((m) => m.role === 'user').length === 1 ? th.attached : [], history }),
        });
        // A 503 with a reason is the gate's "can't check your account right now", not the assistant being away.
        if (res.status === 503) {
          const b = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
          result = b.reason && b.error ? { state: 'error', error: b.error } : { state: 'unavailable' };
        }
        else if (!res.ok) result = { state: 'error', error: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong.' };
        else result = (await res.json()) as AskResult;
      } catch {
        result = { state: 'error', error: 'No connection. Try again.' };
      }
      const done: Thread = { ...th, messages: [...th.messages, { role: 'assistant', result, question: question.trim(), at: new Date().toISOString() }] };
      setT(done);
      saveThread(done);
      setBusy(false);
      refresh();
    },
    [t, refresh],
  );

  if (!t) return <p className="as-empty">This thread isn’t on this device.</p>;
  return (
    <section className="as-thread" aria-label="Private thread" data-wording={OWNER_WORDING.by}>
      <div className="as-kind">
        <span>○ Asking · private · never published</span>
      </div>
      {t.attached.map((id) => (
        <PassageCard key={id} id={id} />
      ))}
      <div className="as-messages">
        {t.messages.map((m, i) =>
          m.role === 'user' ? (
            <p key={i} className="as-question">
              {m.text}
            </p>
          ) : (
            <Reply key={i} m={m} onAsk={(question) => void send(question)} />
          ),
        )}
        {t.messages.length === 0 && !busy && !reachedLimit && (
          <div className="as-starters">
            <p className="as-label">Try asking</p>
            {starters(t).map((s) => (
              <button key={s} type="button" className="as-starter" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {busy && <p className="as-label as-thinking">Reading the passages…</p>}
        <div ref={end} />
      </div>
      {reachedLimit ? (
        !limitShown && (
          <div className="as-reply as-stop">
            <p className="as-label">0 of {status.perDay} left today</p>
            <p>They come back at 00:00 UTC, in {untilUtcMidnight()}. Your threads are still here.</p>
          </div>
        )
      ) : null}
      {reachedLimit ? null : (
        <form
          className="as-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send(q);
          }}
        >
          <PrivateTextField id="as-q" label="Ask about the book" value={q} onChange={setQ} placeholder="Ask about the book" rows={2} maxLength={600} disabled={busy} />
          <button type="submit" className="as-send" disabled={busy || !q.trim()} aria-label="Send">
            ↑
          </button>
        </form>
      )}
      <p className="as-foot">
        <span>
          {status.model} · open weights · {status.provider}
          {status.host ? ` (via ${status.host} when busy)` : ''}
        </span>
        <span>
          {status.left} of {status.perDay} left today
        </span>
      </p>
      {notice && <Notice host={status.host} provider={status.provider} model={status.model} onClose={notice} />}
    </section>
  );
}

/** The signed-out screen's privacy paragraph (the owner's words): in view until a question is saved on this device, then behind ⓘ. */
function PrivacyNote() {
  const [asked, setAsked] = useState(false);
  useEffect(() => setAsked(loadThreads().length > 0), []);
  const words = `Your questions are saved only on this device. They are sent to ${CHAT.providerName} to be answered${CHAT.gatewayFallback ? ` (through ${CHAT.host} when ${CHAT.providerName} is busy)` : ''} and are never published. ${ASSISTANT.anyAccount ? 'The daily limit is counted per account.' : 'The daily limit is counted per Farcaster account.'}`;
  return asked ? (
    <p className="as-body">
      Saved only on this device. <InfoLabel word="About" kind="about" declaration="Where your questions go" title="Your questions" body={[words]} />
    </p>
  ) : (
    <p className="as-body">{words}</p>
  );
}

/** Screen 9d, as in the prototype: what the assistant does, then signing in. */
function SignedOut({ inApp: _inApp }: { inApp: boolean }) {
  return (
    <section className="as-signed-out" data-wording={OWNER_WORDING.by}>
      <p className="as-label">Sign in to ask questions</p>
      <h1>Your questions need a name to be counted under</h1>
      <p className="as-body">Help with reading the book. It comments; it never writes for you.</p>
      {/* Which accounts can ask (2026-11-05). DRAFT wording (coding agent), not the owner's: src/lib/chat/who-can-ask.ts. */}
      <p className="as-body" data-wording="draft">{ASK_WORDING.who()}</p>
      {/* Owner, 2026-10-29: in view until the reader's first question (one saved on this device), then behind ⓘ. Same words. */}
      <PrivacyNote />
      {/* The same sign-in list as everywhere (owner, 2026-10-30), with only the ways that can ask: Farcaster, and Lens and
          Bluesky once ASSISTANT.anyAccount is on. A wallet not linked to a Farcaster account can't ask (src/lib/chat/gate.ts). */}
      <div className="as-signin">
        <AskSignIn inApp={_inApp} />
      </div>
      {/* The two outside services are named in the sign-in step itself and on About. */}
      <Link className="as-quiet-link" href="/chapter/1">
        Keep reading without it
      </Link>
    </section>
  );
}

/** The ways to sign in that can ask: Farcaster; Lens and Bluesky too once ASSISTANT.anyAccount is on (website only). */
function AskSignIn({ inApp }: { inApp: boolean }) {
  return ASSISTANT.anyAccount ? <SignInChoices wallet={!inApp} only={['farcaster', 'lens', 'bluesky']} note={false} /> : <SignInChoices wallet={false} />;
}

/**
 * Signed in, but this account can't ask (2026-11-05): no "Sign in" heading, since the person is signed in. It says why
 * (the gate's words) and what would let them ask. DRAFT wording (coding agent): src/lib/chat/who-can-ask.ts.
 */
function Refused({ error, account, inApp }: { error: string; account: AccountKind | null; inApp: boolean }) {
  return (
    <section className="as-refused" data-wording="draft" data-account={account ?? ''}>
      <p className="as-body">Help with reading the book. It comments; it never writes for you.</p>
      <p className="as-body as-refusal" role="status">{error}</p>
      {account === 'wallet' && (
        <div className="as-signin">
          <AskSignIn inApp={inApp} />
        </div>
      )}
      {(account === 'lens' || account === 'bluesky') && (
        <Link className="as-quiet-link" href="/you">
          Link accounts on your You page
        </Link>
      )}
      <Link className="as-quiet-link" href="/chapter/1">
        Keep reading without it
      </Link>
    </section>
  );
}

/** Screen 1d, and the router for ?t= (a thread), ?block= (1a) and ?chapter= (1b). */
/**
 * `embedded`: the desktop side column (src/components/assistant-column.tsx). It keeps its
 * thread in its own state and leaves the page's URL alone; the /assistant page uses the URL.
 */
export function Assistant({ embedded = false }: { embedded?: boolean } = {}) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [list, setList] = useState<Thread[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await authedFetch('/api/chat/status').catch(() => null);
    // 403: signed in, but this account can't ask (src/lib/chat/gate.ts); its session stays.
    if (res?.status === 403) {
      const b = (await res.json().catch(() => ({}))) as { error?: string; account?: AccountKind };
      const inApp = await inMiniApp();
      return setStatus({ kind: 'refused', inApp, error: b.account && b.error ? b.error : ASK_WORDING.who(), account: b.account ?? null });
    }
    if (!res || res.status === 401) {
      const inApp = await inMiniApp();
      return setStatus({ kind: 'signed-out', inApp });
    }
    const s = (await res.json()) as { available: boolean; reason?: string; model: string; host: string | null; provider: string | null; route: string; perDay: number; left: number };
    setStatus({ kind: 'ready', ...s });
  }, []);

  // On the /assistant page the open thread lives in the URL; in the side column it doesn't.
  const show = useCallback(
    (id: string | null) => {
      setOpen(id);
      if (!embedded) window.history.replaceState(null, '', id ? `/assistant?t=${id}` : '/assistant');
    },
    [embedded],
  );

  // Signing in or out anywhere on the page (or in another tab) refreshes the assistant.
  useEffect(() => {
    const again = () => void refresh();
    window.addEventListener('snowmoon:signin', again);
    return () => window.removeEventListener('snowmoon:signin', again);
  }, [refresh]);

  useEffect(() => {
    void refresh();
    setList(loadThreads());
    if (embedded) return;
    const q = new URLSearchParams(window.location.search);
    const t = q.get('t');
    const block = q.get('block');
    const chapter = Number(q.get('chapter'));
    const go = (id: string) => {
      setOpen(id);
      window.history.replaceState(null, '', `/assistant?t=${id}`);
    };
    if (t) setOpen(t);
    else if (block && /^c\d+-b\d+$/.test(block)) {
      const ch = Number(block.slice(1, block.indexOf('-')));
      go(newThread([block], ch).id);
    } else if (Number.isInteger(chapter) && chapter >= 1 && chapter <= 32) go(newThread([], chapter).id);
  }, [refresh, embedded]);

  const ready = status.kind === 'ready' ? status : null;
  const body = useMemo(() => {
    if (status.kind === 'loading') return <p className="as-label">…</p>;
    if (status.kind === 'signed-out') return <SignedOut inApp={status.inApp} />;
    if (status.kind === 'refused') return <Refused error={status.error} account={status.account} inApp={status.inApp} />;
    if (!status.available)
      return (
        <p className="as-empty" data-wording={OWNER_WORDING.by}>
          The assistant isn’t available on this deployment yet.
        </p>
      );
    return null;
  }, [status]);

  if (body) return <div className="as">{body}</div>;
  if (open && ready)
    return (
      <div className="as">
        <TestingLabel />
        {embedded && (
          <button type="button" className="as-quiet as-back" onClick={() => (show(null), setList(loadThreads()))}>
            ← Threads
          </button>
        )}
        <ThreadView id={open} status={ready} refresh={() => void refresh()} />
      </div>
    );
  return (
    <div className="as" data-wording={OWNER_WORDING.by}>
      <TestingLabel />
      {/* The panel's own title already says "Assistant". */}
      {!embedded && <h1>Assistant</h1>}
      <p className="as-intro">Help with reading the book. It comments; it never writes for you.</p>
      <div className="as-kinds">
        <button type="button" className="as-start" onClick={() => show(newThread().id)}>
          <span className="as-start-title">○ Ask about the book</span>
          <span className="as-start-line">Private. Never published.</span>
        </button>
        {/* Planning isn't built: shown in its place, not as a control. */}
        <div className="as-coming-card">
          <span className="as-start-title">● Plan a piece</span>
          <span className="as-start-line">Coming</span>
        </div>
      </div>
      <section aria-label="Your private threads">
        <p className="as-label as-section">○ Asking · private</p>
        {list.length ? (
          <ul className="as-list">
            {list.map((t) => {
              const first = t.messages.find((m) => m.role === 'user');
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => show(t.id)}>
                    <span>{first && first.role === 'user' ? first.text : 'New thread'}</span>
                    <span className="as-meta">{new Date(t.createdAt).toLocaleDateString()}</span>
                  </button>
                  <button type="button" className="as-delete" aria-label="Delete this thread from this device" onClick={() => { deleteThread(t.id); setList(loadThreads()); }}>
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="as-empty-row">No questions yet.</p>
        )}
      </section>
      <p className="as-label as-section as-coming-row">
        <span>● Planning · published with the piece</span>
        <span>Coming</span>
      </p>
      <p className="as-label as-section as-coming-row">
        <span>Pictures</span>
        <span>Coming</span>
      </p>
      {ready && (
        <p className="as-foot">
          <span>
            {ready.model} · open weights · {ready.provider}
            {ready.host ? ` (via ${ready.host} when busy)` : ''}
          </span>
          <span>{ready.left} of {ready.perDay} left today</span>
        </p>
      )}
    </div>
  );
}
