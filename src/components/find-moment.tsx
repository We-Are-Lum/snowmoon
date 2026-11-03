'use client';

import { useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { openedChapters } from '~/lib/chat/device';
import { FIND_MOMENT_WORDING as W } from '~/lib/sheet-help/wording';
import { AiTag } from './ai-tag';
import { HelpMessageField } from './help-message-field';

/**
 * "Find a moment", a tab of "Ask for help" (docs/proposals/remix-moments.md §2), shown only while it is live
 * (src/lib/sheet-help/flag.ts, findMomentLive). The person describes a mood and picks a character; the server searches
 * the book within the furthest chapter this device has opened and returns 3 to 5 passages, each the book's exact words
 * (checked on the server by checkMomentQuote) with its chapter, and the model's short "why" apart from it, labelled as
 * AI and never in quote marks. Each passage offers "Make an image here" and "Read it" (no attaching: owner,
 * 2026-11-04). "Include chapters past Chapter N" is off each time this panel opens: it lives only in this component's
 * state, is never stored, and is reset whenever the panel is mounted.
 */
type Moment = { id: string; chapter: number; idx: number; label: number | null; quote: string; why: string | null; from: 'pick' | 'search'; pastRead: boolean };
type Result =
  | { state: 'moments'; moments: Moment[]; limit: number; upTo: number; heldBack: boolean; left: number; whys: 'ok' | 'left-out' | 'none' }
  | { state: 'not-yet'; name: string; firstChapter: number; upTo: number }
  | { state: 'none'; heldBack: boolean; left: number }
  | { state: 'limit'; perDay: number }
  | { state: 'spend' };

/** Off each time the panel opens (docs/proposals/remix-moments.md 3.3). */
export const PAST_LIMIT_DEFAULT = false;

export function FindMoment(p: {
  from: string;
  cast: { slug: string; name: string }[];
  character: string;
  moodMax: number;
  route: string;
  limitWords: (n: number) => string;
  spendWords: string;
  leftWords: (n: number) => string;
}) {
  const [mood, setMood] = useState('');
  const [character, setCharacter] = useState(p.character);
  const [pastLimit, setPastLimit] = useState(PAST_LIMIT_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const upTo = () => Math.max(1, ...openedChapters());

  const find = async () => {
    const m = mood.trim();
    if (!m || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch('/api/sheet-help/moment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: p.from, mood: m, character, upTo: upTo(), pastLimit }),
      });
      const out = (await res.json().catch(() => ({}))) as Result & { error?: string };
      if (!res.ok) {
        setError(out.error ?? 'Could not search');
        return;
      }
      setResult(out);
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const n = upTo();
  return (
    <div className="sh-moment">
      <p className="dz-note">{W.intro}</p>
      <p className="dz-note">{W.sends(p.route)}</p>
      <p>
        <label htmlFor="fm-character" className="dz-label">{W.character}</label>{' '}
        <select id="fm-character" value={character} onChange={(e) => setCharacter(e.target.value)}>
          {p.cast.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </p>
      <div className="sh-ask">
        <HelpMessageField id="fm-mood" label={W.moodLabel} value={mood} onChange={setMood} maxLength={p.moodMax} placeholder={W.placeholder} mode="moment" />
      </div>
      <p>
        <label>
          <input type="checkbox" checked={pastLimit} onChange={(e) => setPastLimit(e.target.checked)} /> {W.pastLimit(n)}
        </label>
        <br />
        <span className="dz-note">{W.pastLimitNote}</span>
      </p>
      <p className="sh-actions">
        <button type="button" className="ic-primary" onClick={find} disabled={busy || !mood.trim()}>
          {busy ? W.finding : W.find}
        </button>{' '}
        {result && 'left' in result && <span className="dz-note">{p.leftWords(result.left)}</span>}
      </p>
      {error && <p className="ic-error" role="status">{error}</p>}
      {result?.state === 'not-yet' && <p className="dz-note">{W.notYet(result.name, result.firstChapter)}</p>}
      {result?.state === 'none' && <p className="dz-note">{W.none}</p>}
      {result?.state === 'limit' && <p className="dz-note">{p.limitWords(result.perDay)}</p>}
      {result?.state === 'spend' && <p className="dz-note">{p.spendWords}</p>}
      {(result?.state === 'none' || result?.state === 'moments') && result.heldBack && !pastLimit && <p className="dz-note">{W.heldBack}</p>}
      {result?.state === 'moments' && result.whys === 'left-out' && <p className="dz-note">{W.whysLeftOut}</p>}
      {result?.state === 'moments' && (
        <ol className="sh-moments">
          {result.moments.map((m) => (
            <li key={m.id} className="sh-moment-item">
              <figure>
                <blockquote className="sh-quote" cite={`/chapter/${m.chapter}#${m.id}`}>
                  <q>{m.quote}</q>
                </blockquote>
                <figcaption className="dz-meta">
                  {W.chapter(m.chapter)}
                  {m.label !== null && ` · ¶${m.label}`} · {m.id}
                  {m.pastRead && <> · <strong>{W.pastRead}</strong></>}
                  {m.from === 'search' && <> · {W.fromSearch}</>}
                </figcaption>
              </figure>
              {m.why && (
                <p className="dz-note sh-why" data-ai="why">
                  <span className="dz-label">{W.why}</span> <AiTag what="A reason suggested by AI" /> {m.why}
                </p>
              )}
              <p className="sh-actions">
                <a className="ic-link" href={`/references/new?chapter=${m.chapter}&start=${m.idx}&end=${m.idx}`} target="_blank" rel="noopener">
                  {W.makeImage}
                </a>{' '}
                <a className="ic-link" href={`/chapter/${m.chapter}#${m.id}`} target="_blank" rel="noopener">
                  {W.read}
                </a>
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
