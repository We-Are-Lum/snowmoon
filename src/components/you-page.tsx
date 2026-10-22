'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { IMAGES } from '~/lib/config';
import { authFetch, signOut, signOutWallet, useAuth, useWalletAlongside, walletFetch } from '~/lib/client-auth';
import { frameView, labelFor, pictureView, posterAlt, posterView } from '~/lib/scene-posters';
import type { BoardItem, FrameItem, OwnWork, PictureItem, SceneItem, Who } from '~/lib/you';
import { AiLabel } from './recipe-sheet';
import { SignInButton } from './sign-in';
import { LinkNote, WalletPanel, WalletSignInButton } from './wallet';
import { AgentsOnYou } from './agents/agents-you';

/**
 * The You page (owner, 2026-10-18: "build the You page"), reached by tapping your name in the menu:
 * (a) your account, (b) your wallet, (c) your work, each piece with Hide. Private: everything shown is
 * read from /api/you, which answers only for the signed-in person's own session. Signed out, the page
 * shows how to sign in and nothing else.
 *
 * Every sentence on this page is DRAFT wording for the owner (coding agent, 2026-10-18), kept in W.
 */
const W = {
  title: 'You',
  signedOut: 'Sign in to see your account, your balance and what you have made here. Only you can see this page.',
  loading: 'Loading…',
  failed: 'Your page didn’t load. Try again in a moment.',
  account: 'Your account',
  farcaster: 'Farcaster',
  kindFarcaster: 'Farcaster',
  kindWallet: 'Wallet',
  kindBasename: 'Wallet · Basename',
  fid: 'Farcaster ID',
  basename: 'Basename',
  address: 'Wallet address',
  profile: 'Your public page',
  profileNote: 'Anyone can open it. It shows the scenes, remix frames and storyboards you have published here, and nothing you have hidden.',
  noProfile: 'Your public page needs a Farcaster name.',
  signOutFarcaster: 'Sign out',
  signOutWallet: 'Sign out of this wallet',
  bothWork: 'Signed in with Farcaster and a wallet on this device: the work of both accounts is listed together; each piece is hidden by its own account.',
  inApp: 'Signed in through your Farcaster app.',
  wallet: 'Wallet',
  framePrice: (usd: string) => `Up to $${usd} a Remix frame: the estimated cost plus ${Math.round(IMAGES.prepaid.markup * 100)}%. A frame with fewer pictures sent costs less.`,
  farcasterWallet:
    'A Farcaster account has no balance here: Pictures and Remix use your free daily count. Sign in with a wallet too to see its balance, add funds or add a payment. While Farcaster is signed in, Pictures and Remix still make things as your Farcaster account.',
  work: 'Your work',
  workNote: 'Only you see this list. What isn’t hidden is public at its own link. Hide takes a piece out of view for everyone at once.',
  notStored: 'Saved work can’t be read on this copy of the site, so only built-in scenes are listed.',
  scenes: 'Scenes',
  frames: 'Remix frames',
  boards: 'Storyboards',
  pictures: 'Pictures',
  none: 'None yet.',
  hiddenByYou: 'Hidden by you',
  hiddenByMaintainer: 'Hidden by the maintainer',
  hidden: 'Hidden',
  hide: 'Hide this',
  hideMaintainer: 'Hide (maintainer)',
  showAgain: 'Show it again',
  sceneConfirm: 'Hide this scene? It leaves your page and its links at once.',
  sceneConfirmNoUndo: 'Hide this scene? It leaves your page and its links at once. For now, only the maintainer can bring a hidden scene back.',
  sceneYes: 'Hide it',
  sceneNo: 'Keep it',
  version: (n: number) => `Version ${n}`,
  remixedFrom: (n: number) => `remixed from version ${n}`,
  shot: (title: string, shot: string, v: number) => `${title}, shot ${shot} · version ${v}`,
  board: (b: BoardItem) => `${b.frames} frame${b.frames === 1 ? '' : 's'} · ${b.seconds.toFixed(1)} s · ${b.sceneTitle}, version ${b.versionId}`,
  untitled: 'Untitled storyboard',
  chapter: (n: number) => `Chapter ${n}`,
  couldNot: 'Could not change it',
  // Wallet ↔ Farcaster links (owner, 2026-10-22). DRAFT wording (coding agent, 2026-10-22), for the owner.
  linkTitle: 'Link this wallet to Farcaster',
  linkOffer: 'Have a Farcaster account? Link this wallet to it, and signing in with this wallet signs you in as that account.',
  linkSignIn: 'Sign in with Farcaster to link this wallet',
  linkConfirm: (wallet: string, to: string) => `Link ${wallet} to ${to}?`,
  linkWhat: 'From now on, signing in with this wallet signs you in as this Farcaster account.',
  /** Next to the button (owner, 2026-10-22: "Show a line next to the button saying the wallet's past work will appear under their Farcaster name"). */
  linkPast: (to: string) => `What you made with this wallet before will appear under ${to}, here and on its public pages. Its balance stays with the wallet. You can unlink it here at any time.`,
  linkYes: 'Link them',
  linkNo: 'Not now',
  linked: (wallet: string, to: string) => `${wallet} is linked to ${to}: signing in with it signs you in as ${to}.`,
  linkedHow: { verified: 'Linked because that account verified this address on Farcaster.', signed: 'Linked by you, signed in with both.', config: 'Linked by the maintainer.' },
  linkedEarlier: (to: string) => `What you made with this wallet shows under ${to}, and is listed with your work below.`,
  linkedBalance: 'The wallet’s balance stays with the wallet. While linked, Pictures and Remix use the Farcaster account’s free daily count.',
  unlink: 'Unlink this wallet',
  unlinkConfirm: 'Unlink? Signing in with this wallet will be the wallet’s own account again.',
  unlinkYes: 'Unlink',
  unlinkNo: 'Keep it',
  unlinkAsk: 'To unlink it, write to us.',
  viaWallet: 'Signed in with your linked wallet.',
} as const;

