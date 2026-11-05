'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, useWalletSession, webNameProof } from '~/lib/client-auth';
import { ConsentScreen, PublishedTextField } from '~/components/publish-words';
import { SignInChoices } from '~/components/sign-in-choices';
import { StoryboardPlayer } from '../../storyboard/player';
import { buildSlides, type BoardData } from '../../storyboard/slides';
import { DRAFT_EVENT, clearDraft, readDraft, writeDraft, type Draft } from './storyboard-draft';

/**
 * /@<name>/<id>/storyboard: the person's storyboard for this version, being made (owner, 2026-10-18).
 * Frames come from "Add to storyboard" in the shot editor (the version's own frame, or one of their
 * remix frames). Reorder, remove, set each frame's length, choose the converted take for each line,
 * play it, and save it: then it has its own page to share and cast. The draft stays in this browser
 * until saved. Wording DRAFTED by the coding agent.
 */
type Wording = { version: string; line: string; title: string; text: string[]; sha256: string };
const S = { minSeconds: 0.5, maxSeconds: 20 };

export function StoryboardEditor({ dataUrl, scenePath, aiLabel, mixUrl }: { dataUrl: string; scenePath: string; aiLabel: string | null; mixUrl: string | null }) {
  const [data, setData] = useState<BoardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft>({ title: '', items: [], takes: {} });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [consent, setConsent] = useState<Wording | null>(null);
  const auth = useAuth();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || wallet !== null;
  const by = auth.kind === 'signed-in' ? (auth.username ? `@${auth.username}` : `FID ${auth.fid}`) : wallet ? wallet.short : 'you';

  useEffect(() => {
    fetch(dataUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setFailed(true));
  }, [dataUrl]);
  const load = useCallback(() => data && setDraft(readDraft(data.adaptation, data.version)), [data]);
  useEffect(() => {
    load();
    window.addEventListener(DRAFT_EVENT, load);
    return () => window.removeEventListener(DRAFT_EVENT, load);
  }, [load]);

  const put = (d: Draft) => data && writeDraft(data.adaptation, data.version, d);
  const move = (k: number, by: -1 | 1) => {
    const items = [...draft.items];
    const j = k + by;
    if (j < 0 || j >= items.length) return;
    [items[k], items[j]] = [items[j], items[k]];
    put({ ...draft, items });
  };
  const frames = useMemo(() => Object.fromEntries(draft.items.filter((i) => i.frame).map((i) => [i.frame!.id, { url: i.frame!.url, hidden: false }])), [draft.items]);
  const slides = useMemo(
    () => (data ? buildSlides(data, draft.items.map((i) => ({ key: i.key, shot: i.shot, frame: i.frame?.id ?? null, seconds: i.seconds })), draft.takes, frames, by) : []),
    [data, draft, frames, by],
  );
  // The lines the board holds, once each, in board order, for choosing their takes.
  const lines = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return draft.items.flatMap((i) => (data.shots.find((s) => s.id === i.shot)?.lines ?? []).filter((l) => l.voice && !seen.has(l.cue) && (seen.add(l.cue), true)));
  }, [data, draft.items]);

  const save = async (agreed = false) => {
    if (!data) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await authFetch('/api/remix/storyboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adaptation: data.adaptation, version: data.version, title: draft.title, items: draft.items.map((i) => ({ shot: i.shot, frame: i.frame?.id ?? null, seconds: i.seconds })), takes: draft.takes, nameProof: webNameProof() }),
      });
      const out = (await r.json().catch(() => ({}))) as { page?: string; error?: string; reason?: string };
      if (r.ok && out.page) {
        setSaved(out.page);
        clearDraft(data.adaptation, data.version);
      } else if (out.reason === 'consent' && !agreed) {
        const c = await authFetch('/api/consent');
        if (c.ok) setConsent(((await c.json()) as { wording: Wording }).wording);
      } else setNote(out.error ?? 'Could not save the storyboard');
    } catch {
      setNote('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const agree = async () => {
    const r = await authFetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: consent?.sha256 }) });
    setConsent(null);
    if (r.ok) void save(true);
    else setNote('Could not record your agreement');
  };

  if (failed)
    return (
      <div className="ed ed-empty">
        <p className="label">The storyboard isn&rsquo;t available for this version yet.</p>
        <Link href={scenePath}>Back to the scene</Link>
      </div>
    );
  if (!data)
    return (
      <div className="ed ed-empty" aria-busy="true">
        <p className="label">Loading…</p>
      </div>
    );
  return (
    <div className="ed sb">
      <header className="ed-head">
        <nav className="ed-nav label" aria-label="Back">
          <Link href={scenePath}>‹ {data.title}</Link>
          <Link href={`${scenePath}/shot/first`}>Add frames from the shots ›</Link>
        </nav>
        <h1 className="ed-title">Your storyboard</h1>
        <p className="label ed-muted">
          {draft.items.length} frames · kept in this browser until you save it
        </p>
      </header>

      {saved ? (
        <p className="ed-banner">
          Saved. <Link href={saved}>Its page: play it, share it, cast it</Link>
        </p>
      ) : null}

      <div className="ed-grid">
        <section className="ed-look" aria-label="Play">
          <StoryboardPlayer slides={slides} mixUrl={mixUrl} aiLabel={aiLabel} />
        </section>
        <section className="ed-set" aria-label="Frames">
          {!draft.items.length && (
            <p className="ed-help">
              Open a shot and press &ldquo;Add to storyboard&rdquo; under its frame, or under one of your remix frames. <Link href={`${scenePath}/shot/first`}>Open the first shot</Link>
            </p>
          )}
          <ol className="sb-list">
            {draft.items.map((it, k) => {
              const s = data.shots.find((x) => x.id === it.shot);
              return (
                <li key={it.key} className="sb-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {(it.frame?.url ?? s?.frame) ? <img src={it.frame?.url ?? s?.frame ?? ''} alt="" width={160} height={90} /> : <div className="ed-noimg label">no picture</div>}
                  <div className="sb-item-body">
                    <p className="label">
                      {k + 1}. Shot {s?.n ?? it.shot} · {it.frame ? `your remix` : `version ${data.version}`}
                    </p>
                    <label className="sb-len">
                      <span className="label">{it.seconds.toFixed(1)} s</span>
                      <input
                        type="range"
                        aria-label={`Length of frame ${k + 1}, in seconds`}
                        min={S.minSeconds}
                        max={S.maxSeconds}
                        step={0.1}
                        value={it.seconds}
                        onChange={(e) => {
                          const v = Math.min(S.maxSeconds, Math.max(S.minSeconds, Number(e.target.value) || S.minSeconds));
                          put({ ...draft, items: draft.items.map((x) => (x.key === it.key ? { ...x, seconds: v } : x)) });
                        }}
                      />
                    </label>
                    <div className="ed-row">
                      <button type="button" className="ed-small" onClick={() => move(k, -1)} disabled={k === 0} aria-label={`Move frame ${k + 1} up`}>
                        ↑
                      </button>
                      <button type="button" className="ed-small" onClick={() => move(k, 1)} disabled={k === draft.items.length - 1} aria-label={`Move frame ${k + 1} down`}>
                        ↓
                      </button>
                      <button type="button" className="ed-small" onClick={() => put({ ...draft, items: draft.items.filter((x) => x.key !== it.key) })} aria-label={`Remove frame ${k + 1}`}>
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {lines.length > 0 && (
            <fieldset className="ed-controls">
              <legend className="label">Voices: the take for each line</legend>
              <p className="ed-help">The existing converted takes of each line. A frame whose lines all keep the version&rsquo;s take plays the version&rsquo;s own mix.</p>
              {lines.map((l) => (
                <label key={l.cue} className="ed-pose sb-take">
                  <span className="label">
                    {l.speaker} · {l.cue}
                  </span>
                  <select value={draft.takes[l.cue] ?? 'version'} onChange={(e) => put({ ...draft, takes: { ...draft.takes, [l.cue]: e.target.value } })}>
                    <option value="version">As in version {data.version}</option>
                    {(l.takes ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        Voice {t.voice}
                        {t.inVersion ? ` · the take in version ${data.version}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>
          )}

          {draft.items.length > 0 && (
            <div className="ed-remix">
              <PublishedTextField id="sb-title" label="Title (optional)" value={draft.title} onChange={(v) => put({ ...draft, title: v })} rows={1} maxLength={80} />
              {signedIn ? (
                <button type="button" className="ed-btn" onClick={() => void save()} disabled={busy}>
                  {busy ? 'Saving…' : 'Save storyboard'}
                  <span className="ed-btn-sub">Public at its own link, with {by}</span>
                </button>
              ) : (
                <div className="ed-row">
                  <p className="ed-help">Sign in to save it and share it.</p>
                  <SignInChoices size="small" wallet={auth.kind === 'signed-out' && !auth.inApp} />
                </div>
              )}
              {note && (
                <p className="ed-warn" role="status">
                  {note}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      {consent && <ConsentScreen wording={consent} name={auth.kind === 'signed-in' ? auth.username : null} wallet={auth.kind !== 'signed-in' ? (wallet?.short ?? null) : null} onAgree={agree} onCancel={() => setConsent(null)} error={null} />}
    </div>
  );
}
