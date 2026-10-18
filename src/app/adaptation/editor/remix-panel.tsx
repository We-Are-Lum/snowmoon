'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, useWalletSession, webNameProof } from '~/lib/client-auth';
import { ConsentScreen, PublishedTextField } from '~/components/publish-words';
import { SignInButton } from '~/components/sign-in';
import { WalletPanel, WalletSignInButton } from '~/components/wallet';
import { HideButton, ShareRow } from '../../remix/remix-actions';
import { AddToStoryboard } from './add-to-storyboard';
import { saveRemix } from './my-changes';

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
}
interface Status {
  ready: boolean;
  free: boolean;
  model: { name: string; licence: string; host: string };
  shot: { id: string; remixable: boolean; pictures: number } | null;
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
      if (r.ok && out.id && out.url && out.page) {
        setMade({ id: out.id, url: out.url, page: out.page, words: out.words ?? words });
        keep({ id: out.id, url: out.url, page: out.page, words: out.words ?? words, at: Date.now() });
      }
      else setNote(out.error ?? 'Could not make the frame');
    } catch {
      setNote('No connection. Try again.');
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  // "Play with my changes" shows your newest Remix frame of this shot: its address is kept in this browser (my-changes.ts).
  const keep = (f: { id: string; url: string; page: string; words: string; at: number } | null) =>
    saveRemix(adaptation, version, shotId, f && { ...f, by, model: status ? { name: status.model.name, licence: status.model.licence, where: `on ${status.model.host}, a hosted service` } : null });
  useEffect(() => {
    // Only from a full answer about your own frames: a hidden frame drops out, the newest shown one is kept.
    if (!status?.ready || !status.signedIn || !status.frames) return;
    const f = status.frames.find((x) => !x.hidden);
    keep(f ? { id: f.id, url: f.url, page: f.page, words: f.words, at: Date.parse(f.at) || Date.now() } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const by = auth.kind === 'signed-in' ? (auth.username ? `@${auth.username}` : `FID ${auth.fid}`) : wallet ? wallet.short : 'you';
  const left = status?.prepaid ? `Balance $${status.prepaid.balanceUsd.toFixed(2)} · $${status.prepaid.priceUsd.toFixed(4)} a frame` : status?.left !== undefined ? `${status.left} of ${status.perDay ?? 10} left today` : '';
  const frames = status?.frames ?? [];

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
      </div>
    );

  return (
    <section className="ed-remix" aria-label="Remix this shot">
      <div className="ed-remix-head">
        <span className="label">Remix shot {shotN} · from your camera</span>
        <span className="label ed-muted">{left}</span>
      </div>
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
            Sent with the camera you set (as a depth picture), this shot&rsquo;s cast cards and plate, and the shot&rsquo;s own prompt (the Prompt tab shows it; edits there stay in this browser). Made with {status.model.name} ({status.model.licence}) on {status.model.host}. Your frame is saved to your remix of this shot, public at its own link, with your words and {by}.
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
          <figcaption className="label">AI image · by {by} · AI-generated image, not by the author</figcaption>
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
            {frames.map((f) => (
              <figure key={f.id} className={f.hidden ? 'is-hidden' : undefined}>
                {f.hidden ? (
                  <div className="ed-noimg label">Hidden</div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={`Your remix: ${f.words}`} width={1024} height={576} loading="lazy" />
                )}
                <figcaption>
                  <span className="label">AI image · by {by}</span> · {f.hidden ? 'hidden' : <Link href={f.page}>page and recipe</Link>} · &ldquo;{f.words}&rdquo;
                </figcaption>
                {!f.hidden && <AddToStoryboard adaptation={adaptation} version={version} shot={shotId} seconds={seconds} frame={{ id: f.id, url: f.url }} boardPath={boardPath} />}
                <HideButton id={f.id} onChange={() => void refresh()} />
              </figure>
            ))}
          </div>
        </div>
      )}
      {consent && <ConsentScreen wording={consent} name={auth.kind === 'signed-in' ? auth.username : null} wallet={auth.kind !== 'signed-in' ? (wallet?.short ?? null) : null} onAgree={agree} onCancel={() => setConsent(null)} error={null} />}
    </section>
  );
}