interface Side {
  who: Who;
  work: OwnWork;
  prices: { imageUsd: number; frameUsd: number } | null;
}
interface YouData extends Side {
  maintainer: boolean;
  /** A wallet session alongside a Farcaster one (both signed in on this device), or a linked wallet's own earlier work. */
  wallet: Side | null;
  /** The wallet on this page: its link, and whether the offer to link it applies (src/app/api/you/route.ts). */
  link: LinkView | null;
}
interface LinkView {
  wallet: { address: string; short: string };
  linked: { fid: number; how: 'verified' | 'signed' | 'config'; at: string | null; name: string } | null;
  canUnlink: boolean;
  offer: boolean;
  /** The FID signed in with Farcaster on this device, if any: who the offer links to. */
  to: number | null;
}
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
/** Whose a listed item is, and which session acts for it (Hide goes with that account's own token). */
type Mine<T> = T & { by: Who; fetcher: Fetcher | null };

const dollars = (usd: number) => (usd >= 1 ? usd.toFixed(2) : usd.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
const day = (iso: string) => iso.slice(0, 10);

export function YouPage() {
  const auth = useAuth();
  // The wallet session even when Farcaster is signed in too (owner, 2026-10-18: show both).
  const wallet = useWalletAlongside();
  const [data, setData] = useState<YouData | null>(null);
  const [failed, setFailed] = useState(false);
  const signedIn = auth.kind === 'signed-in' || (auth.kind === 'signed-out' && wallet !== null);
  const both = auth.kind === 'signed-in' && wallet !== null;
  const key = `${auth.kind === 'signed-in' ? `f${auth.fid}` : ''}${wallet ? `w${wallet.address}` : ''}`;

  const load = useCallback(async () => {
    setFailed(false);
    // With both, the Farcaster token goes as usual and the wallet's own token beside it (src/app/api/you/route.ts).
    const res = await authFetch('/api/you', both && wallet ? { headers: { 'x-wallet-session': wallet.token } } : undefined).catch(() => null);
    if (res?.ok) setData((await res.json()) as YouData);
    else if (res?.status === 401) setData(null);
    else setFailed(true);
  }, [both, wallet]);
  useEffect(() => {
    setData(null);
    if (key && auth.kind !== 'loading') void load();
  }, [key, auth.kind, load]);

  if (auth.kind === 'loading') return <Frame>{<p className="you-note">{W.loading}</p>}</Frame>;
  if (!signedIn)
    return (
      <Frame>
        <p className="you-lede">{W.signedOut}</p>
        <LinkNote className="you-note" />
        <div className="you-sign-in">
          <SignInButton className="ic-secondary" />
          {auth.kind === 'signed-out' && !auth.inApp && <WalletSignInButton />}
        </div>
      </Frame>
    );
  if (failed)
    return (
      <Frame>
        <p className="you-note" role="alert">
          {W.failed}
        </p>
      </Frame>
    );
  if (!data) return <Frame>{<p className="you-note">{W.loading}</p>}</Frame>;

  const { who } = data;
  // The wallet account on this page: the primary one (wallet-only), or the one alongside Farcaster.
  const walletSide: Side | null = who.kind === 'wallet' ? data : data.wallet;
  const primaryFetch: Fetcher = authFetch;
  const sides: { side: Side; fetcher: Fetcher | null }[] = [{ side: data, fetcher: primaryFetch }, ...(data.wallet ? [{ side: data.wallet, fetcher: walletFetch as Fetcher }] : [])];
  // A wallet linked to the Farcaster account on this page: its work is in the account's own list (owner, 2026-10-22).
  const linkedHere = !!data.link?.linked && who.kind === 'farcaster' && data.link.linked.fid === who.fid;
  const tag = <K extends keyof OwnWork>(k: K) =>
    sides.flatMap(({ side, fetcher }) => (side.work[k] as unknown[]).map((it) => ({ ...(it as object), by: side.who, fetcher }))) as Mine<OwnWork[K] extends (infer U)[] ? U : never>[];
  const stored = sides.every(({ side }) => side.work.stored);
  return (
    <Frame>
      {/* First, the creative act (owner, 2026-10-20): tell your agent, react to its drafts. Only while agents are switched on. */}
      <AgentsOnYou />
      {/* The 30-day note about automatic links (owner, 2026-10-22), for everyone signed in. */}
      <LinkNote className="you-note" />
      <section className="you-section" aria-labelledby="you-account">
        <h2 id="you-account">{W.account}</h2>
        <AccountRows
          who={who}
          signOut={auth.kind === 'signed-in' && auth.via === 'farcaster-app' ? null : auth.kind === 'signed-in' ? signOut : signOutWallet}
          viaWallet={auth.kind !== 'signed-in' && who.kind === 'farcaster'}
        />
        {data.wallet && <AccountRows who={data.wallet.who} signOut={signOutWallet} />}
        {data.link && <LinkPanel view={data.link} to={who.kind === 'farcaster' ? who : null} reload={load} />}
      </section>

      <section className="you-section" aria-labelledby="you-wallet">
        <h2 id="you-wallet">{W.wallet}</h2>
        {/* A linked wallet signed in here still has its own balance (it stays with the wallet). */}
        {walletSide || (linkedHere && wallet) ? (
          <>
            {/* Always shown with a wallet session (owner, 2026-10-18): the balance, its price, Add funds and
                "Add a payment by its transaction hash", the existing panel, reused. */}
            <WalletPanel onChange={() => void load()} linkHint={false} />
            {walletSide?.prices && <p className="you-note">{W.framePrice(dollars(walletSide.prices.frameUsd))}</p>}
          </>
        ) : (
          <>
            <p className="you-note">{W.farcasterWallet}</p>
            {auth.kind === 'signed-in' && auth.via === 'website' && <WalletSignInButton />}
          </>
        )}
      </section>

      <section className="you-section" aria-labelledby="you-work">
        <h2 id="you-work">{W.work}</h2>
        <p className="you-note">{W.workNote}</p>
        {data.wallet && <p className="you-note">{W.bothWork}</p>}
        {linkedHere && <p className="you-note">{W.linkedEarlier(who.name)}</p>}
        {!stored && <p className="you-note">{W.notStored}</p>}
        <WorkList title={W.scenes} id="you-scenes" items={tag('scenes')} render={(s) => <SceneRow key={s.versionId} s={s} reload={load} />} />
        <WorkList title={W.frames} id="you-frames" items={tag('frames')} render={(f) => <FrameRow key={f.id} f={f} reload={load} />} />
        <WorkList title={W.boards} id="you-boards" items={tag('boards')} render={(b) => <BoardRow key={b.id} b={b} reload={load} />} />
        <WorkList title={W.pictures} id="you-pictures" items={tag('pictures')} render={(p) => <PictureRow key={p.versionId} p={p} reload={load} />} />
      </section>
    </Frame>
  );
}

/** One signed-in account's rows: its name (name order: Farcaster, Basename, address), its ids, its public page, and Sign out. */
function AccountRows({ who, signOut: out, viaWallet = false }: { who: Who; signOut: (() => void) | null; viaWallet?: boolean }) {
  return (
    <div className="you-account" data-kind={who.kind}>
      <p className="you-name">
        {who.name}
        <span className="label you-kind">{who.kind === 'wallet' ? (who.basename ? W.kindBasename : W.kindWallet) : W.kindFarcaster}</span>
      </p>
      <dl className="you-facts">
        {who.kind === 'farcaster' ? (
          <>
            {who.username && who.name !== `@${who.username}` && (
              <div>
                <dt className="label">{W.farcaster}</dt>
                <dd>@{who.username}</dd>
              </div>
            )}
            <div>
              <dt className="label">{W.fid}</dt>
              <dd>{who.fid}</dd>
            </div>
          </>
        ) : (
          <>
            {who.basename && who.name !== who.basename && (
              <div>
                <dt className="label">{W.basename}</dt>
                <dd>{who.basename}</dd>
              </div>
            )}
            <div>
              <dt className="label">{W.address}</dt>
              <dd className="you-addr">{who.address}</dd>
            </div>
          </>
        )}
        <div>
          <dt className="label">{W.profile}</dt>
          <dd>{who.handle ? <Link href={`/@${who.handle}`}>{`/@${who.handle}`}</Link> : W.noProfile}</dd>
        </div>
      </dl>
      {who.handle && <p className="you-note">{W.profileNote}</p>}
      {viaWallet ? (
        <p className="you-note">{W.viaWallet}</p>
      ) : out ? (
        <button type="button" className="ic-secondary you-sign-out" onClick={out}>
          {who.kind === 'wallet' ? W.signOutWallet : W.signOutFarcaster}
        </button>
      ) : (
        <p className="you-note">{W.inApp}</p>
      )}
    </div>
  );
}

/**
 * Wallet ↔ Farcaster link (owner, 2026-10-22): the offer (sign in with Farcaster, see who it links to, confirm), or the
 * link as it is, with Unlink. The server checks both sign-ins itself (src/app/api/wallet-link/route.ts).
 */
function LinkPanel({ view, to, reload }: { view: LinkView; to: Who | null; reload: () => void }) {
  const walletW = useWalletAlongside();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [later, setLater] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const walletName = view.wallet.short;
  const done = async (r: Response | null) => {
    const out = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    setAsking(false);
    if (!r?.ok) return setNote(out?.error ?? W.couldNot);
    setNote(null);
    reload();
  };
  const linkNow = async () => {
    if (!walletW || view.to === null) return;
    setBusy(true);
    // The Farcaster sign-in as the bearer, the wallet's own token beside it; the FID shown is the FID linked.
    const r = await authFetch('/api/wallet-link', { method: 'POST', headers: { 'content-type': 'application/json', 'x-wallet-session': walletW.token }, body: JSON.stringify({ fid: view.to }) }).catch(() => null);
    await done(r);
  };
  const unlinkNow = async () => {
    setBusy(true);
    await done(await walletFetch('/api/wallet-link', { method: 'DELETE' }).catch(() => null));
  };
  const status = note && (
    <p className="you-note" role="status">
      {note}
    </p>
  );

  if (view.linked) {
    const l = view.linked;
    return (
      <div className="you-link" aria-label={W.linkTitle}>
        <p className="you-note">{W.linked(walletName, l.name)}</p>
        <p className="you-note">{W.linkedHow[l.how]}</p>
        <p className="you-note">{W.linkedBalance}</p>
        {view.canUnlink ? (
          <div className="you-actions">
            {asking ? (
              <>
                <span className="you-note">{W.unlinkConfirm}</span>
                <button type="button" className="ic-secondary" disabled={busy} onClick={() => void unlinkNow()}>
                  {W.unlinkYes}
                </button>
                <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking(false)}>
                  {W.unlinkNo}
                </button>
              </>
            ) : (
              <button type="button" className="ic-secondary" onClick={() => setAsking(true)}>
                {W.unlink}
              </button>
            )}
          </div>
        ) : (
          <p className="you-note">{W.unlinkAsk}</p>
        )}
        {status}
      </div>
    );
  }
  if (!view.offer || later) return null;
  return (
    <div className="you-link" aria-label={W.linkTitle}>
      <h3 className="label">{W.linkTitle}</h3>
      {view.to === null || !to ? (
        <>
          <p className="you-note">{W.linkOffer}</p>
          <SignInButton className="ic-secondary" label={W.linkSignIn} />
        </>
      ) : (
        <>
          <p className="you-name">{W.linkConfirm(walletName, `${to.name} (FID ${view.to})`)}</p>
          <p className="you-note">{W.linkWhat}</p>
          <div className="you-actions">
            <span className="you-note">{W.linkPast(to.name)}</span>
            <button type="button" className="ic-secondary" disabled={busy || !walletW} onClick={() => void linkNow()}>
              {W.linkYes}
            </button>
            <button type="button" className="ic-secondary" disabled={busy} onClick={() => setLater(true)}>
              {W.linkNo}
            </button>
          </div>
        </>
      )}
      {status}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="you">
      <h1 className="you-title">{W.title}</h1>
      {children}
    </main>
  );
}

