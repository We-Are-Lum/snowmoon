'use client';

import { useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { openedChapters } from '~/lib/chat/device';
import { applyProposal, type PartLimits } from '~/lib/sheet-help/part';
import { SHEET_HELP_WORDING as W } from '~/lib/sheet-help/wording';
import { AiTag } from './ai-tag';
import { HelpMessageField } from './help-message-field';

/**
 * "Ask for help" beside a character sheet's prompt box (docs/proposals/sheet-help.md), shown only while it is live
 * (src/lib/sheet-help/flag.ts). Optional and closed to start with; the plain text box stays the main way to make a
 * sheet. Each answer is a change to one part of the text, shown as before and after: Accept changes the text (and keeps
 * the suggestion's signed receipt, so the published recipe says it includes words from AI suggestions); Reject leaves
 * it as it was. Nothing changes the text without that tap. The conversation stays on this page only.
 */
type Quote = { id: string; chapter: number; label: number | null; html: string };
type Answer =
  | { state: 'proposal'; before: string; after: string; why: string; quotes: Quote[]; receipt: string | null; left: number }
  | { state: 'note'; text: string; quotes: Quote[]; left: number }
  | { state: 'declined'; left: number }
  | { state: 'limit'; perDay: number }
  | { state: 'spend' };
type Turn = { role: 'user'; text: string } | { role: 'assistant'; answer: Answer; decided?: 'accepted' | 'rejected' | 'stale' };

export function SheetHelp(p: {
  from: string;
  text: string;
  recipe: string;
  limits: PartLimits;
  route: string;
  model: string;
  onAccept: (next: string, receipt: string | null, after: string) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  const history = turns.flatMap((t): { role: 'user' | 'assistant'; text: string }[] =>
    t.role === 'user' ? [{ role: 'user', text: t.text }] : t.answer.state === 'proposal' ? [{ role: 'assistant', text: `PART: ${t.answer.before || 'NEW'}\nCHANGE: ${t.answer.after}\nWHY: ${t.answer.why}` }] : t.answer.state === 'note' ? [{ role: 'assistant', text: `NONE: ${t.answer.text}` }] : [],
  );

  const ask = async () => {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch('/api/sheet-help', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: p.from, message: m, draft: p.text, recipe: p.recipe, upTo: Math.max(1, ...openedChapters()), history }),
      });
      const out = (await res.json().catch(() => ({}))) as Answer & { error?: string };
      if (!res.ok) {
        setError(out.error ?? 'Could not ask');
        return;
      }
      if ('left' in out) setLeft(out.left);
      setTurns((t) => [...t, { role: 'user', text: m }, { role: 'assistant', answer: out }]);
      setMessage('');
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const decide = (i: number, accept: boolean) => {
    const t = turns[i];
    if (t.role !== 'assistant' || t.answer.state !== 'proposal' || t.decided) return;
    let decided: 'accepted' | 'rejected' | 'stale' = 'rejected';
    if (accept) {
      const next = applyProposal(p.text, { before: t.answer.before, after: t.answer.after }, p.limits);
      if (next === null) decided = 'stale';
      else {
        p.onAccept(next, t.answer.receipt, t.answer.after);
        decided = 'accepted';
      }
    }
    setTurns((all) => all.map((x, k) => (k === i ? { ...x, decided } as Turn : x)));
  };

  return (
    <details className="dz-section sh-help">
      <summary>
        {W.open} <AiTag />
      </summary>
      <p className="dz-note">{W.optional}</p>
      <p className="dz-note">{W.sends(p.route)}</p>
      <ol className="sh-turns">
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <li key={i} className="sh-you">{t.text}</li>
          ) : (
            <li key={i} className="sh-ai">
              {t.answer.state === 'proposal' ? (
                <>
                  <div className="sh-change">
                    <p>
                      <span className="dz-label">{t.answer.before ? W.before : W.adds}</span> {t.answer.before && <del>{t.answer.before}</del>}
                    </p>
                    <p>
                      <span className="dz-label">{W.after}</span> <ins>{t.answer.after}</ins>
                    </p>
                  </div>
                  <p className="dz-note">{t.answer.why}</p>
                  {t.decided ? (
                    <p className="dz-note" role="status">{t.decided === 'accepted' ? W.accepted : t.decided === 'rejected' ? W.rejected : W.stale}</p>
                  ) : (
                    <p className="sh-actions">
                      <button type="button" className="ic-primary" onClick={() => decide(i, true)}>{W.accept}</button>{' '}
                      <button type="button" className="ic-link" onClick={() => decide(i, false)}>{W.reject}</button>
                    </p>
                  )}
                </>
              ) : t.answer.state === 'note' ? (
                <p>{t.answer.text}</p>
              ) : t.answer.state === 'declined' ? (
                <p className="dz-note">{W.declined}</p>
              ) : t.answer.state === 'limit' ? (
                <p className="dz-note">{W.limit(t.answer.perDay)}</p>
              ) : (
                <p className="dz-note">{W.spend}</p>
              )}
              {(t.answer.state === 'proposal' || t.answer.state === 'note') &&
                t.answer.quotes.map((q) => (
                  <blockquote key={q.id} className="sh-quote" dangerouslySetInnerHTML={{ __html: q.html }} />
                ))}
            </li>
          ),
        )}
      </ol>
      <div className="sh-ask">
        <HelpMessageField id="sh-message" label={W.open} value={message} onChange={setMessage} maxLength={600} placeholder={W.placeholder} />
      </div>
      <p className="sh-actions">
        <button type="button" className="ic-primary" onClick={ask} disabled={busy || !message.trim()}>
          {busy ? W.asking : W.send}
        </button>{' '}
        {left !== null && <span className="dz-note">{W.left(left)}</span>}
      </p>
      {error && <p className="ic-error" role="status">{error}</p>}
      <p className="ic-model">{W.model(p.model)}</p>
    </details>
  );
}
