'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { authFetch, useAuth, webNameProof } from '~/lib/client-auth';
import { ConsentScreen, PublishedTextField } from '~/components/publish-words';
import { useChallengeModel } from '~/components/challenge-model-row';
import type { ModelRowEntry } from '~/lib/challenge/models';
import { boardNotes, cutNear, pictureBlocked, sentenceAt, sentenceBoundaries, sentencesIn, shotAt, shotsFromCuts, snapToWordEnd, type Note, type Shot, type Timeline } from '~/lib/voice/board';
import { joinAudio } from '~/lib/voice/join-audio';
import { CLOSING, emptyClosing, type Closing, type CreditLine } from '~/lib/voice/closing';
import { saveVideo, videoType } from '~/lib/voice/video';
import '../styles/voice.css';

/**
 * /storyboard/board/<draft id>: Ephelion slice 2 (overnight 2026-11-21; DRAFT; admins only behind VOICE's switch).
 * The accepted take's word timings as a strip; cuts proposed at sentence ends (a rule, no AI model), moved, added or
 * removed by the person; one shot at a time: the person's own words for what it shows, a camera angle, the sheets;
 * a picture (a stand-in card tonight), retry, keep one, next; then the kept pictures played over the audio.
 * Nothing here writes a description or any story words (principle 2).
 */
interface Sheet { id: string; title: string; entity: string; text: string; thumb: string | null; samples?: string[] }
interface Data {
  draft: { id: string; kind: 'performance' | 'reading'; preset: string | null; speech: { id: string; title: string; label?: { text: string } } | null; sentences: { n: number; text: string }[]; audio: { n: number; role: string; sentence: number | null; replacesStart: number | null; replacesEnd: number | null }[]; timeline: Timeline };
  board: { version: number; cuts: number[]; shots: Shot[]; closing: Closing; proposed: number[]; fromProposal: boolean };
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
  // Who may use it is the server's to say (src/lib/voice/flag.ts): its routes answer 404 to anyone the switch doesn't
  // let in, and the page then shows the site's usual not-found. So no admin list is checked here (P5b).
  const admin = auth.kind === 'signed-in';
  const params = useParams<{ draft: string }>();
  const draftId = String(params?.draft ?? '');
  const [data, setData] = useState<Data | null | 'none' | { error: string }>(null);
  // A ready-made reading with no word timings yet: what one transcription of it is estimated at (2026-11-21).
  const [needsTiming, setNeedsTiming] = useState<{ estimateCredits: number; seconds: number } | null>(null);
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
  // Slice 4: the closing card's choices, the publish check, the published link, the video.
  const [closing, setClosing] = useState<Closing>(emptyClosing());
  const [named, setNamed] = useState(true);
  const [card, setCard] = useState<string | null>(null);
  const [cardTick, setCardTick] = useState(0);
  const [check, setCheck] = useState<{ on: boolean; problems: string[]; credits: CreditLine[]; version: number } | null>(null);
  const [published, setPublished] = useState<{ id: string; url: string } | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const stopVideo = useRef<AbortController | null>(null);
  const target = useRef<'shot' | 'closing'>('shot');
  // The storyboard's settings, chosen once and used for every picture (Nate, 2026-11-21): a style and Ephelion's look.
  const [settings, setSettings] = useState<{ styleId: string | null; lookId: string | null }>({ styleId: null, lookId: null });
  const dataOk = data && data !== 'none' && !('error' in data) ? data : null;
  // The challenge's Model row: GPT Image 2.5 Sunburst first where OpenAI serves, FLUX and Gemini offered; a closed model's notice and the 18+ box.
  const m = useChallengeModel(dataOk?.making.models, null, dataOk?.making.defaultModel ?? null);

