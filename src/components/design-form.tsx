'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, webNameProof } from '~/lib/client-auth';
import { VIEW_NAMES, wordDiff, type ViewSlot } from '~/lib/images/design-rules';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { ConsentScreen, PublishedTextField, PublishFlow } from './publish-words';
import { SignInButton } from './sign-in';
import { BookQuotes } from './design-book';
import { useMyPicks } from './design-picks';
import { AiTag } from './ai-tag';
import { remixDefaults } from '~/lib/images/remix-defaults';
import { ModelNotice, ModelPicker, type ModelOption } from './model-picker';
import { answerNotice, browserStore, mayPick, noticeFor } from '~/lib/images/model-notice';

/**
 * New style, new sheet, fork, or new version (step 4; Claude Design 4b, 4c, 5b). The name and the
 * text are published words, so each box is a PublishedTextField with the publication line, and the
 * first time goes through the same consent. Pictures (a style's samples, a sheet's views) are made
 * one at a time with the text as it is, each using one of today's generations; they stay on this
 * page until you publish or leave. Changing the text after making them marks them to make again,
 * since the server publishes only pictures made with exactly the text being published. A sheet's
 * views are made in one of the published styles, chosen here (owner, 2026-10-14); changing it
 * marks them to make again too. Your own style pick is chosen to start with.
 * "Preview and publish" shows the design as readers will see it first.
 * A remix (a fork or a new version of a sheet; owner, 2026-11-04): everything starts as the source has it
 * (src/lib/images/remix-defaults.ts), so the least anyone does is type what to change and press Remix, which makes the
 * three views in turn from the source's front view as a reference picture. The style and the name sit under
 * "Options", preselected, to open and change. Each view can be made again inside the same remix.
 */
const W = IMAGE_WORDING.designs;
type Pic = { ticket: string; image: string; text: string; style: string | null; choice?: string };
/** A model the remixer may choose for the sheet (IMAGES.designs.modelChoice): its label is read from config/models.json on the server. */
type StyleOption = { versionId: string; title: string; by: string; text: string; thumb: string | null };
type Status = { ready: boolean; invited?: boolean; consented?: boolean; left?: number; perDay: number; signedIn: boolean; remixes?: { left: number; perDay: number; picturesPerRemix: number } | null };
type Wording = { version: string; line: string; title: string; text: string[]; sha256: string };
type Props = {
  mode: 'create' | 'fork' | 'version';
  kind: 'style' | 'character' | 'location';
  character: { slug: string; name: string; callName: string; quotes: { chapter: number; idx: number; quote: string }[]; firstChapter: number } | null;
  /** A place sheet's place (2026-10-14): its views are made with the place lines. */
  place: { slug: string; name: string; quotes: { chapter: number; idx: number; quote: string }[] } | null;
  /** `style`: the style the source's views were made in, chosen to start with when it is still published (launch rehearsal, 2026-11-02). */
  source: { versionId: string; title: string; entity: string; by: string; versionNo: number; text: string; drafted: boolean; style?: string | null } | null;
  subjects: string[];
  /** Published styles a sheet's views can be made in (newest first). */
  styles: StyleOption[];
  viewLines: Record<ViewSlot, string>;
  rules: string;
  limits: { nameMaxChars: number; textMaxChars: number; samplesMin: number; samplesMax: number };
  models: { text: { name: string; licence: string; host: string }; edit: { name: string; licence: string; host: string } };
  suffix: string;
  /** The remix challenge opens this fork or version to everyone who passes the Generate gate (CHALLENGE.openSheets; the server checks again). */
  challengeOpen?: boolean;
  /** Model choice (branch remix-model-choice): given only on a character sheet's remix while IMAGES.designs.modelChoice is on; the open default first. */
  modelChoices?: ModelOption[];
  /** Who can enter, the challenge's words, given by the server only while it opens this form (challengeOpen). */
  whoCanEnter?: string;
};

