'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { useCanAddImage } from '~/lib/images/can-add';
import { IMAGE_WORDING } from '~/lib/images/wording';

/**
 * Your own picks, in the browser (step 4). Read from /api/designs/picks, which only ever answers
 * with the signed-in person's own picks; nothing here can see anyone else's. Pages that change a
 * pick tell the others on this page with an event, so the marks stay in step.
 */
const W = IMAGE_WORDING.designs;
const EVENT = 'snowmoon:picks';

export type PickView = {
  entityId: string;
  kind: 'style' | 'character';
  entity: string;
  versionId: string;
  versionNo: number;
  elementId: string;
  title: string;
  text: string;
  byFid: number;
  byName: string | null;
  pickedAt: string;
  available: boolean;
  newer: { versionId: string; versionNo: number; createdAt: string } | null;
  thumb: string | null;
  samples: { url: string }[];
  views: { front?: { url: string }; side?: { url: string }; back?: { url: string } };
  assist: unknown;
};

export async function changePick(method: 'POST' | 'DELETE', body: { versionId?: string; entityId?: string }): Promise<PickView[] | null> {
  const res = await authFetch('/api/designs/picks', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) return null;
  const picks = ((await res.json()) as { picks: PickView[] }).picks;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: picks }));
  return picks;
}

/** Your picks, or null while loading or when you can't have any (signed out, not invited). */
export function useMyPicks(): PickView[] | null {
  const canAdd = useCanAddImage();
  const [picks, setPicks] = useState<PickView[] | null>(null);
  const load = useCallback(async () => {
    const res = await authFetch('/api/designs/picks').catch(() => null);
    if (res?.ok) setPicks(((await res.json()) as { picks: PickView[] }).picks);
  }, []);
  useEffect(() => {
    if (canAdd) void load();
    else setPicks(null);
  }, [canAdd, load]);
  useEffect(() => {
    const on = (e: Event) => setPicks((e as CustomEvent<PickView[]>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return picks;
}

/**
 * "Use as my style" / "Use as my {name}" on a design's page. Keeps this version for you, privately.
 * If you already keep an older or newer version of it, offers to switch (never switches for you).
 */
export function PickButton({ versionId, versionNo, elementId, entityId, kind, name }: { versionId: string; versionNo: number; elementId: string; entityId: string; kind: 'style' | 'character'; name: string }) {
  const canAdd = useCanAddImage();
  const picks = useMyPicks();
  const [note, setNote] = useState<string | null>(null);
  if (!canAdd || picks === null) return null;
  const mine = picks.find((p) => p.entityId === entityId) ?? null;
  const exact = mine?.versionId === versionId;
  const sameDesign = mine?.elementId === elementId;
  const use = async () => setNote((await changePick('POST', { versionId })) ? W.page.picked : W.page.pickFailed);
  const clear = async () => setNote((await changePick('DELETE', { entityId })) ? W.page.cleared : W.page.pickFailed);
  return (
    <div className="dz-pick">
      {exact ? (
        <button type="button" className="ic-secondary dz-pick-button" onClick={clear}>
          {kind === 'style' ? W.page.myStyle(versionNo) : W.page.myCharacter(name, versionNo)}
        </button>
      ) : sameDesign && mine ? (
        <button type="button" className="ic-primary dz-pick-button" onClick={use}>
          {W.page.switchTo(versionNo)}
        </button>
      ) : (
        <button type="button" className="ic-primary dz-pick-button" onClick={use}>
          {kind === 'style' ? W.page.useStyle : W.page.useCharacter(name)}
        </button>
      )}
      {mine && !exact && (
        <p className="dz-pick-note">
          {W.index.yourPick} · {sameDesign ? `v${mine.versionNo}` : mine.title || mine.entity}
        </p>
      )}
      {note && (
        <p className="dz-pick-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
