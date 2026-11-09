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
import { useChallengeModel } from './challenge-model-row';
import { withReset } from '~/lib/challenge/model-wording';

/**
 * The remix screen, /challenge/make?from=<version> (owner, 2026-11-05; simplified 2026-11-08, the simpler challenge).
 * The picture tapped, small, is the reference (nothing of its old prompt is shown or kept). Then:
 * - ONE box, "Change {Name}: clothes, colours, age, pose…" (a PublishedTextField: the publication line under it, P1);
 * - the Style row: the presets and the site's published styles (from the server), "Random" (the server draws one of
 *   the published styles when the picture is made, and the recipe records both) and "Write your own" (a short box, also
 *   a PublishedTextField: its words go into the prompt, which is published, and through the prompt check). It starts
 *   on the picture's own style when it has one, else the first;
 * - the Model row: one chip per model the server lists (src/lib/challenge/models.ts), today one;
 * - Make it.
 * While the moments are on (CHALLENGE.moments; off since 2026-11-08), the server also sends the fifteen moments and the
 * screen shows their strip and "Surprise me", which draws one of them afresh, unweighted (P5g's fourth exception:
 * `shuffleFresh(MOMENTS.filter((m) => m.id !== moment))`, the list the server sent, all but the one chosen), and the
 * chosen moment's quote, word for word with its block. With them off the server sends none, and none of it shows.
 *
 * Navigation: one URL per step. Make it pushes the preview (/challenge/make/<draft>). "‹ Back" is the browser's back;
 * "✕" goes to /challenge at this character. The words are kept for this picture in this tab (sessionStorage), so going
 * back finds them as typed. Once a picture made here is published, coming back here goes to the hub instead.
 *
 * Every word comes from the server's answer (src/lib/challenge/make-wording.ts); none lives in this script.
 */
