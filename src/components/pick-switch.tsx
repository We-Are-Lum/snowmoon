'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '~/lib/client-auth';
import { AI_DECLARED, AI_LABEL, NOT_AUTHOR_VISIBLE } from '~/lib/ai-declared';
import type { PickOption } from '~/lib/pick-options';

/**
 * The pick switch (principle 5 as reread by the owner, 2026-10-29): wherever an admin's pick is shown, the reader can
 * switch away from it: "Picked by @handle · Most liked · Newest · Liked by me". The pick is only the starting view. The
 * reader's choice is kept on this device (localStorage) and never sent anywhere; "Liked by me" reads the reader's own
 * likes, one image at a time, as the like button does. The ordering happens here, on the device, among the images this
 * moment or term already shows. Model-drafted wording (coding agent, 2026-10-29), for the owner.
 */
export type PickView = 'picked' | 'liked' | 'newest' | 'mine';
const KEY = 'snowmoon.pick-view';
export const PICK_LABEL = (by: string) => `Picked by @${by.replace(/^@/, '')}`;
const NAMES: Record<Exclude<PickView, 'picked'>, string> = { liked: 'Most liked', newest: 'Newest', mine: 'Liked by me' };

function readView(): PickView {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'liked' || v === 'newest' || v === 'mine' ? v : 'picked';
  } catch {
    return 'picked';
  }
}

export function PickSwitch({ pick, options, notAuthor = false }: { pick: { imageRef: string; by: string }; options: PickOption[]; notAuthor?: boolean }) {
  const [view, setView] = useState<PickView>('picked');
  const [mine, setMine] = useState<Set<string> | null>(null);
  useEffect(() => setView(readView()), []);
  useEffect(() => {
    if (view !== 'mine' || mine) return;
    let alive = true;
    void Promise.all(
      options.filter((o) => o.kind === 'reader').map(async (o) => {
        const r = await authFetch(`/api/images/${o.key}/like`).catch(() => null);
        const j = (await r?.json().catch(() => null)) as { liked?: boolean } | null;
        return j?.liked ? o.key : null;
      }),
    ).then((keys) => alive && setMine(new Set(keys.filter((k): k is string => k !== null))));
    return () => {
      alive = false;
    };
  }, [view, mine, options]);
  const choose = (v: PickView) => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  const time = (o: PickOption) => (o.createdAt ? Date.parse(o.createdAt) : 0);
  const shown =
    view === 'picked' ? options.find((o) => o.key === pick.imageRef)
    : view === 'liked' ? [...options].sort((a, b) => b.likes - a.likes || time(b) - time(a))[0]
    : view === 'newest' ? [...options].sort((a, b) => time(b) - time(a))[0]
    : options.find((o) => mine?.has(o.key));
  const label = PICK_LABEL(pick.by);
  return (
    <div className="pick" data-pick-view={view}>
      {shown ? (
        <figure className="pick-image">
          <Link href={shown.href}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown.url} alt={shown.alt} width={1024} height={576} loading="lazy" />
          </Link>
          <figcaption className="block-caption">
            {shown.by ? AI_LABEL.imageBy(shown.by) : AI_LABEL.image}
            <span className="sr-only"> ({AI_DECLARED.image})</span>
            {notAuthor && <span className="ai-not-author"> · {NOT_AUTHOR_VISIBLE}</span>}
          </figcaption>
        </figure>
      ) : (
        <p className="pick-none">{view === 'mine' ? (mine ? 'You haven’t liked any of these.' : 'Looking for your likes…') : 'No image to show.'}</p>
      )}
      <div className="pick-switch" role="group" aria-label="Which image to show first">
        <button type="button" aria-pressed={view === 'picked'} onClick={() => choose('picked')}>{label}</button>
        {(Object.keys(NAMES) as (keyof typeof NAMES)[]).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => choose(v)}>
            {NAMES[v]}
          </button>
        ))}
      </div>
    </div>
  );
}
