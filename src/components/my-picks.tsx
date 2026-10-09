'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { useCanAddImage } from '~/lib/images/can-add';
import { wordDiff } from '~/lib/images/design-rules';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { changePick, useMyPicks, type PickView } from './design-picks';
import { SignInButton } from './sign-in';

/**
 * My picks (Design 6): private, dashed, "only you". Your style picks (the newest one is what the
 * composer offers) and your character picks, each kept at a version. A newer version is offered
 * with a comparison, never applied for you; images you already made keep the version they used.
 * Clear removes a pick at once. Nothing here is shown to anyone else, and nothing is counted.
 */
const W = IMAGE_WORDING.designs;
const by = (p: PickView) => (p.byName ? `@${p.byName}` : `FID ${p.byFid}`);
const nameOf = (p: PickView) => (p.kind === 'style' ? p.title || p.entity : `${p.entity} · ${by(p)}`);

export function MyPicks() {
  const auth = useAuth();
  const canAdd = useCanAddImage();
  const picks = useMyPicks();
  const [comparing, setComparing] = useState<PickView | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (auth.kind === 'signed-out')
    return (
      <div className="ic-gate">
        <p>{W.picks.signIn}</p>
        <SignInButton />
      </div>
    );
  if (auth.kind === 'signed-in' && !canAdd) return <p className="ic-gate">{W.picks.notInvited}</p>;

  const styles = (picks ?? []).filter((p) => p.kind === 'style');
  const chars = (picks ?? []).filter((p) => p.kind === 'character');
  const clear = async (p: PickView) => {
    await changePick('DELETE', { entityId: p.entityId });
    setNote(W.page.cleared);
  };
  const row = (p: PickView, i: number) => (
    <li key={p.entityId} className={`dz-pick-row${p.available ? '' : ' is-gone'}`}>
      <div className="dz-pick-line">
        {p.thumb && p.available ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="dz-thumb" src={p.thumb} alt="AI-generated sample, not by the author" width={56} height={44} />
        ) : (
          <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
        )}
        <div className="dz-row-text">
          <Link className="dz-row-title" href={`/images/designs/${p.versionId}`}>
            {nameOf(p)} v{p.versionNo}
          </Link>
          <span className="dz-row-meta">
            {!p.available ? W.picks.hidden : p.kind === 'style' ? (i === 0 ? W.picks.used : W.picks.alsoOffered) : W.picks.charUsed(p.entity.split(' ')[0])}
          </span>
          <span className="dz-pick-actions">
            <Link href={p.kind === 'style' ? '/images/designs' : '/images/designs?tab=characters'}>{W.picks.change}</Link>
            <button type="button" onClick={() => clear(p)}>
              {W.picks.clear}
            </button>
          </span>
        </div>
      </div>
      {p.newer && (
        <button type="button" className="dz-newer" onClick={() => setComparing(p)} aria-expanded={comparing?.entityId === p.entityId}>
          <span>{W.picks.newer(p.newer.versionNo)}</span>
          <span>{W.picks.compare}</span>
        </button>
      )}
    </li>
  );

  return (
    <div className="dz-picks">
      <p className="ic-private dz-private">{W.picks.strip}</p>
      <p className="dz-lead">{W.picks.lead}</p>
      {picks === null ? (
        <p className="ic-note">…</p>
      ) : (
        <div className="dz-picks-grid">
          <div className="dz-picks-list">
            <p className="dz-label">{W.picks.style}</p>
            {styles.length ? <ul className="dz-pick-list">{styles.map(row)}</ul> : <p className="dz-empty-row">{W.picks.noStyle}</p>}
            <p className="dz-label">{W.picks.characters}</p>
            {chars.length ? <ul className="dz-pick-list">{chars.map(row)}</ul> : <p className="dz-empty-row">{W.picks.noCharacters}</p>}
            <p className="dz-note">{W.picks.nobody}</p>
          </div>
          {comparing?.newer && <Compare pick={comparing} onDone={(msg) => { setComparing(null); setNote(msg); }} />}
        </div>
      )}
      {note && (
        <p className="dz-pick-note" role="status">
          {note}
        </p>
      )}
      <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
    </div>
  );
}

/** Your version and the newer one side by side, the changed words shaded (Design 6-desktop). */
function Compare({ pick, onDone }: { pick: PickView; onDone: (msg: string | null) => void }) {
  const [newer, setNewer] = useState<{ text: string; pictures: string[]; createdAt: string } | null>(null);
  useEffect(() => {
    void authFetch(`/api/designs/version?id=${pick.newer!.versionId}`).then(async (r) => {
      if (r.ok) setNewer((await r.json()) as { text: string; pictures: string[]; createdAt: string });
    });
  }, [pick]);
  const mine = pick.samples[0]?.url ?? pick.views.front?.url ?? null;
  const switchTo = async () => {
    const ok = await changePick('POST', { versionId: pick.newer!.versionId });
    onDone(ok ? W.picks.switched(pick.title || pick.entity, pick.newer!.versionNo, pick.versionNo) : W.page.pickFailed);
  };
  return (
    <section className="dz-compare" aria-label={W.picks.compare}>
      <p className="dz-label">{W.picks.compareTitle(pick.title || pick.entity, pick.versionNo, by(pick), pick.newer!.versionNo)}</p>
      <div className="dz-compare-grid">
        <figure>
          {mine ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mine} alt="AI-generated sample of your version, not by the author" />
          ) : (
            <span className="dz-slot-empty" aria-hidden="true" />
          )}
          <figcaption className="dz-caption">{W.picks.yourPick(pick.versionNo)}</figcaption>
        </figure>
        <figure>
          {newer?.pictures[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={newer.pictures[0]} alt="AI-generated sample of the newer version, not by the author" />
          ) : (
            <span className="dz-slot-empty" aria-hidden="true" />
          )}
          <figcaption className="dz-caption">{W.picks.newLabel(pick.newer!.versionNo, (newer?.createdAt ?? pick.newer!.createdAt).slice(0, 10))}</figcaption>
        </figure>
      </div>
      <p className="dz-caption">{W.page.samplesCaption}</p>
      {newer && (
        <p className="dz-text">
          {wordDiff(pick.text, newer.text).map((d, i) => (d.changed ? <mark key={i}>{d.text}</mark> : <span key={i}>{d.text}</span>))}
        </p>
      )}
      <p className="dz-note">{W.picks.changedNote(pick.newer!.versionNo, pick.versionNo)}</p>
      <div className="dz-compare-actions">
        <button type="button" className="ic-secondary" onClick={() => onDone(null)}>
          {W.picks.keep(pick.versionNo)}
        </button>
        <button type="button" className="ic-primary" onClick={switchTo}>
          {W.picks.switchTo(pick.newer!.versionNo)}
        </button>
      </div>
    </section>
  );
}