function WorkList<T>({ title, id, items, render }: { title: string; id: string; items: T[]; render: (t: T) => React.ReactNode }) {
  return (
    <div className="you-work" aria-labelledby={id}>
      <h3 id={id} className="label">
        {title} · {items.length}
      </h3>
      {items.length ? <ul className="you-list">{items.map(render)}</ul> : <p className="you-note">{W.none}</p>}
    </div>
  );
}

/** Hide and "Show it again", through each kind's existing route; the server checks it is the person's own. */
function HideControl({ route, hidden, canUnhide, maintainerOnly, confirm, fetcher, onDone }: { route: string; hidden: boolean; canUnhide: boolean; maintainerOnly?: boolean; confirm?: string; fetcher: Fetcher | null; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!fetcher) return null;
  const act = async (hide: boolean) => {
    setBusy(true);
    setNote(null);
    const r = await fetcher(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hide }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    setAsking(false);
    if (!r?.ok) return setNote(out?.error ?? W.couldNot);
    onDone();
  };
  if (hidden)
    return canUnhide ? (
      <div className="you-actions">
        <button type="button" className="ic-secondary" disabled={busy} onClick={() => void act(false)}>
          {W.showAgain}
        </button>
        {note && <span className="you-note" role="status">{note}</span>}
      </div>
    ) : null;
  return (
    <div className="you-actions">
      {asking ? (
        <>
          <span className="you-note">{confirm}</span>
          <button type="button" className="ic-secondary" disabled={busy} onClick={() => void act(true)}>
            {W.sceneYes}
          </button>
          <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking(false)}>
            {W.sceneNo}
          </button>
        </>
      ) : (
        <button type="button" className="ic-secondary" disabled={busy} onClick={() => (confirm ? setAsking(true) : void act(true))}>
          {maintainerOnly ? W.hideMaintainer : W.hide}
        </button>
      )}
      {note && (
        <span className="you-note" role="status">
          {note}
        </span>
      )}
    </div>
  );
}

