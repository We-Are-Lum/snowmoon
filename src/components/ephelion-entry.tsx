'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '~/lib/client-auth';
import { PublishedTextField } from '~/components/publish-words';
import { loadTake, removeTake, saveTake } from '~/lib/voice/device-takes';
import { TAKES_WORDING as W } from '~/lib/voice/takes-wording';

/**
 * The entry step (PR 6, 2026-11-26; the drawings at review afd14b05…): under the converted take on the Listen step. Choose
 * a ready picture (the approved set, the ready-made scenes, the person's own published pictures of Lord Ephelion: free
 * and instant), or describe your own (the free picture, one per account); the preview; Enter the challenge (asking first
 * before it replaces the person's live take of this speech); then Entered. The free picture and its signed record stay on
 * this device (the take-store, under the person) until a take uses it; the site keeps only that it was made.
 */
type Option = { id: string; title: string; url: string | null; by?: string; placeholder?: boolean; at?: string };
interface Options { placeholder: boolean; set: Option[]; scenes: Option[]; own: Option[]; freeSceneMade: boolean }
type Choice = { source: 'set' | 'own' | 'preset' | 'own-scene'; id: string; url: string; title: string; labels: string[] } | null;
const SCENE_SLOT = 'ephelion-own-scene';
const ticketKey = (fid: number) => `snowmoon.ephelion.scene.${fid}`;

