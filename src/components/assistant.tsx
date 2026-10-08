'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, inMiniApp } from '~/lib/client-auth';
import { SignInButton } from './sign-in';
import { PrivateTextField } from './private-text-field';
import { CHAT } from '~/lib/config';
import type { AskResult, Quote } from '~/lib/chat/ask';
import { noticeItems, noticeKey } from '~/lib/chat/notice';
import type { Part } from '~/lib/chat/sanitize';
import {
  deleteThread, markNoticeSeen, newThread, noticeSeen, readTo, saveThread, thread as loadThread, threads as loadThreads,
  type AnsweredMessage, type Thread,
} from '~/lib/chat/device';

/**
 * The reading assistant, slice 1: ask about the book (docs/design/assistant-chat.dc.html,
 * screens 1d, 2, 3, 9a–9d). Private: threads stay on this device. ALL WORDING HERE IS
 * MODEL-DRAFTED and labelled as draft until Nate rewrites it.
 */
type Status =
  | { kind: 'loading' }
  | { kind: 'signed-out'; inApp: boolean }
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
  return r.parts.map((p) => (p.type === 'text' ? p.text : `[${p.id}]`)).join('');
}

/** Owner (2026-10-07): shown until a fresh 50-question check has at most 2 wrong answers. */
function TestingLabel() {
  if (!CHAT.testing) return null;
  return (
    <p className="as-testing" role="note">
      <strong>Testing</strong> Answers can be wrong; check the quotes. <DraftTag />
    </p>
  );
}

function DraftTag() {
  return <span className="as-draft">Draft wording</span>;
}

