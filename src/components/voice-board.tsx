'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import { ConsentScreen, PublishedTextField } from '~/components/publish-words';
import { useChallengeModel } from '~/components/challenge-model-row';
import { ModelRow } from '~/components/chapter-pictures';
import type { ModelRowEntry } from '~/lib/challenge/models';
import { boardNotes, shotAt, shotsFromCuts, snapToWordEnd, wordsIn, type Note, type Shot, type Timeline } from '~/lib/voice/board';
import { joinAudio } from '~/lib/voice/join-audio';
import '../styles/voice.css';

/**
 * /storyboard/board/<draft id>: Ephelion slice 2 (overnight 2026-11-21; DRAFT; admins only behind VOICE's switch).
 * The accepted take's word timings as a strip; cuts proposed at sentence ends (a rule, no AI model), moved, added or
 * removed by the person; one shot at a time: the person's own words for what it shows, a camera angle, the sheets;
 * a picture (a stand-in card tonight), retry, keep one, next; then the kept pictures played over the audio.
 * Nothing here writes a description or any story words (principle 2).
 */
interface Sheet { id: string; title: string; entity: string; text: string; thumb: string | null }
interface Data {
  draft: { id: string; preset: string | null; speech: { id: string; title: string } | null; audio: { n: number; role: string; sentence: number | null; replacesStart: number | null; replacesEnd: number | null }[]; timeline: Timeline };
  board: { version: number; cuts: number[]; shots: Shot[]; proposed: number[]; fromProposal: boolean };
  pictures: { shotKey: string; sha256: string; recipe: Record<string, unknown> }[];
  sheets: { styles: Sheet[]; characters: Sheet[] };
  angles: readonly { id: string; label: string }[];
  limits: { target: number; min: number; max: number; maxShots: number };
  making: { models: ModelRowEntry[]; defaultModel: string | null; real: boolean; standIn: boolean; limits: { maxShots: number; maxTriesPerShot: number }; tries: Record<string, number> };
}
type Wording = Parameters<typeof ConsentScreen>[0]['wording'];
interface Try { image: string; sha256: string; ticket: string; recipe: Record<string, unknown> }
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** A kept picture, fetched with the sign-in (an <img> can't send it). */
function KeptPicture({ draftId, shot, sha, alt }: { draftId: string; shot: string; sha: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void authFetch(`/api/voice/boards/picture?draft=${draftId}&shot=${shot}&sha=${sha}`).then(async (r) => {
      if (!r.ok || !alive) return;
      made = URL.createObjectURL(await r.blob());
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [draftId, shot, sha]);
  return url ? <img src={url} alt={alt} className="vb-picture" /> : <div className="vb-picture vb-empty">Loading the picture…</div>;
}

export function VoiceBoard({ fallback }: { fallback: React.ReactNode }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const params = useParams<{ draft: string }>();
  const draftId = String(params?.draft ?? '');
  const [data, setData] = useState<Data | null | 'none' | { error: string }>(null);
  const [cuts, setCuts] = useState<number[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [current, setCurrent] = useState(0);
  const [tries, setTries] = useState<Record<string, Try[]>>({});
  const [kept, setKept] = useState<{ shotKey: string; sha256: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<number>(0);
  const [dirty, setDirty] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const strip = useRef<HTMLDivElement | null>(null);
  const drag = useRef<number | null>(null);
  const [triesMade, setTriesMade] = useState<Record<string, number>>({});
  const [consent, setConsent] = useState<Wording | null>(null);
  const dataOk = data && data !== 'none' && !('error' in data) ? data : null;
  // The challenge's Model row: GPT Image 2.5 Sunburst first where OpenAI serves, FLUX and Gemini offered; a closed model's notice and the 18+ box.
  const m = useChallengeModel(dataOk?.making.models, null, dataOk?.making.defaultModel ?? null);

  const load = useCallback(async () => {
    const r = await authFetch(`/api/voice/boards?draft=${draftId}`, { cache: 'no-store' }).catch(() => null);
    if (!r) return setData('none');
    if (r.status === 404) return setData('none');
    const j = (await r.json()) as Data & { error?: string };
    if (!r.ok) return setData({ error: j.error ?? 'Not available' });
    setData(j);
    setCuts(j.board.cuts);
    setShots(j.board.shots);
    setKept(j.pictures.map((p) => ({ shotKey: p.shotKey, sha256: p.sha256 })));
    setSaved(j.board.version);
    setTriesMade(j.making.tries ?? {});
  }, [draftId]);
  useEffect(() => {
    if (admin && draftId) void load();
  }, [admin, draftId, load]);

  const d = dataOk;
  const t = d?.draft.timeline ?? null;

  // The audio for the play-through: the take with any redone sentences, joined in the browser.
  useEffect(() => {
    if (!d) return;
    let alive = true;
    void (async () => {
      const get = async (n: number) => {
        const r = await authFetch(`/api/voice/drafts/${d.draft.id}/${n}`);
        return r.ok ? r.blob() : null;
      };
      const main = await get(0);
      if (!main) return;
      const redos = [];
      for (const a of d.draft.audio.filter((x) => x.role === 'redo')) {
        const b = await get(a.n);
        if (b) redos.push({ blob: b, start: a.replacesStart ?? 0, end: a.replacesEnd ?? a.replacesStart ?? 0 });
      }
      const url = redos.length ? await joinAudio(main, redos).catch(() => URL.createObjectURL(main)) : URL.createObjectURL(main);
      if (alive) setAudioUrl(url);
    })();
    return () => {
      alive = false;
    };
  }, [d]);

  const notes: Note[] = useMemo(() => boardNotes(shots.map((s) => ({ ...s, kept: s.kept && kept.some((k) => k.shotKey === s.key && k.sha256 === s.kept) ? s.kept : null }))), [shots, kept]);

  if (!admin || data === 'none') return <>{fallback}</>;
  if (data && 'error' in data) return <main className="vr"><p className="vr-warn">{data.error}</p></main>;
  if (!d || !t) return <main className="vr"><p className="vr-note">Loading…</p></main>;

  const setAll = (c: number[], keep = shots) => {
    const next = shotsFromCuts(t, c, keep);
    setCuts([...c].sort((a, b) => a - b));
    setShots(next);
    setCurrent((i) => Math.min(i, next.length - 1));
    setDirty(true);
  };
  const xToTime = (clientX: number) => {
    const r = strip.current!.getBoundingClientRect();
    return Math.max(0, Math.min(t.seconds, ((clientX - r.left) / r.width) * t.seconds));
  };
  const onStripClick = (e: React.MouseEvent) => {
    if (drag.current !== null) return;
    const at = snapToWordEnd(t, xToTime(e.clientX));
    if (at <= 0.2 || at >= t.seconds - 0.2 || cuts.some((c) => Math.abs(c - at) < 0.3)) return;
    if (shots.length >= d!.making.limits.maxShots) return setMessage(`A storyboard has at most ${d!.making.limits.maxShots} shots: remove a cut first.`);
    setAll([...cuts, at]);
  };
  const startDrag = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = i;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent) => {
    if (drag.current === null) return;
    const i = drag.current;
    const at = snapToWordEnd(t, xToTime(e.clientX));
    const lo = i > 0 ? cuts[i - 1] + 0.3 : 0.3;
    const hi = i < cuts.length - 1 ? cuts[i + 1] - 0.3 : t.seconds - 0.3;
    if (at > lo && at < hi) setAll(cuts.map((c, k) => (k === i ? at : c)));
  };
  const endDrag = () => setTimeout(() => (drag.current = null), 0);

  const shot = shots[current];
  const edit = (patch: Partial<Shot>) => {
    setShots(shots.map((s, i) => (i === current ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  async function save(): Promise<boolean> {
    setBusy('save');
    setMessage(null);
    const r = await authFetch('/api/voice/boards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: d!.draft.id, cuts, shots }) });
    setBusy(null);
    const j = (await r.json().catch(() => ({}))) as { version?: number; shots?: Shot[]; error?: string };
    if (r.ok && j.version) {
      setSaved(j.version);
      if (j.shots) setShots(j.shots);
      setDirty(false);
      return true;
    }
    setMessage(j.error ?? 'It could not be saved');
    return false;
  }
  async function makePicture() {
    if (!shot) return;
    // A picture is made only for a shot on the saved storyboard: save first if anything changed.
    if (dirty && !(await save())) return;
    setBusy('picture');
    setMessage(null);
    const r = await authFetch('/api/voice/boards/picture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId: d!.draft.id, shotKey: shot.key, description: shot.description, angle: shot.angle, styleId: shot.styleId, characterIds: shot.characterIds, ...m.body() }),
    });
    setBusy(null);
    const j = (await r.json().catch(() => ({}))) as Try & { error?: string; reason?: string; triesLeft?: number };
    if (r.ok) {
      setTries({ ...tries, [shot.key]: [...(tries[shot.key] ?? []), j] });
      setTriesMade({ ...triesMade, [shot.key]: (triesMade[shot.key] ?? 0) + 1 });
    } else if (r.status === 403 && j.reason === 'consent') {
      const c = await authFetch('/api/consent').catch(() => null);
      if (c?.ok) setConsent(((await c.json()) as { wording: Wording }).wording);
    } else setMessage(j.error ?? 'The picture could not be made');
  }
  async function agreeConsent() {
    const r = await authFetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: consent?.sha256 }) });
    if (r.ok) {
      setConsent(null);
      void makePicture();
    } else setMessage('Your agreement could not be recorded. Try again.');
  }
  const pictureNow = () => {
    // A closed model's notice (and the 18+ box) comes first; the picture is made once it is answered.
    if (m.askFirst(() => void makePicture())) return;
    void makePicture();
  };
  async function keep(tr: Try) {
    setBusy('keep');
    const r = await authFetch('/api/voice/boards/keep', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: tr.ticket, image: tr.image }) });
    setBusy(null);
    if (r.ok) {
      setKept([...kept, { shotKey: shot.key, sha256: tr.sha256 }]);
      edit({ kept: tr.sha256 });
    } else setMessage(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'It could not be kept');
  }

  const playing = audioUrl ? shotAt(shots, now) : null;
  const playingNo = playing ? shots.indexOf(playing) + 1 : 0;
  const styleOf = (id: string | null) => d.sheets.styles.find((s) => s.id === id) ?? null;

  return (
    <main className="vr vb">
      <p className="vr-kicker">Admin trial · Draft · Storyboard</p>
      <h1>{d.draft.speech?.title ?? 'Storyboard'}</h1>
      <p className="vr-labels">
        Your performance in {d.draft.preset ?? 'a preset voice'} · {fmt(t.seconds)} ·{' '}
        {d.making.standIn ? (
          <><span className="vr-tag">Stand-in</span> pictures are placeholder cards on this copy: no model, no cost ·{' '}</>
        ) : !d.making.real ? (
          <>Pictures aren&rsquo;t switched on yet ·{' '}</>
        ) : null}
        <Link href="/storyboard/record">Back to recording</Link>
      </p>
      {message && <p className="vr-warn" role="alert">{message}</p>}

      <section className="vr-card" aria-labelledby="vb-strip-h">
        <h2 id="vb-strip-h">1. Cuts</h2>
        <p className="vr-note">
          The speech&rsquo;s sentences, in time. <span className="vr-tag">Automatic</span> Cuts were first placed at sentence ends about every {d.limits.target} seconds, by a rule (no AI model). Drag a cut to move it, tap the strip to add one at the nearest word&rsquo;s end, or tap × to remove it.
        </p>
        <div className="vb-strip-wrap">
          <div className="vb-strip" ref={strip} onClick={onStripClick} onPointerMove={onDrag} onPointerUp={endDrag} role="group" aria-label="Timeline">
            {t.sentences.map((s) => (
              <span key={s.n} className={`vb-sentence${s.n % 2 ? ' vb-alt' : ''}`} style={{ left: `${(s.start / t.seconds) * 100}%`, width: `${((s.end - s.start) / t.seconds) * 100}%` }} title={`Sentence ${s.n + 1}`} />
            ))}
            {shots.map((s, i) => (
              <button
                key={s.key}
                type="button"
                className={`vb-shotband${i === current ? ' vb-on' : ''}${s.kept ? ' vb-has' : ''}`}
                style={{ left: `${(s.start / t.seconds) * 100}%`, width: `${((s.end - s.start) / t.seconds) * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrent(i);
                }}
                aria-label={`Shot ${i + 1}, ${fmt(s.start)} to ${fmt(s.end)}`}
              >
                {i + 1}
              </button>
            ))}
            {cuts.map((c, i) => (
              <span key={`${i}-${c}`} className="vb-cut" style={{ left: `${(c / t.seconds) * 100}%` }} onPointerDown={startDrag(i)} onClick={(e) => e.stopPropagation()}>
                <button type="button" className="vb-cut-x" aria-label={`Remove the cut at ${fmt(c)}`} onClick={(e) => { e.stopPropagation(); setAll(cuts.filter((_, k) => k !== i)); }}>
                  ×
                </button>
              </span>
            ))}
            {audioUrl && <span className="vb-playhead" style={{ left: `${(now / t.seconds) * 100}%` }} />}
          </div>
          <div className="vb-ruler" aria-hidden>
            {Array.from({ length: Math.floor(t.seconds / 15) + 1 }, (_, i) => (
              <span key={i} style={{ left: `${((i * 15) / t.seconds) * 100}%` }}>{fmt(i * 15).replace(/\.\d$/, '')}</span>
            ))}
          </div>
        </div>
        <div className="vr-row">
          <button type="button" className="vr-btn vr-quiet vr-small-btn" onClick={() => setAll(d.board.proposed, [])}>Use the automatic cuts again</button>
          <button type="button" className="vr-btn vr-small-btn" onClick={save} disabled={busy !== null || !dirty}>{busy === 'save' ? 'Saving…' : dirty ? 'Save' : saved ? `Saved (version ${saved})` : 'Saved'}</button>
          <span className="vr-small">{shots.length} of at most {d.making.limits.maxShots} shots</span>
        </div>
      </section>

      {notes.length > 0 && (
        <section className="vr-card" aria-labelledby="vb-notes-h">
          <h2 id="vb-notes-h">Notes</h2>
          <p className="vr-note"><span className="vr-tag">Automatic</span> Checks by rule (no AI model). They never say what a shot should show.</p>
          <ul className="vb-notes">
            {notes.slice(0, 8).map((n, i) => (
              <li key={i}>
                {n.shot ? <button type="button" className="vb-link" onClick={() => setCurrent(shots.findIndex((s) => s.key === n.shot))}>{n.text}</button> : n.text}
              </li>
            ))}
            {notes.length > 8 && <li className="vr-small">And {notes.length - 8} more.</li>}
          </ul>
        </section>
      )}

      {shot && (
        <section className="vr-card" aria-labelledby="vb-shot-h">
          <div className="vb-shot-head">
            <h2 id="vb-shot-h">2. Shot {current + 1} of {shots.length}</h2>
            <span className="vr-small">{fmt(shot.start)} – {fmt(shot.end)} · {(shot.end - shot.start).toFixed(1)} s</span>
          </div>
          <blockquote className="vb-words"><span className="vr-tag">Book</span> {wordsIn(t, shot)}</blockquote>
          <PublishedTextField id={`vb-desc-${shot.key}`} label="What the shot shows (your words)" value={shot.description} onChange={(v) => edit({ description: v })} rows={3} maxLength={600} />
          <fieldset className="vb-angles">
            <legend>Camera</legend>
            {d.angles.map((a) => (
              <label key={a.id} className={`vb-chip${shot.angle === a.id ? ' vb-on' : ''}`}>
                <input type="radio" name={`angle-${shot.key}`} checked={shot.angle === a.id} onChange={() => edit({ angle: a.id as Shot['angle'] })} />
                {a.label}
              </label>
            ))}
          </fieldset>
          <div className="vb-sheets">
            <label>
              <span className="vb-label">Style (a published sheet)</span>
              <select value={shot.styleId ?? ''} onChange={(e) => edit({ styleId: e.target.value || null })}>
                <option value="">None</option>
                {d.sheets.styles.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend className="vb-label">Characters (published sheets)</legend>
              {d.sheets.characters.length === 0 && <span className="vr-small">No character sheets published yet.</span>}
              {d.sheets.characters.map((c) => (
                <label key={c.id} className={`vb-chip${shot.characterIds.includes(c.id) ? ' vb-on' : ''}`}>
                  <input type="checkbox" checked={shot.characterIds.includes(c.id)} onChange={(e) => edit({ characterIds: e.target.checked ? [...shot.characterIds, c.id] : shot.characterIds.filter((x) => x !== c.id) })} />
                  {c.title}
                </label>
              ))}
            </fieldset>
          </div>
          {styleOf(shot.styleId) && <p className="vr-small">Style text, as sent: {styleOf(shot.styleId)!.text}</p>}
          <ModelRow m={m} name={`model-${shot.key}`} />
          <div className="vr-row">
            <button
              type="button"
              className="vr-btn"
              onClick={pictureNow}
              disabled={busy !== null || !shot.description.trim() || !shot.angle || (triesMade[shot.key] ?? 0) >= d.making.limits.maxTriesPerShot || (!d.making.real && !d.making.standIn)}
            >
              {busy === 'picture' ? 'Making…' : (triesMade[shot.key] ?? 0) ? 'Try again' : 'Make the picture'}
            </button>
            <span className="vr-small">
              {Math.min(triesMade[shot.key] ?? 0, d.making.limits.maxTriesPerShot)} of {d.making.limits.maxTriesPerShot} pictures for this shot
              {d.making.standIn && <> · <span className="vr-tag">Stand-in</span> a placeholder card, free</>}
            </span>
          </div>
          {(tries[shot.key]?.length ?? 0) > 0 && (
            <div className="vb-tries">
              {tries[shot.key].map((tr, i) => (
                <figure key={tr.sha256} className={`vb-try${shot.kept === tr.sha256 ? ' vb-on' : ''}`}>
                  <img src={tr.image} alt={`Try ${i + 1} for shot ${current + 1}`} />
                  <figcaption>
                    Try {i + 1}
                    {shot.kept === tr.sha256 ? (
                      <span className="vr-ok"> · Kept</span>
                    ) : (
                      <button type="button" className="vr-btn vr-quiet vr-small-btn" onClick={() => keep(tr)} disabled={busy !== null}>Keep this one</button>
                    )}
                    <details>
                      <summary>Recipe</summary>
                      <pre>{JSON.stringify(tr.recipe, null, 2)}</pre>
                    </details>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {shot.kept && !(tries[shot.key] ?? []).some((tr) => tr.sha256 === shot.kept) && <KeptPicture draftId={d.draft.id} shot={shot.key} sha={shot.kept} alt={`The picture kept for shot ${current + 1}`} />}
          <div className="vr-row">
            <button type="button" className="vr-btn vr-quiet" onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0}>Previous shot</button>
            <button type="button" className="vr-btn vr-quiet" onClick={() => setCurrent(Math.min(shots.length - 1, current + 1))} disabled={current === shots.length - 1}>Next shot</button>
          </div>
        </section>
      )}

      {consent && <ConsentScreen wording={consent} name={auth.kind === 'signed-in' ? (auth.username ?? null) : null} onAgree={agreeConsent} onCancel={() => setConsent(null)} error={null} />}

      <section className="vr-card" aria-labelledby="vb-play-h">
        <h2 id="vb-play-h">3. Play it through</h2>
        <p className="vr-note">The kept pictures over your performance. A shot with no picture shows its words.</p>
        <div className="vb-screen">
          {playing?.kept ? (
            <KeptPicture key={`${playing.key}-${playing.kept}`} draftId={d.draft.id} shot={playing.key} sha={playing.kept} alt={`Shot ${playingNo}`} />
          ) : (
            <div className="vb-picture vb-empty">{playing ? `Shot ${playingNo}: no picture kept yet. ${wordsIn(t, playing)}` : 'Press play.'}</div>
          )}
          {playing && <span className="vb-shotno">Shot {playingNo}</span>}
        </div>
        {audioUrl ? <audio controls src={audioUrl} className="vr-audio" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} /> : <p className="vr-small">Loading the audio…</p>}
      </section>
    </main>
  );
}
