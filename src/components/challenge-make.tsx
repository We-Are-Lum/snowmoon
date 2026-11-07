'use client';

import Link from 'next/link';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authFetch, useAuth, useSocialSession, useWalletSession } from '~/lib/client-auth';
import { shuffleFresh } from '~/lib/challenge/shuffle';
import type { MakeView } from '~/lib/challenge/make';
import { flowKeys, saveDraft, type FlowDraft } from '~/lib/challenge/flow-storage';
import { AiTag } from './ai-tag';
import { ConsentScreen, PublishedTextField } from './publish-words';
import { SignInChoices } from './sign-in-choices';

/**
 * The remix screen, /challenge/make?from=<version>&moment=<id> (owner, 2026-11-05; docs/proposals/challenge-moments.md
 * §1.2 and §1.3 S2). The picture tapped is the reference (nothing of its old prompt is shown or kept); a moment strip of
 * all fifteen curated moments in the book's order, each chip with its chapter, and "Surprise me", which draws one of
 * them afresh, unweighted (P5g's fourth exception: `shuffleFresh(MOMENTS.filter((m) => m.id !== moment))`, the list
 * the server sent, all fifteen but the one chosen); the moment's quote under the strip, word for word with its block
 * and "Read it" (a new tab, so the flow stays); an empty "Describe what to change" box (a PublishedTextField: the
 * publication line under it, P1); the model chip (room for the model choice when remix-model-choice merges); Make it.
 *
 * Navigation: one URL per step. Choosing a moment replaces the URL (back doesn't replay every tap); Make it pushes the
 * preview (/challenge/make/<draft>). "‹ Back" is the browser's back; "✕" goes to the hub at this character's card. The
 * words are kept for this picture in this tab (sessionStorage), so going back finds them as typed. Once a picture made
 * here is published, coming back here goes to the hub instead (publish replaces the preview).
 *
 * Every word comes from the server's answer (src/lib/challenge/make-wording.ts); none lives in this script.
 */
type Wording = { version: string; line: string; title: string; text: string[]; sha256: string };