export function EphelionEntry({ fid, draftId, speechTitle, voiceName, wide, takeUrl = null, passage = null }: { fid: number; draftId: string; speechTitle: string; voiceName: string; wide: boolean; takeUrl?: string | null; passage?: string | null }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [tab, setTab] = useState<'choose' | 'describe'>('choose');
  const [choice, setChoice] = useState<Choice>(null);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState<'make' | 'enter' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; ticket: string; image: string } | null>(null);
  const [ask, setAsk] = useState(false);
  const [askRemove, setAskRemove] = useState(false);
  const [entered, setEntered] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    void authFetch('/api/voice/takes', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => setOpts(j as Options | null), () => setOpts(null));
    // A free picture made earlier on this device, with its signed record.
    void (async () => {
      const t = (() => { try { return localStorage.getItem(ticketKey(fid)); } catch { return null; } })();
      const kept = await loadTake(fid, SCENE_SLOT).catch(() => null);
      if (t && kept) {
        const image = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(kept.blob); });
        setMade({ url: URL.createObjectURL(kept.blob), ticket: t, image });
      }
    })();
  }, [fid]);

  const makeScene = async () => {
    setBusy('make');
    setNote(null);
    const r = await authFetch('/api/voice/scene', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: desc }) }).catch(() => null);
    setBusy(null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string; image?: string; ticket?: string };
    if (!r?.ok || !j.image || !j.ticket) return setNote(j.error ?? W.failed);
    const blob = await (await fetch(j.image)).blob();
    await saveTake(fid, SCENE_SLOT, blob, 0).catch(() => undefined);
    try { localStorage.setItem(ticketKey(fid), j.ticket); } catch { /* storage blocked: kept for this visit */ }
    const m = { url: URL.createObjectURL(blob), ticket: j.ticket, image: j.image };
    setMade(m);
    setChoice({ source: 'own-scene', id: 'own-scene', url: m.url, title: W.ownSceneTitle, labels: [W.labelAi, W.labelDescribed] });
    setNote(wide ? W.madeDesktop : W.madePhone);
    setOpts((o) => (o ? { ...o, freeSceneMade: true } : o));
  };

  /** Removes the free picture and its signed record from this device (Privacy §3: kept "until you enter it or remove it"). */
  const removeScene = async () => {
    await removeTake(fid, SCENE_SLOT).catch(() => undefined);
    try { localStorage.removeItem(ticketKey(fid)); } catch { /* nothing kept */ }
    if (made) URL.revokeObjectURL(made.url);
    setMade(null);
    setAskRemove(false);
    setChoice((c) => (c?.source === 'own-scene' ? null : c));
  };

  const enter = async (replace: boolean) => {
    if (!choice) return setNote(W.chooseFirst);
    setBusy('enter');
    setNote(null);
    const picture = choice.source === 'own-scene' ? { source: 'own-scene', ticket: made?.ticket, image: made?.image } : { source: choice.source, id: choice.id };
    const r = await authFetch('/api/voice/takes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId, picture, named: true, replace }) }).catch(() => null);
    setBusy(null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string; reason?: string; id?: string; url?: string };
    if (r?.status === 409 && j.reason === 'entered') return setAsk(true);
    if (!r?.ok || !j.id) return setNote(j.error ?? W.notEntered);
    setAsk(false);
    if (choice.source === 'own-scene') {
      await removeTake(fid, SCENE_SLOT).catch(() => undefined);
      try { localStorage.removeItem(ticketKey(fid)); } catch { /* nothing kept */ }
    }
    setEntered({ id: j.id, url: j.url ?? `/ephelion/take/${j.id}` });
  };

  if (entered)
    return (
      <section className="er-card er-entered" aria-labelledby="er-entered-h">
        <p className="er-kicker">{W.entered}</p>
        <h3 id="er-entered-h">{W.enteredTitle(speechTitle)}</h3>
        {passage && <p className="er-kicker" data-slot="passage-label">{passage}</p>}
        <p className="er-note">{W.enteredNote(voiceName)}</p>
        <div className="er-row">
          <Link className="er-btn er-quiet" href={entered.url}>{W.shareIt}</Link>
          <Link className="er-btn" href="/ephelion">{W.back}</Link>
        </div>
      </section>
    );

  const tile = (o: Option, source: 'set' | 'own' | 'preset', labels: string[], sub: string | null) => {
    const on = choice?.source === source && choice.id === o.id;
    return (
      <button key={`${source}:${o.id}`} type="button" className={`er-pic${on ? ' er-on' : ''}`} aria-pressed={on} onClick={() => setChoice({ source, id: o.id, url: o.url ?? '', title: o.title, labels })}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {o.url ? <img src={o.url} alt="" /> : <span className="er-pic-empty">{W.placeholderNote}</span>}
        <span className="er-pic-title">{o.title}</span>
        {sub && <span className="er-kicker er-pic-sub">{sub}</span>}
      </button>
    );
  };

  return (
    <section className="er-card er-entry" aria-labelledby="er-entry-h">
      <h3 id="er-entry-h">{W.heading}</h3>
      {passage && <p className="er-kicker" data-slot="passage-label">{passage}</p>}
      <p className="er-note">{W.intro}</p>
      <div className="er-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'choose'} className={tab === 'choose' ? 'er-on' : ''} onClick={() => setTab('choose')}>{W.tabChoose}</button>
        <button type="button" role="tab" aria-selected={tab === 'describe'} className={tab === 'describe' ? 'er-on' : ''} onClick={() => setTab('describe')}>{W.tabDescribe}</button>
      </div>
      {!opts ? null : tab === 'choose' ? (
        <div className="er-pick" data-slot="choose">
          <p className="er-kicker">{W.approved}</p>
          <div className="er-pics">{opts.set.map((o) => tile(o, 'set', [W.labelAi, o.placeholder ? W.labelPlaceholderSet : W.labelApproved], o.by ? `by ${o.by}` : null))}</div>
          <p className="er-kicker">{W.scenes}</p>
          <div className="er-pics">{opts.scenes.map((o) => tile(o, 'preset', [W.labelScene, ...(o.placeholder ? [W.labelPlaceholder] : [])], W.labelScene))}</div>
          <p className="er-kicker">{W.yours}</p>
          {opts.own.length ? <div className="er-pics">{opts.own.map((o) => tile({ ...o, title: W.ownTitle }, 'own', [W.labelAi, W.labelYours], o.at ? o.at.slice(0, 10) : null))}</div> : <p className="er-note">{W.noneYours}</p>}
          <p className="er-note">{W.freeNote}{opts.placeholder ? ` ${W.placeholderNote}` : ''}</p>
        </div>
      ) : (
        <div className="er-pick" data-slot="describe">
          <p className="er-kicker">{W.describeHead}</p>
          {made ? (
            <>
              <button type="button" className={`er-pic${choice?.source === 'own-scene' ? ' er-on' : ''}`} onClick={() => setChoice({ source: 'own-scene', id: 'own-scene', url: made.url, title: W.ownSceneTitle, labels: [W.labelAi, W.labelDescribed] })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={made.url} alt="" />
                <span className="er-pic-title">{W.ownSceneTitle}</span>
              </button>
              <p className="er-note" data-slot="kept-here">{W.keptHere}</p>
              {askRemove ? (
                <div className="er-ask" role="alert">
                  <p>{W.removeAsk}</p>
                  <div className="er-row">
                    <button type="button" className="er-btn" onClick={() => void removeScene()}>{W.removeYes}</button>
                    <button type="button" className="er-btn er-quiet" onClick={() => setAskRemove(false)}>{W.removeNo}</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="er-link" onClick={() => setAskRemove(true)} disabled={busy !== null}>{W.removeHere}</button>
              )}
              <p className="er-note">{W.used}</p>
            </>
          ) : opts.freeSceneMade ? (
            <p className="er-note">{W.used}</p>
          ) : (
            <>
              <PublishedTextField id="er-scene" label={W.describeLabel} value={desc} onChange={setDesc} rows={3} maxLength={400} />
              <button type="button" className="er-btn er-wide" onClick={() => void makeScene()} disabled={busy !== null || !desc.trim()}>{busy === 'make' ? W.making : W.makeButton}</button>
            </>
          )}
          <p className="er-note">{W.underButton}</p>
          <p className="er-note">{W.checkedNote}</p>
        </div>
      )}
      {note && <p className="er-ok" role="status">{note}</p>}
      <div className="er-preview">
        <p className="er-kicker">{W.preview}</p>
        {choice && takeUrl && <p className="er-note">{W.previewLine}</p>}
        {choice ? (
          <figure className="er-preview-fig">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={choice.url} alt="" />
            {/* #250's preview, folded in (Nate, 2026-11-27): the take playing over the picture chosen. */}
            {takeUrl && <audio controls src={takeUrl} className="er-preview-audio" aria-label={W.previewPlay} />}
            <figcaption><span>{choice.title}</span> <span className="er-kicker">{choice.labels.join(' · ')}</span>{choice.source === 'own-scene' && <span className="er-note">{W.keptHere}</span>}</figcaption>
          </figure>
        ) : (
          <p className="er-note">{W.chooseFirst}</p>
        )}
      </div>
      {ask ? (
        <div className="er-ask" role="alert">
          <p>{W.askReplace}</p>
          <div className="er-row">
            <button type="button" className="er-btn" onClick={() => void enter(true)} disabled={busy !== null}>{W.replaceYes}</button>
            <button type="button" className="er-btn er-quiet" onClick={() => setAsk(false)}>{W.replaceNo}</button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="er-btn er-wide" onClick={() => void enter(false)} disabled={busy !== null || !choice}>{busy === 'enter' ? W.entering : W.enter}</button>
          <p className="er-note">{W.enterNote}</p>
        </>
      )}
    </section>
  );
}