const hiddenLine = (role: 'maker' | 'maintainer' | null | undefined) => (role === 'maker' ? W.hiddenByYou : role === 'maintainer' ? W.hiddenByMaintainer : W.hidden);

function SceneRow({ s, reload }: { s: Mine<SceneItem>; reload: () => void }) {
  const who = s.by;
  const recorded = s.hiddenRole !== undefined;
  return (
    <li className={`you-item${s.hidden ? ' is-hidden' : ''}`}>
      {s.poster && (
        <figure className="you-fig">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.poster} alt={posterAlt(s.versionId, s.title)} width={320} height={180} loading="lazy" />
          <figcaption>
            <AiLabel kind="image" text={labelFor(who.name)} view={posterView({ id: s.versionId, adaptationId: s.adaptationId, createdAt: s.createdAt, recipe: { ai_label: s.aiLabel, recipe_url: s.recipeUrl } }, s.title, who.name)} />
          </figcaption>
        </figure>
      )}
      <div className="you-item-body">
        <p className="you-item-title">{s.path ? <Link href={s.path}>{s.title}</Link> : s.title}</p>
        <p className="you-meta">
          {W.version(s.versionId)} · {s.createdAt}
          {s.parentId !== null && ` · ${W.remixedFrom(s.parentId)}`}
        </p>
        {s.hidden && <p className="you-meta">{hiddenLine(s.hiddenRole)}</p>}
        <HideControl
          route={`/api/scenes/${s.versionId}/hide`}
          hidden={s.hidden}
          canUnhide={recorded && s.hiddenRole === 'maker'}
          confirm={recorded ? W.sceneConfirm : W.sceneConfirmNoUndo}
          fetcher={s.fetcher}
          onDone={reload}
        />
      </div>
    </li>
  );
}

