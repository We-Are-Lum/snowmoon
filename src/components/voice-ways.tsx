'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '~/lib/client-auth';
import { WAYS, WAYS_HEADING, type WayId } from '~/lib/voice/three-ways';

/**
 * Three ways in (Nate, 2026-11-24; DRAFT wording until his reread): the first thing on the Ephelion challenge's page.
 * From scratch is the page below, as before. New pictures for a recording lists the ready-made readings (and published
 * takes, once publishing is on), each opening its storyboard. Your voice over a storyboard lists the storyboards that can
 * be reused; once the person has kept a take of that storyboard's speech, one tap fits the storyboard to it.
 */
interface Reading { speechId: string; presetId: string; id: string }
interface Draft { id: string; kind: string; speechId: string; madeAt: string }
interface Speech { id: string; title: string }
interface Board { kind: 'team' | 'published'; draftId: string; fid: number; publicationId: string | null; title: string; speechId: string; by: string | null; shots: number; seconds: number }
interface Take { draftId: string; performer: string | null; speechId: string; title: string; preset: string | null }

const KEY = 'snowmoon.voice.way';
const PICK = 'snowmoon.voice.reuse';
const keyOf = (b: Pick<Board, 'kind' | 'draftId' | 'fid' | 'publicationId'>) => (b.kind === 'published' ? `p:${b.publicationId}` : `t:${b.draftId}:${b.fid}`);
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function VoiceWays({ speeches, readings, drafts, presetName, onSpeech, disabled }: { speeches: Speech[]; readings: Reading[]; drafts: Draft[]; presetName: (id: string) => string; onSpeech: (id: string) => void; disabled?: boolean }) {
  const [way, setWay] = useState<WayId>('scratch');
  const [list, setList] = useState<{ publishing: boolean; takes: Take[]; boards: Board[] } | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const w = localStorage.getItem(KEY);
    if (w === 'scratch' || w === 'pictures' || w === 'voice') setWay(w);
    setPick(localStorage.getItem(PICK));
  }, []);
  useEffect(() => {
    if (way === 'scratch' || list) return;
    void authFetch('/api/voice/ways', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setList(j ?? { publishing: false, takes: [], boards: [] }))
      .catch(() => setList({ publishing: false, takes: [], boards: [] }));
  }, [way, list]);

  const choose = (w: WayId) => {
    setWay(w);
    localStorage.setItem(KEY, w);
    setMessage(null);
  };
  const title = (id: string) => speeches.find((s) => s.id === id)?.title ?? 'A speech';
  const chosen = list?.boards.find((b) => keyOf(b) === pick) ?? null;
  const takes = chosen ? drafts.filter((d) => d.kind === 'performance' && d.speechId === chosen.speechId) : [];

  async function fit(draftId: string) {
    if (!chosen) return;
    setBusy(true);
    setMessage(null);
    const r = await authFetch('/api/voice/ways', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId, source: { kind: chosen.kind, draftId: chosen.draftId, fid: chosen.fid, publicationId: chosen.publicationId } }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { url?: string; error?: string } | undefined;
    setBusy(false);
    if (r?.ok && j?.url) window.location.href = j.url;
    else setMessage(j?.error ?? 'It could not be fitted. Try again.');
  }

  return (
    <section className="vr-card vw" aria-labelledby="vw-h" data-slot="three-ways">
      <h2 id="vw-h">
        {WAYS_HEADING}
      </h2>
      <div className="vw-ways" role="radiogroup" aria-labelledby="vw-h">
        {WAYS.map((w) => (
          <label key={w.id} className={`vw-way${way === w.id ? ' vw-on' : ''}`}>
            <input type="radio" name="vw-way" value={w.id} checked={way === w.id} onChange={() => choose(w.id)} disabled={disabled} />
            <span className="vw-title">{w.title}</span>
            <span className="vw-line">{w.line}</span>
            <span className="vr-small">{w.more}</span>
          </label>
        ))}
      </div>

      {way === 'pictures' && (
        <div className="vw-list" aria-label="Recordings to make pictures for">
          {!list && <p className="vr-note">Loading…</p>}
          {list && readings.length === 0 && list.takes.length === 0 && <p className="vr-note">No recording to choose yet.</p>}
          <ul className="vw-items">
            {readings.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{title(r.speechId)}</strong> · ready-made reading in {presetName(r.presetId)} <span className="vr-tag">AI</span>
                </span>{' '}
                <Link className="vr-btn vr-small-btn" href={`/storyboard/board/${r.id}`}>Make the pictures</Link>
              </li>
            ))}
            {list?.takes.map((t) => (
              <li key={t.draftId}>
                <span>
                  <strong>{t.title}</strong> · performed by {t.performer ? `@${t.performer}` : 'a reader'}{t.preset ? `, in ${t.preset}` : ''}
                </span>{' '}
                <Link className="vr-btn vr-small-btn" href={`/storyboard/board/${t.draftId}`}>Make the pictures</Link>
              </li>
            ))}
          </ul>
          {list && !list.publishing && <p className="vr-small">Published takes appear here once publishing opens.</p>}
        </div>
      )}

      {way === 'voice' && (
        <div className="vw-list" aria-label="Storyboards to put your voice over">
          {!list && <p className="vr-note">Loading…</p>}
          {list && list.boards.length === 0 && <p className="vr-note">No storyboard to choose yet.</p>}
          <ul className="vw-items">
            {list?.boards.map((b) => (
              <li key={keyOf(b)}>
                <label className="vw-pick">
                  <input
                    type="radio"
                    name="vw-board"
                    checked={pick === keyOf(b)}
                    onChange={() => {
                      setPick(keyOf(b));
                      localStorage.setItem(PICK, keyOf(b));
                      onSpeech(b.speechId);
                    }}
                  />
                  <span>
                    <strong>{b.title}</strong> · storyboard by {b.by ? `@${b.by}` : 'a reader'} · {b.shots} shots, {fmt(b.seconds)}
                    {b.kind === 'team' ? <> <span className="vr-tag">Team</span></> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {chosen && (
            <div className="vw-next">
              <p className="vr-small">Record this speech below and keep your take. Then fit the storyboard to it: each picture stays as it is; you make it shorter or longer to fit your voice.</p>
              {takes.map((d) => (
                <p key={d.id}>
                  <button type="button" className="vr-btn vr-small-btn" disabled={busy} onClick={() => void fit(d.id)}>
                    {busy ? 'Fitting…' : `Fit “${chosen.title}” to your take of ${new Date(d.madeAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
                  </button>
                </p>
              ))}
            </div>
          )}
          {list && !list.publishing && <p className="vr-small">Published storyboards appear here once publishing opens.</p>}
        </div>
      )}
      {message && <p className="vr-warn" role="alert">{message}</p>}
    </section>
  );
}