/** Screen 2: before the first message, until "don't show this again" is ticked for these exact words. */
function Notice({ host, provider, model, onClose }: { host: string | null; provider: string | null; model: string; onClose: (go: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false);
  const items = noticeItems({ host, provider, model });
  return (
    <div className="as-overlay" role="dialog" aria-modal="true" aria-labelledby="as-notice-title">
      <div className="as-sheet">
        <p className="as-label">Before you start <DraftTag /></p>
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

/** A citation: the book's own words, rendered from the stored text by block id. */
function QuoteCard({ q }: { q: Quote }) {
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
    </figure>
  );
}

/** Commentary with its quote cards placed after the sentence that cites them. */
function Answer({ parts, quotes }: { parts: Part[]; quotes: Quote[] }) {
  const byId = new Map(quotes.map((q) => [q.id, q]));
  const out: React.ReactNode[] = [];
  let text = '';
  let pending: string[] = [];
  const flush = (k: number) => {
    if (text.trim()) out.push(<p key={`t${k}`}>{text.trim()}</p>);
    text = '';
    for (const id of pending) {
      const q = byId.get(id);
      if (q) out.push(<QuoteCard key={`q${k}-${id}`} q={q} />);
    }
    pending = [];
  };
  parts.forEach((p, k) => {
    if (p.type === 'cite') {
      if (!pending.includes(p.id)) pending.push(p.id);
      return;
    }
    // A citation belongs to the sentence before it: show its card once that sentence ends.
    if (pending.length && /^\s*[.!?…]?\s/.test(p.text)) {
      const m = p.text.match(/^\s*[.!?…]?/)![0];
      text += m;
      flush(k);
      text = p.text.slice(m.length);
    } else text += p.text;
  });
  flush(parts.length);
  return <div className="as-answer">{out}</div>;
}

function ChapterPicker({ from, value, onChange, label }: { from: number; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <label className="as-picker">
      <span className="as-visually-hidden">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
        {Array.from({ length: 32 - from + 1 }, (_, i) => from + i).map((n) => (
          <option key={n} value={n}>
            Up to ch {n}
          </option>
        ))}
      </select>
    </label>
  );
}

function Reply({ m, thread, onShow }: { m: AnsweredMessage; thread: Thread; onShow: (limit: number, question: string) => void }) {
  const r = m.result;
  const [pick, setPick] = useState(Math.min(32, thread.limit + 1));
  const [hidden, setHidden] = useState(false);
  if (r.state === 'answer')
    return (
      <div className="as-reply">
        <p className="as-label">Assistant · commentary</p>
        <Answer parts={r.parts} quotes={r.quotes} />
        {r.heldBack && !hidden && (
          <div className="as-held">
            <p className="as-label">More in later chapters</p>
            <p>A fuller answer uses chapters after {thread.limit}.</p>
            <div className="as-actions">
              <ChapterPicker from={thread.limit + 1} value={pick} onChange={setPick} label="Include chapters up to" />
              <button type="button" className="as-ink" onClick={() => onShow(pick, m.question)}>
                Show it
              </button>
              <button type="button" className="as-quiet" onClick={() => setHidden(true)}>
                Keep it hidden
              </button>
            </div>
          </div>
        )}
      </div>
    );
  if (r.state === 'held')
    return (
      <div className="as-reply as-held">
        <p className="as-label">Held back · needs chapters after {thread.limit}</p>
        <p>Up to chapter {thread.limit}, the book doesn’t say. A fuller answer uses later chapters.</p>
        {!hidden && (
          <div className="as-actions">
            <ChapterPicker from={thread.limit + 1} value={pick} onChange={setPick} label="Include chapters up to" />
            <button type="button" className="as-ink" onClick={() => onShow(pick, m.question)}>
              Show it
            </button>
            <button type="button" className="as-quiet" onClick={() => setHidden(true)}>
              Keep it hidden
            </button>
          </div>
        )}
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
        <p className="as-label">Assistant · the passages don’t say</p>
        <p>The passages found for this question don’t say. Try asking another way, or include more chapters.</p>
        {r.heldBack && <p className="as-note">Later chapters may say more.</p>}
      </div>
    );
  if (r.state === 'limit')
    return (
      <div className="as-reply as-stop">
        <p className="as-label">0 left today</p>
        <p>You’ve used today’s messages. They come back at 00:00 UTC, in {untilUtcMidnight()}.</p>
        <p>Your threads are still here, and the book is open.</p>
        <Link className="as-ink" href={`/chapter/${thread.limit}`}>
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
    async (question: string, limit?: number) => {
      if (!t || !question.trim()) return;
      const go = noticeSeen(noticeKey(noticeItems(status))) ? true : await new Promise<boolean>((resolve) => setNotice(() => resolve));
      setNotice(null);
      if (!go) return;
      const th: Thread = { ...t, limit: limit ?? t.limit };
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
          body: JSON.stringify({ question: question.trim(), limit: th.limit, attached: th.messages.filter((m) => m.role === 'user').length === 1 ? th.attached : [], history }),
        });
        if (res.status === 503) result = { state: 'unavailable' };
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
  const read = readTo();
  return (
    <section className="as-thread" aria-label="Private thread">
      <div className="as-kind">
        <span>○ Asking · private · never published</span>
        <DraftTag />
      </div>
      <div className="as-limit">
        <span>Answering from ch 1–{t.limit}{t.limit <= read ? ', what you’ve read' : ', by your choice'}</span>
        <ChapterPicker
          from={1}
          value={t.limit}
          onChange={(n) => {
            const th = { ...t, limit: n };
            setT(th);
            saveThread(th);
          }}
          label="Chapters this thread may use"
        />
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
            <Reply key={i} m={m} thread={t} onShow={(limit, question) => send(question, limit)} />
          ),
        )}
        {t.messages.length === 0 && !busy && !reachedLimit && (
          <div className="as-starters">
            <p className="as-label">
              Try asking <DraftTag />
            </p>
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
      ) : (
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

/** Screen 9d. */
function SignedOut({ inApp: _inApp }: { inApp: boolean }) {
  return (
    <section className="as-signed-out">
      <p className="as-intro">
        Help with reading the book. It comments; it never writes for you. <DraftTag />
      </p>
      <p className="as-label">Sign in to use the assistant <DraftTag /></p>
      <h1>Your questions need a name to be counted under</h1>
      <p>
        Questions about the book are saved only on this device, sent to {CHAT.route} to be answered, and never published. The daily limit
        is counted per Farcaster account.
      </p>
      <SignInButton />
      {/* The two outside services are named in the sign-in step itself and on About. */}
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
      go(newThread(Math.max(readTo(), ch), [block]).id);
    } else if (Number.isInteger(chapter) && chapter >= 1 && chapter <= 32) go(newThread(Math.max(readTo(), chapter), [], chapter).id);
  }, [refresh, embedded]);

  const ready = status.kind === 'ready' ? status : null;
  const body = useMemo(() => {
    if (status.kind === 'loading') return <p className="as-label">…</p>;
    if (status.kind === 'signed-out') return <SignedOut inApp={status.inApp} />;
    if (!status.available)
      return (
        <p className="as-empty">
          The assistant isn’t available on this deployment yet. <DraftTag />
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
    <div className="as">
      <TestingLabel />
      {embedded ? <h2>Assistant</h2> : <h1>Assistant</h1>}
      <p className="as-intro">
        Help with reading the book. It comments; it never writes for you. <DraftTag />
      </p>
      <div className="as-kinds">
        <button type="button" className="as-start" onClick={() => show(newThread(readTo()).id)}>
          <span className="as-start-title">○ Ask about the book</span>
          <span className="as-start-line">Private. Saved only on this device. Never published.</span>
        </button>
        {/* Planning isn't built: shown in its place, not as a control. */}
        <div className="as-coming-card">
          <span className="as-start-title">● Plan a piece</span>
          <span className="as-start-line">Published with the piece. Coming.</span>
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
                    <span className="as-meta">ch 1–{t.limit} · {new Date(t.createdAt).toLocaleDateString()}</span>
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