function FrameRow({ f, reload }: { f: Mine<FrameItem>; reload: () => void }) {
  const who = f.by;
  return (
    <li className={`you-item${f.hidden ? ' is-hidden' : ''}`}>
      {f.url && (
        <figure className="you-fig">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={`A remix of shot ${f.shot}: ${f.words}`} width={320} height={180} loading="lazy" />
          <figcaption>
            <AiLabel kind="image" text={labelFor(who.name)} view={frameView({ id: f.id, by: who.name, title: f.title, shot: f.shot, versionId: f.versionId, words: f.words, at: f.createdAt, model: f.model })} />
          </figcaption>
        </figure>
      )}
      <div className="you-item-body">
        <p className="you-item-title">{f.hidden ? W.shot(f.title, f.shot, f.versionId) : <Link href={`/remix/${f.id}`}>{W.shot(f.title, f.shot, f.versionId)}</Link>}</p>
        <p className="you-words">{f.words}</p>
        <p className="you-meta">
          {day(f.createdAt)}
          {f.hidden && ` · ${hiddenLine(f.hiddenRole)}`}
        </p>
        <HideControl route={`/api/remix/${f.id}/hide`} hidden={f.hidden} canUnhide={f.hiddenRole === 'maker'} fetcher={f.fetcher} onDone={reload} />
      </div>
    </li>
  );
}