type Wording = { version: string; line: string; title: string; text: string[]; sha256: string };
type StyleSel = string; // a listed style's id, 'random' or 'own'

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
  const [styleSel, setStyleSel] = useState<StyleSel | null>(null);
  const [ownStyle, setOwnStyle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [consent, setConsent] = useState<Wording | null>(null);
  // The Model row (branch challenge-models): the server's list for this visitor; a closed pick waits for its maker's
  // notice and, once per device, the 18+ box; a wallet account sees why closed models aren't offered.
  const loaded = view && view !== 'missing' ? (view as MakeView & { modelsNote?: string | null; picturesLeft?: number | null }) : null;
  const mc = useChallengeModel(loaded?.models, loaded?.modelsNote ?? null);

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
      .then((v) => {
        setView(v);
        if (v !== 'missing') {
          setStyleSel(v.defaultStyle ?? (v.styles.length ? v.styles[0].id : 'own'));
        }
      })
      .catch(() => setView('missing'));
  }, [from]);

  const MOMENTS = view && view !== 'missing' ? view.moments : [];
  const chosen = MOMENTS.find((m) => m.id === moment) ?? null;
  const go = (id: string) => router.replace(`/challenge/make?from=${from}&moment=${encodeURIComponent(id)}`, { scroll: false });
  const surprise = () => {
    const next = shuffleFresh(MOMENTS.filter((m) => m.id !== moment))[0];
    if (next) go(next.id);
  };
  // Only while the moments are on: a remix keeps its picture's moment; a base gets a "Surprise me" draw, shown as chosen.
  useEffect(() => {
    if (!view || view === 'missing' || chosen || !view.moments.length) return;
    if (view.source.moment && view.moments.some((m) => m.id === view.source.moment)) go(view.source.moment);
    else surprise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, moment]);
  // The chosen chip in view in the strip (it scrolls sideways).
  useEffect(() => {
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
  const momentsOn = view.moments.length > 0;
  const hasPublished = view.styles.some((s) => s.kind === 'published');
  const style = styleSel === 'random' ? { kind: 'random' as const } : styleSel === 'own' ? { kind: 'own' as const, text: ownStyle } : styleSel ? { kind: 'style' as const, id: styleSel } : null;
  const model = mc.chosen;

  const make = async () => {
    if (momentsOn && !chosen) return setError(w.noMoment);
    if (!words.trim()) return setError(w.noWords);
    if (!momentsOn && !style) return setError(w.noStyle);
    if (style?.kind === 'own' && !style.text.trim()) return setError(w.ownEmpty);
    if (!model) return setError(w.noModel);
    if (!mc.ready) return setError(w.noModel);
    setBusy(true);
    setError(null);
    const body = momentsOn ? { from, moment: chosen!.id, words, ...mc.body() } : { from, words, style, ...mc.body() };
    const r = await authFetch('/api/challenge/make', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { ticket?: string; image?: string; prompt?: string; style?: string | null; error?: string; reason?: string; resetAt?: string };
    setBusy(false);
    if (r?.status === 403 && out.reason === 'consent') {
      const c = await authFetch('/api/consent').catch(() => null);
      if (c?.ok) setConsent(((await c.json()) as { wording: Wording }).wording);
      return;
    }
    // A refusal naming when closed models come back: written here in the visitor's own time (the server sends the instant).
    if (!r?.ok || !out.ticket || !out.image) return setError(out.error ? withReset(out.error, out.resetAt) : 'Could not make it');
    const draft: FlowDraft = {
      id: crypto.randomUUID(), from, character: view.source.character, name: view.source.name, sourceUrl: view.source.url,
      moment: chosen ? { id: chosen.id, title: chosen.title, chip: chosen.chip } : null, words, style: momentsOn ? null : style, modelId: model.id, styleLine: out.style ?? null,
      ticket: out.ticket, image: out.image, prompt: out.prompt ?? '', model: model.chip, w,
    };
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
      <PublishedTextField id="mk-words" label={w.wordsLabel} value={words} onChange={setWords} rows={3} maxLength={600} placeholder={w.wordsPlaceholder || undefined} />
      {momentsOn && (
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
        </section>
      )}
      {!momentsOn && (
        <section className="mk-styles" aria-labelledby="mk-style">
          <h2 id="mk-style" className="cc-head">
            {w.style}
          </h2>
          <ul className="mk-chips" role="list" aria-label={w.style}>
            {view.styles.map((s) => (
              <li key={s.id}>
                <button type="button" className="cc-chip" aria-pressed={styleSel === s.id} data-style={s.id} onClick={() => setStyleSel(s.id)}>
                  {s.label}
                </button>
              </li>
            ))}
            {hasPublished && (
              <li>
                <button type="button" className="cc-chip" aria-pressed={styleSel === 'random'} data-style="random" onClick={() => setStyleSel('random')}>
                  {w.random} <span aria-hidden="true">⟳</span>
                </button>
              </li>
            )}
            <li>
              <button type="button" className="cc-chip" aria-pressed={styleSel === 'own'} data-style="own" onClick={() => setStyleSel('own')}>
                {w.ownStyle}
              </button>
            </li>
          </ul>
          {styleSel === 'own' && <PublishedTextField id="mk-own-style" label={w.ownStyleLabel} value={ownStyle} onChange={setOwnStyle} rows={2} maxLength={view.ownStyleMax} />}
        </section>
      )}
      <section className="mk-model" aria-labelledby="mk-model-head">
        <h2 id="mk-model-head" className="cc-head">
          {w.model}
        </h2>
        <ul className="mk-chips" role="list" aria-label={w.model} data-slot="model-choice">
          {view.models.map((m) => (
            <li key={m.id}>
              <button type="button" className="cc-chip mk-model-chip" aria-pressed={model?.id === m.id} data-model={m.id} onClick={() => mc.pick(m)}>
                {m.chip}
              </button>
            </li>
          ))}
        </ul>
        {/* A closed pick: its maker's notice (and the 18+ box the first time on this device), then its line. */}
        {mc.notice}
        {model && !model.open && !mc.notice && <p className="dz-muted mk-model-meta" data-slot="model-meta">{mc.meta(model)}</p>}
        {!mc.notice && mc.tooFew(loaded?.picturesLeft) && <p className="dz-muted mk-model-few" data-slot="model-too-few">{mc.tooFew(loaded?.picturesLeft)}</p>}
        {mc.note && <p className="dz-muted mk-model-note" data-slot="model-note">{mc.note}</p>}
      </section>
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
      {momentsOn && (
        <section className="mk-moment-words" aria-label={w.momentsBy}>
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
      )}
      {consent && <ConsentScreen wording={consent} name={auth.kind === 'signed-in' ? (auth.username ?? null) : null} onAgree={agree} onCancel={() => setConsent(null)} error={null} />}
    </div>
  );
}
