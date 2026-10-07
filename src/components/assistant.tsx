'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { sdk } from '@farcaster/miniapp-sdk';
import { PrivateTextField } from './private-text-field';
import { CHAT } from '~/lib/config';
import type { AskResult, Quote } from '~/lib/chat/ask';
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
  | { kind: 'ready'; available: boolean; reason?: string; model: string; host: string; provider: string | null; perDay: number; left: number };

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const inApp = await sdk.isInMiniApp().catch(() => false);
  return inApp ? sdk.quickAuth.fetch(url, init) : fetch(url, init);
}

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

/** Screen 2: before the first message, until "don't show this again" is ticked. */
function Notice({ host, provider, model, onClose }: { host: string; provider: string | null; model: string; onClose: (go: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false);
  const items = [
    ['It helps you read', 'Ask about the book. Answers point to the passages they rest on, with chapter and ¶, and show the book’s own words.'],
    ['It won’t write for you', 'No dialogue, narration or description. It gives context and commentary only.'],
    [`Your messages go to ${host}, then ${provider}`, `Two outside services: ${host} passes each message to ${provider}, which runs ${model}, an open-weights model. Neither keeps your messages, and this app keeps no copy.`],
    [
      'Your questions are saved only on this device',
      `They are sent to ${host} and ${provider} to be answered, and never published. Another device won’t have them.`,
    ],
  ];
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
              if (dontShow) markNoticeSeen();
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
      const go = noticeSeen() ? true : await new Promise<boolean>((resolve) => setNotice(() => resolve));
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
      {t.attached.length > 0 && <p className="as-attached">Asking about {t.attached.join(', ')}</p>}
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
          {status.model} · open weights · via {status.host}{status.provider ? ` → ${status.provider}` : ''}
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
function SignedOut({ inApp }: { inApp: boolean }) {
  const [msg, setMsg] = useState('');
  return (
    <section className="as-signed-out">
      <p className="as-label">Sign in to use the assistant <DraftTag /></p>
      <h1>Your questions need a name to be counted under</h1>
      <p>
        Questions about the book are saved only on this device, sent to {CHAT.host} and {CHAT.providerName} to be answered, and never published. The daily limit
        is counted per Farcaster account.
      </p>
      <button
        type="button"
        className="as-primary"
        onClick={async () => {
          if (!inApp) return setMsg('Open Snowmoon in a Farcaster app to sign in.');
          const res = await sdk.quickAuth.fetch('/api/auth/me').catch(() => null);
          if (res?.ok) window.location.reload();
          else setMsg('Sign-in didn’t work. Try again.');
        }}
      >
        Sign in with Farcaster
      </button>
      {msg && <p className="as-note">{msg}</p>}
      <Link className="as-quiet-link" href="/chapter/1">
        Keep reading without it
      </Link>
    </section>
  );
}

/** Screen 1d, and the router for ?t= (a thread), ?block= (1a) and ?chapter= (1b). */
export function Assistant() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [list, setList] = useState<Thread[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await authedFetch('/api/chat/status').catch(() => null);
    if (!res || res.status === 401) {
      const inApp = await sdk.isInMiniApp().catch(() => false);
      return setStatus({ kind: 'signed-out', inApp });
    }
    const s = (await res.json()) as { available: boolean; reason?: string; model: string; host: string; provider: string | null; perDay: number; left: number };
    setStatus({ kind: 'ready', ...s });
  }, []);

  useEffect(() => {
    void refresh();
    setList(loadThreads());
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
    } else if (Number.isInteger(chapter) && chapter >= 1 && chapter <= 32) go(newThread(Math.max(readTo(), chapter)).id);
  }, [refresh]);

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
        <ThreadView id={open} status={ready} refresh={() => void refresh()} />
      </div>
    );
  return (
    <div className="as">
      <TestingLabel />
      <h1>Assistant</h1>
      <p className="as-intro">
        Help with reading the book. It comments; it never writes for you. <DraftTag />
      </p>
      <button
        type="button"
        className="as-start"
        onClick={() => {
          const t = newThread(readTo());
          setOpen(t.id);
          window.history.replaceState(null, '', `/assistant?t=${t.id}`);
        }}
      >
        <span className="as-start-title">○ Ask about the book</span>
        <span className="as-start-line">Private. Saved only on this device. Never published.</span>
      </button>
      {list.length > 0 && (
        <section aria-label="Your private threads">
          <p className="as-label">○ Asking · private</p>
          <ul className="as-list">
            {list.map((t) => {
              const first = t.messages.find((m) => m.role === 'user');
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => { setOpen(t.id); window.history.replaceState(null, '', `/assistant?t=${t.id}`); }}>
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
        </section>
      )}
      {ready && (
        <p className="as-foot">
          <span>{ready.model} · open weights · via {ready.host}</span>
          <span>{ready.left} of {ready.perDay} left today</span>
        </p>
      )}
    </div>
  );
}