function BoardRow({ b, reload }: { b: Mine<BoardItem>; reload: () => void }) {
  return (
    <li className={`you-item you-item-text${b.hidden ? ' is-hidden' : ''}`}>
      <div className="you-item-body">
        <p className="you-item-title">{b.hidden ? b.title || W.untitled : <Link href={`/storyboard/${b.id}`}>{b.title || W.untitled}</Link>}</p>
        <p className="you-meta">
          {W.board(b)} · {day(b.createdAt)}
          {b.hidden && ` · ${hiddenLine(b.hiddenRole)}`}
        </p>
        <HideControl route={`/api/remix/storyboard/${b.id}/hide`} hidden={b.hidden} canUnhide={b.hiddenRole === 'maker'} fetcher={b.fetcher} onDone={reload} />
      </div>
    </li>
  );
}

function PictureRow({ p, reload }: { p: Mine<PictureItem>; reload: () => void }) {
  const who = p.by;
  return (
    <li className={`you-item${p.hidden ? ' is-hidden' : ''}`}>
      {p.url && (
        <figure className="you-fig">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.prompt || W.chapter(p.chapter)} width={320} height={320} loading="lazy" />
          <figcaption>
            <AiLabel kind="image" text={labelFor(who.name)} view={pictureView({ versionId: p.versionId, by: who.name, prompt: p.prompt, chapter: p.chapter, at: p.createdAt })} />
          </figcaption>
        </figure>
      )}
      <div className="you-item-body">
        <p className="you-item-title">{p.hidden ? W.chapter(p.chapter) : <Link href={`/image/${p.versionId}`}>{W.chapter(p.chapter)}</Link>}</p>
        {p.prompt && <p className="you-words">{p.prompt}</p>}
        <p className="you-meta">
          {day(p.createdAt)}
          {p.hidden && ` · ${p.canUnhide ? W.hiddenByYou : W.hidden}`}
        </p>
        <HideControl route={`/api/images/${p.versionId}/hide`} hidden={p.hidden} canUnhide={p.canUnhide} fetcher={p.fetcher} onDone={reload} />
      </div>
    </li>
  );
}
