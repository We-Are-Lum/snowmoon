'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, webNameProof } from '~/lib/client-auth';
import { wordDiff, type ViewSlot } from '~/lib/images/design-rules';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { ConsentScreen, PublishedTextField, PublishFlow } from './publish-words';
import { SignInButton } from './sign-in';
import { BookQuotes } from './design-book';

/**
 * New style, new sheet, fork, or new version (step 4; Claude Design 4b, 4c, 5b). The name and the
 * text are published words, so each box is a PublishedTextField with the publication line, and the
 * first time goes through the same consent. Pictures (a style's samples, a sheet's views) are made
 * one at a time with the text as it is, each using one of today's generations; they stay on this
 * page until you publish or leave. Changing the text after making them marks them to make again,
 * since the server publishes only pictures made with exactly the text being published.
 * "Preview and publish" shows the design as readers will see it first.
 */
const W = IMAGE_WORDING.designs;
type Pic = { ticket: string; image: string; text: string };
type Status = { ready: boolean; invited?: boolean; consented?: boolean; left?: number; perDay: number; signedIn: boolean };
type Wording = { version: string; line: string; title: string; text: string[]; sha256: string };
type Props = {
  mode: 'create' | 'fork' | 'version';
  kind: 'style' | 'character';
  character: { slug: string; name: string; callName: string; quotes: { chapter: number; idx: number; quote: string }[]; firstChapter: number } | null;
  source: { versionId: string; title: string; entity: string; by: string; versionNo: number; text: string; drafted: boolean } | null;
  subjects: string[];
  viewLines: Record<ViewSlot, string>;
  rules: string;
  limits: { nameMaxChars: number; textMaxChars: number; samplesMin: number; samplesMax: number };
  models: { text: { name: string; licence: string; host: string }; edit: { name: string; licence: string; host: string } };
  suffix: string;
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

  const refresh = useCallback(async () => {
    const res = await authFetch('/api/images/status').catch(() => null);
    if (res?.ok) setStatus((await res.json()) as Status);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, auth.kind]);

  const clean = text.trim();
  const fresh = (x: Pic | null | undefined): x is Pic => Boolean(x && x.text === clean);
  const stale = [...samples, ...Object.values(views)].some((x) => x && x.text !== clean);
  const made = style ? samples.filter(fresh) : (Object.values(views).filter(fresh) as Pic[]);
  const left = status?.left ?? 0;
  const enough = style ? made.length >= p.limits.samplesMin : fresh(views.front);
  const ready = auth.kind === 'signed-in' && status?.invited && status.ready && status.consented;

  const make = async (slot: 'sample' | ViewSlot, index = 0) => {
    setBusy(slot === 'sample' ? `s${index}` : slot);
    setNote(null);
    try {
      const front = slot === 'side' || slot === 'back' ? views.front : undefined;
      const res = await authFetch('/api/designs/sample', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot, index, text: clean, ...(front ? { front: { ticket: front.ticket, image: front.image } } : {}) }),
      });
      const out = (await res.json().catch(() => ({}))) as { ticket?: string; image?: string; error?: string };
      if (res.ok && out.ticket && out.image) {
        const pic = { ticket: out.ticket, image: out.image, text: clean };
        if (slot === 'sample') setSamples((s) => s.map((x, i) => (i === index ? pic : x)));
        else setViews((v) => ({ ...v, [slot]: pic }));
      } else setNote(out.error ?? 'Could not make the picture');
    } catch {
      setNote('No connection. Try again.');
    } finally {
      setBusy(null);
      void refresh();
    }
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
        from: p.source?.versionId,
        samples: style ? made.map((x) => ({ ticket: x.ticket, image: x.image })) : undefined,
        views: style ? undefined : Object.fromEntries(Object.entries(views).filter(([, x]) => fresh(x)).map(([k, x]) => [k, { ticket: x!.ticket, image: x!.image }])),
        nameProof: webNameProof(),
      }),
    });
    const out = (await res.json().catch(() => ({}))) as { page?: string; error?: string };
    if (!res.ok || !out.page) throw new Error(out.error ?? 'Could not publish');
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
    const label = slot === 'sample' ? W.form.subject(i + 1) : slot;
    return (
      <li key={key} className={`dz-slot${pic ? ' has-pic' : ''}${pic && !fresh(pic) ? ' is-stale' : ''}`}>
        {pic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pic.image} alt={`AI-generated ${slot === 'sample' ? 'sample' : `${slot} view`}, not by the author`} width={slot === 'sample' ? 1024 : 576} height={slot === 'sample' ? 576 : 768} />
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
          disabled={!ready || busy !== null || !clean || left <= 0 || needsFront}
          aria-label={`${pic ? W.form.again : W.form.generate}: ${label}`}
        >
          {busy === key ? W.form.making : pic ? W.form.again : W.form.generate}
        </button>
      </li>
    );
  };

  if (published)
    return (
      <p className="ic-done">
        {W.form.published} <Link href={published}>{W.form.see}</Link>
      </p>
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

      {auth.kind !== 'signed-in' ? (
        <div className="ic-gate">
          <p>{W.form.signIn}</p>
          <SignInButton />
        </div>
      ) : !status ? (
        <p className="ic-note">…</p>
      ) : !status.invited ? (
        <p className="ic-gate">{W.form.notInvited}</p>
      ) : !status.ready ? (
        <p className="ic-gate">{W.form.notReady}</p>
      ) : !status.consented ? (
        <div className="ic-gate">
          <p>{W.form.consentFirst}</p>
          <button type="button" className="ic-primary" onClick={startConsent}>
            {W.form.readAndAgree}
          </button>
        </div>
      ) : (
        <>
          <div className="dz-name">
            <PublishedTextField id="dz-name" label={style ? W.form.name : W.form.sheetName} value={title} onChange={(v) => setTitle(v.replace(/\n/g, ' '))} rows={1} maxLength={p.limits.nameMaxChars} />
          </div>
          <div className="dz-text-field">
            <PublishedTextField id="dz-text" label={style ? W.form.styleText : W.form.sheetText(p.character?.callName ?? '')} value={text} onChange={setText} rows={4} maxLength={p.limits.textMaxChars} />
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

          <section className="dz-section" aria-label={style ? 'Sample images' : 'Views'}>
            <p className="dz-label">{style ? W.form.samples(p.limits.samplesMin, p.limits.samplesMax) : W.form.views}</p>
            <ul className={`dz-slots${style ? '' : ' is-views'}`}>
              {style
                ? samples.map((x, i) => pictureFor('sample', i, x, p.subjects[i]))
                : (['front', 'side', 'back'] as const).map((k, i) => pictureFor(k, i, views[k], p.viewLines[k]))}
            </ul>
            {!style && (
              <ul className="dz-view-lines">
                {(['front', 'side', 'back'] as const).map((k) => (
                  <li key={k}>
                    <span className="dz-slot-name">{k}</span> {p.viewLines[k]}
                  </li>
                ))}
              </ul>
            )}
            {stale && <p className="ic-error">{W.form.stale}</p>}
            <p className="dz-note">{W.form.left(left)}</p>
            <p className="dz-note">{W.form.promptIs(p.suffix)}</p>
            <p className="ic-model">
              {p.models.text.name} · open weights, {p.models.text.licence} · runs on {p.models.text.host}
              {!style && (
                <>
                  <br />
                  {W.form.viewModel}: {p.models.edit.name} · open weights, {p.models.edit.licence} · runs on {p.models.edit.host}
                </>
              )}
            </p>
          </section>

          <div className="ic-rules">
            <p className="ic-label">{IMAGE_WORDING.composer.rulesLabel}</p>
            <p>{style ? W.form.styleRules : W.form.sheetRules} {p.rules}</p>
          </div>
          {note && (
            <p className="ic-error" role="status">
              {note}
            </p>
          )}
          <div className="dz-publish">
            <PublishFlow
              disabled={!enough || stale || busy !== null || (style && !title.trim())}
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
                  <p className="dz-caption">{style ? W.page.samplesCaption : W.page.viewsCaption}</p>
                  <p className="dz-label">{style ? W.page.styleText : W.page.sheetText(p.character?.callName ?? '')}</p>
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
