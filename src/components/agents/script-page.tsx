'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import type { NoteView, ScriptLine, ScriptShot } from '~/lib/agents/direction';
import { DirectionField } from './direction-field';
import './agents.css';

/**
 * The script page (owner, 2026-10-20): a person's own scene version, every line with its speaker and time, their
 * direction notes inline. Tap a line to rewrite it or note its delivery; tap a shot's "Note" for its intent or
 * someone's acting. The re-record sheet sits at the top. Phone first: one column, big tap targets. The data
 * needs the person's token, so it is read in the browser from /api/direction. DRAFT wording.
 */
const D = AGENT_WORDING.direction;
type Script = { adaptation: number; version: number; title: string; cast: string[]; shots: ScriptShot[]; rerecord: { speaker: string; lines: { shot: string; n: number; cue: string; time: string; line: string; original: string | null; rewrite: string | null; delivery: string[] }[] }[] };
type Open = { kind: 'line'; cue: string; mode: 'rewrite' | 'delivery' } | { kind: 'shot'; shot: string; mode: 'intent' | 'acting'; who: string } | null;

function Notes({ notes, onWithdraw }: { notes: NoteView[]; onWithdraw: (id: string) => void }) {
  if (!notes.length) return null;
  return (
    <ul className="script-notes">
      {notes.map((n) => (
        <li key={n.id} data-kind={n.kind}>
          <span className="script-kind">{D.kinds[n.kind]}{n.character ? ` · ${n.character}` : ''}</span> {n.text}
          {n.filedBy && <span className="you-note"> · {D.filedBy(n.filedBy)}</span>}{' '}
          <button type="button" className="script-link" onClick={() => onWithdraw(n.id)}>{D.withdraw}</button>
        </li>
      ))}
    </ul>
  );
}

