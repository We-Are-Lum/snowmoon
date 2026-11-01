'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';

type Shown = { id: string; title: string; byName: string | null; picture: string | null; isFinal: boolean };
type Q = ({ no: number; kind: 'compare'; a: string; b: string } | { no: number; kind: 'originality'; node: string }) & { answered: boolean };
type View = { character: string; name: string; final: Shown; questions: Q[]; versions: Record<string, Shown> };

/** The choices for "how many times more" (no free text: nothing typed is published). */
const TIMES = [1, 1.5, 2, 3, 4, 5, 7, 10, 20, 50, 100];

const label = (v: Shown) => `${v.title || 'Sheet'}${v.byName ? ` by @${v.byName}` : ''}`;

function Pic({ v }: { v: Shown }) {
  return (
    <figure className="jr-pic">
      {v.picture && <img src={v.picture} alt={label(v)} width={160} height={213} loading="lazy" />}
      <figcaption>{label(v)}</figcaption>
    </figure>
  );
}

/** The juror's questions (DEEP_FUNDING.jurors). Shows only the versions and the question; never a model's answer. */
export function JurorQuestions({ characters }: { characters: { slug: string; name: string }[] }) {
  const auth = useAuth();
  const [character, setCharacter] = useState(characters[0]?.slug ?? '');
  const [view, setView] = useState<View | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = async (c: string) => {
    const r = await authFetch(`/api/challenge/jurors?character=${encodeURIComponent(c)}`).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as View & { error?: string };
    setView(r?.ok ? j : null);
    setNote(r?.ok ? null : (j?.error ?? 'Could not load the questions'));
  };
  useEffect(() => {
    if (auth.kind === 'signed-in' && character) void load(character);
  }, [auth.kind, character]);
  if (auth.kind !== 'signed-in') return <p>Sign in with Farcaster to see your questions.</p>;
  const send = async (body: Record<string, unknown>) => {
    const r = await authFetch('/api/challenge/jurors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ character, ...body }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string };
    setNote(r?.ok ? `Answer ${String(body.no)} saved` : (j.error ?? 'Could not save it'));
    if (r?.ok) void load(character);
  };
  return (
    <section className="jr">
      <p>
        <label>
          Character{' '}
          <select value={character} onChange={(e) => setCharacter(e.target.value)}>
            {characters.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </p>
      <p className="dz-note">Your answers are published with the results by juror number, never with your name or account.</p>
      {note && <p role="status">{note}</p>}
      {view && (
        <>
          <h2>The final {view.name}</h2>
          <Pic v={view.final} />
          <ol>
            {view.questions.map((q) => (
              <li key={q.no}>{q.kind === 'compare' ? <Compare q={q} v={view} onSend={send} /> : <Originality q={q} v={view} onSend={send} />}</li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Compare({ q, v, onSend }: { q: Extract<Q, { kind: 'compare' }>; v: View; onSend: (b: Record<string, unknown>) => void }) {
  const [choice, setChoice] = useState<'a' | 'b' | null>(null);
  const [times, setTimes] = useState(2);
  return (
    <div className="jr-q">
      <p>
        For the final {v.name}, which mattered more, A or B, and how many times more?{q.answered ? ' (answered; a new answer replaces it)' : ''}
      </p>
      <div className="jr-pair">
        <label>
          <input type="radio" name={`q${q.no}`} checked={choice === 'a'} onChange={() => setChoice('a')} /> A <Pic v={v.versions[q.a]} />
        </label>
        <label>
          <input type="radio" name={`q${q.no}`} checked={choice === 'b'} onChange={() => setChoice('b')} /> B <Pic v={v.versions[q.b]} />
        </label>
      </div>
      <label>
        How many times more:{' '}
        <select value={times} onChange={(e) => setTimes(Number(e.target.value))}>
          {TIMES.map((t) => (
            <option key={t} value={t}>
              {t === 1 ? 'the same' : `${t} times`}
            </option>
          ))}
        </select>
      </label>{' '}
      <button type="button" className="ic-secondary" disabled={!choice} onClick={() => onSend({ no: q.no, choice, times })}>
        Save
      </button>
    </div>
  );
}

function Originality({ q, v, onSend }: { q: Extract<Q, { kind: 'originality' }>; v: View; onSend: (b: Record<string, unknown>) => void }) {
  const [pct, setPct] = useState(50);
  return (
    <div className="jr-q">
      <p>How much of this version is new?{q.answered ? ' (answered; a new answer replaces it)' : ''}</p>
      <Pic v={v.versions[q.node]} />
      <label>
        New: <input type="range" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} /> {pct}%
      </label>{' '}
      <button type="button" className="ic-secondary" onClick={() => onSend({ no: q.no, share: pct / 100 })}>
        Save
      </button>
    </div>
  );
}
