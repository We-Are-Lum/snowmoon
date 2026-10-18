'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, useWalletSession, webNameProof } from '~/lib/client-auth';
import { ConsentScreen, PublishedTextField } from '~/components/publish-words';
import { SignInButton } from '~/components/sign-in';
import { WalletPanel, WalletSignInButton } from '~/components/wallet';
import { HideButton, ShareRow } from '../../remix/remix-actions';
import { AddToStoryboard } from './add-to-storyboard';
import { openFrameLabel, openWeightTag, remixFrameLabel } from '~/lib/remix/model';

/**
 * Remix in the shot editor (owner, 2026-10-18): Generate from the camera the person set. Sign in
 * (Farcaster, or a prepaid wallet account), agree once to how their words are published (the
 * consent screen, the site's current wording), say what to change in their own words, and Generate:
 * the live layout (as a depth map), the shot's cast cards and plate and the prompt go through the
 * Pictures pipeline. Every frame is saved to their remix of this shot ("My remixes" below), with its
 * AI label and its recipe, and has its own page to share. Wording DRAFTED by the coding agent.
 */
type Wording = { version: string; line: string; title: string; text: string[]; sha256: string };
interface Mine {
  id: string;
  url: string;
  words: string;
  hidden: boolean;
  page: string;
  at: string;
  model?: { name?: string; maker?: string; closed?: boolean } | null;
  /** The version the frame was made from: another one's (version 1 on version 2's panel) is tagged and can't join this version's storyboard. */
  version?: number;
}
interface Status {
  ready: boolean;
  free: boolean;
  model: { name: string; licence: string; host: string; maker?: string; closed?: boolean };
  shot: { id: string; remixable: boolean; pictures: number } | null;
  drawnFrom?: { version: number; versionModel: { name: string; maker: string } | null } | null;
  ownWordsMaxChars: number;
  layout: { width: number; height: number };
  walletSignIn: boolean;
  signedIn: boolean;
  eligible?: boolean | null;
  refusal?: string;
  consented?: boolean;
  left?: number;
  perDay?: number;
  prepaid?: { balanceUsd: number; priceUsd: number };
  frames?: Mine[];
}

export const REMIX_SOON = 'Remixing opens this week.';

