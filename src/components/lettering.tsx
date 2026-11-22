'use client';

import type { LetteringPhrase, LetteringRecord, Parsed } from '~/lib/images/lettering';

/**
 * Lettering's pieces of screen (part C; owner, 2026-11-22), shared by the remix screen, its preview, a challenge
 * picture's page and the admins' chapter pictures. Every word comes from the server (src/lib/images/lettering.ts
 * LETTERING_WORDING, through letteringWords); DRAFT wording.
 */
export type LetteringW = {
  previewHead: string;
  previewNote: string;
  warning: string;
  openRefused: string;
  mismatchHead: string;
  mismatchAsked: string;
  mismatchRead: string;
  mismatchNothing: string;
  mismatchKept: string;
  tryAgain: string;
  unread: string;
  recordHead: string;
  book: string;
  own: string;
  recordRead: string;
  recordPad: string;
};

/** What the server says when the read-back didn't match (or gave no answer): nothing was kept. */
export type Mismatch = { reason: 'lettering-mismatch' | 'lettering-unread'; asked: string[]; read: string[]; reader: string };
export const mismatchOf = (out: { reason?: string; asked?: unknown; read?: unknown; reader?: unknown }): Mismatch | null =>
  out.reason === 'lettering-mismatch' || out.reason === 'lettering-unread'
    ? { reason: out.reason, asked: Array.isArray(out.asked) ? out.asked.map(String) : [], read: Array.isArray(out.read) ? out.read.map(String) : [], reader: typeof out.reader === 'string' ? out.reader : '' }
    : null;

const quoted = (xs: string[]) => xs.map((x) => `“${x}”`).join(', ');

/** "Words to draw": the phrases in the box's quotation marks, as they will be asked for (or why they can't be). */
export function WordsToDraw({ parsed, w, refused }: { parsed: Parsed; w: LetteringW; refused?: boolean }) {
  if (parsed.ok && !parsed.phrases.length) return null;
  return (
    <section className="lt-preview" data-slot="lettering-preview" aria-live="polite">
      <p className="lt-head">{w.previewHead}</p>
      {parsed.ok ? (
        <ul className="lt-phrases" role="list">
          {parsed.phrases.map((p, i) => (
            <li key={`${i}-${p}`} className="lt-phrase">
              “{p}”
            </li>
          ))}
        </ul>
      ) : (
        <p className="ia-note mk-error" role="alert" data-slot="lettering-error">
          {parsed.error}
        </p>
      )}
      {refused ? (
        <p className="ia-note mk-error" role="alert" data-slot="lettering-open">
          {w.openRefused}
        </p>
      ) : (
        <p className="dz-muted lt-note">{w.previewNote}</p>
      )}
    </section>
  );
}

/** The line before Make it, whenever quoted words go to a closed model. */
export function LetteringWarning({ w }: { w: LetteringW }) {
  return (
    <p className="lt-warning" data-slot="lettering-warning">
      <span className="lt-draft">DRAFT</span> {w.warning}
    </p>
  );
}

/** The mismatch screen: what was asked, what the reader read, that nothing was kept, and Try again only (option a). */
export function LetteringMismatch({ m, w, onTryAgain, busy }: { m: Mismatch; w: LetteringW; onTryAgain: () => void; busy?: boolean }) {
  return (
    <div className="lt-mismatch" role="alert" data-slot="lettering-mismatch">
      <p className="lt-mismatch-head">{m.reason === 'lettering-mismatch' ? w.mismatchHead : w.unread}</p>
      {m.reason === 'lettering-mismatch' && (
        <dl className="lt-dl">
          <dt>{w.mismatchAsked}</dt>
          <dd>{quoted(m.asked)}</dd>
          <dt>{w.mismatchRead.replace('{reader}', m.reader)}</dt>
          <dd>{m.read.length ? quoted(m.read) : w.mismatchNothing}</dd>
        </dl>
      )}
      <p className="dz-muted">{w.mismatchKept}</p>
      <button type="button" className="rl-remix mk-make" onClick={onTryAgain} disabled={busy} data-slot="lettering-try-again">
        {w.tryAgain}
      </button>
    </div>
  );
}

const sourceText = (p: LetteringPhrase, w: Pick<LetteringW, 'book' | 'own'>, ownBy?: string | null) => (p.source === 'book' ? w.book.replace('{block}', p.block) : ownBy ?? w.own);

/** The lettering record: each phrase, the book's (with its block, linked) or own; the read-back; the pad. */
export function LetteringRecordView({ r, w, ownBy }: { r: LetteringRecord; w: Pick<LetteringW, 'recordHead' | 'book' | 'own' | 'recordRead' | 'recordPad'>; ownBy?: string | null }) {
  return (
    <section className="lt-record" data-slot="lettering-record">
      <p className="lt-head">{w.recordHead}</p>
      <ul className="lt-phrases" role="list">
        {r.phrases.map((p, i) => (
          <li key={`${i}-${p.text}`} className="lt-phrase">
            “{p.text}” <span className="dz-muted">·</span>{' '}
            {p.source === 'book' ? (
              <a href={`/chapter/${p.block.match(/^c(\d+)-b/)?.[1] ?? ''}#${p.block}`}>{sourceText(p, w)}</a>
            ) : (
              <span>{sourceText(p, w, ownBy)}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="dz-muted lt-note">{w.recordRead.replace('{reader}', r.readback.name).replace('{maker}', r.readback.maker)}</p>
      <p className="dz-muted lt-note">{w.recordPad}</p>
    </section>
  );
}