export function DesignForm(p: Props) {
  const auth = useAuth();
  const style = p.kind === 'style';
  const [title, setTitle] = useState(p.mode === 'version' ? p.source!.title : p.mode === 'fork' && style ? `${p.source!.title || p.source!.entity}, remix` : '');
  const [text, setText] = useState(p.source?.text ?? '');
  const [samples, setSamples] = useState<(Pic | null)[]>(() => Array(p.limits.samplesMax).fill(null));
  const [views, setViews] = useState<Partial<Record<ViewSlot, Pic>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [consent, setConsent] = useState<Wording | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  /** What the publish said about the remix challenge: this version can be submitted as an entry, or Neynar didn't answer so it can't. */
  const [entry, setEntry] = useState<{ kind: 'candidate' | 'unchecked'; text: string } | null>(null);
  // A refusal at Generate (a score below the check, the day's limit…) shows beside the Generate buttons and is
  // scrolled into view (launch rehearsal, 2026-11-02: it appeared 174px below the screen at 390px wide).
  const noteRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (note) noteRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [note]);
  // A remix starts with the source's style, while it is still published (remixDefaults; launch rehearsal, 2026-11-02).
  const [viewStyle, setViewStyle] = useState<string | null>(() => remixDefaults(p.source ? { style: p.source.style } : null, p.styles.map((s) => s.versionId)).style);
  const remixing = !style && p.mode !== 'create' && p.source !== null;
  /** The remix being made (its signed ticket from the server), so its other views, and any made again, stay inside it. */
  const [remixTicket, setRemixTicket] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const picks = useMyPicks();
  const pickedStyle = picks?.find((x) => x.kind === 'style' && p.styles.some((s) => s.versionId === x.versionId))?.versionId ?? null;
  useEffect(() => {
    if (pickedStyle) setViewStyle((v) => v ?? pickedStyle);
  }, [pickedStyle]);
  const chosen = p.styles.find((s) => s.versionId === viewStyle) ?? null;
  // One model per sheet: chosen once; views made with another are marked to make again.
  const choices = p.modelChoices && p.modelChoices.length > 1 ? p.modelChoices : null;
  const [modelId, setModelId] = useState<string>(choices?.[0].id ?? 'open');
  const model = choices?.find((m) => m.id === modelId) ?? null;
  // The closed models' notice (src/lib/images/model-notice.ts): once per maker, on this device only; the first one asks 18+.
  const seenNotices = useRef(new Set<string>());
  const [notice, setNotice] = useState<{ pick: ModelOption; askAdult: boolean } | null>(null);
  const [adultTicked, setAdultTicked] = useState(false);
  const pickModel = (m: ModelOption) => {
    if (m.open || !m.maker) return setModelId(m.id);
    const n = noticeFor(m.maker, browserStore(), seenNotices.current);
    if (!n.show) return setModelId(m.id);
    setNotice({ pick: m, askAdult: n.askAdult });
  };
  const answer = (button: 'ok' | 'never') => {
    if (!notice?.pick.maker) return;
    if (!answerNotice(notice.pick.maker, button, adultTicked, browserStore(), seenNotices.current)) return;
    setModelId(notice.pick.id);
    setNotice(null);
  };
  // A closed choice works only once its notice (and the 18+ box) has been answered on this device.
  const modelReady = !model || model.open || !model.maker || mayPick(model.maker, browserStore(), seenNotices.current);

  const refresh = useCallback(async () => {
    const res = await authFetch('/api/images/status').catch(() => null);
    if (res?.ok) setStatus((await res.json()) as Status);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, auth.kind]);

  const clean = text.trim();
  const fresh = (x: Pic | null | undefined): x is Pic => Boolean(x && x.text === clean && (style || (x.style === viewStyle && (x.choice ?? 'open') === modelId)));
  const modelStale = !style && Object.values(views).some((x) => x && x.text === clean && x.style === viewStyle && (x.choice ?? 'open') !== modelId);
  const stale = [...samples, ...Object.values(views)].some((x) => x && x.text !== clean);
  const styleStale = !style && Object.values(views).some((x) => x && x.text === clean && x.style !== viewStyle);
  const made = style ? samples.filter(fresh) : (Object.values(views).filter(fresh) as Pic[]);
  const remixCount = !style ? (status?.remixes ?? null) : null;
  // Someone who counts remixes may go on with the remix they are making even when none are left to start.
  const left = remixCount ? (remixCount.left > 0 || remixTicket ? Math.max(1, remixCount.left) : 0) : (status?.left ?? 0);
  const enough = style ? made.length >= p.limits.samplesMin : fresh(views.front);
  const ready = auth.kind === 'signed-in' && (status?.invited || p.challengeOpen) && status?.ready && status.consented;

  const make = async (slot: 'sample' | ViewSlot, index = 0, frontPic?: Pic): Promise<Pic | null> => {
    setBusy(slot === 'sample' ? `s${index}` : slot);
    setNote(null);
    try {
      const front = slot === 'side' || slot === 'back' ? (frontPic ?? views.front) : undefined;
      const res = await authFetch('/api/designs/sample', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slot, index, kind: p.kind, text: clean, ...(style ? {} : { style: viewStyle }), ...(choices && !style ? { model: modelId } : {}), ...(front ? { front: { ticket: front.ticket, image: front.image } } : {}),
          // A remix's front starts from the source's front view (the server fetches it); its views stay in one remix.
          ...(remixing && slot === 'front' ? { source: p.source!.versionId } : {}),
          ...(remixTicket && slot !== 'sample' ? { remix: remixTicket } : {}),
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { ticket?: string; image?: string; error?: string; remix?: string; reason?: string };
      if (out.remix) setRemixTicket(out.remix);
      else if (out.reason?.startsWith('remix')) setRemixTicket(null);
      if (res.ok && out.ticket && out.image) {
        const pic = { ticket: out.ticket, image: out.image, text: clean, style: style ? null : viewStyle, ...(choices && !style ? { choice: modelId } : {}) };
        if (slot === 'sample') setSamples((s) => s.map((x, i) => (i === index ? pic : x)));
        else setViews((v) => ({ ...v, [slot]: pic }));
        return pic;
      }
      setNote(out.error ?? 'Could not make the picture');
      return null;
    } catch {
      setNote('No connection. Try again.');
      return null;
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  /** Remix: the three views in turn, from the source's front view. A view that fails stops here; make it again below. */
  const remixAll = async () => {
    const names = VIEW_NAMES[p.kind === 'location' ? 'location' : 'character'];
    setProgress(W.form.remixing(names.front));
    const f = await make('front');
    for (const k of ['side', 'back'] as const) {
      if (!f) break;
      setProgress(W.form.remixing(names[k]));
      if (!(await make(k, 0, f))) break;
    }
    setProgress(null);
  };

  const publish = async () => {
    const res = await authFetch('/api/designs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: p.mode,
        kind: p.kind,
        title: title.trim(),
        text: clean,
        character: p.character?.slug,
        place: p.place?.slug,
        from: p.source?.versionId,
        samples: style ? made.map((x) => ({ ticket: x.ticket, image: x.image })) : undefined,
        views: style ? undefined : Object.fromEntries(Object.entries(views).filter(([, x]) => fresh(x)).map(([k, x]) => [k, { ticket: x!.ticket, image: x!.image }])),
        nameProof: webNameProof(),
      }),
    });
    const out = (await res.json().catch(() => ({}))) as { page?: string; error?: string; challenge?: { kind: 'candidate' | 'unchecked'; text: string } | null };
    if (!res.ok || !out.page) throw new Error(out.error ?? 'Could not publish');
    setEntry(out.challenge?.kind === 'candidate' || out.challenge?.kind === 'unchecked' ? out.challenge : null);
    setPublished(out.page);
  };

  const startConsent = async () => {
    const res = await authFetch('/api/consent');
    if (res.ok) setConsent(((await res.json()) as { wording: Wording }).wording);
  };
  const agree = async () => {
    const res = await authFetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: consent?.sha256 }) });
    if (res.ok) {
      setConsent(null);
      void refresh();
    } else setNote('Could not record your agreement');
  };

  const diff = p.source && p.mode === 'fork' ? wordDiff(p.source.text, text) : null;
  const pictureFor = (slot: 'sample' | ViewSlot, i: number, pic: Pic | null | undefined, line: string) => {
    const key = slot === 'sample' ? `s${i}` : slot;
    const needsFront = (slot === 'side' || slot === 'back') && !fresh(views.front);
    const needsStyle = slot !== 'sample' && !chosen;
    const label = slot === 'sample' ? W.form.subject(i + 1) : VIEW_NAMES[p.kind === 'location' ? 'location' : 'character'][slot];
    return (
      <li key={key} className={`dz-slot${pic ? ' has-pic' : ''}${pic && !fresh(pic) ? ' is-stale' : ''}`}>
        {pic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pic.image} alt={`AI-generated ${slot === 'sample' ? 'sample' : `${label} view`}, not by the author`} width={slot === 'sample' || p.kind === 'location' ? 1024 : 576} height={slot === 'sample' || p.kind === 'location' ? 576 : 768} />
        ) : (
          <span className="dz-slot-empty" aria-hidden="true" />
        )}
        <p className="dz-slot-label">
          <span className="dz-slot-name">{label}</span> {slot === 'sample' ? line : null}
        </p>
        <button
          type="button"
          className="ic-link dz-slot-go"
          onClick={() => make(slot, i)}
          disabled={!ready || busy !== null || !clean || left <= 0 || needsFront || needsStyle || !modelReady}
          aria-label={`${pic ? W.form.again : W.form.generate}: ${label}`}
        >
          {busy === key ? W.form.making : pic ? W.form.again : W.form.generate}
        </button>
      </li>
    );
  };

  const nameField = (
    <div className="dz-name">
      <PublishedTextField id="dz-name" label={style ? W.form.name : W.form.sheetName} value={title} onChange={(v) => setTitle(v.replace(/\n/g, ' '))} rows={1} maxLength={p.limits.nameMaxChars} />
    </div>
  );
  const stylePicker = style ? null : (
    <fieldset className="dz-section dz-style-pick">
      <legend className="dz-label">{W.form.viewStyle}</legend>
      {p.styles.length ? (
        <ul className="dz-rows">
          {p.styles.map((s) => (
            <li key={s.versionId}>
              <label className={`dz-row dz-style-option${viewStyle === s.versionId ? ' is-on' : ''}`}>
                <input type="radio" name="dz-view-style" value={s.versionId} checked={viewStyle === s.versionId} onChange={() => setViewStyle(s.versionId)} />
                {s.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="dz-thumb" src={s.thumb} alt="" width={64} height={48} loading="lazy" />
                ) : (
                  <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
                )}
                <span className="dz-row-text">
                  <span className="dz-row-title">{s.title}</span>
                  <span className="dz-row-meta">{s.by}</span>
                  {s.thumb && <span className="dz-row-ai"><AiTag what="Sample" /></span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ic-error">{W.form.viewStyleNone}</p>
      )}
      {chosen && <p className="dz-text dz-style-text">{chosen.text}</p>}
      <p className="dz-note">{W.form.viewStyleNote}</p>
    </fieldset>
  );

  if (published)
    return (
      <>
        <p className="ic-done">
          {W.form.published} {entry?.kind === 'candidate' && `${entry.text} `}
          <Link href={published}>{W.form.see}</Link>
        </p>
        {entry?.kind === 'unchecked' && (
          <p className="ic-error ch-unchecked" role="status">
            {entry.text}
          </p>
        )}
        {entry && <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>}
      </>
    );
  return (
    <div className="dz-form">
      {p.source && p.mode === 'fork' && (
        <div className="dz-band">
          <p>
            {W.form.band(`${p.source.title || p.source.entity} v${p.source.versionNo} · ${p.source.by}`)}
          </p>
          <p className="dz-muted">{W.form.bandNote(p.source.by)}</p>
        </div>
      )}
      {p.character && <BookQuotes name={p.character.name} quotes={p.character.quotes} />}
      {p.place && <BookQuotes name={p.place.name} quotes={p.place.quotes} />}

      {auth.kind !== 'signed-in' ? (
        <div className="ic-gate">
          <p>{p.challengeOpen ? W.form.signInChallenge : W.form.signIn}</p>
          <SignInButton />
        </div>
      ) : !status ? (
        <p className="ic-note">…</p>
      ) : !(status.invited || p.challengeOpen) ? (
        <p className="ic-gate">{W.form.notInvited}</p>
      ) : !status.ready ? (
        <p className="ic-gate">{W.form.notReady}</p>
      ) : !status.consented ? (
        <div className="ic-gate">
          {p.challengeOpen && !status.invited && p.whoCanEnter && <p className="ch-who">{p.whoCanEnter}</p>}
          <p>{W.form.consentFirst}</p>
          <button type="button" className="ic-primary" onClick={startConsent}>
            {W.form.readAndAgree}
          </button>
        </div>
      ) : (
        <>
          {!remixing && nameField}
          <div className="dz-text-field">
            <PublishedTextField id="dz-text" label={style ? W.form.styleText : remixing ? W.form.remixText : W.form.sheetText(p.character?.callName ?? p.place?.name ?? '')} value={text} onChange={setText} rows={4} maxLength={p.limits.textMaxChars} />
            <span className="ic-count" aria-hidden="true">
              {text.length} / {p.limits.textMaxChars}
            </span>
          </div>
          {diff && diff.some((d) => d.changed) && (
            <div className="dz-diff">
              <p className="dz-text">
                {diff.map((d, i) => (d.changed ? <mark key={i}>{d.text}</mark> : <span key={i}>{d.text}</span>))}
              </p>
              <p className="dz-note">{W.form.yours(p.source!.versionNo)}</p>
            </div>
          )}
          <p className="ic-note">{W.form.sentTo}</p>

          {!style && !remixing && stylePicker}
          {remixing && (
            <>
              {/* The options start as the source has them (remixDefaults); open them to change any (owner, 2026-11-04). */}
              <details className="dz-section dz-options">
                <summary className="dz-label">{W.form.options(chosen?.title ?? null)}</summary>
                <p className="dz-note">{W.form.optionsNote}</p>
                {nameField}
                {stylePicker}
              </details>
              <div className="dz-remix">
                <button type="button" className="ic-primary" onClick={remixAll} disabled={!ready || busy !== null || !clean || left <= 0 || !chosen}>
                  {progress ?? W.form.remix}
                </button>
                <p className="dz-note">{W.form.remixNote}</p>
              </div>
            </>
          )}

          {!style && choices && (
            <fieldset className="dz-section dz-model-pick">
              <legend className="dz-label">{W.models.legend}</legend>
              <ModelPicker choices={choices} modelId={modelId} onPick={pickModel} />
              {notice?.pick.maker && <ModelNotice maker={notice.pick.maker} askAdult={notice.askAdult} adultTicked={adultTicked} onTick={setAdultTicked} onAnswer={answer} />}
              <p className="dz-note">{W.models.note}</p>
            </fieldset>
          )}

          <section className="dz-section" aria-label={style ? 'Sample images' : 'Views'}>
            <p className="dz-label">{style ? W.form.samples(p.limits.samplesMin, p.limits.samplesMax) : W.form.views}</p>
            <ul className={`dz-slots${style ? '' : ' is-views'}${p.kind === 'location' ? ' is-place' : ''}`}>
              {style
                ? samples.map((x, i) => pictureFor('sample', i, x, p.subjects[i]))
                : (['front', 'side', 'back'] as const).map((k, i) => pictureFor(k, i, views[k], p.viewLines[k]))}
            </ul>
            {note && (
              <p ref={noteRef} className="ic-error dz-make-note" role="status">
                {note}
              </p>
            )}
            {p.challengeOpen && !status.invited && p.whoCanEnter && <p className="dz-note ch-who">{p.whoCanEnter}</p>}
            {!style && (
              <ul className="dz-view-lines">
                {(['front', 'side', 'back'] as const).map((k) => (
                  <li key={k}>
                    <span className="dz-slot-name">{VIEW_NAMES[p.kind === 'location' ? 'location' : 'character'][k]}</span> {p.viewLines[k]}
                  </li>
                ))}
              </ul>
            )}
            {!style && <p className="dz-note">{W.form.viewsShared}</p>}
            {stale && <p className="ic-error">{W.form.stale}</p>}
            {styleStale && <p className="ic-error">{W.form.viewStyleChanged}</p>}
            {modelStale && <p className="ic-error">{W.models.changed}</p>}
            {!style && !chosen && p.styles.length > 0 && <p className="dz-note">{W.form.viewStyleFirst}</p>}
            <p className="dz-note">{remixCount ? W.form.remixesLeft(remixCount.left, remixCount.picturesPerRemix) : W.form.left(left)}</p>
            {remixing && p.source && <p className="dz-note">{W.form.fromSource}</p>}
            <p className="dz-note">{W.form.promptIs(p.suffix)}</p>
            <p className="ic-model">
              {model && !model.open ? (
                <>
                  {model.name} · {model.terms} · runs through Vercel AI Gateway
                </>
              ) : (
                <>
              {p.models.text.name} · open weights, {p.models.text.licence} · runs on {p.models.text.host}
              {!style && (
                <>
                  <br />
                  {W.form.viewModel}: {p.models.edit.name} · open weights, {p.models.edit.licence} · runs on {p.models.edit.host}
                </>
              )}
                </>
              )}
            </p>
          </section>

          <div className="ic-rules">
            <p className="ic-label">{IMAGE_WORDING.composer.rulesLabel}</p>
            <p>{style ? W.form.styleRules : W.form.sheetRules} {p.rules}</p>
          </div>
          <div className="dz-publish">
            <PublishFlow
              disabled={!enough || stale || styleStale || modelStale || busy !== null || (style && !title.trim())}
              preview={
                <div className="dz-preview">
                  <p className="dz-title">{title.trim() || (style ? '' : W.page.sheetBy(auth.kind === 'signed-in' && auth.username ? `@${auth.username}` : 'you'))}</p>
                  {p.source && p.mode === 'fork' && <p className="dz-meta">{W.form.band(`${p.source.title || p.source.entity} v${p.source.versionNo} · ${p.source.by}`)}</p>}
                  <div className={`dz-grid${style ? '' : ' is-views'}`}>
                    {made.map((x) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={x.ticket.slice(-12)} src={x.image} alt="" />
                    ))}
                  </div>
                  <p className="dz-caption">
                    {style ? W.page.samplesCaption : p.kind === 'location' ? W.page.placeViewsCaption : W.page.viewsCaption} <AiTag />
                  </p>
                  {!style && chosen && <p className="dz-meta">{W.page.madeInStyle(chosen.title)}</p>}
                  <p className="dz-label">{style ? W.page.styleText : W.page.sheetText(p.character?.callName ?? p.place?.name ?? '')}</p>
                  <p className="dz-text">{clean}</p>
                </div>
              }
              onPublish={publish}
            />
            {!enough && <p className="dz-note">{style ? W.form.needSamples(p.limits.samplesMin) : W.form.frontFirst}</p>}
          </div>
        </>
      )}
      {consent && (
        <div className="image-composer dz-consent">
          <ConsentScreen wording={consent} name={null} onAgree={agree} onCancel={() => setConsent(null)} error={null} />
        </div>
      )}
      <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
    </div>
  );
}
