'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { EPISODE } from '~/lib/config';
import { episodePhase } from '~/lib/challenge/episode/rules';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';
import { EpisodeLanding, OutlineFull, type ShownOutline } from './challenge-episode-views';
import { EpisodeMake } from './challenge-episode-make';
import { EpisodeOutlinesList } from './challenge-episode-list';
import { EpisodeOutlineActions } from './challenge-episode-actions';
import type { EpisodePage } from './challenge-episode-admin';

/** The admins' Episode 1 pages while it is off (loaded by ./challenge-episode-admin.tsx for admins only). */
export function EpisodeAdminPage({ page }: { page: EpisodePage }) {
  const [list, setList] = useState<ShownOutline[] | null>(null);
  const [one, setOne] = useState<ShownOutline | null | 'missing'>(null);
  useEffect(() => {
    if (page === 'outlines')
      void authFetch('/api/challenge/episode-1/outlines')
        .then((r) => (r.ok ? r.json() : { outlines: [] }))
        .then((j: { outlines?: ShownOutline[] }) => setList(j.outlines ?? []))
        .catch(() => setList([]));
    if (page === 'outline') {
      const id = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
      void authFetch(`/api/challenge/episode-1/outlines/${id}`)
        .then(async (r) => (r.ok ? ((await r.json()) as ShownOutline) : 'missing'))
        .then(setOne)
        .catch(() => setOne('missing'));
    }
  }, [page]);
  const note = <p className="dz-note ch-admin-only">Admins only: Episode 1 is off (EPISODE.public).</p>;
  if (page === 'landing')
    return (
      <>
        {note}
        <EpisodeLanding phase={episodePhase()} hasSample={EPISODE.sampleDeck.length > 0} />
      </>
    );
  if (page === 'make')
    return (
      <>
        {note}
        <EpisodeMake />
      </>
    );
  if (page === 'outlines')
    return (
      <div className="page ep-page ep-list-page">
        {note}
        <h1 className="ep-title">{W.listTitle}</h1>
        {list === null ? null : list.length ? <EpisodeOutlinesList all={list} /> : <p className="ep-small">{W.listNone}</p>}
        <p className="ep-small">{W.listNote}</p>
      </div>
    );
  if (one === null) return null;
  if (one === 'missing') return <p className="page">Not found</p>;
  return (
    <div className="page ep-page">
      {note}
      <OutlineFull o={one} />
      <EpisodeOutlineActions id={one.id} byFid={one.byFid} />
    </div>
  );
}