export function ScriptPage({ adaptation, version }: { adaptation: number; version: number }) {
  const [script, setScript] = useState<Script | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await authFetch(`/api/direction?adaptation=${adaptation}&version=${version}`).catch(() => null);
    if (r?.ok) {
      setScript((await r.json()) as Script);
      setError(null);
    } else setError(r?.status === 401 ? D.signIn : r?.status === 400 ? D.notYours : 'Not found');
  }, [adaptation, version]);
  useEffect(() => {
    void load();
  }, [load]);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await authFetch('/api/direction', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adaptation, version, ...body }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setError(((await r?.json().catch(() => ({}))) as { error?: string }).error ?? 'That didn’t work.');
      return false;
    }
    setError(null);
    await load();
    return true;
  };
  const start = (o: Open) => {
    setOpen(o);
    setText('');
  };
  const save = async () => {
    if (!open || !text.trim()) return;
    const ok =
      open.kind === 'line'
        ? await post(open.mode === 'rewrite' ? { action: 'rewrite', cue: open.cue, text } : { action: 'note', kind: 'delivery', cue: open.cue, text })
        : await post({ action: 'note', kind: open.mode, shot: open.shot, ...(open.mode === 'acting' ? { character: open.who } : {}), text });
    if (ok) setOpen(null);
  };
  const withdraw = (id: string) => void post({ action: 'withdraw', id });

  if (!script) return <main className="script-page"><p className="you-note">{error ?? '…'}</p></main>;

  const editor = (label: string, id: string) => (
    <div className="script-editor">
      <DirectionField id={id} label={label} value={text} onChange={setText} />
      <div className="draft-actions">
        <button type="button" className="ic-primary" disabled={busy || !text.trim()} onClick={() => void save()}>{D.save}</button>
        <button type="button" className="ic-secondary" onClick={() => setOpen(null)}>{D.cancel}</button>
      </div>
    </div>
  );

  const line = (s: ScriptShot, l: ScriptLine) => {
    const here = open?.kind === 'line' && open.cue === l.cue;
    return (
      <li key={l.cue} className="script-line" id={`cue-${l.cue}`}>
        <button type="button" className="script-line-tap" aria-expanded={here} onClick={() => (here ? setOpen(null) : start({ kind: 'line', cue: l.cue, mode: 'rewrite' }))}>
          <span className="script-time">{l.time}</span> <b>{l.speaker ?? '—'}</b>{' '}
          {l.rewrite ? (
            <>
              <span className="script-rewrite">{l.rewrite.text}</span> <span className="you-note">({D.draft}; {D.was} “{l.text}”)</span>
            </>
          ) : (
            l.text
          )}
        </button>
        {l.rewrite && (
          <p className="you-note">
            {l.rewrite.filedBy && `${D.filedBy(l.rewrite.filedBy)} · `}
            <button type="button" className="script-link" onClick={() => void post({ action: 'recorded', id: l.rewrite!.id })}>{D.recorded}</button>{' · '}
            <button type="button" className="script-link" onClick={() => withdraw(l.rewrite!.id)}>{D.withdraw}</button>
          </p>
        )}
        <Notes notes={l.delivery} onWithdraw={withdraw} />
        {here && open.kind === 'line' && (
          <>
            <div className="script-modes" role="group">
              {(['rewrite', 'delivery'] as const).map((m) => (
                <button key={m} type="button" className={open.mode === m ? 'ic-primary' : 'ic-secondary'} aria-pressed={open.mode === m} onClick={() => setOpen({ ...open, mode: m })}>
                  {m === 'rewrite' ? D.rewrite : D.kinds.delivery}
                </button>
              ))}
            </div>
            {open.mode === 'delivery' && <p className="you-note">{D.kindHelp.delivery}</p>}
            {editor(open.mode === 'rewrite' ? D.rewriteLabel : D.noteLabel, `script-${l.cue}`)}
          </>
        )}
      </li>
    );
  };

  return (
    <main className="script-page">
      <h1>{D.title(script.title)}</h1>
      <p className="you-note">{D.lede}</p>
      {error && <p role="alert" className="you-note">{error}</p>}
      <details className="script-rerecord">
        <summary>{D.rerecord} ({script.rerecord.reduce((n, g) => n + g.lines.length, 0)})</summary>
        <p className="you-note">{D.rerecordNote}</p>
        {script.rerecord.length === 0 && <p className="you-note">{D.rerecordNone}</p>}
        {script.rerecord.map((g) => (
          <section key={g.speaker}>
            <h3>{g.speaker}</h3>
            <ol>
              {g.lines.map((r) => (
                <li key={r.cue}>
                  <a href={`#cue-${r.cue}`}><span className="script-time">{r.time}</span></a> {r.line}
                  {r.original && <span className="you-note"> ({D.was} “{r.original}”)</span>}
                  {r.delivery.map((d, i) => <span key={i} className="script-delivery"> · {d}</span>)}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </details>
      <ol className="script-shots">
        {script.shots.map((s) => {
          const here = open?.kind === 'shot' && open.shot === s.id;
          return (
            <li key={s.id} className="script-shot" id={`shot-${s.id}`}>
              <div className="script-shot-head">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.thumb && <img src={s.thumb} alt="" width={64} height={36} loading="lazy" />}
                <span>
                  <b>{s.n}</b> <span className="script-time">{s.time}</span> {s.onScreen.join(', ')}
                </span>
                <button type="button" className="script-link" aria-expanded={here} onClick={() => (here ? setOpen(null) : start({ kind: 'shot', shot: s.id, mode: 'intent', who: s.onScreen[0] ?? script.cast[0] ?? '' }))}>
                  {D.note}
                </button>
              </div>
              <Notes notes={[...s.intent, ...s.acting]} onWithdraw={withdraw} />
              {here && open.kind === 'shot' && (
                <>
                  <div className="script-modes" role="group">
                    {(['intent', 'acting'] as const).map((m) => (
                      <button key={m} type="button" className={open.mode === m ? 'ic-primary' : 'ic-secondary'} aria-pressed={open.mode === m} onClick={() => setOpen({ ...open, mode: m })}>
                        {D.kinds[m]}
                      </button>
                    ))}
                  </div>
                  <p className="you-note">{D.kindHelp[open.mode]}</p>
                  {open.mode === 'acting' && (
                    <div className="script-modes" role="group" aria-label={D.who}>
                      {(s.onScreen.length ? s.onScreen : script.cast).map((c) => (
                        <button key={c} type="button" className={open.who === c ? 'ic-primary' : 'ic-secondary'} aria-pressed={open.who === c} onClick={() => setOpen({ ...open, who: c })}>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                  {editor(D.noteLabel, `script-shot-${s.id}`)}
                </>
              )}
              {s.lines.length > 0 ? <ul className="script-lines">{s.lines.map((l) => line(s, l))}</ul> : null}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