export function ChallengeMake() {
  const router = useRouter();
  const q = useSearchParams();
  const from = q.get('from') ?? '';
  const moment = q.get('moment');
  const auth = useAuth();
  const social = useSocialSession();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || social !== null || wallet !== null;
  const [view, setView] = useState<MakeView | null | 'missing'>(null);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [consent, setConsent] = useState<Wording | null>(null);

  useEffect(() => {
    if (!from) return setView('missing');
    // A picture made from this one was published: back here goes to the hub (publish replaced the preview).
    const k = flowKeys(from);
    try {
      if (sessionStorage.getItem(k.published)) {
        sessionStorage.removeItem(k.published);
        sessionStorage.removeItem(k.words);
      } else setWords(sessionStorage.getItem(k.words) ?? '');
    } catch {}
    authFetch(`/api/challenge/make?from=${encodeURIComponent(from)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as MakeView) : 'missing'))
      .then((v) => setView(v))
      .catch(() => setView('missing'));
  }, [from]);

  const MOMENTS = view && view !== 'missing' ? view.moments : [];
  const chosen = MOMENTS.find((m) => m.id === moment) ?? null;
  const go = (id: string) => router.replace(`/challenge/make?from=${from}&moment=${encodeURIComponent(id)}`, { scroll: false });
  const surprise = () => {
    const next = shuffleFresh(MOMENTS.filter((m) => m.id !== moment))[0];
    if (next) go(next.id);
  };
  // No moment yet: a remix keeps its picture's moment; a base gets a "Surprise me" draw, shown as chosen.
  useEffect(() => {
    if (!view || view === 'missing' || chosen) return;
    if (view.source.moment && view.moments.some((m) => m.id === view.source.moment)) go(view.source.moment);
    else surprise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, moment]);
  // The chosen chip in view in the strip (it scrolls sideways).
  useEffect(() => {
    // Only the strip scrolls (sideways): the page stays at the top, with the box and "Make it" in view.
    const strip = document.querySelector<HTMLElement>('.mk-strip');
    const chip = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (strip && chip) strip.scrollLeft = chip.offsetLeft - (strip.clientWidth - chip.clientWidth) / 2;
  }, [moment, view]);
  useEffect(() => {
    try {
      if (from) sessionStorage.setItem(flowKeys(from).words, words);
    } catch {}
  }, [from, words]);

  if (view === 'missing') return <NotFound />;
  if (!view) return <div className="mk-page" aria-busy="true" />;
  const w = view.w;
  const hub = `/challenge#${view.source.character}`;

  const make = async () => {
    if (!chosen) return setError(w.noMoment);
    if (!words.trim()) return setError(w.noWords);
    setBusy(true);
    setError(null);
    const r = await authFetch('/api/challenge/make', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, moment: chosen.id, words }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { ticket?: string; image?: string; prompt?: string; error?: string; reason?: string };
    setBusy(false);
    if (r?.status === 403 && out.reason === 'consent') {
      const c = await authFetch('/api/consent').catch(() => null);
      if (c?.ok) setConsent(((await c.json()) as { wording: Wording }).wording);
      return;
    }
    if (!r?.ok || !out.ticket || !out.image) return setError(out.error ?? 'Could not make it');
    const draft: FlowDraft = { id: crypto.randomUUID(), from, character: view.source.character, name: view.source.name, sourceUrl: view.source.url, moment: { id: chosen.id, title: chosen.title, chip: chosen.chip }, words, ticket: out.ticket, image: out.image, prompt: out.prompt ?? '', model: w.modelChip, w };
    if (!saveDraft(draft)) return setError('Could not keep the picture in this tab. Try again.');
    router.push(`/challenge/make/${draft.id}`);
  };
  const agree = async () => {
    const r = await authFetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: consent?.sha256 }) });
    if (r.ok) {
      setConsent(null);
      void make();
    }
  };

  return (
    <div className="mk-page" data-step="remix">
      <nav className="mk-bar">
        <button type="button" className="mk-back" onClick={() => router.back()}>
          {w.back}
        </button>
        <Link className="mk-close" href={hub} aria-label={w.close}>
          ✕
        </Link>
      </nav>
      <figure className="mk-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mk-picture mk-source" src={view.source.url} alt={w.picture} />
        <figcaption className="mk-cap">
          <span className="dz-muted">{w.remixing}</span> <AiTag />
        </figcaption>
      </figure>
      {/* The box and "Make it" right under the picture, on a phone's first screen (owner, 2026-11-07); the moment
          (already drawn, shown chosen) and the model follow. */}
      <PublishedTextField id="mk-words" label={w.wordsLabel} value={words} onChange={setWords} rows={3} maxLength={600} placeholder={w.wordsPlaceholder} />
      {signedIn ? (
        <button type="button" className="rl-remix mk-make" onClick={make} disabled={busy}>
          {busy ? w.making : w.makeIt}
        </button>
      ) : (
        <>
          <button type="button" className="rl-remix mk-make" aria-expanded={signIn} onClick={() => setSignIn((s) => !s)}>
            {w.signIn}
          </button>
          {signIn && <SignInChoices wallet={false} />}
        </>
      )}
      {error && (
        <p className="ia-note" role="alert">
          {error}
        </p>
      )}
      <p className="mk-model">
        <span className="cc-head">{w.model}</span> <span className="cc-chip mk-model-chip" data-slot="model-choice">{w.modelChip}</span>
      </p>
      <section className="mk-moments" aria-labelledby="mk-moment">
        <div className="mk-moment-head">
          <h2 id="mk-moment" className="cc-head">
            {w.moment}
          </h2>
          <button type="button" className="cc-chip mk-surprise" onClick={surprise}>
            {w.surprise} <span aria-hidden="true">⟳</span>
          </button>
        </div>
        <ul className="mk-strip" role="list" aria-label={w.momentsBy}>
          {MOMENTS.map((m) => (
            <li key={m.id}>
              <button type="button" className="cc-chip" aria-pressed={m.id === moment} data-moment={m.id} onClick={() => go(m.id)}>
                {m.title} <span className="cc-chip-ch">· {m.chip}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="dz-muted mk-by">{w.momentsBy}</p>
        {chosen && (
          <div className="mk-quotes" aria-live="polite">
            {chosen.quotes.map((x) => (
              <blockquote key={x.block} className="cc-quote" cite={x.href}>
                <p>{x.text}</p>
                <p className="cc-quote-foot">
                  <span className="cc-block">{x.block}</span>{' '}
                  <a href={x.href} target="_blank" rel="noopener">
                    {w.readIt}
                  </a>
                </p>
              </blockquote>
            ))}
          </div>
        )}
      </section>
      {consent && <ConsentScreen wording={consent} name={auth.kind === 'signed-in' ? (auth.username ?? null) : null} onAgree={agree} onCancel={() => setConsent(null)} error={null} />}
    </div>
  );
}