export function RemixPanel({
  adaptation,
  version,
  shotId,
  shotN,
  title,
  depth,
  camera,
  seconds,
  boardPath,
}: {
  adaptation: number;
  version: number;
  shotId: string;
  shotN: number;
  title: string;
  /** The live layout as a depth map, at the size Generate sends; null while the 3D set isn't ready. */
  depth: (w: number, h: number) => string | null;
  camera: unknown;
  seconds: number;
  boardPath: string;
}) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || wallet !== null;
  const [status, setStatus] = useState<Status | null>(null);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; url: string; page: string; words: string } | null>(null);
  const [consent, setConsent] = useState<Wording | null>(null);

  const refresh = useCallback(async () => {
    const r = await authFetch(`/api/remix/status?adaptation=${adaptation}&version=${version}&shot=${encodeURIComponent(shotId)}`).catch(() => null);
    if (r?.ok) setStatus((await r.json()) as Status);
  }, [adaptation, version, shotId]);
  useEffect(() => {
    void refresh();
  }, [refresh, auth.kind, wallet?.address]);

  const startConsent = async () => {
    const r = await authFetch('/api/consent');
    if (r.ok) setConsent(((await r.json()) as { wording: Wording }).wording);
  };
  const agree = async () => {
    const r = await authFetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: consent?.sha256 }) });
    if (r.ok) {
      setConsent(null);
      void refresh();
    } else setNote('Could not record your agreement');
  };

  const generate = async () => {
    if (!status) return;
    const layout = depth(status.layout.width, status.layout.height);
    if (!layout) return setNote('The 3D set isn’t ready yet.');
    setBusy(true);
    setNote(null);
    try {
      const r = await authFetch('/api/remix/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adaptation, version, shot: shotId, words, layout, camera, nameProof: webNameProof() }),
      });
      const out = (await r.json().catch(() => ({}))) as { id?: string; url?: string; page?: string; words?: string; error?: string };
      if (r.ok && out.id && out.url && out.page) setMade({ id: out.id, url: out.url, page: out.page, words: out.words ?? words });
      else setNote(out.error ?? 'Could not make the frame');
    } catch {
      setNote('No connection. Try again.');
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const by = auth.kind === 'signed-in' ? (auth.username ? `@${auth.username}` : `FID ${auth.fid}`) : wallet ? wallet.short : 'you';
  const left = status?.prepaid ? `Balance $${status.prepaid.balanceUsd.toFixed(2)} · $${status.prepaid.priceUsd.toFixed(4)} a frame` : status?.left !== undefined ? `${status.left} of ${status.perDay ?? 10} left today` : '';
  const frames = status?.frames ?? [];
  // The version's pictures were drawn by a closed model, Remix by the open-weight one (owner, 2026-10-18: "all the pictures in
  // the remix aren't the ChatGPT images so might be confusing"). DRAFT wording.
  const differs = status?.drawnFrom
    ? `This version\u2019s pictures were drawn by ${status.drawnFrom.versionModel ? `${status.drawnFrom.versionModel.name} (${status.drawnFrom.versionModel.maker}, a closed model)` : 'another model'}. Remix draws with ${status.model.name} (${status.model.licence}), from version ${status.drawnFrom.version}\u2019s prompt and pictures for this shot, so your frame will look different from them.`
    : null;

  // Not set up here (no keys, no database: a preview, or switched off): the shot still plays; Remix is announced.
  if (status && (!status.ready || !status.shot?.remixable))
    return (
      <div className="ed-generate">
        <button type="button" className="ed-btn ed-btn-off" aria-disabled="true" aria-describedby="ed-gen-note" onClick={(e) => e.preventDefault()}>
          Generate
        </button>
        <p id="ed-gen-note" className="ed-help">
          {!status.shot?.remixable && status.ready ? 'This shot has no camera to remix from: try another shot.' : REMIX_SOON}
        </p>
        {differs && status.ready && <p className="ed-help ed-remix-model">{differs}</p>}
      </div>
    );

  return (
    <section className="ed-remix" aria-label="Remix this shot">
      <div className="ed-remix-head">
        <span className="label">Remix shot {shotN} · from your camera</span>
        <span className="label ed-muted">{left}</span>
      </div>
      {differs && <p className="ed-help ed-remix-model">{differs}</p>}
      {!status ? (
        <p className="ed-help">…</p>
      ) : !signedIn ? (
        <div className="ed-row">
          <p className="ed-help">Sign in to make a frame from the camera you set: 10 free a day.</p>
          <SignInButton className="ed-small" />
          {auth.kind === 'signed-out' && !auth.inApp && status.walletSignIn && <WalletSignInButton className="ed-small" />}
        </div>
      ) : status.eligible === false ? (
        <p className="ed-help" role="status">
          {status.refusal ?? 'Remixing is not open to this account.'}
        </p>
      ) : !status.consented ? (
        <>
          {status.prepaid && status.prepaid.balanceUsd < status.prepaid.priceUsd && <WalletPanel onChange={() => void refresh()} />}
          <div className="ed-consent-step">
            {/* Drafted by the coding agent (2026-10-18): once paid, this is the next step. */}
            <p className={status.prepaid && status.prepaid.balanceUsd > 0 ? 'ed-help ed-next' : 'ed-help'}>
              {status.prepaid && status.prepaid.balanceUsd > 0 ? 'Next: agree to how your words are published.' : 'Before your first frame: how your words are published.'}
            </p>
            <button type="button" className="ed-btn ed-btn-full" onClick={startConsent}>
              Read and agree
            </button>
          </div>
        </>
      ) : (
        <>
          {status.prepaid && status.prepaid.balanceUsd < status.prepaid.priceUsd && <WalletPanel onChange={() => void refresh()} />}
          <PublishedTextField id="ed-remix-words" label="What to change, in your words" value={words} onChange={setWords} rows={3} maxLength={status.ownWordsMaxChars} />
          <p className="ed-help">
            Sent with the camera you set (as a depth picture), this shot&rsquo;s cast cards and plate, and {status.drawnFrom ? <>version {status.drawnFrom.version}&rsquo;s prompt for this shot</> : <>the shot&rsquo;s own prompt (the Prompt tab shows it; edits there stay in this browser)</>}. Made with {status.model.closed ? <>{status.model.name} ({status.model.maker}, a closed model; weights not published) on {status.model.host}, the model that drew this version&rsquo;s pictures</> : <>{status.model.name} ({status.model.licence}) on {status.model.host}</>}. Your frame is saved to your remix of this shot, public at its own link, with your words and {by}.
          </p>
          <div className="ed-generate">
            <button type="button" className="ed-btn" onClick={generate} disabled={busy || !words.trim()}>
              {busy ? 'Making your frame…' : 'Generate'}
              <span className="ed-btn-sub">{status.prepaid ? 'Paid from your balance' : status.free ? 'Free: 10 a day' : 'Free frames are paused'}</span>
            </button>
          </div>
        </>
      )}
      {note && (
        <p className="ed-warn" role="status">
          {note}
        </p>
      )}

      {made && (
        <figure className="ed-fig" aria-live="polite">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={made.url} alt={`Your remix of shot ${shotN}: ${made.words}`} width={1024} height={576} />
          {/* The frame's label names a closed model with its maker (src/lib/remix/model.ts remixFrameLabel; DRAFT wording). */}
          <figcaption className="label">AI image · by {by} · {remixFrameLabel(status?.model)}</figcaption>
          <ShareRow url={`${location.origin}${made.page}`} text={`A remix of ${title}, shot ${shotN}`} />
          <p className="ed-help">
            <Link href={made.page}>Its page and recipe</Link>
          </p>
          <AddToStoryboard adaptation={adaptation} version={version} shot={shotId} seconds={seconds} frame={{ id: made.id, url: made.url }} boardPath={boardPath} />
        </figure>
      )}

      {frames.length > 0 && (
        <div className="ed-line">
          <p className="label">My remixes of this shot · {frames.length}</p>
          <div className="ed-mine">
            {frames.map((f) => {
              const other = f.version !== undefined && f.version !== version;
              return (
              <figure key={f.id} className={f.hidden ? 'is-hidden' : undefined} data-version={f.version}>
                {f.hidden ? (
                  <div className="ed-noimg label">Hidden</div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={`Your remix: ${f.words}`} width={1024} height={576} loading="lazy" />
                )}
                <figcaption>
                  {other && <span className="label ed-remix-version">{openWeightTag(f.version!)} · </span>}
                  <span className="label">AI image · by {by}</span>
                  {/* Each frame keeps its own model's label: a closed one named with its maker; another version's open one by name (DRAFT). */}
                  {f.model?.closed ? ` · ${remixFrameLabel(f.model)}` : other ? ` · ${openFrameLabel(f.model?.name)}` : ''} · {f.hidden ? 'hidden' : <Link href={f.page}>page and recipe</Link>} · &ldquo;{f.words}&rdquo;
                </figcaption>
                {!f.hidden && !other && <AddToStoryboard adaptation={adaptation} version={version} shot={shotId} seconds={seconds} frame={{ id: f.id, url: f.url }} boardPath={boardPath} />}
                <HideButton id={f.id} onChange={() => void refresh()} />
              </figure>
              );
            })}
          </div>
        </div>
      )}
      {consent && <ConsentScreen wording={consent} name={auth.kind === 'signed-in' ? auth.username : null} wallet={auth.kind !== 'signed-in' ? (wallet?.short ?? null) : null} onAgree={agree} onCancel={() => setConsent(null)} error={null} />}
    </section>
  );
}