  const load = useCallback(async () => {
    const r = await authFetch(`/api/voice/boards?draft=${draftId}`, { cache: 'no-store' }).catch(() => null);
    if (!r) return setData('none');
    if (r.status === 404) {
      // A published storyboard isn't a draft any more: say where it is, and offer the take-down.
      const pr = await authFetch(`/api/voice/publish?draft=${draftId}`, { cache: 'no-store' }).catch(() => null);
      const pj = pr?.ok ? ((await pr.json()) as { published?: { id: string; url: string } }) : null;
      if (pj?.published) return setPublished(pj.published), setData({ error: 'published' });
      return setData('none');
    }
    const j = (await r.json()) as Data & { error?: string; reason?: string; estimateCredits?: number; seconds?: number };
    if (r.status === 409 && j.reason === 'needs-timing') return setNeedsTiming({ estimateCredits: j.estimateCredits ?? 0, seconds: j.seconds ?? 0 }), setData({ error: 'needs-timing' });
    if (!r.ok) return setData({ error: j.error ?? 'Not available' });
    setNeedsTiming(null);
    setData(j);
    setCuts(j.board.cuts);
    // Every shot starts on Medium shot (Nate, 2026-11-21), boards saved before then included.
    setShots(j.board.shots.map((x) => (x.angle ? x : { ...x, angle: 'medium' as const })));
    setSettings({ styleId: j.board.shots[0]?.styleId ?? null, lookId: j.board.shots[0]?.characterIds[0] ?? null });
    setClosing(j.board.closing ?? emptyClosing());
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

  // The publish check and the closing card's preview follow the saved board (and the "name me" choice).
  useEffect(() => {
    if (!dataOk || dirty) return;
    let alive = true;
    const headers: Record<string, string> = {};
    const proof = webNameProof();
    if (proof) headers['x-name-proof'] = proof;
    const q = `draft=${dataOk.draft.id}${named ? '' : '&named=no'}`;
    void authFetch(`/api/voice/publish?${q}`, { cache: 'no-store', headers }).then(async (r) => {
      if (alive && r.ok) setCheck(await r.json());
    });
    let made: string | null = null;
    void authFetch(`/api/voice/boards/closing?${q}`, { cache: 'no-store', headers }).then(async (r) => {
      if (!alive || !r.ok) return;
      made = URL.createObjectURL(await r.blob());
      setCard(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [dataOk, dirty, named, saved, cardTick]);

  if (published)
    return (
      <main className="vr vb">
        <p className="vr-kicker">Admin trial · Storyboard</p>
        <h1>Published</h1>
        <p className="vr-note">This storyboard is public at <Link href={published.url}>{published.url}</Link>. Taking it down deletes its public files and makes it your draft again.</p>
        {message && <p className="vr-warn" role="alert">{message}</p>}
        <button
          type="button"
          className="vr-btn vr-quiet"
          onClick={async () => {
            const r = await authFetch(`/api/voice/publish/${published.id}`, { method: 'DELETE' });
            if (r.ok) {
              setPublished(null);
              setData(null);
              void load();
            } else setMessage('It could not be taken down. Try again.');
          }}
        >
          Take it down
        </button>
      </main>
    );
  if (!admin || data === 'none') return <>{fallback}</>;
  if (needsTiming)
    return (
      <main className="vr vb">
        <p className="vr-kicker">Admin trial · Draft · Storyboard</p>
        <h1>Time this reading first</h1>
        <p className="vr-note">
          This ready-made reading has no word timings yet, so its sentences can&rsquo;t be placed on a strip. One transcription of it ({needsTiming.seconds.toFixed(0)} s, about {needsTiming.estimateCredits} credits) times it once, for everyone who storyboards it. The transcript is deleted at ElevenLabs right after.
        </p>
        {message && <p className="vr-warn" role="alert">{message}</p>}
        <button
          type="button"
          className="vr-btn"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('timing');
            setMessage(null);
            const r = await authFetch(`/api/voice/readings/${draftId}/timing`, { method: 'POST' }).catch(() => null);
            setBusy(null);
            if (r?.ok) {
              setNeedsTiming(null);
              setData(null);
              void load();
            } else setMessage(((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? 'The timing failed. Try again.');
          }}
        >
          {busy === 'timing' ? 'Timing…' : 'Time this reading'}
        </button>
      </main>
    );
  if (data && 'error' in data) return <main className="vr"><p className="vr-warn">{data.error}</p></main>;
  if (!d || !t) return <main className="vr"><p className="vr-note">Loading…</p></main>;

  const apply = (list: Shot[], st = settings) => list.map((x) => ({ ...x, styleId: st.styleId, characterIds: st.lookId ? [st.lookId] : [] }));
  const choose = (patch: Partial<typeof settings>) => {
    const st = { ...settings, ...patch };
    setSettings(st);
    setShots(apply(shots, st));
    setDirty(true);
  };
  const setAll = (c: number[], keep = shots) => {
    const next = apply(shotsFromCuts(t, c, keep));
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
    const r = await authFetch('/api/voice/boards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: d!.draft.id, cuts, shots, closing }) });
    setBusy(null);
    const j = (await r.json().catch(() => ({}))) as { version?: number; shots?: Shot[]; closing?: Closing; error?: string };
    if (r.ok && j.version) {
      setSaved(j.version);
      if (j.shots) setShots(j.shots);
      if (j.closing) setClosing(j.closing);
      setDirty(false);
      return true;
    }
    setMessage(j.error ?? 'It could not be saved');
    return false;
  }
  async function makePicture() {
    const forClosing = target.current === 'closing';
    if (!forClosing && !shot) return;
    // A picture is made only for a shot on the saved storyboard: save first if anything changed.
    if (dirty && !(await save())) return;
    setBusy(forClosing ? 'closing' : 'picture');
    setMessage(null);
    const what = forClosing
      ? { shotKey: CLOSING.key, description: closing.description, styleId: closing.styleId }
      : { shotKey: shot.key, description: shot.description, angle: shot.angle, styleId: settings.styleId, characterIds: settings.lookId ? [settings.lookId] : [] };
    const r = await authFetch('/api/voice/boards/picture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId: d!.draft.id, ...what, ...m.body() }),
    });
    setBusy(null);
    const j = (await r.json().catch(() => ({}))) as Try & { error?: string; reason?: string; triesLeft?: number };
    if (r.ok) {
      setTries({ ...tries, [what.shotKey]: [...(tries[what.shotKey] ?? []), j] });
      setTriesMade({ ...triesMade, [what.shotKey]: (triesMade[what.shotKey] ?? 0) + 1 });
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
  const pictureNow = (which: 'shot' | 'closing' = 'shot') => {
    target.current = which;
    // A closed model's notice (and the 18+ box) comes first; the picture is made once it is answered.
    if (m.askFirst(() => void makePicture())) return;
    void makePicture();
  };
  async function keep(tr: Try, forClosing = false) {
    setBusy('keep');
    const r = await authFetch('/api/voice/boards/keep', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: tr.ticket, image: tr.image }) });
    setBusy(null);
    if (r.ok) {
      setKept([...kept, { shotKey: forClosing ? CLOSING.key : shot.key, sha256: tr.sha256 }]);
      if (forClosing) {
        setClosing({ ...closing, kept: tr.sha256 });
        setDirty(true);
      } else edit({ kept: tr.sha256 });
    } else setMessage(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'It could not be kept');
  }

  async function saveAsVideo() {
    if (!audioUrl || !card) return;
    setMessage(null);
    stopVideo.current = new AbortController();
    setSaving(0);
    const urls: string[] = [];
    try {
      // The kept pictures, fetched with the sign-in, as this device's own copies.
      const images = await Promise.all(
        shots.map(async (s) => {
          if (!s.kept) return null;
          const r = await authFetch(`/api/voice/boards/picture?draft=${d!.draft.id}&shot=${s.key}&sha=${s.kept}`);
          if (!r.ok) return null;
          const u = URL.createObjectURL(await r.blob());
          urls.push(u);
          return u;
        }),
      );
      const standIn = d!.making.standIn || !d!.making.real;
      const out = await saveVideo({
        audio: audioUrl,
        seconds: t!.seconds,
        shots: shots.map((s, i) => ({ start: s.start, end: s.end, image: images[i], words: sentencesIn(t!, s).map(sentenceText).join(' ') })),
        closing: card,
        closingSeconds: CLOSING.seconds,
        label: `snowmoon.party · ${standIn ? 'stand-in cards' : 'AI pictures'} · AI voice conversion · draft`,
        onProgress: setSaving,
        signal: stopVideo.current.signal,
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(out.blob);
      a.download = `snowmoon-storyboard-draft-${d!.draft.id.slice(0, 8)}.${out.ext}`;
      a.click();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The video could not be made.');
    } finally {
      urls.forEach((u) => URL.revokeObjectURL(u));
      setSaving(null);
      stopVideo.current = null;
    }
  }
  async function publish() {
    if (!check) return;
    setBusy('publish');
    setMessage(null);
    const r = await authFetch('/api/voice/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: d!.draft.id, version: check.version, named, nameProof: webNameProof() }) });
    setBusy(null);
    const j = (await r.json().catch(() => ({}))) as { id?: string; url?: string; error?: string; problems?: string[] };
    if (r.ok && j.id && j.url) setPublished({ id: j.id, url: j.url });
    else setMessage([j.error ?? 'It could not be published', ...(j.problems ?? [])].join(' '));
  }

  const playing = audioUrl ? shotAt(shots, now) : null;
  const playingNo = playing ? shots.indexOf(playing) + 1 : 0;
  const styleOf = (id: string | null) => d.sheets.styles.find((s) => s.id === id) ?? null;
  // The speech's own words (never the transcription's), by sentence.
  const sentenceText = (n: number | null) => (n === null ? '' : (d.draft.sentences.find((x) => x.n === n)?.text ?? ''));
  const boundaries = sentenceBoundaries(t);
  // Ephelion's look: his published sheets (Nate, 2026-11-21: "one published Ephelion picture or sheet").
  const looks = d.sheets.characters.filter((c) => /ephelion/i.test(`${c.title} ${c.entity}`));
  const blocked = shot ? pictureBlocked({ real: d.making.real, standIn: d.making.standIn, description: shot.description, angle: shot.angle, tries: triesMade[shot.key] ?? 0, maxTries: d.making.limits.maxTriesPerShot }) : null;

  return (
    <main className="vr vb">
      <p className="vr-kicker">Admin trial · Draft · Storyboard</p>
      <h1>{d.draft.speech?.title ?? 'Storyboard'}</h1>
      <p className="vr-labels">
        {d.draft.kind === 'reading' ? <>The ready-made reading in {d.draft.preset ?? 'a preset voice'} (ElevenLabs, no performer)</> : <>Your performance in {d.draft.preset ?? 'a preset voice'}</>} · {fmt(t.seconds)} ·{' '}
        {d.making.standIn ? (
          <><span className="vr-tag">Stand-in</span> pictures are placeholder cards on this copy: no model, no cost ·{' '}</>
        ) : !d.making.real ? (
          <>Pictures aren&rsquo;t switched on yet ·{' '}</>
        ) : null}
        <Link href="/storyboard/record">Back to recording</Link>
      </p>
      {message && <p className="vr-warn" role="alert">{message}</p>}

      <section className="vr-card" aria-labelledby="vb-set-h">
        <h2 id="vb-set-h">Settings for every picture</h2>
        {/* Each style with its published samples, as the look cards (Nate, 2026-11-22). The row scrolls inside itself. */}
        <fieldset className="vb-looks vb-styles">
          <legend className="vb-label">Style</legend>
          <div className="vb-look-row">
            <button type="button" className={`vb-look${settings.styleId === null ? ' vb-on' : ''}`} aria-pressed={settings.styleId === null} onClick={() => choose({ styleId: null })}>
              <span className="vb-look-none">None</span>
            </button>
            {d.sheets.styles.map((x) => (
              <button key={x.id} type="button" className={`vb-look vb-style${settings.styleId === x.id ? ' vb-on' : ''}`} aria-pressed={settings.styleId === x.id} onClick={() => choose({ styleId: x.id })}>
                {x.samples?.length ? (
                  <span className="vb-samples">
                    {x.samples.map((u) => <img key={u} src={u} alt="" />)}
                  </span>
                ) : (
                  <span className="vb-look-none">No samples</span>
                )}
                <span className="vr-small">{x.title}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {styleOf(settings.styleId) && <p className="vr-small">Style text, as sent: {styleOf(settings.styleId)!.text}</p>}
        <fieldset className="vb-looks">
          <legend className="vb-label">Ephelion&rsquo;s look</legend>
          {looks.length === 0 ? (
            <p className="vr-small">No published Ephelion picture or sheet yet.</p>
          ) : (
            <div className="vb-look-row">
              <button type="button" className={`vb-look${settings.lookId === null ? ' vb-on' : ''}`} aria-pressed={settings.lookId === null} onClick={() => choose({ lookId: null })}>
                <span className="vb-look-none">None</span>
              </button>
              {looks.map((c, i) => (
                <button key={c.id} type="button" className={`vb-look${settings.lookId === c.id ? ' vb-on' : ''}`} aria-pressed={settings.lookId === c.id} onClick={() => choose({ lookId: c.id })}>
                  {c.thumb ? <img src={c.thumb} alt="" /> : <span className="vb-look-none">No picture</span>}
                  <span className="vr-small">{c.title}{looks.length > 1 ? ` (${i + 1})` : ''}</span>
                </button>
              ))}
            </div>
          )}
        </fieldset>
        <label className="vb-field">
          <span className="vb-label">Model</span>
          <select value={m.chosen?.id ?? ''} onChange={(e) => { const x = m.list?.find((y) => y.id === e.target.value); if (x) m.pick(x); }} disabled={!m.list?.length}>
            {(m.list ?? []).map((x) => (
              <option key={x.id} value={x.id}>{x.label} · {x.maker} · {x.open ? 'open' : 'closed'}</option>
            ))}
          </select>
        </label>
        {m.chosen && m.meta(m.chosen) && <p className="vr-small">{m.meta(m.chosen)}</p>}
        {m.notice}
      </section>

      <section className="vr-card" aria-labelledby="vb-strip-h">
        <h2 id="vb-strip-h">1. Cuts</h2>
        <p className="vr-note">
          The speech&rsquo;s sentences, in time. <span className="vr-tag">Automatic</span> Cuts were first placed at sentence ends about every {d.limits.target} seconds, by a rule (no AI model). Turn &ldquo;New shot starts here&rdquo; on or off between any two sentences, up to {d.making.limits.maxShots} shots. On a wide screen you can also drag a cut on the strip, tap the strip to add one at the nearest word&rsquo;s end, or tap × to remove it.
        </p>
        <ol className="vb-cutlist" aria-label="The speech's sentences, and where each shot starts">
          {t.sentences.map((x, i) => {
            const b = boundaries[i];
            const cut = b ? cutNear(cuts, b.at) : null;
            const startsShot = i === 0 || (boundaries[i - 1] && cutNear(cuts, boundaries[i - 1].at) !== null);
            // Counted from the toggles themselves, so the label always agrees with what is ticked.
            const shotNo = 1 + boundaries.slice(0, i).filter((bb) => cutNear(cuts, bb.at) !== null).length;
            return (
              <li key={x.n}>
                {startsShot && shotNo > 0 && <span className="vb-cutlist-shot">Shot {shotNo}</span>}
                <span className="vb-cutlist-text">{sentenceText(x.n)}</span>
                {b && (
                  <label className="vb-toggle">
                    <input type="checkbox" checked={cut !== null} disabled={cut === null && shots.length >= d.making.limits.maxShots} onChange={() => setAll(cut !== null ? cuts.filter((c) => c !== cut) : [...cuts, b.at])} />
                    New shot starts here
                  </label>
                )}
              </li>
            );
          })}
        </ol>
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
          <blockquote className="vb-words"><span className="vr-tag">{d.draft.speech?.label?.text ?? 'Book'}</span> {sentencesIn(t, shot).map(sentenceText).join(' ')}</blockquote>
          <PublishedTextField id={`vb-desc-${shot.key}`} label="What the shot shows (your words)" value={shot.description} onChange={(v) => edit({ description: v })} rows={3} maxLength={600} />
          <label className="vb-field">
            <span className="vb-label">Camera</span>
            <select value={shot.angle} onChange={(e) => edit({ angle: e.target.value as Shot['angle'] })}>
              {d.angles.map((x) => (
                <option key={x.id} value={x.id}>{x.label}</option>
              ))}
            </select>
          </label>
          <div className="vr-row">
            <button
              type="button"
              className="vr-btn"
              onClick={() => pictureNow('shot')}
              disabled={busy !== null || blocked !== null}
            >
              {busy === 'picture' ? 'Making…' : (triesMade[shot.key] ?? 0) ? 'Try again' : 'Make the picture'}
            </button>
            <span className="vr-small">
              {Math.min(triesMade[shot.key] ?? 0, d.making.limits.maxTriesPerShot)} of {d.making.limits.maxTriesPerShot} pictures for this shot
              {d.making.standIn && <> · <span className="vr-tag">Stand-in</span> a placeholder card, free</>}
            </span>
          </div>
          {blocked && <p className="vr-small vb-why">{blocked}</p>}
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
        <p className="vr-note">The kept pictures over your performance, with the speech&rsquo;s own words as they are spoken.</p>
        <p className="vb-playing" aria-live="polite">{playing ? `Shot ${playingNo}` : '\u00a0'}</p>
        <div className="vb-screen">
          {playing?.kept ? (
            <KeptPicture key={`${playing.key}-${playing.kept}`} draftId={d.draft.id} shot={playing.key} sha={playing.kept} alt={`Shot ${playingNo}`} />
          ) : (
            <div className="vb-picture vb-empty">{playing ? `Shot ${playingNo}: no picture kept yet.` : 'Press play.'}</div>
          )}
        </div>
        <p className="vb-caption"><span className="vr-tag">{d.draft.speech?.label?.text ?? 'Book'}</span> {audioUrl && now > 0 ? sentenceText(sentenceAt(t, now)) : sentenceText(t.sentences[0]?.n ?? null)}</p>
        {audioUrl ? <audio controls src={audioUrl} className="vr-audio" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} /> : <p className="vr-small">Loading the audio…</p>}
        <div className="vr-row">
          {saving === null ? (
            <button type="button" className="vr-btn vr-quiet" onClick={saveAsVideo} disabled={!audioUrl || !card || busy !== null || !videoType()}>Save as a video</button>
          ) : (
            <>
              <span className="vr-small" role="status">Making the video on this device… {Math.round(saving * 100)}%</span>
              <button type="button" className="vr-btn vr-quiet vr-small-btn" onClick={() => stopVideo.current?.abort()}>Cancel</button>
            </>
          )}
        </div>
        <p className="vr-small">The kept pictures held for each shot over your performance, then the closing card: stitched in this browser in real time and saved on this device, labelled a draft. No AI video, nothing uploaded.</p>
      </section>

      <section className="vr-card" aria-labelledby="vb-closing-h">
        <h2 id="vb-closing-h">4. Closing card</h2>
        <p className="vr-note">
          <span className="vr-tag">Set by the site</span> The card&rsquo;s words are fixed: who did what (people and AI apart), the snowmoon.party mark and that this edition isn&rsquo;t affiliated with the author. Only its look is yours: describe the picture behind the words.
        </p>
        <PublishedTextField id="vb-closing-desc" label="The picture behind the closing card (your words)" value={closing.description} onChange={(v) => { setClosing({ ...closing, description: v }); setDirty(true); }} rows={2} maxLength={600} />
        <label className="vb-sheets">
          <span className="vb-label">Style (a published sheet)</span>
          <select value={closing.styleId ?? ''} onChange={(e) => { setClosing({ ...closing, styleId: e.target.value || null }); setDirty(true); }}>
            <option value="">None</option>
            {d.sheets.styles.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </label>
        <div className="vr-row">
          <button
            type="button"
            className="vr-btn"
            onClick={() => pictureNow('closing')}
            disabled={busy !== null || !closing.description.trim() || (triesMade[CLOSING.key] ?? 0) >= d.making.limits.maxTriesPerShot || (!d.making.real && !d.making.standIn)}
          >
            {busy === 'closing' ? 'Making…' : (triesMade[CLOSING.key] ?? 0) ? 'Try again' : 'Make the background'}
          </button>
          <span className="vr-small">
            {Math.min(triesMade[CLOSING.key] ?? 0, d.making.limits.maxTriesPerShot)} of {d.making.limits.maxTriesPerShot} backgrounds
            {d.making.standIn && <> · <span className="vr-tag">Stand-in</span> a placeholder card, free</>}
          </span>
        </div>
        {(tries[CLOSING.key]?.length ?? 0) > 0 && (
          <div className="vb-tries">
            {tries[CLOSING.key].map((tr, i) => (
              <figure key={tr.sha256} className={`vb-try${closing.kept === tr.sha256 ? ' vb-on' : ''}`}>
                <img src={tr.image} alt={`Background try ${i + 1}`} />
                <figcaption>
                  Try {i + 1}
                  {closing.kept === tr.sha256 ? <span className="vr-ok"> · Kept</span> : <button type="button" className="vr-btn vr-quiet vr-small-btn" onClick={() => keep(tr, true)} disabled={busy !== null}>Keep this one</button>}
                  <details>
                    <summary>Recipe</summary>
                    <pre>{JSON.stringify(tr.recipe, null, 2)}</pre>
                  </details>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <label className="vr-check">
          <input type="checkbox" checked={named} onChange={(e) => setNamed(e.target.checked)} /> Name me on the card and the page (otherwise &ldquo;a reader&rdquo;)
        </label>
        {dirty ? (
          <p className="vr-small">Save to see the card as it will be published.</p>
        ) : card ? (
          <figure className="vb-card-preview">
            <img src={card} alt="The closing card, as it would be published" className="vb-picture" />
            <figcaption className="vr-small">As it would be published. {closing.kept ? '' : 'No background kept yet: a plain card stands in.'}</figcaption>
          </figure>
        ) : (
          <p className="vr-small">Loading the card…</p>
        )}
        <div className="vr-row">
          <button type="button" className="vr-btn vr-small-btn" onClick={async () => { if (await save()) setCardTick((x) => x + 1); }} disabled={busy !== null || !dirty}>{busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
        </div>
      </section>

      <section className="vr-card" aria-labelledby="vb-publish-h">
        <h2 id="vb-publish-h">5. Publish</h2>
        {check && !check.on && <p className="vr-note">Publishing isn&rsquo;t switched on yet. What it would check:</p>}
        {check && check.problems.length > 0 ? (
          <ul className="vb-notes">
            {check.problems.map((pr, i) => <li key={i}>{pr}</li>)}
          </ul>
        ) : check ? (
          <p className="vr-ok">Ready: every sentence matches the speech, every shot has its picture, and the closing card has its background.</p>
        ) : null}
        {check && (
          <details>
            <summary>The credits, as published</summary>
            <ul className="vs-credits">
              {check.credits.map((c, i) => (
                <li key={i}>{c.who !== 'site' && <span className="vr-tag">{c.who === 'ai' ? 'AI' : c.who === 'book' ? 'Book' : c.who === 'invented' ? 'Invented' : 'People'}</span>} {c.text}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="vr-small">
          Publishing makes public, with the full recipe: your converted performance (never your recording), your words for each shot and the closing card, the kept pictures and the card. You can take it down later; copies others have made may remain.
        </p>
        <button type="button" className="vr-btn" onClick={publish} disabled={busy !== null || dirty || !check?.on || (check?.problems.length ?? 1) > 0}>
          {busy === 'publish' ? 'Publishing…' : 'Publish'}
        </button>
      </section>
    </main>
  );
}
